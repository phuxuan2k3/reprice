/**
 * LỚP 4 — API DỮ LIỆU CHO GIAO DIỆN.
 *
 * Giao diện CHỈ gọi các hàm ở đây; KHÔNG tự tính lại quy tắc nghiệp vụ
 * (phân vị, cửa sổ thời gian, độ tin cậy, so sánh dải, Z-score...).
 *
 * Đầu ra theo cấu trúc DTO thống nhất (VII & XI trong đặc tả):
 *   {
 *     phoneId,
 *     dataSource: "SIMULATED" | "REAL_VERIFIED",
 *     newPrice: { status: NO_DATA | SINGLE_PRICE | RANGE, ... },   // GĐ1
 *     usedPrice: { status: NO_DATA | INSUFFICIENT_DATA | RANGE, ... }, // GĐ2
 *     reliability,
 *     listingPrice,
 *     positionLabel: BELOW_RANGE | IN_RANGE | ABOVE_RANGE | UNKNOWN,
 *     positionText,
 *     showReviewPrompt,
 *     reviewDirection: LOW_PRICE | HIGH_PRICE | null,
 *     promptTitle, promptBody,
 *     generatedAt,
 *   }
 */

import { PRICING_CONFIG } from "./pricingConfig.js";
import {
  normalizeSeedTransaction,
  buildUsedRange,
  compareToRange,
  evaluateListing,
} from "./pricingEngine.js";
import { buildNewPrice } from "./storePrices.js";
import { makeDemoVolume } from "./demoVolume.js";

/**
 * Dựng tập bản ghi chi tiết từ giao dịch seed + tin đăng.
 * Kèm khối lượng mô phỏng cho `demoPhones` để minh hoạ dải giá.
 */
export function buildDetailSet({ transactions = [], listings = [], demoPhones = [] } = {}) {
  const phoneById = (id) => listings.find((p) => p.id === id) || null;
  const details = transactions.map((t) => normalizeSeedTransaction(t, phoneById));

  for (const dp of demoPhones) {
    const phone = phoneById(dp.phoneId) || {};
    details.push(
      ...makeDemoVolume({
        phoneId: dp.phoneId,
        model: dp.model ?? phone.model,
        storage: dp.storage ?? phone.storage,
        condition: phone.condition,
        batteryHealth: phone.batteryHealth,
        repairHistory: phone.repairHistory,
        color: phone.colorName,
        basePrice: dp.basePrice ?? phone.price ?? 9500000,
        count: dp.count ?? 35,
        sellerNames: dp.sellerNames,
        now: dp.now,
      })
    );
  }
  return details;
}

/**
 * Tính đầu ra giá tham khảo cho một tin đăng.
 * `certSnapshot`: nếu có, ghép nhóm đúng 4/4 tiêu chí Condition Score.
 */
export function getReferencePrice(phone, opts = {}) {
  const {
    details = [],
    now = new Date(),
    config = PRICING_CONFIG,
    role = "buyer",
    matchSnapshot = null,
  } = opts;

  const usedPrice = buildUsedRange(details, { now, config, matchSnapshot });
  const newPrice = buildNewPrice(phone, { now, config });
  const listingPrice = Number(phone?.price);
  // Giao diện chỉ ĐỌC kết quả đánh giá; engine quyết định nhãn + lời nhắc.
  const evaluation = evaluateListing(usedPrice, listingPrice, config, role);

  return {
    phoneId: phone?.id,
    dataSource: usedPrice.provenance || newPrice.provenance || "SIMULATED",
    dataProvenance: usedPrice.provenance || newPrice.provenance || "SIMULATED",
    newPrice,
    usedPrice,
    reliability: usedPrice.reliability,
    listingPrice: Number.isFinite(listingPrice) ? listingPrice : null,
    positionLabel: evaluation.positionLabel,
    positionText: evaluation.positionText,
    showReviewPrompt: evaluation.showReviewPrompt,
    reviewDirection: evaluation.reviewDirection,
    promptTitle: evaluation.promptTitle,
    promptBody: evaluation.promptBody,
    // Tương thích tên cũ.
    listingPosition: evaluation.positionLabel,
    generatedAt: usedPrice.calculatedAt,
  };
}

/**
 * Giá tham khảo cho một "sản phẩm nháp" (dùng ở Bước 4 luồng đăng bán).
 * Lọc bản ghi theo model + dung lượng rồi ghép nhóm Condition Score.
 */
export function getReferenceForProduct(product, opts = {}) {
  const { details = [], now = new Date(), config = PRICING_CONFIG, role = "seller" } = opts;
  const model = product?.model;
  const storage = product?.storage;
  const scoped = details.filter(
    (d) => d.phone_snapshot?.model === model && d.phone_snapshot?.storage === storage
  );
  const snapshot = product?.snapshot || null;
  return getReferencePrice(
    {
      id: product?.id || "draft",
      model,
      storage,
      colorName: product?.colorName,
      price: product?.price,
    },
    { details: scoped, now, config, role, matchSnapshot: snapshot }
  );
}

export { compareToRange, evaluateListing };
