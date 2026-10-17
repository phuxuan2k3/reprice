/**
 * GIAI ĐOẠN 1 — GIÁ MÁY MỚI TỪ NGUỒN CỬA HÀNG.
 *
 * QUY TẮC (theo đặc tả):
 *  - Chỉ lấy giá NIÊM YẾT còn hàng; KHÔNG lấy giá khuyến mãi có điều kiện.
 *  - Đúng model + dung lượng + cấu hình; phân biệt màu khi giá khác nhau.
 *  - Giá phải được xác minh trong vòng `newPriceMaxAgeHours` giờ.
 *  - Chi nhánh CÙNG MỘT CHUỖI không tính là nguồn độc lập.
 *  - KHÔNG yêu cầu tối thiểu 3 nguồn; KHÔNG áp quy tắc 35 giao dịch / Condition
 *    Score / Z-score của GĐ2.
 *
 * DỮ LIỆU: toàn bộ nguồn dưới đây là MÔ PHỎNG (SIMULATED), KHÔNG phải giá thật
 * của bất kỳ cửa hàng nào. Chỉ phục vụ minh hoạ đồ án.
 */

import { PRICING_CONFIG } from "./pricingConfig.js";
import { parseDate, toISODate } from "./pricingEngine.js";

/** Nguồn giá máy mới (mô phỏng). `chainId` gộp chi nhánh cùng chuỗi. */
export const STORE_PRICES = [
  // iPhone 13 128GB (P001) — hai chuỗi độc lập -> có dải
  {
    id: "SP001",
    chainId: "CH-A",
    sourceName: "CellphoneS (mô phỏng)",
    branch: "Quận 1, TP.HCM",
    model: "iPhone 13",
    storage: "128GB",
    color: "Đen",
    listedPrice: 12490000,
    inStock: true,
    promotional: false,
    promotionalConditions: null,
    verifiedAt: "2026-10-16T08:00:00",
  },
  {
    id: "SP002",
    chainId: "CH-A",
    sourceName: "CellphoneS (mô phỏng)",
    branch: "Cầu Giấy, Hà Nội",
    model: "iPhone 13",
    storage: "128GB",
    color: "Đen",
    listedPrice: 12590000,
    inStock: true,
    promotional: false,
    promotionalConditions: null,
    verifiedAt: "2026-10-16T08:30:00",
  },
  {
    id: "SP003",
    chainId: "CH-B",
    sourceName: "FPT Shop (mô phỏng)",
    branch: "Đà Nẵng",
    model: "iPhone 13",
    storage: "128GB",
    color: "Đen",
    listedPrice: 12790000,
    inStock: true,
    promotional: false,
    promotionalConditions: null,
    verifiedAt: "2026-10-16T09:10:00",
  },
  {
    id: "SP004",
    chainId: "CH-C",
    sourceName: "Viettel Store (mô phỏng)",
    branch: "Hà Nội",
    model: "iPhone 13",
    storage: "128GB",
    color: "Đen",
    listedPrice: 12990000,
    inStock: false, // hết hàng -> loại
    promotional: false,
    promotionalConditions: null,
    verifiedAt: "2026-10-16T09:00:00",
  },
  {
    id: "SP005",
    chainId: "CH-D",
    sourceName: "Shop khuyến mãi (mô phỏng)",
    branch: "TP.HCM",
    model: "iPhone 13",
    storage: "128GB",
    color: "Đen",
    listedPrice: 10990000,
    inStock: true,
    promotional: true,
    promotionalConditions: "Giá chỉ áp dụng khi thu cũ đổi mới + mua kèm gói bảo hiểm", // có điều kiện -> loại
    verifiedAt: "2026-10-16T09:20:00",
  },
  {
    id: "SP006",
    chainId: "CH-E",
    sourceName: "Đại lý cũ (mô phỏng)",
    branch: "Hà Nội",
    model: "iPhone 13",
    storage: "128GB",
    color: "Đen",
    listedPrice: 11990000,
    inStock: true,
    promotional: false,
    promotionalConditions: null,
    verifiedAt: "2026-10-10T09:00:00", // quá 24h -> loại
  },

  // iPhone 14 128GB (P003) — chỉ một chuỗi -> SINGLE_PRICE
  {
    id: "SP010",
    chainId: "CH-A",
    sourceName: "CellphoneS (mô phỏng)",
    branch: "TP.HCM",
    model: "iPhone 14",
    storage: "128GB",
    color: "Xanh",
    listedPrice: 15990000,
    inStock: true,
    promotional: false,
    promotionalConditions: null,
    verifiedAt: "2026-10-16T08:05:00",
  },
];

/**
 * Lọc + dựng giá máy mới cho một tin đăng.
 * Trả { status: "NO_DATA" | "SINGLE_PRICE" | "RANGE", provenance, sources, ... }.
 */
export function buildNewPrice(phone, opts = {}) {
  const now = opts.now || new Date();
  const config = opts.config || PRICING_CONFIG;
  const provenance = "SIMULATED";

  if (!phone?.model || !phone?.storage) {
    return emptyNewPrice(provenance, now);
  }

  const base = STORE_PRICES.filter(
    (s) => s.model === phone.model && s.storage === phone.storage
  );

  // Phân biệt màu khi giá khác nhau giữa các màu.
  let candidates = base;
  const byColor = new Map();
  for (const s of base) {
    if (!byColor.has(s.color)) byColor.set(s.color, new Set());
    byColor.get(s.color).add(s.listedPrice);
  }
  const colorPricesDiffer =
    byColor.size > 1 &&
    new Set([...byColor.values()].map((set) => [...set][0])).size > 1;
  if (colorPricesDiffer && phone.colorName) {
    candidates = base.filter((s) => s.color === phone.colorName);
  }

  const maxAgeMs = config.newPriceMaxAgeHours * 60 * 60 * 1000;
  const usable = candidates.filter((s) => {
    if (!s.inStock) return false;
    if (s.promotionalConditions) return false; // giá khuyến mãi có điều kiện
    const v = parseDate(s.verifiedAt);
    if (!v) return false;
    return now.getTime() - v.getTime() <= maxAgeMs;
  });

  // Mỗi CHUỖI chỉ tính một nguồn độc lập (chi nhánh cùng chuỗi không độc lập).
  const perChain = new Map();
  for (const s of usable) {
    const cur = perChain.get(s.chainId);
    if (!cur || s.listedPrice < cur.listedPrice) perChain.set(s.chainId, s);
  }
  const sources = [...perChain.values()];

  if (sources.length === 0) return emptyNewPrice(provenance, now);

  const prices = sources.map((s) => s.listedPrice);
  const verifiedAt = sources
    .map((s) => s.verifiedAt)
    .sort()
    .slice(-1)[0];

  if (sources.length === 1) {
    return {
      status: "SINGLE_PRICE",
      provenance,
      singlePrice: sources[0].listedPrice,
      lowerPrice: null,
      upperPrice: null,
      sources,
      sourcesCount: 1,
      verifiedAt,
      calculatedAt: toISODate(now),
    };
  }

  return {
    status: "RANGE",
    provenance,
    lowerPrice: Math.min(...prices),
    upperPrice: Math.max(...prices),
    singlePrice: null,
    sources,
    sourcesCount: sources.length,
    verifiedAt,
    calculatedAt: toISODate(now),
  };
}

function emptyNewPrice(provenance, now) {
  return {
    status: "NO_DATA",
    provenance,
    lowerPrice: null,
    upperPrice: null,
    singlePrice: null,
    sources: [],
    sourcesCount: 0,
    verifiedAt: null,
    calculatedAt: toISODate(now),
  };
}
