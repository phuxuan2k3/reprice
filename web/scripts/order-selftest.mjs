/**
 * KIỂM THỬ QUY TẮC NGHIỆP VỤ ĐƠN HÀNG (Phần XVI) — chạy bằng:
 *   node scripts/order-selftest.mjs   (hoặc `npm run test:orders`)
 *
 * Phủ: thanh toán trước vs COD, hủy đơn theo trạng thái/vai trò, giao hàng thất
 * bại + giao lại 1 lần + chuyển hoàn, mốc 3 ngày hậu giao hàng (tính từ bằng
 * chứng giao hàng, KHÔNG chờ nút "đã nhận hàng"), hạn người bán phản hồi 48h,
 * điều kiện hoàn tất đơn, điều kiện chi trả người bán, và việc TÁCH BIỆT trạng
 * thái đơn hàng với trạng thái dữ liệu giá tham chiếu.
 *
 * Không phụ thuộc React. Không sửa dữ liệu thật.
 */

import {
  PAYMENT_STATUS,
  PAYOUT_STATUS,
  CANCEL_PHASE,
  initialPaymentStatus,
  isPaymentSettled,
  nextCodPaymentStatus,
  cancelPhase,
  canCancelOrder,
  canRetryDelivery,
  mustReturnToSeller,
  deliveryClock,
  afterDeliveryWindowElapsed,
  returnWindowOpen,
  canRequestReturn,
  validateReturnRequest,
  sellerResponseDueAt,
  isSellerResponseOverdue,
  completionStatus,
  sellerPayoutEligibility,
  makeCancelRecord,
  isReturnOpen,
  hasOpenReturn,
} from "../src/data/orderRules.js";
import { checkReferenceEligibility } from "../src/data/eligibility.js";
import { makeDetailFromOrder, referenceDataStatus } from "../src/data/pricingEngine.js";

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
  id: "DH-T1",
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
  confirmations: [
    { role: "buyer", version: 1, time: "10:00" },
    { role: "seller", version: 1, time: "10:05" },
  ],
  supportRequests: [],
};

const order = (o = {}) => ({ ...baseOrder, ...o });

const PROOF = {
  at: "2026-10-10T09:00:00.000Z",
  source: "SIMULATED",
  notifiedAt: "2026-10-10T09:00:00.000Z",
  deadlineAt: "2026-10-13T09:00:00.000Z",
  simulated: true,
};

const deliveredOrder = (o = {}) =>
  order({
    status: "DELIVERED",
    shippingStatus: "DELIVERED",
    deliveredAt: "2026-10-10",
    deliveryProof: { ...PROOF },
    paymentMethod: "QR",
    paymentStatus: PAYMENT_STATUS.PAID,
    ...o,
  });

const buyer = { userId: "U01", role: "buyer" };
const seller = { userId: "S01", role: "seller" };
const manager = { userId: "M01", role: "manager" };

/* ============ 1. Thanh toán trước vs COD (không nhầm lẫn) ============ */

check(
  "TT-01 chọn COD -> KHÔNG phải đã thanh toán",
  initialPaymentStatus("COD") === PAYMENT_STATUS.PENDING_COD_COLLECTION &&
    !isPaymentSettled(order({ paymentMethod: "COD", paymentStatus: initialPaymentStatus("COD") }))
);

check(
  "TT-02 COD đã đối soát -> đã xác minh",
  isPaymentSettled(order({ paymentMethod: "COD", paymentStatus: PAYMENT_STATUS.COD_RECONCILED })) === true
);

check(
  "TT-03 COD mới thu tiền (chưa đối soát) -> CHƯA xác minh",
  isPaymentSettled(order({ paymentMethod: "COD", paymentStatus: PAYMENT_STATUS.COD_COLLECTED })) === false
);

check(
  "TT-04 trả trước PAID -> đã xác minh",
  isPaymentSettled(order({ paymentMethod: "QR", paymentStatus: PAYMENT_STATUS.PAID })) === true
);

check(
  "TT-05 luồng COD đi đúng thứ tự",
  nextCodPaymentStatus(PAYMENT_STATUS.PENDING_COD_COLLECTION) === PAYMENT_STATUS.COD_COLLECTED &&
    nextCodPaymentStatus(PAYMENT_STATUS.COD_COLLECTED) === PAYMENT_STATUS.PENDING_COD_RECONCILE &&
    nextCodPaymentStatus(PAYMENT_STATUS.PENDING_COD_RECONCILE) === PAYMENT_STATUS.COD_RECONCILED &&
    nextCodPaymentStatus(PAYMENT_STATUS.COD_RECONCILED) === null
);

/* ======================= 2. Hủy đơn theo trạng thái ======================= */

check(
  "HUY-01 chờ xác nhận -> BEFORE_CONFIRM",
  cancelPhase(order({ status: "PENDING_BUYER" })) === CANCEL_PHASE.BEFORE_CONFIRM
);

check(
  "HUY-02 đã xác nhận, chưa thanh toán -> AFTER_CONFIRM_UNPAID",
  cancelPhase(order({ status: "CONFIRMED", paymentStatus: PAYMENT_STATUS.PENDING_PAYMENT })) ===
    CANCEL_PHASE.AFTER_CONFIRM_UNPAID
);

check(
  "HUY-03 đã thanh toán -> LOCKED (không hủy thường)",
  cancelPhase(order({ status: "CONFIRMED", paymentStatus: PAYMENT_STATUS.PAID })) === CANCEL_PHASE.LOCKED
);

check(
  "HUY-04 đã có vận đơn -> LOCKED",
  cancelPhase(order({ status: "CONFIRMED", shippingStatus: "IN_TRANSIT", trackingCode: "X1" })) ===
    CANCEL_PHASE.LOCKED
);

check(
  "HUY-05 sau xác nhận, chưa thanh toán -> bắt buộc ghi lý do",
  canCancelOrder(order({ status: "CONFIRMED", paymentStatus: PAYMENT_STATUS.PENDING_PAYMENT }), buyer)
    .requiresReason === true
);

check(
  "HUY-06 đã thanh toán -> chuyển luồng khác (ALT_FLOW)",
  canCancelOrder(order({ status: "CONFIRMED", paymentStatus: PAYMENT_STATUS.PAID }), buyer).mode ===
    "ALT_FLOW"
);

check(
  "HUY-07 người không liên quan -> không có quyền",
  canCancelOrder(order({ status: "PENDING_BUYER" }), { userId: "U99", role: "buyer" }).allowed === false
);

check(
  "HUY-08 người bán hủy được đơn chờ xác nhận",
  canCancelOrder(order({ status: "PENDING_SELLER" }), seller).allowed === true
);

const cancelRec = makeCancelRecord({ id: "U01", name: "Nguyễn Minh", role: "buyer" }, "Đổi ý", "2026-10-02T00:00:00.000Z");
check(
  "HUY-09 bản ghi hủy lưu người/thời gian/lý do",
  cancelRec.cancelledBy === "Nguyễn Minh" &&
    cancelRec.cancelledAt === "2026-10-02T00:00:00.000Z" &&
    cancelRec.reason === "Đổi ý"
);

/* ============= 3. Giao hàng thất bại + giao lại 1 lần ============= */

const failed1 = order({ status: "SHIPPING", shippingStatus: "FAILED", deliveryAttempts: 1 });
const failed2 = order({ status: "SHIPPING", shippingStatus: "FAILED", deliveryAttempts: 2 });

check("GH-01 thất bại lần đầu -> được giao lại", canRetryDelivery(failed1) === true);
check("GH-02 thất bại lần đầu -> chưa phải chuyển hoàn", mustReturnToSeller(failed1) === false);
check("GH-03 thất bại lần hai -> KHÔNG giao lại nữa", canRetryDelivery(failed2) === false);
check("GH-04 thất bại lần hai -> phải chuyển hoàn về người bán", mustReturnToSeller(failed2) === true);

/* ============ 4. Mốc 3 ngày tính từ bằng chứng giao hàng ============ */

const clock = deliveryClock(deliveredOrder());
check(
  "MOC-01 đồng hồ 3 ngày lấy từ bằng chứng giao hàng",
  clock.hasProof === true && clock.startedAt === PROOF.notifiedAt && clock.deadlineAt === PROOF.deadlineAt
);

check(
  "MOC-02 trong hạn 3 ngày (2026-10-12) -> còn mở",
  returnWindowOpen(deliveredOrder(), new Date("2026-10-12T00:00:00.000Z")) === true
);

check(
  "MOC-03 quá hạn 3 ngày (2026-10-14) -> đóng",
  returnWindowOpen(deliveredOrder(), new Date("2026-10-14T00:00:00.000Z")) === false
);

check(
  "MOC-04 chưa có bằng chứng giao hàng -> chưa tính hạn",
  afterDeliveryWindowElapsed(order({ status: "SHIPPING", shippingStatus: "IN_TRANSIT" }), NOW) === false
);

check(
  "MOC-05 đã hết 3 ngày hậu giao hàng",
  afterDeliveryWindowElapsed(deliveredOrder(), NOW) === true
);

check(
  "MOC-06 không có bằng chứng giao hàng -> không thể gửi yêu cầu trả hàng",
  canRequestReturn(order({ status: "SHIPPING", shippingStatus: "IN_TRANSIT" }), NOW).allowed === false
);

check(
  "MOC-07 trong hạn -> được gửi yêu cầu",
  canRequestReturn(deliveredOrder(), new Date("2026-10-12T00:00:00.000Z")).allowed === true
);

check(
  "MOC-08 quá hạn -> không được gửi yêu cầu",
  canRequestReturn(deliveredOrder(), new Date("2026-10-14T00:00:00.000Z")).allowed === false
);

/* ==================== 5. Yêu cầu trả hàng/khiếu nại ==================== */

check(
  "YC-01 thiếu lý do + mô tả -> lỗi",
  validateReturnRequest({ orderId: "DH-T1" }).ok === false
);

check(
  "YC-02 đủ lý do + mô tả -> hợp lệ",
  validateReturnRequest({ reason: "Hàng hư hỏng", description: "Màn hình nứt", orderId: "DH-T1" }).ok === true
);

const req = {
  id: "YC-1",
  status: "PENDING_SELLER",
  createdAt: "2026-10-12T08:00:00.000Z",
  reason: "Hàng hư hỏng",
  description: "Màn hình nứt",
};
check(
  "YC-03 hạn người bán phản hồi = +48 giờ",
  sellerResponseDueAt(req) === "2026-10-14T08:00:00.000Z"
);
check(
  "YC-04 quá 48h chưa phản hồi -> quá hạn",
  isSellerResponseOverdue(req, new Date("2026-10-15T00:00:00.000Z")) === true
);
check(
  "YC-05 trong 48h -> chưa quá hạn",
  isSellerResponseOverdue(req, new Date("2026-10-13T00:00:00.000Z")) === false
);
check(
  "YC-06 đã phản hồi -> không tính quá hạn",
  isSellerResponseOverdue({ ...req, sellerRespondedAt: "10:00" }, new Date("2026-10-15T00:00:00.000Z")) === false
);

const openReq = { status: "PENDING_SELLER" };
const closedReq = { status: "REFUNDED" };
check("YC-07 yêu cầu đang mở", isReturnOpen(openReq) === true && hasOpenReturn(order({ supportRequests: [openReq] })) === true);
check("YC-08 yêu cầu đã khép", isReturnOpen(closedReq) === false);

/* ======================== 6. Điều kiện hoàn tất ======================== */

const completeOrder = deliveredOrder({ status: "COMPLETED", receivedAt: "2026-10-11" });
check("HT-01 đã nhận hàng + hết hạn + không khiếu nại -> hoàn tất", completionStatus(completeOrder, NOW).complete === true);

check(
  "HT-02 còn khiếu nại mở -> CHƯA hoàn tất",
  completionStatus(deliveredOrder({ supportRequests: [openReq] }), NOW).complete === false
);

check(
  "HT-03 đang chuyển hoàn -> CHƯA hoàn tất",
  completionStatus(deliveredOrder({ shippingStatus: "RETURNING" }), NOW).complete === false
);

check(
  "HT-04 chưa hết 3 ngày -> CHƯA hoàn tất",
  completionStatus(deliveredOrder({ deliveredAt: "2026-10-15", deliveryProof: { ...PROOF, notifiedAt: "2026-10-15T09:00:00.000Z", deadlineAt: "2026-10-18T09:00:00.000Z" } }), NOW).complete === false
);

/* ===================== 7. Điều kiện chi trả người bán ===================== */

check(
  "CT-01 đơn chưa hoàn tất -> chờ đủ điều kiện",
  sellerPayoutEligibility(order({ status: "CONFIRMED", paymentStatus: PAYMENT_STATUS.PAID }), NOW).status ===
    PAYOUT_STATUS.PENDING_ELIGIBILITY
);

check(
  "CT-02 đơn hoàn tất + đã thanh toán -> đủ điều kiện",
  sellerPayoutEligibility(completeOrder, NOW).status === PAYOUT_STATUS.ELIGIBLE
);

check(
  "CT-03 COD chưa đối soát -> chưa đủ điều kiện chi trả",
  sellerPayoutEligibility(
    { ...completeOrder, paymentMethod: "COD", paymentStatus: PAYMENT_STATUS.COD_COLLECTED },
    NOW
  ).status === PAYOUT_STATUS.PENDING_ELIGIBILITY
);

check(
  "CT-04 COD đã đối soát -> đủ điều kiện chi trả",
  sellerPayoutEligibility(
    { ...completeOrder, paymentMethod: "COD", paymentStatus: PAYMENT_STATUS.COD_RECONCILED },
    NOW
  ).status === PAYOUT_STATUS.ELIGIBLE
);

check(
  "CT-05 còn hoàn tiền đang xử lý -> chưa chi trả",
  sellerPayoutEligibility(
    { ...completeOrder, paymentStatus: PAYMENT_STATUS.REFUND_PROCESSING },
    NOW
  ).status === PAYOUT_STATUS.PENDING_ELIGIBILITY
);

check(
  "CT-06 đã ghi nhận chi trả -> PAID_SIMULATED (giữ nguyên)",
  sellerPayoutEligibility(
    { ...completeOrder, payout: { status: PAYOUT_STATUS.PAID_SIMULATED, amount: 10000000 } },
    NOW
  ).status === PAYOUT_STATUS.PAID_SIMULATED
);

/* ========= 8. Tách biệt trạng thái đơn với dữ liệu tham chiếu ========= */

// Đơn hoàn tất + đã thanh toán + đã xác minh dữ liệu -> ELIGIBLE.
const goodDetail = makeDetailFromOrder(
  completeOrder,
  { model: "iPhone 13", storage: "128GB" },
  { now: NOW, priceDataStatus: "VERIFIED" }
);
check("TACH-01 COD/QR đã xác minh -> detail payment_status = PAID", goodDetail.payment_status === "PAID");
check("TACH-02 đơn đủ điều kiện -> reference ELIGIBLE", referenceDataStatus(goodDetail, NOW).status === "ELIGIBLE");

// Đang khiếu nại mở -> loại khỏi dữ liệu tham chiếu.
const disputeDetail = makeDetailFromOrder(
  deliveredOrder({ supportRequests: [openReq], status: "COMPLETED", receivedAt: "2026-10-11" }),
  { model: "iPhone 13", storage: "128GB" },
  { now: NOW, priceDataStatus: "VERIFIED" }
);
check("TACH-03 khiếu nại mở -> dispute OPEN", disputeDetail.dispute_status === "OPEN");
check("TACH-04 khiếu nại mở -> reference EXCLUDED", referenceDataStatus(disputeDetail, NOW).status === "EXCLUDED");

// Đang hoàn tiền -> loại.
const refundingDetail = makeDetailFromOrder(
  { ...completeOrder, paymentStatus: PAYMENT_STATUS.REFUND_PROCESSING },
  { model: "iPhone 13", storage: "128GB" },
  { now: NOW, priceDataStatus: "VERIFIED" }
);
check("TACH-05 đang hoàn tiền -> refund_status REFUNDING", refundingDetail.refund_status === "REFUNDING");
check("TACH-06 đang hoàn tiền -> reference EXCLUDED", referenceDataStatus(refundingDetail, NOW).status === "EXCLUDED");

// Đã hoàn hàng -> loại.
const returnedDetail = makeDetailFromOrder(
  { ...completeOrder, shippingStatus: "RETURNED" },
  { model: "iPhone 13", storage: "128GB" },
  { now: NOW, priceDataStatus: "VERIFIED" }
);
check("TACH-07 đã hoàn hàng -> reference EXCLUDED", referenceDataStatus(returnedDetail, NOW).status === "EXCLUDED");

// COD chưa đối soát -> chờ xác minh (không tự động PAID).
const codPendingDetail = makeDetailFromOrder(
  { ...completeOrder, paymentMethod: "COD", paymentStatus: PAYMENT_STATUS.COD_COLLECTED },
  { model: "iPhone 13", storage: "128GB" },
  { now: NOW, priceDataStatus: "VERIFIED" }
);
check(
  "TACH-08 COD chưa đối soát -> reference PENDING_VERIFICATION",
  referenceDataStatus(codPendingDetail, NOW).status === "PENDING_VERIFICATION"
);

/* ---- checkReferenceEligibility: khiếu nại mở chặn đủ điều kiện ---- */

const eligGood = checkReferenceEligibility(completeOrder);
check("ELIG-01 đơn tốt -> eligible", eligGood.eligible === true);

const eligDispute = checkReferenceEligibility(deliveredOrder({ supportRequests: [openReq], receivedAt: "2026-10-11", status: "COMPLETED" }));
check("ELIG-02 khiếu nại mở -> không eligible", eligDispute.eligible === false);

const eligCod = checkReferenceEligibility({ ...completeOrder, paymentMethod: "COD", paymentStatus: PAYMENT_STATUS.PENDING_COD_COLLECTION });
check("ELIG-03 COD chưa thu/đối soát -> không eligible", eligCod.eligible === false);

/* ------------------------------- Tổng kết ------------------------------- */

console.log(`\nKết quả kiểm thử quy tắc đơn hàng (Phần XVI): ${pass} đạt, ${fail} lỗi.\n`);
if (fail > 0) {
  console.log("Các ca lỗi:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
