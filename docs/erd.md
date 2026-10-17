# RePrice — ERD (PostgreSQL)

> Bám theo `docs/SPEC.md` (17/10/2026). Bản xem trực quan: artifact "RePrice Domain Model".

Quy ước chung: khóa chính `uuid`; tiền là `bigint` đơn vị đồng; thời gian là `timestamptz`; trạng thái là `text` có `CHECK` theo đúng giá trị trong state diagram. Bảng ở nhóm khác chỉ hiện tên để nối quan hệ.

## 1. Tài khoản, danh mục, tin đăng

Tình trạng máy nằm thẳng trong `listings` (value object), lỗi chức năng tách sang `listing_faults`.

```mermaid
erDiagram
  users ||--o{ listings : "đăng bán"
  users ||--o{ notifications : "nhận"
  users ||--o{ favorites : "lưu"
  listings ||--o{ favorites : ""
  users ||--o{ catalog_requests : "gửi"
  phone_models ||--|{ phone_variants : ""
  phone_variants ||--o{ listings : ""
  listings ||--|{ listing_photos : ""
  listings ||--o{ listing_faults : ""
  listings ||--o{ listing_accessories : ""
  listings ||--o{ listing_history : ""
  users {
    uuid id PK
    text full_name
    text email UK
    text phone
    text password_hash
    text province
    text ward
    bool is_admin
    numeric seller_rating "null khi chưa có đánh giá"
    timestamptz created_at
  }
  notifications {
    uuid id PK
    uuid user_id FK
    text type
    text title
    text body
    text link
    timestamptz read_at
    timestamptz created_at
  }
  favorites {
    uuid user_id PK,FK
    uuid listing_id PK,FK
    timestamptz created_at
  }
  phone_models {
    uuid id PK
    text brand
    text name
  }
  phone_variants {
    uuid id PK
    uuid model_id FK
    int storage_gb
    int ram_gb "null nếu model chỉ có 1 RAM"
    text color "null nếu giá không theo màu"
  }
  catalog_requests {
    uuid id PK
    uuid seller_id FK
    uuid listing_id FK "tin nháp đang chờ"
    text brand
    text model_text
    text status "PENDING APPROVED REJECTED"
    timestamptz created_at
  }
  listings {
    uuid id PK
    uuid seller_id FK
    uuid variant_id FK
    bigint price "VND, lớn hơn 0"
    text status "DRAFT ACTIVE PAUSED IN_TRANSACTION SOLD REMOVED"
    text appearance "EXCELLENT GOOD FAIR POOR"
    text functionality "FULL HAS_FAULTS NOT_FULLY_CHECKED"
    smallint battery_health_pct "0-100, null nếu chỉ có trạng thái chữ"
    text battery_status_text
    text battery_bucket "GE_90 FROM_80_TO_89 LT_80, null nếu không rõ"
    text condition_key "null nếu thiếu tiêu chí"
    text network_lock "UNLOCKED LOCKED UNKNOWN"
    int usage_months
    text warranty_type "NONE BRAND STORE BOTH UNKNOWN"
    date warranty_until
    text description
    text province
    text ward
    smallint draft_step
    timestamptz published_at
    timestamptz created_at
    timestamptz updated_at
  }
  listing_photos {
    uuid id PK
    uuid listing_id FK
    text url
    smallint position
    bool is_cover
  }
  listing_faults {
    uuid id PK
    uuid listing_id FK
    text component "SCREEN CAMERA SPEAKER ..."
    text severity "DEGRADED NOT_WORKING"
    text note
  }
  listing_accessories {
    uuid listing_id PK,FK
    text type PK "BOX CHARGER CABLE ... OTHER"
    text note
  }
  listing_history {
    uuid id PK
    uuid listing_id FK
    uuid changed_by FK
    jsonb changes
    timestamptz created_at
  }
```


## 2. Thương lượng, đơn hàng, thanh toán, giao hàng

`order_items.id` chính là mã chi tiết giao dịch. `snapshot` chụp lại phiên bản máy và tình trạng lúc chốt giá; người bán sửa tin sau đó không ảnh hưởng.

```mermaid
erDiagram
  listings ||--o{ negotiations : ""
  users ||--o{ negotiations : "người mua"
  negotiations ||--|{ negotiation_offers : ""
  negotiations |o--o| orders : "chốt giá"
  users ||--o{ orders : "mua / bán"
  orders ||--|{ order_items : ""
  listings ||--o{ order_items : ""
  orders ||--o{ order_status_history : ""
  orders ||--|| payments : ""
  orders ||--o| payouts : ""
  orders ||--o{ shipments : ""
  shipments ||--o{ shipment_events : ""
  orders ||--o| reviews : ""
  negotiations {
    uuid id PK
    uuid listing_id FK
    uuid buyer_id FK
    uuid seller_id FK
    bigint listing_price_at_start
    text status "AWAITING_SELLER AWAITING_BUYER AGREED REJECTED CANCELLED CLOSED"
    bigint agreed_price
    text closed_reason
    timestamptz created_at
    timestamptz updated_at
  }
  negotiation_offers {
    uuid id PK
    uuid negotiation_id FK
    text by_party "BUYER SELLER"
    bigint amount
    text note
    timestamptz created_at
  }
  orders {
    uuid id PK
    text code UK "RP-20261016-0001"
    uuid buyer_id FK
    uuid seller_id FK
    uuid negotiation_id FK,UK "null khi Mua ngay"
    text status "AWAITING_PAYMENT CONFIRMED SHIPPING DELIVERED RECEIVED ON_HOLD COMPLETED REFUNDED CANCELLED RETURNED_TO_SELLER"
    bigint shipping_fee
    text recipient_name
    text recipient_phone
    text address_line
    text province
    text ward
    timestamptz created_at
    timestamptz payment_due_at "created_at + 24h"
    timestamptz delivered_at
    timestamptz received_at
    timestamptz return_deadline
    timestamptz completed_at
    timestamptz cancelled_at
    text cancel_reason
  }
  order_items {
    uuid id PK "mã chi tiết giao dịch"
    uuid order_id FK
    uuid listing_id FK
    uuid variant_id FK
    bigint listing_price_at_agreement
    bigint agreed_price "không gồm phí vận chuyển"
    jsonb snapshot "phiên bản + tình trạng lúc chốt"
    text condition_key
  }
  order_status_history {
    uuid id PK
    uuid order_id FK
    text from_status
    text to_status
    uuid actor_id FK "null khi bộ lập lịch"
    text reason
    timestamptz created_at
  }
  payments {
    uuid id PK
    uuid order_id FK,UK
    text method "PREPAID COD"
    bigint amount
    text status "PENDING PAID FAILED COD_PENDING COD_COLLECTED VOID"
    text provider_ref
    bool simulated
    timestamptz paid_at
    timestamptz created_at
  }
  payouts {
    uuid id PK
    uuid order_id FK,UK
    uuid seller_id FK
    bigint amount
    text status "HELD RELEASED REVERSED"
    bool simulated
    timestamptz released_at
  }
  shipments {
    uuid id PK
    uuid order_id FK
    uuid support_case_id FK "chỉ có ở vận đơn trả"
    text direction "OUTBOUND RETURN"
    text tracking_code UK
    text carrier
    text status "AWAITING_PICKUP PICKED_UP IN_TRANSIT OUT_FOR_DELIVERY DELIVERED FAILED RETURNING RETURNED VOIDED INCIDENT"
    smallint attempts
    bool simulated
    timestamptz created_at
  }
  shipment_events {
    uuid id PK
    uuid shipment_id FK
    text status
    text note
    bool simulated
    timestamptz occurred_at
  }
  reviews {
    uuid id PK
    uuid order_id FK,UK
    uuid buyer_id FK
    uuid seller_id FK
    smallint rating "1-5"
    text comment
    timestamptz created_at
  }
```


## 3. Trả hàng, hoàn tiền, khiếu nại

```mermaid
erDiagram
  orders ||--o{ support_cases : ""
  support_cases ||--|{ support_case_items : ""
  order_items ||--o{ support_case_items : ""
  support_cases ||--o{ case_events : ""
  support_cases ||--o{ evidence : ""
  evidence ||--|{ evidence_files : ""
  support_cases ||--o{ resolutions : ""
  support_cases ||--o{ shipping_verifications : ""
  support_cases ||--o| shipments : "vận đơn trả"
  support_cases ||--o{ refunds : ""
  support_cases {
    uuid id PK
    text code UK "HS-..."
    uuid order_id FK
    text type "RETURN NOT_RECEIVED COMPLAINT"
    text reason
    text description
    text status "AWAITING_SELLER AWAITING_BUYER_INFO ... RESOLVED"
    text awaiting_party "BUYER SELLER ADMIN"
    timestamptz due_at
    bool supplement_used
    uuid opened_by FK
    uuid assigned_admin_id FK
    timestamptz opened_at
    timestamptz closed_at
  }
  support_case_items {
    uuid case_id PK,FK
    uuid order_item_id PK,FK
  }
  case_events {
    uuid id PK
    uuid case_id FK
    uuid actor_id FK "null khi bộ lập lịch"
    text action
    text from_status
    text to_status
    text note
    timestamptz created_at
  }
  evidence {
    uuid id PK
    uuid case_id FK
    uuid uploaded_by FK
    text note
    text visibility "PARTIES ADMIN_ONLY"
    timestamptz created_at
  }
  evidence_files {
    uuid id PK
    uuid evidence_id FK
    text file_name
    text mime_type
    bigint size_bytes
    text storage_url
  }
  resolutions {
    uuid id PK
    uuid case_id FK
    uuid issued_by FK
    text decision "APPROVE_RETURN REFUND_NO_RETURN REJECT CONTINUE_VERIFY"
    text rationale
    bool requires_return
    bigint refund_amount
    jsonb fee_allocation
    timestamptz review_deadline "issued + 48h"
    bool is_current
    timestamptz created_at
  }
  shipping_verifications {
    uuid id PK
    uuid case_id FK
    uuid shipment_id FK
    text ticket_code
    text question
    text status "NOT_SENT SENT AWAITING RESPONDED"
    text response
    timestamptz sent_at
    timestamptz responded_at
  }
  refunds {
    uuid id PK
    uuid case_id FK
    uuid order_id FK
    bigint amount
    text status "APPROVED PROCESSING SUCCEEDED FAILED RECONCILING"
    text provider_ref
    text failure_reason
    timestamptz created_at
    timestamptz updated_at
  }
```


## 4. Giá tham khảo, dữ liệu tham chiếu, quản trị

`reference_transactions` giữ sẵn `variant_id` và `condition_key` để ghép nhóm nhanh. Fixture demo không có đơn thật nên `order_item_id` được để trống khi `data_source = SIMULATED`.

```mermaid
erDiagram
  store_sources ||--o{ store_price_quotes : ""
  phone_variants ||--o{ store_price_quotes : ""
  order_items ||--o| reference_transactions : ""
  phone_variants ||--o{ reference_transactions : ""
  reference_transactions ||--o{ suspicion_flags : ""
  reference_transactions ||--o{ reference_decisions : ""
  reference_transactions ||--o{ transaction_relations : "a / b"
  price_range_versions ||--|{ price_range_members : ""
  reference_transactions ||--o{ price_range_members : ""
  users ||--o{ admin_audit_logs : "QTV"
  store_sources {
    uuid id PK
    text retailer_name UK
    text website
    bool active
  }
  store_price_quotes {
    uuid id PK
    uuid source_id FK
    uuid variant_id FK
    text color "null nếu giá chung mọi màu"
    bigint price "giá bán hiện tại, gồm VAT"
    bool in_stock
    text url
    timestamptz verified_at
    text status "ACTIVE SUSPENDED"
  }
  reference_transactions {
    uuid id PK
    uuid order_item_id FK,UK "null khi SIMULATED"
    uuid variant_id FK
    text condition_key
    text data_source "REAL SIMULATED"
    text status "PENDING_COMPLETION PENDING_VERIFICATION ELIGIBLE EXCLUDED REVOKED"
    bigint actual_price
    date transaction_date
    timestamptz eligible_at
    uuid cluster_id
    timestamptz updated_at
  }
  suspicion_flags {
    uuid id PK
    uuid reference_transaction_id FK
    text code "PAYMENT_DELIVERY_CONTRADICTION ... ELIGIBLE_THEN_RETURNED"
    text evidence
    text status "OPEN CLEARED CONFIRMED"
    timestamptz raised_at
    timestamptz resolved_at
  }
  reference_decisions {
    uuid id PK
    uuid reference_transaction_id FK
    uuid admin_id FK
    text action "ALLOW KEEP_PENDING EXCLUDE REVOKE REVOKE_RECALC"
    text reason
    text from_status
    text to_status
    timestamptz created_at
  }
  transaction_relations {
    uuid id PK
    uuid a_id FK
    uuid b_id FK
    text relation_type "SAME_ORDER SAME_BUYER SAME_SELLER SAME_DEVICE"
    text basis
  }
  price_range_versions {
    uuid id PK
    uuid variant_id FK
    text condition_key
    text data_source
    text result "RANGE SINGLE_PRICE INSUFFICIENT_DATA NO_DATA"
    smallint window_months "3 6 12"
    int transaction_count
    bigint p10
    bigint p90
    date period_start
    date period_end
    bool is_current
    timestamptz computed_at
  }
  price_range_members {
    uuid version_id PK,FK
    uuid reference_transaction_id PK,FK
  }
  pricing_config {
    text key PK "min_transactions, windows_months, z_threshold ..."
    jsonb value "null = chưa thiết lập"
    uuid updated_by FK
    timestamptz updated_at
  }
  system_clock {
    smallint id PK "luôn = 1"
    bigint offset_seconds "tua thời gian demo"
  }
  admin_audit_logs {
    uuid id PK
    uuid admin_id FK
    text action
    text entity_type
    uuid entity_id
    text reason
    jsonb before
    jsonb after
    timestamptz created_at
  }
```


## 5. Ràng buộc và index quan trọng

| Bảng | Ràng buộc / index | Để làm gì |
|---|---|---|
| `negotiations` | unique (`listing_id`, `buyer_id`) where status in (`AWAITING_SELLER`, `AWAITING_BUYER`) | Một người mua chỉ có một thương lượng đang mở cho mỗi tin |
| `order_items` | unique (`listing_id`) where đơn chưa ở `CANCELLED` / `REFUNDED` (thực hiện bằng khóa hàng trên `listings` khi tạo đơn) | Một máy không bị bán hai lần |
| `orders` | unique `negotiation_id`; index (`status`, `payment_due_at`), (`status`, `return_deadline`) | Một thương lượng chỉ ra một đơn; bộ lập lịch tìm đơn đến hạn |
| `support_cases` | unique (`order_id`) where `closed_at` is null; index (`status`, `due_at`) | Mỗi đơn một hồ sơ đang mở; tìm hồ sơ quá hạn |
| `refunds` | unique (`case_id`) where status in (`APPROVED`, `PROCESSING`, `RECONCILING`) | Không có hai lệnh hoàn chạy song song |
| `reference_transactions` | check: `data_source = 'SIMULATED'` or `order_item_id` not null; index (`variant_id`, `condition_key`, `data_source`, `status`, `transaction_date`) | Dữ liệu thật luôn gắn với một máy đã bán; truy vấn chọn cửa sổ 3 / 6 / 12 tháng |
| `price_range_versions` | unique (`variant_id`, `condition_key`, `data_source`) where `is_current` | Mỗi nhóm máy chỉ có một dải đang công bố |
| `store_price_quotes` | unique (`source_id`, `variant_id`, `color`) | Mỗi chuỗi bán lẻ chỉ góp một giá cho một phiên bản |
| `reviews` | unique `order_id`; check `rating` between 1 and 5 | Mỗi đơn hoàn tất đánh giá một lần |

- Bộ lập lịch đọc giờ hiện tại qua `now() + system_clock.offset_seconds` để nút "Tua thời gian" chạy đúng các hạn 24h, 48h, 3 ngày.
- `pricing_config` chứa các ngưỡng; `z_threshold` để `null` nghĩa là chưa thiết lập, dải giá vẫn hiện, không có lời nhắc.
