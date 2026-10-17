package pricing

import (
	"fmt"
	"testing"
	"time"
)

var now = time.Date(2026, 10, 15, 12, 0, 0, 0, time.FixedZone("ICT", 7*3600))

func ptr[T any](v T) *T { return &v }

// fixturePrices là 42 giá của fixture demo (web/src/data/demoFixture.js): P10 = 10tr, P90 = 12tr.
func fixturePrices() []int64 {
	p := []int64{8_900_000, 9_200_000, 9_500_000, 9_800_000, 10_000_000, 10_000_000}
	for i := 0; i < 30; i++ {
		p = append(p, 10_100_000+int64(i)*60_000)
	}
	return append(p, 12_000_000, 12_000_000, 12_200_000, 12_400_000, 12_600_000, 12_800_000)
}

// txnsAt tạo n giao dịch cùng giá, ngày lùi daysAgo ngày so với now.
func txnsAt(n, daysAgo int, price int64) []Transaction {
	return spread(n, daysAgo, price, 0)
}

// spread tạo n giao dịch, giá tăng dần mỗi giao dịch thêm step.
func spread(n, daysAgo int, price, step int64) []Transaction {
	out := make([]Transaction, n)
	for i := range out {
		out[i] = Transaction{ID: fmt.Sprintf("d%d-%d", daysAgo, i), Price: price + int64(i)*step, Date: now.AddDate(0, 0, -daysAgo)}
	}
	return out
}

func fixtureRange(t *testing.T) UsedRangeResult {
	t.Helper()
	var txns []Transaction
	for i, p := range fixturePrices() {
		txns = append(txns, Transaction{ID: fmt.Sprint(i), Price: p, Date: now.AddDate(0, 0, -(i*2 + 1))})
	}
	r := UsedRange(txns, now, DefaultConfig())
	if r.Status != StatusRange {
		t.Fatalf("status = %s, want RANGE", r.Status)
	}
	return r
}

func TestType7(t *testing.T) {
	// Ví dụ trong tài liệu: n = 35, x4 = 10.7tr, x5 = 10.95tr, x31 = 12.2tr, x32 = 12.45tr.
	xs := make([]float64, 35)
	for i := range xs {
		xs[i] = float64(10_000_000 + i*10_000)
	}
	xs[3], xs[4] = 10_700_000, 10_950_000
	xs[30], xs[31] = 12_200_000, 12_450_000
	if got, _ := Type7(xs, 0.10); got != 10_800_000 {
		t.Errorf("P10 = %v, want 10800000", got)
	}
	if got, _ := Type7(xs, 0.90); got != 12_350_000 {
		t.Errorf("P90 = %v, want 12350000", got)
	}
	if _, ok := Type7(nil, 0.5); ok {
		t.Error("empty input must not be ok")
	}
	if got, _ := Type7([]float64{7}, 0.9); got != 7 {
		t.Errorf("single = %v", got)
	}
}

func TestFixtureGives10To12Million(t *testing.T) {
	r := fixtureRange(t)
	if r.Lower != 10_000_000 || r.Upper != 12_000_000 {
		t.Fatalf("range = %d–%d, want 10000000–12000000", r.Lower, r.Upper)
	}
	if r.TransactionCount != 42 || r.WindowMonths != 3 || len(r.MemberIDs) != 42 {
		t.Fatalf("count=%d window=%d members=%d", r.TransactionCount, r.WindowMonths, len(r.MemberIDs))
	}
}

func TestWindowSelection(t *testing.T) {
	cfg := DefaultConfig()
	cases := []struct {
		name                  string
		in3, in6, in12, older int
		wantStatus            ResultStatus
		wantWindow, wantCount int
	}{
		{"3 tháng đủ", 42, 0, 0, 0, StatusRange, 3, 42},
		{"6 tháng đủ", 21, 26, 0, 0, StatusRange, 6, 47},
		{"12 tháng đủ", 12, 16, 25, 0, StatusRange, 12, 53},
		{"12 tháng vẫn thiếu", 8, 11, 15, 50, StatusInsufficientData, 0, 34},
		{"không có giao dịch", 0, 0, 0, 0, StatusNoData, 0, 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var txns []Transaction
			txns = append(txns, spread(c.in3, 30, 10_000_000, 10_000)...)
			txns = append(txns, spread(c.in6, 120, 11_000_000, 10_000)...)
			txns = append(txns, spread(c.in12, 250, 12_000_000, 10_000)...)
			txns = append(txns, spread(c.older, 400, 9_000_000, 10_000)...)
			r := UsedRange(txns, now, cfg)
			if r.Status != c.wantStatus || r.WindowMonths != c.wantWindow || r.TransactionCount != c.wantCount {
				t.Fatalf("got status=%s window=%d count=%d", r.Status, r.WindowMonths, r.TransactionCount)
			}
		})
	}
}

func TestWindowBoundaryIsInclusive(t *testing.T) {
	cfg := DefaultConfig()
	start := now.AddDate(0, -3, 0)
	txns := txnsAt(34, 10, 10_000_000)
	txns = append(txns, Transaction{ID: "edge", Price: 10_000_000, Date: start})
	if r := UsedRange(txns, now, cfg); r.WindowMonths != 3 {
		t.Fatalf("giao dịch đúng biên phải được tính: window=%d count=%d", r.WindowMonths, r.TransactionCount)
	}
	txns[34].Date = start.Add(-time.Second)
	if r := UsedRange(txns, now, cfg); r.WindowMonths == 3 {
		t.Fatal("giao dịch trước biên không được tính vào cửa sổ 3 tháng")
	}
	future := append(txnsAt(34, 10, 10_000_000), Transaction{ID: "future", Price: 1, Date: now.Add(time.Hour)})
	if r := UsedRange(future, now, cfg); r.Status != StatusInsufficientData {
		t.Fatal("giao dịch sau now không được tính")
	}
}

func TestEqualP10P90IsSinglePrice(t *testing.T) {
	r := UsedRange(txnsAt(40, 5, 9_000_000), now, DefaultConfig())
	if r.Status != StatusSinglePrice || r.Lower != 9_000_000 || r.Upper != 9_000_000 {
		t.Fatalf("got %+v", r)
	}
}

func TestEvaluatePositionAndPrompt(t *testing.T) {
	r := fixtureRange(t)
	noZ := DefaultConfig()
	withZ := DefaultConfig()
	withZ.ZThreshold = ptr(1.0)

	cases := []struct {
		name    string
		price   int64
		cfg     Config
		wantPos Position
		wantDir *ReviewDirection
	}{
		{"trong dải", 11_500_000, withZ, PositionIn, nil},
		{"bằng P10", 10_000_000, withZ, PositionIn, nil},
		{"bằng P90", 12_000_000, withZ, PositionIn, nil},
		{"dưới dải, chưa cấu hình Z", 9_200_000, noZ, PositionBelow, nil},
		{"trên dải, chưa cấu hình Z", 12_800_000, noZ, PositionAbove, nil},
		{"dưới dải, vượt ngưỡng", 9_200_000, withZ, PositionBelow, ptr(ReviewLowPrice)},
		{"trên dải, vượt ngưỡng", 12_800_000, withZ, PositionAbove, ptr(ReviewHighPrice)},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ev := Evaluate(&c.price, r, c.cfg)
			if ev.Position == nil || *ev.Position != c.wantPos {
				t.Fatalf("position = %v, want %s", ev.Position, c.wantPos)
			}
			if (c.wantDir == nil) != !ev.ShowReviewPrompt {
				t.Fatalf("showReviewPrompt = %v", ev.ShowReviewPrompt)
			}
			if c.wantDir != nil && *ev.ReviewDirection != *c.wantDir {
				t.Fatalf("direction = %s", *ev.ReviewDirection)
			}
		})
	}
}

func TestEvaluateOutsideButZUnderThreshold(t *testing.T) {
	r := fixtureRange(t)
	cfg := DefaultConfig()
	cfg.ZThreshold = ptr(3.0)
	price := int64(9_800_000)
	ev := Evaluate(&price, r, cfg)
	if *ev.Position != PositionBelow || ev.ShowReviewPrompt {
		t.Fatalf("got %+v", ev)
	}
}

func TestEvaluateNoRangeOrNoPrice(t *testing.T) {
	insufficient := UsedRange(txnsAt(10, 5, 9_000_000), now, DefaultConfig())
	price := int64(9_000_000)
	if ev := Evaluate(&price, insufficient, DefaultConfig()); ev.Position != nil {
		t.Fatal("không có dải thì không có nhãn")
	}
	if ev := Evaluate(nil, fixtureRange(t), DefaultConfig()); ev.Position != nil {
		t.Fatal("chưa nhập giá thì không có nhãn")
	}
}

func TestZeroStdDevNeverPrompts(t *testing.T) {
	r := UsedRange(txnsAt(40, 5, 9_000_000), now, DefaultConfig())
	cfg := DefaultConfig()
	cfg.ZThreshold = ptr(0.5)
	price := int64(5_000_000)
	ev := Evaluate(&price, r, cfg)
	if *ev.Position != PositionBelow || ev.ShowReviewPrompt {
		t.Fatalf("sd = 0 không được tính Z: %+v", ev)
	}
}

func TestConditionKey(t *testing.T) {
	cases := []struct {
		pct  *int
		want BatteryBucket
	}{
		{ptr(100), BatteryGE90}, {ptr(90), BatteryGE90}, {ptr(89), Battery80To89},
		{ptr(80), Battery80To89}, {ptr(79), BatteryLT80}, {ptr(0), BatteryLT80},
		{nil, BatteryUnknown}, {ptr(101), BatteryUnknown},
	}
	for _, c := range cases {
		if got := BucketFromPct(c.pct); got != c.want {
			t.Errorf("BucketFromPct(%v) = %q, want %q", c.pct, got, c.want)
		}
	}
	key, missing := Condition{AppearanceGood, FunctionalityFull, Battery80To89}.Key()
	if key != "GOOD|FULL|FROM_80_TO_89" || missing != nil {
		t.Fatalf("key=%q missing=%v", key, missing)
	}
	key, missing = Condition{Appearance: AppearanceGood}.Key()
	if key != "" || len(missing) != 2 {
		t.Fatalf("thiếu tiêu chí phải không ghép nhóm: key=%q missing=%v", key, missing)
	}
}

func TestNewPrice(t *testing.T) {
	cfg := DefaultConfig()
	fresh := now.Add(-time.Hour)
	black, white := ptr("Đen"), ptr("Trắng")
	q := func(src string, price int64, opts ...func(*StoreQuote)) StoreQuote {
		s := StoreQuote{SourceID: src, Price: price, InStock: true, VerifiedAt: fresh}
		for _, o := range opts {
			o(&s)
		}
		return s
	}
	outOfStock := func(s *StoreQuote) { s.InStock = false }
	stale := func(s *StoreQuote) { s.VerifiedAt = now.Add(-25 * time.Hour) }
	colored := func(c *string) func(*StoreQuote) { return func(s *StoreQuote) { s.Color = c } }

	cases := []struct {
		name       string
		quotes     []StoreQuote
		color      *string
		wantStatus ResultStatus
		lo, hi     int64
	}{
		{"không có nguồn", nil, nil, StatusNoData, 0, 0},
		{"một nguồn", []StoreQuote{q("A", 13_000_000)}, nil, StatusSinglePrice, 13_000_000, 13_000_000},
		{"nhiều nguồn cùng giá", []StoreQuote{q("A", 13_000_000), q("B", 13_000_000)}, nil, StatusSinglePrice, 13_000_000, 13_000_000},
		{"nhiều mức giá", []StoreQuote{q("A", 12_000_000), q("B", 12_500_000), q("C", 13_000_000)}, nil, StatusRange, 12_000_000, 13_000_000},
		{"bỏ hết hàng và quá 24 giờ", []StoreQuote{q("A", 12_000_000, outOfStock), q("B", 12_500_000), q("C", 13_000_000), q("D", 11_000_000, stale)}, nil, StatusRange, 12_500_000, 13_000_000},
		{"đúng màu", []StoreQuote{q("A", 13_000_000, colored(black)), q("A", 13_500_000, colored(white)), q("B", 14_000_000, colored(black))}, black, StatusRange, 13_000_000, 14_000_000},
		{"không rõ màu, giá khác theo màu thì bỏ", []StoreQuote{q("A", 13_000_000, colored(black)), q("A", 13_500_000, colored(white))}, nil, StatusNoData, 0, 0},
		{"không rõ màu, mọi màu cùng giá", []StoreQuote{q("A", 13_000_000, colored(black)), q("A", 13_000_000, colored(white))}, nil, StatusSinglePrice, 13_000_000, 13_000_000},
		{"ưu tiên giá đúng màu hơn giá chung", []StoreQuote{q("A", 12_000_000), q("A", 12_900_000, colored(black))}, black, StatusSinglePrice, 12_900_000, 12_900_000},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r := NewPrice(c.quotes, c.color, now, cfg)
			if r.Status != c.wantStatus || r.Lower != c.lo || r.Upper != c.hi {
				t.Fatalf("got status=%s %d–%d", r.Status, r.Lower, r.Upper)
			}
		})
	}
}
