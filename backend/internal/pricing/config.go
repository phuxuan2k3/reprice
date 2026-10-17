// Package pricing tính giá tham khảo của RePrice (docs/SPEC.md mục 5):
// GĐ1 giá máy mới tại cửa hàng, GĐ2 dải P10–P90 của máy cũ đã bán,
// nhãn vị trí giá và lời nhắc dựa trên Z-score.
//
// Package này không đọc database và không đọc đồng hồ: mọi dữ liệu và
// thời điểm "now" do bên gọi truyền vào, để kiểm thử được.
package pricing

import "time"

// Config là các ngưỡng của price engine. Giá trị nil nghĩa là nhóm chưa chốt.
type Config struct {
	MinTransactions int
	WindowsMonths   []int
	NewPriceMaxAge  time.Duration
	// ZThreshold nil hoặc <= 0: không bao giờ hiện lời nhắc, dải giá vẫn công bố.
	ZThreshold *float64
}

// DefaultConfig là các giá trị đã chốt trong SPEC.
func DefaultConfig() Config {
	return Config{
		MinTransactions: 35,
		WindowsMonths:   []int{3, 6, 12},
		NewPriceMaxAge:  24 * time.Hour,
		ZThreshold:      nil,
	}
}

func (c Config) zThresholdSet() bool {
	return c.ZThreshold != nil && *c.ZThreshold > 0
}
