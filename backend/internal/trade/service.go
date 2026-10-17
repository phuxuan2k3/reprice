// Package trade là nghiệp vụ mua bán: thương lượng, đơn hàng, thanh toán, giao hàng và
// bộ lập lịch xử lý các hạn. Trạng thái theo docs/state-diagrams.md.
//
// Mọi thao tác đổi trạng thái chạy trong một transaction và khóa hàng (SELECT ... FOR UPDATE)
// của đối tượng bị đổi, để hai người bấm cùng lúc không làm hỏng trạng thái.
package trade

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"reprice/internal/apperr"
)

// Các mốc thời gian đã chốt trong SPEC.
const (
	PaymentWindow    = 24 * time.Hour
	ReturnWindow     = 72 * time.Hour
	ShippingFee      = int64(30_000) // phí vận chuyển mô phỏng, tách riêng khỏi giá máy
	MaxDeliveryTries = 2
	Carrier          = "RePrice Express (mô phỏng)"
)

type Clock interface {
	Now() time.Time
}

type Service struct {
	pool  *pgxpool.Pool
	clock Clock
}

func New(pool *pgxpool.Pool, clock Clock) *Service {
	return &Service{pool: pool, clock: clock}
}

func (s *Service) tx(ctx context.Context, fn func(pgx.Tx) error) error {
	return pgx.BeginFunc(ctx, s.pool, fn)
}

// notify ghi một thông báo hệ thống cho người dùng.
func notify(ctx context.Context, tx pgx.Tx, now time.Time, userID, typ, title, body, link string) error {
	_, err := tx.Exec(ctx, `INSERT INTO notifications (user_id, type, title, body, link, created_at)
		VALUES ($1,$2,$3,$4,$5,$6)`, userID, typ, title, body, link, now)
	return err
}

// orderHistory ghi một lần đổi trạng thái đơn. actorID rỗng = bộ lập lịch / hệ thống.
func orderHistory(ctx context.Context, tx pgx.Tx, now time.Time, orderID, from, to, actorID, reason string) error {
	var actor any
	if actorID != "" {
		actor = actorID
	}
	_, err := tx.Exec(ctx, `INSERT INTO order_status_history (order_id, from_status, to_status, actor_id, reason, created_at)
		VALUES ($1,$2,$3,$4,$5,$6)`, orderID, nullIfEmpty(from), to, actor, reason, now)
	return err
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func notFound(what string) *apperr.Error {
	return apperr.New(apperr.NotFound, fmt.Sprintf("Không tìm thấy %s.", what))
}

func invalidState(msg string) *apperr.Error {
	return apperr.New(apperr.InvalidState, msg)
}

func forbidden(msg string) *apperr.Error {
	return apperr.New(apperr.Forbidden, msg)
}

func vnd(v int64) string {
	s := fmt.Sprintf("%d", v)
	out := make([]byte, 0, len(s)+len(s)/3)
	for i := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, '.')
		}
		out = append(out, s[i])
	}
	return string(out) + "đ"
}
