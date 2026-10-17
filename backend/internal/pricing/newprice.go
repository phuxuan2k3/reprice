package pricing

import (
	"sort"
	"time"
)

// ResultStatus là trạng thái kết quả giá (GĐ1 và GĐ2 dùng chung tập giá trị).
type ResultStatus string

const (
	StatusNoData           ResultStatus = "NO_DATA"
	StatusSinglePrice      ResultStatus = "SINGLE_PRICE"
	StatusRange            ResultStatus = "RANGE"
	StatusInsufficientData ResultStatus = "INSUFFICIENT_DATA"
)

// StoreQuote là một báo giá máy mới của một chuỗi bán lẻ cho đúng phiên bản đang xét.
// Color nil nghĩa là giá áp dụng cho mọi màu.
type StoreQuote struct {
	SourceID   string
	Color      *string
	Price      int64 // giá bán hiện tại, gồm VAT, không ưu đãi có điều kiện
	InStock    bool
	Suspended  bool
	VerifiedAt time.Time
}

type NewPriceResult struct {
	Status  ResultStatus
	Lower   int64
	Upper   int64
	Sources []StoreQuote // các báo giá đã dùng, một báo giá mỗi chuỗi
}

// NewPrice tính GĐ1 từ các báo giá của đúng phiên bản (docs/SPEC.md 5.1).
// color là màu của máy đang xét; nil nếu không rõ.
func NewPrice(quotes []StoreQuote, color *string, now time.Time, cfg Config) NewPriceResult {
	bySource := map[string]StoreQuote{}
	for _, q := range quotes {
		if !q.InStock || q.Suspended || now.Sub(q.VerifiedAt) > cfg.NewPriceMaxAge || q.VerifiedAt.After(now) {
			continue
		}
		if !colorApplies(q, color, quotes) {
			continue
		}
		cur, seen := bySource[q.SourceID]
		// Mỗi chuỗi một giá; báo giá đúng màu được ưu tiên hơn báo giá chung.
		if !seen || (cur.Color == nil && q.Color != nil) {
			bySource[q.SourceID] = q
		}
	}
	if len(bySource) == 0 {
		return NewPriceResult{Status: StatusNoData}
	}
	sources := make([]StoreQuote, 0, len(bySource))
	for _, q := range bySource {
		sources = append(sources, q)
	}
	sort.Slice(sources, func(i, j int) bool {
		if sources[i].Price != sources[j].Price {
			return sources[i].Price < sources[j].Price
		}
		return sources[i].SourceID < sources[j].SourceID
	})
	res := NewPriceResult{Lower: sources[0].Price, Upper: sources[len(sources)-1].Price, Sources: sources}
	if res.Lower == res.Upper {
		res.Status = StatusSinglePrice
	} else {
		res.Status = StatusRange
	}
	return res
}

// colorApplies: báo giá chung (không màu) luôn dùng được. Báo giá theo màu chỉ dùng khi
// đúng màu đang xét; nếu không rõ màu thì chỉ dùng khi mọi màu của chuỗi đó cùng giá.
func colorApplies(q StoreQuote, color *string, all []StoreQuote) bool {
	if q.Color == nil {
		return true
	}
	if color != nil {
		return *q.Color == *color
	}
	for _, o := range all {
		if o.SourceID == q.SourceID && o.Color != nil && o.Price != q.Price {
			return false
		}
	}
	return true
}
