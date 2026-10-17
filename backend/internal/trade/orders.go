package trade

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"reprice/internal/apperr"
)

// ---------------------------------------------------------------- view

type UserRef struct {
	ID           string   `json:"id"`
	FullName     string   `json:"fullName"`
	SellerRating *float64 `json:"sellerRating"`
}

type OrderItem struct {
	ID                      string          `json:"id"`
	ListingID               string          `json:"listingId"`
	Title                   string          `json:"title"`
	ListingPriceAtAgreement int64           `json:"listingPriceAtAgreement"`
	AgreedPrice             int64           `json:"agreedPrice"`
	Snapshot                json.RawMessage `json:"snapshot"`
}

type ShippingInfo struct {
	RecipientName  string `json:"recipientName"`
	RecipientPhone string `json:"recipientPhone"`
	AddressLine    string `json:"addressLine"`
	Province       string `json:"province"`
	Ward           string `json:"ward"`
}

type Payment struct {
	Method      *string    `json:"method"`
	Channel     *string    `json:"channel"`
	Amount      int64      `json:"amount"`
	Status      string     `json:"status"`
	ProviderRef *string    `json:"providerRef"`
	PaidAt      *time.Time `json:"paidAt"`
	Simulated   bool       `json:"simulated"`
}

type Payout struct {
	Amount     int64      `json:"amount"`
	Status     string     `json:"status"`
	ReleasedAt *time.Time `json:"releasedAt"`
	Simulated  bool       `json:"simulated"`
}

type ShipmentEvent struct {
	Status     string    `json:"status"`
	Note       string    `json:"note"`
	OccurredAt time.Time `json:"occurredAt"`
}

type Shipment struct {
	ID           string          `json:"id"`
	TrackingCode string          `json:"trackingCode"`
	Direction    string          `json:"direction"`
	Carrier      string          `json:"carrier"`
	Status       string          `json:"status"`
	Attempts     int             `json:"attempts"`
	Simulated    bool            `json:"simulated"`
	Events       []ShipmentEvent `json:"events"`
}

type NextStep struct {
	Party  string     `json:"party"`
	Action string     `json:"action"`
	DueAt  *time.Time `json:"dueAt"`
}

type Order struct {
	ID             string        `json:"id"`
	Code           string        `json:"code"`
	Buyer          UserRef       `json:"buyer"`
	Seller         UserRef       `json:"seller"`
	NegotiationID  *string       `json:"negotiationId"`
	Items          []OrderItem   `json:"items"`
	GoodsTotal     int64         `json:"goodsTotal"`
	ShippingFee    int64         `json:"shippingFee"`
	ShippingInfo   *ShippingInfo `json:"shippingInfo"`
	Status         string        `json:"status"`
	Payment        Payment       `json:"payment"`
	Payout         *Payout       `json:"payout"`
	Shipments      []Shipment    `json:"shipments"`
	OpenCaseID     *string       `json:"openCaseId"`
	CreatedAt      time.Time     `json:"createdAt"`
	PaymentDueAt   time.Time     `json:"paymentDueAt"`
	DeliveredAt    *time.Time    `json:"deliveredAt"`
	ReceivedAt     *time.Time    `json:"receivedAt"`
	ReturnDeadline *time.Time    `json:"returnDeadline"`
	CompletedAt    *time.Time    `json:"completedAt"`
	CancelledAt    *time.Time    `json:"cancelledAt"`
	CancelReason   *string       `json:"cancelReason"`
	NextStep       *NextStep     `json:"nextStep"`
	CanReview      bool          `json:"canReview"`
	AllowedActions []string      `json:"allowedActions"`
}

type queryer interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

func (s *Service) loadOrder(ctx context.Context, q queryer, id string) (*Order, error) {
	var o Order
	var name, phone, addr, prov, ward *string
	err := q.QueryRow(ctx, `SELECT o.id, o.code, o.negotiation_id, o.status, o.shipping_fee,
			o.recipient_name, o.recipient_phone, o.address_line, o.province, o.ward,
			o.created_at, o.payment_due_at, o.delivered_at, o.received_at, o.return_deadline, o.completed_at,
			o.cancelled_at, o.cancel_reason,
			b.id, b.full_name, b.seller_rating, s.id, s.full_name, s.seller_rating,
			p.method, p.channel, p.amount, p.status, p.provider_ref, p.paid_at, p.simulated,
			(SELECT id FROM support_cases c WHERE c.order_id = o.id AND c.closed_at IS NULL),
			EXISTS (SELECT 1 FROM reviews r WHERE r.order_id = o.id)
		FROM orders o JOIN users b ON b.id = o.buyer_id JOIN users s ON s.id = o.seller_id
		JOIN payments p ON p.order_id = o.id WHERE o.id = $1`, id).Scan(
		&o.ID, &o.Code, &o.NegotiationID, &o.Status, &o.ShippingFee,
		&name, &phone, &addr, &prov, &ward,
		&o.CreatedAt, &o.PaymentDueAt, &o.DeliveredAt, &o.ReceivedAt, &o.ReturnDeadline, &o.CompletedAt,
		&o.CancelledAt, &o.CancelReason,
		&o.Buyer.ID, &o.Buyer.FullName, &o.Buyer.SellerRating, &o.Seller.ID, &o.Seller.FullName, &o.Seller.SellerRating,
		&o.Payment.Method, &o.Payment.Channel, &o.Payment.Amount, &o.Payment.Status, &o.Payment.ProviderRef,
		&o.Payment.PaidAt, &o.Payment.Simulated, &o.OpenCaseID, &o.CanReview)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, notFound("đơn hàng")
	}
	if err != nil {
		return nil, err
	}
	o.CanReview = !o.CanReview && o.Status == "COMPLETED"
	if name != nil {
		o.ShippingInfo = &ShippingInfo{*name, *phone, *addr, *prov, *ward}
	}

	rows, err := q.Query(ctx, `SELECT id, listing_id, snapshot->>'title', listing_price_at_agreement, agreed_price, snapshot
		FROM order_items WHERE order_id = $1 ORDER BY id`, id)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var it OrderItem
		if err := rows.Scan(&it.ID, &it.ListingID, &it.Title, &it.ListingPriceAtAgreement, &it.AgreedPrice, &it.Snapshot); err != nil {
			rows.Close()
			return nil, err
		}
		o.GoodsTotal += it.AgreedPrice
		o.Items = append(o.Items, it)
	}
	rows.Close()

	var po Payout
	err = q.QueryRow(ctx, `SELECT amount, status, released_at, simulated FROM payouts WHERE order_id = $1`, id).
		Scan(&po.Amount, &po.Status, &po.ReleasedAt, &po.Simulated)
	if err == nil {
		o.Payout = &po
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	o.Shipments = []Shipment{}
	rows, err = q.Query(ctx, `SELECT id, tracking_code, direction, carrier, status, attempts, simulated
		FROM shipments WHERE order_id = $1 ORDER BY created_at`, id)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var sh Shipment
		if err := rows.Scan(&sh.ID, &sh.TrackingCode, &sh.Direction, &sh.Carrier, &sh.Status, &sh.Attempts, &sh.Simulated); err != nil {
			rows.Close()
			return nil, err
		}
		o.Shipments = append(o.Shipments, sh)
	}
	rows.Close()
	for i := range o.Shipments {
		if o.Shipments[i].Events, err = loadShipmentEvents(ctx, q, o.Shipments[i].ID); err != nil {
			return nil, err
		}
	}
	return &o, nil
}

func loadShipmentEvents(ctx context.Context, q queryer, shipmentID string) ([]ShipmentEvent, error) {
	rows, err := q.Query(ctx, `SELECT status, note, occurred_at FROM shipment_events WHERE shipment_id = $1 ORDER BY occurred_at, id`, shipmentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	evs := []ShipmentEvent{}
	for rows.Next() {
		var e ShipmentEvent
		if err := rows.Scan(&e.Status, &e.Note, &e.OccurredAt); err != nil {
			return nil, err
		}
		evs = append(evs, e)
	}
	return evs, rows.Err()
}

func (o *Order) outbound() *Shipment {
	for i := range o.Shipments {
		if o.Shipments[i].Direction == "OUTBOUND" && o.Shipments[i].Status != "VOIDED" {
			return &o.Shipments[i]
		}
	}
	return nil
}

// decorate tính allowedActions và nextStep theo người xem (docs/api.md, state diagram đơn hàng).
func (o *Order) decorate(viewerID string, now time.Time) {
	buyer, seller := viewerID == o.Buyer.ID, viewerID == o.Seller.ID
	acts := []string{}
	ship := o.outbound()
	switch o.Status {
	case "AWAITING_PAYMENT":
		due := o.PaymentDueAt
		o.NextStep = &NextStep{Party: "BUYER", Action: "Nhập thông tin nhận hàng và thanh toán", DueAt: &due}
		if buyer {
			acts = append(acts, "SET_SHIPPING_INFO")
			if o.ShippingInfo != nil && o.Payment.Status != "PAID" {
				acts = append(acts, "PAY")
			}
		}
		if buyer || seller {
			acts = append(acts, "CANCEL")
		}
	case "CONFIRMED":
		if ship == nil {
			o.NextStep = &NextStep{Party: "SELLER", Action: "Chuẩn bị hàng và tạo vận đơn"}
			if seller {
				acts = append(acts, "HANDOVER")
			}
		} else {
			o.NextStep = &NextStep{Party: "SYSTEM", Action: "Chờ đơn vị vận chuyển đến lấy hàng"}
		}
		if buyer || seller {
			acts = append(acts, "CANCEL")
		}
	case "SHIPPING":
		o.NextStep = &NextStep{Party: "SYSTEM", Action: "Đơn vị vận chuyển đang giao hàng"}
	case "DELIVERED", "RECEIVED":
		dl := o.ReturnDeadline
		if o.OpenCaseID == nil && dl != nil && now.Before(*dl) {
			if o.Status == "DELIVERED" {
				o.NextStep = &NextStep{Party: "BUYER", Action: "Kiểm tra máy; bấm Đã nhận hàng hoặc yêu cầu trả hàng trước hạn", DueAt: dl}
				if buyer {
					acts = append(acts, "RECEIVE")
				}
			} else {
				o.NextStep = &NextStep{Party: "BUYER", Action: "Có thể yêu cầu trả hàng/hoàn tiền trước hạn", DueAt: dl}
			}
			if buyer {
				acts = append(acts, "OPEN_RETURN", "REPORT_NOT_RECEIVED")
			}
		} else {
			o.NextStep = &NextStep{Party: "SYSTEM", Action: "Hoàn tất đơn khi hết hạn kiểm tra", DueAt: dl}
		}
	case "ON_HOLD":
		o.NextStep = &NextStep{Party: "SYSTEM", Action: "Đơn tạm dừng hoàn tất và chuyển tiền trong lúc xử lý hồ sơ"}
	case "COMPLETED":
		if buyer {
			acts = append(acts, "OPEN_COMPLAINT")
			if o.CanReview {
				acts = append(acts, "REVIEW")
			}
		}
	}
	if o.OpenCaseID != nil && (buyer || seller) {
		acts = append(acts, "VIEW_CASE")
	}
	if !buyer {
		o.CanReview = false
	}
	o.AllowedActions = acts
}

// GetOrder trả đơn cho người mua, người bán hoặc QTV.
func (s *Service) GetOrder(ctx context.Context, id, viewerID string, isAdmin bool) (*Order, error) {
	o, err := s.loadOrder(ctx, s.pool, id)
	if err != nil {
		return nil, err
	}
	if viewerID != o.Buyer.ID && viewerID != o.Seller.ID && !isAdmin {
		return nil, notFound("đơn hàng")
	}
	o.decorate(viewerID, s.clock.Now())
	return o, nil
}

type OrderSummary struct {
	ID          string    `json:"id"`
	Code        string    `json:"code"`
	Title       string    `json:"title"`
	AgreedTotal int64     `json:"agreedTotal"`
	Status      string    `json:"status"`
	Counterpart UserRef   `json:"counterpart"`
	CreatedAt   time.Time `json:"createdAt"`
	HasOpenCase bool      `json:"hasOpenCase"`
}

// ListMyOrders: role "buyer" hoặc "seller".
func (s *Service) ListMyOrders(ctx context.Context, userID, role, status string) ([]OrderSummary, error) {
	mine, other := "o.buyer_id", "o.seller_id"
	if role == "seller" {
		mine, other = other, mine
	}
	rows, err := s.pool.Query(ctx, `SELECT o.id, o.code,
			(SELECT string_agg(i.snapshot->>'title', ', ') FROM order_items i WHERE i.order_id = o.id),
			(SELECT sum(i.agreed_price) FROM order_items i WHERE i.order_id = o.id),
			o.status, u.id, u.full_name, u.seller_rating, o.created_at,
			EXISTS (SELECT 1 FROM support_cases c WHERE c.order_id = o.id AND c.closed_at IS NULL)
		FROM orders o JOIN users u ON u.id = `+other+`
		WHERE `+mine+` = $1 AND ($2 = '' OR o.status = $2) ORDER BY o.created_at DESC LIMIT 100`, userID, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []OrderSummary{}
	for rows.Next() {
		var o OrderSummary
		if err := rows.Scan(&o.ID, &o.Code, &o.Title, &o.AgreedTotal, &o.Status, &o.Counterpart.ID,
			&o.Counterpart.FullName, &o.Counterpart.SellerRating, &o.CreatedAt, &o.HasOpenCase); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

type StatusChange struct {
	From   *string   `json:"from"`
	To     string    `json:"to"`
	Actor  *UserRef  `json:"actor"`
	Reason string    `json:"reason"`
	At     time.Time `json:"at"`
}

func (s *Service) OrderHistory(ctx context.Context, id, viewerID string, isAdmin bool) ([]StatusChange, error) {
	if _, err := s.GetOrder(ctx, id, viewerID, isAdmin); err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `SELECT h.from_status, h.to_status, u.id, u.full_name, h.reason, h.created_at
		FROM order_status_history h LEFT JOIN users u ON u.id = h.actor_id WHERE h.order_id = $1 ORDER BY h.created_at, h.id`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StatusChange{}
	for rows.Next() {
		var c StatusChange
		var uid, uname *string
		if err := rows.Scan(&c.From, &c.To, &uid, &uname, &c.Reason, &c.At); err != nil {
			return nil, err
		}
		if uid != nil {
			c.Actor = &UserRef{ID: *uid, FullName: *uname}
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------- tạo đơn

// createOrder tạo đơn khi chốt giá (Mua ngay hoặc thương lượng thành công). Gọi trong transaction;
// khóa tin đăng để một máy không bị bán hai lần.
func createOrder(ctx context.Context, tx pgx.Tx, now time.Time, listingID, buyerID string, price int64, negotiationID string) (string, error) {
	var sellerID, status, variantID string
	var listPrice int64
	var condKey *string
	var snapshot []byte
	err := tx.QueryRow(ctx, `SELECT l.seller_id, l.status, l.price, l.variant_id, l.condition_key,
		jsonb_build_object(
			'title', m.name || ' ' || v.storage_gb || 'GB',
			'variant', jsonb_build_object('id', v.id, 'brand', m.brand, 'modelName', m.name, 'storageGb', v.storage_gb, 'ramGb', v.ram_gb, 'color', v.color),
			'condition', jsonb_build_object('appearance', l.appearance, 'functionality', l.functionality,
				'batteryHealthPct', l.battery_health_pct, 'batteryBucket', l.battery_bucket, 'conditionKey', l.condition_key,
				'faults', coalesce((SELECT jsonb_agg(jsonb_build_object('component', f.component, 'severity', f.severity, 'note', f.note))
					FROM listing_faults f WHERE f.listing_id = l.id), '[]'::jsonb)),
			'accessories', coalesce((SELECT jsonb_agg(a.type ORDER BY a.type) FROM listing_accessories a WHERE a.listing_id = l.id), '[]'::jsonb),
			'warrantyType', l.warranty_type, 'warrantyUntil', l.warranty_until, 'usageMonths', l.usage_months,
			'description', l.description)
		FROM listings l JOIN phone_variants v ON v.id = l.variant_id JOIN phone_models m ON m.id = v.model_id
		WHERE l.id = $1 FOR UPDATE OF l`, listingID).Scan(&sellerID, &status, &listPrice, &variantID, &condKey, &snapshot)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", notFound("tin đăng")
	}
	if err != nil {
		return "", err
	}
	if sellerID == buyerID {
		return "", forbidden("Bạn không thể mua tin của chính mình.")
	}
	if status != "ACTIVE" {
		return "", apperr.New(apperr.Conflict, "Điện thoại này không còn mở bán.")
	}

	var seq int64
	if err := tx.QueryRow(ctx, `SELECT nextval('order_code_seq')`).Scan(&seq); err != nil {
		return "", err
	}
	code := fmt.Sprintf("RP-%s-%04d", now.Format("20060102"), seq%10000)
	var orderID string
	err = tx.QueryRow(ctx, `INSERT INTO orders (code, buyer_id, seller_id, negotiation_id, shipping_fee, created_at, payment_due_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
		code, buyerID, sellerID, nullIfEmpty(negotiationID), ShippingFee, now, now.Add(PaymentWindow)).Scan(&orderID)
	if err != nil {
		return "", err
	}
	var itemID string
	if err := tx.QueryRow(ctx, `INSERT INTO order_items (order_id, listing_id, variant_id, listing_price_at_agreement, agreed_price, snapshot, condition_key)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, orderID, listingID, variantID, listPrice, price, snapshot, condKey).Scan(&itemID); err != nil {
		return "", err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO payments (order_id, amount, created_at) VALUES ($1,$2,$3)`, orderID, price+ShippingFee, now); err != nil {
		return "", err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO reference_transactions (order_item_id, variant_id, condition_key, data_source, status,
		actual_price, transaction_date, updated_at) VALUES ($1,$2,$3,'REAL','PENDING_COMPLETION',$4,$5,$6)`,
		itemID, variantID, condKey, price, now.Format(time.DateOnly), now); err != nil {
		return "", err
	}
	if _, err := tx.Exec(ctx, `UPDATE listings SET status = 'IN_TRANSACTION', updated_at = $2 WHERE id = $1`, listingID, now); err != nil {
		return "", err
	}
	if err := orderHistory(ctx, tx, now, orderID, "", "AWAITING_PAYMENT", buyerID, "Chốt giá "+vnd(price)); err != nil {
		return "", err
	}

	// Các thương lượng khác của tin này đóng lại và báo cho người mua liên quan.
	rows, err := tx.Query(ctx, `UPDATE negotiations SET status = 'CLOSED', closed_reason = 'Điện thoại đã có người mua', updated_at = $3
		WHERE listing_id = $1 AND id::text <> $2 AND status IN ('AWAITING_SELLER','AWAITING_BUYER') RETURNING id, buyer_id`,
		listingID, negotiationID, now)
	if err != nil {
		return "", err
	}
	type closed struct{ id, buyer string }
	var cl []closed
	for rows.Next() {
		var c closed
		if err := rows.Scan(&c.id, &c.buyer); err != nil {
			rows.Close()
			return "", err
		}
		cl = append(cl, c)
	}
	rows.Close()
	for _, c := range cl {
		if err := notify(ctx, tx, now, c.buyer, "NEGOTIATION_CLOSED", "Điện thoại không còn mở bán",
			"Người bán đã chốt đơn với người mua khác, cuộc thương lượng của bạn đã đóng.", "/negotiations/"+c.id); err != nil {
			return "", err
		}
	}
	if err := notify(ctx, tx, now, sellerID, "ORDER_CREATED", "Có đơn hàng mới "+code,
		"Người mua đã chốt giá "+vnd(price)+". Chờ người mua thanh toán trong 24 giờ.", "/orders/"+orderID); err != nil {
		return "", err
	}
	return orderID, nil
}

// BuyNow: người mua đồng ý giá đang rao (UC20). expectedPrice lệch giá hiện tại thì báo lỗi.
func (s *Service) BuyNow(ctx context.Context, listingID, buyerID string, expectedPrice int64) (*Order, error) {
	now := s.clock.Now()
	var orderID string
	err := s.tx(ctx, func(tx pgx.Tx) error {
		var price int64
		if err := tx.QueryRow(ctx, `SELECT price FROM listings WHERE id = $1`, listingID).Scan(&price); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return notFound("tin đăng")
			}
			return err
		}
		if price != expectedPrice {
			return &apperr.Error{Code: apperr.Conflict, Message: "Giá rao vừa thay đổi, vui lòng xem lại trước khi mua.",
				Details: map[string]any{"currentPrice": price}}
		}
		var err error
		orderID, err = createOrder(ctx, tx, now, listingID, buyerID, price, "")
		return err
	})
	if err != nil {
		return nil, err
	}
	return s.GetOrder(ctx, orderID, buyerID, false)
}

// ---------------------------------------------------------------- thao tác trên đơn

type orderRow struct {
	id, code, buyer, seller, status string
	paymentStatus                   string
	paymentMethod                   *string
	hasShipping                     bool
}

func lockOrder(ctx context.Context, tx pgx.Tx, id string) (*orderRow, error) {
	var o orderRow
	err := tx.QueryRow(ctx, `SELECT o.id, o.code, o.buyer_id, o.seller_id, o.status, p.status, p.method, o.recipient_name IS NOT NULL
		FROM orders o JOIN payments p ON p.order_id = o.id WHERE o.id = $1 FOR UPDATE OF o, p`, id).
		Scan(&o.id, &o.code, &o.buyer, &o.seller, &o.status, &o.paymentStatus, &o.paymentMethod, &o.hasShipping)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, notFound("đơn hàng")
	}
	return &o, err
}

func setOrderStatus(ctx context.Context, tx pgx.Tx, now time.Time, o *orderRow, to, actorID, reason string) error {
	if _, err := tx.Exec(ctx, `UPDATE orders SET status = $2 WHERE id = $1`, o.id, to); err != nil {
		return err
	}
	if err := orderHistory(ctx, tx, now, o.id, o.status, to, actorID, reason); err != nil {
		return err
	}
	o.status = to
	return nil
}

// mutate chạy fn trên đơn đã khóa rồi trả đơn mới cho người gọi.
func (s *Service) mutate(ctx context.Context, orderID, actorID string, fn func(tx pgx.Tx, o *orderRow, now time.Time) error) (*Order, error) {
	now := s.clock.Now()
	err := s.tx(ctx, func(tx pgx.Tx) error {
		o, err := lockOrder(ctx, tx, orderID)
		if err != nil {
			return err
		}
		if actorID != "" && actorID != o.buyer && actorID != o.seller {
			return notFound("đơn hàng")
		}
		return fn(tx, o, now)
	})
	if err != nil {
		return nil, err
	}
	if actorID == "" {
		return nil, nil
	}
	return s.GetOrder(ctx, orderID, actorID, false)
}

func (s *Service) SetShippingInfo(ctx context.Context, orderID, userID string, in ShippingInfo) (*Order, error) {
	in.RecipientName, in.RecipientPhone = strings.TrimSpace(in.RecipientName), strings.TrimSpace(in.RecipientPhone)
	in.AddressLine, in.Province, in.Ward = strings.TrimSpace(in.AddressLine), strings.TrimSpace(in.Province), strings.TrimSpace(in.Ward)
	fields := map[string]string{}
	if in.RecipientName == "" {
		fields["recipientName"] = "Nhập tên người nhận."
	}
	if len(strings.Trim(in.RecipientPhone, "0123456789 +.")) > 0 || len(in.RecipientPhone) < 9 {
		fields["recipientPhone"] = "Số điện thoại không hợp lệ."
	}
	if in.AddressLine == "" {
		fields["addressLine"] = "Nhập địa chỉ."
	}
	if in.Province == "" {
		fields["province"] = "Chọn tỉnh/thành."
	}
	if len(fields) > 0 {
		return nil, &apperr.Error{Code: apperr.ValidationFailed, Message: "Thông tin nhận hàng chưa hợp lệ.", Details: map[string]any{"fields": fields}}
	}
	return s.mutate(ctx, orderID, userID, func(tx pgx.Tx, o *orderRow, now time.Time) error {
		if userID != o.buyer {
			return forbidden("Chỉ người mua nhập thông tin nhận hàng.")
		}
		if o.status != "AWAITING_PAYMENT" {
			return invalidState("Đơn đã qua bước thanh toán, không sửa được thông tin nhận hàng.")
		}
		_, err := tx.Exec(ctx, `UPDATE orders SET recipient_name=$2, recipient_phone=$3, address_line=$4, province=$5, ward=$6 WHERE id=$1`,
			o.id, in.RecipientName, in.RecipientPhone, in.AddressLine, in.Province, in.Ward)
		return err
	})
}

// ChoosePayment: COD → đơn CONFIRMED ngay; PREPAID → chờ kết quả từ cổng thanh toán (demo: PaymentResult).
func (s *Service) ChoosePayment(ctx context.Context, orderID, userID, method, channel string) (*Order, error) {
	if method != "COD" && method != "PREPAID" {
		return nil, apperr.Field("method", "Chọn PREPAID hoặc COD.")
	}
	if method == "PREPAID" && channel != "BANK_TRANSFER" && channel != "EWALLET" && channel != "QR" {
		return nil, apperr.Field("channel", "Chọn kênh thanh toán.")
	}
	return s.mutate(ctx, orderID, userID, func(tx pgx.Tx, o *orderRow, now time.Time) error {
		if userID != o.buyer {
			return forbidden("Chỉ người mua thanh toán đơn.")
		}
		if o.status != "AWAITING_PAYMENT" || o.paymentStatus == "PAID" {
			return invalidState("Đơn không ở bước thanh toán.")
		}
		var due time.Time
		if err := tx.QueryRow(ctx, `SELECT payment_due_at FROM orders WHERE id = $1`, o.id).Scan(&due); err != nil {
			return err
		}
		if !now.Before(due) {
			return apperr.New(apperr.DeadlinePassed, "Đã quá hạn thanh toán 24 giờ.")
		}
		if !o.hasShipping {
			return apperr.Field("shippingInfo", "Nhập thông tin nhận hàng trước khi thanh toán.")
		}
		if method == "COD" {
			if _, err := tx.Exec(ctx, `UPDATE payments SET method='COD', channel=NULL, status='COD_PENDING' WHERE order_id=$1`, o.id); err != nil {
				return err
			}
			if err := setOrderStatus(ctx, tx, now, o, "CONFIRMED", userID, "Người mua chọn COD"); err != nil {
				return err
			}
			return notify(ctx, tx, now, o.seller, "ORDER_CONFIRMED", "Đơn "+o.code+" đã xác nhận (COD)",
				"Người mua trả tiền khi nhận hàng. Hãy chuẩn bị hàng và tạo vận đơn.", "/orders/"+o.id)
		}
		_, err := tx.Exec(ctx, `UPDATE payments SET method='PREPAID', channel=$2, status='PENDING' WHERE order_id=$1`, o.id, channel)
		return err
	})
}

// PaymentResult là kết quả cổng thanh toán (mô phỏng) trả về cho đơn trả trước.
func (s *Service) PaymentResult(ctx context.Context, orderID string, success bool) (*Order, error) {
	var buyer string
	_, err := s.mutate(ctx, orderID, "", func(tx pgx.Tx, o *orderRow, now time.Time) error {
		buyer = o.buyer
		if o.status != "AWAITING_PAYMENT" || o.paymentMethod == nil || *o.paymentMethod != "PREPAID" || o.paymentStatus == "PAID" {
			return invalidState("Đơn không chờ kết quả thanh toán trả trước.")
		}
		if !success {
			_, err := tx.Exec(ctx, `UPDATE payments SET status='FAILED' WHERE order_id=$1`, o.id)
			if err == nil {
				err = notify(ctx, tx, now, o.buyer, "PAYMENT_FAILED", "Thanh toán đơn "+o.code+" chưa thành công",
					"Bạn có thể thử thanh toán lại trước hạn 24 giờ.", "/orders/"+o.id)
			}
			return err
		}
		ref := fmt.Sprintf("SIM-PAY-%d", now.UnixNano()%1_000_000_000)
		if _, err := tx.Exec(ctx, `UPDATE payments SET status='PAID', provider_ref=$2, paid_at=$3 WHERE order_id=$1`, o.id, ref, now); err != nil {
			return err
		}
		if err := createPayout(ctx, tx, o); err != nil {
			return err
		}
		if err := setOrderStatus(ctx, tx, now, o, "CONFIRMED", "", "Thanh toán trả trước thành công (mô phỏng)"); err != nil {
			return err
		}
		if err := notify(ctx, tx, now, o.seller, "ORDER_PAID", "Đơn "+o.code+" đã được thanh toán",
			"RePrice đang giữ tiền đến khi đơn hoàn tất. Hãy chuẩn bị hàng và tạo vận đơn.", "/orders/"+o.id); err != nil {
			return err
		}
		return notify(ctx, tx, now, o.buyer, "ORDER_PAID", "Thanh toán thành công", "Đơn "+o.code+" đang chờ người bán gửi hàng.", "/orders/"+o.id)
	})
	if err != nil {
		return nil, err
	}
	return s.GetOrder(ctx, orderID, buyer, false)
}

// createPayout ghi khoản tiền RePrice đang giữ cho người bán (tiền hàng, không gồm phí vận chuyển).
func createPayout(ctx context.Context, tx pgx.Tx, o *orderRow) error {
	_, err := tx.Exec(ctx, `INSERT INTO payouts (order_id, seller_id, amount)
		SELECT $1, $2, sum(agreed_price) FROM order_items WHERE order_id = $1
		ON CONFLICT (order_id) DO NOTHING`, o.id, o.seller)
	return err
}

// Cancel: hủy trước khi đơn vị vận chuyển lấy hàng (UC32).
func (s *Service) Cancel(ctx context.Context, orderID, userID, reason string) (*Order, error) {
	if strings.TrimSpace(reason) == "" {
		return nil, apperr.Field("reason", "Nhập lý do hủy.")
	}
	return s.mutate(ctx, orderID, userID, func(tx pgx.Tx, o *orderRow, now time.Time) error {
		if o.status != "AWAITING_PAYMENT" && o.status != "CONFIRMED" {
			return invalidState("Đơn đã giao cho đơn vị vận chuyển, không thể hủy. Hãy dùng yêu cầu trả hàng sau khi nhận.")
		}
		var picked bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM shipments WHERE order_id=$1 AND direction='OUTBOUND'
			AND status NOT IN ('AWAITING_PICKUP','VOIDED'))`, o.id).Scan(&picked); err != nil {
			return err
		}
		if picked {
			return invalidState("Đơn vị vận chuyển đã lấy hàng, không thể hủy.")
		}
		who := "người mua"
		if userID == o.seller {
			who = "người bán"
		}
		if err := cancelOrder(ctx, tx, now, o, userID, "Hủy bởi "+who+": "+strings.TrimSpace(reason)); err != nil {
			return err
		}
		other := o.seller
		if userID == o.seller {
			other = o.buyer
		}
		return notify(ctx, tx, now, other, "ORDER_CANCELLED", "Đơn "+o.code+" đã bị hủy", "Lý do: "+strings.TrimSpace(reason), "/orders/"+o.id)
	})
}

// cancelOrder đưa đơn về CANCELLED và xử lý các phần liên quan: tiền, vận đơn, tin đăng, dữ liệu tham chiếu.
func cancelOrder(ctx context.Context, tx pgx.Tx, now time.Time, o *orderRow, actorID, reason string) error {
	if _, err := tx.Exec(ctx, `UPDATE orders SET cancelled_at=$2, cancel_reason=$3 WHERE id=$1`, o.id, now, reason); err != nil {
		return err
	}
	if err := setOrderStatus(ctx, tx, now, o, "CANCELLED", actorID, reason); err != nil {
		return err
	}
	switch o.paymentStatus {
	case "PAID":
		// Tiền đã thu: tạo lệnh hoàn, QTV xử lý ở màn hoàn tiền.
		if _, err := tx.Exec(ctx, `INSERT INTO refunds (order_id, amount, created_at, updated_at)
			SELECT order_id, amount, $2, $2 FROM payments WHERE order_id = $1`, o.id, now); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE payouts SET status='REVERSED' WHERE order_id=$1`, o.id); err != nil {
			return err
		}
	default:
		if _, err := tx.Exec(ctx, `UPDATE payments SET status='VOID' WHERE order_id=$1`, o.id); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE shipments SET status='VOIDED' WHERE order_id=$1 AND status='AWAITING_PICKUP'`, o.id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE listings SET status='ACTIVE', updated_at=$2
		WHERE id IN (SELECT listing_id FROM order_items WHERE order_id=$1) AND status='IN_TRANSACTION'`, o.id, now); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `UPDATE reference_transactions SET status='EXCLUDED', updated_at=$2
		WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id=$1)`, o.id, now)
	return err
}

// Handover: người bán chuẩn bị hàng, tạo vận đơn (UC33). Đơn chuyển SHIPPING khi đơn vị vận chuyển lấy hàng.
func (s *Service) Handover(ctx context.Context, orderID, userID string) (*Order, error) {
	return s.mutate(ctx, orderID, userID, func(tx pgx.Tx, o *orderRow, now time.Time) error {
		if userID != o.seller {
			return forbidden("Chỉ người bán tạo vận đơn.")
		}
		if o.status != "CONFIRMED" {
			return invalidState("Đơn chưa được xác nhận thanh toán.")
		}
		var exists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM shipments WHERE order_id=$1 AND direction='OUTBOUND' AND status <> 'VOIDED')`,
			o.id).Scan(&exists); err != nil {
			return err
		}
		if exists {
			return apperr.New(apperr.Conflict, "Đơn đã có vận đơn.")
		}
		var seq int64
		if err := tx.QueryRow(ctx, `SELECT nextval('tracking_code_seq')`).Scan(&seq); err != nil {
			return err
		}
		code := fmt.Sprintf("RPX%s%05d", now.Format("060102"), seq%100000)
		var shipID string
		if err := tx.QueryRow(ctx, `INSERT INTO shipments (order_id, direction, tracking_code, carrier, created_at)
			VALUES ($1,'OUTBOUND',$2,$3,$4) RETURNING id`, o.id, code, Carrier, now).Scan(&shipID); err != nil {
			return err
		}
		if err := shipmentEvent(ctx, tx, now, shipID, "AWAITING_PICKUP", "Người bán đã đóng gói, chờ đơn vị vận chuyển lấy hàng"); err != nil {
			return err
		}
		return notify(ctx, tx, now, o.buyer, "ORDER_HANDOVER", "Người bán đã chuẩn bị hàng",
			"Đơn "+o.code+" có mã vận đơn "+code+".", "/orders/"+o.id)
	})
}

// Receive: người mua bấm "Đã nhận hàng" (UC37); returnDeadline = lúc bấm + 3 ngày.
func (s *Service) Receive(ctx context.Context, orderID, userID string) (*Order, error) {
	return s.mutate(ctx, orderID, userID, func(tx pgx.Tx, o *orderRow, now time.Time) error {
		if userID != o.buyer {
			return forbidden("Chỉ người mua xác nhận đã nhận hàng.")
		}
		if o.status != "DELIVERED" {
			return invalidState("Đơn chưa được giao thành công hoặc đã xác nhận nhận hàng.")
		}
		if _, err := tx.Exec(ctx, `UPDATE orders SET received_at=$2, return_deadline=$3 WHERE id=$1`, o.id, now, now.Add(ReturnWindow)); err != nil {
			return err
		}
		if err := setOrderStatus(ctx, tx, now, o, "RECEIVED", userID, "Người mua xác nhận đã nhận hàng"); err != nil {
			return err
		}
		return notify(ctx, tx, now, o.seller, "ORDER_RECEIVED", "Người mua đã nhận hàng",
			"Đơn "+o.code+" sẽ hoàn tất sau 3 ngày nếu không có yêu cầu trả hàng.", "/orders/"+o.id)
	})
}
