# RePrice — API contract

> Bản chi tiết (request/response, schema): `docs/openapi.yaml`. File này là bản đọc nhanh.
> Bám theo `docs/SPEC.md`, `docs/use-cases.md`, `docs/state-diagrams.md`, `docs/erd.md`.

## 1. Quy ước

| Mục | Quy ước |
|---|---|
| Base URL | `/api/v1` |
| Xác thực | `Authorization: Bearer <token>`; lấy token qua `POST /auth/login` hoặc `POST /demo/login-as` |
| Định dạng | JSON, tên trường `camelCase` |
| Tiền | số nguyên, đơn vị đồng (`11500000`) |
| Thời gian | ISO 8601 có múi giờ (`2026-10-17T16:00:00+07:00`); ngày thuần `YYYY-MM-DD` |
| Danh sách | `?page=1&pageSize=20` → `{ items, page, pageSize, total }` |
| Thao tác đổi trạng thái | `POST` lên tài nguyên con mang tên hành động (`/orders/{id}/receive`), không `PATCH` trực tiếp trường `status` |
| `allowedActions` | Mọi đối tượng có trạng thái (tin, thương lượng, đơn, hồ sơ, hoàn tiền) trả kèm danh sách hành động **người đang gọi** được phép làm lúc này. Frontend chỉ hiện nút có trong danh sách |
| Mô phỏng | Đối tượng mô phỏng có `simulated: true`; dữ liệu giá có `dataSource: SIMULATED` |
| Giờ hệ thống | Mọi hạn (24h, 48h, 3 ngày) tính theo đồng hồ server, có cộng độ lệch demo (`/demo/clock`) |

### Lỗi

```json
{ "error": { "code": "INVALID_STATE", "message": "Đơn đã bàn giao vận chuyển, không thể hủy.", "details": {} } }
```

| HTTP | `code` | Khi nào |
|---|---|---|
| 400 | `BAD_REQUEST` | JSON sai |
| 401 | `UNAUTHENTICATED` | Thiếu hoặc sai token |
| 403 | `FORBIDDEN` | Không phải bên liên quan / không đủ quyền |
| 404 | `NOT_FOUND` | Không có tài nguyên hoặc không được xem |
| 409 | `INVALID_STATE` | Hành động không hợp lệ ở trạng thái hiện tại (theo state diagram) |
| 409 | `CONFLICT` | Trùng (đã có hồ sơ mở, tin đã có đơn, đã đánh giá…) |
| 410 | `DEADLINE_PASSED` | Quá hạn (ví dụ yêu cầu trả hàng sau `returnDeadline`) |
| 422 | `VALIDATION_FAILED` | Dữ liệu không hợp lệ; `details.fields` chỉ trường lỗi |

## 2. Danh sách endpoint

Quyền: **P** công khai · **U** đã đăng nhập · **B** người mua của đối tượng · **S** người bán của đối tượng · **A** QTV · **D** chỉ chế độ demo.

### Tài khoản
| Method | Path | Quyền | Use case |
|---|---|---|---|
| POST | `/auth/register` | P | UC01 |
| POST | `/auth/login` | P | UC01 |
| POST | `/auth/logout` | U | UC01 |
| GET / PATCH | `/me` | U | UC07 |
| GET | `/me/notifications` | U | UC06 |
| POST | `/me/notifications/{id}/read` · `/me/notifications/read-all` | U | UC06 |
| GET | `/me/favorites` | U | UC05 |
| PUT / DELETE | `/me/favorites/{listingId}` | U | UC05 |

### Danh mục
| Method | Path | Quyền | Use case |
|---|---|---|---|
| GET | `/catalog/brands` | P | UC10 |
| GET | `/catalog/models?brand=` | P | UC10 |
| GET | `/catalog/models/{modelId}/variants` | P | UC10 |
| POST | `/catalog/requests` | U | UC12 |

### Tin đăng và giá tham khảo
| Method | Path | Quyền | Use case |
|---|---|---|---|
| GET | `/listings` | P | UC03 |
| GET | `/listings/{id}` | P (nháp: S) | UC04 |
| GET | `/listings/{id}/reference-price?price=` | P | UC40, UC42 |
| GET | `/price-ranges/{versionId}` | P | UC42 |
| POST | `/reference-price/preview` | U | UC10 (bước nhập giá, tin chưa lưu) |
| POST | `/listings` | U | UC10, UC11 |
| PATCH | `/listings/{id}` | S | UC11, UC13 |
| POST | `/listings/{id}/photos` · DELETE `/listings/{id}/photos/{photoId}` | S | UC10 (ảnh JPG/PNG/WebP ≤ 8MB, tối đa 10; ảnh đầu là ảnh bìa; phục vụ ở `/uploads/…`) |
| POST | `/listings/{id}/publish` · `/pause` · `/resume` | S | UC10, UC14 |
| DELETE | `/listings/{id}` | S | UC14 |
| GET | `/me/listings?status=` | U | UC14 |

### Thương lượng và tạo đơn
| Method | Path | Quyền | Use case |
|---|---|---|---|
| POST | `/listings/{id}/buy-now` | U (không phải người bán) | UC20, UC24 |
| POST | `/listings/{id}/negotiations` | U (không phải người bán) | UC21 |
| GET | `/me/negotiations?role=buyer\|seller&status=` | U | UC21–UC23 |
| GET | `/negotiations/{id}` | B, S | UC21–UC23 |
| POST | `/negotiations/{id}/offers` | B, S (đến lượt) | UC22, UC23 |
| POST | `/negotiations/{id}/accept` | B, S (đến lượt) | UC22, UC23, UC24 |
| POST | `/negotiations/{id}/reject` | B, S (đến lượt) | UC22, UC23 |
| POST | `/negotiations/{id}/cancel` | B | UC25 |

### Đơn hàng
| Method | Path | Quyền | Use case |
|---|---|---|---|
| GET | `/me/orders?role=buyer\|seller&status=` | U | UC36 |
| GET | `/orders/{id}` | B, S, A | UC36 |
| GET | `/orders/{id}/history` | B, S, A | UC36 |
| PUT | `/orders/{id}/shipping-info` | B | UC30 |
| POST | `/orders/{id}/payment` | B | UC30 |
| POST | `/orders/{id}/cancel` | B, S | UC32 |
| POST | `/orders/{id}/handover` | S | UC33 |
| POST | `/orders/{id}/receive` | B | UC37 |
| POST | `/orders/{id}/review` | B | UC39 |
| GET | `/shipments/{id}` | B, S, A | UC34 |

### Hồ sơ trả hàng / khiếu nại
| Method | Path | Quyền | Use case |
|---|---|---|---|
| POST | `/orders/{id}/cases` | B | UC50, UC51, UC61 |
| GET | `/me/cases` | U | UC50–UC60 |
| GET | `/cases/{id}` | B, S, A | UC50–UC60 |
| POST | `/cases/{id}/evidence` | B, S | UC50, UC54 |
| POST | `/cases/{id}/seller-response` | S | UC53 |
| POST | `/cases/{id}/buyer-supplement` | B | UC54 |
| POST | `/cases/{id}/buyer-choice` | B | UC55 |
| POST | `/cases/{id}/return-handover` | B | UC57 |
| POST | `/cases/{id}/return-inspection` | S | UC58 |
| POST | `/cases/{id}/review-request` | B, S | UC60 |
| POST | `/cases/{id}/refund-not-received` | B | UC59 |

### Quản trị
| Method | Path | Quyền | Use case |
|---|---|---|---|
| GET | `/admin/dashboard` | A | UC72 |
| GET | `/admin/cases?status=&overdue=&assignee=` | A | UC56 |
| POST | `/admin/cases/{id}/assign` | A | UC56 |
| POST | `/admin/cases/{id}/request-info` | A | UC56 |
| POST | `/admin/cases/{id}/shipping-verifications` | A | UC51, UC56 |
| PATCH | `/admin/shipping-verifications/{id}` | A | UC56 |
| POST | `/admin/cases/{id}/resolutions` | A | UC56 |
| POST | `/admin/cases/{id}/return-address` | A | UC57 |
| GET | `/admin/refunds` | A | UC59 |
| POST | `/admin/refunds/{id}/process` · `/retry` | A | UC59 |
| GET | `/admin/reference-transactions` | A | UC70 |
| GET | `/admin/reference-transactions/{id}` | A | UC70 |
| POST | `/admin/reference-transactions/{id}/decisions` | A | UC71 |
| GET | `/admin/price-ranges` | A | UC70 |
| GET / PUT | `/admin/pricing-config` | A | UC74 |
| GET / POST | `/admin/store-sources` · PATCH `/admin/store-sources/{id}` | A | UC73 |
| GET / PUT | `/admin/store-quotes` | A | UC41, UC73 |
| POST | `/admin/catalog/models` · `/admin/catalog/models/{id}/variants` | A | UC73 |
| GET | `/admin/catalog/requests` · POST `/admin/catalog/requests/{id}/decision` | A | UC12, UC73 |
| GET | `/admin/users` · `/admin/listings` · `/admin/orders` | A | UC75 |
| POST | `/admin/listings/{id}/hide` | A | UC75 |
| GET | `/admin/audit-logs` | A | UC71, UC75 |

### Demo (chỉ bật khi `DEMO_MODE=true`)
| Method | Path | Quyền | Use case |
|---|---|---|---|
| GET | `/demo/accounts` | D | UC02 |
| POST | `/demo/login-as` | D | UC02 |
| GET | `/demo/clock` · POST `/demo/clock/advance` | D | UC76 |
| POST | `/demo/payments/{orderId}/result` | D | UC30 (cổng thanh toán giả) |
| POST | `/demo/refunds/{id}/result` | D | UC59 (cổng thanh toán giả) |
| POST | `/demo/shipments/{id}/advance` · `/fail` | D | UC34, UC35 (đơn vị vận chuyển giả) |
| POST | `/demo/reset` | D | Nạp lại seed + fixture 42 giao dịch |

## 3. Việc chạy ngầm (không có endpoint)

Bộ lập lịch trong backend chạy mỗi phút và sau mỗi lần `POST /demo/clock/advance`:

| Việc | Use case |
|---|---|
| Hủy đơn `AWAITING_PAYMENT` quá `paymentDueAt` | UC31 |
| Hoàn tất đơn qua `returnDeadline` không có hồ sơ mở | UC38 |
| Chuyển hồ sơ quá `dueAt` lên QTV | UC62 |
| Đánh dấu báo giá cửa hàng quá 24 giờ là `SUSPENDED` | UC41 |
| Xét lại `reference_status` và tính lại dải giá bị ảnh hưởng | UC52 |

## 4. Ví dụ: giá tham khảo

`GET /api/v1/listings/{id}/reference-price` (người mua xem tin rao 11,5 triệu)

```json
{
  "viewerRole": "BUYER",
  "price": 11500000,
  "priceLabel": "LISTING_PRICE",
  "newPrice": {
    "status": "RANGE",
    "lowerPrice": 13000000,
    "upperPrice": 14000000,
    "sources": [
      { "retailer": "Cửa hàng A", "price": 13000000, "url": "https://…", "verifiedAt": "2026-10-17T08:00:00+07:00" }
    ]
  },
  "usedPrice": {
    "status": "RANGE",
    "lowerPrice": 10000000,
    "upperPrice": 12000000,
    "transactionCount": 42,
    "minTransactions": 35,
    "windowMonths": 3,
    "periodStart": "2026-07-15",
    "periodEnd": "2026-10-15",
    "dataSource": "SIMULATED",
    "versionId": "…",
    "group": { "variantId": "…", "conditionKey": "GOOD|FULL|GE_90" }
  },
  "positionLabel": "IN_RANGE",
  "showReviewPrompt": false,
  "reviewDirection": null
}
```

- Người bán ở bước nhập giá gọi cùng endpoint với `?price=` → `viewerRole: SELLER`, `priceLabel: YOUR_PRICE`.
- Không có trường mean, độ lệch chuẩn, Z, P50.
- `usedPrice.status = INSUFFICIENT_DATA` thì có `transactionCount` (ví dụ 27) và `minTransactions` (35), không có `lowerPrice`/`upperPrice`.
- `usedPrice.status = NO_DATA` kèm `missingCriteria` khi tin thiếu tiêu chí Condition Score.
