# RePrice — Class diagram

> Bám theo `docs/SPEC.md` (17/10/2026). Bản xem trực quan: artifact "RePrice Domain Model".

## 1. Tài khoản, danh mục máy, tin đăng

Một `User` vừa mua vừa bán. Tình trạng máy là một value object `ConditionInfo`; từ đó suy ra nhóm pin và khóa nhóm Condition Score (3 tiêu chí).

```mermaid
classDiagram
  direction LR
  class User {
    +id
    +fullName
    +email
    +phone
    +province
    +ward
    +isAdmin: bool
    +sellerRating
  }
  class PhoneModel {
    +id
    +brand
    +name
  }
  class PhoneVariant {
    +id
    +storageGB
    +ramGB
    +color
  }
  class Listing {
    +id
    +price: VND
    +province
    +ward
    +networkLock
    +usageMonths
    +warranty
    +description
    +status: ListingStatus
    +publish()
    +pause()
    +remove()
  }
  class ConditionInfo {
    <<value object>>
    +appearance: Appearance
    +functionality: Functionality
    +faults: List~Fault~
    +batteryHealthPct
    +batteryBucket() BatteryBucket
    +conditionKey() string
  }
  class Fault {
    +component
    +severity
    +note
  }
  class ListingPhoto {
    +url
    +position
    +isCover
  }
  class Accessory {
    +type
    +note
  }
  class Notification {
    +type
    +title
    +link
    +readAt
  }
  class Appearance {
    <<enumeration>>
    EXCELLENT
    GOOD
    FAIR
    POOR
  }
  class Functionality {
    <<enumeration>>
    FULL
    HAS_FAULTS
    NOT_FULLY_CHECKED
  }
  class BatteryBucket {
    <<enumeration>>
    GE_90
    FROM_80_TO_89
    LT_80
  }
  User "1" --> "*" Listing : đăng bán
  User "1" --> "*" Notification : nhận
  PhoneModel "1" *-- "*" PhoneVariant
  Listing "*" --> "1" PhoneVariant : là máy
  Listing *-- "1" ConditionInfo
  ConditionInfo *-- "*" Fault
  Listing *-- "1..*" ListingPhoto
  Listing *-- "*" Accessory
  ConditionInfo ..> Appearance
  ConditionInfo ..> Functionality
  ConditionInfo ..> BatteryBucket
```

- `conditionKey()` = `appearance | functionality | batteryBucket`. Thiếu một trong ba thì trả rỗng, giao dịch không được ghép nhóm.
- Không có trường lịch sử sửa chữa.

## 2. Thương lượng, đơn hàng, thanh toán, giao hàng

Đơn được tạo khi chốt giá. Mỗi máy trong đơn là một `OrderItem` với giá chốt và snapshot riêng; đây là đơn vị được xét vào dữ liệu giá.

```mermaid
classDiagram
  direction LR
  class Listing {
    +id
    +price
    +status
  }
  class Negotiation {
    +id
    +listingPriceAtStart
    +status: NegotiationStatus
    +agreedPrice
    +closedReason
    +offer(by, amount)
    +accept(by)
    +reject(by)
    +cancel()
  }
  class Offer {
    +id
    +by: Party
    +amount
    +note
    +createdAt
  }
  class Order {
    +id
    +code
    +status: OrderStatus
    +shippingFee
    +createdAt
    +paymentDueAt
    +deliveredAt
    +receivedAt
    +returnDeadline
    +completedAt
    +markReceived()
    +cancel(reason)
    +complete()
  }
  class OrderItem {
    +detailId
    +listingPriceAtAgreement
    +agreedPrice
  }
  class ProductSnapshot {
    <<value object>>
    +variant
    +condition: ConditionInfo
    +conditionKey
  }
  class Payment {
    +method: PREPAID or COD
    +amount
    +status: PaymentStatus
    +providerRef
    +simulated: bool
  }
  class Payout {
    +amount
    +status: PayoutStatus
  }
  class Shipment {
    +trackingCode
    +direction: OUTBOUND or RETURN
    +carrier
    +status: ShipmentStatus
    +attempts
    +simulated: bool
  }
  class ShipmentEvent {
    +status
    +at
    +note
  }
  class Review {
    +rating
    +comment
  }
  Listing "1" --> "*" Negotiation
  Negotiation *-- "1..*" Offer
  Negotiation "0..1" --> "0..1" Order : chốt giá
  Order *-- "1..*" OrderItem
  OrderItem --> "1" Listing
  OrderItem *-- "1" ProductSnapshot
  Order "1" --> "1" Payment
  Order "1" --> "0..1" Payout : chuyển tiền người bán
  Order "1" --> "*" Shipment
  Shipment *-- "*" ShipmentEvent
  Order "1" --> "0..1" Review
```

- `Order` có buyer và seller (tham chiếu `User`); bỏ khỏi hình cho gọn.
- `returnDeadline` = `receivedAt` + 3 ngày nếu người mua bấm "Đã nhận hàng", ngược lại `deliveredAt` + 3 ngày.
- `paymentDueAt` = `createdAt` + 24 giờ. Mua ngay thì không có `Negotiation`.
- Trạng thái đơn, thanh toán, chi trả và vận đơn là bốn trường riêng, không gộp vào một `status`.

## 3. Trả hàng, hoàn tiền, khiếu nại

Ba chức năng dùng chung một `SupportCase`. Mỗi đơn chỉ có một hồ sơ đang mở; chuyển từ trả hàng sang khiếu nại giữ nguyên hồ sơ.

```mermaid
classDiagram
  direction LR
  class Order {
    +id
    +status
  }
  class OrderItem {
    +detailId
  }
  class SupportCase {
    +code
    +type: RETURN or NOT_RECEIVED or COMPLAINT
    +reason
    +description
    +status: CaseStatus
    +awaitingParty: BUYER or SELLER or ADMIN
    +dueAt
    +supplementUsed: bool
    +openedAt
    +closedAt
    +escalate()
    +withdraw()
  }
  class CaseEvent {
    +actor
    +action
    +note
    +at
  }
  class Evidence {
    +uploadedBy
    +files
    +visibility
    +at
  }
  class Resolution {
    +issuedBy
    +decision
    +rationale
    +requiresReturn: bool
    +refundAmount
    +feeAllocation
    +reviewDeadline
  }
  class ShippingVerification {
    +ticketCode
    +question
    +status
    +response
  }
  class Shipment {
    +direction = RETURN
  }
  class Refund {
    +amount
    +status: RefundStatus
    +providerRef
    +failureReason
  }
  Order "1" --> "*" SupportCase
  SupportCase --> "1..*" OrderItem : liên quan máy
  SupportCase *-- "*" CaseEvent
  SupportCase *-- "*" Evidence
  SupportCase "1" --> "*" Resolution : phương án của QTV
  SupportCase "1" --> "*" ShippingVerification
  SupportCase "1" --> "0..1" Shipment : vận đơn trả
  SupportCase "1" --> "0..1" Refund
```

- `Resolution` có thể nhiều bản khi bị đề nghị xem xét lại; bản mới nhất có hiệu lực.
- Chỉ hoàn toàn bộ tiền hàng; phí ghi riêng trong `feeAllocation`.

## 4. Giá tham khảo và dữ liệu tham chiếu

`PricingEngine` là service thuần: đọc báo giá cửa hàng (GĐ1) và giao dịch tham chiếu (GĐ2), tạo `PriceRangeVersion` để truy ngược được dải giá tính từ những giao dịch nào.

```mermaid
classDiagram
  direction LR
  class PhoneVariant {
    +id
  }
  class OrderItem {
    +detailId
    +agreedPrice
  }
  class StoreSource {
    +id
    +retailerName
    +website
    +active: bool
  }
  class StorePriceQuote {
    +price: VND gồm VAT
    +color
    +inStock: bool
    +url
    +verifiedAt
    +status: ACTIVE or SUSPENDED
  }
  class ReferenceTransaction {
    +dataSource: REAL or SIMULATED
    +status: ReferenceStatus
    +actualPrice
    +transactionDate
    +eligibleAt
    +groupKey
    +clusterId
  }
  class SuspicionFlag {
    +code
    +evidence
    +status: OPEN or CLEARED or CONFIRMED
    +raisedAt
  }
  class ReferenceDecision {
    +admin
    +action
    +reason
    +fromStatus
    +toStatus
    +at
  }
  class PriceRangeVersion {
    +groupKey
    +dataSource
    +windowMonths: 3 or 6 or 12
    +transactionCount
    +p10
    +p90
    +periodStart
    +periodEnd
    +computedAt
    +isCurrent: bool
  }
  class PricingConfig {
    +minTransactions = 35
    +windowsMonths = 3, 6, 12
    +newPriceMaxAgeHours = 24
    +zThreshold: nullable
  }
  class PricingEngine {
    <<service>>
    +newPrice(variant) NewPriceResult
    +usedRange(groupKey, source, now) UsedRangeResult
    +evaluate(price, range) PriceEvaluation
  }
  class PriceEvaluation {
    <<value object>>
    +positionLabel: BELOW or IN or ABOVE
    +showReviewPrompt: bool
    +reviewDirection: LOW or HIGH or null
  }
  StoreSource "1" --> "*" StorePriceQuote
  StorePriceQuote "*" --> "1" PhoneVariant
  OrderItem "1" --> "0..1" ReferenceTransaction
  ReferenceTransaction *-- "*" SuspicionFlag
  ReferenceTransaction "1" --> "*" ReferenceDecision
  PriceRangeVersion "*" --> "*" ReferenceTransaction : thành viên
  PricingEngine ..> PricingConfig
  PricingEngine ..> StorePriceQuote : GĐ1
  PricingEngine ..> ReferenceTransaction : GĐ2
  PricingEngine ..> PriceRangeVersion : tạo
  PricingEngine ..> PriceEvaluation : trả về
```

- `groupKey` = `variantId` + `conditionKey` của snapshot lúc giao dịch.
- Mean, độ lệch chuẩn và giá trị Z chỉ tồn tại trong `evaluate()`, không lưu và không trả ra frontend.
- `clusterId` chỉ là quan hệ dữ liệu, không phải kết luận gian lận.
