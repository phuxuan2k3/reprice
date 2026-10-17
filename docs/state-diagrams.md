# RePrice — State diagram

> Bám theo `docs/SPEC.md` (17/10/2026). Bản xem trực quan: artifact "RePrice Domain Model".

> **Khác với code hiện tại**
> - Thương lượng: `SELLER_COUNTER` đổi thành `AWAITING_BUYER`; người mua được đề nghị lại.
> - Đơn hàng: bỏ `PENDING_BUYER` và `PENDING_SELLER`; thêm `AWAITING_PAYMENT`, `RECEIVED`, `ON_HOLD`.
> - Tin đăng: thêm `IN_TRANSACTION`.

## 1. Tin đăng `Listing.status`

```mermaid
stateDiagram-v2
  [*] --> DRAFT : tạo tin
  DRAFT --> ACTIVE : đăng tin
  ACTIVE --> PAUSED : người bán tạm ẩn
  PAUSED --> ACTIVE : hiện lại
  ACTIVE --> IN_TRANSACTION : chốt giá, tạo đơn
  IN_TRANSACTION --> ACTIVE : đơn bị hủy
  IN_TRANSACTION --> PAUSED : trả hàng hoàn tiền xong
  IN_TRANSACTION --> SOLD : đơn hoàn tất
  DRAFT --> REMOVED : xóa nháp
  ACTIVE --> REMOVED : gỡ tin
  PAUSED --> REMOVED : gỡ tin
  SOLD --> [*]
  REMOVED --> [*]
```

- Chỉ `ACTIVE` mới hiện trong tìm kiếm và nhận thương lượng mới. Chỉ sửa được khi chưa có đơn.
- Máy bị trả về thì tin sang `PAUSED` để người bán kiểm tra rồi tự đăng lại.

## 2. Thương lượng `Negotiation.status`

```mermaid
stateDiagram-v2
  [*] --> AWAITING_SELLER : người mua gửi đề nghị
  state OPEN {
    AWAITING_SELLER --> AWAITING_BUYER : người bán đề nghị giá khác
    AWAITING_BUYER --> AWAITING_SELLER : người mua đề nghị lại
  }
  AWAITING_SELLER --> AGREED : người bán chấp nhận
  AWAITING_BUYER --> AGREED : người mua chấp nhận
  AWAITING_SELLER --> REJECTED : người bán từ chối
  AWAITING_BUYER --> REJECTED : người mua từ chối
  OPEN --> CANCELLED : người mua hủy
  OPEN --> CLOSED : tin có đơn khác hoặc bị gỡ
  AGREED --> [*] : tạo đơn ngay
  REJECTED --> [*]
  CANCELLED --> [*]
  CLOSED --> [*]
```

- Mỗi lượt đề nghị là một `Offer` mới; không ghi đè lịch sử.
- `REJECTED` không tạo đơn. Người mua có thể mở thương lượng mới nếu tin vẫn `ACTIVE`.

## 3. Đơn hàng `Order.status`

```mermaid
stateDiagram-v2
  [*] --> AWAITING_PAYMENT : chốt giá (Mua ngay / thương lượng)
  AWAITING_PAYMENT --> CONFIRMED : trả trước thành công hoặc chọn COD
  AWAITING_PAYMENT --> CANCELLED : quá 24 giờ hoặc người mua hủy
  CONFIRMED --> CANCELLED : hủy trước khi bàn giao, hoàn tiền nếu đã trả
  CONFIRMED --> SHIPPING : người bán bàn giao vận chuyển
  SHIPPING --> RETURNED_TO_SELLER : giao thất bại hết lượt hoặc từ chối nhận
  RETURNED_TO_SELLER --> CANCELLED
  SHIPPING --> INSPECTION : vận chuyển báo giao thành công
  state "Trong thời hạn trả hàng" as INSPECTION {
    [*] --> DELIVERED
    DELIVERED --> RECEIVED : người mua bấm Đã nhận hàng (deadline = lúc bấm + 3 ngày)
  }
  INSPECTION --> ON_HOLD : mở hồ sơ trước return_deadline
  ON_HOLD --> INSPECTION : hồ sơ đóng, vẫn còn hạn
  ON_HOLD --> COMPLETED : hồ sơ đóng không hoàn tiền, đã quá hạn
  ON_HOLD --> REFUNDED : hoàn tiền thành công
  INSPECTION --> COMPLETED : qua return_deadline, không có hồ sơ mở
  COMPLETED --> [*]
  REFUNDED --> [*]
  CANCELLED --> [*]
```

- Hết hạn 24 giờ và qua `return_deadline` do bộ lập lịch ở backend xử lý, không dựa vào trình duyệt.
- Khiếu nại sau khi `COMPLETED` mở hồ sơ hỗ trợ nhưng không đổi trạng thái đơn.

## 4. Thanh toán `Payment.status` và chi trả `Payout.status`

```mermaid
stateDiagram-v2
  state "Thanh toán" as PAY {
    [*] --> PENDING
    PENDING --> PAID : trả trước thành công
    PENDING --> FAILED : lỗi thanh toán
    FAILED --> PENDING : thử lại
    PENDING --> COD_PENDING : chọn COD
    COD_PENDING --> COD_COLLECTED : vận chuyển thu tiền khi giao
    PENDING --> VOID : đơn hủy
    COD_PENDING --> VOID : đơn hủy hoặc giao không thành
  }
  state "Chi trả người bán" as PAYOUT {
    [*] --> HELD : tiền vào RePrice
    HELD --> RELEASED : đơn hoàn tất
    HELD --> REVERSED : hoàn tiền cho người mua
  }
```

- `Payout` chỉ tạo khi có `PAID` hoặc `COD_COLLECTED`. Hồ sơ đang mở giữ `HELD`.
- Chọn COD không có nghĩa đã thu tiền.

## 5. Vận đơn `Shipment.status`

```mermaid
stateDiagram-v2
  [*] --> AWAITING_PICKUP : người bán tạo vận đơn
  AWAITING_PICKUP --> VOIDED : đơn hủy trước bàn giao
  AWAITING_PICKUP --> PICKED_UP : đơn vị vận chuyển nhận hàng
  PICKED_UP --> IN_TRANSIT
  IN_TRANSIT --> OUT_FOR_DELIVERY
  OUT_FOR_DELIVERY --> DELIVERED : giao thành công
  OUT_FOR_DELIVERY --> FAILED : giao thất bại
  FAILED --> OUT_FOR_DELIVERY : giao lại (tối đa 1 lần)
  FAILED --> RETURNING : hết lượt hoặc từ chối nhận
  IN_TRANSIT --> INCIDENT : thất lạc / hư hỏng
  RETURNING --> RETURNED
  DELIVERED --> [*]
  RETURNED --> [*]
  VOIDED --> [*]
  INCIDENT --> [*]
```

- Dùng chung cho vận đơn đi (`OUTBOUND`) và vận đơn trả hàng (`RETURN`). Mọi sự kiện gắn nhãn mô phỏng.
- `DELIVERED` của vận đơn đi ghi `Order.deliveredAt`.

## 6. Hồ sơ trả hàng / khiếu nại `SupportCase.status`

```mermaid
stateDiagram-v2
  [*] --> AWAITING_SELLER : người mua yêu cầu trả hàng (48h)
  [*] --> ADMIN_REVIEW : báo chưa nhận hàng / khiếu nại
  AWAITING_SELLER --> AWAITING_BUYER_INFO : yêu cầu bổ sung, 1 lượt (48h)
  AWAITING_BUYER_INFO --> AWAITING_SELLER_DECISION : người mua bổ sung (24h)
  AWAITING_SELLER --> RETURN_APPROVED : đồng ý
  AWAITING_SELLER_DECISION --> RETURN_APPROVED : đồng ý
  AWAITING_SELLER --> AWAITING_BUYER_CHOICE : từ chối (48h)
  AWAITING_SELLER_DECISION --> AWAITING_BUYER_CHOICE : từ chối
  AWAITING_BUYER_CHOICE --> WITHDRAWN : người mua kết thúc
  AWAITING_BUYER_CHOICE --> ADMIN_REVIEW : yêu cầu RePrice giải quyết
  AWAITING_SELLER --> ADMIN_REVIEW : quá hạn
  AWAITING_BUYER_INFO --> ADMIN_REVIEW : quá hạn / không bổ sung được
  AWAITING_SELLER_DECISION --> ADMIN_REVIEW : quá hạn
  AWAITING_BUYER_CHOICE --> ADMIN_REVIEW : quá hạn
  ADMIN_REVIEW --> PLAN_REVIEW : QTV ban hành phương án (48h xem xét lại)
  PLAN_REVIEW --> ADMIN_REVIEW : có đề nghị xem xét lại
  PLAN_REVIEW --> RETURN_APPROVED : phương án trả hàng
  PLAN_REVIEW --> REFUNDING : hoàn tiền không cần trả máy
  PLAN_REVIEW --> REJECTED : không chấp thuận
  RETURN_APPROVED --> AWAITING_HANDOVER : có địa chỉ và vận đơn trả (3 ngày)
  AWAITING_HANDOVER --> RETURNING : người mua bàn giao
  AWAITING_HANDOVER --> ADMIN_REVIEW : trở ngại trả hàng
  RETURNING --> RETURN_INSPECTION : người bán nhận hàng trả (48h)
  RETURNING --> ADMIN_REVIEW : thất lạc / bị từ chối nhận
  RETURN_INSPECTION --> REFUNDING : hàng trả phù hợp hoặc quá hạn không phản ánh
  RETURN_INSPECTION --> ADMIN_REVIEW : báo vấn đề hàng trả
  REFUNDING --> RESOLVED : hoàn tiền thành công
  WITHDRAWN --> [*]
  REJECTED --> [*]
  RESOLVED --> [*]
```

- Mỗi trạng thái chờ có `awaitingParty` và `dueAt`; quá hạn thì bộ lập lịch chuyển `ADMIN_REVIEW`, không coi im lặng là đồng ý.
- Người bán chỉ được yêu cầu bổ sung một lượt (`supplementUsed`).
- Hồ sơ còn mở thì đơn ở `ON_HOLD` và chi trả ở `HELD`.

## 7. Hoàn tiền `Refund.status`

```mermaid
stateDiagram-v2
  [*] --> APPROVED : phương án có hoàn tiền
  APPROVED --> PROCESSING : gửi lệnh hoàn
  PROCESSING --> SUCCEEDED : xác nhận thành công
  PROCESSING --> FAILED : bên thanh toán báo lỗi
  PROCESSING --> RECONCILING : chưa rõ kết quả
  RECONCILING --> SUCCEEDED
  RECONCILING --> FAILED
  FAILED --> PROCESSING : QTV gửi lại sau khi xác nhận lệnh trước thất bại
  SUCCEEDED --> [*]
```

- Không gửi lại lệnh khi đang `RECONCILING`, tránh hoàn hai lần.
- COD chưa thu tiền thì không tạo `Refund`.

## 8. Dữ liệu tham chiếu `ReferenceTransaction.status`

```mermaid
stateDiagram-v2
  [*] --> PENDING_COMPLETION : tạo đơn (mỗi máy một bản ghi)
  PENDING_COMPLETION --> ELIGIBLE : đơn hoàn tất và đủ điều kiện
  PENDING_COMPLETION --> PENDING_VERIFICATION : có cờ nghi vấn
  PENDING_COMPLETION --> EXCLUDED : đơn hủy hoặc hoàn tiền
  PENDING_VERIFICATION --> ELIGIBLE : QTV cho phép sử dụng
  PENDING_VERIFICATION --> EXCLUDED : QTV không sử dụng
  ELIGIBLE --> PENDING_VERIFICATION : phát sinh cờ mới
  ELIGIBLE --> REVOKED : QTV thu hồi hoặc hoàn tiền về sau
  EXCLUDED --> [*]
  REVOKED --> [*]
```

- Chỉ `ELIGIBLE` được đếm vào ngưỡng 35, và chỉ khi cùng `groupKey`, cùng `dataSource`, nằm trong cửa sổ được chọn.
- Rời khỏi `ELIGIBLE` thì tính lại các `PriceRangeVersion` có chứa giao dịch đó.
- Mọi chuyển trạng thái do QTV đều ghi `ReferenceDecision` kèm lý do.

## Các trạng thái liên kết với nhau

| Sự kiện | Đơn | Tin | Thanh toán / chi trả | Tham chiếu |
|---|---|---|---|---|
| Chốt giá | `AWAITING_PAYMENT` | `IN_TRANSACTION` | `PENDING` | `PENDING_COMPLETION` |
| Quá 24 giờ chưa trả | `CANCELLED` | `ACTIVE` | `VOID` | `EXCLUDED` |
| Giao thành công | `DELIVERED` | — | `HELD` | — |
| Mở hồ sơ trả hàng | `ON_HOLD` | — | `HELD` | `PENDING_COMPLETION` |
| Hoàn tiền thành công | `REFUNDED` | `PAUSED` | `REVERSED` | `EXCLUDED` |
| Qua `return_deadline`, không hồ sơ | `COMPLETED` | `SOLD` | `RELEASED` | `ELIGIBLE` (nếu không có cờ) |
