package trade

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"reprice/internal/apperr"
)

type Offer struct {
	ID        string    `json:"id"`
	By        string    `json:"by"`
	Amount    int64     `json:"amount"`
	Note      string    `json:"note"`
	CreatedAt time.Time `json:"createdAt"`
}

type NegotiationListing struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Price    int64  `json:"price"`
	Status   string `json:"status"`
	Province string `json:"province"`
}

type Negotiation struct {
	ID                  string             `json:"id"`
	Listing             NegotiationListing `json:"listing"`
	Buyer               UserRef            `json:"buyer"`
	Seller              UserRef            `json:"seller"`
	ListingPriceAtStart int64              `json:"listingPriceAtStart"`
	CurrentListingPrice int64              `json:"currentListingPrice"`
	Status              string             `json:"status"`
	CurrentOffer        *int64             `json:"currentOffer"`
	AgreedPrice         *int64             `json:"agreedPrice"`
	ClosedReason        *string            `json:"closedReason"`
	OrderID             *string            `json:"orderId"`
	Offers              []Offer            `json:"offers"`
	AllowedActions      []string           `json:"allowedActions"`
	CreatedAt           time.Time          `json:"createdAt"`
	UpdatedAt           time.Time          `json:"updatedAt"`
}

const negotiationSelect = `SELECT n.id, n.listing_price_at_start, n.status, n.agreed_price, n.closed_reason, n.created_at, n.updated_at,
	l.id, m.name || ' ' || v.storage_gb || 'GB', l.price, l.status, l.province,
	b.id, b.full_name, b.seller_rating, s.id, s.full_name, s.seller_rating,
	(SELECT o.id FROM orders o WHERE o.negotiation_id = n.id)
FROM negotiations n
JOIN listings l ON l.id = n.listing_id
JOIN phone_variants v ON v.id = l.variant_id JOIN phone_models m ON m.id = v.model_id
JOIN users b ON b.id = n.buyer_id JOIN users s ON s.id = n.seller_id`

func scanNegotiation(row pgx.Row) (*Negotiation, error) {
	var n Negotiation
	err := row.Scan(&n.ID, &n.ListingPriceAtStart, &n.Status, &n.AgreedPrice, &n.ClosedReason, &n.CreatedAt, &n.UpdatedAt,
		&n.Listing.ID, &n.Listing.Title, &n.Listing.Price, &n.Listing.Status, &n.Listing.Province,
		&n.Buyer.ID, &n.Buyer.FullName, &n.Buyer.SellerRating, &n.Seller.ID, &n.Seller.FullName, &n.Seller.SellerRating,
		&n.OrderID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, notFound("cuộc thương lượng")
	}
	n.CurrentListingPrice = n.Listing.Price
	return &n, err
}

func (s *Service) loadOffers(ctx context.Context, n *Negotiation) error {
	rows, err := s.pool.Query(ctx, `SELECT id, by_party, amount, note, created_at FROM negotiation_offers
		WHERE negotiation_id = $1 ORDER BY created_at, id`, n.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	n.Offers = []Offer{}
	for rows.Next() {
		var o Offer
		if err := rows.Scan(&o.ID, &o.By, &o.Amount, &o.Note, &o.CreatedAt); err != nil {
			return err
		}
		n.Offers = append(n.Offers, o)
	}
	if len(n.Offers) > 0 && (n.Status == "AWAITING_SELLER" || n.Status == "AWAITING_BUYER") {
		last := n.Offers[len(n.Offers)-1].Amount
		n.CurrentOffer = &last
	}
	return rows.Err()
}

func (n *Negotiation) decorate(viewerID string) {
	acts := []string{}
	turn := (n.Status == "AWAITING_SELLER" && viewerID == n.Seller.ID) || (n.Status == "AWAITING_BUYER" && viewerID == n.Buyer.ID)
	if turn {
		acts = append(acts, "OFFER", "ACCEPT", "REJECT")
	}
	if viewerID == n.Buyer.ID && (n.Status == "AWAITING_SELLER" || n.Status == "AWAITING_BUYER") {
		acts = append(acts, "CANCEL")
	}
	if n.OrderID != nil {
		acts = append(acts, "VIEW_ORDER")
	}
	n.AllowedActions = acts
}

func (s *Service) GetNegotiation(ctx context.Context, id, viewerID string) (*Negotiation, error) {
	n, err := scanNegotiation(s.pool.QueryRow(ctx, negotiationSelect+` WHERE n.id = $1`, id))
	if err != nil {
		return nil, err
	}
	if viewerID != n.Buyer.ID && viewerID != n.Seller.ID {
		return nil, notFound("cuộc thương lượng")
	}
	if err := s.loadOffers(ctx, n); err != nil {
		return nil, err
	}
	n.decorate(viewerID)
	return n, nil
}

// ListMyNegotiations: role "buyer" hoặc "seller"; status rỗng = tất cả.
func (s *Service) ListMyNegotiations(ctx context.Context, userID, role, status string) ([]*Negotiation, error) {
	col := "n.buyer_id"
	if role == "seller" {
		col = "n.seller_id"
	}
	rows, err := s.pool.Query(ctx, negotiationSelect+` WHERE `+col+` = $1 AND ($2 = '' OR n.status = $2)
		ORDER BY n.updated_at DESC LIMIT 100`, userID, status)
	if err != nil {
		return nil, err
	}
	var out []*Negotiation
	for rows.Next() {
		n, err := scanNegotiation(rows)
		if err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, n)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, n := range out {
		if err := s.loadOffers(ctx, n); err != nil {
			return nil, err
		}
		n.decorate(userID)
	}
	if out == nil {
		out = []*Negotiation{}
	}
	return out, nil
}

func validAmount(amount int64) error {
	if amount <= 0 || amount > 1_000_000_000 {
		return apperr.Field("amount", "Giá đề nghị phải lớn hơn 0.")
	}
	return nil
}

// StartNegotiation: người mua gửi đề nghị giá đầu tiên (UC21).
func (s *Service) StartNegotiation(ctx context.Context, listingID, buyerID string, amount int64, note string) (*Negotiation, error) {
	if err := validAmount(amount); err != nil {
		return nil, err
	}
	var id string
	err := s.tx(ctx, func(tx pgx.Tx) error {
		now := s.clock.Now()
		var sellerID, status string
		var price int64
		err := tx.QueryRow(ctx, `SELECT seller_id, status, price FROM listings WHERE id=$1 FOR SHARE`, listingID).Scan(&sellerID, &status, &price)
		if errors.Is(err, pgx.ErrNoRows) {
			return notFound("tin đăng")
		}
		if err != nil {
			return err
		}
		if sellerID == buyerID {
			return forbidden("Bạn không thể thương lượng tin của chính mình.")
		}
		if status != "ACTIVE" {
			return apperr.New(apperr.Conflict, "Điện thoại này không còn mở bán.")
		}
		var open string
		err = tx.QueryRow(ctx, `SELECT id FROM negotiations WHERE listing_id=$1 AND buyer_id=$2
			AND status IN ('AWAITING_SELLER','AWAITING_BUYER')`, listingID, buyerID).Scan(&open)
		if err == nil {
			return &apperr.Error{Code: apperr.Conflict, Message: "Bạn đang có một cuộc thương lượng mở với tin này.",
				Details: map[string]any{"negotiationId": open}}
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if err := tx.QueryRow(ctx, `INSERT INTO negotiations (listing_id, buyer_id, seller_id, listing_price_at_start, created_at, updated_at)
			VALUES ($1,$2,$3,$4,$5,$5) RETURNING id`, listingID, buyerID, sellerID, price, now).Scan(&id); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO negotiation_offers (negotiation_id, by_party, amount, note, created_at)
			VALUES ($1,'BUYER',$2,$3,$4)`, id, amount, note, now); err != nil {
			return err
		}
		return notify(ctx, tx, now, sellerID, "NEGOTIATION_OFFER", "Có đề nghị giá mới",
			"Người mua đề nghị "+vnd(amount)+" (giá rao "+vnd(price)+").", "/negotiations/"+id)
	})
	if err != nil {
		return nil, err
	}
	return s.GetNegotiation(ctx, id, buyerID)
}

type negRow struct {
	id, listingID, buyer, seller, status string
}

// actOnNegotiation khóa cuộc thương lượng, kiểm tra đến lượt người gọi rồi chạy fn.
func (s *Service) actOnNegotiation(ctx context.Context, id, userID string, needTurn bool,
	fn func(tx pgx.Tx, n *negRow, now time.Time) error) error {
	return s.tx(ctx, func(tx pgx.Tx) error {
		now := s.clock.Now()
		var n negRow
		err := tx.QueryRow(ctx, `SELECT id, listing_id, buyer_id, seller_id, status FROM negotiations WHERE id=$1 FOR UPDATE`, id).
			Scan(&n.id, &n.listingID, &n.buyer, &n.seller, &n.status)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && userID != n.buyer && userID != n.seller) {
			return notFound("cuộc thương lượng")
		}
		if err != nil {
			return err
		}
		if n.status != "AWAITING_SELLER" && n.status != "AWAITING_BUYER" {
			return invalidState("Cuộc thương lượng đã kết thúc.")
		}
		if needTurn {
			turn := (n.status == "AWAITING_SELLER" && userID == n.seller) || (n.status == "AWAITING_BUYER" && userID == n.buyer)
			if !turn {
				return invalidState("Đang chờ bên kia phản hồi.")
			}
		}
		return fn(tx, &n, now)
	})
}

func counterpart(n *negRow, userID string) (other, party string) {
	if userID == n.buyer {
		return n.seller, "BUYER"
	}
	return n.buyer, "SELLER"
}

// CounterOffer: bên đến lượt đề nghị giá khác (UC22, UC23).
func (s *Service) CounterOffer(ctx context.Context, id, userID string, amount int64, note string) (*Negotiation, error) {
	if err := validAmount(amount); err != nil {
		return nil, err
	}
	err := s.actOnNegotiation(ctx, id, userID, true, func(tx pgx.Tx, n *negRow, now time.Time) error {
		var listingStatus string
		if err := tx.QueryRow(ctx, `SELECT status FROM listings WHERE id=$1`, n.listingID).Scan(&listingStatus); err != nil {
			return err
		}
		if listingStatus != "ACTIVE" {
			return apperr.New(apperr.Conflict, "Điện thoại này không còn mở bán.")
		}
		other, party := counterpart(n, userID)
		next := "AWAITING_BUYER"
		if party == "BUYER" {
			next = "AWAITING_SELLER"
		}
		if _, err := tx.Exec(ctx, `INSERT INTO negotiation_offers (negotiation_id, by_party, amount, note, created_at)
			VALUES ($1,$2,$3,$4,$5)`, n.id, party, amount, note, now); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE negotiations SET status=$2, updated_at=$3 WHERE id=$1`, n.id, next, now); err != nil {
			return err
		}
		who := "Người bán"
		if party == "BUYER" {
			who = "Người mua"
		}
		return notify(ctx, tx, now, other, "NEGOTIATION_OFFER", who+" đề nghị mức giá mới", who+" đề nghị "+vnd(amount)+".", "/negotiations/"+n.id)
	})
	if err != nil {
		return nil, err
	}
	return s.GetNegotiation(ctx, id, userID)
}

// Accept: bên đến lượt chấp nhận giá bên kia đưa ra → AGREED và tạo đơn ngay (UC24).
func (s *Service) Accept(ctx context.Context, id, userID string) (*Negotiation, *Order, error) {
	var orderID string
	err := s.actOnNegotiation(ctx, id, userID, true, func(tx pgx.Tx, n *negRow, now time.Time) error {
		var amount int64
		if err := tx.QueryRow(ctx, `SELECT amount FROM negotiation_offers WHERE negotiation_id=$1
			ORDER BY created_at DESC, id DESC LIMIT 1`, n.id).Scan(&amount); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE negotiations SET status='AGREED', agreed_price=$2, updated_at=$3 WHERE id=$1`, n.id, amount, now); err != nil {
			return err
		}
		var err error
		if orderID, err = createOrder(ctx, tx, now, n.listingID, n.buyer, amount, n.id); err != nil {
			return err
		}
		other, _ := counterpart(n, userID)
		return notify(ctx, tx, now, other, "NEGOTIATION_AGREED", "Hai bên đã chốt giá "+vnd(amount),
			"Đơn hàng đã được tạo.", "/orders/"+orderID)
	})
	if err != nil {
		return nil, nil, err
	}
	n, err := s.GetNegotiation(ctx, id, userID)
	if err != nil {
		return nil, nil, err
	}
	o, err := s.GetOrder(ctx, orderID, userID, false)
	return n, o, err
}

// Reject: bên đến lượt từ chối → REJECTED, không tạo đơn.
func (s *Service) Reject(ctx context.Context, id, userID, note string) (*Negotiation, error) {
	err := s.actOnNegotiation(ctx, id, userID, true, func(tx pgx.Tx, n *negRow, now time.Time) error {
		reason := "Bị từ chối"
		if note != "" {
			reason += ": " + note
		}
		if _, err := tx.Exec(ctx, `UPDATE negotiations SET status='REJECTED', closed_reason=$2, updated_at=$3 WHERE id=$1`, n.id, reason, now); err != nil {
			return err
		}
		other, _ := counterpart(n, userID)
		return notify(ctx, tx, now, other, "NEGOTIATION_REJECTED", "Đề nghị giá bị từ chối", reason, "/negotiations/"+n.id)
	})
	if err != nil {
		return nil, err
	}
	return s.GetNegotiation(ctx, id, userID)
}

// CancelNegotiation: người mua dừng thương lượng (UC25).
func (s *Service) CancelNegotiation(ctx context.Context, id, userID string) (*Negotiation, error) {
	err := s.actOnNegotiation(ctx, id, userID, false, func(tx pgx.Tx, n *negRow, now time.Time) error {
		if userID != n.buyer {
			return forbidden("Chỉ người mua hủy được thương lượng.")
		}
		if _, err := tx.Exec(ctx, `UPDATE negotiations SET status='CANCELLED', closed_reason='Người mua hủy', updated_at=$2 WHERE id=$1`, n.id, now); err != nil {
			return err
		}
		return notify(ctx, tx, now, n.seller, "NEGOTIATION_CANCELLED", "Người mua đã dừng thương lượng", "", "/negotiations/"+n.id)
	})
	if err != nil {
		return nil, err
	}
	return s.GetNegotiation(ctx, id, userID)
}
