package trade

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"reprice/internal/apperr"
)

// Thời hạn của hồ sơ trả hàng / khiếu nại (docs/SPEC.md mục 4).
const (
	SellerResponseWindow  = 48 * time.Hour
	BuyerSupplementWindow = 48 * time.Hour
	SellerDecisionWindow  = 24 * time.Hour
	BuyerChoiceWindow     = 48 * time.Hour
	ReturnHandoverWindow  = 72 * time.Hour
	ReturnInspectWindow   = 48 * time.Hour
	PlanReviewWindow      = 48 * time.Hour
)

var closedCaseStatus = map[string]bool{"RESOLVED": true, "REJECTED": true, "WITHDRAWN": true}

// ---------------------------------------------------------------- view

type CaseEvent struct {
	Actor  *UserRef  `json:"actor"`
	Action string    `json:"action"`
	From   *string   `json:"from"`
	To     *string   `json:"to"`
	Note   string    `json:"note"`
	At     time.Time `json:"at"`
}

type EvidenceFile struct {
	FileName  string `json:"fileName"`
	MimeType  string `json:"mimeType"`
	SizeBytes int64  `json:"sizeBytes"`
	URL       string `json:"url"`
}

type Evidence struct {
	ID         string         `json:"id"`
	UploadedBy UserRef        `json:"uploadedBy"`
	Role       string         `json:"role"`
	Note       string         `json:"note"`
	Files      []EvidenceFile `json:"files"`
	CreatedAt  time.Time      `json:"createdAt"`
}

type Resolution struct {
	ID             string          `json:"id"`
	Decision       string          `json:"decision"`
	Rationale      string          `json:"rationale"`
	RequiresReturn bool            `json:"requiresReturn"`
	RefundAmount   *int64          `json:"refundAmount"`
	FeeAllocation  json.RawMessage `json:"feeAllocation"`
	ReviewDeadline time.Time       `json:"reviewDeadline"`
	IssuedBy       string          `json:"issuedBy"`
	CreatedAt      time.Time       `json:"createdAt"`
}

type Verification struct {
	ID          string     `json:"id"`
	ShipmentID  string     `json:"shipmentId"`
	TicketCode  *string    `json:"ticketCode"`
	Question    string     `json:"question"`
	Status      string     `json:"status"`
	Response    *string    `json:"response"`
	Outcome     *string    `json:"outcome"`
	SentAt      *time.Time `json:"sentAt"`
	RespondedAt *time.Time `json:"respondedAt"`
}

type Refund struct {
	ID             string    `json:"id"`
	CaseID         *string   `json:"caseId"`
	OrderID        string    `json:"orderId"`
	OrderCode      string    `json:"orderCode"`
	Amount         int64     `json:"amount"`
	Status         string    `json:"status"`
	ProviderRef    *string   `json:"providerRef"`
	FailureReason  *string   `json:"failureReason"`
	AllowedActions []string  `json:"allowedActions"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type SupportCase struct {
	ID                string          `json:"id"`
	Code              string          `json:"code"`
	OrderID           string          `json:"orderId"`
	OrderCode         string          `json:"orderCode"`
	OrderStatus       string          `json:"orderStatus"`
	Buyer             UserRef         `json:"buyer"`
	Seller            UserRef         `json:"seller"`
	Type              string          `json:"type"`
	Reason            string          `json:"reason"`
	Description       string          `json:"description"`
	DiscoveredAt      *time.Time      `json:"discoveredAt"`
	Status            string          `json:"status"`
	NextStep          *NextStep       `json:"nextStep"`
	SupplementUsed    bool            `json:"supplementUsed"`
	Item              *OrderItem      `json:"committedSnapshot"`
	Evidence          []Evidence      `json:"evidence"`
	Timeline          []CaseEvent     `json:"timeline"`
	CurrentResolution *Resolution     `json:"currentResolution"`
	Verifications     []Verification  `json:"shippingVerifications"`
	ReturnShipment    *Shipment       `json:"returnShipment"`
	ReturnAddress     json.RawMessage `json:"returnAddress"`
	Refund            *Refund         `json:"refund"`
	MoneyStatus       map[string]any  `json:"moneyStatus"`
	AssignedAdmin     *UserRef        `json:"assignedAdmin"`
	OpenedAt          time.Time       `json:"openedAt"`
	ClosedAt          *time.Time      `json:"closedAt"`
	AllowedActions    []string        `json:"allowedActions"`
	awaiting          *string
	dueAt             *time.Time
}

func (s *Service) loadCase(ctx context.Context, id string) (*SupportCase, error) {
	var c SupportCase
	var adminID, adminName *string
	err := s.pool.QueryRow(ctx, `SELECT c.id, c.code, o.id, o.code, o.status, b.id, b.full_name, sl.id, sl.full_name,
			c.type, c.reason, c.description, c.discovered_at, c.status, c.awaiting_party, c.due_at, c.supplement_used,
			c.return_recipient, c.opened_at, c.closed_at, a.id, a.full_name
		FROM support_cases c JOIN orders o ON o.id = c.order_id
		JOIN users b ON b.id = o.buyer_id JOIN users sl ON sl.id = o.seller_id
		LEFT JOIN users a ON a.id = c.assigned_admin_id WHERE c.id = $1`, id).Scan(
		&c.ID, &c.Code, &c.OrderID, &c.OrderCode, &c.OrderStatus, &c.Buyer.ID, &c.Buyer.FullName, &c.Seller.ID, &c.Seller.FullName,
		&c.Type, &c.Reason, &c.Description, &c.DiscoveredAt, &c.Status, &c.awaiting, &c.dueAt, &c.SupplementUsed,
		&c.ReturnAddress, &c.OpenedAt, &c.ClosedAt, &adminID, &adminName)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, notFound("hồ sơ")
	}
	if err != nil {
		return nil, err
	}
	if adminID != nil {
		c.AssignedAdmin = &UserRef{ID: *adminID, FullName: *adminName}
	}
	var it OrderItem
	if err := s.pool.QueryRow(ctx, `SELECT id, listing_id, snapshot->>'title', listing_price_at_agreement, agreed_price, snapshot
		FROM order_items WHERE order_id = $1 ORDER BY id LIMIT 1`, c.OrderID).Scan(&it.ID, &it.ListingID, &it.Title,
		&it.ListingPriceAtAgreement, &it.AgreedPrice, &it.Snapshot); err == nil {
		c.Item = &it
	}

	c.Evidence = []Evidence{}
	rows, err := s.pool.Query(ctx, `SELECT e.id, u.id, u.full_name, e.note, e.created_at,
			CASE WHEN u.id = o.buyer_id THEN 'BUYER' WHEN u.id = o.seller_id THEN 'SELLER' ELSE 'ADMIN' END,
			coalesce((SELECT jsonb_agg(jsonb_build_object('fileName', f.file_name, 'mimeType', f.mime_type,
				'sizeBytes', f.size_bytes, 'url', f.storage_url)) FROM evidence_files f WHERE f.evidence_id = e.id), '[]')
		FROM evidence e JOIN users u ON u.id = e.uploaded_by JOIN support_cases c ON c.id = e.case_id JOIN orders o ON o.id = c.order_id
		WHERE e.case_id = $1 ORDER BY e.created_at`, id)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var e Evidence
		var files []byte
		if err := rows.Scan(&e.ID, &e.UploadedBy.ID, &e.UploadedBy.FullName, &e.Note, &e.CreatedAt, &e.Role, &files); err != nil {
			rows.Close()
			return nil, err
		}
		_ = json.Unmarshal(files, &e.Files)
		c.Evidence = append(c.Evidence, e)
	}
	rows.Close()

	c.Timeline = []CaseEvent{}
	rows, err = s.pool.Query(ctx, `SELECT u.id, u.full_name, e.action, e.from_status, e.to_status, e.note, e.created_at
		FROM case_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.case_id = $1 ORDER BY e.created_at, e.id`, id)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var e CaseEvent
		var uid, uname *string
		if err := rows.Scan(&uid, &uname, &e.Action, &e.From, &e.To, &e.Note, &e.At); err != nil {
			rows.Close()
			return nil, err
		}
		if uid != nil {
			e.Actor = &UserRef{ID: *uid, FullName: *uname}
		}
		c.Timeline = append(c.Timeline, e)
	}
	rows.Close()

	var r Resolution
	err = s.pool.QueryRow(ctx, `SELECT r.id, r.decision, r.rationale, r.requires_return, r.refund_amount, r.fee_allocation,
		r.review_deadline, u.full_name, r.created_at FROM resolutions r JOIN users u ON u.id = r.issued_by
		WHERE r.case_id = $1 AND r.is_current`, id).Scan(&r.ID, &r.Decision, &r.Rationale, &r.RequiresReturn, &r.RefundAmount,
		&r.FeeAllocation, &r.ReviewDeadline, &r.IssuedBy, &r.CreatedAt)
	if err == nil {
		c.CurrentResolution = &r
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	c.Verifications = []Verification{}
	rows, err = s.pool.Query(ctx, `SELECT id, shipment_id, ticket_code, question, status, response, outcome, sent_at, responded_at
		FROM shipping_verifications WHERE case_id = $1 ORDER BY sent_at NULLS LAST, id`, id)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var v Verification
		if err := rows.Scan(&v.ID, &v.ShipmentID, &v.TicketCode, &v.Question, &v.Status, &v.Response, &v.Outcome, &v.SentAt, &v.RespondedAt); err != nil {
			rows.Close()
			return nil, err
		}
		c.Verifications = append(c.Verifications, v)
	}
	rows.Close()

	var shipID string
	if err := s.pool.QueryRow(ctx, `SELECT id FROM shipments WHERE support_case_id = $1 ORDER BY created_at DESC LIMIT 1`, id).Scan(&shipID); err == nil {
		if c.ReturnShipment, err = s.getShipment(ctx, shipID); err != nil {
			return nil, err
		}
	}
	var rf Refund
	err = s.pool.QueryRow(ctx, `SELECT r.id, r.case_id, r.order_id, o.code, r.amount, r.status, r.provider_ref, r.failure_reason, r.updated_at
		FROM refunds r JOIN orders o ON o.id = r.order_id WHERE r.case_id = $1 ORDER BY r.created_at DESC LIMIT 1`, id).Scan(
		&rf.ID, &rf.CaseID, &rf.OrderID, &rf.OrderCode, &rf.Amount, &rf.Status, &rf.ProviderRef, &rf.FailureReason, &rf.UpdatedAt)
	if err == nil {
		rf.AllowedActions = refundActions(rf.Status)
		c.Refund = &rf
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	var payStatus string
	var payoutStatus *string
	if err := s.pool.QueryRow(ctx, `SELECT p.status, po.status FROM payments p LEFT JOIN payouts po ON po.order_id = p.order_id
		WHERE p.order_id = $1`, c.OrderID).Scan(&payStatus, &payoutStatus); err != nil {
		return nil, err
	}
	c.MoneyStatus = map[string]any{"payment": payStatus, "payout": payoutStatus}
	if c.Refund != nil {
		c.MoneyStatus["refund"] = c.Refund.Status
	}
	return &c, nil
}

func refundActions(status string) []string {
	switch status {
	case "APPROVED":
		return []string{"PROCESS"}
	case "FAILED":
		return []string{"RETRY"}
	}
	return []string{}
}

var partyAction = map[string]string{
	"AWAITING_SELLER":          "Người bán phản hồi yêu cầu trả hàng",
	"AWAITING_BUYER_INFO":      "Người mua bổ sung thông tin theo yêu cầu",
	"AWAITING_SELLER_DECISION": "Người bán quyết định sau khi người mua bổ sung",
	"AWAITING_BUYER_CHOICE":    "Người mua chọn chuyển RePrice giải quyết hoặc kết thúc",
	"ADMIN_REVIEW":             "RePrice xem xét hồ sơ",
	"PLAN_REVIEW":              "Hai bên có thể đề nghị xem xét lại phương án",
	"AWAITING_HANDOVER":        "Người mua gửi trả hàng",
	"RETURNING":                "Đơn vị vận chuyển đang chuyển hàng trả",
	"RETURN_INSPECTION":        "Người bán kiểm tra hàng trả",
	"REFUNDING":                "RePrice xử lý hoàn tiền",
}

func (c *SupportCase) decorate(viewerID string, isAdmin bool) {
	buyer, seller := viewerID == c.Buyer.ID, viewerID == c.Seller.ID
	acts := []string{}
	if !closedCaseStatus[c.Status] {
		party := "ADMIN"
		if c.awaiting != nil {
			party = *c.awaiting
		}
		c.NextStep = &NextStep{Party: party, Action: partyAction[c.Status], DueAt: c.dueAt}
		if buyer || seller {
			acts = append(acts, "ADD_EVIDENCE")
		}
	}
	switch c.Status {
	case "AWAITING_SELLER":
		if seller {
			acts = append(acts, "SELLER_AGREE", "SELLER_REJECT")
			if !c.SupplementUsed {
				acts = append(acts, "SELLER_REQUEST_INFO")
			}
		}
	case "AWAITING_SELLER_DECISION":
		if seller {
			acts = append(acts, "SELLER_AGREE", "SELLER_REJECT")
		}
	case "AWAITING_BUYER_INFO":
		if buyer {
			acts = append(acts, "BUYER_SUPPLEMENT")
		}
	case "AWAITING_BUYER_CHOICE":
		if buyer {
			acts = append(acts, "BUYER_ESCALATE", "BUYER_WITHDRAW")
		}
	case "AWAITING_HANDOVER":
		if buyer {
			acts = append(acts, "RETURN_HANDOVER")
		}
	case "RETURN_INSPECTION":
		if seller {
			acts = append(acts, "RETURN_INSPECT")
		}
	case "PLAN_REVIEW":
		if buyer || seller {
			acts = append(acts, "REQUEST_REVIEW")
		}
	}
	if c.Refund != nil && buyer && (c.Refund.Status == "SUCCEEDED" || c.Refund.Status == "PROCESSING") {
		acts = append(acts, "REPORT_REFUND_NOT_RECEIVED")
	}
	if isAdmin && !closedCaseStatus[c.Status] {
		if c.Status == "ADMIN_REVIEW" {
			acts = append(acts, "ADMIN_RESOLVE", "ADMIN_REQUEST_INFO", "ADMIN_VERIFY_SHIPPING")
		}
		if c.AssignedAdmin == nil || c.AssignedAdmin.ID != viewerID {
			acts = append(acts, "ADMIN_ASSIGN")
		}
	}
	if !isAdmin && c.Refund != nil {
		c.Refund.AllowedActions = []string{}
	}
	c.AllowedActions = acts
}

func (s *Service) GetCase(ctx context.Context, id, viewerID string, isAdmin bool) (*SupportCase, error) {
	c, err := s.loadCase(ctx, id)
	if err != nil {
		return nil, err
	}
	if viewerID != c.Buyer.ID && viewerID != c.Seller.ID && !isAdmin {
		return nil, notFound("hồ sơ")
	}
	c.decorate(viewerID, isAdmin)
	return c, nil
}

type CaseSummary struct {
	ID        string     `json:"id"`
	Code      string     `json:"code"`
	OrderID   string     `json:"orderId"`
	OrderCode string     `json:"orderCode"`
	Title     string     `json:"title"`
	Type      string     `json:"type"`
	Reason    string     `json:"reason"`
	Status    string     `json:"status"`
	Awaiting  *string    `json:"awaitingParty"`
	DueAt     *time.Time `json:"dueAt"`
	Overdue   bool       `json:"overdue"`
	Buyer     string     `json:"buyer"`
	Seller    string     `json:"seller"`
	Assigned  *string    `json:"assignedAdmin"`
	OpenedAt  time.Time  `json:"openedAt"`
	ClosedAt  *time.Time `json:"closedAt"`
}

// ListCases: userID rỗng = QTV xem tất cả; openOnly lọc hồ sơ chưa đóng.
func (s *Service) ListCases(ctx context.Context, userID, status string, openOnly bool) ([]CaseSummary, error) {
	now := s.clock.Now()
	rows, err := s.pool.Query(ctx, `SELECT c.id, c.code, o.id, o.code,
			(SELECT string_agg(i.snapshot->>'title', ', ') FROM order_items i WHERE i.order_id = o.id),
			c.type, c.reason, c.status, c.awaiting_party, c.due_at, b.full_name, sl.full_name, a.full_name, c.opened_at, c.closed_at
		FROM support_cases c JOIN orders o ON o.id = c.order_id JOIN users b ON b.id = o.buyer_id JOIN users sl ON sl.id = o.seller_id
		LEFT JOIN users a ON a.id = c.assigned_admin_id
		WHERE ($1 = '' OR o.buyer_id::text = $1 OR o.seller_id::text = $1)
		  AND ($2 = '' OR c.status = $2) AND (NOT $3 OR c.closed_at IS NULL)
		ORDER BY (c.closed_at IS NULL) DESC, c.due_at NULLS LAST, c.opened_at DESC LIMIT 200`, userID, status, openOnly)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CaseSummary{}
	for rows.Next() {
		var c CaseSummary
		if err := rows.Scan(&c.ID, &c.Code, &c.OrderID, &c.OrderCode, &c.Title, &c.Type, &c.Reason, &c.Status, &c.Awaiting,
			&c.DueAt, &c.Buyer, &c.Seller, &c.Assigned, &c.OpenedAt, &c.ClosedAt); err != nil {
			return nil, err
		}
		c.Overdue = c.ClosedAt == nil && c.DueAt != nil && now.After(*c.DueAt)
		out = append(out, c)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------- thao tác chung

type caseRow struct {
	id, code, orderID, status, buyer, seller string
	supplementUsed                           bool
	typ                                      string
}

func lockCase(ctx context.Context, tx pgx.Tx, id string) (*caseRow, error) {
	var c caseRow
	err := tx.QueryRow(ctx, `SELECT c.id, c.code, c.order_id, c.status, o.buyer_id, o.seller_id, c.supplement_used, c.type
		FROM support_cases c JOIN orders o ON o.id = c.order_id WHERE c.id = $1 FOR UPDATE OF c`, id).
		Scan(&c.id, &c.code, &c.orderID, &c.status, &c.buyer, &c.seller, &c.supplementUsed, &c.typ)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, notFound("hồ sơ")
	}
	return &c, err
}

// moveCase đổi trạng thái hồ sơ, ghi sự kiện, đặt bên cần làm và hạn.
func moveCase(ctx context.Context, tx pgx.Tx, now time.Time, c *caseRow, to, actorID, action, note string, awaiting string, due time.Duration) error {
	var dueAt, aw any
	if due > 0 {
		dueAt = now.Add(due)
	}
	if awaiting != "" {
		aw = awaiting
	}
	var closed any
	if closedCaseStatus[to] {
		closed = now
	}
	if _, err := tx.Exec(ctx, `UPDATE support_cases SET status=$2, awaiting_party=$3, due_at=$4, closed_at=$5 WHERE id=$1`,
		c.id, to, aw, dueAt, closed); err != nil {
		return err
	}
	var actor any
	if actorID != "" {
		actor = actorID
	}
	if _, err := tx.Exec(ctx, `INSERT INTO case_events (case_id, actor_id, action, from_status, to_status, note, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`, c.id, actor, action, c.status, to, note, now); err != nil {
		return err
	}
	from := c.status
	c.status = to
	if closedCaseStatus[to] && !closedCaseStatus[from] {
		return releaseOrderHold(ctx, tx, now, c)
	}
	return nil
}

// releaseOrderHold: hồ sơ đóng mà không hoàn tiền → đơn rời ON_HOLD về trạng thái trước đó;
// bộ lập lịch sẽ hoàn tất đơn khi qua hạn trả hàng.
func releaseOrderHold(ctx context.Context, tx pgx.Tx, now time.Time, c *caseRow) error {
	o, err := lockOrder(ctx, tx, c.orderID)
	if err != nil || o.status != "ON_HOLD" {
		return err
	}
	var received bool
	if err := tx.QueryRow(ctx, `SELECT received_at IS NOT NULL FROM orders WHERE id=$1`, o.id).Scan(&received); err != nil {
		return err
	}
	back := "DELIVERED"
	if received {
		back = "RECEIVED"
	}
	return setOrderStatus(ctx, tx, now, o, back, "", "Hồ sơ "+c.code+" đã đóng")
}

// caseAct khóa hồ sơ, kiểm tra người gọi là bên của đơn (hoặc QTV) rồi chạy fn.
func (s *Service) caseAct(ctx context.Context, id, userID string, isAdmin bool, fn func(tx pgx.Tx, c *caseRow, now time.Time) error) (*SupportCase, error) {
	err := s.tx(ctx, func(tx pgx.Tx) error {
		c, err := lockCase(ctx, tx, id)
		if err != nil {
			return err
		}
		if !isAdmin && userID != c.buyer && userID != c.seller {
			return notFound("hồ sơ")
		}
		return fn(tx, c, s.clock.Now())
	})
	if err != nil {
		return nil, err
	}
	return s.GetCase(ctx, id, userID, isAdmin)
}

func notifyParties(ctx context.Context, tx pgx.Tx, now time.Time, c *caseRow, title, body string, who ...string) error {
	for _, u := range who {
		if err := notify(ctx, tx, now, u, "CASE_UPDATE", title, body, "/cases/"+c.id); err != nil {
			return err
		}
	}
	return nil
}

// ---------------------------------------------------------------- người mua mở hồ sơ

var caseReasons = map[string]bool{"WRONG_DEVICE": true, "NOT_AS_DESCRIBED": true, "UNDISCLOSED_FAULT": true,
	"MISSING_ACCESSORY": true, "SHIPPING_DAMAGE": true, "NOT_RECEIVED": true, "OTHER": true}

// OpenCase: trả hàng (trước hạn), báo chưa nhận hàng, hoặc khiếu nại (UC50, UC51, UC61).
func (s *Service) OpenCase(ctx context.Context, orderID, buyerID, typ, reason, description string, discoveredAt *time.Time) (*SupportCase, error) {
	if typ != "RETURN" && typ != "NOT_RECEIVED" && typ != "COMPLAINT" {
		return nil, apperr.Field("type", "Loại hồ sơ không hợp lệ.")
	}
	if typ == "NOT_RECEIVED" {
		reason = "NOT_RECEIVED"
	}
	if !caseReasons[reason] {
		return nil, apperr.Field("reason", "Chọn lý do.")
	}
	if strings.TrimSpace(description) == "" {
		return nil, apperr.Field("description", "Mô tả vấn đề.")
	}
	var caseID string
	err := s.tx(ctx, func(tx pgx.Tx) error {
		now := s.clock.Now()
		o, err := lockOrder(ctx, tx, orderID)
		if err != nil {
			return err
		}
		if buyerID != o.buyer {
			return forbidden("Chỉ người mua mở hồ sơ cho đơn này.")
		}
		var open string
		err = tx.QueryRow(ctx, `SELECT id FROM support_cases WHERE order_id=$1 AND closed_at IS NULL`, o.id).Scan(&open)
		if err == nil {
			return &apperr.Error{Code: apperr.Conflict, Message: "Đơn đã có hồ sơ đang xử lý, hãy bổ sung vào hồ sơ đó.",
				Details: map[string]any{"openCaseId": open}}
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		var deadline *time.Time
		if err := tx.QueryRow(ctx, `SELECT return_deadline FROM orders WHERE id=$1`, o.id).Scan(&deadline); err != nil {
			return err
		}
		inWindow := o.status == "DELIVERED" || o.status == "RECEIVED"
		switch typ {
		case "RETURN":
			if !inWindow {
				return invalidState("Chỉ yêu cầu trả hàng khi đơn đã giao và còn trong thời hạn kiểm tra.")
			}
			if deadline != nil && !now.Before(*deadline) {
				return apperr.New(apperr.DeadlinePassed, "Đã quá hạn yêu cầu trả hàng. Bạn vẫn có thể gửi khiếu nại.")
			}
		case "NOT_RECEIVED":
			if !inWindow {
				return invalidState("Chỉ báo chưa nhận hàng khi đơn vị vận chuyển đã báo giao.")
			}
		case "COMPLAINT":
			if !inWindow && o.status != "COMPLETED" {
				return invalidState("Chỉ gửi khiếu nại sau khi đơn đã được giao.")
			}
		}
		var seq int64
		if err := tx.QueryRow(ctx, `SELECT nextval('case_code_seq')`).Scan(&seq); err != nil {
			return err
		}
		status, awaiting, due := "ADMIN_REVIEW", "ADMIN", time.Duration(0)
		if typ == "RETURN" {
			status, awaiting, due = "AWAITING_SELLER", "SELLER", SellerResponseWindow
		}
		var dueAt any
		if due > 0 {
			dueAt = now.Add(due)
		}
		code := fmt.Sprintf("HS-%s-%04d", now.Format("20060102"), seq%10000)
		if err := tx.QueryRow(ctx, `INSERT INTO support_cases (code, order_id, type, reason, description, discovered_at, status,
			awaiting_party, due_at, opened_by, opened_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
			code, o.id, typ, reason, strings.TrimSpace(description), discoveredAt, status, awaiting, dueAt, buyerID, now).Scan(&caseID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO support_case_items (case_id, order_item_id) SELECT $1, id FROM order_items WHERE order_id=$2`,
			caseID, o.id); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO case_events (case_id, actor_id, action, to_status, note, created_at)
			VALUES ($1,$2,'OPEN',$3,$4,$5)`, caseID, buyerID, status, strings.TrimSpace(description), now); err != nil {
			return err
		}
		// Hồ sơ trong thời hạn kiểm tra: tạm dừng hoàn tất đơn và chuyển tiền.
		if inWindow {
			if err := setOrderStatus(ctx, tx, now, o, "ON_HOLD", buyerID, "Mở hồ sơ "+code); err != nil {
				return err
			}
		}
		c := &caseRow{id: caseID, code: code}
		if typ == "RETURN" {
			return notifyParties(ctx, tx, now, c, "Người mua yêu cầu trả hàng đơn "+o.code,
				"Phản hồi trong 48 giờ: đồng ý, từ chối hoặc yêu cầu bổ sung.", o.seller)
		}
		return notifyParties(ctx, tx, now, c, "Đơn "+o.code+" có hồ sơ "+code, "RePrice đang xem xét.", o.seller)
	})
	if err != nil {
		return nil, err
	}
	return s.GetCase(ctx, caseID, buyerID, false)
}

// AddEvidence ghi bằng chứng (ghi chú + file đã lưu). Khi QTV đang chờ bổ sung từ bên này, trả lượt về QTV.
func (s *Service) AddEvidence(ctx context.Context, id, userID, note string, files []EvidenceFile) (*SupportCase, error) {
	if strings.TrimSpace(note) == "" && len(files) == 0 {
		return nil, apperr.Field("note", "Nhập ghi chú hoặc chọn tệp.")
	}
	return s.caseAct(ctx, id, userID, false, func(tx pgx.Tx, c *caseRow, now time.Time) error {
		if closedCaseStatus[c.status] {
			return invalidState("Hồ sơ đã đóng.")
		}
		var eid string
		if err := tx.QueryRow(ctx, `INSERT INTO evidence (case_id, uploaded_by, note, created_at) VALUES ($1,$2,$3,$4) RETURNING id`,
			c.id, userID, strings.TrimSpace(note), now).Scan(&eid); err != nil {
			return err
		}
		for _, f := range files {
			if _, err := tx.Exec(ctx, `INSERT INTO evidence_files (evidence_id, file_name, mime_type, size_bytes, storage_url)
				VALUES ($1,$2,$3,$4,$5)`, eid, f.FileName, f.MimeType, f.SizeBytes, f.URL); err != nil {
				return err
			}
		}
		var awaiting *string
		if err := tx.QueryRow(ctx, `SELECT awaiting_party FROM support_cases WHERE id=$1`, c.id).Scan(&awaiting); err != nil {
			return err
		}
		role := "BUYER"
		if userID == c.seller {
			role = "SELLER"
		}
		if c.status == "ADMIN_REVIEW" && awaiting != nil && *awaiting == role {
			return moveCase(ctx, tx, now, c, "ADMIN_REVIEW", userID, "SUPPLEMENT", note, "ADMIN", 0)
		}
		_, err := tx.Exec(ctx, `INSERT INTO case_events (case_id, actor_id, action, note, created_at) VALUES ($1,$2,'EVIDENCE',$3,$4)`,
			c.id, userID, note, now)
		return err
	})
}

// ---------------------------------------------------------------- người bán / người mua trao đổi trực tiếp

// SellerRespond: đồng ý (tạo vận đơn trả về địa chỉ người bán), từ chối, hoặc yêu cầu bổ sung 1 lượt (UC53).
func (s *Service) SellerRespond(ctx context.Context, id, userID, action, message string, addr *ShippingInfo) (*SupportCase, error) {
	message = strings.TrimSpace(message)
	return s.caseAct(ctx, id, userID, false, func(tx pgx.Tx, c *caseRow, now time.Time) error {
		if userID != c.seller {
			return forbidden("Chỉ người bán phản hồi yêu cầu này.")
		}
		if c.status != "AWAITING_SELLER" && c.status != "AWAITING_SELLER_DECISION" {
			return invalidState("Hồ sơ không chờ người bán phản hồi.")
		}
		switch action {
		case "AGREE":
			if err := startReturn(ctx, tx, now, c, userID, addr, "Người bán đồng ý trả hàng"); err != nil {
				return err
			}
			return notifyParties(ctx, tx, now, c, "Người bán đồng ý trả hàng", "Gửi trả máy trong 3 ngày theo hướng dẫn trong hồ sơ.", c.buyer)
		case "REJECT":
			if message == "" {
				return apperr.Field("message", "Nhập lý do từ chối.")
			}
			if err := moveCase(ctx, tx, now, c, "AWAITING_BUYER_CHOICE", userID, "SELLER_REJECT", message, "BUYER", BuyerChoiceWindow); err != nil {
				return err
			}
			return notifyParties(ctx, tx, now, c, "Người bán từ chối yêu cầu trả hàng",
				"Bạn có 48 giờ để chuyển RePrice giải quyết hoặc kết thúc yêu cầu.", c.buyer)
		case "REQUEST_INFO":
			if c.status != "AWAITING_SELLER" || c.supplementUsed {
				return invalidState("Người bán chỉ được yêu cầu bổ sung một lần.")
			}
			if message == "" {
				return apperr.Field("message", "Ghi rõ cần bổ sung gì.")
			}
			if _, err := tx.Exec(ctx, `UPDATE support_cases SET supplement_used = true WHERE id=$1`, c.id); err != nil {
				return err
			}
			if err := moveCase(ctx, tx, now, c, "AWAITING_BUYER_INFO", userID, "SELLER_REQUEST_INFO", message, "BUYER", BuyerSupplementWindow); err != nil {
				return err
			}
			return notifyParties(ctx, tx, now, c, "Người bán cần thêm thông tin", message, c.buyer)
		}
		return apperr.Field("action", "Chọn AGREE, REJECT hoặc REQUEST_INFO.")
	})
}

// startReturn tạo vận đơn trả về người bán và chuyển hồ sơ sang chờ người mua bàn giao (3 ngày).
func startReturn(ctx context.Context, tx pgx.Tx, now time.Time, c *caseRow, actorID string, addr *ShippingInfo, note string) error {
	if addr == nil || strings.TrimSpace(addr.AddressLine) == "" {
		// Mặc định trả về khu vực tài khoản người bán.
		a := ShippingInfo{}
		if err := tx.QueryRow(ctx, `SELECT full_name, phone, province, ward FROM users WHERE id=$1`, c.seller).
			Scan(&a.RecipientName, &a.RecipientPhone, &a.Province, &a.Ward); err != nil {
			return err
		}
		a.AddressLine = "Địa chỉ người bán đăng ký trên RePrice"
		addr = &a
	}
	raw, _ := json.Marshal(addr)
	if _, err := tx.Exec(ctx, `UPDATE support_cases SET return_recipient=$2 WHERE id=$1`, c.id, raw); err != nil {
		return err
	}
	var seq int64
	if err := tx.QueryRow(ctx, `SELECT nextval('tracking_code_seq')`).Scan(&seq); err != nil {
		return err
	}
	var shipID string
	if err := tx.QueryRow(ctx, `INSERT INTO shipments (order_id, support_case_id, direction, tracking_code, carrier, created_at)
		VALUES ($1,$2,'RETURN',$3,$4,$5) RETURNING id`, c.orderID, c.id, fmt.Sprintf("RPR%s%05d", now.Format("060102"), seq%100000),
		Carrier, now).Scan(&shipID); err != nil {
		return err
	}
	if err := shipmentEvent(ctx, tx, now, shipID, "AWAITING_PICKUP", "Vận đơn trả hàng đã tạo, chờ người mua bàn giao"); err != nil {
		return err
	}
	return moveCase(ctx, tx, now, c, "AWAITING_HANDOVER", actorID, "RETURN_APPROVED", note, "BUYER", ReturnHandoverWindow)
}

func (s *Service) BuyerSupplement(ctx context.Context, id, userID, message string) (*SupportCase, error) {
	if strings.TrimSpace(message) == "" {
		return nil, apperr.Field("message", "Nhập nội dung bổ sung, hoặc lý do không cung cấp được.")
	}
	return s.caseAct(ctx, id, userID, false, func(tx pgx.Tx, c *caseRow, now time.Time) error {
		if userID != c.buyer || c.status != "AWAITING_BUYER_INFO" {
			return invalidState("Hồ sơ không chờ người mua bổ sung.")
		}
		if err := moveCase(ctx, tx, now, c, "AWAITING_SELLER_DECISION", userID, "BUYER_SUPPLEMENT", message, "SELLER", SellerDecisionWindow); err != nil {
			return err
		}
		return notifyParties(ctx, tx, now, c, "Người mua đã bổ sung thông tin", "Quyết định đồng ý hoặc từ chối trong 24 giờ.", c.seller)
	})
}

func (s *Service) BuyerChoice(ctx context.Context, id, userID, action, note string) (*SupportCase, error) {
	return s.caseAct(ctx, id, userID, false, func(tx pgx.Tx, c *caseRow, now time.Time) error {
		if userID != c.buyer || c.status != "AWAITING_BUYER_CHOICE" {
			return invalidState("Hồ sơ không chờ người mua lựa chọn.")
		}
		switch action {
		case "ESCALATE":
			if err := moveCase(ctx, tx, now, c, "ADMIN_REVIEW", userID, "ESCALATE", note, "ADMIN", 0); err != nil {
				return err
			}
			return notifyParties(ctx, tx, now, c, "Hồ sơ "+c.code+" chuyển RePrice giải quyết", "", c.seller)
		case "WITHDRAW":
			if err := moveCase(ctx, tx, now, c, "WITHDRAWN", userID, "WITHDRAW", note, "", 0); err != nil {
				return err
			}
			return notifyParties(ctx, tx, now, c, "Người mua đã kết thúc yêu cầu "+c.code, "", c.seller)
		}
		return apperr.Field("action", "Chọn ESCALATE hoặc WITHDRAW.")
	})
}

// ReturnHandover: người mua bàn giao hàng trả; có trở ngại thì chuyển QTV (UC57).
func (s *Service) ReturnHandover(ctx context.Context, id, userID, obstacle string) (*SupportCase, error) {
	return s.caseAct(ctx, id, userID, false, func(tx pgx.Tx, c *caseRow, now time.Time) error {
		if userID != c.buyer || c.status != "AWAITING_HANDOVER" {
			return invalidState("Hồ sơ không chờ người mua gửi trả hàng.")
		}
		if strings.TrimSpace(obstacle) != "" {
			return moveCase(ctx, tx, now, c, "ADMIN_REVIEW", userID, "RETURN_OBSTACLE", obstacle, "ADMIN", 0)
		}
		var shipID string
		if err := tx.QueryRow(ctx, `SELECT id FROM shipments WHERE support_case_id=$1 AND status='AWAITING_PICKUP'
			ORDER BY created_at DESC LIMIT 1`, c.id).Scan(&shipID); err != nil {
			return err
		}
		if err := shipmentEvent(ctx, tx, now, shipID, "PICKED_UP", "Người mua đã bàn giao hàng trả"); err != nil {
			return err
		}
		if err := moveCase(ctx, tx, now, c, "RETURNING", userID, "RETURN_HANDOVER", "", "", 0); err != nil {
			return err
		}
		return notifyParties(ctx, tx, now, c, "Hàng trả đang được chuyển về", "Hồ sơ "+c.code, c.seller)
	})
}

// returnDelivered: vận đơn trả giao tới người bán → người bán có 48 giờ kiểm tra.
func returnDelivered(ctx context.Context, tx pgx.Tx, now time.Time, caseID string) error {
	c, err := lockCase(ctx, tx, caseID)
	if err != nil || c.status != "RETURNING" {
		return err
	}
	if err := moveCase(ctx, tx, now, c, "RETURN_INSPECTION", "", "RETURN_DELIVERED", "Hàng trả đã tới người bán", "SELLER", ReturnInspectWindow); err != nil {
		return err
	}
	return notifyParties(ctx, tx, now, c, "Hàng trả đã tới", "Kiểm tra trong 48 giờ; quá hạn không phản ánh thì RePrice hoàn tiền cho người mua.", c.seller)
}

// ReturnInspection: người bán xác nhận hàng trả phù hợp (→ hoàn tiền) hoặc báo vấn đề (→ QTV) (UC58).
func (s *Service) ReturnInspection(ctx context.Context, id, userID, result, problem, message string) (*SupportCase, error) {
	return s.caseAct(ctx, id, userID, false, func(tx pgx.Tx, c *caseRow, now time.Time) error {
		if userID != c.seller || c.status != "RETURN_INSPECTION" {
			return invalidState("Hồ sơ không chờ người bán kiểm tra hàng trả.")
		}
		if result == "PROBLEM" {
			if strings.TrimSpace(message) == "" {
				return apperr.Field("message", "Mô tả vấn đề của hàng trả.")
			}
			return moveCase(ctx, tx, now, c, "ADMIN_REVIEW", userID, "RETURN_PROBLEM", problem+": "+message, "ADMIN", 0)
		}
		if result != "OK" {
			return apperr.Field("result", "Chọn OK hoặc PROBLEM.")
		}
		return startRefund(ctx, tx, now, c, userID, nil, "Người bán xác nhận hàng trả phù hợp")
	})
}

// startRefund tạo lệnh hoàn toàn bộ tiền hàng (hoặc số tiền phương án) và chuyển hồ sơ sang REFUNDING.
func startRefund(ctx context.Context, tx pgx.Tx, now time.Time, c *caseRow, actorID string, amount *int64, note string) error {
	var goods, paid int64
	var payStatus string
	if err := tx.QueryRow(ctx, `SELECT (SELECT sum(agreed_price) FROM order_items WHERE order_id=$1), p.amount, p.status
		FROM payments p WHERE p.order_id=$1`, c.orderID).Scan(&goods, &paid, &payStatus); err != nil {
		return err
	}
	if payStatus != "PAID" && payStatus != "COD_COLLECTED" {
		return invalidState("Đơn chưa thu tiền nên không có khoản để hoàn.")
	}
	refund := goods
	if amount != nil {
		refund = *amount
	}
	if refund <= 0 || refund > paid {
		return apperr.Field("refundAmount", "Số tiền hoàn không hợp lệ.")
	}
	if _, err := tx.Exec(ctx, `INSERT INTO refunds (case_id, order_id, amount, created_at, updated_at) VALUES ($1,$2,$3,$4,$4)`,
		c.id, c.orderID, refund, now); err != nil {
		return err
	}
	if err := moveCase(ctx, tx, now, c, "REFUNDING", actorID, "REFUND_APPROVED", note, "ADMIN", 0); err != nil {
		return err
	}
	return notifyParties(ctx, tx, now, c, "Đã duyệt hoàn "+vnd(refund), "Hồ sơ "+c.code+" đang xử lý hoàn tiền.", c.buyer, c.seller)
}

func (s *Service) RequestReview(ctx context.Context, id, userID, reason string) (*SupportCase, error) {
	if strings.TrimSpace(reason) == "" {
		return nil, apperr.Field("reason", "Nhập lý do đề nghị xem xét lại.")
	}
	return s.caseAct(ctx, id, userID, false, func(tx pgx.Tx, c *caseRow, now time.Time) error {
		if c.status != "PLAN_REVIEW" {
			return invalidState("Hồ sơ không trong thời hạn xem xét lại.")
		}
		if _, err := tx.Exec(ctx, `UPDATE resolutions SET is_current = false WHERE case_id=$1 AND is_current`, c.id); err != nil {
			return err
		}
		return moveCase(ctx, tx, now, c, "ADMIN_REVIEW", userID, "REQUEST_REVIEW", reason, "ADMIN", 0)
	})
}

func (s *Service) ReportRefundNotReceived(ctx context.Context, id, userID, note string) (*SupportCase, error) {
	return s.caseAct(ctx, id, userID, false, func(tx pgx.Tx, c *caseRow, now time.Time) error {
		if userID != c.buyer {
			return forbidden("Chỉ người mua báo chưa nhận tiền hoàn.")
		}
		_, err := tx.Exec(ctx, `INSERT INTO case_events (case_id, actor_id, action, note, created_at) VALUES ($1,$2,'REFUND_NOT_RECEIVED',$3,$4)`,
			c.id, userID, note, now)
		return err
	})
}

// ---------------------------------------------------------------- QTV

func (s *Service) AssignCase(ctx context.Context, id, adminID string) (*SupportCase, error) {
	return s.caseAct(ctx, id, adminID, true, func(tx pgx.Tx, c *caseRow, now time.Time) error {
		_, err := tx.Exec(ctx, `UPDATE support_cases SET assigned_admin_id=$2 WHERE id=$1`, c.id, adminID)
		if err == nil {
			_, err = tx.Exec(ctx, `INSERT INTO case_events (case_id, actor_id, action, note, created_at) VALUES ($1,$2,'ASSIGN','Nhận xử lý',$3)`,
				c.id, adminID, now)
		}
		return err
	})
}

// AdminRequestInfo: QTV yêu cầu một bên bổ sung; bên đó trả lời bằng cách thêm bằng chứng.
func (s *Service) AdminRequestInfo(ctx context.Context, id, adminID, party, message string, due time.Duration) (*SupportCase, error) {
	if party != "BUYER" && party != "SELLER" {
		return nil, apperr.Field("party", "Chọn BUYER hoặc SELLER.")
	}
	if strings.TrimSpace(message) == "" {
		return nil, apperr.Field("message", "Ghi rõ nội dung cần bổ sung.")
	}
	return s.caseAct(ctx, id, adminID, true, func(tx pgx.Tx, c *caseRow, now time.Time) error {
		if c.status != "ADMIN_REVIEW" {
			return invalidState("Chỉ yêu cầu bổ sung khi hồ sơ đang ở RePrice.")
		}
		if err := moveCase(ctx, tx, now, c, "ADMIN_REVIEW", adminID, "ADMIN_REQUEST_INFO", message, party, due); err != nil {
			return err
		}
		who := c.buyer
		if party == "SELLER" {
			who = c.seller
		}
		return notifyParties(ctx, tx, now, c, "RePrice cần bạn bổ sung thông tin", message, who)
	})
}

// AdminVerifyShipping ghi yêu cầu xác minh gửi đơn vị vận chuyển (mô phỏng) và có thể ghi luôn phản hồi.
func (s *Service) AdminVerifyShipping(ctx context.Context, id, adminID, question, outcome, response string) (*SupportCase, error) {
	if strings.TrimSpace(question) == "" {
		return nil, apperr.Field("question", "Nhập câu hỏi gửi đơn vị vận chuyển.")
	}
	return s.caseAct(ctx, id, adminID, true, func(tx pgx.Tx, c *caseRow, now time.Time) error {
		var shipID string
		if err := tx.QueryRow(ctx, `SELECT id FROM shipments WHERE order_id=$1 ORDER BY (support_case_id = $2) DESC NULLS LAST, created_at DESC LIMIT 1`,
			c.orderID, c.id).Scan(&shipID); err != nil {
			return apperr.New(apperr.InvalidState, "Đơn chưa có vận đơn để xác minh.")
		}
		status, var1, var2 := "SENT", any(nil), any(nil)
		var respAt any
		if outcome != "" {
			status, var1, var2, respAt = "RESPONDED", outcome, response, now
		}
		if _, err := tx.Exec(ctx, `INSERT INTO shipping_verifications (case_id, shipment_id, ticket_code, question, status, outcome, response, sent_at, responded_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, c.id, shipID, fmt.Sprintf("VC-%d", now.Unix()%1000000), question, status, var1, var2, now, respAt); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `INSERT INTO case_events (case_id, actor_id, action, note, created_at) VALUES ($1,$2,'VERIFY_SHIPPING',$3,$4)`,
			c.id, adminID, question, now)
		return err
	})
}

// AdminResolve ban hành phương án; hai bên có 48 giờ đề nghị xem xét lại trước khi phương án có hiệu lực.
func (s *Service) AdminResolve(ctx context.Context, id, adminID, decision, rationale string, refundAmount *int64) (*SupportCase, error) {
	if strings.TrimSpace(rationale) == "" {
		return nil, apperr.Field("rationale", "Nêu căn cứ và lý do của phương án.")
	}
	requiresReturn := decision == "APPROVE_RETURN"
	switch decision {
	case "APPROVE_RETURN", "REFUND_NO_RETURN", "REJECT":
	case "CONTINUE_VERIFY":
	default:
		return nil, apperr.Field("decision", "Phương án không hợp lệ.")
	}
	return s.caseAct(ctx, id, adminID, true, func(tx pgx.Tx, c *caseRow, now time.Time) error {
		if c.status != "ADMIN_REVIEW" {
			return invalidState("Chỉ ban hành phương án khi hồ sơ đang ở RePrice.")
		}
		if decision == "CONTINUE_VERIFY" {
			_, err := tx.Exec(ctx, `INSERT INTO case_events (case_id, actor_id, action, note, created_at) VALUES ($1,$2,'CONTINUE_VERIFY',$3,$4)`,
				c.id, adminID, rationale, now)
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE resolutions SET is_current = false WHERE case_id=$1 AND is_current`, c.id); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO resolutions (case_id, issued_by, decision, rationale, requires_return, refund_amount,
			review_deadline, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
			c.id, adminID, decision, rationale, requiresReturn, refundAmount, now.Add(PlanReviewWindow), now); err != nil {
			return err
		}
		if err := moveCase(ctx, tx, now, c, "PLAN_REVIEW", adminID, "PLAN_ISSUED", rationale, "", PlanReviewWindow); err != nil {
			return err
		}
		return notifyParties(ctx, tx, now, c, "RePrice đã ban hành phương án cho "+c.code,
			"Phương án có hiệu lực sau 48 giờ nếu không có đề nghị xem xét lại.", c.buyer, c.seller)
	})
}

// applyPlan: hết 48 giờ xem xét lại → thực hiện phương án hiện hành.
func applyPlan(ctx context.Context, tx pgx.Tx, now time.Time, caseID string) error {
	c, err := lockCase(ctx, tx, caseID)
	if err != nil || c.status != "PLAN_REVIEW" {
		return err
	}
	var decision, adminID string
	var amount *int64
	if err := tx.QueryRow(ctx, `SELECT decision, issued_by, refund_amount FROM resolutions WHERE case_id=$1 AND is_current`, c.id).
		Scan(&decision, &adminID, &amount); err != nil {
		return err
	}
	switch decision {
	case "APPROVE_RETURN":
		return startReturn(ctx, tx, now, c, "", nil, "Phương án có hiệu lực: trả hàng và hoàn tiền")
	case "REFUND_NO_RETURN":
		return startRefund(ctx, tx, now, c, "", amount, "Phương án có hiệu lực: hoàn tiền không cần trả máy")
	default:
		if err := moveCase(ctx, tx, now, c, "REJECTED", "", "PLAN_EFFECTIVE", "Phương án có hiệu lực: không chấp thuận yêu cầu", "", 0); err != nil {
			return err
		}
		return notifyParties(ctx, tx, now, c, "Hồ sơ "+c.code+" đã đóng", "Yêu cầu không được chấp thuận.", c.buyer, c.seller)
	}
}

// ---------------------------------------------------------------- hoàn tiền

func (s *Service) ListRefunds(ctx context.Context) ([]Refund, error) {
	rows, err := s.pool.Query(ctx, `SELECT r.id, r.case_id, r.order_id, o.code, r.amount, r.status, r.provider_ref, r.failure_reason, r.updated_at
		FROM refunds r JOIN orders o ON o.id = r.order_id ORDER BY (r.status IN ('SUCCEEDED')), r.updated_at DESC LIMIT 200`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Refund{}
	for rows.Next() {
		var r Refund
		if err := rows.Scan(&r.ID, &r.CaseID, &r.OrderID, &r.OrderCode, &r.Amount, &r.Status, &r.ProviderRef, &r.FailureReason, &r.UpdatedAt); err != nil {
			return nil, err
		}
		r.AllowedActions = refundActions(r.Status)
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Service) getRefund(ctx context.Context, id string) (*Refund, error) {
	var r Refund
	err := s.pool.QueryRow(ctx, `SELECT r.id, r.case_id, r.order_id, o.code, r.amount, r.status, r.provider_ref, r.failure_reason, r.updated_at
		FROM refunds r JOIN orders o ON o.id = r.order_id WHERE r.id=$1`, id).
		Scan(&r.ID, &r.CaseID, &r.OrderID, &r.OrderCode, &r.Amount, &r.Status, &r.ProviderRef, &r.FailureReason, &r.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, notFound("lệnh hoàn tiền")
	}
	r.AllowedActions = refundActions(r.Status)
	return &r, err
}

// ProcessRefund: QTV gửi lệnh hoàn (APPROVED → PROCESSING) hoặc gửi lại sau khi xác nhận lần trước thất bại.
func (s *Service) ProcessRefund(ctx context.Context, id, adminID string, retry bool) (*Refund, error) {
	err := s.tx(ctx, func(tx pgx.Tx) error {
		now := s.clock.Now()
		var status string
		if err := tx.QueryRow(ctx, `SELECT status FROM refunds WHERE id=$1 FOR UPDATE`, id).Scan(&status); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return notFound("lệnh hoàn tiền")
			}
			return err
		}
		want := "APPROVED"
		if retry {
			want = "FAILED"
		}
		if status != want {
			return invalidState("Không thể gửi lệnh hoàn ở trạng thái " + status + ".")
		}
		_, err := tx.Exec(ctx, `UPDATE refunds SET status='PROCESSING', failure_reason=NULL, updated_at=$2 WHERE id=$1`, id, now)
		return err
	})
	if err != nil {
		return nil, err
	}
	return s.getRefund(ctx, id)
}

// RefundResult là kết quả từ cổng thanh toán (mô phỏng): SUCCEEDED, FAILED, hoặc UNKNOWN (→ chờ đối soát).
func (s *Service) RefundResult(ctx context.Context, id, result string) (*Refund, error) {
	err := s.tx(ctx, func(tx pgx.Tx) error {
		now := s.clock.Now()
		var status, orderID string
		var caseID *string
		var amount int64
		if err := tx.QueryRow(ctx, `SELECT status, order_id, case_id, amount FROM refunds WHERE id=$1 FOR UPDATE`, id).
			Scan(&status, &orderID, &caseID, &amount); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return notFound("lệnh hoàn tiền")
			}
			return err
		}
		if status != "PROCESSING" && status != "RECONCILING" {
			return invalidState("Lệnh hoàn chưa được gửi.")
		}
		switch result {
		case "FAILED":
			_, err := tx.Exec(ctx, `UPDATE refunds SET status='FAILED', failure_reason='Bên thanh toán từ chối giao dịch (mô phỏng)', updated_at=$2 WHERE id=$1`, id, now)
			return err
		case "UNKNOWN":
			_, err := tx.Exec(ctx, `UPDATE refunds SET status='RECONCILING', updated_at=$2 WHERE id=$1`, id, now)
			return err
		case "SUCCEEDED":
		default:
			return apperr.Field("result", "Chọn SUCCEEDED, FAILED hoặc UNKNOWN.")
		}
		if _, err := tx.Exec(ctx, `UPDATE refunds SET status='SUCCEEDED', provider_ref=$2, updated_at=$3 WHERE id=$1`,
			id, fmt.Sprintf("SIM-RF-%d", now.UnixNano()%1_000_000_000), now); err != nil {
			return err
		}
		return refundSucceeded(ctx, tx, now, orderID, caseID, amount)
	})
	if err != nil {
		return nil, err
	}
	return s.getRefund(ctx, id)
}

// refundSucceeded: đóng hồ sơ, đơn REFUNDED, tiền người bán hoàn lại, tin tạm ẩn, giao dịch bị loại / thu hồi khỏi dữ liệu giá.
func refundSucceeded(ctx context.Context, tx pgx.Tx, now time.Time, orderID string, caseID *string, amount int64) error {
	if _, err := tx.Exec(ctx, `UPDATE payouts SET status='REVERSED' WHERE order_id=$1`, orderID); err != nil {
		return err
	}
	o, err := lockOrder(ctx, tx, orderID)
	if err != nil {
		return err
	}
	if caseID != nil {
		c, err := lockCase(ctx, tx, *caseID)
		if err != nil {
			return err
		}
		if !closedCaseStatus[c.status] {
			// Đóng hồ sơ trực tiếp (không trả đơn về trạng thái trước), đơn chuyển REFUNDED bên dưới.
			if _, err := tx.Exec(ctx, `UPDATE support_cases SET status='RESOLVED', awaiting_party=NULL, due_at=NULL, closed_at=$2 WHERE id=$1`, c.id, now); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `INSERT INTO case_events (case_id, action, from_status, to_status, note, created_at)
				VALUES ($1,'REFUND_SUCCEEDED',$2,'RESOLVED',$3,$4)`, c.id, c.status, "Hoàn "+vnd(amount)+" thành công", now); err != nil {
				return err
			}
		}
		if o.status != "CANCELLED" {
			if err := setOrderStatus(ctx, tx, now, o, "REFUNDED", "", "Hoàn tiền thành công"); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `UPDATE listings SET status='PAUSED', updated_at=$2
				WHERE id IN (SELECT listing_id FROM order_items WHERE order_id=$1) AND status IN ('IN_TRANSACTION','SOLD')`, orderID, now); err != nil {
				return err
			}
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE reference_transactions SET
			status = CASE WHEN status = 'ELIGIBLE' THEN 'REVOKED' ELSE 'EXCLUDED' END, updated_at = $2
		WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id=$1) AND status <> 'REVOKED'`, orderID, now); err != nil {
		return err
	}
	for _, u := range []string{o.buyer, o.seller} {
		if err := notify(ctx, tx, now, u, "REFUND_SUCCEEDED", "Đã hoàn "+vnd(amount)+" cho đơn "+o.code, "Giao dịch mô phỏng.", "/orders/"+o.id); err != nil {
			return err
		}
	}
	return nil
}

// ---------------------------------------------------------------- bộ lập lịch

// runCaseDeadlines: quá hạn phản hồi → chuyển QTV; người bán không kiểm tra hàng trả → hoàn tiền;
// hết 48 giờ xem xét lại → thực hiện phương án.
func (s *Service) runCaseDeadlines(ctx context.Context) (int, error) {
	now := s.clock.Now()
	rows, err := s.pool.Query(ctx, `SELECT id, status FROM support_cases WHERE closed_at IS NULL AND due_at <= $1
		AND status IN ('AWAITING_SELLER','AWAITING_SELLER_DECISION','AWAITING_BUYER_INFO','AWAITING_BUYER_CHOICE',
			'AWAITING_HANDOVER','RETURN_INSPECTION','PLAN_REVIEW')`, now)
	if err != nil {
		return 0, err
	}
	type due struct{ id, status string }
	list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (due, error) {
		var d due
		err := r.Scan(&d.id, &d.status)
		return d, err
	})
	if err != nil {
		return 0, err
	}
	n := 0
	for _, d := range list {
		err := s.tx(ctx, func(tx pgx.Tx) error {
			switch d.status {
			case "PLAN_REVIEW":
				return applyPlan(ctx, tx, now, d.id)
			case "RETURN_INSPECTION":
				c, err := lockCase(ctx, tx, d.id)
				if err != nil || c.status != "RETURN_INSPECTION" {
					return err
				}
				return startRefund(ctx, tx, now, c, "", nil, "Quá 48 giờ người bán không phản ánh hàng trả")
			default:
				c, err := lockCase(ctx, tx, d.id)
				if err != nil || c.status != d.status {
					return err
				}
				if err := moveCase(ctx, tx, now, c, "ADMIN_REVIEW", "", "OVERDUE", "Quá hạn phản hồi, chuyển RePrice xử lý", "ADMIN", 0); err != nil {
					return err
				}
				return notifyParties(ctx, tx, now, c, "Hồ sơ "+c.code+" chuyển RePrice xử lý", "Một bên đã quá hạn phản hồi.", c.buyer, c.seller)
			}
		})
		if err != nil {
			return n, fmt.Errorf("case %s: %w", d.id, err)
		}
		n++
	}
	return n, nil
}
