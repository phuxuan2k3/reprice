# Deploy RePrice lên Render + Neon (miễn phí)

Kiến trúc: **một web service trên Render** chạy `Dockerfile` (Go phục vụ API `/api/v1` và bản build React),
**PostgreSQL trên Neon**. Lần khởi động đầu tiên tự chạy migration và nạp dữ liệu demo (`DEMO_MODE=true`).

## 1. Đưa code lên GitHub
Tạo repo trên github.com (private được), rồi trong thư mục `reprice`:
```
git init && git add . && git commit -m "RePrice"
git branch -M main
git remote add origin https://github.com/<tài-khoản>/<repo>.git
git push -u origin main
```

## 2. Tạo database trên Neon
1. Đăng ký https://neon.tech → **Create project**, region **AWS Asia Pacific (Singapore)**, Postgres 16.
2. Mở **Connect**, tắt **Connection pooling**, copy chuỗi dạng
   `postgresql://<user>:<password>@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`.
   (Chuỗi có `-pooler` cũng chạy được, backend tự xử lý.)

## 3. Tạo service trên Render
1. Đăng ký https://render.com bằng tài khoản GitHub.
2. **New → Blueprint** → chọn repo → Render đọc `render.yaml`.
3. Dán chuỗi Neon vào `DATABASE_URL` → **Apply**. `JWT_SECRET` được tạo tự động.
4. Chờ build (~5–8 phút lần đầu). Xong sẽ có địa chỉ dạng `https://reprice-xxxx.onrender.com`.
5. Kiểm tra: mở `/healthz` thấy `{"status":"ok"}`, rồi mở trang chủ.

Mỗi lần `git push` lên `main`, Render tự build và deploy lại.

## Lưu ý gói miễn phí
| Vấn đề | Ảnh hưởng | Cách xử lý |
|---|---|---|
| Service ngủ sau 15 phút không có truy cập | Lần mở đầu chờ 30–60 giây | Trước giờ thuyết trình mở trang trước vài phút |
| Không có ổ đĩa bền | Ảnh tải lên (tin đăng, bằng chứng) mất khi deploy lại hoặc service khởi động lại | Demo xong mới deploy; cần lâu dài thì thêm Render Disk (trả phí) hoặc lưu ảnh lên Cloudflare R2 |
| Bộ lập lịch chỉ chạy khi service thức | Hạn 24h / 72h không tự xử lý lúc ngủ | Lần truy cập kế tiếp bộ lập lịch chạy bù; demo dùng nút "Tua thời gian" |
| `DEMO_MODE=true` bật đăng nhập nhanh, tua giờ, nạp lại dữ liệu | Ai có link cũng dùng được các công cụ demo | Chỉ để trong thời gian cuộc thi |

Tài khoản demo: `buyer@reprice.demo`, `seller@reprice.demo`, `admin@reprice.demo`, mật khẩu `demo1234`.
