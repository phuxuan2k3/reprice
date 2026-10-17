/**
 * KIỂM THỬ QUY TẮC THƯƠNG LƯỢNG + TẠO ĐƠN (Giai đoạn 2) — chạy bằng:
 *   node scripts/negotiation-selftest.mjs   (hoặc `npm run test:negotiation`)
 *
 * Phủ hai luồng độc lập (MUA NGAY và THƯƠNG LƯỢNG) trên các hàm thuần:
 *  - Đúng vai trò mới thao tác được (chỉ người mua gửi/chấp nhận đề nghị;
 *    chỉ người bán của phiên phản hồi).
 *  - Chỉ tạo đơn theo GIÁ ĐÃ CHỐT (AGREED); chặn tạo đơn theo giá chưa xác nhận.
 *  - Phát hiện giá rao thay đổi kể từ khi thương lượng (listingChanged).
 *  - Mua ngay dùng giá rao hiện tại, không phụ thuộc phiên thương lượng.
 *
 * Không phụ thuộc React. Không sửa dữ liệu thật.
 */

import {
  NEGOTIATION_STATUS,
  canBuyerSendOffer,
  canSellerRespond,
  canBuyerHandleCounter,
  canBuyerCreateOrder,
  counterPriceBetween,
  isNegotiationOpen,
  isDuplicateBuyerOffer,
  lastBuyerOffer,
  roundPrice,
  validateOrderDraft,
} from "../src/data/negotiationRules.js";

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

const phone = {
  id: "P001",
  price: 9200000,
  listingStatus: "ACTIVE",
  seller: { id: "S01", name: "Trần Minh" },
};

const buyerActor = { userId: "U01", role: "buyer" };
const sellerActor = { userId: "S01", role: "seller" };
const otherActor = { userId: "U99", role: "buyer" };

const baseNeg = {
  id: "NEG-T1",
  phoneId: "P001",
  buyerId: "U01",
  sellerId: "S01",
  listingPrice: 9200000,
  status: NEGOTIATION_STATUS.AWAITING_SELLER,
  offers: [{ from: "buyer", price: 8600000, time: "10:15" }],
  agreedPrice: null,
  counterPrice: null,
  orderId: null,
};

/* ---------------------- Giá đối đề xuất / làm tròn ----------------------- */

check("PRICE-01 làm tròn 10.000", roundPrice(8612345) === 8610000);
check("PRICE-02 giữ nguyên bội số 10.000", roundPrice(8600000) === 8600000);
check("PRICE-03 giá không hợp lệ -> null", roundPrice(0) === null);
check(
  "PRICE-04 giá giữa hai bên = trung bình làm tròn",
  counterPriceBetween(9200000, 8600000) === 8900000
);
check("PRICE-05 lastBuyerOffer đúng đề nghị", lastBuyerOffer(baseNeg)?.price === 8600000);

/* -------------------------- Người mua gửi đề nghị ------------------------ */

check("BUY-01 người mua gửi đề nghị khi chờ người bán", canBuyerSendOffer(baseNeg, buyerActor).allowed === true);
check("BUY-02 người khác không gửi được", canBuyerSendOffer(baseNeg, otherActor).allowed === false);
check(
  "BUY-03 đã thống nhất -> không gửi tiếp",
  canBuyerSendOffer({ ...baseNeg, status: NEGOTIATION_STATUS.AGREED }, buyerActor).allowed === false
);
check(
  "BUY-04 phiên đã hủy -> không gửi",
  canBuyerSendOffer({ ...baseNeg, status: NEGOTIATION_STATUS.CANCELLED }, buyerActor).allowed === false
);
check(
  "BUY-05 sau khi bị từ chối -> được gửi lại",
  canBuyerSendOffer({ ...baseNeg, status: NEGOTIATION_STATUS.REJECTED }, buyerActor).allowed === true
);

/* --------------------------- Người bán phản hồi -------------------------- */

check("SELL-01 người bán phản hồi khi có đề nghị chờ", canSellerRespond(baseNeg, sellerActor).allowed === true);
check(
  "SELL-02 người bán không phải chủ phiên -> chặn",
  canSellerRespond(baseNeg, { userId: "S99", role: "seller" }).allowed === false
);
check(
  "SELL-03 không có đề nghị chờ -> chặn",
  canSellerRespond({ ...baseNeg, offers: [] }, sellerActor).allowed === false
);
check(
  "SELL-04 sai trạng thái -> chặn",
  canSellerRespond({ ...baseNeg, status: NEGOTIATION_STATUS.SELLER_COUNTER }, sellerActor).allowed === false
);
check("SELL-05 người mua không phản hồi thay người bán", canSellerRespond(baseNeg, buyerActor).allowed === false);

/* ----------------------- Người mua xử lý đối giá ------------------------- */

const countered = { ...baseNeg, status: NEGOTIATION_STATUS.SELLER_COUNTER, counterPrice: 8900000 };
check("CNT-01 người mua xử lý đối giá", canBuyerHandleCounter(countered, buyerActor).allowed === true);
check(
  "CNT-02 chưa có đối giá -> chặn",
  canBuyerHandleCounter(baseNeg, buyerActor).allowed === false
);
check("CNT-03 người bán không xử lý thay", canBuyerHandleCounter(countered, sellerActor).allowed === false);

/* --------------------------- Tạo đơn từ phiên ---------------------------- */

const agreed = { ...baseNeg, status: NEGOTIATION_STATUS.AGREED, agreedPrice: 8900000 };
check("ORD-01 đã chốt giá -> được tạo đơn", canBuyerCreateOrder(agreed, buyerActor).allowed === true);
check("ORD-02 giá chốt trả về đúng", canBuyerCreateOrder(agreed, buyerActor).price === 8900000);
check(
  "ORD-03 chưa chốt giá -> không tạo đơn",
  canBuyerCreateOrder(baseNeg, buyerActor).allowed === false
);
check(
  "ORD-04 phiên đã tạo đơn -> chặn tạo trùng",
  canBuyerCreateOrder({ ...agreed, orderId: "DH-1" }, buyerActor).allowed === false
);
check("ORD-05 người bán không tạo đơn thay", canBuyerCreateOrder(agreed, sellerActor).allowed === false);

/* ------------------ validateOrderDraft: hai luồng tạo đơn ---------------- */

const buyNow = validateOrderDraft({ phone, buyerId: "U01", price: 9200000 });
check("VAL-01 mua ngay hợp lệ", buyNow.ok === true);
check("VAL-02 mua ngay lấy giá nhập", buyNow.negotiatedPrice === 9200000);

const buyNoPrice = validateOrderDraft({ phone, buyerId: "U01", price: null });
check("VAL-03 mua ngay thiếu giá -> dùng giá rao", buyNoPrice.ok === true && buyNoPrice.negotiatedPrice === 9200000);

const negOk = validateOrderDraft({ phone, negotiation: agreed, buyerId: "U01", price: 100 });
check("VAL-04 tạo đơn theo giá chốt (bỏ qua giá nhập)", negOk.ok === true && negOk.negotiatedPrice === 8900000);

const negBad = validateOrderDraft({ phone, negotiation: baseNeg, buyerId: "U01", price: 8900000 });
check("VAL-05 phiên chưa chốt -> không hợp lệ", negBad.ok === false);

const negWrongBuyer = validateOrderDraft({ phone, negotiation: agreed, buyerId: "U99", price: null });
check("VAL-06 sai người mua -> không hợp lệ", negWrongBuyer.ok === false);

const notActive = validateOrderDraft({ phone: { ...phone, listingStatus: "PAUSED" }, buyerId: "U01", price: 9200000 });
check("VAL-07 tin đăng không hoạt động -> chặn", notActive.ok === false);

const changed = validateOrderDraft({
  phone: { ...phone, price: 8800000 },
  negotiation: agreed,
  buyerId: "U01",
  price: null,
});
check("VAL-08 giá rao đổi -> listingChanged", changed.ok === true && changed.listingChanged === true);
check("VAL-08b giá chốt vẫn được giữ", changed.negotiatedPrice === 8900000);

const unchanged = validateOrderDraft({ phone, negotiation: agreed, buyerId: "U01", price: null });
check("VAL-09 giá rao không đổi -> listingChanged=false", unchanged.listingChanged === false);

const missingPhone = validateOrderDraft({ phone: null, buyerId: "U01", price: 1000 });
check("VAL-10 thiếu tin đăng -> không hợp lệ", missingPhone.ok === false);

/* ------------------------ Trạng thái còn trao đổi ------------------------ */

check("OPEN-01 AWAITING_SELLER còn mở", isNegotiationOpen({ status: NEGOTIATION_STATUS.AWAITING_SELLER }) === true);
check("OPEN-02 SELLER_COUNTER còn mở", isNegotiationOpen({ status: NEGOTIATION_STATUS.SELLER_COUNTER }) === true);
check("OPEN-03 AGREED không còn mở", isNegotiationOpen({ status: NEGOTIATION_STATUS.AGREED }) === false);
check("OPEN-04 REJECTED không còn mở", isNegotiationOpen({ status: NEGOTIATION_STATUS.REJECTED }) === false);

/* --------------------- Chống gửi lặp đề nghị giá --------------------- */

// baseNeg: trạng thái AWAITING_SELLER, đề nghị cuối do người mua gửi 8.600.000.
check(
  "DUP-01 gửi lại y nguyên giá đang chờ -> phát hiện trùng",
  isDuplicateBuyerOffer(baseNeg, 8600000) === true
);
check(
  "DUP-02 gửi mức giá khác -> không trùng",
  isDuplicateBuyerOffer(baseNeg, 8300000) === false
);
check(
  "DUP-03 giá chênh nhưng làm tròn 10k về cùng mức -> trùng",
  isDuplicateBuyerOffer(baseNeg, 8604000) === true
);
check(
  "DUP-04 phiên đã sang SELLER_COUNTER -> không coi là trùng",
  isDuplicateBuyerOffer({ ...baseNeg, status: NEGOTIATION_STATUS.SELLER_COUNTER }, 8600000) === false
);
check(
  "DUP-05 lượt cuối là của người bán -> không chặn",
  isDuplicateBuyerOffer(
    {
      ...baseNeg,
      offers: [
        { from: "buyer", price: 8600000 },
        { from: "seller", price: 8900000 },
      ],
    },
    8600000
  ) === false
);

/* ------------------------------- Tổng kết ------------------------------- */

console.log(`\nKết quả kiểm thử thương lượng & tạo đơn (Giai đoạn 2): ${pass} đạt, ${fail} lỗi.\n`);
if (fail > 0) {
  console.log("Các ca lỗi:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
