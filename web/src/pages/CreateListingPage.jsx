import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import Button from "../components/Button";
import AccessNotice from "../components/AccessNotice";
import DataBadge from "../components/DataBadge";
import StatusBadge from "../components/StatusBadge";
import ProgressBar from "../components/wizard/ProgressBar";
import HelpModal from "../components/wizard/HelpModal";
import OptionCard from "../components/wizard/OptionCard";
import PhotoManager from "../components/wizard/PhotoManager";
import {
  CATALOG_BRANDS,
  RAM_OPTIONS,
  APPEARANCE_LEVELS,
  getErrorOptions,
  ACCESSORY_OPTIONS,
  STANDARD_COLORS,
} from "../data/catalog";
import { PROVINCES } from "../data/regions";
import { formatVND, formatUsageMonths, normalizeMonths } from "../utils/format";
import ReferencePricePanel from "../components/ReferencePricePanel";
import { useCatalog } from "../api/useCatalog";
import { sellerApi } from "../api/client";
import { listingInput, previewInput } from "../api/listingInput";
import { toUiReference } from "../api/adapters";

/* ----------------------------- Hằng số ------------------------------ */

const DRAFT_KEY = "reprice_seller_draft";
const DRAFT_VERSION = 1;
const CATALOG_REQUESTS_KEY = "reprice_catalog_requests";

const SCREEN = {
  BRAND: "brand",
  MODEL: "model",
  MODEL_NOT_FOUND: "model-not-found",
  STORAGE: "storage",
  RAM: "ram",
  COLOR: "color",
  NETWORK_LOCK: "network-lock",
  APPEARANCE: "appearance",
  FUNCTIONALITY: "functionality",
  ERROR_LIST: "error-list",
  ERROR_SEVERITY: "error-severity",
  REST_CHECKED: "rest-checked",
  BATTERY: "battery",
  USAGE_TIME: "usage-time",
  PHOTOS: "photos",
  ACCESSORIES: "accessories",
  WARRANTY: "warranty",
  WARRANTY_MANUFACTURER: "warranty-manufacturer",
  WARRANTY_STORE: "warranty-store",
  DESCRIPTION: "description",
  PRICE: "price",
  REGION: "region",
  REGION_PROVINCE: "region-province",
  REGION_WARD: "region-ward",
  CONTACT: "contact",
  REVIEW: "review",
  CATALOG_REQUESTED: "catalog-requested",
  SUCCESS: "success",
};

const STEP_OF_SCREEN = {
  [SCREEN.BRAND]: 0,
  [SCREEN.MODEL]: 0,
  [SCREEN.MODEL_NOT_FOUND]: 0,
  [SCREEN.STORAGE]: 0,
  [SCREEN.RAM]: 0,
  [SCREEN.COLOR]: 0,
  [SCREEN.NETWORK_LOCK]: 0,
  [SCREEN.APPEARANCE]: 1,
  [SCREEN.FUNCTIONALITY]: 1,
  [SCREEN.ERROR_LIST]: 1,
  [SCREEN.ERROR_SEVERITY]: 1,
  [SCREEN.REST_CHECKED]: 1,
  [SCREEN.BATTERY]: 1,
  [SCREEN.USAGE_TIME]: 1,
  [SCREEN.PHOTOS]: 2,
  [SCREEN.ACCESSORIES]: 2,
  [SCREEN.WARRANTY]: 2,
  [SCREEN.WARRANTY_MANUFACTURER]: 2,
  [SCREEN.WARRANTY_STORE]: 2,
  [SCREEN.DESCRIPTION]: 2,
  [SCREEN.PRICE]: 3,
  [SCREEN.REGION]: 3,
  [SCREEN.REGION_PROVINCE]: 3,
  [SCREEN.REGION_WARD]: 3,
  [SCREEN.CONTACT]: 3,
  [SCREEN.REVIEW]: 4,
  [SCREEN.SUCCESS]: 4,
};

const FUNCTIONALITY_OPTIONS = [
  { key: "full", label: "Đã kiểm tra, hoạt động đầy đủ" },
  { key: "errors", label: "Có lỗi" },
  { key: "partial", label: "Chưa kiểm tra đầy đủ" },
];

const NETWORK_LOCK_OPTIONS = [
  "Không khóa mạng",
  "Có khóa mạng",
  "Không rõ",
];

const BATTERY_TEXT_OPTIONS = null; // Prototype chưa có dữ liệu trạng thái chữ theo model

const WARRANTY_OPTIONS = [
  { key: "manufacturer", label: "Còn bảo hành hãng" },
  { key: "store", label: "Còn bảo hành cửa hàng" },
  { key: "both", label: "Còn cả hai" },
  { key: "none", label: "Hết bảo hành" },
  { key: "unknown", label: "Không rõ" },
];

const APPEARANCE_TO_CONDITION = {
  "Xuất sắc": "Rất tốt",
  Tốt: "Tốt",
  "Trung bình": "Khá",
  Kém: "Khá",
};

const isPhoneValid = (v) =>
  /^(0[35789]\d{8,9}|84[35789]\d{8,9})$/.test(
    (v || "").replace(/[\s.-]/g, "")
  );

const formatPriceInput = (value) =>
  (value || "")
    .replace(/\D/g, "")
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const emptyDraft = () => ({
  brand: null,
  model: null,
  storage: null,
  ram: null,
  color: null,
  networkLock: null,
  appearance: null,
  functionality: null,
  errors: [],
  otherErrorDesc: "",
  restChecked: null,
  battery: { mode: null, percent: "", text: null },
  usage: { years: "", months: "", unknown: false },
  photos: [],
  accessories: [],
  otherAccessory: "",
  warranty: {
    type: null,
    manufacturer: { expiry: "", unknownDate: false },
    store: { name: "", address: "", expiry: "", unknownDate: false },
  },
  description: "",
  price: "",
  region: { province: null, ward: "" },
  contactPhone: "",
  confirmed: false,
  catalogRequested: false,
});

/** Tóm tắt cấu hình đã xác định (chúng hiện giá trị đã xác nhận). */
function configSummary(d) {
  const parts = [d.brand, d.model, d.storage, d.ram && d.ram !== "Không rõ" ? `${d.ram} RAM` : null]
    .filter(Boolean);
  return parts.join(" · ") || "Chưa có thông tin";
}

export default function CreateListingPage() {
  const { user, loginAs, showToast, region, apiSession } = useApp();
  const navigate = useNavigate();

  const [screen, setScreen] = useState(SCREEN.BRAND);
  const [data, setData] = useState(emptyDraft);
  const [history, setHistory] = useState([]);
  const [errors, setErrors] = useState({});
  const [help, setHelp] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [modelQuery, setModelQuery] = useState("");
  const [provinceQuery, setProvinceQuery] = useState("");
  const [customColor, setCustomColor] = useState("");
  const [customColorMode, setCustomColorMode] = useState(false);
  const [returnToReview, setReturnToReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [publishedId, setPublishedId] = useState(null);
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const [errorListSel, setErrorListSel] = useState([]);
  const [severityIdx, setSeverityIdx] = useState(0);
  const [oldRegion, setOldRegion] = useState(null);

  const fileRef = useRef(null);
  // Tin nháp đã tạo trên backend và ảnh đã tải, để bấm Đăng lại sau lỗi không tạo tin trùng.
  const backendDraftRef = useRef({ id: null, uploaded: new Set() });

  /* ------------- Khôi phục bản nháp (1 lần khi mount) ------------- */
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== DRAFT_VERSION) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }
      const restored = { ...emptyDraft(), ...parsed.data };
      // Ảnh object URL không tồn tại sau tải lại -> đánh dấu ảnh cũ
      restored.photos = (restored.photos || []).map((p) => ({
        ...p,
        status: "stale",
        objectUrl: null,
        file: null,
      }));
      setData(restored);
      setScreen(parsed.screen || SCREEN.BRAND);
      setDraftSavedAt(parsed.updatedAt || null);
      if (restored.catalogRequested) {
        setScreen(SCREEN.CATALOG_REQUESTED);
      }
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, []);

  /* ---------------------- Điều hướng ---------------------- */

  const goTo = (next, replace = false) => {
    setHistory((h) => (replace ? h : [...h, screen]));
    setScreen(next);
    setErrors({});
  };

  const goBack = () => {
    setHistory((h) => {
      const prev = h[h.length - 1];
      if (prev) {
        setScreen(prev);
        setErrors({});
      }
      return h.slice(0, -1);
    });
  };

  const update = (patch) => setData((d) => ({ ...d, ...patch }));

  const saveDraft = (silent = false) => {
    try {
      const toSave = {
        ...data,
        photos: data.photos.map(({ file, objectUrl, ...rest }) => rest),
      };
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          version: DRAFT_VERSION,
          updatedAt: new Date().toISOString(),
          screen,
          data: toSave,
        })
      );
      setDraftSavedAt(new Date().toISOString());
      if (!silent) showToast("Đã lưu bản nháp.");
    } catch {
      showToast("Lưu bản nháp thất bại — trình duyệt không cho phép lưu.", "error");
    }
  };

  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* bỏ qua */
    }
    setDraftSavedAt(null);
  };

  /* ------------- Xử lý theo màn hình ------------- */

  // Danh mục lấy từ backend: chỉ cho chọn model / dung lượng / màu có trong danh mục.
  const catalog = useCatalog(data.brand, data.model);
  const models = catalog.modelNames;
  const filteredModels = useMemo(
    () =>
      models.filter((m) =>
        m.toLowerCase().includes(modelQuery.trim().toLowerCase())
      ),
    [models, modelQuery]
  );
  const storages = catalog.storages;
  const colors = catalog.colors;

  /**
   * Lựa chọn màu hiển thị: bộ màu chuẩn + màu có sẵn trong danh mục (giữ tương
   * thích dữ liệu cũ). "Không rõ" và "Khác" được thêm riêng ở giao diện.
   */
  const colorOptions = useMemo(() => {
    const extra = colors.filter((c) => !STANDARD_COLORS.includes(c));
    return [...STANDARD_COLORS, ...extra];
  }, [colors]);

  /** Màu hiện tại là màu tự nhập (không thuộc bộ chuẩn/danh mục). */
  const isCustomColor =
    customColorMode ||
    (!!data.color &&
      data.color !== "Không rõ" &&
      !colorOptions.includes(data.color));

  /** Đổi hãng: xác nhận xóa dữ liệu phụ thuộc. */
  const onSelectBrand = (brand) => {
    if (data.brand === brand) return;
    const deps = [data.model, data.storage, data.ram, data.color].filter(Boolean);
    if (deps.length > 0) {
      setConfirm({
        title: "Đổi hãng?",
        body: `Các thông tin phụ thuộc sau sẽ phải chọn lại: ${deps.join(
          ", "
        )}. Dữ liệu khác được giữ nguyên.`,
        confirmLabel: "Đồng ý đổi hãng",
        onConfirm: () => {
          update({
            brand,
            model: null,
            storage: null,
            ram: null,
            color: null,
          });
          goTo(SCREEN.MODEL);
        },
      });
      return;
    }
    update({ brand });
    goTo(SCREEN.MODEL);
  };

  /** Đổi model: xác nhận xóa dữ liệu phụ thuộc. */
  const onSelectModel = (model) => {
    if (data.model === model) return;
    const deps = [data.storage, data.ram, data.color].filter(Boolean);
    if (deps.length > 0) {
      setConfirm({
        title: "Đổi model?",
        body: `Các thông tin phụ thuộc sau sẽ phải chọn lại: ${deps.join(
          ", "
        )}. Dữ liệu khác được giữ nguyên.`,
        confirmLabel: "Đồng ý đổi model",
        onConfirm: () => {
          update({ model, storage: null, ram: null, color: null });
          goTo(SCREEN.STORAGE);
        },
      });
      return;
    }
    update({ model });
    goTo(SCREEN.STORAGE);
  };

  const onSelectStorage = (storage) => {
    update({ storage });
    // Danh mục chưa có dữ liệu RAM -> luôn hỏi RAM (cho phép "Không rõ")
    goTo(SCREEN.RAM);
  };

  const onSelectRam = (ram) => {
    update({ ram });
    goTo(SCREEN.COLOR);
  };

  const onSelectColor = (color) => {
    update({ color });
    goTo(SCREEN.NETWORK_LOCK);
  };

  const onSelectNetworkLock = (lock) => {
    update({ networkLock: lock });
    if (returnToReview) {
      setReturnToReview(false);
      goTo(SCREEN.REVIEW);
    } else {
      goTo(SCREEN.APPEARANCE);
    }
  };

  /* ----- Bước 2: tình trạng ----- */

  const onSelectAppearance = (level) => {
    update({ appearance: level });
    goTo(SCREEN.FUNCTIONALITY);
  };

  const onSelectFunctionality = (key) => {
    update({ functionality: key });
    if (key === "errors") {
      setErrorListSel(data.errors.map((e) => e.key));
      goTo(SCREEN.ERROR_LIST);
      return;
    }
    if (key === "full" && data.errors.length > 0) {
      setConfirm({
        title: "Xóa danh sách lỗi?",
        body: "Bạn vừa chọn “Đã kiểm tra, hoạt động đầy đủ”. Danh sách lỗi và mức độ lỗi trước đó sẽ bị xóa.",
        confirmLabel: "Xóa danh sách lỗi",
        onConfirm: () => {
          update({ errors: [], otherErrorDesc: "" });
          goTo(SCREEN.BATTERY);
        },
        onCancel: () => {
          // Giữ nguyên lựa chọn và dữ liệu cũ
          update({ functionality: "errors" });
        },
      });
      return;
    }
    goTo(SCREEN.BATTERY);
  };

  const onConfirmErrorList = () => {
    const errs = {};
    if (errorListSel.length === 0) {
      errs.errorList = "Vui lòng chọn ít nhất một lỗi.";
    }
    if (
      errorListSel.includes("Lỗi khác") &&
      !data.otherErrorDesc.trim()
    ) {
      errs.otherErrorDesc = "Vui lòng mô tả lỗi khác.";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    // Giữ mức độ của các lỗi còn lại; lỗi mới chưa có mức độ
    const prevByKey = new Map(data.errors.map((e) => [e.key, e]));
    const next = errorListSel.map((key) => {
      const prev = prevByKey.get(key);
      if (prev) return prev;
      return {
        key,
        severity: null,
        otherDesc: key === "Lỗi khác" ? data.otherErrorDesc.trim() : null,
      };
    });
    update({ errors: next });
    setSeverityIdx(0);
    goTo(SCREEN.ERROR_SEVERITY);
  };

  const currentError = data.errors[severityIdx];

  const onSelectSeverity = (severity) => {
    const next = data.errors.map((e, i) =>
      i === severityIdx ? { ...e, severity } : e
    );
    update({ errors: next });
    // Tìm lỗi tiếp theo chưa có mức độ
    const nextIdx = next.findIndex((e) => e.severity === null);
    if (nextIdx === -1) {
      goTo(SCREEN.REST_CHECKED);
    } else {
      setSeverityIdx(nextIdx);
    }
  };

  const onSelectRestChecked = (value) => {
    update({ restChecked: value });
    goTo(SCREEN.BATTERY);
  };

  /* ----- Pin ----- */

  const onBatteryMode = (mode) => {
    // Chỉ lưu dữ liệu của cách khai hiện tại, không lưu dữ liệu mâu thuẫn
    if (mode === "percent") {
      update({ battery: { mode, percent: data.battery.percent, text: null } });
    } else if (mode === "text") {
      update({ battery: { mode, percent: "", text: data.battery.text } });
    } else {
      update({ battery: { mode: "unknown", percent: "", text: null } });
      goTo(SCREEN.USAGE_TIME);
      return;
    }
    setScreen(SCREEN.BATTERY);
  };

  const onBatteryPercentContinue = () => {
    const p = parseInt(data.battery.percent, 10);
    if (!data.battery.percent.trim()) {
      setErrors({ battery: "Vui lòng nhập sức khỏe pin." });
      return;
    }
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      setErrors({ battery: "Sức khỏe pin phải là số từ 0 đến 100." });
      return;
    }
    goTo(SCREEN.USAGE_TIME);
  };

  const onBatteryTextContinue = () => {
    // Prototype chưa có dữ liệu trạng thái chữ theo model
    setErrors({
      battery:
        "Dữ liệu hướng dẫn hiện tại không có trạng thái chữ cho model này. Hãy nhập số phần trăm hoặc chọn “Không xem được”.",
    });
  };

  /* ----- Thời gian sử dụng ----- */

  /** Tổng số tháng sử dụng từ dữ liệu đã khai (null nếu không rõ hoặc không hợp lệ). */
  const usageMonthsOf = (u) => {
    if (!u || u.unknown) return null;
    const y = u.years === "" || u.years === undefined ? 0 : normalizeMonths(u.years);
    const m = u.months === "" || u.months === undefined ? 0 : normalizeMonths(u.months);
    if (y === null || m === null || m > 11) return null;
    return y * 12 + m;
  };

  /** Thông điệp lỗi phần thời gian sử dụng, hoặc null nếu hợp lệ. */
  const usageErrorOf = (u) => {
    if (!u || u.unknown) return null;
    const yRaw = String(u.years ?? "").trim();
    const mRaw = String(u.months ?? "").trim();
    if (!yRaw && !mRaw) {
      return "Vui lòng nhập thời gian sử dụng hoặc chọn “Không rõ”.";
    }
    if (yRaw && !/^\d+$/.test(yRaw)) return "Số năm phải là số nguyên không âm.";
    if (mRaw && !/^\d+$/.test(mRaw)) return "Số tháng phải là số nguyên không âm.";
    const m = mRaw ? parseInt(mRaw, 10) : 0;
    if (m > 11) {
      return "Số tháng phải từ 0 đến 11 (từ 12 tháng trở lên, hãy ghi vào ô Năm).";
    }
    const total = (yRaw ? parseInt(yRaw, 10) : 0) * 12 + m;
    if (total <= 0) return "Thời gian sử dụng phải lớn hơn 0.";
    return null;
  };

  const onUsageContinue = () => {
    const errs = {};
    if (data.usage.unknown) {
      update({ usage: { years: "", months: "", unknown: true } });
      goTo(SCREEN.PHOTOS);
      return;
    }
    const msg = usageErrorOf(data.usage);
    if (msg) errs.usage = msg;
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    goTo(SCREEN.PHOTOS);
  };

  /* ----- Bước 3 ----- */

  const onPhotosContinue = () => {
    const ready = data.photos.filter((p) => p.status === "ready").length;
    if (ready === 0) {
      setErrors({ photos: "Cần ít nhất 1 ảnh thực tế của máy." });
      return;
    }
    goTo(SCREEN.ACCESSORIES);
  };

  const onToggleAccessory = (acc) => {
    if (acc === "Không có") {
      update({ accessories: ["Không có"], otherAccessory: "" });
      return;
    }
    let next = data.accessories.filter((a) => a !== "Không có");
    if (next.includes(acc)) {
      next = next.filter((a) => a !== acc);
    } else {
      next = [...next, acc];
    }
    if (!next.includes("Khác")) {
      update({ accessories: next, otherAccessory: "" });
    } else {
      update({ accessories: next });
    }
  };

  const onConfirmAccessories = () => {
    const errs = {};
    if (data.accessories.length === 0) {
      errs.accessories = "Vui lòng chọn phụ kiện hoặc chọn “Không có”.";
    }
    if (
      data.accessories.includes("Khác") &&
      !data.otherAccessory.trim()
    ) {
      errs.otherAccessory = "Vui lòng nhập tên phụ kiện khác.";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    goTo(SCREEN.WARRANTY);
  };

  const onSelectWarranty = (type) => {
    update({
      warranty: { ...data.warranty, type },
    });
    if (type === "manufacturer") {
      goTo(SCREEN.WARRANTY_MANUFACTURER);
    } else if (type === "store") {
      goTo(SCREEN.WARRANTY_STORE);
    } else if (type === "both") {
      goTo(SCREEN.WARRANTY_MANUFACTURER);
    } else {
      // Hết bảo hành / Không rõ: xóa dữ liệu bảo hành phụ thuộc
      update({
        warranty: {
          type,
          manufacturer: { expiry: "", unknownDate: false },
          store: { name: "", address: "", expiry: "", unknownDate: false },
        },
      });
      goTo(SCREEN.DESCRIPTION);
    }
  };

  const onManufacturerWarrantyContinue = () => {
    const errs = {};
    const m = data.warranty.manufacturer;
    if (!m.expiry.trim() && !m.unknownDate) {
      errs.warrantyExpiry = "Chọn ngày hết hạn hoặc “Không rõ ngày”.";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (data.warranty.type === "both") {
      goTo(SCREEN.WARRANTY_STORE);
    } else {
      goTo(SCREEN.DESCRIPTION);
    }
  };

  const onStoreWarrantyContinue = () => {
    const errs = {};
    const s = data.warranty.store;
    if (!s.name.trim()) errs.storeName = "Vui lòng nhập tên cửa hàng.";
    if (!s.address.trim()) errs.storeAddress = "Vui lòng nhập địa chỉ nơi bảo hành.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    // Sau khi nhập tên/địa chỉ -> hỏi ngày hết hạn ngay tại màn hình này
    if (!s.expiry.trim() && !s.unknownDate) {
      setErrors({ ...errs, warrantyStoreExpiry: "Chọn ngày hết hạn hoặc “Không rõ ngày”." });
      return;
    }
    goTo(SCREEN.DESCRIPTION);
  };

  const onDescriptionContinue = () => {
    if (returnToReview) {
      setReturnToReview(false);
      goTo(SCREEN.REVIEW);
    } else {
      goTo(SCREEN.PRICE);
    }
  };

  /* ----- Bước 4 ----- */

  const onPriceContinue = () => {
    const raw = (data.price || "").replace(/\./g, "");
    const errs = {};
    if (!raw) {
      errs.price = "Vui lòng nhập giá bán.";
    } else if (!/^\d+$/.test(raw)) {
      errs.price = "Giá bán phải là số nguyên.";
    } else if (parseInt(raw, 10) <= 0) {
      errs.price = "Giá bán phải lớn hơn 0.";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    goTo(SCREEN.REGION);
  };

  /**
   * Giá tham khảo cho tin đăng nháp (Bước 4).
   * Gọi engine theo model + dung lượng đang chọn; UI CHỈ hiển thị kết quả.
   * Khi giá thay đổi, engine được gọi lại để cập nhật vị trí dấu giá + nhãn.
   */
  const [draftReference, setDraftReference] = useState(null);
  const previewKey = JSON.stringify(previewInput(data, catalog.modelId));
  useEffect(() => {
    const input = JSON.parse(previewKey);
    if (!input || !user) {
      setDraftReference(null);
      return;
    }
    let alive = true;
    // Chờ người bán gõ xong giá rồi mới hỏi backend.
    const t = setTimeout(() => {
      sellerApi
        .preview(input)
        .then((ref) => alive && setDraftReference(toUiReference(ref)))
        .catch(() => alive && setDraftReference(null));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [previewKey, user, apiSession]);

  /** Phát hiện tỉnh/thành từ địa chỉ tài khoản. */
  const accountProvince = useMemo(() => {
    const addr = user?.address || region || "";
    const found = PROVINCES.find((r) => addr.includes(r));
    return found || null;
  }, [user, region]);

  const accountWard = useMemo(() => {
    const addr = user?.address || "";
    const province = accountProvince;
    if (!province) return addr || "";
    return addr.replace(province, "").replace(/^[,\s]+/, "").replace(/[,\s]+$/, "");
  }, [user, accountProvince]);

  const onConfirmRegion = () => {
    if (!accountProvince) {
      // Tài khoản chưa có tỉnh/thành rõ ràng -> bắt buộc chọn
      goTo(SCREEN.REGION_PROVINCE);
      return;
    }
    update({
      region: {
        province: accountProvince,
        ward: accountWard,
      },
    });
    // Địa chỉ tài khoản chỉ có tỉnh/thành: hỏi thêm phường/xã thay vì để trống đến bước xem lại.
    goTo(accountWard.trim() ? SCREEN.CONTACT : SCREEN.REGION_WARD);
  };

  const onSelectProvince = (province) => {
    update({ region: { ...data.region, province } });
    goTo(SCREEN.REGION_WARD);
  };

  const onWardContinue = () => {
    if (!data.region.ward.trim()) {
      setErrors({ ward: "Vui lòng nhập phường/xã." });
      return;
    }
    goTo(SCREEN.CONTACT);
  };

  const onConfirmContact = () => {
    const errs = {};
    // Ô hiển thị sẵn số của tài khoản khi người bán chưa sửa: dùng luôn số đó.
    const contactPhone = (data.contactPhone || user?.phone || "").trim();
    if (contactPhone !== data.contactPhone) update({ contactPhone });
    if (!contactPhone) {
      errs.contact = "Vui lòng nhập số điện thoại liên hệ.";
    } else if (!isPhoneValid(contactPhone)) {
      errs.contact = "Số điện thoại chưa đúng định dạng (VD: 0909 123 456).";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (returnToReview) {
      setReturnToReview(false);
      goTo(SCREEN.REVIEW);
    } else {
      goTo(SCREEN.REVIEW);
    }
  };

  /* ----- Bước 5: xem lại & đăng tin ----- */

  const validateAll = () => {
    const errs = {};
    if (!data.brand) errs.brand = "Chưa chọn hãng.";
    if (!data.model) errs.model = "Chưa chọn model.";
    if (!data.storage) errs.storage = "Chưa chọn dung lượng.";
    if (!data.color) errs.color = "Chưa chọn màu.";
    if (!data.networkLock) errs.networkLock = "Chưa khai khóa mạng.";
    if (!data.appearance) errs.appearance = "Chưa khai ngoại hình.";
    if (!data.functionality) errs.functionality = "Chưa khai tình trạng chức năng.";
    if (data.functionality === "errors" && data.errors.length === 0) {
      errs.errors = "Chưa khai danh sách lỗi.";
    }
    if (data.functionality === "errors") {
      const missing = data.errors.some((e) => !e.severity);
      if (missing) errs.errors = "Còn lỗi chưa khai mức độ.";
    }
    if (data.battery.mode === "percent" &&
      (data.battery.percent === "" ||
        parseInt(data.battery.percent, 10) < 0 ||
        parseInt(data.battery.percent, 10) > 100)) {
      errs.battery = "Sức khỏe pin không hợp lệ.";
    }
    if (data.battery.mode === null) errs.battery = "Chưa khai sức khỏe pin.";
    const usageMsg = usageErrorOf(data.usage);
    if (usageMsg) errs.usage = usageMsg;
    const readyPhotos = data.photos.filter((p) => p.status === "ready").length;
    if (readyPhotos === 0) errs.photos = "Cần ít nhất 1 ảnh thực tế.";
    if (data.accessories.length === 0) errs.accessories = "Chưa chọn phụ kiện.";
    if (!data.warranty.type) errs.warranty = "Chưa khai bảo hành.";
    const priceRaw = (data.price || "").replace(/\./g, "");
    if (!priceRaw || parseInt(priceRaw, 10) <= 0) errs.price = "Giá bán không hợp lệ.";
    if (!data.region.province) errs.region = "Chưa chọn khu vực bán.";
    if (!data.region.ward.trim()) errs.region = "Chưa nhập phường/xã.";
    if (!isPhoneValid(data.contactPhone)) errs.contact = "Số điện thoại liên hệ không hợp lệ.";
    if (!data.confirmed) errs.confirmed = "Cần tích xác nhận khai báo.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onPublish = async () => {
    if (submitting) return;
    if (!validateAll()) {
      showToast("Còn thông tin chưa hợp lệ — xem chi tiết trong các khối.", "error");
      return;
    }
    if (!catalog.modelId) {
      showToast("Không tìm thấy model trong danh mục, vui lòng chọn lại.", "error");
      return;
    }
    setSubmitting(true);
    const draft = backendDraftRef.current;
    try {
      // 1. Lưu tin nháp lên backend, 2. tải ảnh (ảnh bìa trước), 3. đăng tin.
      const input = listingInput(data, catalog.modelId, usageMonthsOf(data.usage));
      if (draft.id) await sellerApi.update(draft.id, input);
      else draft.id = (await sellerApi.create(input)).id;
      const photos = data.photos
        .filter((p) => p.status === "ready" && p.file && !draft.uploaded.has(p.id))
        .sort((a, b) => Number(!!b.cover) - Number(!!a.cover));
      for (const p of photos) {
        await sellerApi.uploadPhoto(draft.id, p.file);
        draft.uploaded.add(p.id);
      }
      await sellerApi.publish(draft.id);
      const listingId = draft.id;
      backendDraftRef.current = { id: null, uploaded: new Set() };
      clearDraft();
      setPublishedId(listingId);
      setScreen(SCREEN.SUCCESS);
      showToast("Tin đã được đăng.");
    } catch (err) {
      const fields = err.details?.fields ? ` (${Object.values(err.details.fields).join("; ")})` : "";
      showToast(
        `${err.message}${fields}${draft.id ? " Tin đã được lưu nháp, bạn có thể thử đăng lại." : ""}`,
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  };

  /* ----- Nhánh yêu cầu bổ sung danh mục ----- */

  const onSendCatalogRequest = () => {
    const ready = data.photos.filter((p) => p.status === "ready").length;
    const errs = {};
    if (ready === 0) {
      errs.requestPhotos = "Cần tải ảnh máy và ảnh thông tin thiết bị.";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    try {
      const requests = JSON.parse(
        localStorage.getItem(CATALOG_REQUESTS_KEY) || "[]"
      );
      requests.push({
        id: `YC-${Date.now().toString(36).toUpperCase()}`,
        brand: data.brand,
        modelQuery: data.modelQuery || null,
        photoCount: ready,
        createdAt: new Date().toISOString(),
        status: "PENDING",
        simulated: true,
      });
      localStorage.setItem(
        CATALOG_REQUESTS_KEY,
        JSON.stringify(requests)
      );
    } catch {
      /* bỏ qua */
    }
    update({ catalogRequested: true });
    saveDraft(true);
    showToast("Yêu cầu đã được ghi nhận. Đang chờ kiểm tra (mô phỏng).");
    goTo(SCREEN.CATALOG_REQUESTED);
  };

  /* ---------------------- Render helpers ---------------------- */

  const NavButtons = ({ continueLabel = "Tiếp tục", onContinue, hideContinue = false }) => (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <Button type="button" variant="outline" onClick={goBack}>
        Quay lại
      </Button>
      <Button type="button" variant="ghost" onClick={() => saveDraft()}>
        Lưu bản nháp
      </Button>
      {!hideContinue && (
        <Button type="button" onClick={onContinue}>
          {continueLabel}
        </Button>
      )}
    </div>
  );

  const FieldError = ({ msg }) =>
    msg ? (
      <p className="mt-1.5 text-xs font-medium text-red-600">{msg}</p>
    ) : null;

  const SummaryBar = () => {
    const summary = configSummary(data);
    if (summary === "Chưa có thông tin") return null;
    return (
      <div className="mb-5 flex items-center gap-2 rounded-lg bg-brand-50 px-4 py-2.5 text-sm font-medium text-brand-700">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="7" y="2" width="10" height="20" rx="2.5" />
          <path d="M11 18h2" />
        </svg>
        Đã xác định: {summary}
      </div>
    );
  };

  const QuestionHeader = ({ stepLabel, title, desc }) => (
    <div className="mb-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-brand-500">
        {stepLabel}
      </div>
      <h2 className="mt-1 text-xl font-bold text-ink-900 md:text-2xl">
        {title}
      </h2>
      {desc && <p className="mt-1 text-sm text-ink-500">{desc}</p>}
    </div>
  );

  /* ---------------------- Render ---------------------- */

  if (!user) {
    return (
      <AccessNotice
        requiredRole="seller"
        requiredLabel="Người bán"
        title="Cần đăng nhập với vai trò Người bán"
        description="Để đăng bán điện thoại, bạn cần đăng nhập với vai trò Người bán."
        onLogin={() => loginAs("seller")}
      />
    );
  }
  if (user.role !== "seller") {
    return (
      <AccessNotice
        requiredRole="seller"
        requiredLabel="Người bán"
        title="Trang dành cho Người bán"
        description={`Bạn đang đăng nhập với vai trò ${user.role === "buyer" ? "Người mua" : "Người quản lý"}. Vui lòng chuyển sang vai trò Người bán để đăng bán.`}
        onLogin={() => loginAs("seller")}
      />
    );
  }

  const currentStep = STEP_OF_SCREEN[screen] ?? 0;

  return (
    <div className="container-x py-8">
      <div className="mx-auto max-w-3xl">
        {/* Header + progress */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink-900">
              Đăng bán điện thoại
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              Trả lời từng câu hỏi. Chỉ màn hình “Xem lại và đăng tin” hiển
              thị toàn bộ thông tin.
            </p>
          </div>
          <DataBadge />
        </div>
        <div className="mt-5">
          <ProgressBar currentStep={currentStep} />
        </div>
        {draftSavedAt && screen !== SCREEN.SUCCESS && (
          <p className="mt-2 text-xs text-ink-400">
            Bản nháp đã lưu: {new Date(draftSavedAt).toLocaleString("vi-VN")}
          </p>
        )}

        <div className="mt-6">
          {/* ==================== BƯỚC 1: CHỌN ĐIỆN THOẠI ==================== */}

          {screen === SCREEN.BRAND && (
            <div>
              <QuestionHeader
                stepLabel="Bước 1 · Chọn điện thoại"
                title="Bạn muốn bán điện thoại hãng nào?"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {CATALOG_BRANDS.map((b) => (
                  <OptionCard
                    key={b}
                    title={b}
                    selected={data.brand === b}
                    onClick={() => onSelectBrand(b)}
                  />
                ))}
              </div>
              <NavButtons hideContinue onContinue={() => {}} />
            </div>
          )}

          {screen === SCREEN.MODEL && (
            <div>
              <QuestionHeader
                stepLabel="Bước 1 · Chọn điện thoại"
                title="Điện thoại của bạn là model nào?"
                desc="Tìm và chọn model trong danh mục. Chỉ các model có trong danh sách tin đăng hiện tại mới được chọn."
              />
              <SummaryBar />
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1">
                  <input
                    className="input pr-10"
                    placeholder="Tìm model… (VD: iPhone 13)"
                    value={modelQuery}
                    onChange={(e) => setModelQuery(e.target.value)}
                    aria-label="Tìm kiếm model"
                  />
                  <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4.3-4.3" />
                  </svg>
                </div>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() =>
                    setHelp({
                      title: "Cách xem model",
                      body: (
                        <ul className="list-disc space-y-1 pl-5">
                          <li>Vào Cài đặt &gt; Cài đặt chung &gt; Giới thiệu (iOS) hoặc Cài đặt &gt; Giới thiệu điện thoại (Android).</li>
                          <li>Xem dòng “Model” hoặc “Tên model”.</li>
                          <li>Model cũng in trên hộp đựng và mặt lưng (nếu có).</li>
                        </ul>
                      ),
                    })
                  }
                >
                  Cách xem model
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => goTo(SCREEN.MODEL_NOT_FOUND, true)}
                >
                  Không tìm thấy máy của tôi
                </Button>
              </div>
              <div className="mt-4 grid gap-2">
                {filteredModels.length === 0 && (
                  <p className="rounded-lg bg-gray-50 p-4 text-sm text-ink-500">
                    Không có model nào khớp trong danh mục.
                  </p>
                )}
                {filteredModels.map((m) => (
                  <OptionCard
                    key={m}
                    title={m}
                    selected={data.model === m}
                    onClick={() => onSelectModel(m)}
                  />
                ))}
              </div>
              <NavButtons hideContinue onContinue={() => {}} />
            </div>
          )}

          {screen === SCREEN.MODEL_NOT_FOUND && (
            <div>
              <QuestionHeader
                stepLabel="Bước 1 · Chọn điện thoại"
                title="Yêu cầu bổ sung model vào danh mục"
                desc="Giữ lại thông tin đã chọn trước đó. Tải ảnh máy và ảnh thông tin thiết bị cần thiết để kiểm tra."
              />
              <SummaryBar />
              <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
                <strong>Lưu ý trước khi gửi:</strong> hãy che thông tin cá
                nhân, IMEI và số sê-ri trên ảnh trước khi tải lên.
              </div>
              <div className="mt-4">
                <div className="mb-2 text-sm font-semibold text-ink-900">
                  Ảnh máy và thông tin thiết bị
                </div>
                <PhotoManager
                  photos={data.photos}
                  onChange={(photos) => update({ photos })}
                />
                <FieldError msg={errors.requestPhotos} />
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button variant="outline" type="button" onClick={goBack}>
                  Quay lại
                </Button>
                <Button type="button" variant="ghost" onClick={() => saveDraft()}>
                  Lưu bản nháp
                </Button>
                <Button type="button" onClick={onSendCatalogRequest}>
                  Gửi yêu cầu bổ sung
                </Button>
              </div>
            </div>
          )}

          {screen === SCREEN.CATALOG_REQUESTED && (
            <div>
              <QuestionHeader
                stepLabel="Bước 1 · Chọn điện thoại"
                title="Yêu cầu bổ sung đang chờ kiểm tra"
              />
              <div className="card p-6">
                <div className="flex items-center gap-2">
                  <StatusBadge tone="amber">Đang chờ kiểm tra</StatusBadge>
                  <DataBadge />
                </div>
                <p className="mt-3 text-sm text-ink-700">
                  Yêu cầu bổ sung model cho hãng{" "}
                  <strong>{data.brand}</strong> đã được ghi nhận trong dữ
                  liệu prototype. Đây là <strong>trạng thái mô phỏng</strong>{" "}
                  — prototype chưa có quy trình duyệt thật, nên chưa thể xác
                  nhận model được bổ sung.
                </p>
                <p className="mt-2 text-sm text-ink-500">
                  Bạn chưa thể đăng tin cho model này cho đến khi model được
                  bổ sung vào danh mục.
                </p>
                {data.brand &&
                  models.includes(data.model) && (
                    <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
                      Model <strong>{data.model}</strong> hiện đã có trong danh
                      mục — bạn có thể tiếp tục đăng bán.
                    </div>
                  )}
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => {
                      update({ catalogRequested: false });
                      saveDraft(true);
                      goTo(SCREEN.BRAND, true);
                    }}
                  >
                    Về bản nháp
                  </Button>
                  {data.brand &&
                    models.includes(data.model) && (
                      <Button
                        type="button"
                        onClick={() => {
                          update({ catalogRequested: false });
                          saveDraft(true);
                          goTo(SCREEN.MODEL, true);
                        }}
                      >
                        Tiếp tục đăng bán
                      </Button>
                    )}
                </div>
              </div>
            </div>
          )}

          {screen === SCREEN.STORAGE && (
            <div>
              <QuestionHeader
                stepLabel="Bước 1 · Chọn điện thoại"
                title="Bộ nhớ trong của máy là bao nhiêu?"
                desc="Chỉ hiển thị dung lượng hợp lệ theo model trong danh mục."
              />
              <SummaryBar />
              <div className="grid gap-2">
                {storages.map((s) => (
                  <OptionCard
                    key={s}
                    title={s}
                    selected={data.storage === s}
                    onClick={() => onSelectStorage(s)}
                  />
                ))}
                {storages.length === 0 && (
                  <p className="rounded-lg bg-gray-50 p-4 text-sm text-ink-500">
                    Danh mục chưa có dữ liệu dung lượng cho model này.
                  </p>
                )}
              </div>
              <div className="mt-4">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() =>
                    setHelp({
                      title: "Cách xem dung lượng",
                      body: (
                        <ul className="list-disc space-y-1 pl-5">
                          <li>Vào Cài đặt &gt; Cài đặt chung &gt; Dung lượng (iOS) hoặc Cài đặt &gt; Bộ nhớ (Android).</li>
                          <li>Dung lượng tổng của máy in trên hộp đựng.</li>
                        </ul>
                      ),
                    })
                  }
                >
                  Cách xem dung lượng
                </Button>
              </div>
              <NavButtons hideContinue onContinue={() => {}} />
            </div>
          )}

          {screen === SCREEN.RAM && (
            <div>
              <QuestionHeader
                stepLabel="Bước 1 · Chọn điện thoại"
                title="RAM của máy là bao nhiêu?"
                desc="Chỉ hiển thị mức RAM vật lý. Không cộng RAM mở rộng/ảo vào RAM vật lý."
              />
              <SummaryBar />
              <div className="rounded-lg bg-gray-50 p-3 text-xs text-ink-500">
                Danh mục hiện chưa có dữ liệu RAM theo model/dung lượng, bạn tự
                khai theo máy hoặc chọn “Không rõ”.
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {RAM_OPTIONS.map((r) => (
                  <OptionCard
                    key={r}
                    title={`${r} RAM`}
                    selected={data.ram === r}
                    onClick={() => onSelectRam(r)}
                  />
                ))}
                <OptionCard
                  title="Không rõ"
                  selected={data.ram === "Không rõ"}
                  onClick={() => onSelectRam("Không rõ")}
                />
              </div>
              <div className="mt-4">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() =>
                    setHelp({
                      title: "Cách kiểm tra RAM",
                      body: (
                        <ul className="list-disc space-y-1 pl-5">
                          <li>iOS: Cài đặt &gt; Cài đặt chung &gt; Giới thiệu (một số model hiển thị RAM qua tài liệu kỹ thuật của hãng).</li>
                          <li>Android: Cài đặt &gt; Giới thiệu điện thoại &gt; RAM, hoặc ứng dụng kiểm tra phần cứng.</li>
                          <li>RAM vật lý ≠ RAM mở rộng/ảo — chỉ khai RAM vật lý.</li>
                        </ul>
                      ),
                    })
                  }
                >
                  Hướng dẫn kiểm tra RAM
                </Button>
              </div>
              <NavButtons hideContinue onContinue={() => {}} />
            </div>
          )}

          {screen === SCREEN.COLOR && (
            <div>
              <QuestionHeader
                stepLabel="Bước 1 · Chọn điện thoại"
                title="Điện thoại của bạn có màu gì?"
                desc="Chọn màu đúng với máy. Nếu máy đã thay vỏ hoặc không khớp lựa chọn, chọn “Không rõ”; nếu màu không có trong danh sách, chọn “Khác” và nhập tên màu thực tế."
              />
              <SummaryBar />
              <div className="grid gap-2 sm:grid-cols-2">
                {colorOptions.map((c) => (
                  <OptionCard
                    key={c}
                    title={c}
                    selected={!isCustomColor && data.color === c}
                    onClick={() => {
                      setCustomColorMode(false);
                      setCustomColor("");
                      onSelectColor(c);
                    }}
                  />
                ))}
                <OptionCard
                  title="Không rõ"
                  desc="Máy đã thay vỏ hoặc không khớp danh mục"
                  selected={!isCustomColor && data.color === "Không rõ"}
                  onClick={() => {
                    setCustomColorMode(false);
                    setCustomColor("");
                    onSelectColor("Không rõ");
                  }}
                />
                <OptionCard
                  title="Khác"
                  desc="Nhập tên màu thực tế của máy"
                  selected={isCustomColor}
                  onClick={() => {
                    setCustomColorMode(true);
                    setCustomColor("");
                  }}
                />
              </div>
              {isCustomColor && (
                <div className="card mt-4 p-5">
                  <label className="label" htmlFor="custom-color">
                    Tên màu thực tế
                  </label>
                  <input
                    id="custom-color"
                    className="input"
                    placeholder="VD: Xanh lá, Xám titan, Hồng…"
                    value={customColor || (customColorMode ? "" : data.color || "")}
                    onChange={(e) => setCustomColor(e.target.value)}
                  />
                  <FieldError msg={errors.color} />
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => {
                        setCustomColorMode(false);
                        setCustomColor("");
                        update({ color: null });
                      }}
                    >
                      Quay lại
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        const v = (customColor || data.color || "").trim();
                        if (!v) {
                          setErrors({ ...errors, color: "Vui lòng nhập tên màu thực tế." });
                          return;
                        }
                        setErrors({ ...errors, color: undefined });
                        onSelectColor(v);
                      }}
                    >
                      Tiếp tục
                    </Button>
                  </div>
                </div>
              )}
              {!isCustomColor && <NavButtons hideContinue onContinue={() => {}} />}
            </div>
          )}

          {screen === SCREEN.NETWORK_LOCK && (
            <div>
              <QuestionHeader
                stepLabel="Bước 1 · Chọn điện thoại"
                title="Điện thoại có bị khóa mạng không?"
                desc="Không mặc định “Không khóa mạng” — hãy chọn theo thực tế của máy."
              />
              <SummaryBar />
              <div className="grid gap-2">
                {NETWORK_LOCK_OPTIONS.map((opt) => (
                  <OptionCard
                    key={opt}
                    title={opt}
                    selected={data.networkLock === opt}
                    onClick={() => onSelectNetworkLock(opt)}
                  />
                ))}
              </div>
              <div className="mt-4">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() =>
                    setHelp({
                      title: "Cách kiểm tra khóa mạng",
                      body: (
                        <ul className="list-disc space-y-1 pl-5">
                          <li>Lắp SIM của nhà mạng khác: nếu máy yêu cầu nhập mã khóa SIM hoặc không nhận SIM → máy đang khóa mạng.</li>
                          <li>iPhone: Cài đặt &gt; Cài đặt chung &gt; Giới thiệu &gt; “Khóa mạng nhà cung cấp dịch vụ”.</li>
                          <li>Máy mua trả góp theo gói có thể bị khóa mạng đến khi tất toán.</li>
                        </ul>
                      ),
                    })
                  }
                >
                  Cách kiểm tra khóa mạng
                </Button>
              </div>
              <NavButtons hideContinue onContinue={() => {}} />
            </div>
          )}

          {/* ==================== BƯỚC 2: TÌNH TRẠNG MÁY ==================== */}

          {screen === SCREEN.APPEARANCE && (
            <div>
              <QuestionHeader
                stepLabel="Bước 2 · Tình trạng máy"
                title="Ngoại hình máy hiện tại thế nào?"
                desc="Đánh giá màn hình, khung viền và mặt lưng, không tính ốp hoặc miếng dán. Nếu có dấu hiệu thuộc nhiều mức, chọn mức thấp nhất."
              />
              <div className="grid gap-3">
                {APPEARANCE_LEVELS.map((lv) => (
                  <OptionCard
                    key={lv.key}
                    title={lv.key}
                    desc={lv.desc}
                    selected={data.appearance === lv.key}
                    onClick={() => onSelectAppearance(lv.key)}
                  />
                ))}
              </div>
              <NavButtons hideContinue onContinue={() => {}} />
            </div>
          )}

          {screen === SCREEN.FUNCTIONALITY && (
            <div>
              <QuestionHeader
                stepLabel="Bước 2 · Tình trạng máy"
                title="Các chức năng của máy hoạt động thế nào?"
              />
              <div className="grid gap-2">
                {FUNCTIONALITY_OPTIONS.map((opt) => (
                  <OptionCard
                    key={opt.key}
                    title={opt.label}
                    selected={data.functionality === opt.key}
                    onClick={() => onSelectFunctionality(opt.key)}
                  />
                ))}
              </div>
              <div className="mt-4">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() =>
                    setHelp({
                      title: "Hướng dẫn kiểm tra chức năng",
                      body: (
                        <ul className="list-disc space-y-1 pl-5">
                          <li>Màn hình: hiển thị đầy đủ, không sọc/đốm/vùng chết.</li>
                          <li>Cảm ứng: vuốt khắp màn hình, thử gõ phím.</li>
                          <li>Camera: chụp trước/sau, quay video, flash.</li>
                          <li>Loa/Mic: gọi thử, phát nhạc, ghi âm.</li>
                          <li>Nút bấm, sạc, Wi-Fi, Bluetooth, SIM/sóng, vân tay, nhận diện khuôn mặt, rung, nguồn.</li>
                        </ul>
                      ),
                    })
                  }
                >
                  Hướng dẫn kiểm tra
                </Button>
              </div>
              <NavButtons hideContinue onContinue={() => {}} />
            </div>
          )}

          {screen === SCREEN.ERROR_LIST && (
            <div>
              <QuestionHeader
                stepLabel="Bước 2 · Tình trạng máy"
                title="Chọn các chức năng bị lỗi"
                desc="Chọn tất cả lỗi bạn đã phát hiện (chọn nhiều)."
              />
              <div className="grid gap-2 sm:grid-cols-2">
                {getErrorOptions().map((opt) => {
                  const selected = errorListSel.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        setErrorListSel((sel) =>
                          selected
                            ? sel.filter((s) => s !== opt)
                            : [...sel, opt]
                        )
                      }
                      className={`rounded-xl border-2 p-4 text-left text-sm font-semibold transition ${
                        selected
                          ? "border-brand-500 bg-brand-50 text-brand-600"
                          : "border-gray-200 bg-white text-ink-900 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              {errorListSel.includes("Lỗi khác") && (
                <div className="mt-4">
                  <label className="label" htmlFor="other-error">
                    Mô tả lỗi khác
                  </label>
                  <input
                    id="other-error"
                    className="input"
                    placeholder="VD: Loa trái nhỏ tiếng khi gọi"
                    value={data.otherErrorDesc}
                    onChange={(e) =>
                      update({ otherErrorDesc: e.target.value })
                    }
                  />
                  <FieldError msg={errors.otherErrorDesc} />
                </div>
              )}
              <FieldError msg={errors.errorList} />
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button variant="outline" type="button" onClick={goBack}>
                  Quay lại
                </Button>
                <Button type="button" variant="ghost" onClick={() => saveDraft()}>
                  Lưu bản nháp
                </Button>
                <Button type="button" onClick={onConfirmErrorList}>
                  Xác nhận các lỗi đã chọn
                </Button>
              </div>
            </div>
          )}

          {screen === SCREEN.ERROR_SEVERITY && currentError && (
            <div>
              <QuestionHeader
                stepLabel={`Bước 2 · Tình trạng máy · Lỗi ${severityIdx + 1}/${data.errors.length}`}
                title={`${currentError.key} hiện hoạt động thế nào?`}
                desc="Chọn một mức độ. Không có lựa chọn “Không rõ” cho mức độ lỗi."
              />
              <div className="grid gap-2">
                <OptionCard
                  title="Vẫn hoạt động nhưng có vấn đề"
                  selected={currentError.severity === "Vẫn hoạt động nhưng có vấn đề"}
                  onClick={() => onSelectSeverity("Vẫn hoạt động nhưng có vấn đề")}
                />
                <OptionCard
                  title="Không hoạt động"
                  selected={currentError.severity === "Không hoạt động"}
                  onClick={() => onSelectSeverity("Không hoạt động")}
                />
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => {
                    setSeverityIdx(0);
                    setErrorListSel(data.errors.map((e) => e.key));
                    goTo(SCREEN.ERROR_LIST);
                  }}
                >
                  Sửa danh sách lỗi
                </Button>
                <Button variant="ghost" type="button" onClick={() => saveDraft()}>
                  Lưu bản nháp
                </Button>
              </div>
            </div>
          )}

          {screen === SCREEN.REST_CHECKED && (
            <div>
              <QuestionHeader
                stepLabel="Bước 2 · Tình trạng máy"
                title="Bạn đã kiểm tra các chức năng còn lại chưa?"
              />
              <div className="grid gap-2">
                <OptionCard
                  title="Đã kiểm tra"
                  selected={data.restChecked === "Đã kiểm tra"}
                  onClick={() => onSelectRestChecked("Đã kiểm tra")}
                />
                <OptionCard
                  title="Chưa kiểm tra hết"
                  selected={data.restChecked === "Chưa kiểm tra hết"}
                  onClick={() => onSelectRestChecked("Chưa kiểm tra hết")}
                />
              </div>
              <NavButtons hideContinue onContinue={() => {}} />
            </div>
          )}

          {screen === SCREEN.BATTERY && (
            <div>
              <QuestionHeader
                stepLabel="Bước 2 · Tình trạng máy"
                title="Sức khỏe pin của máy là bao nhiêu?"
                desc="Nhập sức khỏe pin, không phải mức pin còn lại trên thanh trạng thái."
              />
              {data.battery.mode !== "text" && (
                <div className="card p-5">
                  <label className="label" htmlFor="battery-percent">
                    Sức khỏe pin (%)
                  </label>
                  <input
                    id="battery-percent"
                    type="number"
                    min="0"
                    max="100"
                    className="input"
                    placeholder="VD: 89"
                    value={data.battery.percent}
                    onChange={(e) =>
                      update({
                        battery: {
                          mode: "percent",
                          percent: e.target.value,
                          text: null,
                        },
                      })
                    }
                  />
                  <FieldError msg={errors.battery} />
                  <p className="mt-2 text-xs text-ink-400">
                    Chỉ nhận số từ 0 đến 100. Không nhận số âm hoặc lớn hơn 100.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button variant="outline" type="button" onClick={goBack}>
                      Quay lại
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => saveDraft()}>
                      Lưu bản nháp
                    </Button>
                    <Button type="button" onClick={onBatteryPercentContinue}>
                      Tiếp tục
                    </Button>
                  </div>
                </div>
              )}
              {data.battery.mode === "text" && (
                <div className="card p-5">
                  <p className="text-sm text-ink-700">
                    Dữ liệu hướng dẫn hiện tại <strong>không có trạng thái
                    chữ</strong> theo model trong prototype này, nên không thể
                    chọn trạng thái chữ. Hãy nhập số phần trăm hoặc chọn
                    “Không xem được”.
                  </p>
                  <FieldError msg={errors.battery} />
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => onBatteryMode("percent")}
                    >
                      Nhập số phần trăm
                    </Button>
                    <Button type="button" onClick={() => onBatteryMode("unknown")}>
                      Không xem được
                    </Button>
                  </div>
                </div>
              )}
              {data.battery.mode === null && (
                <div className="card p-5">
                  <p className="text-sm text-ink-700">
                    Chọn cách khai sức khỏe pin:
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <OptionCard
                      title="Có số phần trăm"
                      desc="Biết chính xác % sức khỏe pin"
                      selected={false}
                      onClick={() => onBatteryMode("percent")}
                    />
                    <OptionCard
                      title="Chỉ có trạng thái chữ"
                      desc="Máy hiển thị trạng thái chữ"
                      selected={false}
                      onClick={() => onBatteryMode("text")}
                    />
                    <OptionCard
                      title="Không xem được"
                      desc="Không xem được / không rõ"
                      selected={false}
                      onClick={() => onBatteryMode("unknown")}
                    />
                  </div>
                  <div className="mt-4">
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() =>
                        setHelp({
                          title: "Cách xem sức khỏe pin",
                          body: (
                            <ul className="list-disc space-y-1 pl-5">
                              <li>iOS: Cài đặt &gt; Pin &gt; Sức khỏe pin (một số model), hoặc dùng công cụ kiểm tra pin.</li>
                              <li>Android: một số hãng hiển thị trong Cài đặt &gt; Pin &gt; Sức khỏe pin, hoặc qua mã kiểm tra của hãng.</li>
                              <li>“Không xem được” lưu giá trị chưa xác định — không gán 0% và không xếp vào nhóm Kém.</li>
                            </ul>
                          ),
                        })
                      }
                    >
                      Máy của tôi hiển thị khác
                    </Button>
                  </div>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Button variant="outline" type="button" onClick={goBack}>
                      Quay lại
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => saveDraft()}>
                      Lưu bản nháp
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {screen === SCREEN.USAGE_TIME && (
            <div>
              <QuestionHeader
                stepLabel="Bước 2 · Tình trạng máy"
                title="Bạn đã sử dụng máy này bao lâu?"
              />
              <div className="card p-5">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-28">
                    <label className="label" htmlFor="usage-years">
                      Số năm
                    </label>
                    <input
                      id="usage-years"
                      type="number"
                      min="0"
                      step="1"
                      className="input"
                      placeholder="VD: 1"
                      value={data.usage.years}
                      disabled={data.usage.unknown}
                      onChange={(e) =>
                        update({
                          usage: { ...data.usage, years: e.target.value, unknown: false },
                        })
                      }
                    />
                  </div>
                  <div className="w-28">
                    <label className="label" htmlFor="usage-months">
                      Số tháng
                    </label>
                    <input
                      id="usage-months"
                      type="number"
                      min="0"
                      max="11"
                      step="1"
                      className="input"
                      placeholder="VD: 4"
                      value={data.usage.months}
                      disabled={data.usage.unknown}
                      onChange={(e) =>
                        update({
                          usage: { ...data.usage, months: e.target.value, unknown: false },
                        })
                      }
                    />
                  </div>
                  <div className="flex-1 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                    <span className="text-ink-500">Hiển thị: </span>
                    <span className="font-semibold text-ink-900">
                      {data.usage.unknown
                        ? "Không rõ"
                        : usageMonthsOf(data.usage) === null
                          ? "—"
                          : formatUsageMonths(usageMonthsOf(data.usage))}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-ink-500">
                  Nhập 0–11 tháng. Từ 12 tháng trở lên, hãy quy đổi vào ô “Số năm”
                  (ví dụ 16 tháng = 1 năm 4 tháng).
                </p>
                <FieldError msg={errors.usage} />
                <div className="mt-4">
                  <button
                    type="button"
                    aria-pressed={data.usage.unknown}
                    onClick={() =>
                      update({ usage: { ...data.usage, unknown: !data.usage.unknown } })
                    }
                    className={`rounded-xl border-2 px-4 py-3 text-sm font-semibold transition ${
                      data.usage.unknown
                        ? "border-brand-500 bg-brand-50 text-brand-600"
                        : "border-gray-200 bg-white text-ink-900 hover:border-gray-300"
                    }`}
                  >
                    Không rõ
                  </button>
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button variant="outline" type="button" onClick={goBack}>
                    Quay lại
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => saveDraft()}>
                    Lưu bản nháp
                  </Button>
                  <Button type="button" onClick={onUsageContinue}>
                    Tiếp tục
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ==================== BƯỚC 3: ẢNH VÀ THÔNG TIN ==================== */}

          {screen === SCREEN.PHOTOS && (
            <div>
              <QuestionHeader
                stepLabel="Bước 3 · Ảnh và thông tin đi kèm"
                title="Thêm ảnh thực tế của máy"
                desc="Chọn nhiều ảnh, chọn ảnh bìa, sắp xếp thứ tự. Giữ các ảnh tải thành công nếu có ảnh bị lỗi."
              />
              <PhotoManager
                photos={data.photos}
                onChange={(photos) => update({ photos })}
              />
              {data.photos.some((p) => p.status === "stale") && (
                <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
                  Một số ảnh trong bản nháp không còn khả dụng sau khi tải lại
                  trang (URL ảnh tạm hết hạn). Vui lòng tải lại các ảnh đó.
                </p>
              )}
              <FieldError msg={errors.photos} />
              <NavButtons onContinue={onPhotosContinue} />
            </div>
          )}

          {screen === SCREEN.ACCESSORIES && (
            <div>
              <QuestionHeader
                stepLabel="Bước 3 · Ảnh và thông tin đi kèm"
                title="Phụ kiện tặng kèm"
                desc="Phụ kiện tặng kèm, không thu thêm tiền."
              />
              <div className="grid gap-2 sm:grid-cols-2">
                {ACCESSORY_OPTIONS.map((acc) => {
                  const selected = data.accessories.includes(acc);
                  return (
                    <button
                      key={acc}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onToggleAccessory(acc)}
                      className={`rounded-xl border-2 p-4 text-left text-sm font-semibold transition ${
                        selected
                          ? "border-brand-500 bg-brand-50 text-brand-600"
                          : "border-gray-200 bg-white text-ink-900 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {acc}
                    </button>
                  );
                })}
              </div>
              {data.accessories.includes("Khác") && (
                <div className="mt-4">
                  <label className="label" htmlFor="other-accessory">
                    Tên phụ kiện khác
                  </label>
                  <input
                    id="other-accessory"
                    className="input"
                    placeholder="VD: Sách hướng dẫn"
                    value={data.otherAccessory}
                    onChange={(e) => update({ otherAccessory: e.target.value })}
                  />
                  <FieldError msg={errors.otherAccessory} />
                </div>
              )}
              <FieldError msg={errors.accessories} />
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button variant="outline" type="button" onClick={goBack}>
                  Quay lại
                </Button>
                <Button type="button" variant="ghost" onClick={() => saveDraft()}>
                  Lưu bản nháp
                </Button>
                <Button type="button" onClick={onConfirmAccessories}>
                  Xác nhận
                </Button>
              </div>
            </div>
          )}

          {screen === SCREEN.WARRANTY && (
            <div>
              <QuestionHeader
                stepLabel="Bước 3 · Ảnh và thông tin đi kèm"
                title="Máy còn bảo hành không?"
              />
              <div className="grid gap-2">
                {WARRANTY_OPTIONS.map((opt) => (
                  <OptionCard
                    key={opt.key}
                    title={opt.label}
                    selected={data.warranty.type === opt.key}
                    onClick={() => onSelectWarranty(opt.key)}
                  />
                ))}
              </div>
              <NavButtons hideContinue onContinue={() => {}} />
            </div>
          )}

          {screen === SCREEN.WARRANTY_MANUFACTURER && (
            <div>
              <QuestionHeader
                stepLabel="Bước 3 · Ảnh và thông tin đi kèm"
                title="Bảo hành hãng"
              />
              <div className="rounded-lg bg-brand-50 p-4 text-sm text-brand-700">
                Hãng: <strong>{data.brand}</strong> — Bảo hành tại trung tâm
                ủy quyền của hãng.
              </div>
              <div className="card mt-4 p-5">
                <div className="text-sm font-semibold text-ink-900">
                  Ngày hết hạn bảo hành
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div className="flex-1">
                    <label className="label" htmlFor="mfr-expiry">
                      Ngày hết hạn
                    </label>
                    <input
                      id="mfr-expiry"
                      type="date"
                      className="input"
                      value={data.warranty.manufacturer.expiry}
                      onChange={(e) =>
                        update({
                          warranty: {
                            ...data.warranty,
                            manufacturer: {
                              ...data.warranty.manufacturer,
                              expiry: e.target.value,
                              unknownDate: false,
                            },
                          },
                        })
                      }
                    />
                  </div>
                  <button
                    type="button"
                    aria-pressed={data.warranty.manufacturer.unknownDate}
                    onClick={() =>
                      update({
                        warranty: {
                          ...data.warranty,
                          manufacturer: {
                            ...data.warranty.manufacturer,
                            unknownDate: !data.warranty.manufacturer.unknownDate,
                            expiry: "",
                          },
                        },
                      })
                    }
                    className={`rounded-xl border-2 px-4 py-2.5 text-sm font-semibold transition ${
                      data.warranty.manufacturer.unknownDate
                        ? "border-brand-500 bg-brand-50 text-brand-600"
                        : "border-gray-200 bg-white text-ink-900 hover:border-gray-300"
                    }`}
                  >
                    Không rõ ngày
                  </button>
                </div>
                <FieldError msg={errors.warrantyExpiry} />
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button variant="outline" type="button" onClick={goBack}>
                    Quay lại
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => saveDraft()}>
                    Lưu bản nháp
                  </Button>
                  <Button type="button" onClick={onManufacturerWarrantyContinue}>
                    Tiếp tục
                  </Button>
                </div>
              </div>
            </div>
          )}

          {screen === SCREEN.WARRANTY_STORE && (
            <div>
              <QuestionHeader
                stepLabel="Bước 3 · Ảnh và thông tin đi kèm"
                title="Bảo hành cửa hàng"
              />
              <div className="card space-y-4 p-5">
                <div>
                  <label className="label" htmlFor="store-name">
                    Tên cửa hàng
                  </label>
                  <input
                    id="store-name"
                    className="input"
                    placeholder="VD: Hoàng Mobile"
                    value={data.warranty.store.name}
                    onChange={(e) =>
                      update({
                        warranty: {
                          ...data.warranty,
                          store: { ...data.warranty.store, name: e.target.value },
                        },
                      })
                    }
                  />
                  <FieldError msg={errors.storeName} />
                </div>
                <div>
                  <label className="label" htmlFor="store-address">
                    Địa chỉ nơi bảo hành
                  </label>
                  <input
                    id="store-address"
                    className="input"
                    placeholder="VD: 12 Nguyễn Văn Linh, Quận 1, TP.HCM"
                    value={data.warranty.store.address}
                    onChange={(e) =>
                      update({
                        warranty: {
                          ...data.warranty,
                          store: {
                            ...data.warranty.store,
                            address: e.target.value,
                          },
                        },
                      })
                    }
                  />
                  <FieldError msg={errors.storeAddress} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-ink-900">
                    Ngày hết hạn bảo hành
                  </div>
                  <div className="mt-2 flex flex-wrap items-end gap-3">
                    <div className="flex-1">
                      <label className="label" htmlFor="store-expiry">
                        Ngày hết hạn
                      </label>
                      <input
                        id="store-expiry"
                        type="date"
                        className="input"
                        value={data.warranty.store.expiry}
                        onChange={(e) =>
                          update({
                            warranty: {
                              ...data.warranty,
                              store: {
                                ...data.warranty.store,
                                expiry: e.target.value,
                                unknownDate: false,
                              },
                            },
                          })
                        }
                      />
                    </div>
                    <button
                      type="button"
                      aria-pressed={data.warranty.store.unknownDate}
                      onClick={() =>
                        update({
                          warranty: {
                            ...data.warranty,
                            store: {
                              ...data.warranty.store,
                              unknownDate: !data.warranty.store.unknownDate,
                              expiry: "",
                            },
                          },
                        })
                      }
                      className={`rounded-xl border-2 px-4 py-2.5 text-sm font-semibold transition ${
                        data.warranty.store.unknownDate
                          ? "border-brand-500 bg-brand-50 text-brand-600"
                          : "border-gray-200 bg-white text-ink-900 hover:border-gray-300"
                      }`}
                    >
                      Không rõ ngày
                    </button>
                  </div>
                  <FieldError msg={errors.warrantyStoreExpiry} />
                </div>
                <div className="flex flex-wrap gap-3 pt-1">
                  <Button variant="outline" type="button" onClick={goBack}>
                    Quay lại
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => saveDraft()}>
                    Lưu bản nháp
                  </Button>
                  <Button type="button" onClick={onStoreWarrantyContinue}>
                    Tiếp tục
                  </Button>
                </div>
              </div>
            </div>
          )}

          {screen === SCREEN.DESCRIPTION && (
            <div>
              <QuestionHeader
                stepLabel="Bước 3 · Ảnh và thông tin đi kèm"
                title="Bạn muốn người mua biết thêm điều gì?"
                desc="Không bắt buộc. Không cần nhập lại thông số, tình trạng hoặc lỗi đã khai trước đó."
              />
              <div className="card p-5">
                <label className="label" htmlFor="listing-desc">
                  Mô tả bổ sung
                </label>
                <textarea
                  id="listing-desc"
                  className="input min-h-32 resize-y"
                  placeholder="VD: Máy mua tại FPT Shop, còn hóa đơn. Cho kèm ốp lưng."
                  value={data.description}
                  onChange={(e) => update({ description: e.target.value })}
                />
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button variant="outline" type="button" onClick={goBack}>
                    Quay lại
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => saveDraft()}>
                    Lưu bản nháp
                  </Button>
                  <Button type="button" onClick={onDescriptionContinue}>
                    Tiếp tục
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      update({ description: "" });
                      onDescriptionContinue();
                    }}
                  >
                    Bỏ qua
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ==================== BƯỚC 4: GIÁ VÀ LIÊN HỆ ==================== */}

          {screen === SCREEN.PRICE && (
            <div>
              <QuestionHeader
                stepLabel="Bước 4 · Giá bán và liên hệ"
                title="Bạn muốn bán điện thoại với giá bao nhiêu?"
              />
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="card p-5">
                  <label className="label" htmlFor="listing-price">
                    Giá bán (₫)
                  </label>
                  <input
                    id="listing-price"
                    inputMode="numeric"
                    className="input"
                    placeholder="VD: 9.200.000"
                    value={data.price}
                    onChange={(e) =>
                      update({ price: formatPriceInput(e.target.value) })
                    }
                  />
                  <FieldError msg={errors.price} />
                  <p className="mt-3 text-xs text-ink-500">
                    Giá điện thoại chưa bao gồm phí vận chuyển. Phụ kiện đã
                    chọn là quà tặng kèm.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button variant="outline" type="button" onClick={goBack}>
                      Quay lại
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => saveDraft()}>
                      Lưu bản nháp
                    </Button>
                    <Button type="button" onClick={onPriceContinue}>
                      Tiếp tục
                    </Button>
                  </div>
                </div>
                {/* Giá tham khảo RePrice — do engine cung cấp, UI chỉ hiển thị */}
                {draftReference ? (
                  <ReferencePricePanel
                    phone={{ price: draftReference.listingPrice }}
                    reference={draftReference}
                    role="seller"
                    markerLabel="Giá bạn nhập"
                  />
                ) : (
                  <div className="card p-5">
                    <div className="text-sm font-semibold text-ink-900">
                      Giá tham khảo RePrice
                    </div>
                    <p className="mt-2 text-sm text-ink-500">
                      Chọn model và dung lượng để xem giá tham khảo máy mới và máy
                      cũ tương đồng.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {screen === SCREEN.REGION && (
            <div>
              <QuestionHeader
                stepLabel="Bước 4 · Giá bán và liên hệ"
                title="Đây có phải khu vực bạn đang bán máy?"
                desc="Khu vực lấy từ tài khoản người bán. Xác nhận đúng sẽ lưu khu vực cho tin đăng, không sửa địa chỉ tài khoản."
              />
              <div className="card p-5">
                <div className="rounded-lg bg-brand-50 p-4 text-sm text-brand-700">
                  <strong>
                    {accountWard ? `${accountWard}, ` : ""}
                    {accountProvince || "Chưa có khu vực trong tài khoản"}
                  </strong>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={goBack}
                  >
                    Quay lại
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => saveDraft()}>
                    Lưu bản nháp
                  </Button>
                  <Button type="button" onClick={onConfirmRegion}>
                    Đúng, tiếp tục
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setOldRegion({ ...data.region });
                      goTo(SCREEN.REGION_PROVINCE);
                    }}
                  >
                    Thay đổi
                  </Button>
                </div>
              </div>
            </div>
          )}

          {screen === SCREEN.REGION_PROVINCE && (
            <div>
              <QuestionHeader
                stepLabel="Bước 4 · Giá bán và liên hệ"
                title="Chọn tỉnh/thành"
                desc="Đã có danh mục 63 tỉnh/thành Việt Nam. Chưa có dữ liệu quận/huyện đầy đủ."
              />
              <div className="relative">
                <input
                  className="input pr-10"
                  placeholder="Tìm tỉnh/thành…"
                  value={provinceQuery}
                  onChange={(e) => setProvinceQuery(e.target.value)}
                  aria-label="Tìm kiếm tỉnh/thành"
                />
                <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
              </div>
              <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-gray-200">
                {PROVINCES.filter((r) =>
                  r.toLowerCase().includes(provinceQuery.trim().toLowerCase())
                ).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onSelectProvince(r)}
                    className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition hover:bg-brand-50 ${
                      data.region.province === r
                        ? "bg-brand-50 font-semibold text-brand-600"
                        : "text-ink-900"
                    }`}
                  >
                    {r}
                    {data.region.province === r && (
                      <svg className="h-4 w-4 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button variant="outline" type="button" onClick={goBack}>
                  Quay lại
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    if (oldRegion) update({ region: oldRegion });
                    setOldRegion(null);
                    goTo(SCREEN.REGION, true);
                  }}
                >
                  Hủy
                </Button>
              </div>
            </div>
          )}

          {screen === SCREEN.REGION_WARD && (
            <div>
              <QuestionHeader
                stepLabel="Bước 4 · Giá bán và liên hệ"
                title={`Chọn phường/xã tại ${data.region.province || ""}`}
                desc="Chưa có danh mục phường/xã — nhập phường/xã theo địa chỉ thực tế của bạn."
              />
              <div className="card p-5">
                <label className="label" htmlFor="ward">
                  Phường/xã
                </label>
                <input
                  id="ward"
                  className="input"
                  placeholder="VD: Phường Bến Nghé"
                  value={data.region.ward}
                  onChange={(e) =>
                    update({ region: { ...data.region, ward: e.target.value } })
                  }
                />
                <FieldError msg={errors.ward} />
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button variant="outline" type="button" onClick={goBack}>
                    Quay lại
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => saveDraft()}>
                    Lưu bản nháp
                  </Button>
                  <Button type="button" onClick={onWardContinue}>
                    Tiếp tục
                  </Button>
                </div>
              </div>
            </div>
          )}

          {screen === SCREEN.CONTACT && (
            <div>
              <QuestionHeader
                stepLabel="Bước 4 · Giá bán và liên hệ"
                title="Thông tin liên hệ"
                desc="Đây là thông tin hệ thống sử dụng để liên hệ, không mặc nhiên là thông tin công khai. Chỉnh sửa ở đây không tự thay đổi thông tin tài khoản."
              />
              <div className="card p-5">
                <div className="rounded-lg bg-brand-50 p-4 text-sm text-brand-700">
                  Số điện thoại tài khoản:{" "}
                  <strong>{user.phone || "Chưa có"}</strong>
                </div>
                <div className="mt-4">
                  <label className="label" htmlFor="contact-phone">
                    Số điện thoại liên hệ cho tin đăng
                  </label>
                  <input
                    id="contact-phone"
                    className="input"
                    placeholder="VD: 0909 123 456"
                    value={data.contactPhone || user.phone || ""}
                    onChange={(e) => update({ contactPhone: e.target.value })}
                  />
                  <FieldError msg={errors.contact} />
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button variant="outline" type="button" onClick={goBack}>
                    Quay lại
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => saveDraft()}>
                    Lưu bản nháp
                  </Button>
                  <Button type="button" onClick={onConfirmContact}>
                    Xác nhận
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ==================== BƯỚC 5: XEM LẠI VÀ ĐĂNG TIN ==================== */}

          {screen === SCREEN.REVIEW && (
            <div>
              <QuestionHeader
                stepLabel="Bước 5 · Xem lại và đăng tin"
                title="Xem lại và đăng tin"
                desc="Kiểm tra toàn bộ thông tin trước khi đăng. Mỗi khối có nút “Chỉnh sửa” để sửa đúng câu hỏi."
              />

              {/* Ảnh và tiêu đề */}
              <ReviewBlock
                title="Ảnh và tiêu đề"
                editLabel="Ảnh"
                onEdit={() => {
                  setReturnToReview(true);
                  goTo(SCREEN.PHOTOS);
                }}
                errors={errors.photos}
              >
                <div className="flex flex-wrap gap-2">
                  {data.photos
                    .filter((p) => p.status === "ready")
                    .slice(0, 6)
                    .map((p, i) => (
                      <span
                        key={p.id}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs ${
                          p.cover
                            ? "border-brand-300 bg-brand-50 font-semibold text-brand-700"
                            : "border-gray-200 text-ink-700"
                        }`}
                      >
                        {p.cover && "Ảnh bìa · "}
                        {p.name}
                      </span>
                    ))}
                  {data.photos.filter((p) => p.status === "ready").length ===
                    0 && (
                    <span className="text-xs font-medium text-red-600">
                      Chưa có ảnh nào
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-ink-700">
                  Tiêu đề:{" "}
                  <strong>{configSummary(data)}</strong>
                </p>
              </ReviewBlock>

              {/* Thông tin máy */}
              <ReviewBlock
                title="Thông tin máy"
                editLabel="Cấu hình"
                onEdit={() => {
                  setReturnToReview(true);
                  goTo(SCREEN.BRAND);
                }}
                errors={errors.brand || errors.model || errors.storage || errors.color || errors.networkLock}
              >
                <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                  <Row label="Hãng" value={data.brand} />
                  <Row label="Model" value={data.model} />
                  <Row label="Dung lượng" value={data.storage} />
                  <Row label="RAM" value={data.ram || "Chưa rõ"} />
                  <Row label="Màu" value={data.color} />
                  <Row label="Khóa mạng" value={data.networkLock} />
                </dl>
              </ReviewBlock>

              {/* Tình trạng */}
              <ReviewBlock
                title="Tình trạng máy"
                editLabel="Tình trạng"
                onEdit={() => {
                  setReturnToReview(true);
                  goTo(SCREEN.APPEARANCE);
                }}
                errors={
                  errors.appearance ||
                  errors.functionality ||
                  errors.errors ||
                  errors.battery ||
                  errors.usage
                }
              >
                <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                  <Row label="Ngoại hình" value={data.appearance} />
                  <Row
                    label="Tình trạng chức năng"
                    value={
                      data.functionality === "full"
                        ? "Đã kiểm tra, hoạt động đầy đủ"
                        : data.functionality === "errors"
                          ? "Có lỗi"
                          : data.functionality === "partial"
                            ? "Chưa kiểm tra đầy đủ"
                            : "Chưa khai"
                    }
                  />
                  <Row
                    label="Mức độ hoàn thành kiểm tra"
                    value={
                      data.restChecked === "Đã kiểm tra"
                        ? "Đã kiểm tra"
                        : data.restChecked === "Chưa kiểm tra hết"
                          ? "Chưa kiểm tra hết"
                          : "Chưa khai"
                    }
                  />
                  <Row
                    label="Sức khỏe pin"
                    value={
                      data.battery.mode === "percent"
                        ? `${data.battery.percent}%`
                        : data.battery.mode === "text"
                          ? data.battery.text || "Trạng thái chữ (không có trong danh mục)"
                          : data.battery.mode === "unknown"
                            ? "Không xem được / chưa rõ"
                            : "Chưa khai"
                    }
                  />
                  <Row
                    label="Thời gian sử dụng"
                    value={
                      data.usage.unknown
                        ? "Không rõ"
                        : usageMonthsOf(data.usage) === null
                          ? "Chưa khai"
                          : formatUsageMonths(usageMonthsOf(data.usage))
                    }
                  />
                </dl>
                {data.functionality === "errors" && data.errors.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-ink-900">
                      Danh sách lỗi và mức độ
                    </div>
                    <ul className="mt-1.5 space-y-1">
                      {data.errors.map((e, i) => (
                        <li key={i} className="text-sm text-ink-700">
                          {e.key === "Lỗi khác" && e.otherDesc
                            ? `Lỗi khác (${e.otherDesc})`
                            : e.key}{" "}
                          —{" "}
                          <StatusBadge tone="amber">
                            {e.severity || "Chưa khai mức độ"}
                          </StatusBadge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </ReviewBlock>

              {/* Thông tin đi kèm */}
              <ReviewBlock
                title="Thông tin đi kèm"
                editLabel="Phụ kiện · Bảo hành"
                onEdit={() => {
                  setReturnToReview(true);
                  goTo(SCREEN.ACCESSORIES);
                }}
                errors={errors.accessories || errors.warranty}
              >
                <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                  <Row
                    label="Phụ kiện tặng kèm"
                    value={
                      data.accessories.length
                        ? data.accessories
                            .map((a) =>
                              a === "Khác" && data.otherAccessory.trim()
                                ? `Khác: ${data.otherAccessory.trim()}`
                                : a
                            )
                            .join(", ")
                        : "Chưa khai"
                    }
                  />
                  <Row label="Bảo hành" value={buildWarrantyText(data.warranty)} />
                </dl>
                {data.description.trim() && (
                  <p className="mt-2 text-sm text-ink-700">
                    Mô tả bổ sung: {data.description.trim()}
                  </p>
                )}
              </ReviewBlock>

              {/* Giá và khu vực */}
              <ReviewBlock
                title="Giá bán và khu vực"
                editLabel="Giá · Khu vực"
                onEdit={() => {
                  setReturnToReview(true);
                  goTo(SCREEN.PRICE);
                }}
                errors={errors.price || errors.region}
              >
                <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                  <Row
                    label="Giá mong muốn"
                    value={
                      data.price
                        ? formatVND(parseInt((data.price || "").replace(/\./g, ""), 10) || 0)
                        : "Chưa nhập"
                    }
                  />
                  <Row
                    label="Tỉnh/thành"
                    value={data.region.province || "Chưa chọn"}
                  />
                  <Row label="Phường/xã" value={data.region.ward || "Chưa nhập"} />
                </dl>
                <p className="mt-2 rounded-lg bg-gray-50 p-2.5 text-xs text-ink-500">
                  {reviewReferenceText(draftReference)}
                </p>
              </ReviewBlock>

              {/* Liên hệ riêng */}
              <ReviewBlock
                title="Thông tin liên hệ"
                editLabel="Liên hệ"
                onEdit={() => {
                  setReturnToReview(true);
                  goTo(SCREEN.CONTACT);
                }}
                errors={errors.contact}
              >
                <p className="text-sm text-ink-700">
                  Số điện thoại liên hệ:{" "}
                  <strong>{data.contactPhone || "Chưa xác nhận"}</strong>
                </p>
                <p className="mt-1 text-xs text-ink-400">
                  Thông tin liên hệ được hệ thống sử dụng để liên hệ, không mặc
                  nhiên công khai trên tin đăng.
                </p>
              </ReviewBlock>

              {/* Xác nhận khai báo */}
              <div className="card mt-4 p-5">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-brand-500"
                    checked={data.confirmed}
                    onChange={(e) => update({ confirmed: e.target.checked })}
                  />
                  <span className="text-sm text-ink-700">
                    Tôi xác nhận thông tin và ảnh phản ánh đúng tình trạng máy
                    theo hiểu biết của tôi.
                  </span>
                </label>
                <FieldError msg={errors.confirmed} />
              </div>

              {/* Nút cuối luồng */}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button variant="outline" type="button" onClick={goBack}>
                  Quay lại
                </Button>
                <Button type="button" variant="ghost" onClick={() => saveDraft()}>
                  Lưu bản nháp
                </Button>
                <Button type="button" onClick={onPublish} disabled={submitting}>
                  {submitting ? "Đang đăng…" : "Đăng tin"}
                </Button>
              </div>
              {Object.keys(errors).length > 0 && (
                <p className="mt-3 text-sm font-medium text-red-600">
                  Còn thông tin chưa hợp lệ hoặc chưa khai — xem chi tiết tại
                  các khối trên.
                </p>
              )}
            </div>
          )}

          {screen === SCREEN.SUCCESS && (
            <div className="card p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <svg className="h-7 w-7 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <h2 className="mt-4 text-2xl font-bold text-ink-900">
                Tin đã được đăng
              </h2>
              <p className="mt-2 text-sm text-ink-500">
                Tin đăng được lưu trong dữ liệu mô phỏng của prototype (chưa
                có backend/database thật). Mã tin:{" "}
                <strong>{publishedId}</strong>
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Button
                  type="button"
                  onClick={() => navigate(`/phones/${publishedId}`)}
                >
                  Xem tin đăng
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/seller/listings")}
                >
                  Về danh sách tin đăng
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal hướng dẫn */}
      {help && (
        <HelpModal title={help.title} onClose={() => setHelp(null)}>
          {help.body}
        </HelpModal>
      )}

      {/* Modal xác nhận */}
      {confirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={confirm.title}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            confirm.onCancel?.();
            setConfirm(null);
          }}
        >
          <div
            className="card w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-ink-900">
              {confirm.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-700">
              {confirm.body}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  confirm.onCancel?.();
                  setConfirm(null);
                }}
              >
                Hủy
              </Button>
              <Button
                type="button"
                onClick={() => {
                  confirm.onConfirm();
                  setConfirm(null);
                }}
              >
                {confirm.confirmLabel || "Đồng ý"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------- Component phụ trong file --------------------- */

function ReviewBlock({ title, editLabel, onEdit, children, errors }) {
  return (
    <section className="card mt-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-ink-900">{title}</h3>
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          Chỉnh sửa {editLabel}
        </Button>
      </div>
      <div className="mt-3">{children}</div>
      {errors && (
        <p className="mt-2 text-xs font-medium text-red-600">{errors}</p>
      )}
    </section>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right font-medium text-ink-900">{value || "—"}</dd>
    </div>
  );
}

/** Build text bảo hành từ dữ liệu wizard. */
/** Tóm tắt giá tham khảo ở màn xem lại, cùng số liệu với bước nhập giá. */
function reviewReferenceText(ref) {
  if (!ref) return "Giá tham khảo: chưa tải được.";
  const used = ref.usedPrice;
  const parts = [];
  if (used?.status === "RANGE") {
    parts.push(`máy cũ tương tự đã bán ${formatVND(used.lowerPrice)} – ${formatVND(used.upperPrice)} (${ref.positionText.toLowerCase()})`);
  } else {
    parts.push("chưa đủ giao dịch máy cũ để tạo dải giá");
  }
  const np = ref.newPrice;
  if (np?.status === "RANGE") parts.push(`máy mới ${formatVND(np.lowerPrice)} – ${formatVND(np.upperPrice)}`);
  if (np?.status === "SINGLE_PRICE") parts.push(`máy mới ${formatVND(np.singlePrice)}`);
  return `Giá tham khảo: ${parts.join("; ")}.`;
}

function buildWarrantyText(w) {
  if (!w || !w.type) return "Chưa khai báo";
  if (w.type === "none") return "Hết bảo hành";
  if (w.type === "unknown") return "Không rõ";
  const parts = [];
  if (w.type === "manufacturer" || w.type === "both") {
    const expiry = w.manufacturer.unknownDate
      ? "Không rõ ngày"
      : w.manufacturer.expiry
        ? `hết hạn ${w.manufacturer.expiry}`
        : "không rõ ngày";
    parts.push(`Bảo hành hãng tại trung tâm ủy quyền (${expiry})`);
  }
  if (w.type === "store" || w.type === "both") {
    const expiry = w.store.unknownDate
      ? "Không rõ ngày"
      : w.store.expiry
        ? `hết hạn ${w.store.expiry}`
        : "không rõ ngày";
    parts.push(
      `Bảo hành cửa hàng ${w.store.name} (${w.store.address}, ${expiry})`
    );
  }
  return parts.join(" · ") || "Chưa khai báo";
}
