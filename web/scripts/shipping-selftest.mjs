/**
 * KIỂM THỬ QUY TẮC HỦY ĐƠN – VẬN CHUYỂN – TỪ CHỐI NHẬN HÀNG (Giai đoạn 3).
 *   node scripts/shipping-selftest.mjs   (hoặc `npm run test:shipping`)
 *
 * Phủ:
 *  - Hủy đơn dựa trên SỰ KIỆN bàn giao (không dựa vào việc chỉ có mã vận đơn).
 *  - Phân biệt Trường hợp A (chưa xác nhận), B (đã xác nhận, chưa bàn giao),
 *    C (đã bàn giao — chặn hủy) và thông báo dễ hiểu.
 *  - Người mua từ chối nhận hàng; chuyển hoàn "đang hoàn" ≠ "đã hoàn về".
 *  - Bước tiếp theo của đơn (nextActorFor).
 *
 * Không phụ thuộc React. Không sửa dữ liệu thật.
 */

import {
  PAYMENT_STATUS,
  CANCEL_PHASE,
  cancelPhase,
  canCancelOrder,
  cancelLockCode,
  carrierHandoverEvent,
  hasCarrierHandover,
  handoverAt,
  shipmentNotYetHandedOver,
  isBuyerRefusal,
  canStartReturnToSeller,
  canRetryDelivery,
  mustReturnToSeller,
  deliveryFailureKind,
  nextActorFor,
  completionStatus,
  CANCEL_LOCK_MESSAGE,
} from "../src/data/orderRules.js";

const NOW = new Date("2026-10-16T12:00:00.000Z");

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) pass++;
  else {
    fail++;
    failures.push(`${name}${detail ? " — " + detail : ""}`);
  }
}

/* ------------------------------ Dữ liệu mẫu ------------------------------ */

const baseOrder = {
  id: "DH-S1",
  phoneId: "P001",
  buyerId: "U01",
  sellerId: "S01",
  buyerName: "Nguyễn Minh",
  sellerName: "Trần Minh",
  status: "CONFIRMED",
  paymentMethod: "QR",
  paymentStatus: PAYMENT_STATUS.PENDING_PAYMENT,
  negotiatedPrice: 10000000,
  createdAt: "2026-10-01",
  updatedAt: "2026-10-01",
  shippingStatus: "NOT_SHIPPED",
  shippingEvents: [],
  confirmations: [
    { role: "buyer", version: 1, time: "10:00" },
    { role: "seller", version: 1, time: "10:05" },
  ],
  supportRequests: [],
};
const order = (o = {}) => ({ ...baseOrder, ...o });

const buyer = { userId: "U01", role: "buyer" };
const seller = { userId: "S01", role: "seller" };
const manager = { userId: "M01", role: "manager" };

const ev = (to, extra = {}) => ({
  time: "2026-10-05 09:00",
  from: null,
  to,
  status: to,
  location: "—",
  description: "",
  source: "SIMULATED",
  failureReason: null,
  failureKind: null,
  note: null,
  ...extra,
});

/* ============ 1. Nhận diện BÀN GIAO (không chỉ có vận đơn) ============ */

check(
  "VC-01 đơn có mã vận đơn nhưng CHƯA bàn giao -> chưa tính đã bàn giao",
  hasCarrierHandover(order({ trackingCode: "RPX1", shippingStatus: "AWAITING_PICKUP" })) === false
);

check(
  "VC-02 chờ chuẩn bị hàng -> chưa bàn giao",
  hasCarrierHandover(order({ shippingStatus: "PREPARING" })) === false
);

check(
  "VC-03 ĐVVC đã tiếp nhận -> đã bàn giao",
  hasCarrierHandover(order({ shippingStatus: "ACCEPTED" })) === true
);

check(
  "VC-04 có SỰ KIỆN bàn giao (ACCEPTED) dù trạng thái hiện tại vẫn chờ -> đã bàn giao",
  hasCarrierHandover(
    order({ trackingCode: "RPX2", shippingStatus: "AWAITING_PICKUP", shippingEvents: [ev("ACCEPTED")] })
  ) === true
);

check(
  "VC-05 sự kiện bàn giao lấy đúng sự kiện gần nhất",
  carrierHandoverEvent(
    order({ shippingEvents: [ev("AWAITING_PICKUP"), ev("ACCEPTED"), ev("IN_TRANSIT")] })
  )?.to === "IN_TRANSIT"
);

check(
  "VC-06 handoverAt lấy thời điểm sự kiện bàn giao",
  handoverAt(order({ shippingEvents: [ev("ACCEPTED")] })) === "2026-10-05 09:00"
);

check(
  "VC-07 có vận đơn nhưng chưa bàn giao -> shipmentNotYetHandedOver = true",
  shipmentNotYetHandedOver(order({ trackingCode: "RPX3", shippingStatus: "AWAITING_PICKUP" })) === true
);

check(
  "VC-08 đã bàn giao -> shipmentNotYetHandedOver = false",
  shipmentNotYetHandedOver(order({ trackingCode: "RPX4", shippingStatus: "IN_TRANSIT" })) === false
);

/* ================= 2. Hủy đơn theo ba trường hợp ================= */

check(
  "HUY3-01 Trường hợp A: chưa xác nhận -> hủy được",
  cancelPhase(order({ status: "PENDING_BUYER" })) === CANCEL_PHASE.BEFORE_CONFIRM &&
    canCancelOrder(order({ status: "PENDING_BUYER" }), buyer).allowed === true
);

check(
  "HUY3-02 Trường hợp B: đã xác nhận, chưa bàn giao -> hủy được + xác nhận lại + ghi lý do",
  cancelPhase(order({ status: "CONFIRMED" })) === CANCEL_PHASE.AFTER_CONFIRM_UNPAID &&
    canCancelOrder(order({ status: "CONFIRMED", paymentStatus: PAYMENT_STATUS.PENDING_PAYMENT }), buyer)
      .requiresConfirm === true &&
    canCancelOrder(order({ status: "CONFIRMED", paymentStatus: PAYMENT_STATUS.PENDING_PAYMENT }), buyer)
      .requiresReason === true
);

check(
  "HUY3-03 Trường hợp B có vận đơn nhưng CHƯA bàn giao -> VẪN hủy được",
  cancelPhase(order({ status: "SHIPPING", trackingCode: "RPX5", shippingStatus: "AWAITING_PICKUP" })) ===
    CANCEL_PHASE.AFTER_CONFIRM_UNPAID
);

check(
  "HUY3-04 Trường hợp C: đã bàn giao -> KHÓA hủy",
  cancelPhase(order({ status: "SHIPPING", shippingStatus: "IN_TRANSIT" })) === CANCEL_PHASE.LOCKED
);

check(
  "HUY3-05 Trường hợp C: mã lý do HANDED_OVER + đúng câu thông báo",
  cancelLockCode(order({ status: "SHIPPING", shippingStatus: "IN_TRANSIT" })) === "HANDED_OVER" &&
    canCancelOrder(order({ status: "SHIPPING", shippingStatus: "IN_TRANSIT" }), buyer).reason ===
      CANCEL_LOCK_MESSAGE.HANDED_OVER
);

check(
  "HUY3-06 đơn đã thanh toán -> mã lý do PAID",
  cancelLockCode(order({ status: "CONFIRMED", paymentStatus: PAYMENT_STATUS.PAID })) === "PAID"
);

check(
  "HUY3-07 người không liên quan -> không có quyền (mode NONE)",
  canCancelOrder(order({ status: "PENDING_BUYER" }), { userId: "U99", role: "buyer" }).mode === "NONE"
);

check(
  "HUY3-08 người bán cũng bị khóa khi đã bàn giao",
  canCancelOrder(order({ status: "SHIPPING", shippingStatus: "OUT_FOR_DELIVERY" }), seller).allowed === false
);

check(
  "HUY3-09 quản lý không hủy thay khi đã bàn giao",
  canCancelOrder(order({ status: "SHIPPING", shippingStatus: "ACCEPTED" }), manager).allowed === false
);

/* ============ 3. Người mua từ chối nhận hàng ============ */

const refused1 = order({
  status: "SHIPPING",
  shippingStatus: "FAILED",
  deliveryAttempts: 1,
  lastDeliveryFailureKind: "REFUSED",
  shippingEvents: [ev("FAILED", { failureKind: "REFUSED", failureReason: "Người mua từ chối nhận" })],
});
const failedNormal1 = order({
  status: "SHIPPING",
  shippingStatus: "FAILED",
  deliveryAttempts: 1,
  lastDeliveryFailureKind: "UNREACHABLE",
  shippingEvents: [ev("FAILED", { failureKind: "UNREACHABLE" })],
});
const failed2 = order({
  status: "SHIPPING",
  shippingStatus: "FAILED",
  deliveryAttempts: 2,
  lastDeliveryFailureKind: "UNREACHABLE",
  shippingEvents: [ev("FAILED"), ev("FAILED")],
});

check("TD-01 nhận diện người mua từ chối nhận hàng", isBuyerRefusal(refused1) === true);
check("TD-02 giao thất bại thông thường KHÔNG phải từ chối", isBuyerRefusal(failedNormal1) === false);
check(
  "TD-03 từ chối nhận -> được chuyển hoàn ngay (không cần giao lại)",
  canStartReturnToSeller(refused1) === true
);
check(
  "TD-04 giao thất bại lần đầu (không từ chối) -> CHƯA chuyển hoàn ngay",
  canStartReturnToSeller(failedNormal1) === false
);
check(
  "TD-05 thất bại lần hai -> bắt buộc chuyển hoàn",
  mustReturnToSeller(failed2) === true && canStartReturnToSeller(failed2) === true
);
check("TD-06 vẫn được giao lại 1 lần khi mới thất bại lần đầu", canRetryDelivery(refused1) === true);
check("TD-07 loại lý do giao thất bại gần nhất", deliveryFailureKind(refused1) === "REFUSED");

check(
  "TD-08 từ chối nhận KHÔNG đồng nghĩa đã hoàn tiền / hoàn hàng",
  refused1.paymentStatus === PAYMENT_STATUS.PENDING_PAYMENT &&
    completionStatus(refused1, NOW).complete === false
);

/* ================= 4. Hành trình: đang hoàn ≠ đã hoàn ================= */

const returning = order({ status: "SHIPPING", shippingStatus: "RETURNING" });
const returned = order({ status: "SHIPPING", shippingStatus: "RETURNED" });

check(
  "HANH-01 đang hoàn hàng -> CHƯA hoàn tất và KHÁC đã hoàn về",
  completionStatus(returning, NOW).complete === false && returning.shippingStatus !== returned.shippingStatus
);

check(
  "HANH-02 đã hoàn hàng -> CHƯA hoàn tất (còn xử lý tiền)",
  completionStatus(returned, NOW).complete === false
);

/* ================= 5. Bước tiếp theo của đơn ================= */

check(
  "NT-01 chờ người bán xác nhận -> SELLER",
  nextActorFor(order({ status: "PENDING_SELLER" })).party === "SELLER"
);
check(
  "NT-02 chờ người mua xác nhận -> BUYER",
  nextActorFor(order({ status: "PENDING_BUYER" })).party === "BUYER"
);
check(
  "NT-03 đã bàn giao -> CARRIER",
  nextActorFor(order({ status: "SHIPPING", shippingStatus: "IN_TRANSIT" })).party === "CARRIER"
);
check(
  "NT-04 người mua từ chối -> SELLER chuyển hoàn",
  nextActorFor(refused1).party === "SELLER"
);
check(
  "NT-05 đã hoàn về -> MANAGER xử lý tiền",
  nextActorFor(returned).party === "MANAGER"
);
check(
  "NT-06 vận đơn đã hủy -> không còn bước tiếp theo",
  nextActorFor(order({ status: "CANCELLED", shippingStatus: "VOIDED" })).party === null
);

/* ------------------------------- Tổng kết ------------------------------- */

console.log(`\nKết quả kiểm thử hủy đơn – vận chuyển – từ chối nhận (Giai đoạn 3): ${pass} đạt, ${fail} lỗi.\n`);
if (fail > 0) {
  console.log("Các ca lỗi:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
