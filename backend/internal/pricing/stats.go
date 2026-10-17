package pricing

import "math"

// Type7 là phân vị Type 7 (mặc định của R) trên mảng đã sắp tăng dần, p trong [0, 1]:
// h = 1 + (n-1)p, j = floor(h), Q = x_j + (h-j)(x_{j+1} - x_j), chỉ số 1-based.
func Type7(sortedAsc []float64, p float64) (float64, bool) {
	n := len(sortedAsc)
	if n == 0 {
		return 0, false
	}
	if n == 1 {
		return sortedAsc[0], true
	}
	h := 1 + float64(n-1)*p
	j := int(math.Floor(h))
	g := h - float64(j)
	if j >= n {
		return sortedAsc[n-1], true
	}
	lo := sortedAsc[j-1]
	if g == 0 {
		return lo, true
	}
	return lo + g*(sortedAsc[j]-lo), true
}

// sampleStats trả trung bình và độ lệch chuẩn mẫu (chia n-1). n < 2 thì sd = 0.
func sampleStats(values []float64) (mean, sd float64, ok bool) {
	n := len(values)
	if n == 0 {
		return 0, 0, false
	}
	var sum float64
	for _, v := range values {
		sum += v
	}
	mean = sum / float64(n)
	if n < 2 {
		return mean, 0, true
	}
	var ss float64
	for _, v := range values {
		ss += (v - mean) * (v - mean)
	}
	return mean, math.Sqrt(ss / float64(n-1)), true
}
