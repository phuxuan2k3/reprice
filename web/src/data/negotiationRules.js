/**
 * QUY TẮC NGHIỆP VỤ THƯƠNG LƯỢNG — RePrice (Giai đoạn 2).
 *
 * Toàn bộ hàm là HÀM THUẦN (không phụ thuộc React, không đọc localStorage) để
 * dùng chung cho: AppContext, các trang giao diện và bộ kiểm thử tự động
 * (`scripts/negotiation-selftest.mjs`).
 *
 * NGUYÊN TẮC:
 *  - KHÔNG gộp trạng thái thương lượng vào trạng thái đơn hàng. Thương lượng là
 *    một đối tượng riêng, có mã phiên riêng và lịch sử đề nghị riêng.
 *  - Chỉ được tạo đơn hàng theo GIÁ ĐÃ THỐNG NHẤT (AGREED) mà cả hai bên đã
 *    xác nhận trong cùng phiên; không tạo đơn theo giá chưa chốt.
 *  - Mỗi hành động kiểm tra đúng vai trò: chỉ người mua của phiên mới gửi/chấp
 *    nhận đề nghị; chỉ người bán của phiên mới phản hồi đề nghị.
 *  - Không tự đặt ngưỡng ngoài đặc tả.
 */

export const NEGOTIATION_STATUS = {
  AWAITING_SELLER: "AWAITING_SELLER", // người mua đã gửi, chờ người bán
  SELLER_COUNTER: "SELLER_COUNTER", // người bán đề nghị mức giá khác
  AGREED: "AGREED", // hai bên thống nhất giá
  REJECTED: "REJECTED", // người bán từ chối đề nghị
  CANCELLED: "CANCELLED", // người mua hủy phiên
};

export const NEGOTIATION_STATUS_LABEL = {
  [NEGOTIATION_STATUS.AWAITING_SELLER]: "Đang chờ người bán phản hồi",
  [NEGOTIATION_STATUS.SELLER_COUNTER]: "Người bán đã đề nghị mức giá mới",
  [NEGOTIATION_STATUS.AGREED]: "Hai bên đã thống nhất giá",
  [NEGOTIATION_STATUS.REJECTED]: "Người bán đã từ chối",
  [NEGOTIATION_STATUS.CANCELLED]: "Thương lượng đã hủy",
};

export const NEGOTIATION_STATUS_TONE = {
  [NEGOTIATION_STATUS.AWAITING_SELLER]: "amber",
  [NEGOTIATION_STATUS.SELLER_COUNTER]: "blue",
  [NEGOTIATION_STATUS.AGREED]: "green",
  [NEGOTIATION_STATUS.REJECTED]: "red",
  [NEGOTIATION_STATUS.CANCELLED]: "gray",
};

/** Trạng thái còn đang trao đổi (chưa chốt, chưa hủy). */
export const OPEN_NEGOTIATION_STATUSES = [
  NEGOTIATION_STATUS.AWAITING_SELLER,
  NEGOTIATION_STATUS.SELLER_COUNTER,
];

export function isNegotiationOpen(n) {
  return OPEN_NEGOTIATION_STATUSES.includes(n?.status);
}

/** Đề nghị gần nhất của một bên. */
export function lastOfferFrom(negotiation, from) {
  if (!negotiation?.offers?.length) return null;
  return [...negotiation.offers].reverse().find((o) => o.from === from) || null;
}

export function lastBuyerOffer(negotiation) {
  return lastOfferFrom(negotiation, "buyer");
}

export function lastSellerOffer(negotiation) {
  return lastOfferFrom(negotiation, "seller");
}

/** Làm tròn giá về bội số của `step` (mặc định 10.000đ). */
export function roundPrice(value, step = 10000) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n / step) * step;
}

/**
 * Giá đối đề xuất: trung bình cộng giữa giá rao và đề nghị của người mua,
 * làm tròn 10.000đ. Thuần tuý để mọi nơi tính cùng một kết quả.
 */
export function counterPriceBetween(listingPrice, offer, step = 10000) {
  const listing = Number(listingPrice);
  const o = Number(offer);
  if (!Number.isFinite(listing) || !Number.isFinite(o)) return null;
  return roundPrice((listing + o) / 2, step);
}

/**
 * Đề nghị mới có TRÙNG với đề nghị người mua vừa gửi không (chống bấm lặp /
 * gửi lại y nguyên khi đề nghị đó còn đang chờ người bán phản hồi)?
 */
export function isDuplicateBuyerOffer(negotiation, price) {
  if (negotiation?.status !== NEGOTIATION_STATUS.AWAITING_SELLER) return false;
  const last = [...(negotiation.offers || [])].reverse()[0];
  if (!last || last.from !== "buyer") return false;
  const rounded = roundPrice(price) ?? Number(price);
  return Number(last.price) === Number(rounded);
}

/** Người mua có được gửi đề nghị mới trong phiên này hay không. */
export function canBuyerSendOffer(negotiation, actor = {}) {
  if (!negotiation)
    return { allowed: false, reason: "Không tìm thấy phiên thương lượng." };
  if (negotiation.buyerId !== actor.userId)
    return { allowed: false, reason: "Bạn không phải người mua trong phiên này." };
  if (negotiation.status === NEGOTIATION_STATUS.AGREED)
    return {
      allowed: false,
      reason: "Hai bên đã thống nhất giá — hãy tạo đơn hàng thay vì thương lượng tiếp.",
    };
  if (negotiation.status === NEGOTIATION_STATUS.CANCELLED)
    return { allowed: false, reason: "Phiên thương lượng đã hủy." };
  return { allowed: true, reason: "" };
}

/** Người bán có được phản hồi đề nghị đang chờ hay không. */
export function canSellerRespond(negotiation, actor = {}) {
  if (!negotiation)
    return { allowed: false, reason: "Không tìm thấy phiên thương lượng." };
  if (negotiation.sellerId !== actor.userId)
    return { allowed: false, reason: "Bạn không phải người bán trong phiên này." };
  if (negotiation.status !== NEGOTIATION_STATUS.AWAITING_SELLER)
    return { allowed: false, reason: "Không có đề nghị nào đang chờ bạn phản hồi." };
  if (!lastBuyerOffer(negotiation))
    return { allowed: false, reason: "Người mua chưa gửi đề nghị nào." };
  return { allowed: true, reason: "" };
}

/** Người mua có được chấp nhận / từ chối đề nghị đối giá của người bán. */
export function canBuyerHandleCounter(negotiation, actor = {}) {
  if (!negotiation)
    return { allowed: false, reason: "Không tìm thấy phiên thương lượng." };
  if (negotiation.buyerId !== actor.userId)
    return { allowed: false, reason: "Bạn không phải người mua trong phiên này." };
  if (negotiation.status !== NEGOTIATION_STATUS.SELLER_COUNTER)
    return { allowed: false, reason: "Người bán chưa đề nghị mức giá mới." };
  return { allowed: true, reason: "" };
}

/** Người mua có được tạo đơn từ phiên thương lượng này. */
export function canBuyerCreateOrder(negotiation, actor = {}) {
  if (!negotiation)
    return { allowed: false, reason: "Không tìm thấy phiên thương lượng." };
  if (negotiation.buyerId !== actor.userId)
    return { allowed: false, reason: "Chỉ người mua của phiên mới tạo được đơn." };
  if (negotiation.status !== NEGOTIATION_STATUS.AGREED || !negotiation.agreedPrice)
    return {
      allowed: false,
      reason: "Hai bên chưa thống nhất giá — không thể tạo đơn theo giá chưa chốt.",
    };
  if (negotiation.orderId)
    return { allowed: false, reason: "Phiên thương lượng này đã tạo đơn hàng." };
  return { allowed: true, reason: "", price: Number(negotiation.agreedPrice) };
}

/**
 * Kiểm tra dữ liệu TRƯỚC KHI tạo đơn hàng.
 *
 * Trả về { ok, errors, negotiatedPrice, listingPrice, listingChanged }.
 *  - Nếu có phiên thương lượng: bắt buộc AGREED + có agreedPrice; giá đơn lấy
 *    từ agreedPrice (KHÔNG lấy giá do người dùng nhập) → không tạo đơn theo giá
 *    chưa được xác nhận.
 *  - Nếu mua ngay (không thương lượng): dùng giá rao hiện tại của tin đăng.
 *  - `listingChanged` bật khi giá rao hiện tại khác giá tại thời điểm thương
 *    lượng → giao diện nhắc hai bên xác nhận lại.
 */
export function validateOrderDraft({ phone, negotiation = null, buyerId = null, price = null } = {}) {
  const errors = [];
  const listingPrice = phone ? Number(phone.price) : null;

  if (!phone) errors.push("Không tìm thấy tin đăng của điện thoại này.");
  else if (phone.listingStatus && phone.listingStatus !== "ACTIVE")
    errors.push("Tin đăng không còn hoạt động — không thể tạo đơn.");

  let negotiatedPrice = null;
  let listingChanged = false;

  if (negotiation) {
    if (buyerId && negotiation.buyerId !== buyerId)
      errors.push("Bạn không phải người mua của phiên thương lượng này.");
    if (phone && negotiation.phoneId !== phone.id)
      errors.push("Phiên thương lượng không thuộc tin đăng này.");
    if (negotiation.status !== NEGOTIATION_STATUS.AGREED || !negotiation.agreedPrice)
      errors.push("Phiên thương lượng chưa thống nhất giá — không thể tạo đơn.");
    else negotiatedPrice = Number(negotiation.agreedPrice);
    if (
      phone &&
      negotiation.listingPrice != null &&
      Number(negotiation.listingPrice) !== Number(phone.price)
    )
      listingChanged = true;
  } else {
    negotiatedPrice = price != null ? Number(price) : listingPrice;
    if (!Number.isFinite(negotiatedPrice) || negotiatedPrice <= 0)
      errors.push("Giá tạo đơn không hợp lệ.");
  }

  return {
    ok: errors.length === 0,
    errors,
    negotiatedPrice: Number.isFinite(negotiatedPrice) ? negotiatedPrice : null,
    listingPrice: Number.isFinite(listingPrice) ? listingPrice : null,
    listingChanged,
  };
}
