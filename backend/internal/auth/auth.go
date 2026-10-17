// Package auth băm mật khẩu và ký / kiểm tra token đăng nhập (JWT HS256).
package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var ErrInvalidToken = errors.New("invalid token")

func HashPassword(pw string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	return string(b), err
}

func CheckPassword(hash, pw string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw)) == nil
}

// Claims là nội dung token. Token chỉ chứa id người dùng; quyền đọc lại từ DB mỗi request.
type Claims struct {
	UserID    string `json:"sub"`
	ExpiresAt int64  `json:"exp"`
}

type Signer struct {
	secret []byte
	ttl    time.Duration
}

func NewSigner(secret string, ttl time.Duration) *Signer {
	return &Signer{secret: []byte(secret), ttl: ttl}
}

var jwtHeader = base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))

func (s *Signer) Sign(userID string, now time.Time) (string, error) {
	payload, err := json.Marshal(Claims{UserID: userID, ExpiresAt: now.Add(s.ttl).Unix()})
	if err != nil {
		return "", err
	}
	unsigned := jwtHeader + "." + base64.RawURLEncoding.EncodeToString(payload)
	return unsigned + "." + s.mac(unsigned), nil
}

// Verify kiểm tra chữ ký và hạn. now là giờ thật (không cộng độ lệch demo),
// để tua thời gian không làm hết hạn phiên đăng nhập.
func (s *Signer) Verify(token string, now time.Time) (Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 || parts[0] != jwtHeader {
		return Claims{}, ErrInvalidToken
	}
	if !hmac.Equal([]byte(s.mac(parts[0]+"."+parts[1])), []byte(parts[2])) {
		return Claims{}, ErrInvalidToken
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return Claims{}, ErrInvalidToken
	}
	var c Claims
	if err := json.Unmarshal(raw, &c); err != nil || c.UserID == "" {
		return Claims{}, ErrInvalidToken
	}
	if now.Unix() >= c.ExpiresAt {
		return Claims{}, ErrInvalidToken
	}
	return c, nil
}

func (s *Signer) mac(msg string) string {
	h := hmac.New(sha256.New, s.secret)
	h.Write([]byte(msg))
	return base64.RawURLEncoding.EncodeToString(h.Sum(nil))
}

// User là người đang gọi API.
type User struct {
	ID       string
	FullName string
	IsAdmin  bool
}

type ctxKey struct{}

func WithUser(ctx context.Context, u *User) context.Context {
	return context.WithValue(ctx, ctxKey{}, u)
}

// FromContext trả nil khi request không đăng nhập.
func FromContext(ctx context.Context) *User {
	u, _ := ctx.Value(ctxKey{}).(*User)
	return u
}
