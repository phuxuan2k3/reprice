// Package clock cung cấp giờ hệ thống có cộng độ lệch demo (bảng system_clock),
// để nút "Tua thời gian" làm các hạn 24h, 48h, 3 ngày đến hạn thật.
// Mọi logic nghiệp vụ phải lấy giờ qua đây, không gọi time.Now() trực tiếp.
package clock

import (
	"context"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Clock struct {
	pool   *pgxpool.Pool
	offset atomic.Int64 // giây
}

func New(ctx context.Context, pool *pgxpool.Pool) (*Clock, error) {
	c := &Clock{pool: pool}
	var off int64
	if err := pool.QueryRow(ctx, `SELECT offset_seconds FROM system_clock WHERE id = 1`).Scan(&off); err != nil {
		return nil, err
	}
	c.offset.Store(off)
	return c, nil
}

func (c *Clock) Now() time.Time {
	return time.Now().Add(time.Duration(c.offset.Load()) * time.Second)
}

func (c *Clock) Offset() time.Duration {
	return time.Duration(c.offset.Load()) * time.Second
}

// Advance tua thời gian về phía trước và lưu lại để server khởi động lại vẫn giữ.
func (c *Clock) Advance(ctx context.Context, d time.Duration) error {
	var off int64
	err := c.pool.QueryRow(ctx,
		`UPDATE system_clock SET offset_seconds = offset_seconds + $1 WHERE id = 1 RETURNING offset_seconds`,
		int64(d/time.Second)).Scan(&off)
	if err != nil {
		return err
	}
	c.offset.Store(off)
	return nil
}

// Reset đưa đồng hồ về giờ thật (dùng khi /demo/reset).
func (c *Clock) Reset(ctx context.Context) error {
	if _, err := c.pool.Exec(ctx, `UPDATE system_clock SET offset_seconds = 0 WHERE id = 1`); err != nil {
		return err
	}
	c.offset.Store(0)
	return nil
}
