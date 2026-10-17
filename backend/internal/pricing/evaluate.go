package pricing

type Position string

const (
	PositionBelow Position = "BELOW_RANGE"
	PositionIn    Position = "IN_RANGE"
	PositionAbove Position = "ABOVE_RANGE"
)

type ReviewDirection string

const (
	ReviewLowPrice  ReviewDirection = "LOW_PRICE"
	ReviewHighPrice ReviewDirection = "HIGH_PRICE"
)

// Evaluation là kết quả so giá đang xét với dải GĐ2. Không chứa mean, độ lệch chuẩn hay Z.
type Evaluation struct {
	Position         *Position // nil khi GĐ2 không có dải hoặc chưa có giá
	ShowReviewPrompt bool
	ReviewDirection  *ReviewDirection
}

// PositionOf so một giá với [lower, upper]; bằng đúng hai đầu là trong khoảng.
func PositionOf(price, lower, upper int64) Position {
	switch {
	case price < lower:
		return PositionBelow
	case price > upper:
		return PositionAbove
	default:
		return PositionIn
	}
}

// Evaluate gắn nhãn vị trí và quyết định lời nhắc (docs/SPEC.md 5.3). Lời nhắc chỉ hiện
// khi giá ngoài dải, zThreshold đã cấu hình, độ lệch chuẩn mẫu > 0 và Z vượt ngưỡng đúng chiều.
// Z tính trên cùng tập giao dịch đã dùng để tính P10–P90.
func Evaluate(price *int64, used UsedRangeResult, cfg Config) Evaluation {
	if price == nil || (used.Status != StatusRange && used.Status != StatusSinglePrice) {
		return Evaluation{}
	}
	pos := PositionOf(*price, used.Lower, used.Upper)
	ev := Evaluation{Position: &pos}
	if pos == PositionIn || !cfg.zThresholdSet() {
		return ev
	}
	mean, sd, ok := sampleStats(used.prices)
	if !ok || sd <= 0 {
		return ev
	}
	z := (float64(*price) - mean) / sd
	var dir ReviewDirection
	switch {
	case pos == PositionBelow && z < -*cfg.ZThreshold:
		dir = ReviewLowPrice
	case pos == PositionAbove && z > *cfg.ZThreshold:
		dir = ReviewHighPrice
	default:
		return ev
	}
	ev.ShowReviewPrompt = true
	ev.ReviewDirection = &dir
	return ev
}
