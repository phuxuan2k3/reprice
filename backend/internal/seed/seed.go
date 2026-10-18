// Package seed nạp dữ liệu demo: tài khoản mẫu, danh mục, giá cửa hàng,
// fixture 42 giao dịch SIMULATED (docs/SPEC.md mục 7) và các tin đăng.
// Mọi dữ liệu ở đây là mô phỏng.
package seed

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"reprice/internal/auth"
	"reprice/internal/pricing"
)

// DemoPassword là mật khẩu của mọi tài khoản demo.
const DemoPassword = "demo1234"

// Các bảng nghiệp vụ, xóa sạch khi reset. pricing_config và system_clock được đặt lại riêng.
var businessTables = []string{
	"admin_audit_logs", "price_range_members", "price_range_versions", "transaction_relations",
	"reference_decisions", "suspicion_flags", "reference_transactions", "store_price_quotes", "store_sources",
	"refunds", "shipping_verifications", "shipment_events", "shipments", "resolutions", "evidence_files",
	"evidence", "case_events", "support_case_items", "support_cases", "reviews", "payouts", "payments",
	"order_status_history", "order_items", "orders", "negotiation_offers", "negotiations", "catalog_requests",
	"favorites", "listing_history", "listing_accessories", "listing_faults", "listing_photos", "listings",
	"phone_variants", "phone_models", "notifications", "users",
}

type demoUser struct {
	key, name, email, phone, province, ward string
	admin                                   bool
	rating                                  *float64
}

var users = []demoUser{
	{key: "buyer", name: "Nguyễn Minh", email: "buyer@reprice.demo", phone: "0909123456", province: "TP. Hồ Chí Minh", ward: "Phường Bến Nghé"},
	{key: "seller", name: "Trần Minh", email: "seller@reprice.demo", phone: "0908111222", province: "Hà Nội", ward: "Phường Cửa Nam", rating: f(4.8)},
	{key: "admin", name: "Vũ Lan", email: "admin@reprice.demo", phone: "0907222333", province: "Đà Nẵng", ward: "Phường Hải Châu", admin: true},
	{key: "s2", name: "Lê Hà", email: "leha@reprice.demo", phone: "0911000002", province: "TP. Hồ Chí Minh", ward: "Phường Tân Định", rating: f(4.6)},
	{key: "s3", name: "Phạm Quân", email: "phamquan@reprice.demo", phone: "0911000003", province: "Đà Nẵng", ward: "Phường Thạch Thang", rating: f(4.9)},
	{key: "s4", name: "Hoàng Vy", email: "hoangvy@reprice.demo", phone: "0911000004", province: "Hà Nội", ward: "Phường Láng", rating: f(4.7)},
	{key: "s5", name: "Mai Anh", email: "maianh@reprice.demo", phone: "0911000005", province: "Bình Dương", ward: "Phường Phú Cường", rating: f(4.5)},
}

type demoListing struct {
	seller, brand, model, color string
	storageGB                   int
	appearance                  pricing.Appearance
	battery, usageMonths        int
	price                       int64
	accessories                 []string
	warranty                    string
	description                 string
	minutesAgo                  int
}

// catalog là danh mục máy demo: model → dung lượng (GB) → màu. Wizard đăng tin chỉ cho chọn trong danh mục này.
var catalog = []struct {
	brand, model string
	storages     []int
	colors       []string
}{
	{"Apple", "iPhone 11", []int{64, 128, 256}, []string{"Đen", "Trắng", "Đỏ", "Tím"}},
	{"Apple", "iPhone 12", []int{64, 128, 256}, []string{"Đen", "Trắng", "Xanh dương"}},
	{"Apple", "iPhone 13", []int{128, 256, 512}, []string{"Đen", "Trắng", "Hồng", "Xanh dương"}},
	{"Apple", "iPhone 14", []int{128, 256, 512}, []string{"Đen", "Trắng", "Tím", "Xanh dương"}},
	{"Apple", "iPhone 15", []int{128, 256, 512}, []string{"Đen", "Hồng", "Xanh dương", "Vàng"}},
	{"Samsung", "Galaxy A54", []int{128, 256}, []string{"Đen", "Trắng", "Xanh"}},
	{"Samsung", "Galaxy S22", []int{128, 256}, []string{"Đen", "Trắng", "Xám"}},
	{"Samsung", "Galaxy S23", []int{256, 512}, []string{"Đen", "Kem", "Xanh"}},
	{"Xiaomi", "Redmi Note 13", []int{128, 256}, []string{"Đen", "Xanh"}},
	{"Xiaomi", "Xiaomi 13", []int{256}, []string{"Đen", "Trắng", "Xanh"}},
	{"OPPO", "OPPO A78", []int{128}, []string{"Đen", "Xanh"}},
	{"OPPO", "Reno 10", []int{256}, []string{"Xám", "Xanh lá"}},
	{"vivo", "vivo V29", []int{256}, []string{"Đen", "Đỏ"}},
	{"vivo", "vivo Y36", []int{128}, []string{"Đen", "Vàng"}},
}

// iPhone 13 128GB Đen, tình trạng Tốt, pin 80–89%: cùng nhóm với fixture, ba mức giá minh họa
// dưới / trong / trên dải 10–12 triệu.
var listings = []demoListing{
	{"seller", "Apple", "iPhone 13", "Đen", 128, pricing.AppearanceGood, 89, 12, 9_200_000, []string{"BOX", "CABLE"}, "STORE",
		"Máy còn zin, không tháo lắp, không sửa chữa. Pin 89%, vẫn mượt. Kèm hộp và cáp.", 125},
	{"s2", "Apple", "iPhone 13", "Đen", 128, pricing.AppearanceGood, 86, 14, 11_500_000, []string{"BOX", "CHARGER", "CABLE"}, "NONE",
		"Dùng kỹ, có ốp từ đầu. Viền có vài vết xước nhẹ khó thấy.", 240},
	{"s3", "Apple", "iPhone 13", "Đen", 128, pricing.AppearanceGood, 84, 16, 12_800_000, []string{"BOX", "CABLE", "CASE"}, "NONE",
		"Máy đẹp, tặng ốp lưng. Pin 84%.", 410},
	{"s2", "Apple", "iPhone 12", "Đen", 128, pricing.AppearanceGood, 84, 20, 6_850_000, []string{"CASE"}, "NONE",
		"Màn hình còn mới, viền xước nhẹ. Bán kèm ốp lưng.", 305},
	{"s3", "Apple", "iPhone 14", "Đen", 128, pricing.AppearanceExcellent, 93, 6, 11_900_000, []string{"BOX", "CHARGER", "CABLE", "EARPHONES"}, "BRAND",
		"Chính hãng VN, còn bảo hành. Như mới, không trầy xước.", 65},
	{"s4", "Samsung", "Galaxy S23", "Xanh", 256, pricing.AppearanceGood, 91, 8, 13_450_000, []string{"BOX", "CHARGER"}, "STORE",
		"Máy đẹp, pin 91%, kèm sạc nguyên bản.", 1520},
	{"s5", "Xiaomi", "Xiaomi 13", "Đen", 256, pricing.AppearanceExcellent, 92, 7, 10_200_000, []string{"BOX", "OTHER"}, "BRAND",
		"Full box, có hóa đơn mua hàng.", 4350},
	{"s2", "Apple", "iPhone 11", "Trắng", 128, pricing.AppearanceFair, 79, 30, 4_350_000, nil, "NONE",
		"Máy có vết xước rõ ở lưng, chức năng đầy đủ.", 15200},
}

// fixturePrices: 42 giá cho P10 = 10tr, P90 = 12tr (web/src/data/demoFixture.js).
func fixturePrices() []int64 {
	p := []int64{8_900_000, 9_200_000, 9_500_000, 9_800_000, 10_000_000, 10_000_000}
	for i := 0; i < 30; i++ {
		p = append(p, 10_100_000+int64(i)*60_000)
	}
	return append(p, 12_000_000, 12_000_000, 12_200_000, 12_400_000, 12_600_000, 12_800_000)
}

// iphone15Prices: 40 giá cho iPhone 15 256GB tình trạng Tốt, pin 80–89% (P10 ≈ 14tr, P90 ≈ 15,9tr),
// để demo đăng tin iPhone 15 có đủ giao dịch ra dải giá.
func iphone15Prices() []int64 {
	p := []int64{12_900_000, 13_300_000, 13_600_000, 13_800_000}
	for i := 0; i < 32; i++ {
		p = append(p, 14_000_000+int64(i)*60_000)
	}
	return append(p, 16_000_000, 16_200_000, 16_500_000, 16_900_000)
}

// Reset xóa dữ liệu nghiệp vụ và nạp lại bộ demo. now là giờ hệ thống (đã cộng độ lệch).
func Reset(ctx context.Context, pool *pgxpool.Pool, now time.Time) error {
	hash, err := auth.HashPassword(DemoPassword)
	if err != nil {
		return err
	}
	return pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		// Gỡ tham chiếu tới tài khoản trước khi xóa users, rồi đưa các ngưỡng chưa chốt về "chưa thiết lập".
		if _, err := tx.Exec(ctx, `UPDATE pricing_config SET updated_by = NULL,
			value = CASE WHEN key IN ('z_threshold','max_seller_concentration','max_cluster_concentration',
				'min_independent_buyers','min_independent_sellers') THEN NULL ELSE value END`); err != nil {
			return err
		}
		for _, t := range businessTables {
			if _, err := tx.Exec(ctx, "DELETE FROM "+t); err != nil {
				return fmt.Errorf("clear %s: %w", t, err)
			}
		}
		s := &seeder{tx: tx, now: now, userIDs: map[string]string{}, variantIDs: map[string]string{}}
		for _, u := range users {
			if err := s.user(ctx, u, hash); err != nil {
				return err
			}
		}
		for _, c := range catalog {
			for _, st := range c.storages {
				for _, col := range c.colors {
					if _, err := s.variant(ctx, c.brand, c.model, st, col); err != nil {
						return err
					}
				}
			}
		}
		for _, l := range listings {
			if err := s.listing(ctx, l); err != nil {
				return err
			}
		}
		if err := s.storeQuotes(ctx); err != nil {
			return err
		}
		return s.fixture(ctx)
	})
}

// IsEmpty cho biết DB chưa có tài khoản nào (lần chạy đầu).
func IsEmpty(ctx context.Context, pool *pgxpool.Pool) (bool, error) {
	var n int
	err := pool.QueryRow(ctx, `SELECT count(*) FROM users`).Scan(&n)
	return n == 0, err
}

type seeder struct {
	tx         pgx.Tx
	now        time.Time
	userIDs    map[string]string
	variantIDs map[string]string // brand|model|storage|color
}

func (s *seeder) user(ctx context.Context, u demoUser, hash string) error {
	var id string
	err := s.tx.QueryRow(ctx, `INSERT INTO users (full_name, email, phone, password_hash, province, ward, is_admin, seller_rating, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
		u.name, u.email, u.phone, hash, u.province, u.ward, u.admin, u.rating, s.now.AddDate(-1, 0, 0)).Scan(&id)
	s.userIDs[u.key] = id
	return err
}

func (s *seeder) variant(ctx context.Context, brand, model string, storageGB int, color string) (string, error) {
	key := fmt.Sprintf("%s|%s|%d|%s", brand, model, storageGB, color)
	if id, ok := s.variantIDs[key]; ok {
		return id, nil
	}
	var modelID string
	err := s.tx.QueryRow(ctx, `INSERT INTO phone_models (brand, name) VALUES ($1,$2)
		ON CONFLICT (brand, name) DO UPDATE SET name = EXCLUDED.name RETURNING id`, brand, model).Scan(&modelID)
	if err != nil {
		return "", err
	}
	var id string
	err = s.tx.QueryRow(ctx, `INSERT INTO phone_variants (model_id, storage_gb, color) VALUES ($1,$2,$3) RETURNING id`,
		modelID, storageGB, color).Scan(&id)
	s.variantIDs[key] = id
	return id, err
}

func (s *seeder) listing(ctx context.Context, l demoListing) error {
	vid, err := s.variant(ctx, l.brand, l.model, l.storageGB, l.color)
	if err != nil {
		return err
	}
	battery := l.battery
	cond := pricing.Condition{Appearance: l.appearance, Functionality: pricing.FunctionalityFull, Battery: pricing.BucketFromPct(&battery)}
	key, _ := cond.Key()
	published := s.now.Add(-time.Duration(l.minutesAgo) * time.Minute)
	sellerID := s.userIDs[l.seller]
	var province, ward string
	for _, u := range users {
		if u.key == l.seller {
			province, ward = u.province, u.ward
		}
	}
	var warrantyUntil *time.Time
	if l.warranty == "BRAND" || l.warranty == "STORE" {
		t := s.now.AddDate(0, 3, 0)
		warrantyUntil = &t
	}
	var id string
	err = s.tx.QueryRow(ctx, `INSERT INTO listings (seller_id, variant_id, price, status, appearance, functionality,
		battery_health_pct, battery_bucket, condition_key, network_lock, usage_months, warranty_type, warranty_until,
		description, province, ward, draft_step, published_at, created_at, updated_at)
		VALUES ($1,$2,$3,'ACTIVE',$4,'FULL',$5,$6,$7,'UNLOCKED',$8,$9,$10,$11,$12,$13,5,$14,$14,$14) RETURNING id`,
		sellerID, vid, l.price, l.appearance, l.battery, cond.Battery, key, l.usageMonths, l.warranty, warrantyUntil,
		l.description, province, ward, published).Scan(&id)
	if err != nil {
		return err
	}
	for _, a := range l.accessories {
		if _, err := s.tx.Exec(ctx, `INSERT INTO listing_accessories (listing_id, type) VALUES ($1,$2)`, id, a); err != nil {
			return err
		}
	}
	return nil
}

// storeQuotes: GĐ1 cho iPhone 13 128GB Đen là 13–14 triệu từ ba chuỗi; iPhone 15 256GB mọi màu
// 19,99–20,79 triệu từ ba chuỗi; vài model khác có một nguồn.
func (s *seeder) storeQuotes(ctx context.Context) error {
	chains := []struct{ name, site string }{
		{"Cửa hàng A (mô phỏng)", "https://example.com/a"},
		{"Cửa hàng B (mô phỏng)", "https://example.com/b"},
		{"Cửa hàng C (mô phỏng)", "https://example.com/c"},
	}
	src := make([]string, len(chains))
	for i, c := range chains {
		if err := s.tx.QueryRow(ctx, `INSERT INTO store_sources (retailer_name, website) VALUES ($1,$2) RETURNING id`,
			c.name, c.site).Scan(&src[i]); err != nil {
			return err
		}
	}
	type quote struct {
		variant string
		source  int
		price   int64
	}
	quotes := []quote{
		{"Apple|iPhone 13|128|Đen", 0, 13_000_000},
		{"Apple|iPhone 13|128|Đen", 1, 13_500_000},
		{"Apple|iPhone 13|128|Đen", 2, 14_000_000},
		{"Apple|iPhone 14|128|Đen", 0, 16_490_000},
		{"Samsung|Galaxy S23|256|Xanh", 1, 18_990_000},
	}
	for _, color := range []string{"Đen", "Hồng", "Xanh dương", "Vàng"} {
		v := "Apple|iPhone 15|256|" + color
		quotes = append(quotes, quote{v, 0, 19_990_000}, quote{v, 1, 20_490_000}, quote{v, 2, 20_790_000})
	}
	verified := s.now.Add(-2 * time.Hour)
	for _, q := range quotes {
		if _, err := s.tx.Exec(ctx, `INSERT INTO store_price_quotes (source_id, variant_id, price, in_stock, url, verified_at)
			VALUES ($1,$2,$3,true,$4,$5)`, src[q.source], s.variantIDs[q.variant], q.price, chains[q.source].site, verified); err != nil {
			return err
		}
	}
	return nil
}

// eligible ghi các giao dịch SIMULATED, ELIGIBLE cho một phiên bản, nhóm GOOD|FULL|FROM_80_TO_89,
// giao dịch thứ i cách đây 2i+4 ngày (nằm trong cửa sổ 3 tháng, đã qua 3 ngày kiểm tra).
func (s *seeder) eligible(ctx context.Context, variant string, prices []int64) ([]string, error) {
	vid := s.variantIDs[variant]
	battery := 85
	key, _ := pricing.Condition{Appearance: pricing.AppearanceGood, Functionality: pricing.FunctionalityFull,
		Battery: pricing.BucketFromPct(&battery)}.Key()
	ids := make([]string, 0, len(prices))
	for i, p := range prices {
		date := s.now.AddDate(0, 0, -(i*2 + 4))
		var id string
		if err := s.tx.QueryRow(ctx, `INSERT INTO reference_transactions (variant_id, condition_key, data_source, status,
			actual_price, transaction_date, eligible_at, updated_at) VALUES ($1,$2,'SIMULATED','ELIGIBLE',$3,$4,$5,$5) RETURNING id`,
			vid, key, p, date, date.Add(72*time.Hour)).Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

// fixture: 42 giao dịch iPhone 13 128GB Đen (dải 10–12tr, kèm giao dịch chờ xác minh và cụm),
// và 40 giao dịch iPhone 15 256GB Đen.
func (s *seeder) fixture(ctx context.Context) error {
	if _, err := s.eligible(ctx, "Apple|iPhone 15|256|Đen", iphone15Prices()); err != nil {
		return err
	}
	ids, err := s.eligible(ctx, "Apple|iPhone 13|128|Đen", fixturePrices())
	if err != nil {
		return err
	}
	vid := s.variantIDs["Apple|iPhone 13|128|Đen"]
	battery := 85
	key, _ := pricing.Condition{Appearance: pricing.AppearanceGood, Functionality: pricing.FunctionalityFull,
		Battery: pricing.BucketFromPct(&battery)}.Key()

	// Ba giao dịch cùng nhóm đang chờ QTV xác minh, để demo màn quản trị dữ liệu tham chiếu.
	// Chúng không nằm trong 42 giao dịch của dải 10–12 triệu cho đến khi QTV cho phép.
	pending := []struct {
		price    int64
		daysAgo  int
		flag     string
		evidence string
	}{
		{13_900_000, 6, "BUYER_SELLER_SAME_SUBJECT", "Người mua và người bán dùng chung số điện thoại và địa chỉ nhận hàng (mô phỏng)."},
		{10_600_000, 9, "PAYMENT_DELIVERY_CONTRADICTION", "Đơn ghi đã thu COD nhưng vận đơn có sự kiện hoàn hàng (mô phỏng)."},
		{8_200_000, 12, "SNAPSHOT_MISSING_OR_INCONSISTENT", "Ảnh lúc giao cho thấy máy có vết nứt, khác tình trạng khai báo (mô phỏng)."},
	}
	for _, p := range pending {
		date := s.now.AddDate(0, 0, -p.daysAgo)
		var id string
		if err := s.tx.QueryRow(ctx, `INSERT INTO reference_transactions (variant_id, condition_key, data_source, status,
			actual_price, transaction_date, updated_at) VALUES ($1,$2,'SIMULATED','PENDING_VERIFICATION',$3,$4,$5) RETURNING id`,
			vid, key, p.price, date, s.now).Scan(&id); err != nil {
			return err
		}
		if _, err := s.tx.Exec(ctx, `INSERT INTO suspicion_flags (reference_transaction_id, code, evidence, raised_at)
			VALUES ($1,$2,$3,$4)`, id, p.flag, p.evidence, s.now); err != nil {
			return err
		}
		ids = append(ids, id)
	}
	// Cụm: giao dịch nghi cùng chủ thể có liên hệ với hai giao dịch trong fixture qua cùng người bán.
	suspect := ids[len(ids)-3]
	for _, other := range ids[:2] {
		a, b := suspect, other
		if b < a {
			a, b = b, a
		}
		if _, err := s.tx.Exec(ctx, `INSERT INTO transaction_relations (a_id, b_id, relation_type, basis)
			VALUES ($1,$2,'SAME_SELLER','Cùng tài khoản người bán (mô phỏng)')`, a, b); err != nil {
			return err
		}
	}
	return nil
}

func f(v float64) *float64 { return &v }
