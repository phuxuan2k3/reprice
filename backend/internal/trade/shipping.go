package trade

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"reprice/internal/apperr"
)

func shipmentEvent(ctx context.Context, tx pgx.Tx, now time.Time, shipmentID, status, note string) error {
	if _, err := tx.Exec(ctx, `UPDATE shipments SET status=$2 WHERE id=$1`, shipmentID, status); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `INSERT INTO shipment_events (shipment_id, status, note, occurred_at) VALUES ($1,$2,$3,$4)`,
		shipmentID, status, note, now)
	return err
}

// nextOutbound là mốc kế tiếp của vận đơn đi khi đơn vị vận chuyển (mô phỏng) báo tiến độ.
var nextOutbound = map[string]struct{ to, note string }{
	"AWAITING_PICKUP":  {"PICKED_UP", "Đơn vị vận chuyển đã lấy hàng"},
	"PICKED_UP":        {"IN_TRANSIT", "Đang trung chuyển"},
	"IN_TRANSIT":       {"OUT_FOR_DELIVERY", "Đang giao đến người nhận"},
	"OUT_FOR_DELIVERY": {"DELIVERED", "Giao hàng thành công"},
	"RETURNING":        {"RETURNED", "Đã hoàn hàng về người bán"},
}

type shipRow struct {
	id, orderID, direction, status string
	attempts                       int
	caseID                         *string
}

func lockShipment(ctx context.Context, tx pgx.Tx, id string) (*shipRow, error) {
	var s shipRow
	err := tx.QueryRow(ctx, `SELECT id, order_id, direction, status, attempts, support_case_id FROM shipments WHERE id=$1 FOR UPDATE`, id).
		Scan(&s.id, &s.orderID, &s.direction, &s.status, &s.attempts, &s.caseID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, notFound("vận đơn")
	}
	return &s, err
}

// AdvanceShipment: đơn vị vận chuyển giả chuyển vận đơn đi sang mốc tiếp theo (UC34).
// Giao lại sau khi thất bại cũng dùng thao tác này.
func (s *Service) AdvanceShipment(ctx context.Context, shipmentID string) (*Shipment, error) {
	err := s.tx(ctx, func(tx pgx.Tx) error {
		now := s.clock.Now()
		sh, err := lockShipment(ctx, tx, shipmentID)
		if err != nil {
			return err
		}
		if sh.direction == "RETURN" {
			return advanceReturn(ctx, tx, now, sh)
		}
		o, err := lockOrder(ctx, tx, sh.orderID)
		if err != nil {
			return err
		}
		if sh.status == "FAILED" {
			if sh.attempts >= MaxDeliveryTries {
				return shipmentEvent(ctx, tx, now, sh.id, "RETURNING", "Hết lượt giao, hoàn hàng về người bán")
			}
			if _, err := tx.Exec(ctx, `UPDATE shipments SET attempts = attempts + 1 WHERE id=$1`, sh.id); err != nil {
				return err
			}
			return shipmentEvent(ctx, tx, now, sh.id, "OUT_FOR_DELIVERY", "Giao lại lần 2")
		}
		step, ok := nextOutbound[sh.status]
		if !ok {
			return invalidState("Vận đơn đã ở trạng thái cuối.")
		}
		if step.to == "OUT_FOR_DELIVERY" {
			if _, err := tx.Exec(ctx, `UPDATE shipments SET attempts = attempts + 1 WHERE id=$1`, sh.id); err != nil {
				return err
			}
		}
		if err := shipmentEvent(ctx, tx, now, sh.id, step.to, step.note); err != nil {
			return err
		}
		switch step.to {
		case "PICKED_UP":
			if err := setOrderStatus(ctx, tx, now, o, "SHIPPING", "", "Đơn vị vận chuyển đã lấy hàng"); err != nil {
				return err
			}
			return notify(ctx, tx, now, o.buyer, "ORDER_SHIPPING", "Đơn "+o.code+" đang được giao", "Theo dõi hành trình trong chi tiết đơn.", "/orders/"+o.id)
		case "DELIVERED":
			return markDelivered(ctx, tx, now, o)
		case "RETURNED":
			return returnedToSeller(ctx, tx, now, o)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.getShipment(ctx, shipmentID)
}

// FailShipment: giả lập giao thất bại, người nhận từ chối, hoặc sự cố (UC35).
func (s *Service) FailShipment(ctx context.Context, shipmentID, kind, note string) (*Shipment, error) {
	err := s.tx(ctx, func(tx pgx.Tx) error {
		now := s.clock.Now()
		sh, err := lockShipment(ctx, tx, shipmentID)
		if err != nil {
			return err
		}
		o, err := lockOrder(ctx, tx, sh.orderID)
		if err != nil {
			return err
		}
		switch kind {
		case "DELIVERY_FAILED":
			if sh.status != "OUT_FOR_DELIVERY" {
				return invalidState("Chỉ báo giao thất bại khi đang giao đến người nhận.")
			}
			if err := shipmentEvent(ctx, tx, now, sh.id, "FAILED", orDefault(note, "Không liên lạc được người nhận")); err != nil {
				return err
			}
			return notify(ctx, tx, now, o.buyer, "DELIVERY_FAILED", "Giao hàng chưa thành công", "Đơn "+o.code+" sẽ được giao lại.", "/orders/"+o.id)
		case "RECIPIENT_REFUSED":
			if sh.status != "OUT_FOR_DELIVERY" && sh.status != "FAILED" {
				return invalidState("Chỉ ghi nhận từ chối nhận khi đang giao.")
			}
			return shipmentEvent(ctx, tx, now, sh.id, "RETURNING", orDefault(note, "Người nhận từ chối nhận hàng, hoàn về người bán"))
		case "INCIDENT":
			if sh.status != "PICKED_UP" && sh.status != "IN_TRANSIT" {
				return invalidState("Chỉ ghi nhận sự cố khi hàng đang vận chuyển.")
			}
			if err := shipmentEvent(ctx, tx, now, sh.id, "INCIDENT", orDefault(note, "Kiện hàng gặp sự cố trong vận chuyển")); err != nil {
				return err
			}
			for _, u := range []string{o.buyer, o.seller} {
				if err := notify(ctx, tx, now, u, "SHIPMENT_INCIDENT", "Đơn "+o.code+" gặp sự cố vận chuyển",
					"RePrice sẽ liên hệ đơn vị vận chuyển và cập nhật hướng xử lý.", "/orders/"+o.id); err != nil {
					return err
				}
			}
			return nil
		}
		return apperr.Field("kind", "Chọn DELIVERY_FAILED, RECIPIENT_REFUSED hoặc INCIDENT.")
	})
	if err != nil {
		return nil, err
	}
	return s.getShipment(ctx, shipmentID)
}

// markDelivered: ghi delivered_at, bắt đầu 3 ngày kiểm tra; COD coi như đã thu tiền khi giao.
func markDelivered(ctx context.Context, tx pgx.Tx, now time.Time, o *orderRow) error {
	if _, err := tx.Exec(ctx, `UPDATE orders SET delivered_at=$2, return_deadline=$3 WHERE id=$1`, o.id, now, now.Add(ReturnWindow)); err != nil {
		return err
	}
	if o.paymentStatus == "COD_PENDING" {
		if _, err := tx.Exec(ctx, `UPDATE payments SET status='COD_COLLECTED', paid_at=$2 WHERE order_id=$1`, o.id, now); err != nil {
			return err
		}
		o.paymentStatus = "COD_COLLECTED"
		if err := createPayout(ctx, tx, o); err != nil {
			return err
		}
	}
	if err := setOrderStatus(ctx, tx, now, o, "DELIVERED", "", "Đơn vị vận chuyển báo giao thành công"); err != nil {
		return err
	}
	if err := notify(ctx, tx, now, o.buyer, "ORDER_DELIVERED", "Đơn "+o.code+" đã được giao thành công",
		"Bạn có 3 ngày để kiểm tra máy, đến "+now.Add(ReturnWindow).Format("15:04 02/01/2006")+". Bấm \"Đã nhận hàng\" khi máy đúng mô tả.",
		"/orders/"+o.id); err != nil {
		return err
	}
	return notify(ctx, tx, now, o.seller, "ORDER_DELIVERED", "Đơn "+o.code+" đã giao đến người mua", "Đơn hoàn tất sau thời hạn kiểm tra 3 ngày.", "/orders/"+o.id)
}

// returnedToSeller: hàng hoàn về người bán khi giao không thành → đơn hủy.
func returnedToSeller(ctx context.Context, tx pgx.Tx, now time.Time, o *orderRow) error {
	if err := setOrderStatus(ctx, tx, now, o, "RETURNED_TO_SELLER", "", "Giao không thành, hàng đã hoàn về người bán"); err != nil {
		return err
	}
	if err := cancelOrder(ctx, tx, now, o, "", "Giao không thành công, hàng đã hoàn về người bán"); err != nil {
		return err
	}
	for _, u := range []string{o.buyer, o.seller} {
		if err := notify(ctx, tx, now, u, "ORDER_CANCELLED", "Đơn "+o.code+" đã hủy do giao không thành",
			"Hàng đã hoàn về người bán. Nếu đã thanh toán trước, RePrice sẽ hoàn tiền.", "/orders/"+o.id); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) getShipment(ctx context.Context, id string) (*Shipment, error) {
	var sh Shipment
	err := s.pool.QueryRow(ctx, `SELECT id, tracking_code, direction, carrier, status, attempts, simulated FROM shipments WHERE id=$1`, id).
		Scan(&sh.ID, &sh.TrackingCode, &sh.Direction, &sh.Carrier, &sh.Status, &sh.Attempts, &sh.Simulated)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, notFound("vận đơn")
	}
	if err != nil {
		return nil, err
	}
	sh.Events, err = loadShipmentEvents(ctx, s.pool, id)
	return &sh, err
}

// GetShipment chỉ cho người mua, người bán của đơn hoặc QTV xem.
func (s *Service) GetShipment(ctx context.Context, id, viewerID string, isAdmin bool) (*Shipment, error) {
	var buyer, seller string
	err := s.pool.QueryRow(ctx, `SELECT o.buyer_id, o.seller_id FROM shipments sh JOIN orders o ON o.id = sh.order_id WHERE sh.id=$1`, id).Scan(&buyer, &seller)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && viewerID != buyer && viewerID != seller && !isAdmin) {
		return nil, notFound("vận đơn")
	}
	if err != nil {
		return nil, err
	}
	return s.getShipment(ctx, id)
}

func orDefault(s, def string) string {
	if s == "" {
		return def
	}
	return s
}

// nextReturn là các mốc của vận đơn trả hàng sau khi người mua đã bàn giao.
var nextReturn = map[string]struct{ to, note string }{
	"PICKED_UP":        {"IN_TRANSIT", "Hàng trả đang trung chuyển"},
	"IN_TRANSIT":       {"OUT_FOR_DELIVERY", "Đang giao hàng trả đến người bán"},
	"OUT_FOR_DELIVERY": {"DELIVERED", "Đã giao hàng trả cho người bán"},
}

func advanceReturn(ctx context.Context, tx pgx.Tx, now time.Time, sh *shipRow) error {
	if sh.status == "AWAITING_PICKUP" {
		return invalidState("Người mua chưa bàn giao hàng trả.")
	}
	step, ok := nextReturn[sh.status]
	if !ok {
		return invalidState("Vận đơn trả đã ở trạng thái cuối.")
	}
	if err := shipmentEvent(ctx, tx, now, sh.id, step.to, step.note); err != nil {
		return err
	}
	if step.to == "DELIVERED" && sh.caseID != nil {
		return returnDelivered(ctx, tx, now, *sh.caseID)
	}
	return nil
}
