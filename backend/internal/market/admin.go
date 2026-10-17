package market

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"reprice/internal/apperr"
	"reprice/internal/pricing"
)

// ---------------------------------------------------------------- danh sách giao dịch tham chiếu

type RefFilter struct {
	Status, DataSource, Flag, ClusterID, VariantID, ConditionKey, From, To, Q string
	Page, PageSize                                                            int
}

type RefTransaction struct {
	ID              string     `json:"id"`
	OrderItemID     *string    `json:"orderItemId"`
	OrderID         *string    `json:"orderId"`
	OrderCode       *string    `json:"orderCode"`
	Variant         Variant    `json:"variant"`
	ConditionKey    *string    `json:"conditionKey"`
	DataSource      string     `json:"dataSource"`
	Status          string     `json:"status"`
	ActualPrice     int64      `json:"actualPrice"`
	TransactionDate string     `json:"transactionDate"`
	EligibleAt      *time.Time `json:"eligibleAt"`
	ClusterID       *string    `json:"clusterId"`
	ClusterSize     int        `json:"clusterSize"`
	OpenFlags       []string   `json:"openFlags"`
	InCurrentRange  bool       `json:"inCurrentRange"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

const refSelect = `SELECT rt.id, rt.order_item_id, o.id, o.code,
	v.id, v.model_id, m.brand, m.name, v.storage_gb, v.ram_gb, v.color,
	rt.condition_key, rt.data_source, rt.status, rt.actual_price, to_char(rt.transaction_date, 'YYYY-MM-DD'),
	rt.eligible_at, rt.cluster_id,
	(SELECT count(*) FROM reference_transactions c WHERE c.cluster_id = rt.cluster_id),
	coalesce((SELECT array_agg(f.code ORDER BY f.code) FROM suspicion_flags f WHERE f.reference_transaction_id = rt.id AND f.status = 'OPEN'), '{}'),
	EXISTS (SELECT 1 FROM price_range_members pm JOIN price_range_versions pv ON pv.id = pm.version_id
		WHERE pm.reference_transaction_id = rt.id AND pv.is_current),
	rt.updated_at
FROM reference_transactions rt
JOIN phone_variants v ON v.id = rt.variant_id
JOIN phone_models m ON m.id = v.model_id
LEFT JOIN order_items i ON i.id = rt.order_item_id
LEFT JOIN orders o ON o.id = i.order_id`

func scanRef(row pgx.Row) (*RefTransaction, error) {
	var t RefTransaction
	err := row.Scan(&t.ID, &t.OrderItemID, &t.OrderID, &t.OrderCode,
		&t.Variant.ID, &t.Variant.ModelID, &t.Variant.Brand, &t.Variant.ModelName, &t.Variant.StorageGB, &t.Variant.RAMGB, &t.Variant.Color,
		&t.ConditionKey, &t.DataSource, &t.Status, &t.ActualPrice, &t.TransactionDate, &t.EligibleAt, &t.ClusterID,
		&t.ClusterSize, &t.OpenFlags, &t.InCurrentRange, &t.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(apperr.NotFound, "Không tìm thấy giao dịch tham chiếu.")
	}
	return &t, err
}

func (s *Store) ListReferenceTransactions(ctx context.Context, f RefFilter) ([]*RefTransaction, int, error) {
	where := []string{"true"}
	var args []any
	add := func(cond string, v any) {
		args = append(args, v)
		where = append(where, fmt.Sprintf(cond, len(args)))
	}
	if f.Status != "" {
		add("rt.status = $%d", f.Status)
	}
	if f.DataSource != "" {
		add("rt.data_source = $%d", f.DataSource)
	}
	if f.Flag != "" {
		add("EXISTS (SELECT 1 FROM suspicion_flags f WHERE f.reference_transaction_id = rt.id AND f.code = $%d)", f.Flag)
	}
	if f.ClusterID != "" {
		add("rt.cluster_id::text = $%d", f.ClusterID)
	}
	if f.VariantID != "" {
		add("rt.variant_id::text = $%d", f.VariantID)
	}
	if f.ConditionKey != "" {
		add("rt.condition_key = $%d", f.ConditionKey)
	}
	if f.From != "" {
		add("rt.transaction_date >= $%d::date", f.From)
	}
	if f.To != "" {
		add("rt.transaction_date <= $%d::date", f.To)
	}
	if q := strings.TrimSpace(f.Q); q != "" {
		add("(o.code ILIKE '%%' || $%d || '%%' OR rt.id::text LIKE $%[1]d || '%%' OR (m.name || ' ' || v.storage_gb || 'GB') ILIKE '%%' || $%[1]d || '%%')", q)
	}
	whereSQL := " WHERE " + strings.Join(where, " AND ")
	var total int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM reference_transactions rt
		JOIN phone_variants v ON v.id = rt.variant_id JOIN phone_models m ON m.id = v.model_id
		LEFT JOIN order_items i ON i.id = rt.order_item_id LEFT JOIN orders o ON o.id = i.order_id`+whereSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, f.PageSize, (f.Page-1)*f.PageSize)
	// Bản ghi cần QTV xem (chờ xác minh) lên trước, rồi mới nhất trước.
	rows, err := s.pool.Query(ctx, refSelect+whereSQL+fmt.Sprintf(` ORDER BY (rt.status = 'PENDING_VERIFICATION') DESC,
		rt.transaction_date DESC, rt.id LIMIT $%d OFFSET $%d`, len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []*RefTransaction{}
	for rows.Next() {
		t, err := scanRef(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, t)
	}
	return out, total, rows.Err()
}

// ---------------------------------------------------------------- chi tiết

type Flag struct {
	ID         string     `json:"id"`
	Code       string     `json:"code"`
	Evidence   string     `json:"evidence"`
	Status     string     `json:"status"`
	RaisedAt   time.Time  `json:"raisedAt"`
	ResolvedAt *time.Time `json:"resolvedAt"`
}

type Relation struct {
	OtherID      string `json:"otherId"`
	RelationType string `json:"relationType"`
	Basis        string `json:"basis"`
	OtherPrice   int64  `json:"otherPrice"`
	OtherStatus  string `json:"otherStatus"`
}

type Decision struct {
	Admin      string    `json:"admin"`
	Action     string    `json:"action"`
	Reason     string    `json:"reason"`
	FromStatus string    `json:"fromStatus"`
	ToStatus   string    `json:"toStatus"`
	At         time.Time `json:"at"`
}

type RefTransactionDetail struct {
	RefTransaction
	Snapshot       json.RawMessage `json:"snapshot"`
	Flags          []Flag          `json:"flags"`
	Relations      []Relation      `json:"relations"`
	Decisions      []Decision      `json:"decisions"`
	AllowedActions []string        `json:"allowedActions"`
}

// allowedRefActions theo state diagram dữ liệu tham chiếu (docs/state-diagrams.md mục 8).
func allowedRefActions(status string) []string {
	switch status {
	case "PENDING_VERIFICATION":
		return []string{"ALLOW", "KEEP_PENDING", "EXCLUDE"}
	case "PENDING_COMPLETION":
		return []string{"EXCLUDE"}
	case "ELIGIBLE":
		return []string{"KEEP_PENDING", "REVOKE", "REVOKE_RECALC"}
	}
	return []string{}
}

func (s *Store) GetReferenceTransaction(ctx context.Context, id string) (*RefTransactionDetail, error) {
	t, err := scanRef(s.pool.QueryRow(ctx, refSelect+` WHERE rt.id = $1`, id))
	if err != nil {
		return nil, err
	}
	d := &RefTransactionDetail{RefTransaction: *t, Flags: []Flag{}, Relations: []Relation{}, Decisions: []Decision{}}
	d.AllowedActions = allowedRefActions(t.Status)
	if t.OrderItemID != nil {
		if err := s.pool.QueryRow(ctx, `SELECT snapshot FROM order_items WHERE id = $1`, *t.OrderItemID).Scan(&d.Snapshot); err != nil {
			return nil, err
		}
	}
	rows, err := s.pool.Query(ctx, `SELECT id, code, evidence, status, raised_at, resolved_at FROM suspicion_flags
		WHERE reference_transaction_id = $1 ORDER BY raised_at`, id)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var f Flag
		if err := rows.Scan(&f.ID, &f.Code, &f.Evidence, &f.Status, &f.RaisedAt, &f.ResolvedAt); err != nil {
			rows.Close()
			return nil, err
		}
		d.Flags = append(d.Flags, f)
	}
	rows.Close()
	rows, err = s.pool.Query(ctx, `SELECT o.id, r.relation_type, r.basis, o.actual_price, o.status
		FROM transaction_relations r JOIN reference_transactions o ON o.id = CASE WHEN r.a_id = $1 THEN r.b_id ELSE r.a_id END
		WHERE r.a_id = $1 OR r.b_id = $1 ORDER BY r.relation_type, o.id`, id)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var r Relation
		if err := rows.Scan(&r.OtherID, &r.RelationType, &r.Basis, &r.OtherPrice, &r.OtherStatus); err != nil {
			rows.Close()
			return nil, err
		}
		d.Relations = append(d.Relations, r)
	}
	rows.Close()
	rows, err = s.pool.Query(ctx, `SELECT u.full_name, d.action, d.reason, d.from_status, d.to_status, d.created_at
		FROM reference_decisions d JOIN users u ON u.id = d.admin_id WHERE d.reference_transaction_id = $1 ORDER BY d.created_at`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var x Decision
		if err := rows.Scan(&x.Admin, &x.Action, &x.Reason, &x.FromStatus, &x.ToStatus, &x.At); err != nil {
			return nil, err
		}
		d.Decisions = append(d.Decisions, x)
	}
	return d, rows.Err()
}

// ---------------------------------------------------------------- quyết định của QTV

var decisionTarget = map[string]map[string]string{
	"ALLOW":         {"PENDING_VERIFICATION": "ELIGIBLE"},
	"KEEP_PENDING":  {"PENDING_VERIFICATION": "PENDING_VERIFICATION", "ELIGIBLE": "PENDING_VERIFICATION"},
	"EXCLUDE":       {"PENDING_VERIFICATION": "EXCLUDED", "PENDING_COMPLETION": "EXCLUDED"},
	"REVOKE":        {"ELIGIBLE": "REVOKED"},
	"REVOKE_RECALC": {"ELIGIBLE": "REVOKED"},
}

// Decide ghi quyết định của QTV (UC71). Không hủy đơn, không khóa tài khoản: chỉ đổi việc
// giao dịch có được dùng để tính giá hay không. Trả các dải giá được tính lại.
func (s *Store) Decide(ctx context.Context, id, adminID, action, reason string, now time.Time) ([]*RangeVersion, error) {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return nil, apperr.Field("reason", "Nhập lý do cho quyết định.")
	}
	targets, ok := decisionTarget[action]
	if !ok {
		return nil, apperr.Field("action", "Thao tác không hợp lệ.")
	}
	var group struct {
		variantID, source string
		condKey           *string
	}
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		var from string
		err := tx.QueryRow(ctx, `SELECT status, variant_id, condition_key, data_source FROM reference_transactions WHERE id = $1 FOR UPDATE`, id).
			Scan(&from, &group.variantID, &group.condKey, &group.source)
		if errors.Is(err, pgx.ErrNoRows) {
			return apperr.New(apperr.NotFound, "Không tìm thấy giao dịch tham chiếu.")
		}
		if err != nil {
			return err
		}
		to, ok := targets[from]
		if !ok {
			return apperr.New(apperr.InvalidState, fmt.Sprintf("Không thể %s giao dịch đang ở trạng thái %s.", action, from))
		}
		if action == "ALLOW" && group.condKey == nil {
			return apperr.New(apperr.InvalidState, "Giao dịch thiếu tiêu chí Condition Score, không thể đưa vào nhóm so sánh.")
		}
		var eligibleAt any
		if to == "ELIGIBLE" {
			eligibleAt = now
		}
		if _, err := tx.Exec(ctx, `UPDATE reference_transactions SET status = $2, eligible_at = coalesce($3, eligible_at), updated_at = $4 WHERE id = $1`,
			id, to, eligibleAt, now); err != nil {
			return err
		}
		flagStatus := map[string]string{"ALLOW": "CLEARED", "EXCLUDE": "CONFIRMED"}[action]
		if flagStatus != "" {
			if _, err := tx.Exec(ctx, `UPDATE suspicion_flags SET status = $2, resolved_at = $3 WHERE reference_transaction_id = $1 AND status = 'OPEN'`,
				id, flagStatus, now); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(ctx, `INSERT INTO reference_decisions (reference_transaction_id, admin_id, action, reason, from_status, to_status, created_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7)`, id, adminID, action, reason, from, to, now); err != nil {
			return err
		}
		return AuditLog(ctx, tx, now, adminID, "REFERENCE_"+action, "reference_transaction", id, reason,
			map[string]string{"status": from}, map[string]string{"status": to})
	})
	if err != nil || group.condKey == nil {
		return nil, err
	}
	// Nhóm máy bị ảnh hưởng được tính lại ngay để dải giá công bố khớp quyết định.
	v, err := s.RecalculateGroup(ctx, group.variantID, *group.condKey, group.source, now)
	if err != nil || v == nil {
		return nil, err
	}
	return []*RangeVersion{v}, nil
}

// AuditLog ghi nhật ký thao tác quản trị.
func AuditLog(ctx context.Context, tx pgx.Tx, now time.Time, adminID, action, entityType, entityID, reason string, before, after any) error {
	b, _ := json.Marshal(before)
	a, _ := json.Marshal(after)
	_, err := tx.Exec(ctx, `INSERT INTO admin_audit_logs (admin_id, action, entity_type, entity_id, reason, before, after, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, adminID, action, entityType, entityID, reason, b, a, now)
	return err
}

// RecalculateGroup tính lại dải GĐ2 của một nhóm máy và lưu phiên bản mới nếu kết quả đổi.
// Trả nil khi nhóm không còn đủ dữ liệu (không có dải để công bố).
func (s *Store) RecalculateGroup(ctx context.Context, variantID, condKey, source string, now time.Time) (*RangeVersion, error) {
	cfg, err := s.LoadConfig(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `SELECT rt.id, rt.actual_price, rt.transaction_date
		FROM reference_transactions rt
		JOIN phone_variants pv ON pv.id = rt.variant_id
		JOIN phone_variants me ON me.id = $1
		WHERE pv.model_id = me.model_id AND pv.storage_gb = me.storage_gb AND coalesce(pv.ram_gb, 0) = coalesce(me.ram_gb, 0)
		  AND rt.condition_key = $2 AND rt.data_source = $3 AND rt.status = 'ELIGIBLE'`, variantID, condKey, source)
	if err != nil {
		return nil, err
	}
	txns, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (pricing.Transaction, error) {
		var t pricing.Transaction
		err := r.Scan(&t.ID, &t.Price, &t.Date)
		return t, err
	})
	if err != nil {
		return nil, err
	}
	r := pricing.UsedRange(txns, now, cfg)
	if r.WindowMonths == 0 {
		// Không còn đủ dữ liệu: gỡ dải đang công bố của nhóm.
		_, err := s.pool.Exec(ctx, `UPDATE price_range_versions v SET is_current = false
			FROM phone_variants pv, phone_variants me
			WHERE v.variant_id = pv.id AND me.id = $1 AND pv.model_id = me.model_id AND pv.storage_gb = me.storage_gb
			  AND coalesce(pv.ram_gb, 0) = coalesce(me.ram_gb, 0) AND v.condition_key = $2 AND v.data_source = $3 AND v.is_current`,
			variantID, condKey, source)
		return nil, err
	}
	id, err := s.ensureVersion(ctx, variantID, condKey, source, r, now)
	if err != nil {
		return nil, err
	}
	return s.PriceRange(ctx, id)
}

// ---------------------------------------------------------------- cụm giao dịch

// RecomputeClusters dựng lại quan hệ giữa các giao dịch REAL (cùng đơn, cùng người mua, cùng
// người bán) và gán cluster_id theo thành phần liên thông. Quan hệ của dữ liệu SIMULATED do seed
// tạo được giữ nguyên. Cụm chỉ là quan hệ dữ liệu, không phải kết luận gian lận.
func (s *Store) RecomputeClusters(ctx context.Context) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('recompute_clusters'))`); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM transaction_relations r USING reference_transactions a, reference_transactions b
			WHERE r.a_id = a.id AND r.b_id = b.id AND a.data_source = 'REAL' AND b.data_source = 'REAL'`); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			WITH t AS (
				SELECT rt.id, o.id AS order_id, o.buyer_id, o.seller_id
				FROM reference_transactions rt JOIN order_items i ON i.id = rt.order_item_id JOIN orders o ON o.id = i.order_id
				WHERE rt.data_source = 'REAL' AND rt.status <> 'EXCLUDED')
			INSERT INTO transaction_relations (a_id, b_id, relation_type, basis)
			SELECT a.id, b.id, x.typ, x.basis FROM t a JOIN t b ON a.id < b.id
			CROSS JOIN LATERAL (VALUES
				('SAME_ORDER', a.order_id = b.order_id, 'Cùng đơn hàng'),
				('SAME_BUYER', a.buyer_id = b.buyer_id, 'Cùng người mua'),
				('SAME_SELLER', a.seller_id = b.seller_id, 'Cùng người bán')) AS x(typ, ok, basis)
			WHERE x.ok`); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `SELECT a_id::text, b_id::text FROM transaction_relations`)
		if err != nil {
			return err
		}
		parent := map[string]string{}
		var find func(string) string
		find = func(x string) string {
			if p, ok := parent[x]; ok && p != x {
				parent[x] = find(p)
				return parent[x]
			}
			parent[x] = x
			return x
		}
		for rows.Next() {
			var a, b string
			if err := rows.Scan(&a, &b); err != nil {
				rows.Close()
				return err
			}
			ra, rb := find(a), find(b)
			if ra != rb {
				// Gốc là id nhỏ nhất để cluster_id ổn định giữa các lần tính.
				if ra < rb {
					parent[rb] = ra
				} else {
					parent[ra] = rb
				}
			}
		}
		rows.Close()
		if _, err := tx.Exec(ctx, `UPDATE reference_transactions SET cluster_id = NULL WHERE cluster_id IS NOT NULL`); err != nil {
			return err
		}
		ids := make([]string, 0, len(parent))
		for id := range parent {
			ids = append(ids, id)
		}
		sort.Strings(ids)
		for _, id := range ids {
			if _, err := tx.Exec(ctx, `UPDATE reference_transactions SET cluster_id = $2 WHERE id = $1`, id, find(id)); err != nil {
				return err
			}
		}
		return nil
	})
}

// ---------------------------------------------------------------- cấu hình và dashboard

// PricingConfigView là cấu hình trả cho QTV; null = chưa thiết lập.
type PricingConfigView struct {
	MinTransactions         int        `json:"minTransactions"`
	WindowsMonths           []int      `json:"windowsMonths"`
	NewPriceMaxAgeHours     int        `json:"newPriceMaxAgeHours"`
	ZThreshold              *float64   `json:"zThreshold"`
	MaxSellerConcentration  *float64   `json:"maxSellerConcentration"`
	MaxClusterConcentration *float64   `json:"maxClusterConcentration"`
	MinIndependentBuyers    *int       `json:"minIndependentBuyers"`
	MinIndependentSellers   *int       `json:"minIndependentSellers"`
	UpdatedAt               *time.Time `json:"updatedAt"`
}

func (s *Store) PricingConfig(ctx context.Context) (*PricingConfigView, error) {
	cfg, err := s.LoadConfig(ctx)
	if err != nil {
		return nil, err
	}
	v := &PricingConfigView{MinTransactions: cfg.MinTransactions, WindowsMonths: cfg.WindowsMonths,
		NewPriceMaxAgeHours: int(cfg.NewPriceMaxAge / time.Hour), ZThreshold: cfg.ZThreshold}
	rows, err := s.pool.Query(ctx, `SELECT key, value FROM pricing_config WHERE value IS NOT NULL AND key IN
		('max_seller_concentration','max_cluster_concentration','min_independent_buyers','min_independent_sellers')`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var k string
		var raw []byte
		if err := rows.Scan(&k, &raw); err != nil {
			return nil, err
		}
		switch k {
		case "max_seller_concentration":
			_ = json.Unmarshal(raw, &v.MaxSellerConcentration)
		case "max_cluster_concentration":
			_ = json.Unmarshal(raw, &v.MaxClusterConcentration)
		case "min_independent_buyers":
			_ = json.Unmarshal(raw, &v.MinIndependentBuyers)
		case "min_independent_sellers":
			_ = json.Unmarshal(raw, &v.MinIndependentSellers)
		}
	}
	if err := s.pool.QueryRow(ctx, `SELECT max(updated_at) FROM pricing_config WHERE updated_by IS NOT NULL`).Scan(&v.UpdatedAt); err != nil {
		return nil, err
	}
	return v, rows.Err()
}

// SetZThreshold đặt ngưỡng Z (nil = chưa thiết lập: dải giá vẫn công bố, không hiện lời nhắc).
// Các ngưỡng độ tin cậy khác chưa được nhóm chốt nên chưa cho sửa (SPEC 5.4).
func (s *Store) SetZThreshold(ctx context.Context, adminID string, z *float64, reason string, now time.Time) error {
	if z != nil && (*z <= 0 || *z > 10) {
		return apperr.Field("zThreshold", "Ngưỡng Z phải lớn hơn 0 và không quá 10, hoặc để trống.")
	}
	if strings.TrimSpace(reason) == "" {
		return apperr.Field("reason", "Nhập lý do thay đổi cấu hình.")
	}
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		var before []byte
		if err := tx.QueryRow(ctx, `SELECT value FROM pricing_config WHERE key = 'z_threshold' FOR UPDATE`).Scan(&before); err != nil {
			return err
		}
		var val any
		if z != nil {
			b, _ := json.Marshal(*z)
			val = b
		}
		if _, err := tx.Exec(ctx, `UPDATE pricing_config SET value = $1, updated_by = $2, updated_at = $3 WHERE key = 'z_threshold'`, val, adminID, now); err != nil {
			return err
		}
		var beforeV, afterV any
		if before != nil {
			beforeV = json.RawMessage(before)
		}
		if z != nil {
			afterV = *z
		}
		return AuditLog(ctx, tx, now, adminID, "SET_Z_THRESHOLD", "pricing_config", "z_threshold", reason,
			map[string]any{"zThreshold": beforeV}, map[string]any{"zThreshold": afterV})
	})
}

type Dashboard struct {
	UsersTotal             int            `json:"usersTotal"`
	ActiveListings         int            `json:"activeListings"`
	OrdersByStatus         map[string]int `json:"ordersByStatus"`
	ReferenceByStatus      map[string]int `json:"referenceByStatus"`
	ReferenceBySource      map[string]int `json:"referenceBySource"`
	OpenFlags              int            `json:"openFlags"`
	Clusters               int            `json:"clusters"`
	CurrentRanges          []RangeSummary `json:"currentRanges"`
	StaleStoreQuotes       int            `json:"staleStoreQuotes"`
	UnconfiguredThresholds []string       `json:"unconfiguredThresholds"`
}

type RangeSummary struct {
	VersionID        string    `json:"versionId"`
	Title            string    `json:"title"`
	ConditionKey     string    `json:"conditionKey"`
	DataSource       string    `json:"dataSource"`
	P10              int64     `json:"p10"`
	P90              int64     `json:"p90"`
	TransactionCount int       `json:"transactionCount"`
	WindowMonths     int       `json:"windowMonths"`
	ComputedAt       time.Time `json:"computedAt"`
}

func countBy(ctx context.Context, s *Store, sql string) (map[string]int, error) {
	rows, err := s.pool.Query(ctx, sql)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	m := map[string]int{}
	for rows.Next() {
		var k string
		var n int
		if err := rows.Scan(&k, &n); err != nil {
			return nil, err
		}
		m[k] = n
	}
	return m, rows.Err()
}

func (s *Store) Dashboard(ctx context.Context, now time.Time) (*Dashboard, error) {
	d := &Dashboard{CurrentRanges: []RangeSummary{}}
	err := s.pool.QueryRow(ctx, `SELECT
		(SELECT count(*) FROM users),
		(SELECT count(*) FROM listings WHERE status = 'ACTIVE'),
		(SELECT count(*) FROM suspicion_flags WHERE status = 'OPEN'),
		(SELECT count(DISTINCT cluster_id) FROM reference_transactions WHERE cluster_id IS NOT NULL),
		(SELECT count(*) FROM store_price_quotes WHERE status = 'ACTIVE' AND verified_at < $1)`, now.Add(-24*time.Hour)).
		Scan(&d.UsersTotal, &d.ActiveListings, &d.OpenFlags, &d.Clusters, &d.StaleStoreQuotes)
	if err != nil {
		return nil, err
	}
	if d.OrdersByStatus, err = countBy(ctx, s, `SELECT status, count(*) FROM orders GROUP BY status`); err != nil {
		return nil, err
	}
	if d.ReferenceByStatus, err = countBy(ctx, s, `SELECT status, count(*) FROM reference_transactions GROUP BY status`); err != nil {
		return nil, err
	}
	if d.ReferenceBySource, err = countBy(ctx, s, `SELECT data_source, count(*) FROM reference_transactions GROUP BY data_source`); err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `SELECT v.id, m.name || ' ' || pv.storage_gb || 'GB', v.condition_key, v.data_source,
			v.p10, v.p90, v.transaction_count, v.window_months, v.computed_at
		FROM price_range_versions v JOIN phone_variants pv ON pv.id = v.variant_id JOIN phone_models m ON m.id = pv.model_id
		WHERE v.is_current AND v.p10 IS NOT NULL ORDER BY m.name, pv.storage_gb, v.condition_key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	seen := map[string]bool{}
	for rows.Next() {
		var r RangeSummary
		if err := rows.Scan(&r.VersionID, &r.Title, &r.ConditionKey, &r.DataSource, &r.P10, &r.P90, &r.TransactionCount, &r.WindowMonths, &r.ComputedAt); err != nil {
			return nil, err
		}
		// Một nhóm máy có thể có bản ghi theo nhiều màu: chỉ giữ một dòng mỗi nhóm.
		k := r.Title + "|" + r.ConditionKey + "|" + r.DataSource
		if !seen[k] {
			seen[k] = true
			d.CurrentRanges = append(d.CurrentRanges, r)
		}
	}
	cfg, err := s.PricingConfig(ctx)
	if err != nil {
		return nil, err
	}
	for name, unset := range map[string]bool{"zThreshold": cfg.ZThreshold == nil, "maxSellerConcentration": cfg.MaxSellerConcentration == nil,
		"maxClusterConcentration": cfg.MaxClusterConcentration == nil, "minIndependentBuyers": cfg.MinIndependentBuyers == nil,
		"minIndependentSellers": cfg.MinIndependentSellers == nil} {
		if unset {
			d.UnconfiguredThresholds = append(d.UnconfiguredThresholds, name)
		}
	}
	sort.Strings(d.UnconfiguredThresholds)
	return d, rows.Err()
}

// RecalculateAll tính lại dải giá của mọi nhóm máy có giao dịch đủ điều kiện (sau khi nạp dữ liệu demo).
func (s *Store) RecalculateAll(ctx context.Context, now time.Time) error {
	rows, err := s.pool.Query(ctx, `SELECT DISTINCT ON (pv.model_id, pv.storage_gb, coalesce(pv.ram_gb, 0), rt.condition_key, rt.data_source)
			rt.variant_id::text, rt.condition_key, rt.data_source
		FROM reference_transactions rt JOIN phone_variants pv ON pv.id = rt.variant_id
		WHERE rt.status = 'ELIGIBLE' AND rt.condition_key IS NOT NULL
		ORDER BY pv.model_id, pv.storage_gb, coalesce(pv.ram_gb, 0), rt.condition_key, rt.data_source, rt.variant_id`)
	if err != nil {
		return err
	}
	type group struct{ variant, key, source string }
	groups, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (group, error) {
		var g group
		err := r.Scan(&g.variant, &g.key, &g.source)
		return g, err
	})
	if err != nil {
		return err
	}
	for _, g := range groups {
		if _, err := s.RecalculateGroup(ctx, g.variant, g.key, g.source, now); err != nil {
			return err
		}
	}
	return nil
}
