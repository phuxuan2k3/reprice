package market

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"

	"reprice/internal/apperr"
)

type PhoneModel struct {
	ID    string `json:"id"`
	Brand string `json:"brand"`
	Name  string `json:"name"`
}

func (s *Store) Brands(ctx context.Context) ([]string, error) {
	rows, err := s.pool.Query(ctx, `SELECT DISTINCT brand FROM phone_models ORDER BY brand`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

func (s *Store) Models(ctx context.Context, brand, q string) ([]PhoneModel, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, brand, name FROM phone_models
		WHERE brand = $1 AND ($2 = '' OR name ILIKE '%' || $2 || '%') ORDER BY name`, brand, strings.TrimSpace(q))
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (PhoneModel, error) {
		var m PhoneModel
		err := r.Scan(&m.ID, &m.Brand, &m.Name)
		return m, err
	})
}

func (s *Store) Variants(ctx context.Context, modelID string) ([]Variant, error) {
	rows, err := s.pool.Query(ctx, `SELECT v.id, v.model_id, m.brand, m.name, v.storage_gb, v.ram_gb, v.color
		FROM phone_variants v JOIN phone_models m ON m.id = v.model_id
		WHERE v.model_id = $1 ORDER BY v.storage_gb, v.ram_gb NULLS FIRST, v.color NULLS FIRST`, modelID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Variant, error) {
		var v Variant
		err := r.Scan(&v.ID, &v.ModelID, &v.Brand, &v.ModelName, &v.StorageGB, &v.RAMGB, &v.Color)
		return v, err
	})
}

// VariantSpec chọn phiên bản theo model + dung lượng (+ RAM) + màu. Màu nil = không rõ.
type VariantSpec struct {
	ModelID   string  `json:"modelId"`
	StorageGB int     `json:"storageGb"`
	RAMGB     *int    `json:"ramGb"`
	Color     *string `json:"color"`
}

func normalizeColor(c *string) *string {
	if c == nil {
		return nil
	}
	t := strings.TrimSpace(*c)
	if t == "" || strings.EqualFold(t, "Không rõ") {
		return nil
	}
	return &t
}

// resolveVariant trả phiên bản đúng spec; tạo mới khi model đã có dung lượng đó nhưng chưa có
// màu này (màu do người bán tự nhập). Không tạo model hay dung lượng ngoài danh mục.
func resolveVariant(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, spec VariantSpec, create bool) (string, error) {
	spec.Color = normalizeColor(spec.Color)
	if spec.Color != nil && len([]rune(*spec.Color)) > 30 {
		return "", apperr.Field("color", "Tên màu tối đa 30 ký tự.")
	}
	var known bool
	if err := q.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM phone_variants WHERE model_id = $1 AND storage_gb = $2
		AND coalesce(ram_gb, 0) = coalesce($3::int, 0))`, spec.ModelID, spec.StorageGB, spec.RAMGB).Scan(&known); err != nil {
		return "", err
	}
	if !known {
		return "", apperr.Field("storageGb", "Model này không có phiên bản dung lượng / RAM đã chọn trong danh mục.")
	}
	var id string
	err := q.QueryRow(ctx, `SELECT id FROM phone_variants WHERE model_id = $1 AND storage_gb = $2
		AND coalesce(ram_gb, 0) = coalesce($3::int, 0) AND coalesce(color, '') = coalesce($4::text, '')`,
		spec.ModelID, spec.StorageGB, spec.RAMGB, spec.Color).Scan(&id)
	if err == nil || !errors.Is(err, pgx.ErrNoRows) {
		return id, err
	}
	if !create {
		// Xem trước giá: dùng tạm một phiên bản cùng nhóm, màu chỉ ảnh hưởng GĐ1 (truyền riêng).
		err = q.QueryRow(ctx, `SELECT id FROM phone_variants WHERE model_id = $1 AND storage_gb = $2
			AND coalesce(ram_gb, 0) = coalesce($3::int, 0) ORDER BY color NULLS FIRST LIMIT 1`,
			spec.ModelID, spec.StorageGB, spec.RAMGB).Scan(&id)
		return id, err
	}
	err = q.QueryRow(ctx, `INSERT INTO phone_variants (model_id, storage_gb, ram_gb, color) VALUES ($1,$2,$3,$4) RETURNING id`,
		spec.ModelID, spec.StorageGB, spec.RAMGB, spec.Color).Scan(&id)
	return id, err
}
