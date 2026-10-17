/**
 * FIXTURE DEMO 42 GIAO DỊCH + BA TRƯỜNG HỢP DEMO BẮT BUỘC.
 *
 * Sản phẩm: iPhone 13, 128GB, màu đen — cùng nhóm 4/4 Condition Score.
 * Giá máy mới (GĐ1): 13–14 triệu. Dải máy cũ (GĐ2): P10 = 10.000.000, P90 =
 * 12.000.000 với đúng 42 giao dịch (phân vị Type 7, cửa sổ 3 tháng).
 *
 * Dữ liệu dưới đây là MÔ PHỎNG (`data_provenance: "SIMULATED"`) — KHÔNG phải
 * giao dịch thật và KHÔNG bao giờ được trộn vào tập REAL_VERIFIED.
 *
 * Vì sao 42 giá này cho đúng P10/P90? (n = 42, Type 7: h = 1 + (n-1)·p)
 *   - p = 0.10 -> h = 5.1 -> Q = x5 + 0.1·(x6 - x5). Đặt x5 = x6 = 10.000.000.
 *   - p = 0.90 -> h = 37.9 -> Q = x37 + 0.9·(x38 - x37). Đặt x37 = x38 = 12.000.000.
 * (x_j là giá trị thứ j theo thứ tự 1-based.)
 */

import { buildUsedRange, evaluateListing } from "./pricingEngine.js";
import { buildNewPrice } from "./storePrices.js";
import { PRICING_CONFIG } from "./pricingConfig.js";

export const FIXTURE_MODEL = "iPhone 13";
export const FIXTURE_STORAGE = "128GB";
export const FIXTURE_COLOR = "Đen";

/** 42 mức giá chốt (đã sắp tăng dần) cho ra P10 = 10tr, P90 = 12tr. */
export const FIXTURE_PRICES = [
  8900000, 9200000, 9500000, 9800000, // 4 giá trị dưới P10
  10000000, 10000000, // x5, x6 -> P10 = 10.000.000
  ...Array.from({ length: 30 }, (_, i) => 10100000 + i * 60000), // 10.1tr..11.84tr
  12000000, 12000000, // x37, x38 -> P90 = 12.000.000
  12200000, 12400000, 12600000, 12800000, // 4 giá trị trên P90
];

const DAY = 24 * 60 * 60 * 1000;
const isoDate = (d) => new Date(d).toISOString().slice(0, 10);

const BUYERS = ["B01", "B02", "B03", "B04", "B05", "B06"];
const SELLERS = ["S01", "S02", "S03"];

/**
 * Sinh 42 bản ghi chi tiết MÔ PHỎNG, mỗi máy một mã chi tiết riêng.
 * Ngày giao dịch trải trong ~80 ngày gần đây (nằm trong cửa sổ 3 tháng).
 */
export function makeDemoFixtureDetails(opts = {}) {
  const now = opts.now || new Date();
  const model = opts.model || FIXTURE_MODEL;
  const storage = opts.storage || FIXTURE_STORAGE;
  const color = opts.color || FIXTURE_COLOR;
  const snapshot = {
    model,
    storage,
    condition: "Tốt",
    color,
    batteryHealth: 89,
    appearance: "Tốt",
    functionality: "Đã kiểm tra, hoạt động đầy đủ",
    repairHistory: "Chưa từng sửa chữa hoặc thay linh kiện",
    usageMonths: 12,
  };

  return FIXTURE_PRICES.map((price, i) => {
    const daysAgo = 3 + Math.round((i / (FIXTURE_PRICES.length - 1)) * 78); // 3..81 ngày
    const txDate = new Date(now.getTime() - daysAgo * DAY);
    const sellerId = SELLERS[i % SELLERS.length];
    const buyerId = BUYERS[i % BUYERS.length];
    return {
      transaction_detail_id: `TXD-FX-${String(i + 1).padStart(3, "0")}`,
      order_id: `DH-FX-${String(i + 1).padStart(3, "0")}`,
      listing_id: opts.listingId || null,
      buyer_id: buyerId,
      seller_id: sellerId,
      buyer_name: buyerId,
      seller_name: sellerId,
      phone_snapshot: { ...snapshot },
      listing_price: 11500000,
      agreed_price: price,
      actual_paid_price: price,
      shipping_fee: 0,
      payment_method: "QR",
      payment_status: "PAID",
      delivery_status: "DELIVERED",
      after_delivery_status: "OK",
      return_status: "NONE",
      refund_status: "NONE",
      dispute_status: "NONE",
      data_provenance: "SIMULATED",
      price_data_status: "VERIFIED",
      reference_status: "ELIGIBLE",
      transaction_date: isoDate(txDate),
      delivered_at: isoDate(txDate),
      eligible_at: isoDate(new Date(txDate.getTime() + 3 * DAY)),
      created_at: isoDate(txDate),
      updated_at: isoDate(txDate),
      cluster_id: null,
      suspicion_flags: [],
      history: [],
    };
  });
}

/** Điều kiện Condition Score của fixture (để đối chiếu ghép nhóm 4/4). */
export const FIXTURE_SNAPSHOT = {
  model: FIXTURE_MODEL,
  storage: FIXTURE_STORAGE,
  condition: "Tốt",
  color: FIXTURE_COLOR,
  batteryHealth: 89,
  appearance: "Tốt",
  functionality: "Đã kiểm tra, hoạt động đầy đủ",
  repairHistory: "Chưa từng sửa chữa hoặc thay linh kiện",
};

/** Ba trường hợp demo bắt buộc. */
export const DEMO_CASES = [
  {
    key: "in_range",
    label: "Trong khoảng",
    listingPrice: 11500000,
    expectedPosition: "IN_RANGE",
    expectedPrompt: false,
  },
  {
    key: "below_range",
    label: "Dưới khoảng",
    listingPrice: 9200000,
    expectedPosition: "BELOW_RANGE",
    expectedPrompt: false, // zThreshold chưa thiết lập
  },
  {
    key: "above_range",
    label: "Trên khoảng",
    listingPrice: 12800000,
    expectedPosition: "ABOVE_RANGE",
    expectedPrompt: false, // zThreshold chưa thiết lập
  },
];

/**
 * Chạy một trường hợp demo: trả kết quả GĐ1 + GĐ2 + đánh giá vị trí giá.
 * Dùng đúng engine (không tính lại ở giao diện).
 */
export function evaluateDemoCase(key, opts = {}) {
  const now = opts.now || new Date();
  const config = opts.config || PRICING_CONFIG;
  const role = opts.role || "buyer";
  const theCase = DEMO_CASES.find((c) => c.key === key) || DEMO_CASES[0];
  const details = opts.details || makeDemoFixtureDetails({ now });
  const usedPrice = buildUsedRange(details, { now, config });
  const newPrice = buildNewPrice(
    { model: FIXTURE_MODEL, storage: FIXTURE_STORAGE, colorName: FIXTURE_COLOR, price: theCase.listingPrice },
    { now, config }
  );
  const evaluation = evaluateListing(usedPrice, theCase.listingPrice, config, role);
  return {
    case: theCase,
    listingPrice: theCase.listingPrice,
    newPrice,
    usedPrice,
    ...evaluation,
  };
}

/** Danh sách gọn để hiển thị trong chế độ demo. */
export function demoCaseSummaries(opts = {}) {
  return DEMO_CASES.map((c) => {
    const r = evaluateDemoCase(c.key, opts);
    return {
      key: c.key,
      label: c.label,
      listingPrice: c.listingPrice,
      positionLabel: r.positionLabel,
      positionText: r.positionText,
      showReviewPrompt: r.showReviewPrompt,
      reviewDirection: r.reviewDirection,
      promptTitle: r.promptTitle,
      promptBody: r.promptBody,
      newPriceStatus: r.newPrice.status,
      usedPriceStatus: r.usedPrice.status,
      lowerPrice: r.usedPrice.lowerPrice,
      upperPrice: r.usedPrice.upperPrice,
      count: r.usedPrice.count,
      windowMonths: r.usedPrice.windowMonths,
    };
  });
}
