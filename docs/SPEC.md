# RePrice — Đặc tả đã chốt (SPEC)

> Nguồn sự thật duy nhất cho thiết kế (class diagram, state diagram, ERD, API) và code.
> Tài liệu gốc `AISC'26 - MOCKUP.pdf` có nhiều chỗ mâu thuẫn; khi khác nhau, **theo file này**.
> Những gì chưa chốt nằm ở mục 10.

Cập nhật: 17/10/2026

---

## 1. Phạm vi

RePrice là nền tảng mua bán điện thoại đã qua sử dụng, cung cấp **giá tham khảo dựa trên giao dịch đã hoàn tất**, không dựa trên giá rao.

Mục tiêu bản hiện tại: **code chạy được trên local** (backend Go + PostgreSQL, frontend React JS).

Thanh toán, vận chuyển là **mô phỏng**, mọi dữ liệu mô phỏng phải gắn nhãn.

## 2. Vai trò

| Vai trò | Được làm |
|---|---|
| Khách | Xem trang chủ, tìm/lọc máy, xem chi tiết và giá tham khảo. Bấm thương lượng/mua → yêu cầu đăng nhập, xong quay lại đúng sản phẩm |
| Người mua | Thương lượng, Mua ngay, thanh toán, theo dõi giao hàng, bấm "Đã nhận hàng", mở hồ sơ trả hàng/khiếu nại, đánh giá người bán |
| Người bán | Đăng/sửa/ẩn tin, phản hồi thương lượng, chuẩn bị và bàn giao hàng, phản hồi hồ sơ, kiểm tra hàng trả |
| Quản trị viên (QTV) | Dashboard, xử lý hồ sơ khiếu nại/hoàn tiền, duyệt/loại/thu hồi dữ liệu tham chiếu, xem cờ nghi vấn và cụm |

- Một tài khoản có thể vừa mua vừa bán.
- Demo có thanh chuyển vai trò, nhưng mỗi thao tác vẫn ghi đúng người thực hiện; không bên nào thao tác thay bên kia.

## 3. Luồng nghiệp vụ chính

### 3.1. Đăng tin
Wizard 5 bước, mỗi màn hình một câu hỏi: Chọn điện thoại → Tình trạng máy → Ảnh và thông tin đi kèm → Giá bán và liên hệ → Xem lại và đăng.

- Thông tin máy chọn từ danh mục có cấu trúc (hãng, model, dung lượng, RAM khi cần, màu, khóa mạng).
- Tình trạng: ngoại hình (4 mức), chức năng (đầy đủ / có lỗi + danh sách lỗi và mức độ / chưa kiểm tra đủ), sức khỏe pin, thời gian sử dụng.
- **Không hỏi lịch sử sửa chữa.**
- Ở bước giá, hiển thị giá tham khảo GĐ1 + GĐ2 với dấu "Giá bạn nhập".

### 3.2. Thương lượng và tạo đơn
**Đơn hàng được tạo ngay khi hai bên chốt giá**, theo một trong hai cách:
1. **Mua ngay:** người mua đồng ý giá đang rao.
2. **Thương lượng thành công:** người mua đề nghị → người bán chấp nhận / từ chối / đề nghị giá khác → … → một bên chấp nhận giá của bên kia.

- Không có bước hai bên xác nhận đơn sau khi chốt giá.
- Đơn lưu riêng **giá rao tại thời điểm chốt** và **giá chốt**; phí vận chuyển là trường riêng, không cộng vào giá máy.
- Mọi đề nghị giá được lưu thành bản ghi riêng; không ghi đè lịch sử.
- Từ chối → không tạo đơn.
- Khi có đơn: tin đăng chuyển **Đang giao dịch**, ẩn khỏi tìm kiếm; các thương lượng khác của tin tự đóng và báo cho người mua liên quan.
- Người mua không thanh toán trong **24 giờ** → đơn tự hủy, tin mở bán lại.

### 3.3. Thanh toán (mô phỏng)
- Phương thức: chuyển khoản/ví/QR (trả trước) hoặc COD.
- Tiền người mua trả **chưa chuyển ngay cho người bán**; chỉ chuyển khi đơn hoàn tất.
- Chọn COD không đồng nghĩa đã thu tiền: phân biệt chờ thu COD / đã thu COD.

### 3.4. Giao hàng (mô phỏng)
- Người bán chuẩn bị → bàn giao đơn vị vận chuyển → có mã vận đơn và lịch sử các mốc.
- Giao thất bại: ghi sự kiện, lý do; cho giao lại hoặc hoàn hàng về người bán.
- Mốc **giao thành công** do đơn vị vận chuyển cập nhật (`delivered_at`).

### 3.5. Nhận hàng và hoàn tất
- Nút **"Đã nhận hàng"** xuất hiện sau khi đơn vị vận chuyển báo giao thành công (`delivered_at`).
- Thời hạn yêu cầu trả hàng/hoàn tiền (`return_deadline`) = **3 ngày**, tính từ:
  - lúc người mua bấm "Đã nhận hàng" (`received_at`), nếu có bấm;
  - `delivered_at`, nếu không bấm.
- Bấm "Đã nhận hàng" **không** làm đơn hoàn tất ngay; nút "Yêu cầu trả hàng/hoàn tiền" vẫn hiện đến `return_deadline`.
- Hết `return_deadline`, không có hồ sơ đang mở → đơn **tự hoàn tất** (tiến trình backend, không dựa vào đồng hồ trình duyệt).
- Sau khi hoàn tất vẫn còn kênh khiếu nại/hỗ trợ.
- Hoàn tất → chuyển tiền cho người bán (mô phỏng).
- Demo có nút "Tua thời gian" và gắn nhãn mô phỏng.

## 4. Trả hàng – Hoàn tiền – Khiếu nại

Ba chức năng dùng **chung một hồ sơ** của đơn; chuyển từ trả hàng sang khiếu nại không phải nhập lại. Mỗi đơn chỉ có **một hồ sơ đang mở**.

| Bước | Thời hạn |
|---|---|
| Người mua mở yêu cầu trả hàng/hoàn tiền | Trước `return_deadline` (mục 3.5) |
| Người bán phản hồi lần đầu (đồng ý / từ chối / yêu cầu bổ sung — tối đa 1 lượt) | 48 giờ |
| Người mua bổ sung | 48 giờ |
| Người bán quyết định sau bổ sung | 24 giờ |
| Người mua chọn sau khi bị từ chối (chuyển khiếu nại / kết thúc) | 48 giờ |
| Người mua bàn giao hàng trả (tính từ khi có địa chỉ + vận đơn hợp lệ) | 3 ngày |
| Người bán kiểm tra hàng trả | 48 giờ |
| Đề nghị xem xét lại kết quả của QTV | 48 giờ |

- Lý do: sai máy/phiên bản, sai mô tả, lỗi chưa công bố, thiếu/sai phụ kiện, hư hỏng khi vận chuyển.
- Chỉ **hoàn toàn bộ tiền hàng**, không hoàn một phần; phí ghi riêng trong phương án.
- Quá hạn hoặc bất đồng → chuyển QTV; im lặng không được coi là đồng ý.
- "Báo chưa nhận được hàng" → QTV yêu cầu xác minh vận chuyển; xác nhận thất lạc → hoàn tiền, không cần trả máy.
- Hoàn tiền phân biệt: Đã duyệt → Đang xử lý → Thành công / Thất bại / Chờ đối soát. Không gửi lại lệnh khi chưa rõ kết quả lệnh trước.
- Tách riêng **trạng thái đơn**, **trạng thái hồ sơ** và **trạng thái tiền**.
- Hồ sơ đang mở → đơn chưa hoàn tất, giao dịch chưa được xét vào dữ liệu giá. Đơn đã hoàn tiền → loại khỏi dữ liệu giá.

## 5. Giá tham khảo

GĐ1 và GĐ2 tính **độc lập**; có dữ liệu phần nào hiện phần đó.

### 5.1. GĐ1 — Giá máy mới
- Nguồn: website các **nhà bán lẻ/phân phối uy tín** được RePrice chấp nhận.
- Báo giá hợp lệ khi: đúng model + dung lượng + cấu hình; khớp màu nếu giá khác theo màu; còn hàng; xác minh trong 24 giờ.
- Lấy **giá bán hiện tại, không tính ưu đãi có điều kiện** (thu cũ đổi mới, thành viên, ưu đãi thanh toán), **đã gồm VAT**.
- Các chi nhánh cùng một chuỗi = một nguồn.
- Kết quả: không có nguồn → `NO_DATA`; một mức giá → `SINGLE_PRICE`; nhiều mức → `RANGE` = [min, max].
- Không dùng ngưỡng 35, Condition Score hay Z-score.

### 5.2. GĐ2 — Giá máy cũ đã bán
**Đầu vào:** giá chốt của từng máy (không gồm phí vận chuyển) thuộc các giao dịch có `reference_status = ELIGIBLE`, cùng `data_source`.

**Nhóm máy tương đồng** = cùng model + dung lượng (+ cấu hình nếu có) **và** khớp đủ 3/3 tiêu chí Condition Score:

| Tiêu chí | Giá trị |
|---|---|
| Ngoại hình | Xuất sắc / Tốt / Trung bình / Kém |
| Chức năng | Hoạt động đầy đủ / Có lỗi / Chưa kiểm tra đầy đủ |
| Sức khỏe pin | ≥ 90% / 80–89% / < 80% |

- Thiếu bất kỳ tiêu chí nào → **không ghép nhóm** (không dùng giá trị "không rõ" làm một nhóm).
- Snapshot tình trạng lấy tại thời điểm giao dịch; người bán sửa tin sau đó không làm thay đổi snapshot.

**Chọn cửa sổ:** xét 3 → 6 → 12 tháng; dừng ở cửa sổ đầu tiên có **≥ 35** giao dịch; dùng **toàn bộ** giao dịch trong cửa sổ đó. 12 tháng vẫn < 35 → `INSUFFICIENT_DATA`, hiện "Chưa đủ dữ liệu (X/35)", không tạo dải giả, không mượn nhóm khác.

**Tính dải:** P10 và P90, phân vị Type 7:
`h = 1 + (n−1)p`, `j = ⌊h⌋`, `g = h − j`, `Q(p) = x_j + g(x_{j+1} − x_j)`.
P10 = P90 → hiện một mức giá.

**Hiển thị:** chỉ P10–P90, số giao dịch, khoảng thời gian, nhãn dữ liệu mô phỏng nếu `SIMULATED`. **Không** hiện P50/trung vị, trung bình, độ lệch chuẩn, giá trị Z.

### 5.3. Nhãn vị trí và lời nhắc
| Điều kiện | Nhãn |
|---|---|
| giá < P10 | `BELOW_RANGE` — Dưới khoảng giá lịch sử |
| P10 ≤ giá ≤ P90 | `IN_RANGE` — Trong khoảng giá lịch sử |
| giá > P90 | `ABOVE_RANGE` — Trên khoảng giá lịch sử |

- Z = (giá − trung bình) / độ lệch chuẩn mẫu, tính trên **cùng tập** đã dùng tính P10–P90. Chỉ tính ở backend.
- Lời nhắc `LOW_PRICE` / `HIGH_PRICE` chỉ hiện khi: giá ngoài dải **và** `zThreshold` đã cấu hình (> 0) **và** độ lệch chuẩn > 0 **và** |Z| vượt ngưỡng đúng chiều.
- Có 4 nội dung lời nhắc: {người mua, người bán} × {LOW_PRICE, HIGH_PRICE}.
- Lời nhắc không được hàm ý người bán gian lận.

### 5.4. Ngưỡng chưa chốt
`zThreshold`, tỷ lệ tập trung người bán/cụm, số người mua/bán độc lập tối thiểu: để `null`.
- **Không chặn** việc công bố dải GĐ2; chỉ khi `zThreshold = null` thì không hiện lời nhắc.
- Màn QTV hiển thị "Chưa thiết lập".
- Demo được phép chọn giá trị Z tạm, gắn nhãn demo.

## 6. Dữ liệu tham chiếu

### 6.1. Hai trường riêng biệt cho mỗi giao dịch (từng máy)
- `data_source`: `REAL` | `SIMULATED` — không bao giờ trộn khi tính dải.
- `reference_status`:

| Trạng thái | Nghĩa | Được tính dải? |
|---|---|---|
| `PENDING_COMPLETION` | Đơn chưa hoàn tất (chưa giao, chưa qua `return_deadline`, có hồ sơ mở) | Chưa |
| `PENDING_VERIFICATION` | Có cờ nghi vấn, chờ QTV | Chưa |
| `ELIGIBLE` | Đủ điều kiện | Có |
| `EXCLUDED` | Bị loại (hủy, hoàn tiền, QTV bác) | Không |
| `REVOKED` | Từng dùng, nay thu hồi → tính lại các dải bị ảnh hưởng | Không |

`ELIGIBLE` chưa có nghĩa là nằm trong dải đang công bố; còn phải qua ghép nhóm và chọn cửa sổ.

### 6.2. Điều kiện để thành `ELIGIBLE`
Đơn hoàn tất (đã qua `return_deadline`) · thanh toán/thu COD đã xác minh · có `delivered_at` · không có hồ sơ mở, trả hàng, hoàn tiền · snapshot đủ 3/3 tiêu chí · mã chi tiết giao dịch duy nhất · không có cờ nghi vấn chưa xử lý.

### 6.3. Cờ nghi vấn và cụm
- Cờ chỉ gắn khi có căn cứ: thanh toán–giao nhận mâu thuẫn, snapshot thiếu/mâu thuẫn, trùng mã chi tiết với dữ liệu xung đột, cùng chủ thể hai phía, thiết bị chuyển vòng, đủ điều kiện rồi bị trả.
- Không gắn cờ chỉ vì giá cao/thấp, giao dịch nhiều lần, cùng model.
- Cụm (`cluster_id`) = thành phần liên thông theo cùng đơn / cùng người mua / cùng người bán / cùng thiết bị đã xác minh. Cụm không phải kết luận gian lận, không tự loại giao dịch.

### 6.4. Thao tác QTV
Cho phép sử dụng · Tiếp tục chờ xác minh · Không sử dụng · Thu hồi · Thu hồi và tính lại.
Mỗi thao tác bắt buộc có lý do và ghi nhật ký (người, thời điểm, trạng thái trước/sau). Không tự hủy đơn hay khóa tài khoản.

## 7. Demo

- Tài khoản mẫu cho 4 vai trò, thanh chuyển vai trò.
- Fixture **42 giao dịch `SIMULATED`** iPhone 13 128GB màu đen, cùng một nhóm Condition Score, 15/07/2026–15/10/2026, cho kết quả **P10 = 10.000.000, P90 = 12.000.000**. GĐ1: 13–14 triệu.
- Ba tin đăng để minh họa: 11,5tr (`IN_RANGE`), 9,2tr (`BELOW_RANGE`), 12,8tr (`ABOVE_RANGE`).
- Hai kịch bản: **demo nghiệp vụ** (đăng tin → … → hoàn tất → giao dịch thành `ELIGIBLE`) và **demo thuật toán** (dùng fixture).

## 8. Kiến trúc

| Phần | Lựa chọn |
|---|---|
| Backend | Go, REST API |
| Database | PostgreSQL (Docker Compose khi chạy local) |
| Frontend | React + Vite, **JavaScript** (tái sử dụng giao diện hiện có) |
| Supabase | **Bỏ** |

- Mọi tính toán giá, chuyển trạng thái, hạn thời gian thực hiện ở **backend**; frontend chỉ hiển thị.
- Logic hiện có trong `src/data/*.js` và các selftest dùng làm cơ sở port sang Go.

Quy trình thực hiện: SPEC → use case → class diagram + state diagram → ERD → API contract → backend Go → nối frontend → seed + kiểm thử toàn luồng.

## 9. Điểm lệch giữa code hiện tại và SPEC

| # | Hiện trạng code | Cần sửa theo SPEC |
|---|---|---|
| 1 | `AppContext.jsx` ~4688: dải giá lọc giao dịch theo `listing_id` của tin đang xem | Lọc theo nhóm máy tương đồng (mục 5.2) |
| 2 | `matchSnapshot` không được truyền ở đâu → không ghép nhóm Condition Score | Luôn ghép nhóm 3/3 |
| 3 | `conditionGroupKey` dùng 4 tiêu chí (có `repairHistory`), pin chia bậc 5% | 3 tiêu chí, pin 3 mức |
| 4 | Thiếu tiêu chí vẫn ghép với giá trị "không rõ" | Thiếu → không ghép |
| 5 | Đơn đi qua `PENDING_BUYER` → `PENDING_SELLER` → `CONFIRMED` | Đơn tạo khi chốt giá, không xác nhận thêm |
| 6 | Không có nút "Đã nhận hàng"; cửa sổ luôn tính từ lúc giao | Có nút; `return_deadline` = 3 ngày từ lúc bấm, hoặc từ `delivered_at` nếu không bấm (mục 3.5) |
| 7 | GĐ1 lấy giá niêm yết | Giá bán hiện tại, đã gồm VAT |
| 8 | Lưu `localStorage`, hạn thời gian chạy trên trình duyệt | Backend Go + PostgreSQL, hạn chạy ở server |

## 10. Chưa chốt

1. Giá trị `zThreshold` và các ngưỡng độ tin cậy.
2. Chính sách trả hàng chi tiết: địa điểm nhận trả thay thế, phí kiểm tra kỹ thuật, bên chịu phí khi chưa rõ lỗi.
3. Quyền xem chi tiết đơn khi chưa đăng nhập (prototype hiện cho xem).
4. Bấm "Đã nhận hàng" muộn (ví dụ giờ thứ 70) có kéo dài `return_deadline` thêm 3 ngày không — hiện tại: **có**.
