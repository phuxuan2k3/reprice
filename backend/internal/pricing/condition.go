package pricing

import "strings"

type Appearance string

const (
	AppearanceExcellent Appearance = "EXCELLENT"
	AppearanceGood      Appearance = "GOOD"
	AppearanceFair      Appearance = "FAIR"
	AppearancePoor      Appearance = "POOR"
)

type Functionality string

const (
	FunctionalityFull            Functionality = "FULL"
	FunctionalityHasFaults       Functionality = "HAS_FAULTS"
	FunctionalityNotFullyChecked Functionality = "NOT_FULLY_CHECKED"
)

type BatteryBucket string

const (
	BatteryGE90    BatteryBucket = "GE_90"
	Battery80To89  BatteryBucket = "FROM_80_TO_89"
	BatteryLT80    BatteryBucket = "LT_80"
	BatteryUnknown BatteryBucket = ""
)

// Tên tiêu chí trả về trong missingCriteria (docs/openapi.yaml UsedPriceResult).
const (
	criterionAppear   = "APPEARANCE"
	criterionFunction = "FUNCTIONALITY"
	criterionBattery  = "BATTERY"
)

// BucketFromPct chia sức khỏe pin thành 3 mức. nil hoặc ngoài 0–100 là không rõ.
func BucketFromPct(pct *int) BatteryBucket {
	if pct == nil || *pct < 0 || *pct > 100 {
		return BatteryUnknown
	}
	switch {
	case *pct >= 90:
		return BatteryGE90
	case *pct >= 80:
		return Battery80To89
	default:
		return BatteryLT80
	}
}

// Condition là 3 tiêu chí Condition Score.
type Condition struct {
	Appearance    Appearance
	Functionality Functionality
	Battery       BatteryBucket
}

func (a Appearance) valid() bool {
	switch a {
	case AppearanceExcellent, AppearanceGood, AppearanceFair, AppearancePoor:
		return true
	}
	return false
}

func (f Functionality) valid() bool {
	switch f {
	case FunctionalityFull, FunctionalityHasFaults, FunctionalityNotFullyChecked:
		return true
	}
	return false
}

func (b BatteryBucket) valid() bool {
	switch b {
	case BatteryGE90, Battery80To89, BatteryLT80:
		return true
	}
	return false
}

// Key trả khóa nhóm "appearance|functionality|battery". Thiếu bất kỳ tiêu chí nào
// thì trả key rỗng và danh sách tiêu chí thiếu: giao dịch không được ghép nhóm.
func (c Condition) Key() (key string, missing []string) {
	if !c.Appearance.valid() {
		missing = append(missing, criterionAppear)
	}
	if !c.Functionality.valid() {
		missing = append(missing, criterionFunction)
	}
	if !c.Battery.valid() {
		missing = append(missing, criterionBattery)
	}
	if len(missing) > 0 {
		return "", missing
	}
	return strings.Join([]string{string(c.Appearance), string(c.Functionality), string(c.Battery)}, "|"), nil
}
