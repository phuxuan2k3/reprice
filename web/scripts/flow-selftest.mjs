/**
 * KIỂM THỬ LUỒNG NGHIỆP VỤ ĐẦU–CUỐI (Giai đoạn 10) — chạy bằng:
 *   node scripts/flow-selftest.mjs   (hoặc `npm run test:flow`)
 *
 * Mục đích: ghép các hàm thuần của các module quy tắc thành CHUỖI luồng hoàn
 * chỉnh (thương lượng → chốt giá → tạo đơn → xác nhận → giao hàng → giao
 * thành công → trả hàng/khiếu nại → hủy/khóa), và kiểm tra các bất biến nghiệp
 * vụ quan trọng. Không phụ thuộc React, không sửa dữ liệu thật.
 *
 * LƯU Ý PHẠM VI: đây là kiểm thử ở TẦNG QUY TẮC (business rules). Các bước cần
 * trình duyệt (đăng nhập, F5 giữ dữ liệu, lỗi lưu, build production) được in ra
 * ở cuối dưới dạng "kiểm tra thủ công" — KHÔNG được tính là đã chạy tự động.
 */

import {
  NEGOTIATION_STATUS,
  canBuyerSendOffer,
  canSellerRespond,
  canBuyerHandleCounter,
  canBuyerCreateOrder,
  isDuplicateBuyerOffer,
  validateOrderDraft,
} from "../src/data/negotiationRules.js";
import {
  PAYMENT_STATUS,
  initialPaymentStatus,
  nextCodPaymentStatus,
  isPaymentSettled,
  canCancelOrder,
  cancelPhase,
  CANCEL_PHASE,
  canStartReturnToSeller,
  hasCarrierHandover,
} from "../src/data/orderRules.js";
import { nextShippingStatus, SHIPPING_SEQUENCE } from "../src/data/shipping.js";
import { isCaseOpen, isCaseClosed, partyOf, maskTracking } from "../src/data/caseRules.js";

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

/* ---------------------------- Dữ liệu nền ---------------------------- */

const phone = { id: "P001", price: 9200000, listingStatus: "ACTIVE" };
const buyer = { userId: "U01", role: "buyer" };
const seller = { userId: "S01", role: "seller" };
const outsider = { userId: "U99", role: "buyer" };

/* ===================================================================== */
/* LUỒNG A — THƯƠNG LƯỢNG GIÁ ĐẾN CHỐT GIÁ                                */
/* ===================================================================== */

// A1. Người mua gửi đề nghị.
let neg = {
  id: "NEG-1",
  phoneId: "P001",
  listingId: "P001",
  buyerId: "U01",
  sellerId: "S01",
  listingPrice: 9200000,
  status: NEGOTIATION_STATUS.AWAITING_SELLER,
  agreedPrice: null,
  counterPrice: null,
  offers: [{ from: "buyer", price: 8600000, note: "" }],
};
check(
  "A1 người mua gửi được đề nghị",
  canBuyerSendOffer(neg, buyer).allowed === true
);
check(
  "A1b người mua KHÁC/người bán không gửi hộ được",
  canBuyerSendOffer(neg, outsider).allowed === false &&
    canBuyerSendOffer(neg, seller).allowed === false
);
check(
  "A1c gửi lặp y nguyên bị chặn",
  isDuplicateBuyerOffer(neg, 8600000) === true
);

// A2. Chỉ người bán của phiên mới phản hồi được.
check(
  "A2 người bán phản hồi được",
  canSellerRespond(neg, seller).allowed === true
);
check(
  "A2b người mua không phản hồi thay người bán",
  canSellerRespond(neg, buyer).allowed === false
);

// A3. Người bán trả giá khác → SELLER_COUNTER.
neg = {
  ...neg,
  status: NEGOTIATION_STATUS.SELLER_COUNTER,
  counterPrice: 8900000,
  offers: [...neg.offers, { from: "seller", price: 8900000, note: "" }],
};
check(
  "A3 người bán không phản hồi lần hai khi đang chờ người mua",
  canSellerRespond(neg, seller).allowed === false
);
check(
  "A3b người mua xử lý được giá đối đề xuất",
  canBuyerHandleCounter(neg, buyer).allowed === true
);

// A4. Người mua chấp nhận → AGREED, giá chốt 8.900.000.
neg = { ...neg, status: NEGOTIATION_STATUS.AGREED, agreedPrice: 8900000 };
check(
  "A4 chỉ người mua của phiên tạo được đơn",
  canBuyerCreateOrder(neg, buyer).allowed === true &&
    canBuyerCreateOrder(neg, seller).allowed === false
);
check(
  "A4b giá tạo đơn lấy ĐÚNG giá đã chốt, KHÔNG phải giá rao",
  canBuyerCreateOrder(neg, buyer).price === 8900000 &&
    8900000 !== phone.price
);

/* ===================================================================== */
/* LUỒNG B — TẠO ĐƠN & HAI BÊN XÁC NHẬN ĐỘC LẬP                           */
/* ===================================================================== */

// B1. Không tạo đơn theo giá CHƯA chốt.
const notAgreed = { ...neg, status: NEGOTIATION_STATUS.AWAITING_SELLER, agreedPrice: null };
check(
  "B1 chặn tạo đơn khi chưa thống nhất giá",
  validateOrderDraft({ phone, negotiation: notAgreed, buyerId: "U01" }).ok === false
);

// B2. Tạo đơn hợp lệ theo giá đã chốt.
const draft = validateOrderDraft({ phone, negotiation: neg, buyerId: "U01" });
check(
  "B2 tạo đơn hợp lệ, đúng giá chốt",
  draft.ok === true && draft.negotiatedPrice === 8900000
);

// B3. Phát hiện giá rao đã thay đổi kể từ lúc thương lượng.
const changed = validateOrderDraft({
  phone: { ...phone, price: 9500000 },
  negotiation: neg,
  buyerId: "U01",
});
check("B3 cảnh báo giá rao đã đổi", changed.ok === true && changed.listingChanged === true);

// B4. Trước khi hai bên xác nhận → hủy được, không cần lý do.
const orderNew = {
  id: "DH-1",
  buyerId: "U01",
  sellerId: "S01",
  status: "PENDING_BUYER",
  paymentMethod: "COD",
  paymentStatus: initialPaymentStatus("COD"),
  shippingStatus: "NOT_SHIPPED",
};
check(
  "B4 trước xác nhận: hủy được (BEFORE_CONFIRM)",
  canCancelOrder(orderNew, buyer).allowed === true &&
    cancelPhase(orderNew) === CANCEL_PHASE.BEFORE_CONFIRM
);
check(
  "B4b người ngoài không hủy được",
  canCancelOrder(orderNew, outsider).allowed === false
);

/* ===================================================================== */
/* LUỒNG C — VẬN CHUYỂN, GIAO THÀNH CÔNG                                 */
/* ===================================================================== */

let ship = "AWAITING_PICKUP";
let steps = 0;
while (nextShippingStatus(ship)) {
  ship = nextShippingStatus(ship);
  steps += 1;
  if (steps > 20) break;
}
check(
  "C1 trình tự vận chuyển đi hết tới DELIVERED",
  ship === "DELIVERED" && nextShippingStatus("DELIVERED") === null
);
check(
  "C1b số bước khớp SHIPPING_SEQUENCE",
  steps === SHIPPING_SEQUENCE.length - 1
);

// Sau khi giao thành công: COD có thể thu tiền.
const delivered = {
  ...orderNew,
  status: "DELIVERED",
  shippingStatus: "DELIVERED",
};
check(
  "C2 sau giao thành công vẫn hủy thường được? KHÔNG (đã giao)",
  canCancelOrder(delivered, buyer).allowed === false
);

/* ===================================================================== */
/* LUỒNG D — COD & KHÓA HỦY KHI ĐÃ THANH TOÁN/BÀN GIAO                    */
/* ===================================================================== */

check(
  "D1 COD bắt đầu ở PENDING_COD_COLLECTION",
  initialPaymentStatus("COD") === PAYMENT_STATUS.PENDING_COD_COLLECTION
);
let pay = initialPaymentStatus("COD");
let paySteps = 0;
while (nextCodPaymentStatus(pay)) {
  pay = nextCodPaymentStatus(pay);
  paySteps += 1;
  if (paySteps > 10) break;
}
check(
  "D2 luồng COD đi hết tới COD_RECONCILED",
  pay === PAYMENT_STATUS.COD_RECONCILED && nextCodPaymentStatus(pay) === null
);
check(
  "D3 COD_RECONCILED được coi là đã thanh toán",
  isPaymentSettled({ paymentMethod: "COD", paymentStatus: PAYMENT_STATUS.COD_RECONCILED }) === true
);
const lockedPaid = {
  ...orderNew,
  status: "CONFIRMED",
  paymentStatus: PAYMENT_STATUS.COD_RECONCILED,
};
check(
  "D4 đơn đã thanh toán → KHÓA hủy thường, chỉ còn luồng thay thế",
  canCancelOrder(lockedPaid, buyer).allowed === false &&
    canCancelOrder(lockedPaid, buyer).mode === "ALT_FLOW" &&
    canCancelOrder(lockedPaid, buyer).code === "PAID"
);

// Đã bàn giao cho đơn vị vận chuyển (có sự kiện bàn giao) → LOCKED.
const lockedHanded = {
  ...orderNew,
  status: "SHIPPING",
  shippingEvents: [{ to: "ACCEPTED", time: "2026-10-01T00:00:00.000Z" }],
  shippingStatus: "ACCEPTED",
};
check(
  "D5 đã bàn giao vận chuyển → KHÓA hủy",
  hasCarrierHandover(lockedHanded) === true &&
    canCancelOrder(lockedHanded, buyer).allowed === false &&
    canCancelOrder(lockedHanded, buyer).code === "HANDED_OVER"
);

/* ===================================================================== */
/* LUỒNG E — GIAO THẤT BẠI & CHUYỂN HOÀN VỀ NGƯỜI BÁN                     */
/* ===================================================================== */

check(
  "E1 thất bại lần đầu (không do từ chối) → CHƯA chuyển hoàn",
  canStartReturnToSeller({
    shippingStatus: "FAILED",
    deliveryAttempts: 1,
    lastDeliveryFailureKind: "UNREACHABLE",
  }) === false
);
check(
  "E2 giao lại lần hai vẫn thất bại → BẮT BUỘC chuyển hoàn",
  canStartReturnToSeller({
    shippingStatus: "FAILED",
    deliveryAttempts: 2,
  }) === true
);
check(
  "E3 người mua từ chối nhận → chuyển hoàn ngay",
  canStartReturnToSeller({
    shippingStatus: "FAILED",
    deliveryAttempts: 1,
    lastDeliveryFailureKind: "REFUSED",
  }) === true
);

/* ===================================================================== */
/* LUỒNG F — HỒ SƠ TRẢ HÀNG/KHIẾU NẠI & PHÂN QUYỀN                        */
/* ===================================================================== */

check(
  "F1 hồ sơ PENDING_SELLER còn mở, hồ sơ RESOLVED đã đóng",
  isCaseOpen({ status: "PENDING_SELLER" }) === true &&
    isCaseClosed({ status: "RESOLVED" }) === true &&
    isCaseOpen({ status: "RESOLVED" }) === false
);
const anyOrder = { buyerId: "U01", sellerId: "S01" };
check(
  "F2 phân đúng vai trò người mua/người bán",
  partyOf(anyOrder, buyer) === "BUYER" && partyOf(anyOrder, seller) === "SELLER"
);
check(
  "F3 người ngoài bị che mã vận đơn",
  maskTracking("RPX-123456", false).includes("*") &&
    maskTracking("RPX-123456", true) === "RPX-123456"
);

/* ===================================================================== */
/* LUỒNG G — CHỐNG TRÙNG & BẤT BIẾN TỔNG HỢP                              */
/* ===================================================================== */

check(
  "G1 hai phiên thương lượng khác mã đúng như thiết kế",
  canBuyerCreateOrder({ ...neg, orderId: "DH-1" }, buyer).allowed === false
);
check(
  "G2 đơn đã có vận đơn nhưng CHƯA bàn giao vẫn hủy được",
  canCancelOrder(
    {
      ...orderNew,
      status: "SHIPPING",
      trackingCode: "RPX-1",
      shippingStatus: "AWAITING_PICKUP",
    },
    buyer
  ).allowed === true
);

/* ------------------------------- Tổng kết ------------------------------- */

console.log(`\nKết quả kiểm thử LUỒNG NGHIỆP VỤ (Giai đoạn 10): ${pass} đạt, ${fail} lỗi.`);
if (failures.length) {
  console.log("Các kiểm tra chưa đạt:");
  for (const f of failures) console.log("  - " + f);
}
console.log("\n--- CẦN KIỂM TRA THỦ CÔNG (không tự động hóa được ở tầng quy tắc) ---");
console.log("  1. F5 tải lại trang / đăng nhập lại giữ nguyên dữ liệu (localStorage).");
console.log("  2. Lỗi lưu dữ liệu KHÔNG hiển thị thành công giả.");
console.log("  3. Đồng bộ 2 tab cùng trình duyệt (sự kiện storage).");
console.log("  4. `npm run build` production + mở các route quan trọng.");
if (fail > 0) process.exit(1);
