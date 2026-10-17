/**
 * Đổi dữ liệu wizard đăng tin (CreateListingPage) sang ListingInput / PreviewInput của backend.
 * Giữ nguyên nhãn tiếng Việt trên giao diện; chỉ đổi sang mã trạng thái ở đây.
 */
const APPEARANCE = { "Xuất sắc": "EXCELLENT", Tốt: "GOOD", "Trung bình": "FAIR", Kém: "POOR" };
const FUNCTIONALITY = { full: "FULL", errors: "HAS_FAULTS", partial: "NOT_FULLY_CHECKED" };
const SEVERITY = { "Vẫn hoạt động nhưng có vấn đề": "DEGRADED", "Không hoạt động": "NOT_WORKING" };
const NETWORK_LOCK = { "Không khóa mạng": "UNLOCKED", "Có khóa mạng": "LOCKED", "Không rõ": "UNKNOWN" };
const ACCESSORY = { Hộp: "BOX", "Củ sạc": "CHARGER", "Cáp sạc": "CABLE", "Tai nghe": "EARPHONES", "Ốp lưng": "CASE", Khác: "OTHER" };
const WARRANTY = { manufacturer: "BRAND", store: "STORE", both: "BOTH", none: "NONE", unknown: "UNKNOWN" };

const storageGb = (s) => parseInt(String(s || "").replace(/\D/g, ""), 10) || null;
const priceOf = (s) => parseInt(String(s || "").replace(/\D/g, ""), 10) || null;
const colorOf = (c) => (c && c !== "Không rõ" ? c : null);

export function variantSpec(data, modelId) {
  return { modelId, storageGb: storageGb(data.storage), ramGb: null, color: colorOf(data.color) };
}

export function conditionInput(data) {
  const c = {
    appearance: APPEARANCE[data.appearance] || null,
    functionality: FUNCTIONALITY[data.functionality] || null,
  };
  if (data.battery?.mode === "percent" && data.battery.percent !== "") {
    c.batteryHealthPct = parseInt(data.battery.percent, 10);
  } else if (data.battery?.mode === "text") {
    c.batteryStatusText = data.battery.text || "Không rõ";
  } else if (data.battery?.mode === "unknown") {
    c.batteryStatusText = "Không xem được";
  }
  if (data.functionality === "errors") {
    c.faults = (data.errors || []).map((e) => ({
      component: e.key === "Lỗi khác" && e.otherDesc ? `Lỗi khác: ${e.otherDesc}` : e.key,
      severity: SEVERITY[e.severity] || "DEGRADED",
      note: "",
    }));
    if (data.restChecked) c.remainingChecked = data.restChecked === "Đã kiểm tra";
  } else {
    c.faults = [];
  }
  return c;
}

/** PreviewInput cho bước nhập giá; null khi chưa đủ model và dung lượng. */
export function previewInput(data, modelId) {
  if (!modelId || !storageGb(data.storage)) return null;
  return { variant: variantSpec(data, modelId), condition: conditionInput(data), price: priceOf(data.price) };
}

/** ListingInput đầy đủ khi bấm Đăng tin. usageMonths: số tháng đã tính sẵn (null = không rõ). */
export function listingInput(data, modelId, usageMonths) {
  const w = data.warranty || {};
  const storeUntil = w.store && !w.store.unknownDate ? w.store.expiry : "";
  const brandUntil = w.manufacturer && !w.manufacturer.unknownDate ? w.manufacturer.expiry : "";
  const accessories = (data.accessories || [])
    .filter((a) => a !== "Không có" && ACCESSORY[a])
    .map((a) => ({ type: ACCESSORY[a], note: a === "Khác" ? (data.otherAccessory || "").trim() : "" }));
  return {
    variant: variantSpec(data, modelId),
    networkLock: NETWORK_LOCK[data.networkLock] || "UNKNOWN",
    condition: conditionInput(data),
    usageMonths: usageMonths ?? undefined,
    accessories,
    warrantyType: WARRANTY[w.type] || "UNKNOWN",
    warrantyUntil: (w.type === "store" ? storeUntil : brandUntil || storeUntil) || "",
    warrantyStore: w.type === "store" || w.type === "both" ? [w.store?.name, w.store?.address].filter(Boolean).join(", ") : "",
    description: (data.description || "").trim(),
    price: priceOf(data.price),
    province: data.region?.province || "",
    ward: (data.region?.ward || "").trim(),
    contactPhone: (data.contactPhone || "").trim(),
    draftStep: 5,
  };
}
