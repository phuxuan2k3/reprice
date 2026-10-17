// Package config đọc cấu hình từ biến môi trường.
package config

import (
	"errors"
	"os"
	"strconv"
)

type Config struct {
	Addr        string // địa chỉ HTTP; mặc định :$PORT hoặc :8080
	DatabaseURL string
	JWTSecret   string
	// DemoMode bật các endpoint /api/v1/demo/* (đăng nhập nhanh, tua thời gian, cổng thanh toán và vận chuyển giả).
	DemoMode bool
	// CORSOrigin là origin của web dev server. Để trống khi web được phục vụ cùng origin (WEB_DIR).
	CORSOrigin string
	// WebDir là thư mục bản build của web; có thì backend phục vụ luôn web trên cùng cổng.
	WebDir string
	// UploadDir là nơi lưu ảnh tải lên, phục vụ ở /uploads/. Khi deploy cần là ổ đĩa bền.
	UploadDir string
}

func Load() (Config, error) {
	c := Config{
		Addr:        getenv("ADDR", ":"+getenv("PORT", "8080")), // PORT do Render/Koyeb/Cloud Run đặt
		DatabaseURL: os.Getenv("DATABASE_URL"),
		JWTSecret:   os.Getenv("JWT_SECRET"),
		CORSOrigin:  os.Getenv("CORS_ORIGIN"),
		WebDir:      os.Getenv("WEB_DIR"),
		UploadDir:   getenv("UPLOAD_DIR", "uploads"),
	}
	demo, err := strconv.ParseBool(getenv("DEMO_MODE", "false"))
	if err != nil {
		return c, errors.New("DEMO_MODE phải là true hoặc false")
	}
	c.DemoMode = demo
	if c.DatabaseURL == "" {
		return c, errors.New("thiếu DATABASE_URL")
	}
	if len(c.JWTSecret) < 32 {
		return c, errors.New("JWT_SECRET phải dài ít nhất 32 ký tự")
	}
	return c, nil
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
