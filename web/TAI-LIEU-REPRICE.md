# TÀI LIỆU TỔNG HỢP REPRICE

> **TÊN FILE:** `TAI-LIEU-REPRICE.md` — **đây là TÀI LIỆU MỚI.**
> Trước khi tạo file này, **repository `reprice-web` không có bất kỳ tài liệu
> tổng hợp nào** (không có README, không có thư mục `docs/`, không có file
> `.md/.txt/.docx/.pdf` nào), và kiểm tra toàn bộ lịch sử Git cũng cho thấy
> **chưa từng có** file tài liệu nào. Xem §12 để biết các tài liệu **ngoài
> repository** có liên quan.

| Thuộc tính | Giá trị |
|---|---|
| Loại tài liệu | Tài liệu tổng hợp kỹ thuật – nghiệp vụ (nguồn duy nhất) |
| Ngày cập nhật | 17/10/2026 |
| Phạm vi | Toàn bộ prototype `reprice-web` + kết quả kiểm thử sau 5 giai đoạn phát triển |
| Trạng thái | Bản tổng hợp sau **Giai đoạn 5** (kiểm thử end-to-end) |
| Đơn vị thực hiện | Nhóm RePrice (đồ án AISC'26 – chủ đề Data Driven Business) |
| Nguồn đối chiếu | Mã nguồn trong repo `reprice-web`; Thuyết minh đề tài (PDF ngoài repo); Mẫu `AISC26_Mau_Thuyet_Minh_Du_An.docx`; biên bản Q&A `RePrice_Cau_hoi_va_de_xuat.docx` |
| Mức độ tin cậy | **Chỉ ghi nhận nội dung có bằng chứng trong mã nguồn/kết quả chạy thực tế.** Không có số liệu, ảnh chụp hay kết quả kiểm thử nào được tạo thêm. |

## Quy ước trạng thái (dùng xuyên suốt tài liệu)

| Ký hiệu | Ý nghĩa |
|---|---|
| ✅ **ĐÃ TRIỂN KHAI** | Có mã nguồn và chạy được trong prototype. |
| 🟡 **MÔ PHỎNG** | Có logic nhưng dữ liệu/sự kiện là giả lập, **không phải giao dịch/dịch vụ thật**. |
| 🧪 **ĐÃ KIỂM THỬ** | Có kết quả chạy thực tế (selftest hoặc kiểm thử end-to-end). |
| ⚠️ **CHƯA KIỂM THỬ** | Có trong code nhưng chưa có bằng chứng chạy. |
| ⏳ **CHỜ QUYẾT ĐỊNH** | Nhóm chưa chốt nghiệp vụ → hệ thống **chặn** bước phụ thuộc, không tự suy đoán. |
| 🔭 **KẾ HOẠCH** | Chưa triển khai; chỉ là định hướng. |

---

## §1. TỔNG QUAN REPRICE

### 1.1. Mục tiêu
RePrice là một **nền tảng web tham chiếu giá điện thoại đã qua sử dụng**, kết nối
người mua – người bán, cho phép:
1. Tra cứu **dải giá tham khảo** cho một mẫu máy cũ (dựa trên giao dịch đã xác minh),
   đối chiếu với **giá máy mới** tại các cửa hàng.
2. **Đăng bán**, **tìm kiếm**, **thương lượng giá có cấu trúc**, **mua ngay**, **tạo đơn**.
3. Đi xuyên suốt **đơn hàng → thanh toán (mô phỏng) → vận chuyển (mô phỏng) →
   trả hàng / khiếu nại / hoàn tiền (mô phỏng)**.
4. Cung cấp **công cụ quản trị dữ liệu** để duyệt/thu hồi bản ghi giá và theo dõi
   bất thường.

### 1.2. Phạm vi (thực tế của prototype)
- **Chỉ là prototype (demo).** Không có backend, không có cơ sở dữ liệu, không có
  xác thực thật, không tích hợp cổng thanh toán / đơn vị vận chuyển / dịch vụ thu hộ
  thật. Toàn bộ trạng thái nghiệp vụ lưu trong `localStorage` của trình duyệt.
- **Giá tham khảo** được tính cục bộ (client) từ dữ liệu mô phỏng + giao dịch phát
  sinh trong phiên demo.
- **Phần 4 (trình bày Giá tham khảo)** và **Phần 5 (quản trị dữ liệu giá)** đã có
  giao diện; xem §5.

### 1.3. Đối tượng sử dụng & vai trò
Bốn nhóm vai trò (`src/data/users.js`):

| Vai trò | Nhãn | Tài khoản demo | Mô tả |
|---|---|---|---|
| `guest` | Khách | — (chưa đăng nhập) | Xem công khai (trang chủ, danh sách, chi tiết máy, thông tin). |
| `buyer` | Người mua | **U01 – Nguyễn Minh** (Quận 1, TP.HCM) | Tìm máy, thương lượng, mua, tạo đơn, thanh toán (mô phỏng), mở hồ sơ trả hàng/khiếu nại. |
| `seller` | Người bán | **S01 – Trần Minh** (Hà Nội) | Đăng bán, phản hồi thương lượng, xác nhận đơn, chuẩn bị & bàn giao hàng, xử lý hồ sơ. |
| `manager` | Người quản lý | **M01 – Vũ Lan** (Đà Nẵng) | Duyệt/thu hồi dữ liệu giá, theo dõi đơn/giao dịch, xử lý hồ sơ – khiếu nại – hoàn tiền, công cụ demo. |

### 1.4. Kiến trúc kỹ thuật
| Hạng mục | Chi tiết |
|---|---|
| Nền tảng | React 18 + Vite 5 + Tailwind CSS 3 + `react-router-dom` 6 |
| Số module build | **100 module** (Vite báo khi `npm run build`; +1 so với trước do thêm `src/components/EvidenceUploader.jsx`) |
| Lưu trữ | `localStorage` — khoá `reprice_demo_state_v1`, `schemaVersion = 1` (`src/utils/demoStorage.js`) |
| Khoá lưu phụ | `reprice_region`, `reprice_favorites`, `reprice_notif_read` |
| Điều hướng | 27 route khai báo (26 đường dẫn + nhánh `*`) trong `src/App.jsx` |
| Kiểm thử | 5 bộ selftest Node (không có framework E2E; không test UI tự động) |

---

## §2. CHỨC NĂNG HỆ THỐNG (theo miền nghiệp vụ)

> **Ghi chú về nhãn "giai đoạn":** mã nguồn chỉ gắn nhãn rõ ở một số module
> (`pricingConfig.js` ghi **GĐ1/GĐ2**; `negotiationRules.js` ghi **Giai đoạn 2**;
> `orderRules.js`/`eligibility.js` ghi **Phần XVI**). Cột "GĐ (theo nhóm)" dưới đây
> theo **trình tự phát triển nhóm đã báo cáo trong quá trình làm**, không phải nhãn
> tồn tại trong mọi file mã nguồn.

| # | Chức năng | GĐ (theo nhóm) | Trạng thái | Bằng chứng chính |
|---|---|---|---|---|
| 1 | Giá máy mới từ nguồn cửa hàng (niêm yết, còn hàng, xác minh 24h, gộp chi nhánh cùng chuỗi) | GĐ1 | ✅🟡 | `src/data/storePrices.js`; `PRICING_CONFIG.newPriceMaxAgeHours = 24` |
| 2 | Dải giá máy cũ P10–P90 (Type 7), cửa sổ cuốn chiếu 3/6/12 tháng, tối thiểu 35 giao dịch | GĐ2 | ✅ | `src/data/pricingEngine.js`, `src/data/pricingConfig.js` |
| 3 | Điều kiện đưa giao dịch vào dải giá + quy tắc loại trừ | GĐ2 | ✅ | `src/data/pricingEngine.js` (`referenceDataStatus`), `src/data/eligibility.js` |
| 4 | Cờ nghi vấn tự động + gom cụm giao dịch (phục vụ quản trị) | GĐ2/GĐ4 | ✅🟡 | `src/data/suspicionFlags.js`, `src/data/clusterEngine.js` |
| 5 | Đăng bán điện thoại (wizard nhiều bước) | — | ✅ | `src/pages/CreateListingPage.jsx` |
| 6 | Tìm kiếm / lọc danh sách điện thoại | — | ✅ | `src/pages/PhonesPage.jsx` |
| 7 | Trang chi tiết máy + bảng Giá tham khảo (2 khu vực A/B) | — | ✅ | `src/pages/PhoneDetailPage.jsx`, `src/components/ReferencePricePanel.jsx` |
| 8 | Thương lượng có cấu trúc (đề nghị / đối giá / chấp nhận / từ chối / hủy) | GĐ2 | ✅ | `src/data/negotiationRules.js`; `NegotiationPage`, `SellerNegotiationPage` |
| 9 | Tạo đơn (mua ngay hoặc theo giá đã chốt) + xác nhận hai bên | GĐ2/GĐ3 | ✅ | `src/context/AppContext.jsx` (`createOrder`, `confirmOrderByBuyer`, `respondOrderBySeller`) |
| 10 | Hủy đơn theo pha (trước xác nhận / sau xác nhận chưa bàn giao / đã bàn giao) | GĐ3 | ✅ | `src/data/orderRules.js` (`cancelPhase`, `canCancelOrder`) |
| 11 | Thanh toán mô phỏng (QR/trả trước + COD có thu tiền & đối soát) | GĐ3 | ✅🟡 | `PAYMENT_STATUS`, `COD_FLOW` trong `orderRules.js` |
| 12 | Vận chuyển mô phỏng theo chuỗi trạng thái + mã vận đơn | GĐ3 | ✅🟡 | `src/data/shipping.js`; `advanceShipping` |
| 13 | Giao hàng thất bại (1 lần giao lại tối đa) / người mua từ chối nhận → hoàn hàng | GĐ3 | ✅🟡 | `MAX_DELIVERY_ATTEMPTS = 2`; `markDeliveryFailed`, `retryDelivery` |
| 14 | Trả hàng – khiếu nại – hoàn tiền (hồ sơ, bằng chứng, phương án, vận đơn trả, hoàn tiền) | GĐ4/GĐ5 | ✅🟡 | `src/data/caseRules.js`, `src/data/caseScenarios.js`, `src/pages/SupportCasePage.jsx` |
| 15 | Quản trị dữ liệu giá (duyệt / yêu cầu bổ sung / loại / thu hồi & tính lại) | Phần 5 | ✅ | `src/pages/ManagerTransactionsPage.jsx` |
| 16 | Dashboard quản lý + danh sách đơn cho quản lý | — | ✅ | `ManagerDashboardPage.jsx`, `ManagerOrdersPage.jsx` |
| 17 | Trung tâm thông báo (suy diễn từ dữ liệu, đánh dấu đã đọc) | — | ✅ | `src/pages/NotificationCenter.jsx`; `AppContext.notifications` |
| 18 | Công cụ demo: chuyển vai trò / đăng nhập nhanh / đặt lại dữ liệu | — | ✅🟡 | `src/pages/AdminToolsPage.jsx` |
| 19 | Tài khoản: đơn của tôi, tin đăng, đánh giá người bán | — | ✅ | `AccountPage.jsx`, `ReviewSellerPage.jsx` |
| 20 | Chế độ demo 3 trường hợp giá (Trong/Dưới/Trên khoảng) + ngưỡng Z demo | — | ✅🟡 | `src/pages/PriceDemoPage.jsx`, `src/data/demoFixture.js` |

---

## §3. QUY TRÌNH NGHIỆP VỤ

### 3.1. Đăng bán
- Người bán mở `/seller/create-listing`, điền wizard (hãng, model, dung lượng, RAM,
  màu, tình trạng ngoại hình/chức năng, lỗi, pin, thời gian sử dụng, phụ kiện, bảo
  hành, mô tả, giá, khu vực, liên hệ).
- **Màu (đã bổ sung 17/10/2026):** bộ chọn gồm màu chuẩn `STANDARD_COLORS`
  (`Đen, Trắng, Vàng gold, Xanh dương`) + các màu có sẵn trong danh mục theo model +
  `"Không rõ"` + `"Khác"`. Chọn **"Khác"** hiện ô **nhập tên màu thực tế** (bắt buộc,
  có kiểm tra rỗng). Giá trị màu thật được lưu vào tin đăng (`colorName`) và hiển thị
  tại trang chi tiết (`Màu sắc`); trước đây `addListing` **không lưu `colorName`** nên
  trang chi tiết hiện `"—"` — **đã sửa**.
- **Khu vực (đã bổ sung 17/10/2026):** màn chọn tỉnh/thành dùng `PROVINCES`
  (`src/data/regions.js`, **63 tỉnh/thành toàn quốc**) thay cho danh sách 5 thành phố.
  Người bán xác nhận khu vực tài khoản hoặc bấm "Thay đổi" để tự chọn tỉnh/thành; vẫn
  nhập phường/xã thủ công (chưa có danh mục quận/huyện).
- **Ảnh (đã bổ sung 17/10/2026):** ngoài "Chọn ảnh từ thiết bị", có nút **"Chụp ảnh
  trực tiếp"** dùng `capture="environment"` (ưu tiên camera sau trên điện thoại). Nếu
  thiết bị/trình duyệt không hỗ trợ, hộp chọn tệp mở ra (fallback). Ảnh sai định dạng
  hoặc > 8MB bị báo lỗi và có nút "Chọn lại".
- Khi tạo tin, hệ thống gán `id` dạng `Pxxx`, lưu `seller = { id, name, ... }`, gán
  `listingStatus = "ACTIVE"`, và hiển thị bảng Giá tham khảo theo vai **người bán**
  (khu vực B đổi tiêu đề "Các máy giống máy của bạn đã bán với giá"; marker đổi
  "Giá bạn nhập").
- Tin mới lưu thêm `colorName`, `ram`, `networkLock`, `contactPhone`, `photoCount`.
- Ảnh chỉ lưu **metadata** (object URL chỉ sống trong phiên; không upload), xem §10.

### 3.2. Tìm kiếm & xem chi tiết
- `/phones`: lọc theo hãng/model/dung lượng/khoảng giá + tìm kiếm; kết quả dạng lưới.
- `/phones/:id`: thông tin máy + bảng **Giá tham khảo RePrice** (2 khu vực độc lập) +
  nút mua ngay / thương lượng (theo vai trò).

### 3.3. Giá tham khảo (tóm tắt — chi tiết ở §5)
- **Khu vực A:** "Giá máy mới tại các cửa hàng" — `NO_DATA` / `SINGLE_PRICE` / `RANGE`.
- **Khu vực B:** "Các máy tương tự đã bán với giá" — `NO_DATA` / `INSUFFICIENT_DATA` / `RANGE`.
- Mỗi khu vực có dải giá, **thanh dải trực quan** (hai đầu mốc + marker giá đang rao),
  và dòng vị trí ("Trong/Dưới/Trên khoảng …").

### 3.4. Thương lượng
- Phiên thương lượng (`NEG-xxxx`) tách riêng khỏi đơn hàng, có `buyerId`, `sellerId`,
  `phoneId`, `listingPrice` (giá rao lúc mở phiên), mảng `offers[]`, `status`.
- Chuỗi trạng thái: `AWAITING_SELLER → SELLER_COUNTER → AGREED` hoặc `REJECTED` /
  `CANCELLED`.
- Quyền (hàm thuần `negotiationRules.js`):
  - `canBuyerSendOffer`: chỉ người mua của phiên; chặn khi `AGREED`/`CANCELLED`.
  - `canSellerRespond`: chỉ người bán của phiên, chỉ khi `AWAITING_SELLER`.
  - `canBuyerHandleCounter`: chỉ người mua, chỉ khi `SELLER_COUNTER`.
  - `canBuyerCreateOrder`: **chỉ người mua của phiên**, **bắt buộc `AGREED` + có
    `agreedPrice`**, và **chưa có `orderId`**.
- Giá đối đề xuất = trung bình cộng (giá rao + đề nghị người mua), làm tròn 10.000đ.

### 3.5. Mua ngay & tạo đơn
- Mua ngay: dùng **giá rao hiện tại** của tin đăng.
- Sau thương lượng: **bắt buộc dùng `agreedPrice`** (không lấy giá người dùng nhập) —
  `validateOrderDraft` (`negotiationRules.js`).
- Nếu giá rao hiện tại khác giá lúc thương lượng → `listingChanged = true` để nhắc hai
  bên xác nhận lại.
- Trạng thái đơn ban đầu: **`PENDING_BUYER`** (chờ người mua xác nhận). Đơn lưu **tách
  biệt**: `listingPrice`, `negotiatedPrice`, `negotiationId`, `address`, `paymentMethod`.
- Chỉ vai `buyer` tạo được đơn; nếu có `negotiationId` phải hợp lệ và thuộc người mua
  (`AppContext.createOrder`).

### 3.6. Xác nhận của hai bên
- `PENDING_BUYER` → **người mua** xác nhận → `PENDING_SELLER`.
- `PENDING_SELLER` → **người bán** xác nhận → `CONFIRMED`; hoặc từ chối → `SELLER_REJECTED`.
- Mỗi lần xác nhận ghi vào `confirmations[]` kèm `role` và `version` (điều kiện đưa
  giao dịch vào dải giá yêu cầu hai bên xác nhận **cùng một phiên bản** — `eligibility.js`).
- **Người mua không xác nhận thay người bán** (kiểm tra quyền trong action tương ứng).

### 3.7. Hủy đơn (`orderRules.cancelPhase`)
| Pha | Điều kiện | Kết quả |
|---|---|---|
| `BEFORE_CONFIRM` | chưa hai bên xác nhận | Hủy được |
| `AFTER_CONFIRM_UNPAID` | đã xác nhận nhưng **chưa bàn giao** (kể cả đã có mã vận đơn nhưng ĐVVC chưa tiếp nhận) | Hủy được; có cờ `requiresConfirm`; vận đơn chuyển `VOIDED` |
| `LOCKED` | đã thanh toán / đã bàn giao / đã kết thúc | **Không** hủy thông thường → dùng luồng trả hàng/hoàn tiền/khiếu nại |

- Mốc "đã bàn giao" xác định theo **sự kiện/trạng thái ĐVVC đã tiếp nhận**
  (`HANDOVER_SHIPPING_STATUSES` trong `src/data/shipping.js`), không chỉ có mã vận đơn.
- Khi hủy: ghi `cancelInfo`; COD chưa thu tiền thì **không phát sinh hoàn tiền**.

### 3.8. Vận chuyển (mô phỏng)
- ĐVVC: **"RePrice Express (mô phỏng)"**. Mọi trạng thái/sự kiện là **MÔ PHỎNG**.
- Chuỗi trạng thái (`SHIPPING_STATUS_LABEL`): `NOT_SHIPPED → PREPARING → AWAITING_PICKUP
  → ACCEPTED → SORTING → IN_TRANSIT → ARRIVED_HUB → OUT_FOR_DELIVERY → DELIVERED`,
  cùng các nhánh `FAILED`, `RETURNING`, `RETURNED`, `VOIDED`, `INCIDENT`.
- Giao thất bại: tối đa **1 lần giao lại** (`MAX_DELIVERY_ATTEMPTS = 2` gồm lần đầu);
  người mua từ chối nhận hoặc hết lượt → chuyển hoàn hàng về người bán.
- Sau khi giao thành công, mốc **cửa sổ kiểm tra 3 ngày** (`RETURN_WINDOW_DAYS = 3`).

---

## §4. TRẢ HÀNG, KHIẾU NẠI VÀ HOÀN TIỀN

### 4.1. Mô hình hồ sơ (`src/data/caseRules.js`)
- Mỗi đơn chỉ có **MỘT hồ sơ đang hoạt động** (`activeCase`; chống tạo trùng).
- Loại hồ sơ: `RETURN` (trả hàng), `NOT_RECEIVED` (báo chưa nhận hàng), `DISPUTE`/khiếu nại.
- Trạng thái hồ sơ (`RETURN_STATUS`) chia nhóm:
  - **Giai đoạn người bán phản hồi:** `PENDING_SELLER` (48h) → `SELLER_SUPPLEMENT`
    (chờ người mua 48h) / `IN_PROGRESS` (chờ người bán tái quyết định 24h) /
    `AFTER_REJECT_BUYER` (chờ người mua chọn 48h).
  - **Quản lý:** `PENDING_MANAGER` → `NEEDS_INFO` → `UNDER_REVIEW` → `AWAITING_PLAN`
    → `PLAN_REVIEW` (48h) → `PLAN_EFFECTIVE`.
  - **Trả hàng:** `RETURN_PENDING_INFO` → `RETURN_AWAITING_HANDOVER` (3 ngày) →
    `RETURNING` → `RETURNED` (chờ kiểm tra 48h); nhánh `RETURN_OBSTACLE`, `RETURN_DISPUTE`.
  - **Hoàn tiền:** `REFUND_ELIGIBLE` → `REFUND_PROCESSING` → `REFUNDED`;
    nhánh `PENDING_REFUND`, `REFUND_RECONCILE`.
  - **Đóng:** `REJECTED`, `WITHDRAWN`, `RESOLVED`, `CLOSED`.

### 4.2. Điều kiện & thời hạn (`CASE_DEADLINES`)
| Hạn | Giá trị | Ý nghĩa |
|---|---|---|
| `SELLER_RESPONSE_HOURS` | 48h | Người bán phản hồi hồ sơ |
| `BUYER_SUPPLEMENT_HOURS` | 48h | Người mua bổ sung sau khi người bán đề nghị |
| `SELLER_AFTER_SUPPLEMENT_HOURS` | 24h | Người bán tái quyết định sau bổ sung |
| `BUYER_AFTER_REJECT_HOURS` | 48h | Người mua chọn sau khi người bán từ chối |
| `PLAN_REVIEW_HOURS` | 48h | Xem xét lại nội bộ phương án |
| `RETURN_INSPECT_HOURS` | 48h | Người bán kiểm tra hàng trả |
| `RETURN_HANDOVER_DAYS` | 3 ngày | Người mua bàn giao hàng trả |
| `RETURN_WINDOW_DAYS` (orderRules) | 3 ngày | Cửa sổ yêu cầu trả hàng/khiếu nại sau khi giao |

> ⚠️ **Toàn bộ hạn chạy phía client** (so sánh thời điểm hiện tại). Không có scheduler/
> backend cưỡng chế. Trong demo có nút "Điều khiển demo" ở `SupportCasePage` để tua
> thời gian (đồng hồ giả lập) — xem §9.

### 4.3. Bằng chứng (`EVIDENCE_VISIBILITY`, `makeEvidence`)
- Bằng chứng là một đối tượng có `id`, `by`, `role`, `at`, `text`, `files`,
  `visibility` (`PARTIES` / `PUBLIC` …), `verification`, `simulated: true`.
- **Tệp đính kèm chỉ lưu metadata** (không upload/tải file).
- **Tải ảnh/video bằng chứng (đã bổ sung 17/10/2026):** dùng component
  `src/components/EvidenceUploader.jsx` (nhận ảnh/video, tối đa 6 tệp, mỗi tệp ≤ 20MB,
  có xem trước ảnh/video trong phiên, kiểm tra loại/kích thước). Có mặt ở:
  - Modal mở hồ sơ tại `OrderDetailPage` (3 loại: trả hàng, khiếu nại, báo chưa nhận).
  - Form **"Bổ sung bằng chứng"** và form **người bán phản hồi** tại `SupportCasePage`.
  Hệ thống **chỉ lưu tên/kích thước/loại** — tải lại trang phải gửi lại tệp nếu muốn xem.
- **"Ghi chú phản ánh" (đã bổ sung 17/10/2026):** trường riêng khi mở hồ sơ
  **trả hàng/hoàn tiền** (`reflectionNote`), tách khỏi "Mô tả vấn đề"; hiển thị lại ở
  `SupportCasePage` và danh sách hồ sơ trong `OrderDetailPage`.
- **"Đánh giá/nhận xét" (đã bổ sung 17/10/2026):** với hồ sơ **khiếu nại** và **báo
  chưa nhận hàng**, ô mô tả đổi nhãn thành "Đánh giá/nhận xét" (tránh trùng trường với
  "Mô tả vấn đề" của hồ sơ trả hàng).
- **`description` là trường dùng CHUNG cho cả 3 loại hồ sơ** (`RETURN`, `NOT_RECEIVED`,
  `DISPUTE`) — chỉ **nhãn hiển thị** đổi theo loại; `reflectionNote` là trường **riêng**
  chỉ có ở `RETURN`. Việc có tách thêm một trường "đánh giá/nhận xét" độc lập hay không
  vẫn **chờ chốt** (xem Phụ lục C, mục 6).

### 4.4. Vận đơn trả (`RETURN_SHIPMENT_STATUS`)
`PENDING_INFO → AWAITING_HANDOVER → RETURNING → RETURNED(DELIVERED_INSPECT)`;
nhánh `OBSTACLE` (danh mục `RETURN_OBSTACLES`), `DISPUTE`, `REFUND_ELIGIBLE`.

### 4.5. Hoàn tiền (`REFUND_STATUS`)
- Trạng thái: `APPROVED → PROCESSING → DONE`, cùng `FAILED`, `RECONCILE`.
- `startRefund` yêu cầu **thanh toán đã settled** và **kiểm tra hàng trả xong**.
  COD **chưa thu tiền** bị **chặn** khởi tạo hoàn tiền.
- Thất bại (`FAILED`) **không tự đánh dấu hoàn**; phải **đối soát** → `DONE`.
- Người mua có thể "Báo chưa nhận được tiền hoàn" → chuyển quản lý.
- **Không tự thu hồi tiền đã chi trả cho người bán.**

### 4.6. Quyền xử lý & ngoại lệ
- `partyOf(order, actor)` xác định vai trò của người đang xem (người mua / người bán /
  quản lý / khách). `canViewCase` + `maskTracking` / `maskAddress` / `maskPaymentMethod`
  che dữ liệu nhạy cảm với người không liên quan.
- Quản lý: nhận hồ sơ, yêu cầu bổ sung, **xác minh vận chuyển** (`managerVerifyShipping`),
  **yêu cầu kiểm tra kỹ thuật** (`managerRequestTechnicalCheck`), **ban hành phương án**
  (`managerIssuePlan`), **xử lý xem xét lại** (`managerResolvePlanReview`).
- **Chính sách chưa chốt** (địa điểm nhận trả thay thế, phí/đơn vị kiểm tra kỹ thuật,
  phân bổ phí khi chưa rõ trách nhiệm) hiển thị **"Chờ hoàn thiện phương án"** và
  **chặn** bước phụ thuộc — xem §11 & Phụ lục C.
- Hồ sơ quá hạn: `escalateOverdueSupport` nâng lên `PENDING_MANAGER` (⚠️ xem Phụ lục B,
  lỗi mức thấp: sau khi nâng cấp, `awaits` có thể vẫn là `SELLER`).

---

## §5. GIÁ THAM KHẢO (chi tiết)

### 5.1. GĐ1 — Giá máy mới (`src/data/storePrices.js`)
| Quy tắc | Giá trị |
|---|---|
| Nguồn | Bảng giá cửa hàng **mô phỏng** (`STORE_PRICES`, provenance `SIMULATED`) |
| Chỉ nhận | **Giá NIÊM YẾT còn hàng**, KHÔNG lấy giá khuyến mãi có điều kiện |
| Khớp | Đúng model + dung lượng + cấu hình; phân biệt màu khi giá khác |
| Xác minh | Trong vòng **24 giờ** (`newPriceMaxAgeHours = 24`) |
| Gộp nguồn | Chi nhánh **cùng một chuỗi** chỉ tính là **một nguồn độc lập** |
| Dải | Cần **≥ 2 nguồn độc lập** mới có "dải"; 1 nguồn → `SINGLE_PRICE` |
| Không áp dụng | **KHÔNG** yêu cầu tối thiểu 3 nguồn; **KHÔNG** áp quy tắc 35 giao dịch /
  Condition Score / Z-score của GĐ2 |

### 5.2. GĐ2 — Dải giá máy cũ (`src/data/pricingEngine.js`, `pricingConfig.js`)
| Tham số | Giá trị |
|---|---|
| `minTransactions` | **35** giao dịch chi tiết hợp lệ |
| `windowsMonths` | **[3, 6, 12]** — thử nhỏ nhất trước, dừng khi đạt ≥ 35 |
| `afterDeliveryDays` | **3 ngày** hậu giao hàng |
| `lowerPercentile` / `upperPercentile` | **P10 / P90** |
| `percentileMethod` | **Type 7** (nội suy tuyến tính: `rank = (n-1)·p/100`) |
| Hiển thị | Chỉ P10/P90. **KHÔNG hiển thị** P50/trung vị/trung bình/độ lệch chuẩn/Z |
| Giao dịch đúng biên | Nằm **trong** cửa sổ `[startTime, endTime]` → được tính |

- Kết quả: `NO_DATA` | `INSUFFICIENT_DATA` (kèm `count`/`minTransactions`) | `RANGE`.
- Khi chưa đủ: hiển thị **"Chưa đủ dữ liệu giao dịch để tham khảo giá máy cũ
  (hiện có X/35)."** thay vì bịa dải.

### 5.3. Điều kiện hợp lệ & loại trừ (`referenceDataStatus`)
Một bản ghi **chỉ vào dải** khi (trích điều kiện):
- `price_data_status === "VERIFIED"`, `payment_status === "PAID"`,
  `delivery_status === "DELIVERED"`, có `delivered_at`, có `model`+`storage`, giá > 0;
- đã **qua 3 ngày** hậu giao hàng.
**Loại trừ tuyệt đối:** đang/đã trả hàng (`RETURNING`/`RETURNED`), đã/đang hoàn tiền,
tranh chấp mở, trạng thái hậu giao hàng không hợp lệ. `review_decision = REVOKE/EXCLUDE`
→ `REVOKED`/`EXCLUDED`. **`SIMULATED` và `REAL_VERIFIED` KHÔNG BAO GIỜ trộn**
(mặc định ưu tiên `REAL_VERIFIED`, nếu chưa có thì dùng `SIMULATED` và ghi rõ nhãn).

### 5.4. Điều kiện sơ bộ cấp đơn (`src/data/eligibility.js`)
- Hai bên xác nhận **cùng phiên bản**; có bằng chứng giao hàng; đã hoàn tất (người mua
  xác nhận hoặc hết 3 ngày); thanh toán/thu hộ đã xác minh (COD phải đối soát); không
  hủy/thất bại/hoàn trả/tranh chấp/hoàn tiền; đủ model/dung lượng/tình trạng/giá.

### 5.5. Ngưỡng độ tin cậy & Z-score — ⏳ CHƯA THỐNG NHẤT
`maxSellerConcentration`, `maxClusterConcentration`, `minIndependentBuyers`,
`minIndependentSellers`, `maxSameClusterShare`, **`zThreshold`** đều để **`null`**.
- Engine trả `NOT_CONFIGURED` cho tiêu chí thiếu và **KHÔNG kết luận "đủ tin cậy"**.
- Khi `zThreshold = null`: vẫn gắn **nhãn vị trí** nhưng **KHÔNG hiện lời nhắc**.
- `PriceDemoPage` cho phép chọn Z (1/2/3) **chỉ để trình diễn/kiểm thử**; cấu hình
  production vẫn để `null`.

### 5.6. Trình bày Phần 4 (`src/components/ReferencePricePanel.jsx`)
- **Hai khu vực độc lập** đặt cạnh nhau khi đủ chỗ (lưới `auto-fit, minmax(240px,1fr)`),
  xếp dọc trên mobile:
  - **Khu vực A** — "Giá máy mới tại các cửa hàng".
  - **Khu vực B** — "Các máy tương tự đã bán với giá" (đổi thành "Các máy giống máy của
    bạn đã bán với giá" khi vai là người bán).
- Mỗi khu vực: dải giá → **thanh dải giá** (đoạn gradient navy→teal + hai đầu mốc +
  **marker giá đang rao**, nhãn neo trên marker) → dòng vị trí.
- Nhãn vị trí khu vực A dùng nguyên văn "Dưới/Trong/Trên khoảng giá máy mới"; khu vực B
  dùng "Dưới/Trong/Trên khoảng giá lịch sử" (`POSITION_TEXT`).
- **Hai nút chỉ xuất hiện khi có dữ liệu thật và mở nội dung thật:**
  "Xem giá từng cửa hàng" (danh sách nguồn) và "Xem dữ liệu so sánh" (danh sách các mức
  giá đã dùng để tính dải, kèm số giao dịch/cửa sổ/khoảng ngày).
- **Bỏ khối "Cách tính…"**: đã xác nhận không còn khối này trong component.
- **4 biến thể lời nhắc** (`REVIEW_PROMPT`): `{buyer, seller} × {LOW_PRICE, HIGH_PRICE}`,
  chỉ hiện khi ngoài dải **và** `|Z| > zThreshold` **và** sd mẫu > 0.

> ⏳ **Cần xác nhận — "Đường A/B":** mã nguồn **không** chứa nhãn literal "Đường A/B".
> Nội dung tương ứng được hiện thực dưới dạng **hai khu vực độc lập A/B** (A = giá máy
> mới, B = máy tương tự đã bán) + hai nút mở nội dung thật. Nếu nhóm cần **nhãn hiển thị
> "Đường A/B"** đúng nguyên văn, đây là hạng mục **cần bổ sung** (không tự ý thêm khi
> chưa có yêu cầu).

### 5.7. Cờ nghi vấn & gom cụm (quản trị)
- Cờ (`FLAG_CODE`): `PAYMENT_DELIVERY_CONTRADICTION`, `SNAPSHOT_MISSING_OR_INCONSISTENT`,
  `DUPLICATE_DETAIL_CONFLICT`, `BUYER_SELLER_SAME_SUBJECT`, `DEVICE_CIRCULATION`,
  `ELIGIBLE_THEN_RETURNED` — **chỉ gắn khi có bằng chứng rõ**; **không** gắn chỉ vì giá
  cao/thấp, cùng người mua/bán, cùng model/màu/giá, hay thuộc cluster lớn.
- Cụm (`clusterEngine`): `cluster_id` **chỉ** biểu thị quan hệ dữ liệu, **không** là nhãn
  gian lận, **không** dùng để khóa tài khoản. Chỉ tạo cạnh khi có căn cứ (cùng đơn / cùng
  người mua / cùng người bán / cùng cặp mua–bán / cùng thiết bị đã xác minh / quan hệ do
  quản trị xác nhận).

### 5.8. Quản trị dữ liệu giá (`ManagerTransactionsPage`)
- Hàng đợi duyệt: **Duyệt** / **Yêu cầu bổ sung** / **Loại** (kèm lý do) / **Duyệt lại**,
  và khi có khiếu nại: **kết thúc khiếu nại – xác nhận hợp lệ** / **giao dịch hoàn trả**.
- Trên bản ghi đã dùng: **Thu hồi khỏi dữ liệu tham chiếu** / **Thu hồi và tính lại**
  (`setReferenceDecision`, `revokeReference`). Lọc theo cờ nghi vấn và theo `cluster_id`.

---

## §6. DỮ LIỆU VÀ LIÊN KẾT

### 6.1. Thực thể & mã định danh
| Thực thể | Tiền tố mã | Lưu ở | Trường chính |
|---|---|---|---|
| Người dùng | `U01/S01/M01` | state + demo state | `id, name, phone, address, role` |
| Tin đăng | `Pxxx` | `listings` (demo state) | `brand, model, storage, condition, batteryHealth, price, region, seller, listingStatus` |
| Thương lượng | `NEG-…` | `negotiations` (demo state) | `buyerId, sellerId, phoneId, listingPrice, offers[], status, counterPrice, agreedPrice, orderId` |
| Đơn hàng | `DH-…` | `orders` (demo state) | `status, paymentStatus, shippingStatus, trackingCode, carrier, confirmations[], cancelInfo, deliveryProof, supportRequests[], refund, payout, agreementSnapshot, listingPrice, negotiatedPrice, negotiationId` |
| Hồ sơ (case) | `HS-…` | trong `order.supportRequests[]` | `type, reason, status, evidence[], returnShipment, verification, refund, plan` |
| Hoàn tiền | `RF-…` | trong hồ sơ | `status, totalAmount, scope, failureReason` |
| Chi trả người bán | — | `order.payout` | `status, amount` |
| Bằng chứng | `EV-…` | trong hồ sơ | `by, role, at, text, files[], visibility, verification` |
| Giao dịch (giá) | `Txxxx` / `TXD-…` | `transactions` (demo state) | `verification, status, source=SIMULATED, suspicion_flags` |
| Quyết định giá của quản trị | — | `referenceOverrides` (demo state) | theo `transactionDetailId` |
| Đánh giá người bán | `MY-RV` | state phiên (không localStorage) | `orderId, rating, ...` |
| Thông báo | `notif-…` | **suy diễn**, không lưu | `id, kind, title, message, time, link` |

### 6.2. Quan hệ
```
Người dùng 1─n Tin đăng (seller)
Tin đăng  1─n Thương lượng        Thương lượng 0─1 Đơn hàng (orderId)
Đơn hàng  1─n Hồ sơ (supportRequests)
Hồ sơ     0─1 Hoàn tiền      Đơn hàng 0─1 Chi trả (payout)
Đơn hàng  0─1 Giao dịch giá (qua transactionId / patchTransactionByOrder)
Đơn hàng  1─n Thông báo (suy diễn)   Người dùng 1─n Thông báo (theo vai)
```

### 6.3. Lưu trữ & khôi phục
- **Ghi:** mỗi khi `user/listings/orders/negotiations/transactions/referenceOverrides`
  đổi → `saveDemoState({...})` vào `reprice_demo_state_v1`.
- **Đọc:** khi khởi động, `loadDemoState()`; **nếu `schemaVersion` không khớp → bỏ qua
  snapshot cũ** (không ghi đè) và quay về dữ liệu mẫu.
- **Đặt lại (`resetDemoState`):** xoá khoá demo state, đưa `listings/negotiations/
  transactions/orders` về seed, xoá `pendingCheckout`, đăng xuất.
  **Không** đụng tới `reprice_region`, `reprice_favorites`, `reprice_notif_read`,
  `demoMode`, `roleSwitchLog`.
- **Không lưu:** `userReviews`, `registeredAccounts` (chỉ trong phiên).

---

## §7. PHÂN QUYỀN

### 7.1. Ma trận quyền (rút từ các hàm kiểm tra quyền trong `AppContext` + `*Rules.js`)
| Hành động | Khách | Người mua | Người bán | Quản lý |
|---|---|---|---|---|
| Xem trang công khai / chi tiết máy / giá tham khảo | ✅ | ✅ | ✅ | ✅ |
| Tạo/gửi đề nghị thương lượng | ❌ | ✅ (người mua của phiên) | ❌ | ❌ |
| Phản hồi / đối giá / từ chối (thương lượng) | ❌ | ❌ | ✅ (người bán của phiên) | ❌ |
| Tạo đơn | ❌ | ✅ | ❌ | ❌ |
| Xác nhận đơn vòng người mua (`PENDING_BUYER`) | ❌ | ✅ | ❌ | ❌ |
| Xác nhận / từ chối đơn vòng người bán (`PENDING_SELLER`) | ❌ | ❌ | ✅ | ❌ |
| Chuẩn bị hàng, tạo vận đơn, bàn giao, báo sự cố | ❌ | ❌ | ✅ | ❌ |
| Thanh toán QR (mô phỏng) | ❌ | ✅ | ❌ | ❌ |
| Ghi thu tiền / đối soát COD (mô phỏng) | ❌ | ❌ | ❌ | ✅ |
| Hủy đơn | ❌ | ✅ (mua/… theo pha) | ✅ | ⚠️ theo pha |
| Mở hồ sơ trả hàng/khiếu nại, bổ sung, bàn giao trả | ❌ | ✅ | ❌ | ❌ |
| Phản hồi hồ sơ, cung cấp thông tin nhận trả, xác nhận hàng trả | ❌ | ❌ | ✅ | ❌ |
| Nhận hồ sơ / yêu cầu bổ sung / xác minh vận chuyển / ban hành phương án / xem xét lại | ❌ | ❌ | ❌ | ✅ |
| Khởi tạo hoàn tiền / đối soát / xác nhận hoàn xong | ❌ | ❌ | ❌ | ✅ |
| Ghi chi trả người bán (mô phỏng) | ❌ | ❌ | ❌ | ✅ |
| Duyệt / thu hồi dữ liệu giá | ❌ | ❌ | ❌ | ✅ |
| Xem dashboard / đơn toàn hệ thống | ❌ | ❌ | ❌ | ✅ |

### 7.2. Thực thi quyền
- **Kiểm ở cả UI và nơi thực thi logic.** Ví dụ `createOrder` từ chối nếu
  `user.role !== "buyer"`; các hàm thương lượng kiểm `buyerId/sellerId`; các hàm hồ sơ
  dùng `partyOf`/`canViewCase`.
- **Che dữ liệu nhạy cảm:** `maskTracking`, `maskAddress`, `maskPaymentMethod` — người
  không liên quan chỉ thấy dạng che.
- ⚠️ **Giới hạn đã ghi nhận (cố ý trong prototype):** khách **chưa đăng nhập** vẫn mở
  được `/orders/<id>` và thấy **tên người mua + địa chỉ + giá** (trang có dòng "Bạn không
  phải người mua/người bán của đơn này — chỉ xem được thông tin."). Đây là **thiết kế
  prototype có chủ đích**, **chưa được sửa** vì đang **chờ quyết định** của nhóm (xem
  Phụ lục C). `/manager/orders` khi là khách chỉ hiện tên (không địa chỉ) kèm thông báo
  read-only.
- **Không** dùng nút chuyển vai trò / nút demo để bỏ qua quyền: mỗi hành động vẫn tự
  kiểm tra quyền độc lập với vai trò đang chọn.

---

## §8. TRẠNG THÁI VÀ THÔNG BÁO

### 8.1. Các bộ trạng thái tách biệt
| Nhóm | Bộ trạng thái | Nơi định nghĩa |
|---|---|---|
| Đơn hàng | `PENDING_BUYER, PENDING_SELLER, CONFIRMED, SHIPPING, DELIVERED, COMPLETED, CANCELLED, SELLER_REJECTED` | `orderRules` / `AppContext` |
| Thanh toán | `NONE, PENDING_PAYMENT, PAID, FAILED, PENDING_COD_COLLECTION, COD_COLLECTED, PENDING_COD_RECONCILE, COD_RECONCILED, REFUND_PROCESSING, REFUNDED` | `PAYMENT_STATUS` |
| Vận chuyển | 14 trạng thái (`SHIPPING_STATUS_LABEL`) | `src/data/shipping.js` |
| Hồ sơ | `RETURN_STATUS` (nhiều nhóm) | `orderRules` / `caseRules` |
| Vận đơn trả | `RETURN_SHIPMENT_STATUS` | `caseRules` |
| Hoàn tiền | `APPROVED, PROCESSING, DONE, FAILED, RECONCILE` | `caseRules` |
| Chi trả | `NOT_APPLICABLE, PENDING_ELIGIBILITY, ELIGIBLE, PAID_SIMULATED` | `orderRules` |
| Dữ liệu tham chiếu | `PENDING_COMPLETION, PENDING_VERIFICATION, ELIGIBLE, EXCLUDED, REVOKED` | `pricingEngine.REFERENCE_STATUS` |
| Thương lượng | `AWAITING_SELLER, SELLER_COUNTER, AGREED, REJECTED, CANCELLED` | `negotiationRules` |

### 8.2. Thông báo (suy diễn trong `AppContext.notifications`)
Thông báo **không được lưu** — sinh lại mỗi lần render từ dữ liệu hiện tại (idempotent
theo `id` trong một sự kiện), nên **không tạo trùng** khi reload. Đánh dấu đã đọc lưu ở
`reprice_notif_read`.

> **Sửa lỗi trùng `id` (17/10/2026).** Trước đây nhiều **sự kiện khác nhau** của cùng một
> thương lượng/hồ sơ dùng **chung một `id`** (ví dụ `notif-neg-<id>` cho cả
> `SELLER_COUNTER`/`AGREED`/`REJECTED`), nên sau khi đọc sự kiện đầu, các sự kiện sau bị
> coi là "đã đọc" và **không tăng badge**. Nay `id` gắn theo **từng sự kiện**: thương
> lượng dùng `notif-neg-<id>-<status>-<số offer>` (và `notif-neg-seller-…`), hồ sơ dùng
> `notif-order-<id>-req-<caseId>-<status>-<số tin nhắn>` → sự kiện mới tạo thông báo mới,
> nhưng tải lại trang vẫn ra cùng `id` (không trùng).

| Nhóm | Người nhận | Kích hoạt (tóm tắt) |
|---|---|---|
| Thương lượng (người mua) | buyer | `SELLER_COUNTER`, `AGREED`, `REJECTED` — id theo từng sự kiện |
| Thương lượng (người bán) | seller | `AWAITING_SELLER` (có đề nghị), `AGREED` — id theo từng sự kiện |
| Đơn mới / chờ xác nhận | seller | `PENDING_BUYER`, `PENDING_SELLER` |
| Đã xác nhận / cần thanh toán | buyer | `CONFIRMED` |
| Bị từ chối | buyer | `SELLER_REJECTED` |
| Đang giao / **đã giao thành công** | buyer | `SHIPPING`; **giao thành công** (`status`/`shippingStatus = DELIVERED`) kèm **thời điểm giao + hạn mở yêu cầu trả hàng/hoàn tiền (72h)** và liên kết tới chi tiết đơn |
| **Đang giao tới người mua** | buyer | `shippingStatus = OUT_FOR_DELIVERY` (nhắc có thể từ chối nhận) |
| Chuẩn bị hàng | seller | `CONFIRMED` |
| Vận đơn / giao thất bại / hoàn hàng / sự cố / vận đơn hủy | buyer+seller | theo `shippingStatus`, `shippingIncident` |
| Hồ sơ đến lượt bạn / kết quả hoàn tiền | buyer/seller | `casePendingStep` |
| **Người bán thao tác trên hồ sơ** | buyer | tin nhắn cuối do người bán gửi mà **chưa chuyển lượt cho người mua** (đồng ý, từ chối, bổ sung bằng chứng…) → thông báo cho người mua |
| COD chưa thu/đối soát | seller | `paymentMethod === "COD"` & chưa settled |
| Hủy / hoàn tất đơn | buyer+seller | `CANCELLED`, `COMPLETED` |
| (Quản lý) giao dịch chờ duyệt | manager | `transactions.verification === "PENDING"` |
| (Quản lý) đơn chờ người bán / giao thất bại | manager | `PENDING_SELLER`, `shippingStatus === "FAILED"` |
| (Quản lý) hồ sơ/khiếu nại/hoàn tiền cần xử lý | manager | hồ sơ mở, phiếu xác minh, hoàn `FAILED`/`RECONCILE` |

> **Định dạng thời gian (17/10/2026):** `formatDate` cố định `timeZone:
> "Asia/Ho_Chi_Minh"`; thêm `formatDateTime` cho mốc **có giờ** (thời điểm giao, hạn 72h,
> hạn xem xét lại). Các chỗ trước đây in ISO thô (`r.resolvedAt`, `order.createdAt`,
> `Hạn xem xét lại: <ISO>`) đã chuyển sang các hàm này.

---

## §9. KẾT QUẢ KIỂM THỬ GIAI ĐOẠN 5

### 9.1. Phương pháp
- **Không có framework E2E** trong dự án. Cách kiểm thử GĐ5: **điều khiển trình duyệt
  thật** (harness) + đọc `localStorage` `reprice_demo_state_v1`, kết hợp **5 bộ selftest
  Node** hiện có.
- Dữ liệu dùng **seed + thao tác UI**; đặt lại bằng `localStorage.clear()`. Thời hạn
  kiểm bằng nút **"Điều khiển demo"** (đồng hồ giả lập) trong `SupportCasePage`.
- **Nguyên tắc:** không sửa logic để test pass; không thêm dữ liệu giả; không dùng
  `SIMULATED` làm bằng chứng `REAL_VERIFIED`; không giả định thanh toán/hoàn tiền/vận
  chuyển thật đã xảy ra.

### 9.2. Bảng kết quả 9 kịch bản (chạy thực tế trong GĐ5)
| Kịch bản | Kết quả | Bằng chứng (mã/chuỗi trạng thái) | Lỗi |
|---|---|---|---|
| 1. Mua ngay | ✅ PASS | `DH-MVB98RRT1` (P001, U01→S01, 9.2M, COD/`PENDING_COD_COLLECTION`, `negotiationId=null`); reload `/orders/create` không nhân đôi | — |
| 2. Thương lượng thành công | ✅ PASS | `NEG-MVB9WQYQ1` offer 8.5M → `AGREED`; giá rao P001 giữ 9.2M; đơn `DH-MVB9Z3TK1` (`listingPrice` 9.2M, `negotiatedPrice` 8.5M, liên kết `negotiationId`, **chỉ 1 đơn**); thông báo 2 chiều | — |
| 3. Thương lượng bị từ chối | ✅ PASS | `NEG-MVBA2JCA1` offer 8.0M → seller từ chối → `REJECTED`, `agreedPrice=null`, `orderId=null`; giá rao giữ 9.2M/`ACTIVE`; buyer **không** có nút "Tạo đơn hàng"; reload nhất quán | — |
| 4. Hủy đơn trước bàn giao (A/B/C) | ✅ PASS | A `DH-MVB9TVFX1` (`PENDING_BUYER`→`CANCELLED`+`cancelInfo`, không hoàn COD); B `DH-MVB9UIJZ1` (`CONFIRMED`+`AWAITING_PICKUP`+`RPXMVB9UYRN9UIJZ11`→`CANCELLED`, vận đơn `VOIDED`); C `DH-MVB9VQC11` (`ACCEPTED`→không hủy được, ALT_FLOW, giữ `SHIPPING`) | — |
| 5. Giao hàng thành công | ✅ PASS | chuỗi `PREPARING→…→DELIVERED`; mọi event `SIMULATED`; `deliveryProof.deadlineAt` = +3 ngày | — |
| 6. Báo chưa nhận hàng dù hệ thống ghi đã giao | ✅ PASS | `DH-CASE-05` → xác minh `LOST` → phương án `requiresReturn=false` → `REFUND_ELIGIBLE` → `REFUND_PROCESSING` → `REFUNDED` (11.8M = `goodsAmount`) | — |
| 7. Yêu cầu trả hàng | ✅ PASS | `HS-MVB9N3EL1` / `DH-CASE-01` đủ chuỗi `PENDING_SELLER→SELLER_SUPPLEMENT→RETURN_PENDING_INFO→RETURN_AWAITING_HANDOVER→RETURNING→RETURNED→REFUND_ELIGIBLE→REFUND_PROCESSING→REFUNDED` (9.2M); `RETURNING` hiện "Đang vận chuyển trả"; `DH-CASE-12` `RETURN_OBSTACLE` không tự quy lỗi | — |
| 8. Khiếu nại | ✅ PASS | `DH-CASE-11` chống trùng hồ sơ; quá hạn → `PENDING_MANAGER`; seller bị khóa phản hồi sau đó; `DH-CASE-04` giữ `DELIVERED`, chặn mô phỏng hoàn tất, `payout=null` | — |
| 9. Hoàn tiền (A–E) | ✅ PASS | A `DH-CASE-08` `PROCESSING→DONE` (10.26M = goods 10.2M + phí 60k); B `DH-CASE-09` `FAILED` có `failureReason`, **không** bị đánh dấu hoàn → đối soát → `DONE`; C buyer "Báo chưa nhận được tiền hoàn" → `awaits=MANAGER`; D COD `DH-MVB98RRT1` chặn "Khởi tạo hoàn tiền"; E `DH-CASE-11` `payout=PAID_SIMULATED`, ghi hoàn mô phỏng nhưng **không tự thu hồi** | — |

### 9.3. Bộ selftest Node (`npm test`)
Kết quả chạy lại ngày 17/10/2026 — **250 đạt / 0 lỗi, exit 0**:

| Bộ kiểm thử | Số test | Kết quả |
|---|---|---|
| `pricing-selftest.mjs` (engine giá tham khảo) | 81 | ✅ 0 lỗi |
| `order-selftest.mjs` (quy tắc đơn hàng – Phần XVI) | 55 | ✅ 0 lỗi |
| `case-selftest.mjs` (hồ sơ trả hàng–hoàn tiền–khiếu nại) | 43 | ✅ 0 lỗi |
| `negotiation-selftest.mjs` (thương lượng & tạo đơn) | 38 | ✅ 0 lỗi |
| `shipping-selftest.mjs` (hủy đơn–vận chuyển–từ chối nhận) | 33 | ✅ 0 lỗi |
| **Tổng** | **250** | **✅ PASS** |

### 9.4. Build
- `npm run build` → **thành công**, **100 module**, `built in ~6.2s`, exit 0 (17/10/2026,
  sau khi thêm `src/components/EvidenceUploader.jsx`).
- Artifact: `dist/index.html`, `dist/assets/index-*.css` (~36.9 kB), `dist/assets/index-*.js`
  (~689.9 kB). Vite cảnh báo chunk > 500 kB (khuyến nghị code-split) — **không phải lỗi**.
- Console trang cuối khi kiểm thử: **không** warning/error từ ứng dụng.

---

## §10. GIỚI HẠN HIỆN TẠI

### 10.1. Thật vs mô phỏng
| Hạng mục | Thực tế |
|---|---|
| Ứng dụng, luồng nghiệp vụ, tính toán giá | **Thật** (chạy client) |
| Dữ liệu người dùng/tin đăng/giao dịch/đơn | **Mô phỏng / seed**, có nhãn `SIMULATED` |
| Thanh toán (QR, COD, hoàn tiền) | **Mô phỏng** — không có cổng thanh toán |
| Vận chuyển | **Mô phỏng** — không có API ĐVVC |
| Chữ ký/xác thực người dùng | **Mock** — không có auth thật |
| Đánh giá chất lượng máy / kiểm định kỹ thuật | **Mô phỏng / chờ chính sách** |
| Tệp bằng chứng | Chỉ lưu **metadata** (không upload); có chọn ảnh/video + xem trước trong phiên |
| Ngưỡng tin cậy & Z-score | **Chưa cấu hình** (`null`) |
| Múi giờ hiển thị ngày/giờ | Cố định **`Asia/Ho_Chi_Minh`** (`formatDate`/`formatDateTime`) |

### 10.2. Vấn đề chưa giải quyết (đã ghi nhận)
1. ⏳ **Quyền xem chi tiết đơn khi chưa đăng nhập** (lộ tên + địa chỉ + giá) — thiết kế
   prototype cố ý; **chờ quyết định** có thêm cổng đăng nhập (party/manager) hay không.
2. ⚠️ Sau `escalateOverdueSupport`, `status = PENDING_MANAGER` nhưng `awaits` có thể vẫn
   `SELLER` (lỗi mức thấp).
3. ⚠️ Sau khi tạo đơn từ phiên `AGREED`, trang thương lượng người mua **vẫn hiện nút
   "Tạo đơn hàng"** (logic chặn trùng có, nhưng UI không ẩn/khóa và không hiện link đơn).
4. ⏳ Chưa có cảnh báo xung đột tường minh khi **đã chi trả cho người bán mà vẫn ghi hoàn**.
5. ⚠️ Hạn 72h/48h/24h/3 ngày **chỉ chạy client** — không có backend cưỡng chế.
6. ⚠️ Chưa có **test UI tự động**; kiểm thử GĐ5 dựa vào trình duyệt + đọc `localStorage`.
7. ⚠️ GĐ1 **chưa tách VAT** trong giá máy mới (giá niêm yết dùng nguyên).
8. ⏳ "Đường A/B" (nhãn hiển thị) — xem §5.6, cần xác nhận.
9. ⏳ Chính sách chưa chốt: địa điểm nhận trả thay thế, phí/đơn vị kiểm tra kỹ thuật, phân
   bổ phí khi chưa rõ trách nhiệm → hiển thị "Chờ hoàn thiện phương án".

---

## §11. HƯỚNG PHÁT TRIỂN TIẾP THEO

> Các mục dưới đây **chưa triển khai** — không được trình bày như chức năng đã có.

1. Hoàn thiện **cổng xác thực/đăng nhập** thật và áp quyền xem đơn/hồ sơ theo party.
2. Cấu hình **ngưỡng tin cậy & Z-score** sau khi nhóm chốt; bật lời nhắc kiểm tra đúng
   điều kiện.
3. **Backend + cơ sở dữ liệu** thay `localStorage`; cưỡng chế thời hạn phía máy chủ.
4. **Tích hợp thanh toán** (thử nghiệm) và **API vận chuyển** thật; thay thế dữ liệu mô phỏng.
5. **Upload tệp bằng chứng** thật (thay vì chỉ metadata).
6. Sửa 3 lỗi mức thấp ở §10.2 (2, 3, 4).
7. Bổ sung **test UI tự động** (E2E) cho các luồng trọng yếu.
8. Hoàn thiện chính sách kiểm định/địa điểm nhận trả/phí (bỏ trạng thái "Chờ hoàn thiện
   phương án").
9. Tối ưu **code-split** để giảm cảnh báo bundle > 500 kB.

## Phụ lục A — Bảng đối chiếu yêu cầu ↔ triển khai ↔ kiểm thử

| Nội dung | Có trong code? | Có bằng chứng kiểm thử? | Trạng thái |
|---|---|---|---|
| Giá máy mới (24h, gộp chuỗi, ≥2 nguồn) | ✅ | 🧪 pricing-selftest (81) | ✅🟡🧪 |
| Dải giá P10–P90/Type 7/3-6-12/≥35 | ✅ | 🧪 pricing-selftest | ✅🧪 |
| Loại trừ giao dịch không hợp lệ | ✅ | 🧪 pricing-selftest | ✅🧪 |
| Cờ nghi vấn / gom cụm | ✅ | ⚠️ chỉ qua selftest gián tiếp | ✅🟡 |
| Thương lượng có cấu trúc | ✅ | 🧪 negotiation-selftest (38) + E2E | ✅🧪 |
| Tạo đơn đúng giá đã chốt / chống trùng | ✅ | 🧪 + E2E kịch bản 1–3 | ✅🧪 |
| Hủy đơn theo pha | ✅ | 🧪 order-selftest (55) + E2E kịch bản 4 | ✅🧪 |
| Vận chuyển & giao thất bại | ✅ | 🧪 shipping-selftest (33) + E2E 4–5 | ✅🟡🧪 |
| Trả hàng / khiếu nại / hoàn tiền | ✅ | 🧪 case-selftest (43) + E2E 6–9 | ✅🟡🧪 |
| Phân quyền theo vai | ✅ | 🧪 trong các selftest + E2E | ✅🧪 |
| Màu + tỉnh/thành khi đăng bán; lưu `colorName` | ✅ | 🧪 E2E (đăng tin "Xanh lá" → chi tiết đúng) | ✅🧪 |
| Chụp ảnh trực tiếp + tải ảnh/video bằng chứng | ✅ | ⚠️ chỉ lưu metadata; chưa có test tự động | ✅🟡 |
| Thông báo 2 chiều (thương lượng/giao hàng/hồ sơ) | ✅ | 🧪 E2E (badge + không trùng id) | ✅🧪 |
| Định dạng ngày/giờ theo múi giờ VN (72h) | ✅ | 🧪 E2E (hiện giờ VN) | ✅🧪 |
| Trình bày Phần 4 (2 khu vực, thanh dải, marker) | ✅ | ⚠️ chưa có test UI tự động | ✅ |
| Nhãn "Đường A/B" literal | ❌ | — | ⏳ chờ xác nhận |
| Ngưỡng tin cậy / Z-score | ⛔ để `null` | — | ⏳ chờ quyết định |
| Thanh toán / vận chuyển / hoàn tiền thật | ❌ | — | 🟡 (chỉ mô phỏng) |

## Phụ lục B — Lỗi đã phát hiện & lỗi còn tồn
- **Đã sửa (GĐ5):** `src/pages/OrderDetailPage.jsx` — lý do mặc định trong modal mở hồ sơ
  đổi từ `RETURN_REASON_OPTIONS[0]` → `CASE_REASON_OPTIONS[0]` (3 chỗ) và bỏ import
  `RETURN_REASON_OPTIONS`; kiểm chứng `#support-type.value = "Sai máy/phiên bản"` nằm trong
  `CASE_REASON_OPTIONS`.
- **Đã sửa (17/10/2026):**
  1. `addListing` **không lưu `colorName`** → trang chi tiết tin mới hiện `Màu sắc: —`.
     Đã lưu `colorName` (kèm `ram`, `networkLock`, `contactPhone`, `photoCount`). Kiểm
     chứng: đăng tin màu "Khác" = "Xanh lá" → chi tiết hiện `Màu sắc: Xanh lá`.
  2. **Trùng `id` thông báo giữa nhiều sự kiện** của cùng thương lượng/hồ sơ khiến sự
     kiện sau bị coi là "đã đọc". Đã gắn `id` theo từng sự kiện. Kiểm chứng: đánh dấu tất
     cả đã đọc (badge 0) → thêm đề nghị giá mới của người bán cùng phiên → badge = 1.
  3. Thông báo **đã giao** dùng câu cũ "hãy xác nhận đã nhận hàng" (trái GĐ5). Đã đổi
     thành "Đơn hàng đã được giao thành công" kèm **thời điểm giao + hạn 72h** + liên kết.
  4. `patchCase` **không cập nhật `updatedAt`** → thông báo hồ sơ luôn mang thời điểm tạo.
     Đã set `updatedAt` khi cập nhật hồ sơ.
  5. In **ISO thô** ở `OrderDetailPage` (`r.resolvedAt`), `ReviewSellerPage`
     (`order.createdAt`) và lịch sử hồ sơ (`Hạn xem xét lại: <ISO>`). Đã chuẩn hoá qua
     `formatDate`/`formatDateTime`.
- **Còn tồn (mức thấp):** xem §10.2 (mục 2, 3, 4).

## Phụ lục C — Hạng mục chờ quyết định nghiệp vụ
1. Cổng đăng nhập cho trang chi tiết đơn + trang hồ sơ (party/manager) — có/không.
2. Nhãn hiển thị "Đường A/B" — có cần đúng nguyên văn hay không.
3. Các ngưỡng tin cậy & Z-score (hiện `null`).
4. Chính sách: địa điểm nhận trả thay thế, phí/đơn vị kiểm tra kỹ thuật, phân bổ phí khi
   chưa rõ trách nhiệm.
5. (GĐ1) Có tách VAT trong giá máy mới hay không.
6. Hồ sơ **khiếu nại / báo chưa nhận hàng**: giữ cách hiện tại (đổi **nhãn** ô `description`
   thành "Đánh giá/nhận xét") hay **thêm trường tách biệt** (ví dụ `buyerReview` kèm
   `buyerRating`) — xem §4.3 và §13 (mục 7). Hiện chưa sửa vì cần chốt yêu cầu/ngữ nghĩa.

---

## §12. GHI CHÚ VỀ TÀI LIỆU & LƯU TRỮ

### 12.1. Document tổng hợp chính thức
- **Trong repository `reprice-web`: KHÔNG có** tài liệu tổng hợp nào (và chưa từng có
  trong lịch sử Git). Vì vậy file **`TAI-LIEU-REPRICE.md` này là tài liệu tổng hợp
  chính thức được tạo mới**, đặt tại thư mục gốc dự án.
- **Ngoài repository** (thư mục `/Users/macduy/Documents/AISC/`) có các tài liệu gốc
  liên quan, **không bị ghi đè/xóa**:
  - `THUYẾT MINH ĐỀ TÀI.pdf` — thuyết minh đề tài (nguồn đặc tả).
  - `AISC26_Mau_Thuyet_Minh_Du_An.docx` — mẫu thuyết minh dự án của cuộc thi.
  - `RePrice_Cau_hoi_va_de_xuat.docx` — biên bản câu hỏi/làm rõ hệ thống.
  - `RePrice_Luong_van_hanh (3).drawio` (+ .png) — sơ đồ luồng vận hành.
  - (`stitch_reprice_mis_homepage_design/DESIGN.md` — thiết kế giao diện tham khảo.)

### 12.2. Trạng thái lưu
- Lưu **cục bộ trong thư mục dự án** (`reprice-web/TAI-LIEU-REPRICE.md`).
- **Chưa commit, chưa push, chưa deploy** (theo yêu cầu).
- Có thể xuất bản Word (`.docx`) theo mẫu AISC'26 bằng `pandoc` khi được yêu cầu.

### 12.3. Giới hạn của chính tài liệu này
- Không trích được nội dung PDF thuyết minh (môi trường không có công cụ đọc PDF);
  phần "tổng quan" dựa trên mã nguồn, `InfoPage.jsx` và biên bản Q&A.
- Mọi con số, chuỗi trạng thái và mã định danh trong tài liệu đều lấy từ mã nguồn hoặc
  kết quả chạy thực tế; **không có số liệu hay bằng chứng nào được tạo thêm**.

---

## §13. BỔ SUNG 9 HẠNG MỤC UX & THÔNG BÁO (17/10/2026)

Tất cả các hạng mục dưới đây **đã triển khai trong code** (không tạo trang/backend mới;
sửa trực tiếp code hiện có). Cột "Bằng chứng" là kết quả kiểm chứng **thực tế** bằng
trình duyệt thật (harness) ngày 17/10/2026 + `npm test`.

| # | Hạng mục | File chính | Bằng chứng kiểm chứng | Trạng thái |
|---|---|---|---|---|
| 1 | Làm gọn giao diện đăng bán + bổ sung màu (Đen/Trắng/Vàng gold/Xanh dương/Không rõ/Khác + ô nhập) | `src/pages/CreateListingPage.jsx`, `src/data/catalog.js`, `src/context/AppContext.jsx` | Màn màu hiện đủ 4 màu chuẩn + "Không rõ" + "Khác"; chọn "Khác" hiện ô nhập, bỏ trống bị chặn ("Vui lòng nhập tên màu thực tế."); nhập "Xanh lá" → review hiện `Màu: Xanh lá`; tin mới lưu `colorName:"Xanh lá"` → chi tiết hiện `Màu sắc: Xanh lá` (trước là `—`) | ✅ |
| 2 | Chụp ảnh trực tiếp trên điện thoại | `src/components/wizard/PhotoManager.jsx` | Nút "Chụp ảnh trực tiếp"; input có `capture="environment"`, `accept="image/*"` (kiểm DOM); có ghi chú fallback khi thiết bị không hỗ trợ; ảnh sai loại/>8MB báo lỗi + "Chọn lại" | ✅ |
| 3 | Người bán tự chọn tỉnh/thành toàn quốc | `src/pages/CreateListingPage.jsx` (`PROVINCES`) | Màn "Chọn tỉnh/thành" liệt kê **63** tỉnh/thành (đếm DOM = 63; từ `Hà Nội`…`Yên Bái`) | ✅ |
| 4 | Thông báo thương lượng **hai chiều** | `src/context/AppContext.jsx` (`notifications`) | Buyer nhận "Người bán đề nghị mức giá mới"; `id` theo từng sự kiện: sau khi đọc hết (badge 0), thêm đề nghị giá mới cùng phiên → badge **1** (trước đây bị coi là đã đọc) | ✅ |
| 5 | Thông báo giao hàng thành công + điều hướng trang đơn hàng | `src/context/AppContext.jsx` | Tiêu đề "Đơn hàng đã được giao thành công", nội dung kèm **thời điểm giao** + **hạn mở yêu cầu trả hàng/hoàn tiền** + link `/orders/<id>` (kiểm chứng `DH-CASE-01`) | ✅ |
| 6 | Chuẩn hoá định dạng ngày hết hạn 72h | `src/utils/format.js` (`VN_TIMEZONE`, `formatDateTime`), `OrderDetailPage`, `ReviewSellerPage`, `AppContext` | Mọi mốc dùng múi giờ `Asia/Ho_Chi_Minh`; hạn hiện dạng "16:00 17/10/2026"; hết in ISO thô | ✅ |
| 7 | Trường **đánh giá/nhận xét** trong hồ sơ hỗ trợ | `src/pages/OrderDetailPage.jsx` | Chọn loại "Yêu cầu hỗ trợ/khiếu nại" → nhãn ô đổi thành "Đánh giá/nhận xét" (loại trả hàng giữ "Mô tả vấn đề") | ✅ |
| 8 | Tải ảnh/video bằng chứng + "Ghi chú phản ánh" (hồ sơ trả hàng/hoàn tiền) | `src/components/EvidenceUploader.jsx` (mới), `OrderDetailPage`, `SupportCasePage`, `AppContext` | Modal trả hàng có "Ghi chú phản ánh" + "Ảnh/video bằng chứng" (≤6 tệp, ≤20MB, xem trước); `SupportCasePage` có cùng uploader ở "Bổ sung bằng chứng" + phản hồi người bán; chỉ lưu metadata | ✅ |
| 9 | Mọi thao tác người bán ảnh hưởng người mua đều có thông báo | `src/context/AppContext.jsx` | Giữ thông báo sẵn có (xác nhận/từ chối đơn, vận đơn, giao thất bại, hoàn hàng); **bổ sung** "Đơn đang giao tới bạn" (`OUT_FOR_DELIVERY`) và "Người bán đã phản hồi hồ sơ" | ✅ |

**Kiểm thử bổ sung (thực tế):**
- `npm run build` → thành công, **100 module** (thêm `EvidenceUploader.jsx`), exit 0.
- `npm test` → **250 đạt / 0 lỗi** (pricing 81 · orders 55 · cases 43 · negotiation 38 · shipping 33).
- Trình duyệt: buyer **47** thông báo, **0 cặp trùng** (kiểm bằng `href + title + message`).
- **Ghi chú diễn giải mục 7:** "trường đánh giá/nhận xét trong hồ sơ hỗ trợ" được hiểu là
  **ô nhận xét/mô tả của người mua trong hồ sơ khiếu nại & báo chưa nhận hàng** (đổi nhãn
  để **không tạo trường trùng** với "Mô tả vấn đề" của hồ sơ trả hàng). Nếu cần **thêm
  trường mới tách biệt hoàn toàn**, xem Phụ lục C.
- **Ghi chú diễn giải mục 8:** "Ghi chú phản ánh" là **trường riêng** (`reflectionNote`) chỉ
  ở hồ sơ trả hàng/hoàn tiền; ảnh/video **chỉ lưu metadata** (không upload) — đúng bản chất
  prototype, xem §10.1.

**Rà soát tài liệu & kiểm thử lại (17/10/2026):**
- Chạy lại `npm run build` (100 module, exit 0) và `npm test` (250 đạt / 0 lỗi) — kết quả
  **trùng khớp** với §9.3/§9.4; không sửa logic để test pass.
- Đối chiếu tài liệu ↔ mã nguồn, đã sửa **số liệu lỗi thời**: §1.4 `99 → 100 module`
  (trước đây tài liệu **tự mâu thuẫn** với §9.4/§13) và `24 → 27 route` (đếm thực tế
  `grep -c 'path=' src/App.jsx`); bổ sung §4.3 nêu rõ `description` dùng chung; thêm
  Phụ lục C mục 6 (trước đây §13 trỏ tới một mục **không tồn tại**).
- **Danh mục "15 mục §V": NOT RUN** — không tìm thấy danh mục gốc trong repo/tài liệu/lịch
  sử; **không tuyên bố đã chạy** cho tới khi có danh mục.
- Kết quả E2E ở §9.2 và §13 là **bản ghi của lần chạy trước**; lần rà soát này xác minh lại
  **bằng mã nguồn** (không mở lại trình duyệt).
