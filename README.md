# RePrice

Sàn mua bán điện thoại cũ có giá tham khảo từ giao dịch đã hoàn tất (AISC'26).

| Thư mục | Nội dung |
|---|---|
| `docs/` | SPEC, use case, class/state diagram, ERD, API contract (`openapi.yaml`) |
| `backend/` | Go API + PostgreSQL |
| `web/` | React + Vite (JavaScript) |

## Chạy nhanh bằng Docker (giống khi deploy)

```
colima start                                   # hoặc Docker Desktop
docker compose --profile app up -d --build     # http://localhost:8080
```

Một container chạy cả web và API. Lần đầu tự tạo bảng và nạp dữ liệu demo.
Tài khoản demo: `buyer@reprice.demo`, `seller@reprice.demo`, `admin@reprice.demo`, mật khẩu `demo1234`
(hoặc dùng thanh chuyển vai trò trên web). Nạp lại dữ liệu: `curl -X POST localhost:8080/api/v1/demo/reset`.

## Chạy để phát triển

Cần Go 1.25+, Node 20+, PostgreSQL 16.

1. Database — chọn một:
   - Docker: `docker compose up -d db`
   - Homebrew: `brew install postgresql@16 && brew services start postgresql@16`, rồi
     `createuser -s reprice && createdb -O reprice reprice` và đặt mật khẩu hoặc sửa `DATABASE_URL`.
2. Backend:
   ```
   cd backend
   cp .env.example .env
   make run        # tự chạy migration, nghe ở :8080
   make test
   ```
   Kiểm tra: `curl localhost:8080/healthz`
3. Web:
   ```
   cd web
   npm install
   npm run dev     # http://localhost:5173, /api được chuyển sang backend :8080
   ```

## Deploy

Image ở `Dockerfile` (~21MB) chạy trên mọi nơi nhận Docker (Render, Koyeb, Fly, Coolify, VPS).
Biến môi trường: `DATABASE_URL`, `JWT_SECRET` (≥ 32 ký tự), `DEMO_MODE`; cổng lấy từ `PORT` nếu nền tảng đặt sẵn.
