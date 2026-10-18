package trade

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
)

// RunDue xử lý mọi việc đã đến hạn theo giờ hệ thống (docs/api.md mục 3). Chạy mỗi phút
// và ngay sau khi tua thời gian demo. Mỗi đơn xử lý trong transaction riêng.
func (s *Service) RunDue(ctx context.Context) ([]string, error) {
	now := s.clock.Now()
	// Báo giá cửa hàng mô phỏng chỉ có hiệu lực 24 giờ: làm mới để bản demo (kể cả sau khi tua giờ)
	// luôn có giá máy mới.
	if _, err := s.pool.Exec(ctx, `UPDATE store_price_quotes q SET verified_at = $1::timestamptz - interval '2 hours'
		FROM store_sources src WHERE src.id = q.source_id AND src.retailer_name LIKE '%(mô phỏng)%'
		  AND (q.verified_at < $1::timestamptz - interval '12 hours' OR q.verified_at > $1::timestamptz)`, now); err != nil {
		return nil, err
	}
	cancelled, err := s.forEachDue(ctx, `SELECT o.id FROM orders o
		WHERE o.status = 'AWAITING_PAYMENT' AND o.payment_due_at <= $1`, now,
		func(tx pgx.Tx, o *orderRow) error {
			if o.status != "AWAITING_PAYMENT" {
				return nil
			}
			if err := cancelOrder(ctx, tx, now, o, "", "Quá 24 giờ chưa thanh toán"); err != nil {
				return err
			}
			for _, u := range []string{o.buyer, o.seller} {
				if err := notify(ctx, tx, now, u, "ORDER_CANCELLED", "Đơn "+o.code+" đã tự hủy",
					"Quá 24 giờ chưa thanh toán. Điện thoại được mở bán lại.", "/orders/"+o.id); err != nil {
					return err
				}
			}
			return nil
		})
	if err != nil {
		return nil, err
	}
	completed, err := s.forEachDue(ctx, `SELECT o.id FROM orders o
		WHERE o.status IN ('DELIVERED','RECEIVED') AND o.return_deadline <= $1
		  AND NOT EXISTS (SELECT 1 FROM support_cases c WHERE c.order_id = o.id AND c.closed_at IS NULL)`, now,
		func(tx pgx.Tx, o *orderRow) error {
			if o.status != "DELIVERED" && o.status != "RECEIVED" {
				return nil
			}
			return completeOrder(ctx, tx, now, o)
		})
	if err != nil {
		return nil, err
	}
	cases, err := s.runCaseDeadlines(ctx)
	if err != nil {
		return nil, err
	}
	return []string{
		fmt.Sprintf("orders.autoCancel: %d", cancelled),
		fmt.Sprintf("orders.autoComplete: %d", completed),
		fmt.Sprintf("cases.deadlines: %d", cases),
	}, nil
}

func (s *Service) forEachDue(ctx context.Context, query string, now time.Time, fn func(pgx.Tx, *orderRow) error) (int, error) {
	rows, err := s.pool.Query(ctx, query, now)
	if err != nil {
		return 0, err
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return 0, err
	}
	n := 0
	for _, id := range ids {
		err := s.tx(ctx, func(tx pgx.Tx) error {
			o, err := lockOrder(ctx, tx, id)
			if err != nil {
				return err
			}
			return fn(tx, o)
		})
		if err != nil {
			return n, fmt.Errorf("order %s: %w", id, err)
		}
		n++
	}
	return n, nil
}

// completeOrder: hết thời hạn kiểm tra, không có hồ sơ mở → hoàn tất, chuyển tiền người bán,
// tin thành SOLD và xét giao dịch vào dữ liệu tham chiếu (docs/SPEC.md 6.2).
func completeOrder(ctx context.Context, tx pgx.Tx, now time.Time, o *orderRow) error {
	if _, err := tx.Exec(ctx, `UPDATE orders SET completed_at=$2 WHERE id=$1`, o.id, now); err != nil {
		return err
	}
	if err := setOrderStatus(ctx, tx, now, o, "COMPLETED", "", "Hết thời hạn kiểm tra, không có yêu cầu trả hàng"); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE payouts SET status='RELEASED', released_at=$2 WHERE order_id=$1 AND status='HELD'`, o.id, now); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE listings SET status='SOLD', updated_at=$2
		WHERE id IN (SELECT listing_id FROM order_items WHERE order_id=$1)`, o.id, now); err != nil {
		return err
	}
	paid := o.paymentStatus == "PAID" || o.paymentStatus == "COD_COLLECTED"
	rows, err := tx.Query(ctx, `SELECT rt.id, rt.condition_key IS NOT NULL,
			EXISTS (SELECT 1 FROM suspicion_flags f WHERE f.reference_transaction_id = rt.id AND f.status = 'OPEN')
		FROM reference_transactions rt JOIN order_items i ON i.id = rt.order_item_id
		WHERE i.order_id = $1 AND rt.status = 'PENDING_COMPLETION'`, o.id)
	if err != nil {
		return err
	}
	type ref struct {
		id              string
		hasKey, hasFlag bool
	}
	var refs []ref
	for rows.Next() {
		var r ref
		if err := rows.Scan(&r.id, &r.hasKey, &r.hasFlag); err != nil {
			rows.Close()
			return err
		}
		refs = append(refs, r)
	}
	rows.Close()
	for _, r := range refs {
		switch {
		case !paid:
			if _, err := tx.Exec(ctx, `INSERT INTO suspicion_flags (reference_transaction_id, code, evidence, raised_at)
				VALUES ($1,'PAYMENT_DELIVERY_CONTRADICTION','Đơn hoàn tất nhưng chưa ghi nhận thanh toán / thu COD',$2)`, r.id, now); err != nil {
				return err
			}
			r.hasFlag = true
		case !r.hasKey:
			if _, err := tx.Exec(ctx, `INSERT INTO suspicion_flags (reference_transaction_id, code, evidence, raised_at)
				VALUES ($1,'SNAPSHOT_MISSING_OR_INCONSISTENT','Snapshot thiếu tiêu chí Condition Score',$2)`, r.id, now); err != nil {
				return err
			}
			r.hasFlag = true
		}
		status, eligibleAt := "ELIGIBLE", any(now)
		if r.hasFlag {
			status, eligibleAt = "PENDING_VERIFICATION", nil
		}
		if _, err := tx.Exec(ctx, `UPDATE reference_transactions SET status=$2, eligible_at=$3, updated_at=$4 WHERE id=$1`,
			r.id, status, eligibleAt, now); err != nil {
			return err
		}
	}
	for _, u := range []string{o.buyer, o.seller} {
		if err := notify(ctx, tx, now, u, "ORDER_COMPLETED", "Đơn "+o.code+" đã hoàn tất",
			"RePrice đã chuyển tiền cho người bán (mô phỏng).", "/orders/"+o.id); err != nil {
			return err
		}
	}
	return nil
}

// Loop chạy RunDue mỗi phút đến khi ctx kết thúc.
func (s *Service) Loop(ctx context.Context) {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		if jobs, err := s.RunDue(ctx); err != nil {
			slog.Error("scheduler", "err", err)
		} else {
			slog.Debug("scheduler", "jobs", jobs)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}
