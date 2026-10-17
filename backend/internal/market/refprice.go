package market

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"reprice/internal/pricing"
)

// PriceReference là response của GET /listings/{id}/reference-price (docs/openapi.yaml).
type PriceReference struct {
	ViewerRole       string                   `json:"viewerRole"`
	Price            *int64                   `json:"price"`
	PriceLabel       string                   `json:"priceLabel"`
	NewPrice         NewPriceResult           `json:"newPrice"`
	UsedPrice        UsedPriceResult          `json:"usedPrice"`
	PositionLabel    *pricing.Position        `json:"positionLabel"`
	NewPricePosition *pricing.Position        `json:"newPricePosition"`
	ShowReviewPrompt bool                     `json:"showReviewPrompt"`
	ReviewDirection  *pricing.ReviewDirection `json:"reviewDirection"`
}

type StoreSource struct {
	Retailer   string    `json:"retailer"`
	Price      int64     `json:"price"`
	Color      *string   `json:"color"`
	URL        string    `json:"url"`
	VerifiedAt time.Time `json:"verifiedAt"`
}

type NewPriceResult struct {
	Status        pricing.ResultStatus `json:"status"`
	LowerPrice    *int64               `json:"lowerPrice"`
	UpperPrice    *int64               `json:"upperPrice"`
	MissingFields []string             `json:"missingFields,omitempty"`
	Sources       []StoreSource        `json:"sources"`
}

type Group struct {
	VariantID    string  `json:"variantId"`
	ConditionKey *string `json:"conditionKey"`
}

type UsedPriceResult struct {
	Status           pricing.ResultStatus `json:"status"`
	LowerPrice       *int64               `json:"lowerPrice"`
	UpperPrice       *int64               `json:"upperPrice"`
	TransactionCount int                  `json:"transactionCount"`
	MinTransactions  int                  `json:"minTransactions"`
	WindowMonths     *int                 `json:"windowMonths"`
	PeriodStart      *string              `json:"periodStart"`
	PeriodEnd        *string              `json:"periodEnd"`
	DataSource       string               `json:"dataSource"`
	VersionID        *string              `json:"versionId"`
	Group            Group                `json:"group"`
	MissingCriteria  []string             `json:"missingCriteria,omitempty"`
}

// LoadConfig đọc bảng pricing_config. Giá trị null giữ nguyên mặc định (zThreshold = nil).
func (s *Store) LoadConfig(ctx context.Context) (pricing.Config, error) {
	cfg := pricing.DefaultConfig()
	rows, err := s.pool.Query(ctx, `SELECT key, value FROM pricing_config WHERE value IS NOT NULL`)
	if err != nil {
		return cfg, err
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		var raw []byte
		if err := rows.Scan(&key, &raw); err != nil {
			return cfg, err
		}
		switch key {
		case "min_transactions":
			err = json.Unmarshal(raw, &cfg.MinTransactions)
		case "windows_months":
			err = json.Unmarshal(raw, &cfg.WindowsMonths)
		case "new_price_max_age_hours":
			var h int
			if err = json.Unmarshal(raw, &h); err == nil {
				cfg.NewPriceMaxAge = time.Duration(h) * time.Hour
			}
		case "z_threshold":
			var z float64
			if err = json.Unmarshal(raw, &z); err == nil {
				cfg.ZThreshold = &z
			}
		}
		if err != nil {
			return cfg, fmt.Errorf("pricing_config %s: %w", key, err)
		}
	}
	return cfg, rows.Err()
}

// ReferencePrice tính GĐ1 + GĐ2 cho một tin. price là giá đang xét (giá rao, hoặc giá người bán
// đang gõ); viewerIsSeller đổi nhãn sang "Giá bạn nhập".
func (s *Store) ReferencePrice(ctx context.Context, l *Listing, price *int64, viewerIsSeller bool, now time.Time) (*PriceReference, error) {
	cfg, err := s.LoadConfig(ctx)
	if err != nil {
		return nil, err
	}
	ref := &PriceReference{ViewerRole: "BUYER", PriceLabel: "LISTING_PRICE", Price: price}
	if viewerIsSeller {
		ref.ViewerRole, ref.PriceLabel = "SELLER", "YOUR_PRICE"
	}
	if l.Variant == nil {
		ref.NewPrice = NewPriceResult{Status: pricing.StatusNoData, MissingFields: []string{"variant"}, Sources: []StoreSource{}}
		ref.UsedPrice = UsedPriceResult{Status: pricing.StatusNoData, MinTransactions: cfg.MinTransactions,
			DataSource: "SIMULATED", MissingCriteria: []string{"APPEARANCE", "FUNCTIONALITY", "BATTERY"}}
		return ref, nil
	}

	if ref.NewPrice, err = s.newPrice(ctx, l.Variant, now, cfg); err != nil {
		return nil, err
	}
	used, rangeRes, err := s.usedPrice(ctx, l, now, cfg)
	if err != nil {
		return nil, err
	}
	ref.UsedPrice = used

	ev := pricing.Evaluate(price, rangeRes, cfg)
	ref.PositionLabel, ref.ShowReviewPrompt, ref.ReviewDirection = ev.Position, ev.ShowReviewPrompt, ev.ReviewDirection
	if price != nil && ref.NewPrice.LowerPrice != nil {
		p := pricing.PositionOf(*price, *ref.NewPrice.LowerPrice, *ref.NewPrice.UpperPrice)
		ref.NewPricePosition = &p
	}
	return ref, nil
}

func (s *Store) newPrice(ctx context.Context, v *Variant, now time.Time, cfg pricing.Config) (NewPriceResult, error) {
	// Báo giá của mọi phiên bản cùng model + dung lượng + RAM; màu của báo giá lấy theo phiên bản
	// nếu cửa hàng không ghi màu riêng. pricing.NewPrice chọn đúng màu của máy đang xét.
	rows, err := s.pool.Query(ctx, `SELECT q.source_id, src.retailer_name, coalesce(q.color, pv.color), q.price,
			q.in_stock, q.status, q.url, q.verified_at
		FROM store_price_quotes q
		JOIN store_sources src ON src.id = q.source_id AND src.active
		JOIN phone_variants pv ON pv.id = q.variant_id
		JOIN phone_variants me ON me.id = $1
		WHERE pv.model_id = me.model_id AND pv.storage_gb = me.storage_gb
		  AND coalesce(pv.ram_gb, 0) = coalesce(me.ram_gb, 0)`, v.ID)
	if err != nil {
		return NewPriceResult{}, err
	}
	defer rows.Close()
	var quotes []pricing.StoreQuote
	info := map[string]StoreSource{}
	for rows.Next() {
		var q pricing.StoreQuote
		var name, status, url string
		if err := rows.Scan(&q.SourceID, &name, &q.Color, &q.Price, &q.InStock, &status, &url, &q.VerifiedAt); err != nil {
			return NewPriceResult{}, err
		}
		q.Suspended = status == "SUSPENDED"
		quotes = append(quotes, q)
		info[q.SourceID] = StoreSource{Retailer: name, URL: url}
	}
	if err := rows.Err(); err != nil {
		return NewPriceResult{}, err
	}
	r := pricing.NewPrice(quotes, v.Color, now, cfg)
	out := NewPriceResult{Status: r.Status, Sources: []StoreSource{}}
	if r.Status != pricing.StatusNoData {
		out.LowerPrice, out.UpperPrice = &r.Lower, &r.Upper
	}
	for _, q := range r.Sources {
		src := info[q.SourceID]
		src.Price, src.Color, src.VerifiedAt = q.Price, q.Color, q.VerifiedAt
		out.Sources = append(out.Sources, src)
	}
	return out, nil
}

// usedPrice: nhóm máy = cùng model + dung lượng + RAM (mọi màu) và cùng conditionKey.
// Không trộn REAL với SIMULATED: có giao dịch REAL đủ điều kiện thì dùng REAL, không thì SIMULATED.
func (s *Store) usedPrice(ctx context.Context, l *Listing, now time.Time, cfg pricing.Config) (UsedPriceResult, pricing.UsedRangeResult, error) {
	out := UsedPriceResult{MinTransactions: cfg.MinTransactions, Group: Group{VariantID: l.Variant.ID, ConditionKey: l.Condition.ConditionKey}}
	if l.Condition.ConditionKey == nil {
		out.Status, out.DataSource = pricing.StatusNoData, "SIMULATED"
		_, out.MissingCriteria = conditionOf(l).Key()
		return out, pricing.UsedRangeResult{Status: pricing.StatusNoData}, nil
	}
	oldest := now.AddDate(0, -cfg.WindowsMonths[len(cfg.WindowsMonths)-1], 0)
	rows, err := s.pool.Query(ctx, `SELECT rt.id, rt.actual_price, rt.transaction_date, rt.data_source
		FROM reference_transactions rt
		JOIN phone_variants pv ON pv.id = rt.variant_id
		JOIN phone_variants me ON me.id = $1
		WHERE pv.model_id = me.model_id AND pv.storage_gb = me.storage_gb
		  AND coalesce(pv.ram_gb, 0) = coalesce(me.ram_gb, 0)
		  AND rt.condition_key = $2 AND rt.status = 'ELIGIBLE'
		  AND rt.transaction_date >= $3::date`, l.Variant.ID, *l.Condition.ConditionKey, oldest)
	if err != nil {
		return out, pricing.UsedRangeResult{}, err
	}
	defer rows.Close()
	bySource := map[string][]pricing.Transaction{}
	for rows.Next() {
		var t pricing.Transaction
		var src string
		if err := rows.Scan(&t.ID, &t.Price, &t.Date, &src); err != nil {
			return out, pricing.UsedRangeResult{}, err
		}
		bySource[src] = append(bySource[src], t)
	}
	if err := rows.Err(); err != nil {
		return out, pricing.UsedRangeResult{}, err
	}
	out.DataSource = "SIMULATED"
	if len(bySource["REAL"]) > 0 {
		out.DataSource = "REAL"
	}

	r := pricing.UsedRange(bySource[out.DataSource], now, cfg)
	out.Status, out.TransactionCount = r.Status, r.TransactionCount
	if r.WindowMonths > 0 {
		out.LowerPrice, out.UpperPrice = &r.Lower, &r.Upper
		w := r.WindowMonths
		out.WindowMonths = &w
		start, end := r.PeriodStart.Format(time.DateOnly), r.PeriodEnd.Format(time.DateOnly)
		out.PeriodStart, out.PeriodEnd = &start, &end
		id, err := s.ensureVersion(ctx, l.Variant.ID, *l.Condition.ConditionKey, out.DataSource, r, now)
		if err != nil {
			return out, r, err
		}
		out.VersionID = &id
	}
	return out, r, nil
}

func conditionOf(l *Listing) pricing.Condition {
	c := pricing.Condition{Battery: pricing.BucketFromPct(l.Condition.BatteryHealthPct)}
	if l.Condition.Appearance != nil {
		c.Appearance = pricing.Appearance(*l.Condition.Appearance)
	}
	if l.Condition.Functionality != nil {
		c.Functionality = pricing.Functionality(*l.Condition.Functionality)
	}
	if c.Battery == pricing.BatteryUnknown && l.Condition.BatteryBucket != nil {
		c.Battery = pricing.BatteryBucket(*l.Condition.BatteryBucket)
	}
	return c
}

// ensureVersion trả id của price_range_versions đang công bố cho nhóm; tạo bản mới khi kết quả
// hoặc tập giao dịch thành viên thay đổi, để luôn truy ngược được dải giá tính từ giao dịch nào.
func (s *Store) ensureVersion(ctx context.Context, variantID, condKey, source string, r pricing.UsedRangeResult, now time.Time) (string, error) {
	var id string
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		// Khóa theo nhóm: nhiều request cùng tính một nhóm máy chỉ tạo một phiên bản.
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, variantID+"|"+condKey+"|"+source); err != nil {
			return err
		}
		err := tx.QueryRow(ctx, `SELECT v.id FROM price_range_versions v
			WHERE v.variant_id = $1 AND v.condition_key = $2 AND v.data_source = $3 AND v.is_current
			  AND v.result = $4 AND v.p10 = $5 AND v.p90 = $6 AND v.window_months = $7 AND v.transaction_count = $8
			  AND (SELECT array_agg(reference_transaction_id ORDER BY reference_transaction_id) FROM price_range_members WHERE version_id = v.id)
			      = (SELECT array_agg(x ORDER BY x) FROM unnest($9::uuid[]) x)`,
			variantID, condKey, source, r.Status, r.Lower, r.Upper, r.WindowMonths, r.TransactionCount, r.MemberIDs).Scan(&id)
		if err == nil || !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE price_range_versions SET is_current = false
			WHERE variant_id = $1 AND condition_key = $2 AND data_source = $3 AND is_current`, variantID, condKey, source); err != nil {
			return err
		}
		if err := tx.QueryRow(ctx, `INSERT INTO price_range_versions (variant_id, condition_key, data_source, result,
			window_months, transaction_count, p10, p90, period_start, period_end, is_current, computed_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11) RETURNING id`,
			variantID, condKey, source, r.Status, r.WindowMonths, r.TransactionCount, r.Lower, r.Upper,
			r.PeriodStart, r.PeriodEnd, now).Scan(&id); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `INSERT INTO price_range_members (version_id, reference_transaction_id)
			SELECT $1, unnest($2::uuid[])`, id, r.MemberIDs)
		return err
	})
	return id, err
}

type RangePrice struct {
	Price           int64  `json:"price"`
	TransactionDate string `json:"transactionDate"`
}

type RangeVersion struct {
	ID               string       `json:"id"`
	VariantID        string       `json:"variantId"`
	ConditionKey     string       `json:"conditionKey"`
	DataSource       string       `json:"dataSource"`
	Result           string       `json:"result"`
	WindowMonths     *int         `json:"windowMonths"`
	TransactionCount int          `json:"transactionCount"`
	P10              *int64       `json:"p10"`
	P90              *int64       `json:"p90"`
	PeriodStart      *string      `json:"periodStart"`
	PeriodEnd        *string      `json:"periodEnd"`
	IsCurrent        bool         `json:"isCurrent"`
	ComputedAt       time.Time    `json:"computedAt"`
	Prices           []RangePrice `json:"prices"`
}

// PriceRange trả một phiên bản dải giá và các giá chốt đã dùng (không có thông tin người mua/bán).
func (s *Store) PriceRange(ctx context.Context, id string) (*RangeVersion, error) {
	var v RangeVersion
	err := s.pool.QueryRow(ctx, `SELECT id, variant_id, condition_key, data_source, result, window_months, transaction_count,
		p10, p90, to_char(period_start,'YYYY-MM-DD'), to_char(period_end,'YYYY-MM-DD'), is_current, computed_at
		FROM price_range_versions WHERE id = $1`, id).Scan(&v.ID, &v.VariantID, &v.ConditionKey, &v.DataSource, &v.Result,
		&v.WindowMonths, &v.TransactionCount, &v.P10, &v.P90, &v.PeriodStart, &v.PeriodEnd, &v.IsCurrent, &v.ComputedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `SELECT rt.actual_price, to_char(rt.transaction_date,'YYYY-MM-DD')
		FROM price_range_members m JOIN reference_transactions rt ON rt.id = m.reference_transaction_id
		WHERE m.version_id = $1 ORDER BY rt.actual_price, rt.transaction_date`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	v.Prices = []RangePrice{}
	for rows.Next() {
		var p RangePrice
		if err := rows.Scan(&p.Price, &p.TransactionDate); err != nil {
			return nil, err
		}
		v.Prices = append(v.Prices, p)
	}
	return &v, rows.Err()
}

// PreviewInput là máy người bán đang khai ở bước nhập giá, khi tin chưa được lưu.
type PreviewInput struct {
	Variant   VariantSpec    `json:"variant"`
	Condition ConditionInput `json:"condition"`
	Price     *int64         `json:"price"`
}

// PreviewReference tính giá tham khảo cho máy đang khai (nhãn "Giá bạn nhập"), không ghi tin.
func (s *Store) PreviewReference(ctx context.Context, in PreviewInput, now time.Time) (*PriceReference, error) {
	vid, err := resolveVariant(ctx, s.pool, in.Variant, false)
	if err != nil {
		return nil, err
	}
	c := in.Condition
	l := &Listing{Variant: &Variant{ID: vid, Color: normalizeColor(in.Variant.Color)}}
	l.Condition.Appearance, l.Condition.Functionality, l.Condition.BatteryHealthPct = c.Appearance, c.Functionality, c.BatteryHealthPct
	if key, _ := conditionOf(l).Key(); key != "" {
		l.Condition.ConditionKey = &key
	}
	return s.ReferencePrice(ctx, l, in.Price, true, now)
}
