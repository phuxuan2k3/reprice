package auth

import (
	"testing"
	"time"
)

func TestSignVerify(t *testing.T) {
	s := NewSigner("0123456789abcdef0123456789abcdef", time.Hour)
	now := time.Unix(1_800_000_000, 0)
	tok, err := s.Sign("user-1", now)
	if err != nil {
		t.Fatal(err)
	}
	c, err := s.Verify(tok, now.Add(30*time.Minute))
	if err != nil || c.UserID != "user-1" {
		t.Fatalf("verify: %v %+v", err, c)
	}
	if _, err := s.Verify(tok, now.Add(2*time.Hour)); err == nil {
		t.Fatal("token hết hạn vẫn được chấp nhận")
	}
	if _, err := s.Verify(tok[:len(tok)-2]+"xx", now); err == nil {
		t.Fatal("chữ ký sai vẫn được chấp nhận")
	}
	other := NewSigner("ffffffffffffffffffffffffffffffff", time.Hour)
	if _, err := other.Verify(tok, now); err == nil {
		t.Fatal("token ký bằng khóa khác vẫn được chấp nhận")
	}
}

func TestPassword(t *testing.T) {
	h, err := HashPassword("demo1234")
	if err != nil {
		t.Fatal(err)
	}
	if !CheckPassword(h, "demo1234") || CheckPassword(h, "sai") {
		t.Fatal("password check sai")
	}
}
