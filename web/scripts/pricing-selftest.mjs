/**
 * KIỂM THỬ ENGINE GIÁ THAM KHẢO — chạy bằng `node scripts/pricing-selftest.mjs`.
 *
 * Phủ 26 ca theo đặc tả: GĐ1 (0/1/nhiều giá), GĐ2 (34 vs 35, cửa sổ 3/6/12,
 * độ tin cậy, biên P10/P90, zero stddev, Z-score, trùng, trả hàng, tranh chấp,
 * mô phỏng vs thật, thu hồi tính lại, thiếu Condition Score, tập trung seller,
 * thiếu dữ liệu, ngưỡng chưa cấu hình, mốc 3 ngày hậu giao hàng).
 *
 * Không phụ thuộc React. Không sửa dữ liệu thật.
 */

import { PRICING_CONFIG, missingThresholds } from "../src/data/pricingConfig.js";
import {
  type7Percentile,
  isDetailEligible,
  dedupeDetails,
  missingConditionScore,
  computeReliability,
  buildUsedRange,
  compareToRange,
  priceCheckPrompt,
} from "../src/data/pricingEngine.js";
import { buildNewPrice } from "../src/data/storePrices.js";
import { getReferencePrice } from "../src/data/pricingApi.js";
import {
  referenceDataStatus,
  sampleStats,
  withinWindow,
} from "../src/data/pricingEngine.js";
import {
  makeDemoFixtureDetails,
  evaluateDemoCase,
  DEMO_CASES,
} from "../src/data/demoFixture.js";
import { computeClusters, RELATION_TYPE } from "../src/data/clusterEngine.js";
import {
  computeSuspicionFlags,
  computeAllSuspicionFlags,
  FLAG_CODE,
} from "../src/data/suspicionFlags.js";

const NOW = new Date("2026-10-16T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail = "") {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(`${name}${detail ? " — " + detail : ""}`);
  }
}

function mk(i, o = {}) {
  return {
    transaction_detail_id: `TXD-${i}`,
    order_id: `DH-${i}`,
    listing_id: "P001",
    buyer_id: `B${i % 10}`,
    seller_id: `S${i % 3}`,
    phone_snapshot: {
      model: "iPhone 13",
      storage: "128GB",
      condition: "Tốt",
      batteryHealth: 89,
      appearance: "Tốt",
      functionality: "full",
      repairHistory: "none",
    },
    listing_price: 10000000,
    agreed_price: 9000000 + (i % 5) * 100000,
    actual_paid_price: 9000000 + (i % 5) * 100000,
    shipping_fee: 0,
    payment_status: "PAID",
    delivery_status: "DELIVERED",
    after_delivery_status: "OK",
    return_status: "NONE",
    refund_status: "NONE",
    dispute_status: "NONE",
    data_provenance: "SIMULATED",
    price_data_status: "VERIFIED",
    transaction_date: "2026-09-15",
    delivered_at: "2026-09-15",
    eligible_at: null,
    created_at: "2026-09-15",
    updated_at: "2026-09-15",
    cluster_id: null,
    suspicion_flags: [],
    history: [],
    ...o,
  };
}

const series = (n, o = {}) => Array.from({ length: n }, (_, i) => mk(i + 1, o));

/* ============================ GĐ1 ============================ */

// 1) GĐ1: 0 nguồn -> NO_DATA
check("GĐ1-01 0 giá -> NO_DATA", buildNewPrice({ model: "Pixel 9", storage: "128GB" }, { now: NOW }).status === "NO_DATA");

// 2) GĐ1: 1 nguồn độc lập -> SINGLE_PRICE
check(
  "GĐ1-02 1 giá -> SINGLE_PRICE",
  buildNewPrice({ model: "iPhone 14", storage: "128GB", colorName: "Xanh" }, { now: NOW }).status === "SINGLE_PRICE"
);

// 3) GĐ1: nhiều nguồn độc lập -> RANGE (loại chi nhánh cùng chuỗi, KM có điều kiện, hết hàng, quá 24h)
const np1 = buildNewPrice({ model: "iPhone 13", storage: "128GB", colorName: "Đen" }, { now: NOW });
check("GĐ1-03 nhiều giá -> RANGE", np1.status === "RANGE", np1.status);
check("GĐ1-03b chỉ tính 2 chuỗi độc lập", np1.sourcesCount === 2, String(np1.sourcesCount));
check("GĐ1-03c KHÔNG yêu cầu tối thiểu 3 nguồn", np1.lowerPrice === 12490000 && np1.upperPrice === 12790000, `${np1.lowerPrice}-${np1.upperPrice}`);

/* ============================ GĐ2 — ngưỡng 35 ============================ */

// 4) GĐ2: 34 giao dịch -> INSUFFICIENT_DATA
const r34 = buildUsedRange(series(34), { now: NOW });
check("GĐ2-04 34 giao dịch -> INSUFFICIENT_DATA", r34.status === "INSUFFICIENT_DATA", r34.status);

// 5) GĐ2: đúng 35 -> RANGE
const r35 = buildUsedRange(series(35), { now: NOW });
check("GĐ2-05 đúng 35 -> RANGE", r35.status === "RANGE", r35.status);
check("GĐ2-05b đủ 35 dùng cửa sổ 3 tháng", r35.windowMonths === 3, String(r35.windowMonths));
check("GĐ2-05c count = 35", r35.count === 35, String(r35.count));

/* ====================== GĐ2 — cửa sổ cuốn chiếu ====================== */

// 6) cửa sổ 3 tháng
check("GĐ2-06 cửa sổ 3 tháng", buildUsedRange(series(40, { transaction_date: "2026-09-15" }), { now: NOW }).windowMonths === 3);

// 7) cửa sổ 6 tháng (dữ liệu ~4 tháng trước)
const r6 = buildUsedRange(series(36, { transaction_date: "2026-06-15", delivered_at: "2026-06-15" }), { now: NOW });
check("GĐ2-07 cửa sổ 6 tháng", r6.windowMonths === 6, String(r6.windowMonths));

// 8) cửa sổ 12 tháng (dữ liệu ~8 tháng trước)
const r12 = buildUsedRange(series(36, { transaction_date: "2026-02-15", delivered_at: "2026-02-15" }), { now: NOW });
check("GĐ2-08 cửa sổ 12 tháng", r12.windowMonths === 12, String(r12.windowMonths));

// 9) đủ 35 nhưng KHÔNG đạt tin cậy (ngưỡng tập trung người bán cấu hình 50%)
const cfgConc = { ...PRICING_CONFIG, maxSellerConcentration: 0.5 };
const rConc = buildUsedRange(series(35, { seller_id: "S1" }), { now: NOW, config: cfgConc });
check("GĐ2-09 tập trung seller -> reliability WEAK", rConc.reliability.status === "WEAK", rConc.reliability.status);
check("GĐ2-09b ghi nhận mức tập trung trong metrics", rConc.reliability.metrics.topSellerShare === 1, String(rConc.reliability.metrics.topSellerShare));

/* ====================== GĐ2 — biên P10/P90, Z-score ====================== */

// 10) biên P10/P90: bằng đúng biên -> IN_RANGE
check("GĐ2-10 giá = P10 -> IN_RANGE", compareToRange(r35.lowerPrice, r35) === "IN_RANGE");
check("GĐ2-10b giá = P90 -> IN_RANGE", compareToRange(r35.upperPrice, r35) === "IN_RANGE");
check("GĐ2-10c dưới P10 -> BELOW_RANGE", compareToRange(r35.lowerPrice - 1, r35) === "BELOW_RANGE");
check("GĐ2-10d trên P90 -> ABOVE_RANGE", compareToRange(r35.upperPrice + 1, r35) === "ABOVE_RANGE");

// 11) zero stddev -> không chia 0, không nhắc (dù đã cấu hình ngưỡng)
const rSame = buildUsedRange(series(35, { actual_paid_price: 9000000, agreed_price: 9000000 }), { now: NOW });
const cfgZ = { ...PRICING_CONFIG, zThreshold: 2 };
check("GĐ2-11 zero stddev -> không nhắc", priceCheckPrompt(rSame, 9000000, cfgZ, "buyer") === null);

// 12) Z vượt ngưỡng -> nhắc đúng chiều
const outlier = [...series(34, { actual_paid_price: 9000000 }), mk(99, { actual_paid_price: 20000000 })];
const rOut = buildUsedRange(outlier, { now: NOW });
const promptHigh = priceCheckPrompt(rOut, 20000000, cfgZ, "seller");
check("GĐ2-12 Z vượt ngưỡng -> nhắc HIGH", promptHigh && promptHigh.side === "HIGH", promptHigh ? promptHigh.side : "null");

// 13) Z chưa vượt -> không nhắc
check("GĐ2-13 Z chưa vượt -> không nhắc", priceCheckPrompt(rOut, 9000000, cfgZ, "buyer") === null);

/* ====================== GĐ2 — trùng / trả / tranh chấp ====================== */

// 14) trùng theo transaction_detail_id
const dup = dedupeDetails([mk(1), mk(1)]);
check("GĐ2-14 trùng detail id -> loại", dup.items.length === 1 && dup.duplicateCount === 1);

// 15) cùng model + cùng giá nhưng khác bản ghi -> GIỮ CẢ HAI
const same = dedupeDetails([mk(1, { actual_paid_price: 9000000 }), mk(2, { actual_paid_price: 9000000 })]);
check("GĐ2-15 cùng model+giá -> giữ cả hai", same.items.length === 2);

// 16) một máy bị trả -> loại khỏi tập
check("GĐ2-16 máy bị trả -> không hợp lệ", !isDetailEligible(mk(1, { return_status: "RETURNED" }), NOW).eligible);

// 17) tranh chấp -> loại
check("GĐ2-17 tranh chấp -> không hợp lệ", !isDetailEligible(mk(1, { dispute_status: "OPEN" }), NOW).eligible);

/* ====================== GĐ2 — nguồn mô phỏng vs thật ====================== */

// 18) KHÔNG trộn SIMULATED với REAL_VERIFIED (ưu tiên tập thật khi có)
const mixed = [
  ...series(35, { data_provenance: "SIMULATED" }),
  ...series(35, { id: undefined, transaction_detail_id: undefined, data_provenance: "REAL_VERIFIED" }).map((d, i) => ({ ...d, transaction_detail_id: `RXD-${i}` })),
];
const rMixed = buildUsedRange(mixed, { now: NOW });
check("GĐ2-18 không trộn nguồn; chọn REAL_VERIFIED", rMixed.provenance === "REAL_VERIFIED", rMixed.provenance);

/* ====================== GĐ2 — thu hồi tính lại ====================== */

// 19) thu hồi 2 bản ghi từ tập 35 -> còn 33 -> INSUFFICIENT
const revoked = buildUsedRange(series(33), { now: NOW });
check("GĐ2-19 thu hồi -> tính lại INSUFFICIENT", revoked.status === "INSUFFICIENT_DATA", revoked.status);

/* ====================== GĐ2 — Result khác ====================== */

// 20) thiếu Condition Score -> chưa ghép nhóm
check("GĐ2-20 thiếu Condition Score", missingConditionScore(mk(1, { phone_snapshot: { model: "iPhone 13", storage: "128GB" } })) === true);

// 21) tập trung một vài seller -> VẪN ghi mức tập trung (không tự kết luận loại)
const r21 = computeReliability(series(35, { seller_id: "S1" }), PRICING_CONFIG);
check("GĐ2-21 ghi mức tập trung dù chưa có ngưỡng", r21.metrics.topSellerShare === 1);

// 22) thiếu GĐ1 hoặc GĐ2 -> vẫn trả trạng thái rõ ràng, KHÔNG bịa dải
const refEmpty = getReferencePrice({ id: "PX", model: "Pixel 9", storage: "128GB" }, { details: [], now: NOW });
check("GĐ2-22 thiếu GĐ1 -> newPrice NO_DATA", refEmpty.newPrice.status === "NO_DATA");
check("GĐ2-22b thiếu GĐ2 -> usedPrice NO_DATA", refEmpty.usedPrice.status === "NO_DATA");

// 23) ngưỡng chưa cấu hình -> NOT_CONFIGURED + không nhắc Z
check("GĐ2-23 ngưỡng chưa cấu hình -> NOT_CONFIGURED", r35.reliability.status === "NOT_CONFIGURED", r35.reliability.status);
check("GĐ2-23b có danh sách ngưỡng còn thiếu", missingThresholds(PRICING_CONFIG).length >= 3);
check("GĐ2-23c Z chưa cấu hình -> không nhắc", priceCheckPrompt(r35, 9000000, PRICING_CONFIG, "buyer") === null);

/* ====================== mốc 3 ngày hậu giao hàng ====================== */

// 24) đúng 3 ngày -> hợp lệ
const exactly3 = mk(1, { delivered_at: new Date(NOW.getTime() - 3 * DAY).toISOString() });
check("GĐ2-24 đúng 3 ngày -> hợp lệ", isDetailEligible(exactly3, NOW).eligible);

// 25) chưa đủ 3 ngày -> không hợp lệ
const notYet = mk(1, { delivered_at: new Date(NOW.getTime() - (3 * DAY - 1)).toISOString() });
check("GĐ2-25 chưa đủ 3 ngày -> không hợp lệ", !isDetailEligible(notYet, NOW).eligible);

/* ====================== phân vị Type 7 ====================== */

// 26) Type 7 nội suy đúng
check("P10/P90 Type 7 nội suy", Math.abs(type7Percentile([1, 2, 3, 4], 10) - 1.3) < 1e-9 && Math.abs(type7Percentile([1, 2, 3, 4], 90) - 3.7) < 1e-9);

/* ================== FIXTURE 42 GIAO DỊCH + 3 CA DEMO ================== */

const fixture = makeDemoFixtureDetails({ now: NOW });
const rFix = buildUsedRange(fixture, { now: NOW });
check("FIX-01 fixture có đúng 42 giao dịch", fixture.length === 42, String(fixture.length));
check(
  "FIX-02 mã chi tiết duy nhất",
  new Set(fixture.map((d) => d.transaction_detail_id)).size === 42
);
check("FIX-03 fixture -> RANGE", rFix.status === "RANGE", rFix.status);
check("FIX-04 P10 = 10.000.000", rFix.lowerPrice === 10000000, String(rFix.lowerPrice));
check("FIX-05 P90 = 12.000.000", rFix.upperPrice === 12000000, String(rFix.upperPrice));
check("FIX-06 dùng cửa sổ 3 tháng", rFix.windowMonths === 3, String(rFix.windowMonths));
check("FIX-07 đếm đủ 42", rFix.count === 42, String(rFix.count));
check("FIX-08 fixture là SIMULATED", rFix.provenance === "SIMULATED", rFix.provenance);
const fixStats = sampleStats(rFix.prices);
check("FIX-09 độ lệch chuẩn mẫu > 0", fixStats.sd > 0, String(fixStats.sd));

// Ba ca demo bắt buộc (zThreshold chưa thiết lập).
const cIn = evaluateDemoCase("in_range", { now: NOW });
const cBelow = evaluateDemoCase("below_range", { now: NOW });
const cAbove = evaluateDemoCase("above_range", { now: NOW });
check("DEMO-01 trong khoảng -> IN_RANGE", cIn.positionLabel === "IN_RANGE", cIn.positionLabel);
check("DEMO-02 trong khoảng -> không nhắc", cIn.showReviewPrompt === false);
check("DEMO-03 dưới khoảng -> BELOW_RANGE", cBelow.positionLabel === "BELOW_RANGE", cBelow.positionLabel);
check("DEMO-04 dưới khoảng + zThreshold null -> không nhắc", cBelow.showReviewPrompt === false);
check("DEMO-05 trên khoảng -> ABOVE_RANGE", cAbove.positionLabel === "ABOVE_RANGE", cAbove.positionLabel);
check("DEMO-06 trên khoảng + zThreshold null -> không nhắc", cAbove.showReviewPrompt === false);
check("DEMO-07 nội dung nhãn đúng nguyên văn", cBelow.positionText === "Dưới khoảng giá lịch sử", cBelow.positionText);

// Khi zThreshold được cấu hình -> lời nhắc theo đúng chiều.
const cfgZ1 = { ...PRICING_CONFIG, zThreshold: 1 };
const bZ = evaluateDemoCase("below_range", { now: NOW, config: cfgZ1 });
const aZ = evaluateDemoCase("above_range", { now: NOW, config: cfgZ1 });
check("DEMO-08 Z vượt ngưỡng thấp -> LOW_PRICE", bZ.reviewDirection === "LOW_PRICE", String(bZ.reviewDirection));
check("DEMO-09 LOW_PRICE có tiêu đề đúng", bZ.promptTitle === "Gợi ý trước khi quyết định", String(bZ.promptTitle));
check("DEMO-10 Z vượt ngưỡng cao -> HIGH_PRICE", aZ.reviewDirection === "HIGH_PRICE", String(aZ.reviewDirection));
check("DEMO-10b HIGH_PRICE có tiêu đề đúng", aZ.promptTitle === "Gợi ý trước khi quyết định", String(aZ.promptTitle));
check("DEMO-11 trong khoảng không bao giờ nhắc", evaluateDemoCase("in_range", { now: NOW, config: cfgZ1 }).showReviewPrompt === false);

/* ========================= TRẠNG THÁI THAM CHIẾU ========================= */

check("REF-01 đủ điều kiện -> ELIGIBLE", referenceDataStatus(fixture[0], NOW).status === "ELIGIBLE");
check(
  "REF-02 thu hồi -> REVOKED",
  referenceDataStatus({ ...fixture[0], review_decision: "REVOKE" }, NOW).status === "REVOKED"
);
check(
  "REF-03 không sử dụng -> EXCLUDED",
  referenceDataStatus({ ...fixture[0], review_decision: "EXCLUDE" }, NOW).status === "EXCLUDED"
);
check(
  "REF-04 chờ xác minh -> PENDING_VERIFICATION",
  referenceDataStatus({ ...fixture[0], review_decision: "PENDING" }, NOW).status === "PENDING_VERIFICATION"
);
// "Cho phép sử dụng" KHÔNG bỏ qua điều kiện 3 ngày hậu giao hàng.
const tooSoon = mk(500, {
  review_decision: "ALLOW",
  delivered_at: new Date(NOW.getTime() - 1 * DAY).toISOString(),
});
check(
  "REF-05 ALLOW không bỏ qua điều kiện 3 ngày",
  referenceDataStatus(tooSoon, NOW).status === "PENDING_COMPLETION",
  referenceDataStatus(tooSoon, NOW).status
);
// Trạng thái tham chiếu tách biệt: đổi review_decision không đổi orderStatus.
const sepDetail = { ...fixture[0], order_status: "DELIVERED", review_decision: "REVOKE" };
check(
  "REF-06 không đổi trạng thái đơn hàng",
  referenceDataStatus(sepDetail, NOW).status === "REVOKED" && sepDetail.order_status === "DELIVERED"
);

/* ========================== BIÊN THỜI GIAN ========================== */

check("TIME-01 đúng endTime (now) -> tính", withinWindow(NOW, NOW, 3) === true);
check("TIME-02 sau endTime -> không tính", withinWindow(new Date(NOW.getTime() + 1000), NOW, 3) === false);
const start3 = new Date(NOW.getTime());
start3.setMonth(start3.getMonth() - 3);
check("TIME-03 đúng startTime (3 tháng) -> tính", withinWindow(start3, NOW, 3) === true);
check(
  "TIME-04 trước startTime -> không tính",
  withinWindow(new Date(start3.getTime() - 1000), NOW, 3) === false
);

/* ============================== GOM CỤM ============================== */

const snapC = {
  model: "iPhone 13",
  storage: "128GB",
  condition: "Tốt",
  appearance: "Tốt",
  functionality: "full",
  batteryHealth: 89,
  repairHistory: "none",
};
const cA = mk(201, { buyer_id: "BX", seller_id: "SX", phone_snapshot: snapC });
const cB = mk(202, { buyer_id: "BX", seller_id: "SY", phone_snapshot: snapC });
const cC = mk(203, { buyer_id: "BY", seller_id: "SY", phone_snapshot: snapC });
const cl = computeClusters([cA, cB, cC], { now: NOW });
check("CL-01 A–B–C cùng một cụm liên thông", cl.clusters.length === 1 && cl.clusters[0].memberIds.length === 3);
check(
  "CL-02 có cạnh SAME_BUYER và SAME_SELLER",
  cl.edges.some((e) => e.relationType === RELATION_TYPE.SAME_BUYER) &&
    cl.edges.some((e) => e.relationType === RELATION_TYPE.SAME_SELLER)
);
const cD = mk(204, { buyer_id: "BZ", seller_id: "SZ", phone_snapshot: snapC });
const cE = mk(205, { buyer_id: "BW", seller_id: "SW", phone_snapshot: snapC });
const cl2 = computeClusters([cD, cE], { now: NOW });
check("CL-03 cùng model/giá KHÔNG tạo quan hệ", cl2.edges.length === 0);
check("CL-04 tách cụm riêng", cl2.clusters.length === 2 && cl2.clusters.every((c) => c.memberIds.length === 1));
const cl3 = computeClusters([cD, cE, mk(206, { buyer_id: "BZ", seller_id: "SW", phone_snapshot: snapC })], { now: NOW });
check("CL-05 tính lại khi quan hệ thay đổi", cl3.clusters.length === 1 && cl3.clusters[0].memberIds.length === 3);
check("CL-06 không tạo cluster rỗng", cl3.clusters.every((c) => c.memberIds.length > 0));
check(
  "CL-07 mỗi bản ghi chỉ một cluster_id",
  new Set([...cl3.assignments.values()]).size === cl3.clusters.length
);

/* ============================ CỜ NGHI VẤN ============================ */

const flagsHigh = computeSuspicionFlags(fixture[41], { allDetails: fixture });
check("FLAG-01 giá cao KHÔNG tự gắn cờ", flagsHigh.length === 0, JSON.stringify(flagsHigh));
const flagsLow = computeSuspicionFlags(fixture[0], { allDetails: fixture });
check("FLAG-02 giá thấp KHÔNG tự gắn cờ", flagsLow.length === 0);
const flagsPay = computeSuspicionFlags(
  mk(300, { delivery_status: "DELIVERED", payment_status: "UNPAID", payment_method: "QR" }),
  {}
);
check(
  "FLAG-03 giao hàng nhưng chưa thanh toán -> cờ",
  flagsPay.some((f) => f.code === FLAG_CODE.PAYMENT_DELIVERY_CONTRADICTION)
);
const flagsSame = computeSuspicionFlags(mk(301, { buyer_id: "X", seller_id: "X" }), {});
check("FLAG-04 mua–bán cùng chủ thể -> cờ", flagsSame.some((f) => f.code === FLAG_CODE.BUYER_SELLER_SAME_SUBJECT));
const flagsRet = computeSuspicionFlags(mk(302, { eligible_at: "2026-09-01", return_status: "RETURNED" }), {});
check("FLAG-05 từng đủ điều kiện rồi bị trả -> cờ", flagsRet.some((f) => f.code === FLAG_CODE.ELIGIBLE_THEN_RETURNED));
const flagsDup = computeSuspicionFlags(
  mk(303, { actual_paid_price: 9000000 }),
  { allDetails: [mk(303, { actual_paid_price: 9000000 }), mk(303, { actual_paid_price: 11000000 })] }
);
check("FLAG-06 cùng mã chi tiết khác giá -> cờ", flagsDup.some((f) => f.code === FLAG_CODE.DUPLICATE_DETAIL_CONFLICT));
const allFlags = computeAllSuspicionFlags(fixture);
check("FLAG-07 fixture sạch không gắn cờ", allFlags.size === 0, String(allFlags.size));

/* ============================== KẾT QUẢ ============================== */
console.log(`\nKết quả kiểm thử engine giá tham khảo: ${pass} đạt, ${fail} lỗi.\n`);
if (fail) {
  console.log("Các ca lỗi:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
