package market

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"reprice/internal/apperr"
	"reprice/internal/pricing"
)

// ConditionInput là tình trạng máy người bán khai. Không có lịch sử sửa chữa (SPEC 5.2).
type ConditionInput struct {
	Appearance        *string `json:"appearance"`
	Functionality     *string `json:"functionality"`
	Faults            []Fault `json:"faults"`
	RemainingChecked  *bool   `json:"remainingChecked"`
	BatteryHealthPct  *int    `json:"batteryHealthPct"`
	BatteryStatusText *string `json:"batteryStatusText"`
}

// ListingInput: mọi trường tùy chọn; trường nil giữ nguyên khi sửa. Đủ trường bắt buộc mới đăng được.
type ListingInput struct {
	Variant       *VariantSpec    `json:"variant"`
	NetworkLock   *string         `json:"networkLock"`
	Condition     *ConditionInput `json:"condition"`
	UsageMonths   *int            `json:"usageMonths"`
	Accessories   *[]Accessory    `json:"accessories"`
	WarrantyType  *string         `json:"warrantyType"`
	WarrantyUntil *string         `json:"warrantyUntil"`
	WarrantyStore *string         `json:"warrantyStore"`
	Description   *string         `json:"description"`
	Price         *int64          `json:"price"`
	Province      *string         `json:"province"`
	Ward          *string         `json:"ward"`
	ContactPhone  *string         `json:"contactPhone"`
	DraftStep     *int            `json:"draftStep"`
}

var (
	enumAppearance    = map[string]bool{"EXCELLENT": true, "GOOD": true, "FAIR": true, "POOR": true}
	enumFunctionality = map[string]bool{"FULL": true, "HAS_FAULTS": true, "NOT_FULLY_CHECKED": true}
	enumNetworkLock   = map[string]bool{"UNLOCKED": true, "LOCKED": true, "UNKNOWN": true}
	enumWarranty      = map[string]bool{"NONE": true, "BRAND": true, "STORE": true, "BOTH": true, "UNKNOWN": true}
	enumAccessory     = map[string]bool{"BOX": true, "CHARGER": true, "CABLE": true, "EARPHONES": true, "CASE": true, "OTHER": true}
	enumSeverity      = map[string]bool{"DEGRADED": true, "NOT_WORKING": true}
)

func (in *ListingInput) validate() error {
	f := map[string]string{}
	if in.Price != nil && (*in.Price <= 0 || *in.Price > 1_000_000_000) {
		f["price"] = "Giá bán phải lớn hơn 0."
	}
	if in.NetworkLock != nil && !enumNetworkLock[*in.NetworkLock] {
		f["networkLock"] = "Giá trị không hợp lệ."
	}
	if in.WarrantyType != nil && !enumWarranty[*in.WarrantyType] {
		f["warrantyType"] = "Giá trị không hợp lệ."
	}
	if in.WarrantyUntil != nil && *in.WarrantyUntil != "" {
		if _, err := time.Parse(time.DateOnly, *in.WarrantyUntil); err != nil {
			f["warrantyUntil"] = "Ngày phải dạng YYYY-MM-DD."
		}
	}
	if in.UsageMonths != nil && (*in.UsageMonths < 0 || *in.UsageMonths > 240) {
		f["usageMonths"] = "Số tháng sử dụng không hợp lệ."
	}
	if c := in.Condition; c != nil {
		if c.Appearance != nil && !enumAppearance[*c.Appearance] {
			f["condition.appearance"] = "Giá trị không hợp lệ."
		}
		if c.Functionality != nil && !enumFunctionality[*c.Functionality] {
			f["condition.functionality"] = "Giá trị không hợp lệ."
		}
		if c.BatteryHealthPct != nil && (*c.BatteryHealthPct < 0 || *c.BatteryHealthPct > 100) {
			f["condition.batteryHealthPct"] = "Sức khỏe pin từ 0 đến 100."
		}
		for _, x := range c.Faults {
			if strings.TrimSpace(x.Component) == "" || !enumSeverity[x.Severity] {
				f["condition.faults"] = "Mỗi lỗi cần tên bộ phận và mức độ."
			}
		}
	}
	if in.Accessories != nil {
		for _, a := range *in.Accessories {
			if !enumAccessory[a.Type] {
				f["accessories"] = "Loại phụ kiện không hợp lệ."
			}
		}
	}
	if len(f) > 0 {
		return &apperr.Error{Code: apperr.ValidationFailed, Message: "Thông tin tin đăng chưa hợp lệ.", Details: map[string]any{"fields": f}}
	}
	return nil
}

// apply ghi các trường có trong input vào tin (đang khóa trong tx) rồi tính lại khóa nhóm Condition Score.
func (in *ListingInput) apply(ctx context.Context, tx pgx.Tx, id string, now time.Time) error {
	set := []string{"updated_at = $2"}
	args := []any{id, now}
	add := func(col string, v any) {
		args = append(args, v)
		set = append(set, fmt.Sprintf("%s = $%d", col, len(args)))
	}
	if in.Variant != nil {
		vid, err := resolveVariant(ctx, tx, *in.Variant, true)
		if err != nil {
			return err
		}
		add("variant_id", vid)
	}
	if in.NetworkLock != nil {
		add("network_lock", *in.NetworkLock)
	}
	if in.UsageMonths != nil {
		add("usage_months", *in.UsageMonths)
	}
	if in.WarrantyType != nil {
		add("warranty_type", *in.WarrantyType)
	}
	if in.WarrantyUntil != nil {
		if *in.WarrantyUntil == "" {
			add("warranty_until", nil)
		} else {
			add("warranty_until", *in.WarrantyUntil)
		}
	}
	if in.WarrantyStore != nil {
		add("warranty_store", strings.TrimSpace(*in.WarrantyStore))
	}
	if in.Description != nil {
		add("description", strings.TrimSpace(*in.Description))
	}
	if in.Price != nil {
		add("price", *in.Price)
	}
	if in.Province != nil {
		add("province", strings.TrimSpace(*in.Province))
	}
	if in.Ward != nil {
		add("ward", strings.TrimSpace(*in.Ward))
	}
	if in.ContactPhone != nil {
		add("contact_phone", strings.TrimSpace(*in.ContactPhone))
	}
	if in.DraftStep != nil && *in.DraftStep >= 1 && *in.DraftStep <= 5 {
		add("draft_step", *in.DraftStep)
	}
	if c := in.Condition; c != nil {
		if c.Appearance != nil {
			add("appearance", *c.Appearance)
		}
		if c.Functionality != nil {
			add("functionality", *c.Functionality)
		}
		if c.RemainingChecked != nil {
			add("remaining_checked", *c.RemainingChecked)
		}
		// Hai cách khai pin loại trừ nhau: có % thì bỏ trạng thái chữ và ngược lại.
		if c.BatteryHealthPct != nil {
			add("battery_health_pct", *c.BatteryHealthPct)
			add("battery_status_text", nil)
		} else if c.BatteryStatusText != nil {
			add("battery_status_text", strings.TrimSpace(*c.BatteryStatusText))
			add("battery_health_pct", nil)
		}
	}
	if _, err := tx.Exec(ctx, "UPDATE listings SET "+strings.Join(set, ", ")+" WHERE id = $1", args...); err != nil {
		return err
	}
	if c := in.Condition; c != nil && c.Faults != nil {
		if _, err := tx.Exec(ctx, `DELETE FROM listing_faults WHERE listing_id = $1`, id); err != nil {
			return err
		}
		for _, x := range c.Faults {
			if _, err := tx.Exec(ctx, `INSERT INTO listing_faults (listing_id, component, severity, note) VALUES ($1,$2,$3,$4)`,
				id, strings.TrimSpace(x.Component), x.Severity, strings.TrimSpace(x.Note)); err != nil {
				return err
			}
		}
	}
	if in.Accessories != nil {
		if _, err := tx.Exec(ctx, `DELETE FROM listing_accessories WHERE listing_id = $1`, id); err != nil {
			return err
		}
		for _, a := range *in.Accessories {
			if _, err := tx.Exec(ctx, `INSERT INTO listing_accessories (listing_id, type, note) VALUES ($1,$2,$3)
				ON CONFLICT (listing_id, type) DO UPDATE SET note = EXCLUDED.note`, id, a.Type, strings.TrimSpace(a.Note)); err != nil {
				return err
			}
		}
	}
	// Tính lại nhóm pin và khóa Condition Score từ dữ liệu đã lưu.
	var app, fn *string
	var pct *int
	if err := tx.QueryRow(ctx, `SELECT appearance, functionality, battery_health_pct FROM listings WHERE id = $1`, id).Scan(&app, &fn, &pct); err != nil {
		return err
	}
	cond := pricing.Condition{Battery: pricing.BucketFromPct(pct)}
	if app != nil {
		cond.Appearance = pricing.Appearance(*app)
	}
	if fn != nil {
		cond.Functionality = pricing.Functionality(*fn)
	}
	key, _ := cond.Key()
	var bucket, keyArg any
	if cond.Battery != pricing.BatteryUnknown {
		bucket = string(cond.Battery)
	}
	if key != "" {
		keyArg = key
	}
	_, err := tx.Exec(ctx, `UPDATE listings SET battery_bucket = $2, condition_key = $3 WHERE id = $1`, id, bucket, keyArg)
	return err
}

func listingHistory(ctx context.Context, tx pgx.Tx, now time.Time, id, userID string, changes any) error {
	raw, err := json.Marshal(changes)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO listing_history (listing_id, changed_by, changes, created_at) VALUES ($1,$2,$3,$4)`, id, userID, raw, now)
	return err
}

// CreateListing tạo tin nháp của người bán (UC10, UC11).
func (s *Store) CreateListing(ctx context.Context, sellerID string, in ListingInput, now time.Time) (string, error) {
	if err := in.validate(); err != nil {
		return "", err
	}
	var id string
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `INSERT INTO listings (seller_id, created_at, updated_at) VALUES ($1,$2,$2) RETURNING id`,
			sellerID, now).Scan(&id); err != nil {
			return err
		}
		if err := in.apply(ctx, tx, id, now); err != nil {
			return err
		}
		return listingHistory(ctx, tx, now, id, sellerID, map[string]any{"action": "CREATE", "input": in})
	})
	return id, err
}

type listingRow struct {
	seller, status string
}

// lockOwnListing khóa tin và kiểm tra đúng người bán.
func lockOwnListing(ctx context.Context, tx pgx.Tx, id, sellerID string) (*listingRow, error) {
	var r listingRow
	err := tx.QueryRow(ctx, `SELECT seller_id, status FROM listings WHERE id = $1 FOR UPDATE`, id).Scan(&r.seller, &r.status)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && r.seller != sellerID) {
		return nil, apperr.New(apperr.NotFound, "Không tìm thấy tin đăng.")
	}
	return &r, err
}

// UpdateListing sửa tin chưa có đơn (UC11, UC13).
func (s *Store) UpdateListing(ctx context.Context, id, sellerID string, in ListingInput, now time.Time) error {
	if err := in.validate(); err != nil {
		return err
	}
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		r, err := lockOwnListing(ctx, tx, id, sellerID)
		if err != nil {
			return err
		}
		if r.status != "DRAFT" && r.status != "ACTIVE" && r.status != "PAUSED" {
			return apperr.New(apperr.InvalidState, "Tin đã có đơn hoặc đã gỡ, không sửa được.")
		}
		if err := in.apply(ctx, tx, id, now); err != nil {
			return err
		}
		return listingHistory(ctx, tx, now, id, sellerID, map[string]any{"action": "UPDATE", "input": in})
	})
}

// Publish kiểm tra đủ thông tin bắt buộc rồi đăng tin DRAFT → ACTIVE (UC10).
func (s *Store) Publish(ctx context.Context, id, sellerID string, now time.Time) error {
	l, err := s.GetListing(ctx, id, sellerID)
	if err != nil {
		return apperr.New(apperr.NotFound, "Không tìm thấy tin đăng.")
	}
	f := map[string]string{}
	c := l.Condition
	if l.Variant == nil {
		f["variant"] = "Chọn máy, dung lượng và màu."
	}
	if l.Price == nil {
		f["price"] = "Nhập giá bán."
	}
	if l.NetworkLock == nil {
		f["networkLock"] = "Khai tình trạng khóa mạng."
	}
	if c.Appearance == nil {
		f["condition.appearance"] = "Khai ngoại hình."
	}
	if c.Functionality == nil {
		f["condition.functionality"] = "Khai tình trạng chức năng."
	} else if *c.Functionality == "HAS_FAULTS" && len(c.Faults) == 0 {
		f["condition.faults"] = "Khai các lỗi đang có."
	}
	if c.BatteryHealthPct == nil && c.BatteryStatusText == nil {
		f["condition.battery"] = "Khai sức khỏe pin hoặc chọn không xem được."
	}
	if l.WarrantyType == nil {
		f["warrantyType"] = "Khai bảo hành."
	}
	if l.Province == "" || l.Ward == "" {
		f["region"] = "Chọn khu vực bán."
	}
	if len(l.Photos) == 0 {
		f["photos"] = "Cần ít nhất 1 ảnh thực tế."
	}
	if len(f) > 0 {
		return &apperr.Error{Code: apperr.ValidationFailed, Message: "Tin còn thiếu thông tin bắt buộc.", Details: map[string]any{"fields": f}}
	}
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		r, err := lockOwnListing(ctx, tx, id, sellerID)
		if err != nil {
			return err
		}
		if r.status != "DRAFT" {
			return apperr.New(apperr.InvalidState, "Tin đã được đăng.")
		}
		if _, err := tx.Exec(ctx, `UPDATE listings SET status='ACTIVE', published_at=$2, updated_at=$2 WHERE id=$1`, id, now); err != nil {
			return err
		}
		return listingHistory(ctx, tx, now, id, sellerID, map[string]any{"action": "PUBLISH"})
	})
}

// SetVisibility: PAUSE (ACTIVE → PAUSED), RESUME (PAUSED → ACTIVE), REMOVE (→ REMOVED). Tạm ẩn
// hoặc gỡ tin đóng các thương lượng đang mở và báo cho người mua.
func (s *Store) SetVisibility(ctx context.Context, id, sellerID, action string, now time.Time) error {
	allowed := map[string][]string{"PAUSE": {"ACTIVE"}, "RESUME": {"PAUSED"}, "REMOVE": {"DRAFT", "ACTIVE", "PAUSED"}}
	target := map[string]string{"PAUSE": "PAUSED", "RESUME": "ACTIVE", "REMOVE": "REMOVED"}
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		r, err := lockOwnListing(ctx, tx, id, sellerID)
		if err != nil {
			return err
		}
		ok := false
		for _, st := range allowed[action] {
			ok = ok || st == r.status
		}
		if !ok {
			return apperr.New(apperr.InvalidState, "Không thể thực hiện thao tác này với tin ở trạng thái hiện tại.")
		}
		if _, err := tx.Exec(ctx, `UPDATE listings SET status=$2, updated_at=$3 WHERE id=$1`, id, target[action], now); err != nil {
			return err
		}
		if action != "RESUME" {
			reason := "Người bán đã tạm ẩn tin"
			if action == "REMOVE" {
				reason = "Người bán đã gỡ tin"
			}
			rows, err := tx.Query(ctx, `UPDATE negotiations SET status='CLOSED', closed_reason=$2, updated_at=$3
				WHERE listing_id=$1 AND status IN ('AWAITING_SELLER','AWAITING_BUYER') RETURNING id, buyer_id`, id, reason, now)
			if err != nil {
				return err
			}
			type closed struct{ id, buyer string }
			var cl []closed
			for rows.Next() {
				var c closed
				if err := rows.Scan(&c.id, &c.buyer); err != nil {
					rows.Close()
					return err
				}
				cl = append(cl, c)
			}
			rows.Close()
			for _, c := range cl {
				if _, err := tx.Exec(ctx, `INSERT INTO notifications (user_id, type, title, body, link, created_at)
					VALUES ($1,'NEGOTIATION_CLOSED','Điện thoại không còn mở bán',$2,$3,$4)`,
					c.buyer, reason+", cuộc thương lượng đã đóng.", "/negotiations/"+c.id, now); err != nil {
					return err
				}
			}
		}
		return listingHistory(ctx, tx, now, id, sellerID, map[string]any{"action": action})
	})
}

// MyListings: tin của người bán, mọi trạng thái trừ REMOVED (trừ khi lọc đúng REMOVED).
func (s *Store) MyListings(ctx context.Context, sellerID, status string) ([]*Listing, error) {
	rows, err := s.pool.Query(ctx, listingSelect+` WHERE l.seller_id = $1
		AND (($2 = '' AND l.status <> 'REMOVED') OR l.status = $2) ORDER BY l.updated_at DESC LIMIT 200`, sellerID, status)
	if err != nil {
		return nil, err
	}
	var out []*Listing
	for rows.Next() {
		l, err := scanListing(rows)
		if err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, l)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if out == nil {
		out = []*Listing{}
	}
	return out, s.loadChildren(ctx, out)
}

// AddPhoto ghi ảnh đã lưu file; ảnh đầu tiên là ảnh bìa.
func (s *Store) AddPhoto(ctx context.Context, id, sellerID, url string, now time.Time) (*Photo, error) {
	var p Photo
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		r, err := lockOwnListing(ctx, tx, id, sellerID)
		if err != nil {
			return err
		}
		if r.status == "IN_TRANSACTION" || r.status == "SOLD" || r.status == "REMOVED" {
			return apperr.New(apperr.InvalidState, "Tin đã có đơn hoặc đã gỡ, không thêm ảnh được.")
		}
		var n int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM listing_photos WHERE listing_id = $1`, id).Scan(&n); err != nil {
			return err
		}
		if n >= 10 {
			return apperr.Field("file", "Tối đa 10 ảnh mỗi tin.")
		}
		p = Photo{URL: url, Position: n, IsCover: n == 0}
		return tx.QueryRow(ctx, `INSERT INTO listing_photos (listing_id, url, position, is_cover) VALUES ($1,$2,$3,$4) RETURNING id`,
			id, url, p.Position, p.IsCover).Scan(&p.ID)
	})
	return &p, err
}

// DeletePhoto xóa ảnh và trả url để xóa file; ảnh bìa chuyển sang ảnh kế tiếp.
func (s *Store) DeletePhoto(ctx context.Context, id, sellerID, photoID string) (string, error) {
	var url string
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		if _, err := lockOwnListing(ctx, tx, id, sellerID); err != nil {
			return err
		}
		err := tx.QueryRow(ctx, `DELETE FROM listing_photos WHERE id = $1 AND listing_id = $2 RETURNING url`, photoID, id).Scan(&url)
		if errors.Is(err, pgx.ErrNoRows) {
			return apperr.New(apperr.NotFound, "Không tìm thấy ảnh.")
		}
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE listing_photos p SET position = o.rn - 1, is_cover = (o.rn = 1)
			FROM (SELECT id, row_number() OVER (ORDER BY position) rn FROM listing_photos WHERE listing_id = $1) o
			WHERE p.id = o.id`, id)
		return err
	})
	return url, err
}
