package trade

import (
	"context"
	"time"
)

type Notification struct {
	ID        string     `json:"id"`
	Type      string     `json:"type"`
	Title     string     `json:"title"`
	Body      string     `json:"body"`
	Link      string     `json:"link"`
	ReadAt    *time.Time `json:"readAt"`
	CreatedAt time.Time  `json:"createdAt"`
}

func (s *Service) ListNotifications(ctx context.Context, userID string, unreadOnly bool, limit int) ([]Notification, int, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, type, title, body, link, read_at, created_at FROM notifications
		WHERE user_id = $1 AND (NOT $2 OR read_at IS NULL) ORDER BY created_at DESC, id LIMIT $3`, userID, unreadOnly, limit)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []Notification{}
	for rows.Next() {
		var n Notification
		if err := rows.Scan(&n.ID, &n.Type, &n.Title, &n.Body, &n.Link, &n.ReadAt, &n.CreatedAt); err != nil {
			return nil, 0, err
		}
		out = append(out, n)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	var unread int
	err = s.pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL`, userID).Scan(&unread)
	return out, unread, err
}

func (s *Service) MarkNotificationRead(ctx context.Context, userID, id string) error {
	_, err := s.pool.Exec(ctx, `UPDATE notifications SET read_at = $3 WHERE id = $1 AND user_id = $2 AND read_at IS NULL`, id, userID, s.clock.Now())
	return err
}

func (s *Service) MarkAllNotificationsRead(ctx context.Context, userID string) error {
	_, err := s.pool.Exec(ctx, `UPDATE notifications SET read_at = $2 WHERE user_id = $1 AND read_at IS NULL`, userID, s.clock.Now())
	return err
}
