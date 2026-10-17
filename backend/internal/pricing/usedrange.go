package pricing

import (
	"math"
	"sort"
	"time"
)

// Transaction là một giao dịch ELIGIBLE, đã cùng nhóm máy và cùng data source.
// Lọc trạng thái, nhóm và nguồn là việc của bên gọi.
type Transaction struct {
	ID    string
	Price int64 // giá chốt thực trả, không gồm phí vận chuyển
	Date  time.Time
}

type UsedRangeResult struct {
	Status           ResultStatus
	Lower            int64 // P10, làm tròn đến đồng
	Upper            int64 // P90, làm tròn đến đồng
	TransactionCount int   // số giao dịch trong cửa sổ đã chọn; khi thiếu: số trong cửa sổ dài nhất
	MinTransactions  int
	WindowMonths     int // 0 khi không đủ dữ liệu
	PeriodStart      time.Time
	PeriodEnd        time.Time
	MemberIDs        []string
	prices           []float64 // giữ để tính Z, không trả ra ngoài
}

// UsedRange tính GĐ2 (docs/SPEC.md 5.2): xét cửa sổ 3 → 6 → 12 tháng, dừng ở cửa sổ đầu
// tiên có ít nhất MinTransactions giao dịch, dùng toàn bộ giao dịch trong cửa sổ đó.
// Giao dịch đúng biên [now - m tháng, now] được tính.
func UsedRange(txns []Transaction, now time.Time, cfg Config) UsedRangeResult {
	res := UsedRangeResult{MinTransactions: cfg.MinTransactions, PeriodEnd: now}
	var inWindow []Transaction
	for _, m := range cfg.WindowsMonths {
		start := now.AddDate(0, -m, 0)
		inWindow = inWindow[:0:0]
		for _, t := range txns {
			if !t.Date.Before(start) && !t.Date.After(now) {
				inWindow = append(inWindow, t)
			}
		}
		res.TransactionCount = len(inWindow)
		res.PeriodStart = start
		if len(inWindow) >= cfg.MinTransactions {
			res.WindowMonths = m
			break
		}
	}
	if res.WindowMonths == 0 {
		res.PeriodStart = time.Time{}
		res.PeriodEnd = time.Time{}
		if res.TransactionCount == 0 {
			res.Status = StatusNoData
		} else {
			res.Status = StatusInsufficientData
		}
		return res
	}

	prices := make([]float64, len(inWindow))
	res.MemberIDs = make([]string, len(inWindow))
	for i, t := range inWindow {
		prices[i] = float64(t.Price)
		res.MemberIDs[i] = t.ID
	}
	sort.Float64s(prices)
	p10, _ := Type7(prices, 0.10)
	p90, _ := Type7(prices, 0.90)
	res.Lower = int64(math.Round(p10))
	res.Upper = int64(math.Round(p90))
	res.prices = prices
	if res.Lower == res.Upper {
		res.Status = StatusSinglePrice
	} else {
		res.Status = StatusRange
	}
	return res
}
