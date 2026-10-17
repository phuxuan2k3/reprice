/**
 * Chuyển dữ liệu backend sang đúng dạng các component hiện có đang dùng (`phone`, `reference`),
 * để nối API mà không phải viết lại giao diện. Chỉ đổi tên trường và nhãn tiếng Việt,
 * không tính toán giá ở đây.
 */
import { POSITION_TEXT, REVIEW_PROMPT } from "../data/pricingEngine";

export const APPEARANCE_LABEL = {
  EXCELLENT: "Rất tốt",
  GOOD: "Tốt",
  FAIR: "Khá",
  POOR: "Kém",
};

const ACCESSORY_LABEL = {
  BOX: "Hộp",
  CHARGER: "Củ sạc",
  CABLE: "Cáp sạc",
  EARPHONES: "Tai nghe",
  CASE: "Ốp lưng",
  OTHER: "Khác",
};

const WARRANTY_LABEL = {
  NONE: "Hết bảo hành",
  BRAND: "Còn bảo hành hãng",
  STORE: "Còn bảo hành cửa hàng",
  BOTH: "Còn bảo hành hãng và cửa hàng",
  UNKNOWN: "Không rõ",
};

const COLOR_HEX = {
  Đen: ["#1f2937", "#030712"],
  Trắng: ["#e5e7eb", "#9ca3af"],
  Xanh: ["#2563eb", "#1e3a8a"],
  "Xanh dương": ["#2563eb", "#1e3a8a"],
  "Xanh lá": ["#16a34a", "#14532d"],
  Xám: ["#6b7280", "#1f2937"],
  "Vàng gold": ["#d4a94f", "#8a6a1f"],
};

function minutesSince(iso) {
  if (!iso) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

function warrantyText(l) {
  if (!l.warrantyType) return "—";
  const base = WARRANTY_LABEL[l.warrantyType] || l.warrantyType;
  return l.warrantyUntil && ["BRAND", "STORE", "BOTH"].includes(l.warrantyType)
    ? `${base} đến ${l.warrantyUntil.split("-").reverse().join("/")}`
    : base;
}

/** ListingDetail/ListingSummary của API → `phone` của giao diện. */
export function toUiPhone(l) {
  const v = l.variant || {};
  const [color, colorDark] = COLOR_HEX[v.color] || ["#E53935", "#111827"];
  const c = l.condition || {};
  return {
    id: l.id,
    fromApi: true,
    brand: v.brand || "",
    model: v.modelName || "",
    storage: v.storageGb ? `${v.storageGb}GB` : "",
    colorName: v.color || null,
    color,
    colorDark,
    condition: APPEARANCE_LABEL[c.appearance] || "Chưa rõ",
    appearance: c.appearance,
    functionality: c.functionality,
    batteryHealth: c.batteryHealthPct ?? null,
    usageMonths: l.usageMonths,
    price: l.price,
    region: l.province,
    description: l.description,
    accessories: l.accessories?.length
      ? l.accessories.map((a) => ACCESSORY_LABEL[a.type] || a.type).join(", ")
      : "Không kèm phụ kiện",
    warranty: warrantyText(l),
    screenCondition: null,
    repairHistory: null,
    listingStatus: l.status,
    listedMinutesAgo: minutesSince(l.publishedAt),
    allowedActions: l.allowedActions || [],
    photoUrls: (l.photos || []).map((p) => p.url),
    seller: {
      id: l.seller.id,
      name: l.seller.fullName,
      rating: l.seller.sellerRating ?? undefined,
      deals: l.seller.reviewCount,
      joined: l.seller.joinedAt,
    },
  };
}

/**
 * PriceReference của API → `reference` mà ReferencePricePanel đang đọc.
 * `prices` là danh sách giá chốt của dải (GET /price-ranges/{versionId}), có thể rỗng.
 */
export function toUiReference(ref, prices = []) {
  if (!ref) return null;
  const np = ref.newPrice;
  const single = np.status === "SINGLE_PRICE";
  const newPrice = {
    status: np.status,
    lowerPrice: single ? null : np.lowerPrice,
    upperPrice: single ? null : np.upperPrice,
    singlePrice: single ? np.lowerPrice : null,
    sourcesCount: np.sources.length,
    verifiedAt: np.sources.map((s) => s.verifiedAt).sort().at(-1) || null,
    sources: np.sources.map((s, i) => ({
      id: `${s.retailer}-${i}`,
      sourceName: s.retailer,
      listedPrice: s.price,
    })),
  };

  const up = ref.usedPrice;
  const hasRange = up.status === "RANGE" || up.status === "SINGLE_PRICE";
  const usedPrice = {
    // Panel chỉ biết RANGE; một mức giá (P10 = P90) vẫn vẽ như dải hai đầu trùng nhau.
    status: hasRange ? "RANGE" : up.status,
    lowerPrice: up.lowerPrice,
    upperPrice: up.upperPrice,
    count: up.transactionCount,
    minTransactions: up.minTransactions,
    windowMonths: up.windowMonths,
    dateRange: up.periodStart ? { from: up.periodStart, to: up.periodEnd } : null,
    prices,
  };

  const role = ref.viewerRole === "SELLER" ? "seller" : "buyer";
  const prompt = ref.showReviewPrompt && ref.reviewDirection ? REVIEW_PROMPT[role][ref.reviewDirection] : null;
  return {
    viewerRole: ref.viewerRole,
    listingPrice: ref.price,
    dataSource: up.dataSource,
    newPrice,
    usedPrice,
    positionLabel: ref.positionLabel || "UNKNOWN",
    positionText: POSITION_TEXT[ref.positionLabel] || POSITION_TEXT.UNKNOWN,
    showReviewPrompt: !!prompt,
    reviewDirection: ref.reviewDirection,
    promptTitle: prompt?.title || null,
    promptBody: prompt?.body || null,
  };
}

/** So khớp khu vực dù viết khác nhau ("TP.HCM" và "TP. Hồ Chí Minh", "Hà Nội" và "Thành phố Hà Nội"). */
export function sameRegion(a, b) {
  const norm = (s) => {
    const n = String(s || "")
      .toLowerCase()
      .replace(/thành phố|tỉnh|tp\.?|[\s.]/g, "");
    return n === "hcm" ? "hồchíminh" : n;
  };
  return !!a && !!b && norm(a) === norm(b);
}
