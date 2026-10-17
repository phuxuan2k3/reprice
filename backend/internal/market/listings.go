// Package market đọc tin đăng và tính giá tham khảo từ database.
package market

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("not found")

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

type Variant struct {
	ID        string  `json:"id"`
	ModelID   string  `json:"modelId"`
	Brand     string  `json:"brand"`
	ModelName string  `json:"modelName"`
	StorageGB int     `json:"storageGb"`
	RAMGB     *int    `json:"ramGb"`
	Color     *string `json:"color"`
}

type Seller struct {
	ID           string   `json:"id"`
	FullName     string   `json:"fullName"`
	SellerRating *float64 `json:"sellerRating"`
	ReviewCount  int      `json:"reviewCount"`
	JoinedAt     string   `json:"joinedAt"`
}

type Fault struct {
	Component string `json:"component"`
	Severity  string `json:"severity"`
	Note      string `json:"note"`
}

type Condition struct {
	Appearance        *string `json:"appearance"`
	Functionality     *string `json:"functionality"`
	Faults            []Fault `json:"faults"`
	RemainingChecked  *bool   `json:"remainingChecked"`
	BatteryHealthPct  *int    `json:"batteryHealthPct"`
	BatteryStatusText *string `json:"batteryStatusText"`
	BatteryBucket     *string `json:"batteryBucket"`
	ConditionKey      *string `json:"conditionKey"`
}

type Accessory struct {
	Type string `json:"type"`
	Note string `json:"note"`
}

type Photo struct {
	ID       string `json:"id"`
	URL      string `json:"url"`
	Position int    `json:"position"`
	IsCover  bool   `json:"isCover"`
}

// Listing là dạng ListingDetail trong docs/openapi.yaml (ListingSummary là tập con).
type Listing struct {
	ID             string      `json:"id"`
	Title          string      `json:"title"`
	Variant        *Variant    `json:"variant"`
	Status         string      `json:"status"`
	Price          *int64      `json:"price"`
	Condition      Condition   `json:"condition"`
	NetworkLock    *string     `json:"networkLock"`
	UsageMonths    *int        `json:"usageMonths"`
	Accessories    []Accessory `json:"accessories"`
	WarrantyType   *string     `json:"warrantyType"`
	WarrantyUntil  *string     `json:"warrantyUntil"`
	WarrantyStore  *string     `json:"warrantyStore"`
	Description    string      `json:"description"`
	Province       string      `json:"province"`
	Ward           string      `json:"ward"`
	Photos         []Photo     `json:"photos"`
	Seller         Seller      `json:"seller"`
	PublishedAt    *time.Time  `json:"publishedAt"`
	UpdatedAt      time.Time   `json:"updatedAt"`
	AllowedActions []string    `json:"allowedActions"`
}

const listingSelect = `
SELECT l.id, l.status, l.price, l.appearance, l.functionality, l.remaining_checked, l.battery_health_pct,
       l.battery_status_text, l.battery_bucket, l.condition_key, l.network_lock, l.usage_months, l.warranty_type,
       to_char(l.warranty_until, 'YYYY-MM-DD'), l.warranty_store, l.description, l.province, l.ward,
       l.published_at, l.updated_at,
       v.id, v.model_id, m.brand, m.name, v.storage_gb, v.ram_gb, v.color,
       u.id, u.full_name, u.seller_rating, to_char(u.created_at, 'YYYY-MM-DD'),
       (SELECT count(*) FROM reviews r WHERE r.seller_id = u.id)
FROM listings l
JOIN users u ON u.id = l.seller_id
LEFT JOIN phone_variants v ON v.id = l.variant_id
LEFT JOIN phone_models m ON m.id = v.model_id`

func scanListing(row pgx.Row) (*Listing, error) {
	var l Listing
	var vID, vModelID, brand, model *string
	var storage *int
	var ram *int
	var color *string
	err := row.Scan(&l.ID, &l.Status, &l.Price, &l.Condition.Appearance, &l.Condition.Functionality,
		&l.Condition.RemainingChecked, &l.Condition.BatteryHealthPct, &l.Condition.BatteryStatusText,
		&l.Condition.BatteryBucket, &l.Condition.ConditionKey, &l.NetworkLock, &l.UsageMonths, &l.WarrantyType,
		&l.WarrantyUntil, &l.WarrantyStore, &l.Description, &l.Province, &l.Ward, &l.PublishedAt, &l.UpdatedAt,
		&vID, &vModelID, &brand, &model, &storage, &ram, &color,
		&l.Seller.ID, &l.Seller.FullName, &l.Seller.SellerRating, &l.Seller.JoinedAt, &l.Seller.ReviewCount)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if vID != nil {
		l.Variant = &Variant{ID: *vID, ModelID: *vModelID, Brand: *brand, ModelName: *model, StorageGB: *storage, RAMGB: ram, Color: color}
		l.Title = fmt.Sprintf("%s %dGB", *model, *storage)
	}
	l.Condition.Faults = []Fault{}
	l.Accessories = []Accessory{}
	l.Photos = []Photo{}
	return &l, nil
}

// ListingFilter là bộ lọc của GET /listings. Chỉ trả tin ACTIVE.
type ListingFilter struct {
	Q          string
	Brand      string
	StorageGB  int
	Appearance string
	MinPrice   int64
	MaxPrice   int64
	Province   string
	Sort       string // newest | price_asc | price_desc
	Page       int
	PageSize   int
}

func (s *Store) ListListings(ctx context.Context, f ListingFilter) ([]*Listing, int, error) {
	where := []string{"l.status = 'ACTIVE'"}
	var args []any
	add := func(cond string, v any) {
		args = append(args, v)
		where = append(where, fmt.Sprintf(cond, len(args)))
	}
	if q := strings.TrimSpace(f.Q); q != "" {
		add("(m.brand || ' ' || m.name || ' ' || v.storage_gb || 'GB') ILIKE '%%' || $%d || '%%'", q)
	}
	if f.Brand != "" {
		add("m.brand = $%d", f.Brand)
	}
	if f.StorageGB > 0 {
		add("v.storage_gb = $%d", f.StorageGB)
	}
	if f.Appearance != "" {
		add("l.appearance = $%d", f.Appearance)
	}
	if f.MinPrice > 0 {
		add("l.price >= $%d", f.MinPrice)
	}
	if f.MaxPrice > 0 {
		add("l.price <= $%d", f.MaxPrice)
	}
	if f.Province != "" {
		add("l.province = $%d", f.Province)
	}
	whereSQL := " WHERE " + strings.Join(where, " AND ")

	var total int
	countSQL := `SELECT count(*) FROM listings l LEFT JOIN phone_variants v ON v.id = l.variant_id
		LEFT JOIN phone_models m ON m.id = v.model_id` + whereSQL
	if err := s.pool.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	order := "l.published_at DESC"
	switch f.Sort {
	case "price_asc":
		order = "l.price ASC, l.published_at DESC"
	case "price_desc":
		order = "l.price DESC, l.published_at DESC"
	}
	args = append(args, f.PageSize, (f.Page-1)*f.PageSize)
	rows, err := s.pool.Query(ctx, listingSelect+whereSQL+" ORDER BY "+order+
		fmt.Sprintf(" LIMIT $%d OFFSET $%d", len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []*Listing
	for rows.Next() {
		l, err := scanListing(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, l)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	if err := s.loadChildren(ctx, out); err != nil {
		return nil, 0, err
	}
	return out, total, nil
}

// GetListing trả tin theo id; tin nháp chỉ người bán xem được (viewerID).
func (s *Store) GetListing(ctx context.Context, id, viewerID string) (*Listing, error) {
	l, err := scanListing(s.pool.QueryRow(ctx, listingSelect+" WHERE l.id = $1", id))
	if err != nil {
		return nil, err
	}
	if l.Status == "DRAFT" && l.Seller.ID != viewerID {
		return nil, ErrNotFound
	}
	if err := s.loadChildren(ctx, []*Listing{l}); err != nil {
		return nil, err
	}
	return l, nil
}

func (s *Store) loadChildren(ctx context.Context, ls []*Listing) error {
	if len(ls) == 0 {
		return nil
	}
	ids := make([]string, len(ls))
	byID := map[string]*Listing{}
	for i, l := range ls {
		ids[i] = l.ID
		byID[l.ID] = l
	}
	rows, err := s.pool.Query(ctx, `SELECT listing_id, type, note FROM listing_accessories WHERE listing_id = ANY($1) ORDER BY type`, ids)
	if err != nil {
		return err
	}
	for rows.Next() {
		var lid string
		var a Accessory
		if err := rows.Scan(&lid, &a.Type, &a.Note); err != nil {
			rows.Close()
			return err
		}
		byID[lid].Accessories = append(byID[lid].Accessories, a)
	}
	rows.Close()
	rows, err = s.pool.Query(ctx, `SELECT listing_id, component, severity, note FROM listing_faults WHERE listing_id = ANY($1)`, ids)
	if err != nil {
		return err
	}
	for rows.Next() {
		var lid string
		var f Fault
		if err := rows.Scan(&lid, &f.Component, &f.Severity, &f.Note); err != nil {
			rows.Close()
			return err
		}
		byID[lid].Condition.Faults = append(byID[lid].Condition.Faults, f)
	}
	rows.Close()
	rows, err = s.pool.Query(ctx, `SELECT listing_id, id, url, position, is_cover FROM listing_photos WHERE listing_id = ANY($1) ORDER BY position`, ids)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var lid string
		var p Photo
		if err := rows.Scan(&lid, &p.ID, &p.URL, &p.Position, &p.IsCover); err != nil {
			return err
		}
		byID[lid].Photos = append(byID[lid].Photos, p)
	}
	return rows.Err()
}
