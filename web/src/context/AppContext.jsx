import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { phones as seedPhones } from "../data/phones";
import { transactions as seedTransactions, isValidReference } from "../data/transactions";
import { mockUsers, seedOrders, seedNegotiations } from "../data/users";
import {
  CARRIER_NAME,
  DELIVERY_FAILURE_KINDS,
  HANDOVER_METHODS,
  SHIPPING_EVENT_TEXT,
  nextShippingStatus,
  makeTrackingCode,
  estimateDelivery,
} from "../data/shipping";
import { checkReferenceEligibility, hasOpenSupport } from "../data/eligibility";
import {
  CASE_TYPE,
  CASE_TYPE_LABEL,
  CASE_DEADLINES,
  RETURN_SHIPMENT_STATUS,
  RETURN_SHIPMENT_STATUS_LABEL,
  RETURN_SHIPMENT_SEQUENCE,
  REFUND_STATUS,
  REFUND_STATUS_LABEL,
  REFUND_STATUS_TONE,
  VERIFICATION_STATUS,
  VERIFICATION_STATUS_LABEL,
  VERIFICATION_OUTCOME,
  VERIFICATION_OUTCOME_LABEL,
  RETURN_OBSTACLES,
  CASE_REASON_OPTIONS,
  RETURN_REASON_KEYS,
  activeCase,
  caseById,
  casesOf,
  isCaseOpen,
  isCaseClosed,
  makeEvidence,
  normalizeEvidenceList,
  planMissingFields,
  isPlanComplete,
  planTotals,
  buyerRejectChoiceDeadline,
  planReviewDeadline,
  returnHandoverDeadline,
  returnInspectDeadline,
  sellerReDecisionDeadline,
  sellerSupplementDeadline,
  canWithdrawCase,
  partyOf,
  isRefundRunning,
  isReturnInMotion,
  casePendingStep,
  remainingText,
  isOverdue,
  maskTracking,
  maskAddress,
  maskPaymentMethod,
} from "../data/caseRules";
import { buildDetailSet, getReferencePrice, getReferenceForProduct } from "../data/pricingApi";
import {
  CANCEL_PHASE,
  CLOSED_RETURN_STATUSES,
  MAX_DELIVERY_ATTEMPTS,
  OPEN_RETURN_STATUSES,
  PAYOUT_STATUS,
  PAYMENT_METHODS,
  PAYMENT_STATUS,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  PAYOUT_STATUS_LABEL,
  PAYOUT_STATUS_TONE,
  RETURN_REASON_OPTIONS,
  RETURN_STATUS,
  RETURN_STATUS_LABEL,
  RETURN_WINDOW_DAYS,
  SELLER_RESPONSE_HOURS,
  addDays,
  addHours,
  afterDeliveryWindowElapsed,
  canCancelOrder,
  canCollectCod,
  canRequestReturn,
  canRetryDelivery,
  canStartReturnToSeller,
  completionStatus,
  deliveryClock,
  deliveryFailureCount,
  hasCarrierHandover,
  initialPaymentStatus,
  isBuyerRefusal,
  isPaymentRefunded,
  isPaymentSettled,
  isRefundInProgress,
  isReturnOpen,
  isSellerResponseOverdue,
  makeCancelRecord,
  mustReturnToSeller,
  nextActorFor,
  nextCodPaymentStatus,
  openReturnRequests,
  shipmentNotYetHandedOver,
  sellerPayoutEligibility,
  sellerResponseDueAt,
  validateReturnRequest,
} from "../data/orderRules";
import {
  NEGOTIATION_STATUS,
  NEGOTIATION_STATUS_LABEL,
  NEGOTIATION_STATUS_TONE,
  OPEN_NEGOTIATION_STATUSES,
  canBuyerCreateOrder,
  canBuyerHandleCounter,
  canBuyerSendOffer,
  canSellerRespond,
  counterPriceBetween,
  isNegotiationOpen,
  lastBuyerOffer,
  roundPrice,
  isDuplicateBuyerOffer,
  validateOrderDraft,
} from "../data/negotiationRules";
import { PRICING_CONFIG } from "../data/pricingConfig";
import { referenceDataStatus, REFERENCE_STATUS } from "../data/pricingEngine";
import { withClusterIds } from "../data/clusterEngine";
import { computeAllSuspicionFlags } from "../data/suspicionFlags";
import {
  loadDemoState,
  saveDemoState,
  clearDemoState,
  DEMO_STATE_KEY,
} from "../utils/demoStorage";
import { formatVND, phoneName, formatDateTime } from "../utils/format";
import { loginAsRole, setToken } from "../api/client";

/** @deprecated Ngưỡng mẫu nay nằm ở `PRICING_CONFIG.minTransactions` (35) trong
 *  src/data/pricingConfig.js. Giữ hằng số này để tránh vỡ tương thích cũ. */
export const MIN_SAMPLES = 3;

/** Hình thức thanh toán (mô phỏng) — định nghĩa tại `orderRules.js`. */
export { PAYMENT_METHODS };

/** Loại yêu cầu hỗ trợ / khiếu nại / trả hàng (mô phỏng). */
export const SUPPORT_TYPES = [...RETURN_REASON_OPTIONS];

const AppContext = createContext(null);

const BRAND_COLORS = {
  Apple: { color: "#111827", colorDark: "#000000" },
  Samsung: { color: "#1D4ED8", colorDark: "#1E3A8A" },
  Xiaomi: { color: "#B45309", colorDark: "#78350F" },
  OPPO: { color: "#047857", colorDark: "#065F46" },
};

let counter = 0;
function nextId(prefix) {
  counter += 1;
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${counter
    .toString(36)
    .toUpperCase()}`;
}

const nowISO = () => new Date().toISOString().slice(0, 10);
const timeNow = () =>
  new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

/**
 * Chống trùng thông báo theo `id` (giữ bản ghi xuất hiện đầu tiên).
 *
 * Mỗi sự kiện nghiệp vụ đã có `id` riêng và ổn định (ví dụ `notif-order-<id>-delivered`),
 * nên hai SỰ KIỆN KHÁC NHAU không bao giờ trùng id. Hàm này chỉ loại bản ghi
 * trùng id — tức cùng một sự kiện bị đẩy nhiều lần (dữ liệu lặp/cũ) — và KHÔNG
 * gộp các sự kiện khác nhau lại với nhau.
 */
function dedupeNotifications(list) {
  const seen = new Set();
  const out = [];
  for (const n of list) {
    if (!n || seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
  }
  return out;
}

/** Chuẩn hoá danh sách bằng chứng (mô tả ảnh/video/tài liệu) cho yêu cầu trả hàng. */
function splitEvidence(evidence) {
  if (!evidence) return [];
  if (Array.isArray(evidence))
    return evidence.map((e) => String(e).trim()).filter(Boolean);
  return String(evidence)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function AppProvider({ children }) {
  /**
   * Khôi phục kịch bản demo đã lưu (localStorage) — nếu có và đúng phiên bản.
   * Đọc MỘT lần khi khởi tạo. Sau đó state là nguồn dữ liệu DUY NHẤT dùng chung
   * cho cả ba vai trò (người mua / người bán / QTV): chuyển vai chỉ đổi danh
   * tính, KHÔNG tạo bản sao đơn hàng và KHÔNG reset dữ liệu.
   */
  const bootstrap = useMemo(() => loadDemoState(), []);

  const [user, setUser] = useState(() => bootstrap?.user ?? null);
  const [listings, setListings] = useState(() =>
    Array.isArray(bootstrap?.listings) && bootstrap.listings.length
      ? bootstrap.listings
      : seedPhones
  );
  const [negotiations, setNegotiations] = useState(() =>
    Array.isArray(bootstrap?.negotiations)
      ? bootstrap.negotiations
      : seedNegotiations
  );
  const [transactions, setTransactions] = useState(() =>
    Array.isArray(bootstrap?.transactions)
      ? bootstrap.transactions
      : seedTransactions
  );
  // Quyết định của quản trị đối với TỪNG mã chi tiết giao dịch (dữ liệu tham
  // chiếu), TÁCH RIÊNG khỏi trạng thái nghiệp vụ đơn hàng.
  const [referenceOverrides, setReferenceOverrides] = useState(() =>
    bootstrap?.referenceOverrides && typeof bootstrap.referenceOverrides === "object"
      ? { ...bootstrap.referenceOverrides }
      : {}
  );
  const [toast, setToast] = useState(null);
  const [pendingCheckout, setPendingCheckout] = useState(null);

  /* --------------------------- Đơn hàng (model) --------------------------- */

  /**
   * Model đơn hàng (5 giai đoạn nghiệp vụ):
   *  status: PENDING_BUYER -> PENDING_SELLER -> CONFIRMED -> SHIPPING
   *          -> DELIVERED -> COMPLETED | CANCELLED | SELLER_REJECTED | REFUNDED
   *  paymentStatus: NOT_PAID | PENDING_CONFIRMATION | PAID | FAILED | REFUNDED
   *  shippingStatus: NOT_SHIPPED | HANDED_OVER | IN_TRANSIT | OUT_FOR_DELIVERY
   *                  | DELIVERED | FAILED | RETURNING
   *  orderVersion / versionValid: xác nhận theo phiên bản đơn hàng.
   *  confirmations: [{role, version, time}] — ghi nhận ai xác nhận phiên bản nào.
   *  history: [{time, actor, action, from, to, note}] — nhật ký nghiệp vụ.
   */

  /**
   * Chuyển trạng thái thanh toán cũ sang mô hình mới (Phần XVI).
   * KHÔNG tự coi COD là "đã thanh toán/đã đối soát".
   */
  const migratePaymentStatus = (ps, method) => {
    if (!ps) return null;
    if (ps === "NOT_PAID") return initialPaymentStatus(method);
    if (ps === "PENDING_CONFIRMATION")
      return method === "COD"
        ? PAYMENT_STATUS.PENDING_COD_COLLECTION
        : PAYMENT_STATUS.PENDING_PAYMENT;
    if (ps === "PAID") return method === "COD" ? PAYMENT_STATUS.COD_RECONCILED : PAYMENT_STATUS.PAID;
    // Các trạng thái mới giữ nguyên.
    return ps;
  };

  /** Suy diễn trạng thái thanh toán cho đơn mẫu cũ (tương thích). */
  const derivePaymentStatus = (o, method) => {
    if (o.paymentStatus) return migratePaymentStatus(o.paymentStatus, method);
    if (o.status === "REFUNDED") return PAYMENT_STATUS.REFUNDED;
    const settledLegacy = ["PAYMENT_DONE", "SHIPPING", "COMPLETED", "DELIVERED"].includes(o.status);
    if (settledLegacy) {
      if (method === "COD") {
        const delivered = o.status === "COMPLETED" || o.status === "DELIVERED";
        return delivered ? PAYMENT_STATUS.COD_RECONCILED : PAYMENT_STATUS.PENDING_COD_COLLECTION;
      }
      return PAYMENT_STATUS.PAID;
    }
    return initialPaymentStatus(method);
  };

  /** Suy diễn trạng thái vận chuyển từ trạng thái đơn hàng mẫu (tương thích). */
  const deriveShippingStatus = (status) => {
    if (status === "SHIPPING") return "IN_TRANSIT";
    if (status === "COMPLETED") return "DELIVERED";
    return "NOT_SHIPPED";
  };

  /** Suy diễn hình thức thanh toán từ mô tả ở đơn mẫu. */
  const paymentMethodOf = (paymentText, method) => {
    if (method) return method;
    return /nhận hàng|COD/i.test(paymentText || "") ? "COD" : "QR";
  };

  /** Sự kiện vận chuyển mô phỏng cho đơn mẫu đang giao / đã giao. */
  const seedShippingEvents = (rawStatus, createdAt) => {
    if (rawStatus === "SHIPPING") {
      return ["ACCEPTED", "SORTING", "IN_TRANSIT"].map((s) => ({
        time: `${createdAt || ""}`,
        status: s,
        from: null,
        to: s,
        location: SHIPPING_EVENT_TEXT[s].location,
        description: SHIPPING_EVENT_TEXT[s].desc,
        source: "SIMULATED",
        failureReason: null,
      }));
    }
    if (rawStatus === "COMPLETED") {
      return [
        "ACCEPTED",
        "SORTING",
        "IN_TRANSIT",
        "ARRIVED_HUB",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
      ].map((s) => ({
        time: `${createdAt || ""}`,
        status: s,
        from: null,
        to: s,
        location: SHIPPING_EVENT_TEXT[s].location,
        description: SHIPPING_EVENT_TEXT[s].desc,
        source: "SIMULATED",
        failureReason: null,
      }));
    }
    return [];
  };

  /** Chuẩn hóa một yêu cầu/hồ sơ trả hàng–khiếu nại về model mới. */
  const normalizeCaseRequest = (r, o) => {
    const type =
      r.type && CASE_TYPE[r.type] === r.type
        ? r.type
        : r.type === "Chưa nhận được hàng"
        ? CASE_TYPE.NOT_RECEIVED
        : CASE_TYPE.RETURN;
    const evidenceList =
      Array.isArray(r.evidenceList) && r.evidenceList.length
        ? r.evidenceList
        : normalizeEvidenceList(r.evidence, {
            by: r.createdBy,
            role: "buyer",
            at: r.createdAt,
          });
    return {
      ...r,
      id: r.id,
      caseId: r.id,
      orderId: r.orderId ?? o.id,
      type,
      reason: r.reason ?? r.type ?? null,
      reflectionNote: r.reflectionNote ?? "",
      status: r.status ?? RETURN_STATUS.PENDING_SELLER,
      createdAt: r.createdAt ?? o.createdAt,
      createdBy: r.createdBy ?? o.buyerName ?? "—",
      detectedAt: r.detectedAt ?? r.createdAt ?? o.createdAt,
      ownerId: r.ownerId ?? null,
      ownerName: r.ownerName ?? null,
      awaits: r.awaits ?? null,
      nextAction: r.nextAction ?? null,
      dueAt: r.dueAt ?? null,
      evidenceList,
      evidence: r.evidence ?? evidenceList.map((e) => e.text).filter(Boolean),
      messages: r.messages ?? [],
      history: r.history ?? [],
      internalNotes: r.internalNotes ?? [],
      plan: r.plan ?? null,
      verification: r.verification ?? null,
      returnShipment: r.returnShipment ?? null,
      refund: r.refund ?? null,
      prevCaseId: r.prevCaseId ?? null,
      sellerResponseDueAt: r.sellerResponseDueAt ?? sellerResponseDueAt(r),
      sellerRespondedAt: r.sellerRespondedAt ?? null,
    };
  };

  /** Bản thông tin đơn LÚC GIAO KẾT — đóng băng, không đổi khi tin đăng sửa. */
  const buildAgreementSnapshot = (phone, { price, fees = [] } = {}) => ({
    capturedAt: new Date().toISOString(),
    model: phone?.model ?? null,
    storage: phone?.storage ?? null,
    color: phone?.color ?? null,
    condition: phone?.condition ?? null,
    usageTime: phone?.usageTime ?? null,
    batteryHealth: phone?.batteryHealth ?? null,
    disclosedFaults: phone?.disclosedFaults ?? null,
    accessories: phone?.accessories ?? null,
    commitments: phone?.commitments ?? null,
    images: Array.isArray(phone?.images) ? phone.images : null,
    finalPrice: Number(price) || null,
    listingPrice: Number(phone?.price) || null,
    fees,
    policyVersion: "v1 (mô phỏng)",
    simulated: true,
  });

  /** Chuẩn hóa đơn hàng mẫu về model mới (không mất dữ liệu cũ). */
  const normalizeOrder = (o) => {
    let status = o.status;
    // Đơn mẫu cũ: PENDING_PAYMENT / PAYMENT_DONE tức đã được hai bên xác nhận.
    if (status === "PENDING_PAYMENT" || status === "PAYMENT_DONE") {
      status = "CONFIRMED";
    }
    const confirmed =
      status === "CONFIRMED" ||
      status === "SHIPPING" ||
      status === "DELIVERED" ||
      status === "COMPLETED" ||
      status === "REFUNDED";
    const shipped = o.status === "SHIPPING" || o.status === "COMPLETED";
    const delivered = o.status === "COMPLETED";
    const method = o.paymentMethod ?? paymentMethodOf(o.payment, o.paymentMethod);
    return {
      ...o,
      status,
      listingPrice: o.listingPrice ?? null,
      negotiatedPrice: o.negotiatedPrice ?? o.price,
      orderVersion: o.orderVersion ?? 1,
      versionValid: o.versionValid ?? true,
      confirmations:
        o.confirmations ??
        (confirmed
          ? [
              { role: "buyer", version: 1, time: o.createdAt },
              { role: "seller", version: 1, time: o.createdAt },
            ]
          : []),
      history:
        o.history ??
        (confirmed
          ? [
              {
                time: o.createdAt,
                actor: o.buyerName || "Người mua",
                action: "Người mua xác nhận đơn",
                from: "PENDING_BUYER",
                to: "PENDING_SELLER",
                note: "Dữ liệu mẫu.",
              },
              {
                time: o.createdAt,
                actor: o.sellerName || "Người bán",
                action: "Người bán xác nhận đơn",
                from: "PENDING_SELLER",
                to: "CONFIRMED",
                note: "Dữ liệu mẫu.",
              },
              ...(shipped
                ? [
                    {
                      time: o.createdAt,
                      actor: "Hệ thống (mô phỏng)",
                      action: "Bàn giao đơn vị vận chuyển (mô phỏng)",
                      from: "CONFIRMED",
                      to: "SHIPPING",
                      note: "Dữ liệu mẫu.",
                    },
                  ]
                : []),
              ...(delivered
                ? [
                    {
                      time: o.createdAt,
                      actor: o.buyerName || "Người mua",
                      action: "Người mua xác nhận nhận hàng",
                      from: "DELIVERED",
                      to: "COMPLETED",
                      note: "Dữ liệu mẫu.",
                    },
                  ]
                : []),
            ]
          : []),
      paymentMethod: method,
      paymentStatus: derivePaymentStatus(o, method),
      paymentHistory: o.paymentHistory ?? [],
      // ----- Vận chuyển (mô phỏng) -----
      carrier: o.carrier ?? (shipped ? CARRIER_NAME : null),
      trackingCode:
        o.trackingCode ??
        (shipped ? `RPXSEED-${(o.id || "").slice(-3)}` : null),
      handoverMethod: o.handoverMethod ?? (shipped ? "PICKUP" : null),
      prepareStatus: o.prepareStatus ?? (shipped ? "READY" : "NOT_READY"),
      etaDelivery: o.etaDelivery ?? (shipped ? "2026-10-06" : null),
      deliveredAt: o.deliveredAt ?? (delivered ? o.createdAt : null),
      receivedAt: o.receivedAt ?? (delivered ? o.createdAt : null),
      supportDeadline: o.supportDeadline ?? (delivered ? o.createdAt : null),
      supportExpired: o.supportExpired ?? false,
      shippingStatus: o.shippingStatus ?? deriveShippingStatus(o.status),
      shippingEvents:
        o.shippingEvents ?? seedShippingEvents(o.status, o.createdAt),
      supportRequests: (o.supportRequests ?? []).map((r) =>
        normalizeCaseRequest(r, o)
      ),
      // ----- Phần XVI: bằng chứng giao hàng, giao lại, huỷ, chi trả, hoàn tiền -----
      deliveryAttempts:
        o.deliveryAttempts ?? (o.shippingStatus === "FAILED" ? 1 : 0),
      deliveryProof:
        o.deliveryProof ??
        (delivered
          ? {
              at: o.deliveredAt || o.createdAt,
              source: "SIMULATED",
              notifiedAt: o.deliveredAt || o.createdAt,
              deadlineAt: addDays(o.deliveredAt || o.createdAt, RETURN_WINDOW_DAYS),
              simulated: true,
            }
          : null),
      cancelInfo:
        o.cancelInfo ??
        (o.status === "CANCELLED"
          ? {
              cancelledBy: o.buyerName || "—",
              cancelledById: null,
              cancelledByRole: null,
              cancelledAt: o.createdAt,
              reason: o.cancelReason || "",
              simulated: true,
            }
          : null),
      payout: o.payout ?? null,
      refund:
        o.refund ??
        (o.paymentStatus === "REFUNDED"
          ? { state: "REFUNDED", at: o.createdAt, simulated: true }
          : null),
      agreementSnapshot: o.agreementSnapshot ?? null,
      updatedAt: o.updatedAt ?? o.createdAt,
      transactionId: o.transactionId ?? null,
    };
  };

  const [orders, setOrders] = useState(() =>
    (Array.isArray(bootstrap?.orders) && bootstrap.orders.length
      ? bootstrap.orders
      : seedOrders
    ).map(normalizeOrder)
  );

  /* --------------------- Khu vực (localStorage) --------------------- */
  const REGION_KEY = "reprice_region";
  const [region, setRegionState] = useState(() => {
    try {
      return localStorage.getItem(REGION_KEY) || "";
    } catch {
      return "";
    }
  });

  const setRegion = useCallback(
    (value) => {
      setRegionState(value);
      try {
        if (value) localStorage.setItem(REGION_KEY, value);
        else localStorage.removeItem(REGION_KEY);
      } catch {
        /* localStorage không khả dụng (riêng tư) — bỏ qua */
      }
    },
    []
  );

  /* ---------------- Lưu kịch bản demo (localStorage) ----------------
   * Ghi lại trạng thái nghiệp vụ mỗi khi đổi, để F5 / mở lại phiên vẫn giữ
   * tiến trình và cả ba vai trò tiếp tục đọc đúng một nguồn dữ liệu.
   * `schemaVersion` trong demoStorage bảo vệ khỏi nạp dữ liệu cũ sai cấu trúc.
   */
  useEffect(() => {
    saveDemoState({ user, listings, orders, negotiations, transactions, referenceOverrides });
  }, [user, listings, orders, negotiations, transactions, referenceOverrides]);

  /* ---------------- Sản phẩm yêu thích (localStorage) ---------------- */
  const FAVORITES_KEY = "reprice_favorites";
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === "string");
      }
    } catch {
      /* bỏ qua */
    }
    // Dữ liệu mẫu cho prototype: 2 sản phẩm yêu thích.
    return ["P001", "P004"];
  });

  const persistFavorites = useCallback((next) => {
    setFavorites(next);
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    } catch {
      /* bỏ qua */
    }
  }, []);

  const isFavorite = useCallback(
    (phoneId) => favorites.includes(phoneId),
    [favorites]
  );

  /** Thêm/xóa sản phẩm yêu thích. Trả về true nếu đã thêm. */
  const toggleFavorite = useCallback(
    (phoneId) => {
      const has = favorites.includes(phoneId);
      const next = has
        ? favorites.filter((id) => id !== phoneId)
        : [...favorites, phoneId];
      persistFavorites(next);
      return !has;
    },
    [favorites, persistFavorites]
  );

  const removeFavorite = useCallback(
    (phoneId) => {
      if (!favorites.includes(phoneId)) return;
      persistFavorites(favorites.filter((id) => id !== phoneId));
    },
    [favorites, persistFavorites]
  );

  const showToast = useCallback((message, type = "success") => {
    setToast({ id: Date.now(), message, type });
  }, []);

  const clearToast = useCallback(() => setToast(null), []);

  /* ----------------------------- Auth (mock) ----------------------------- */

  /** Mock đăng nhập. Mặc định vai trò Người mua (demo chuyển vai qua header). */
  const login = useCallback((account, role = "buyer") => {
    const preset = mockUsers.find((u) => u.role === role) || mockUsers[0];
    setUser({ ...preset, account: (account || "").trim() });
  }, []);

  /** Mock đăng ký: ghi nhận tài khoản đã đăng ký (không tự động đăng nhập). */
  const [registeredAccounts, setRegisteredAccounts] = useState([]);
  const register = useCallback(({ name, email, phone }) => {
    setRegisteredAccounts((prev) =>
      prev.some((a) => a.email === email)
        ? prev
        : [...prev, { name, email, phone }]
    );
  }, []);

  /** Chuyển vai nhanh từ header hoặc trang thông báo (chỉ 3 vai, không có Khách). */
  const loginAs = useCallback((role) => {
    if (role === "guest") {
      setUser(null);
      return;
    }
    const preset = mockUsers.find((u) => u.role === role) || mockUsers[0];
    setUser(preset);
  }, []);

  /**
   * PHIÊN DEMO: cơ chế MÔ PHỎNG cho phép đổi vai trò để trình diễn.
   * KHÔNG phải xác thực thật — chỉ là quy ước của bản demo. Khi tắt, chỉ có
   * thể đăng nhập/đăng xuất qua trang đăng nhập.
   */
  const [demoMode, setDemoMode] = useState(true);
  const [roleSwitchLog, setRoleSwitchLog] = useState([]);

  /** Đổi vai trò trong phiên demo (chỉ khi demoMode bật) — giữ nguyên dữ liệu. */
  const switchRole = useCallback(
    (role) => {
      if (!demoMode)
        return {
          ok: false,
          reason: "Chuyển vai trò đang tắt cho phiên này.",
        };
      setRoleSwitchLog((prev) => [
        ...prev,
        {
          at: new Date().toISOString(),
          from: user?.role || "guest",
          to: role,
          by: user?.name || "Khách",
        },
      ]);
      loginAs(role);
      return { ok: true };
    },
    [demoMode, loginAs, user]
  );

  const logout = useCallback(() => setUser(null), []);

  /**
   * Phiên backend: mỗi khi vai trò đổi (đăng nhập, chuyển vai, đăng xuất, khôi phục phiên),
   * đăng nhập backend bằng tài khoản demo cùng vai trò. `apiSession` tăng sau khi xong,
   * để các trang đang dùng API tải lại với đúng người dùng.
   */
  const [apiSession, setApiSession] = useState(0);
  // Vai trò mà token backend hiện tại thuộc về; khác user.role nghĩa là đang đăng nhập lại.
  const [apiRole, setApiRole] = useState(null);
  const apiReady = apiRole === (user?.role || "guest");
  useEffect(() => {
    let alive = true;
    const role = user?.role || "guest";
    loginAsRole(role)
      .catch(() => setToken(null))
      .finally(() => {
        if (!alive) return;
        setApiRole(role);
        setApiSession((v) => v + 1);
      });
    return () => {
      alive = false;
    };
  }, [user?.role]);

  /** Cập nhật thông tin hồ sơ mô phỏng (Cài đặt tài khoản). */
  const updateProfile = useCallback((patch) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  /* ------------------------------- Listings ------------------------------ */

  const getPhone = useCallback(
    (id) => listings.find((p) => p.id === id) || null,
    [listings]
  );

  const addListing = useCallback(
    (data) => {
      const palette = BRAND_COLORS[data.brand] || BRAND_COLORS.Apple;
      const phone = {
        id: nextId("P"),
        brand: data.brand,
        model: data.model,
        storage: data.storage,
        condition: data.condition,
        usageTime: data.usageTime ?? `${Number(data.usageMonths)} tháng`,
        usageMonths: data.usageMonths ?? null,
        batteryHealth: Number(data.batteryHealth),
        price: Number(data.price),
        region: data.region,
        description: data.description,
        // Màu thực tế người bán khai (kể cả tên màu tự nhập) — hiển thị ở chi tiết.
        colorName: data.colorName || null,
        ram: data.ram || null,
        networkLock: data.networkLock || null,
        contactPhone: data.contactPhone || null,
        photoCount: data.photoCount ?? null,
        color: palette.color,
        colorDark: palette.colorDark,
        seller: { id: user.id, name: user.name, rating: 5.0, deals: 0 },
        listingStatus: "ACTIVE",
        listedMinutesAgo: 0,
        isNew: true,
        // Tin mới đăng chưa có dữ liệu tham khảo (chưa có giao dịch hợp lệ).
        referencePrice: null,
        referenceMin: null,
        referenceMax: null,
      };
      setListings((prev) => [phone, ...prev]);
      return phone;
    },
    [user]
  );

  const updateListingStatus = useCallback((id, status) => {
    setListings((prev) =>
      prev.map((p) => (p.id === id ? { ...p, listingStatus: status } : p))
    );
  }, []);

  /* --------------------------- Thương lượng ------------------------------ */

  /** Danh tính người đang thao tác (để kiểm tra đúng vai trò của phiên). */
  const actorOf = useCallback(
    () => ({ userId: user?.id || null, role: user?.role || null }),
    [user]
  );

  /**
   * Áp dụng thay đổi cho một phiên thương lượng.
   * Kiểm tra điều kiện trên state hiện tại để trả {ok} đúng, và kiểm tra lại
   * trong updater để chống tác động lặp (double-invoke / bấm nhiều lần).
   */
  const applyNegotiationChange = useCallback(
    (negId, validate, apply) => {
      const current = negotiations.find((n) => n.id === negId);
      if (!current)
        return { ok: false, reason: "Không tìm thấy phiên thương lượng." };
      const v = validate(current);
      if (v) return v;
      setNegotiations((prev) =>
        prev.map((n) => {
          if (n.id !== negId) return n;
          if (validate(n)) return n; // trạng thái đã đổi — bỏ qua
          return { ...apply(n), updatedAt: nowISO() };
        })
      );
      return { ok: true };
    },
    [negotiations]
  );

  /** Người mua khởi tạo phiên thương lượng cho một tin đăng. */
  const startNegotiation = useCallback(
    (phoneId) => {
      const phone = listings.find((p) => p.id === phoneId);
      if (!phone || !user) return null;
      if (user.role !== "buyer") return null; // chỉ người mua khởi tạo
      if (phone.seller?.id === user.id) return null; // không tự thương lượng máy của mình
      if (phone.listingStatus && phone.listingStatus !== "ACTIVE") return null;
      // Tái dùng phiên đã có của cùng máy + người mua (kể cả AGREED/REJECTED
      // để giữ nguyên lịch sử). Chỉ tạo mới khi chưa có hoặc phiên đã hủy.
      const existing = negotiations.find(
        (n) =>
          n.phoneId === phoneId &&
          n.buyerId === user.id &&
          n.status !== NEGOTIATION_STATUS.CANCELLED
      );
      if (existing) return existing.id;
      const neg = {
        id: nextId("NEG"),
        phoneId,
        buyerId: user.id,
        buyerName: user.name,
        sellerId: phone.seller.id,
        sellerName: phone.seller.name,
        listingPrice: Number(phone.price),
        createdAt: nowISO(),
        updatedAt: nowISO(),
        offers: [],
        status: NEGOTIATION_STATUS.AWAITING_SELLER,
        agreedPrice: null,
        counterPrice: null,
        orderId: null,
      };
      setNegotiations((prev) => [neg, ...prev]);
      return neg.id;
    },
    [listings, negotiations, user]
  );

  /** Người mua gửi đề nghị giá (tạo mới hoặc nối tiếp lịch sử phiên). */
  const sendOffer = useCallback(
    (negId, price, note = "") =>
      applyNegotiationChange(
        negId,
        (n) => {
          const p = Number(price);
          if (!Number.isFinite(p) || p <= 0)
            return { ok: false, reason: "Giá đề nghị phải là số hợp lệ lớn hơn 0." };
          const gate = canBuyerSendOffer(n, actorOf());
          if (!gate.allowed) return { ok: false, reason: gate.reason };
          // Chống gửi lặp khi bấm nhiều lần (double-click) hoặc gửi lại y nguyên
          // cùng một mức giá khi đề nghị đó còn đang chờ người bán phản hồi.
          if (isDuplicateBuyerOffer(n, price))
            return {
              ok: false,
              reason: "Đề nghị này vừa được gửi — vui lòng chờ người bán phản hồi.",
            };
          return null;
        },
        (n) => ({
          ...n,
          offers: [
            ...n.offers,
            {
              from: "buyer",
              price: roundPrice(price) ?? Number(price),
              note,
              time: timeNow(),
            },
          ],
          status: NEGOTIATION_STATUS.AWAITING_SELLER,
          agreedPrice: null,
          counterPrice: null,
        })
      ),
    [applyNegotiationChange, actorOf]
  );

  /**
   * Người bán phản hồi đề nghị đang chờ.
   * type: "accept" | "counter" | "reject". Counter mặc định lấy mức giá giữa
   * hai bên (làm tròn 10.000đ) nhưng có thể truyền mức giá cụ thể.
   */
  const sellerRespond = useCallback(
    (negId, type = "accept", counterPrice = null, note = "") =>
      applyNegotiationChange(
        negId,
        (n) => {
          const gate = canSellerRespond(n, actorOf());
          if (!gate.allowed) return { ok: false, reason: gate.reason };
          return null;
        },
        (n) => {
          const offer = lastBuyerOffer(n);
          const price = offer?.price ?? n.listingPrice;
          if (type === "reject") {
            return {
              ...n,
              offers: [
                ...n.offers,
                {
                  from: "seller",
                  price,
                  note: note || "Người bán đã từ chối giá thương lượng.",
                  time: timeNow(),
                },
              ],
              status: NEGOTIATION_STATUS.REJECTED,
              counterPrice: null,
            };
          }
          if (type === "counter") {
            const counter =
              roundPrice(counterPrice) ??
              counterPriceBetween(n.listingPrice, price) ??
              price;
            return {
              ...n,
              offers: [
                ...n.offers,
                {
                  from: "seller",
                  price: counter,
                  note: note || "Người bán đề nghị mức giá khác.",
                  time: timeNow(),
                },
              ],
              status: NEGOTIATION_STATUS.SELLER_COUNTER,
              counterPrice: counter,
              agreedPrice: null,
            };
          }
          return {
            ...n,
            offers: [
              ...n.offers,
              {
                from: "seller",
                price,
                note: note || "Người bán đã chấp nhận đề nghị.",
                time: timeNow(),
              },
            ],
            status: NEGOTIATION_STATUS.AGREED,
            agreedPrice: price,
            counterPrice: null,
          };
        }
      ),
    [applyNegotiationChange, actorOf]
  );

  /** Người mua chấp nhận đề nghị đối giá của người bán → chốt giá. */
  const acceptCounter = useCallback(
    (negId) =>
      applyNegotiationChange(
        negId,
        (n) => {
          const gate = canBuyerHandleCounter(n, actorOf());
          if (!gate.allowed) return { ok: false, reason: gate.reason };
          return null;
        },
        (n) => ({
          ...n,
          offers: [
            ...n.offers,
            {
              from: "buyer",
              price: n.counterPrice,
              note: "Người mua đã chấp nhận đề nghị của người bán.",
              time: timeNow(),
            },
          ],
          status: NEGOTIATION_STATUS.AGREED,
          agreedPrice: n.counterPrice,
        })
      ),
    [applyNegotiationChange, actorOf]
  );

  const cancelNegotiation = useCallback(
    (negId) =>
      applyNegotiationChange(
        negId,
        (n) => {
          if (n.buyerId !== user?.id)
            return { ok: false, reason: "Chỉ người mua của phiên mới hủy được phiên này." };
          if (n.status === NEGOTIATION_STATUS.AGREED)
            return { ok: false, reason: "Hai bên đã thống nhất giá — không hủy phiên ở bước này." };
          if (n.status === NEGOTIATION_STATUS.CANCELLED)
            return { ok: false, reason: "Phiên thương lượng đã hủy trước đó." };
          return null;
        },
        (n) => ({ ...n, status: NEGOTIATION_STATUS.CANCELLED, counterPrice: null })
      ),
    [applyNegotiationChange, user]
  );

  /** Người mua từ chối đề nghị đối giá của người bán.
   *  Phiên quay về trạng thái chờ — người mua gửi đề nghị mới. */
  const rejectCounter = useCallback(
    (negId) =>
      applyNegotiationChange(
        negId,
        (n) => {
          const gate = canBuyerHandleCounter(n, actorOf());
          if (!gate.allowed) return { ok: false, reason: gate.reason };
          return null;
        },
        (n) => ({
          ...n,
          offers: [
            ...n.offers,
            {
              from: "buyer",
              price: n.counterPrice,
              note: "Người mua đã từ chối đề nghị của người bán.",
              time: timeNow(),
            },
          ],
          status: NEGOTIATION_STATUS.AWAITING_SELLER,
          counterPrice: null,
        })
      ),
    [applyNegotiationChange, actorOf]
  );

  /** Tương thích tên cũ: người bán từ chối đề nghị (nay kiểm tra đúng vai trò). */
  const sellerReject = useCallback(
    (negId) => sellerRespond(negId, "reject"),
    [sellerRespond]
  );

  /* ------------------------------ Đơn hàng ------------------------------- */

  /** Cập nhật đơn hàng kèm thời điểm cập nhật. Trả về order cũ nếu không đổi. */
  const touchOrder = useCallback((orderId, updater) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        const next = updater(o);
        return next === o ? o : { ...next, updatedAt: nowISO() };
      })
    );
  }, []);

  /** Ghi nhật ký nghiệp vụ cho đơn hàng. */
  const appendHistory = (order, actor, action, from, to, note = "") => [
    ...order.history,
    { time: timeNow(), actor, action, from, to, note },
  ];

  /** Mốc thời gian đầy đủ (ngày + giờ) cho sự kiện vận chuyển. */
  const stamp = () => `${nowISO()} ${timeNow()}`;

  /** Thêm một sự kiện vận chuyển mô phỏng vào đơn. */
  const appendShippingEvent = (order, to, extra = {}) => [
    ...(order.shippingEvents || []),
    {
      time: stamp(),
      from: order.shippingStatus,
      to,
      status: to,
      location: SHIPPING_EVENT_TEXT[to]?.location || "—",
      description: extra.description || SHIPPING_EVENT_TEXT[to]?.desc || "",
      source: "SIMULATED",
      failureReason: extra.failureReason || null,
      failureKind: extra.failureKind || null,
      note: extra.note || null,
    },
  ];

  /**
   * Áp dụng thay đổi cho một đơn hàng.
   * - Kiểm tra điều kiện ĐỒNG BỘ trên state hiện tại để trả về {ok} đúng.
   * - Kiểm tra lại trong updater (chống double-invoke / thao tác lặp).
   * `validate` trả về object {ok:false, reason} khi không hợp lệ, hoặc falsy khi hợp lệ.
   * `apply` là hàm thuần tạo đơn mới (không gây side effect).
   */
  const applyOrderChange = useCallback(
    (orderId, validate, apply) => {
      const current = orders.find((o) => o.id === orderId);
      if (!current) return { ok: false, reason: "Không tìm thấy đơn hàng." };
      const v = validate(current);
      if (v) return v;
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== orderId) return o;
          if (validate(o)) return o; // trạng thái đã thay đổi — bỏ qua
          return { ...apply(o), updatedAt: nowISO() };
        })
      );
      return { ok: true };
    },
    [orders]
  );

  /** Cập nhật bản ghi giao dịch gắn với một đơn hàng. */
  const patchTransactionByOrder = useCallback((orderId, updater) => {
    setTransactions((prev) =>
      prev.map((t) => (t.orderId === orderId ? updater(t) : t))
    );
  }, []);

  /** Tạo bản ghi giao dịch từ đơn đã hoàn tất (mô phỏng). */
  const buildTransaction = (o, elig = checkReferenceEligibility(o)) => {
    return {
      id: nextId("TX"),
      orderId: o.id,
      phoneId: o.phoneId,
      buyer: o.buyerName,
      seller: o.sellerName,
      price: o.negotiatedPrice,
      listingPrice: o.listingPrice,
      negotiatedPrice: o.negotiatedPrice,
      transactionPrice: o.negotiatedPrice,
      date: nowISO(),
      status: "COMPLETED",
      paymentMethod: o.paymentMethod,
      // Chuẩn hoá "đã xác minh thanh toán" cho tầng engine (COD phải đối soát).
      paymentStatus: isPaymentSettled(o) ? "PAID" : o.paymentStatus,
      deliveryStatus: deliveryClock(o).hasProof ? "DELIVERED" : "IN_PROGRESS",
      deliveredAt: deliveryClock(o).verifiedAt || null,
      returnStatus:
        o.shippingStatus === "RETURNED"
          ? "RETURNED"
          : o.shippingStatus === "RETURNING"
          ? "RETURNING"
          : "NONE",
      refundStatus: isPaymentRefunded(o)
        ? "REFUNDED"
        : isRefundInProgress(o)
        ? "REFUNDING"
        : "NONE",
      disputeStatus: hasOpenSupport(o) ? "OPEN" : "NONE",
      verification: elig.eligible ? "PENDING" : "REJECTED",
      source: "SIMULATED",
      eligibility: elig,
      autoExcluded: !elig.eligible,
      verifiedBy: null,
      verifiedAt: null,
      note: elig.eligible
        ? "Giao dịch mô phỏng đủ điều kiện sơ bộ — chờ quản lý duyệt."
        : `Không đủ điều kiện đưa vào dữ liệu giá: ${elig.reasons.join("; ")}`,
    };
  };

  /**
   * Tự động tạo bản ghi giao dịch khi đơn đã hoàn tất (đã nhận hàng / hết hạn
   * hỗ trợ). Dùng useEffect + ref để tránh tạo trùng khi StrictMode gọi 2 lần.
   */
  const txCreatedRef = useRef(new Set());
  useEffect(() => {
    const candidates = orders.filter(
      (o) =>
        o.status === "COMPLETED" &&
        (o.receivedAt || o.supportExpired) &&
        !o.transactionId &&
        !txCreatedRef.current.has(o.id) &&
        !hasOpenSupport(o)
    );
    if (candidates.length === 0) return;
    const txs = [];
    candidates.forEach((o) => {
      const elig = checkReferenceEligibility(o);
      if (!elig.eligible) return; // chưa đủ điều kiện — chưa tạo bản ghi
      txCreatedRef.current.add(o.id);
      txs.push(buildTransaction(o, elig));
    });
    if (txs.length === 0) return;
    setTransactions((prev) => [...txs, ...prev]);
    setOrders((prev) =>
      prev.map((o) => {
        const tx = txs.find((t) => t.orderId === o.id);
        return tx && !o.transactionId ? { ...o, transactionId: tx.id } : o;
      })
    );
  }, [orders]);

  /**
   * ĐẶT LẠI KỊCH BẢN DEMO: xóa snapshot đã lưu và trả toàn bộ dữ liệu nghiệp vụ
   * về trạng thái mẫu ban đầu. KHÔNG tạo đơn mới, KHÔNG xóa chức năng; chỉ dùng
   * cho việc trình diễn/luyện tập.
   */
  const resetDemoState = useCallback(() => {
    clearDemoState();
    txCreatedRef.current = new Set();
    setUser(null);
    setListings(seedPhones);
    setNegotiations(seedNegotiations);
    setTransactions(seedTransactions);
    setReferenceOverrides({});
    setOrders(seedOrders.map(normalizeOrder));
    setPendingCheckout(null);
  }, []);

  /**
   * Tạo đơn hàng.
   * - Mua ngay: dùng giá rao hiện tại của tin đăng.
   * - Sau thương lượng: BẮT BUỘC dùng giá đã chốt (AGREED) của phiên; nếu phiên
   *   chưa thống nhất thì KHÔNG tạo đơn.
   * Lưu riêng giá đăng bán ban đầu và giá hai bên thống nhất.
   * Trạng thái ban đầu: Chờ người mua xác nhận (PENDING_BUYER).
   * Trả về { ok, orderId, reason, errors, listingChanged }.
   */
  const createOrder = useCallback(
    ({ phoneId, price, address, payment, negotiationId = null }) => {
      const phone = listings.find((p) => p.id === phoneId);
      if (!phone || !user)
        return { ok: false, reason: "Không tìm thấy tin đăng hoặc chưa đăng nhập." };
      if (user.role !== "buyer")
        return { ok: false, reason: "Chỉ Người mua tạo được đơn hàng." };
      const neg = negotiationId
        ? negotiations.find((n) => n.id === negotiationId)
        : null;
      if (negotiationId && !neg)
        return { ok: false, reason: "Không tìm thấy phiên thương lượng để tạo đơn." };
      // Kiểm tra lại dữ liệu (tin đăng/giá/phiên) trước khi tạo đơn.
      const check = validateOrderDraft({
        phone,
        negotiation: neg,
        buyerId: user.id,
        price,
      });
      if (!check.ok)
        return { ok: false, reason: check.errors[0], errors: check.errors };
      if (neg && neg.orderId)
        return { ok: false, reason: "Phiên thương lượng này đã tạo đơn hàng." };

      const negotiatedPrice = check.negotiatedPrice;
      const listingPrice = Number(phone.price);
      const now = nowISO();
      const order = {
        id: nextId("DH"),
        phoneId,
        listingPrice,
        negotiatedPrice,
        price: negotiatedPrice,
        buyerId: user.id,
        buyerName: user.name,
        sellerId: phone.seller.id,
        sellerName: phone.seller.name,
        address,
        payment,
        status: "PENDING_BUYER",
        orderVersion: 1,
        versionValid: true,
        confirmations: [],
        history: [
          {
            time: timeNow(),
            actor: user.name,
            action: "Tạo đơn hàng",
            from: null,
            to: "PENDING_BUYER",
            note: neg
              ? "Đơn được tạo theo giá hai bên đã thống nhất qua thương lượng."
              : "Đơn được tạo theo giá người bán rao (mua ngay).",
          },
        ],
        paymentMethod: paymentMethodOf(payment, null),
        paymentStatus: initialPaymentStatus(paymentMethodOf(payment, null)),
        paymentHistory: [],
        carrier: null,
        trackingCode: null,
        handoverMethod: null,
        prepareStatus: "NOT_READY",
        etaDelivery: null,
        deliveredAt: null,
        receivedAt: null,
        supportDeadline: null,
        supportExpired: false,
        shippingStatus: "NOT_SHIPPED",
        shippingEvents: [],
        supportRequests: [],
        deliveryAttempts: 0,
        deliveryProof: null,
        cancelInfo: null,
        payout: null,
        refund: null,
        agreementSnapshot: buildAgreementSnapshot(phone, {
          price: negotiatedPrice,
        }),
        createdAt: now,
        updatedAt: now,
        negotiationId,
        transactionId: null,
      };
      setOrders((prev) => [order, ...prev]);
      if (negotiationId) {
        setNegotiations((prev) =>
          prev.map((n) =>
            n.id === negotiationId ? { ...n, orderId: order.id } : n
          )
        );
      }
      return {
        ok: true,
        orderId: order.id,
        listingChanged: check.listingChanged,
      };
    },
    [listings, negotiations, user]
  );

  /**
   * Người mua xác nhận đơn hàng.
   * Chỉ người mua sở hữu đơn, đơn ở trạng thái PENDING_BUYER
   * và phiên bản còn hiệu lực mới được xác nhận.
   */
  const confirmOrderByBuyer = useCallback(
    (orderId) =>
      applyOrderChange(
        orderId,
        (o) => {
          if (o.buyerId !== user.id)
            return { ok: false, reason: "Bạn không phải người mua của đơn hàng này." };
          if (o.status !== "PENDING_BUYER")
            return { ok: false, reason: "Đơn hàng không ở trạng thái chờ người mua xác nhận." };
          if (!o.versionValid)
            return {
              ok: false,
              reason: "Phiên bản đơn hàng đã hết hiệu lực — cần xác nhận lại phiên bản mới.",
            };
          return null;
        },
        (o) => ({
          ...o,
          status: "PENDING_SELLER",
          confirmations: [
            ...o.confirmations,
            { role: "buyer", version: o.orderVersion, time: timeNow() },
          ],
          history: appendHistory(
            o,
            user.name,
            "Người mua xác nhận đơn",
            "PENDING_BUYER",
            "PENDING_SELLER"
          ),
        })
      ),
    [applyOrderChange, user]
  );

  /**
   * Người bán xác nhận hoặc từ chối đơn hàng.
   * Chỉ người bán của tin đăng, đơn ở trạng thái PENDING_SELLER
   * và phiên bản còn hiệu lực mới được thao tác.
   */
  const respondOrderBySeller = useCallback(
    (orderId, action, reason = "") =>
      applyOrderChange(
        orderId,
        (o) => {
          if (o.sellerId !== user.id)
            return { ok: false, reason: "Bạn không phải người bán của đơn hàng này." };
          if (o.status !== "PENDING_SELLER")
            return { ok: false, reason: "Đơn hàng không ở trạng thái chờ người bán xác nhận." };
          if (!o.versionValid)
            return { ok: false, reason: "Phiên bản đơn hàng đã hết hiệu lực." };
          return null;
        },
        (o) =>
          action === "confirm"
            ? {
                ...o,
                status: "CONFIRMED",
                confirmations: [
                  ...o.confirmations,
                  { role: "seller", version: o.orderVersion, time: timeNow() },
                ],
                history: appendHistory(
                  o,
                  user.name,
                  "Người bán xác nhận đơn",
                  "PENDING_SELLER",
                  "CONFIRMED"
                ),
              }
            : {
                ...o,
                status: "SELLER_REJECTED",
                rejectReason: reason,
                history: appendHistory(
                  o,
                  user.name,
                  "Người bán từ chối đơn",
                  "PENDING_SELLER",
                  "SELLER_REJECTED",
                  reason
                ),
              }
      ),
    [applyOrderChange, user]
  );

  /**
   * Hủy đơn — theo trạng thái + vai trò (Phần XVI.2).
   *  - Trước khi hai bên xác nhận: cho phép theo quyền/trạng thái.
   *  - Sau khi xác nhận nhưng chưa thanh toán: cho phép kèm ghi nhận người hủy,
   *    thời gian, lý do.
   *  - Sau khi đã thanh toán / hàng đã bàn giao: KHÔNG hủy thông thường — phải
   *    dùng luồng trả hàng/hoàn tiền/tranh chấp (trả về lý do để giao diện hướng dẫn).
   * Lịch sử đơn hàng và lịch sử giao dịch được GIỮ NGUYÊN.
   */
  const cancelOrder = useCallback(
    (orderId, reason = "") =>
      applyOrderChange(
        orderId,
        (o) => {
          const check = canCancelOrder(o, { userId: user?.id, role: user?.role });
          if (!check.allowed) return { ok: false, reason: check.reason };
          if (check.requiresReason && !String(reason || "").trim())
            return { ok: false, reason: "Sau khi hai bên xác nhận, cần ghi rõ lý do hủy." };
          return null;
        },
        (o) => {
          const voided = shipmentNotYetHandedOver(o);
          const record = {
            ...o,
            status: "CANCELLED",
            cancelReason: reason,
            cancelInfo: makeCancelRecord(user, reason, new Date().toISOString()),
            history: appendHistory(
              o,
              user?.name || "Hệ thống",
              "Hủy đơn hàng",
              o.status,
              "CANCELLED",
              voided
                ? `${reason} · Vận đơn ${o.trackingCode} đã hủy (chưa bàn giao cho đơn vị vận chuyển).`
                : reason
            ),
          };
          // Đã có vận đơn nhưng CHƯA bàn giao: hủy vận đơn theo khả năng hiện có
          // (không mặc định là đã gửi hàng).
          if (voided) {
            return {
              ...record,
              shippingStatus: "VOIDED",
              shippingEvents: appendShippingEvent(o, "VOIDED", {
                note: "Vận đơn hủy vì đơn hàng bị hủy trước khi bàn giao.",
              }),
            };
          }
          return record;
        }
      ),
    [applyOrderChange, user]
  );

  /* ==================== Thanh toán (mô phỏng) ==================== */

  /** Người mua chọn hình thức thanh toán (khi hai bên đã xác nhận). */
  const setOrderPaymentMethod = useCallback(
    (orderId, method) =>
      applyOrderChange(
        orderId,
        (o) => {
          if (o.buyerId !== user.id)
            return { ok: false, reason: "Chỉ người mua của đơn được chọn hình thức thanh toán." };
          if (o.status !== "CONFIRMED")
            return { ok: false, reason: "Chỉ chọn thanh toán khi hai bên đã xác nhận đơn." };
          if (isPaymentSettled(o) || isPaymentRefunded(o))
            return { ok: false, reason: "Đơn đã được thanh toán — không thể đổi hình thức thanh toán." };
          if (!PAYMENT_METHODS[method])
            return { ok: false, reason: "Hình thức thanh toán không hợp lệ." };
          return null;
        },
        (o) => ({
          ...o,
          paymentMethod: method,
          paymentStatus: initialPaymentStatus(method),
          payment: PAYMENT_METHODS[method],
          paymentHistory: [
            ...o.paymentHistory,
            {
              time: stamp(),
              event: `Chọn hình thức: ${PAYMENT_METHODS[method]}`,
              amount: o.negotiatedPrice,
            },
          ],
          history: appendHistory(
            o,
            user.name,
            "Chọn hình thức thanh toán",
            null,
            null,
            PAYMENT_METHODS[method]
          ),
        })
      ),
    [applyOrderChange, user]
  );

  /** Người mua khởi tạo thanh toán trước (mô phỏng). Chống tạo giao dịch trùng. */
  const initiateQrPayment = useCallback(
    (orderId) =>
      applyOrderChange(
        orderId,
        (o) => {
          if (o.buyerId !== user.id)
            return { ok: false, reason: "Chỉ người mua của đơn thao tác được." };
          if (o.paymentMethod !== "QR")
            return { ok: false, reason: "Đơn không dùng hình thức thanh toán trước." };
          if (isPaymentSettled(o))
            return { ok: false, reason: "Đơn đã được thanh toán." };
          if (o.paymentStatus === "FAILED")
            return { ok: false, reason: "Thanh toán trước đó thất bại — thử lại bằng nút thanh toán." };
          return null;
        },
        (o) => ({
          ...o,
          paymentStatus: PAYMENT_STATUS.PENDING_PAYMENT,
          paymentHistory: [
            ...o.paymentHistory,
            {
              time: stamp(),
              event: "Khởi tạo thanh toán trước (mô phỏng)",
              amount: o.negotiatedPrice,
              simulated: true,
            },
          ],
          history: appendHistory(
            o,
            user.name,
            "Khởi tạo thanh toán (mô phỏng)",
            null,
            PAYMENT_STATUS.PENDING_PAYMENT,
            "Chưa có cổng thanh toán thật — trạng thái mô phỏng."
          ),
        })
      ),
    [applyOrderChange, user]
  );

  /** Cổng thanh toán MÔ PHỎNG báo kết quả (thành công / thất bại). */
  const simulatePaymentResult = useCallback(
    (orderId, success) =>
      applyOrderChange(
        orderId,
        (o) => {
          if (o.paymentMethod === "COD")
            return { ok: false, reason: "Đơn COD dùng luồng thu tiền/đối soát, không dùng cổng thanh toán." };
          if (![PAYMENT_STATUS.PENDING_PAYMENT, PAYMENT_STATUS.FAILED].includes(o.paymentStatus))
            return { ok: false, reason: "Đơn không ở trạng thái chờ thanh toán." };
          return null;
        },
        (o) => {
          const to = success ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.FAILED;
          return {
            ...o,
            paymentStatus: to,
            paymentHistory: [
              ...o.paymentHistory,
              {
                time: stamp(),
                event: success
                  ? "Cổng thanh toán (mô phỏng) xác nhận thành công"
                  : "Cổng thanh toán (mô phỏng) báo thất bại",
                amount: o.negotiatedPrice,
                simulated: true,
              },
            ],
            history: appendHistory(
              o,
              "Hệ thống (mô phỏng)",
              success ? "Thanh toán thành công" : "Thanh toán thất bại",
              o.paymentStatus,
              to,
              "Mô phỏng — không phải giao dịch thanh toán thật."
            ),
          };
        }
      ),
    [applyOrderChange]
  );

  /**
   * Tiến một bước trong luồng thu tiền COD (mô phỏng): chờ thu → đã thu →
   * chờ đối soát → đã đối soát. KHÔNG nhảy thẳng sang "đã thanh toán".
   * Người bán hoặc quản lý thao tác.
   */
  const advanceCodPayment = useCallback(
    (orderId) =>
      applyOrderChange(
        orderId,
        (o) => {
          const allowed = o.sellerId === user?.id || user?.role === "manager";
          if (!allowed)
            return { ok: false, reason: "Chỉ người bán của đơn hoặc quản lý được cập nhật thu tiền COD." };
          if (o.paymentMethod !== "COD")
            return { ok: false, reason: "Đơn không thu tiền khi giao (COD)." };
          if (!canCollectCod(o))
            return { ok: false, reason: "Chỉ ghi nhận thu tiền COD sau khi đơn đã được giao thành công." };
          if (isPaymentRefunded(o) || isRefundInProgress(o))
            return { ok: false, reason: "Đơn đang/đã hoàn tiền — không cập nhật thu tiền." };
          if (!nextCodPaymentStatus(o.paymentStatus))
            return { ok: false, reason: "Đã đối soát COD xong — không còn bước tiếp theo." };
          return null;
        },
        (o) => {
          const to = nextCodPaymentStatus(o.paymentStatus);
          const label = PAYMENT_STATUS_LABEL[to];
          return {
            ...o,
            paymentStatus: to,
            paymentHistory: [
              ...o.paymentHistory,
              { time: stamp(), event: `${label} (mô phỏng)`, amount: o.negotiatedPrice, simulated: true },
            ],
            history: appendHistory(
              o,
              user?.name || "Hệ thống",
              `COD: ${label} (mô phỏng)`,
              o.paymentStatus,
              to,
              "Mô phỏng — chưa có đối soát đơn vị thu hộ thật."
            ),
          };
        }
      ),
    [applyOrderChange, user]
  );

  /* ============ Giao hàng (đơn vị vận chuyển mô phỏng) ============ */

  /** Đơn đã đủ điều kiện bắt đầu giao? (COD giao được dù chưa thu tiền) */
  const canStartShipping = useCallback(
    (o) =>
      !!o &&
      o.status === "CONFIRMED" &&
      (o.paymentStatus === "PAID" || o.paymentMethod === "COD"),
    []
  );

  /** Người bán xác nhận đã chuẩn bị hàng xong. */
  const prepareOrder = useCallback(
    (orderId) =>
      applyOrderChange(
        orderId,
        (o) => {
          if (o.sellerId !== user.id)
            return { ok: false, reason: "Chỉ người bán của đơn thao tác được." };
          if (!canStartShipping(o))
            return {
              ok: false,
              reason: "Đơn chưa đủ điều kiện giao hàng (chưa xác nhận hoặc chưa thanh toán).",
            };
          if (o.prepareStatus === "READY")
            return { ok: false, reason: "Hàng đã được đánh dấu chuẩn bị xong." };
          return null;
        },
        (o) => ({
          ...o,
          prepareStatus: "READY",
          shippingStatus: "PREPARING",
          shippingEvents: appendShippingEvent(o, "PREPARING"),
          history: appendHistory(o, user.name, "Chuẩn bị hàng xong", o.shippingStatus, "PREPARING"),
        })
      ),
    [applyOrderChange, user, canStartShipping]
  );

  /**
   * Người bán chọn hình thức bàn giao và TẠO MÃ VẬN ĐƠN (mô phỏng).
   * Chỉ tạo khi đơn đủ điều kiện, hàng đã sẵn sàng và CHƯA có mã vận đơn.
   */
  const createShipment = useCallback(
    (orderId, handoverMethod) =>
      applyOrderChange(
        orderId,
        (o) => {
          if (o.sellerId !== user.id)
            return { ok: false, reason: "Chỉ người bán của đơn tạo vận đơn." };
          if (!canStartShipping(o))
            return { ok: false, reason: "Đơn chưa đủ điều kiện giao hàng." };
          if (o.prepareStatus !== "READY")
            return { ok: false, reason: "Cần đánh dấu chuẩn bị hàng trước khi tạo vận đơn." };
          if (o.trackingCode)
            return { ok: false, reason: "Đơn đã có mã vận đơn — không tạo trùng." };
          if (!HANDOVER_METHODS[handoverMethod])
            return { ok: false, reason: "Hình thức bàn giao không hợp lệ." };
          return null;
        },
        (o) => {
          const trackingCode = makeTrackingCode(o.id);
          return {
            ...o,
            trackingCode,
            carrier: CARRIER_NAME,
            handoverMethod,
            etaDelivery: estimateDelivery(3),
            status: "SHIPPING",
            shippingStatus: "AWAITING_PICKUP",
            shippingEvents: appendShippingEvent(o, "AWAITING_PICKUP"),
            history: appendHistory(
              o,
              user.name,
              "Tạo vận đơn (mô phỏng)",
              "PREPARING",
              "AWAITING_PICKUP",
              `Mã vận đơn ${trackingCode} · ${HANDOVER_METHODS[handoverMethod]}`
            ),
          };
        }
      ),
    [applyOrderChange, user, canStartShipping]
  );

  /** Đẩy trạng thái vận chuyển sang bước kế tiếp (mô phỏng). Người bán hoặc quản lý. */
  const advanceShipping = useCallback(
    (orderId) =>
      applyOrderChange(
        orderId,
        (o) => {
          const allowed = o.sellerId === user?.id || user?.role === "manager";
          if (!allowed)
            return { ok: false, reason: "Chỉ người bán của đơn hoặc quản lý cập nhật vận chuyển." };
          if (!o.trackingCode) return { ok: false, reason: "Đơn chưa có vận đơn." };
          if (["DELIVERED", "FAILED", "RETURNING", "RETURNED"].includes(o.shippingStatus))
            return { ok: false, reason: "Đã ở trạng thái cuối hoặc nhánh đặc biệt — không tiến tiếp." };
          if (!nextShippingStatus(o.shippingStatus))
            return { ok: false, reason: "Không có bước vận chuyển kế tiếp." };
          return null;
        },
        (o) => {
          const next = nextShippingStatus(o.shippingStatus);
          const extra = {};
          if (next === "DELIVERED") {
            // Ghi nhận BẰNG CHỨNG giao hàng thành công (mô phỏng) + mốc 3 ngày.
            const at = new Date().toISOString();
            extra.deliveredAt = nowISO();
            extra.supportDeadline = estimateDelivery(RETURN_WINDOW_DAYS);
            extra.status = "DELIVERED";
            extra.deliveryProof = {
              at,
              source: "SIMULATED",
              notifiedAt: at,
              deadlineAt: addDays(at, RETURN_WINDOW_DAYS),
              simulated: true,
            };
          }
          return {
            ...o,
            ...extra,
            shippingStatus: next,
            shippingEvents: appendShippingEvent(o, next),
            history: appendHistory(
              o,
              user?.name || "Hệ thống",
              `Vận chuyển: ${next}`,
              o.shippingStatus,
              next,
              next === "DELIVERED"
                ? `Ghi nhận giao hàng thành công (mô phỏng). Mốc ${RETURN_WINDOW_DAYS} ngày bắt đầu từ bằng chứng này.`
                : "Cập nhật vận chuyển mô phỏng."
            ),
          };
        }
      ),
    [applyOrderChange, user]
  );

  /** Đánh dấu giao hàng KHÔNG thành công (mô phỏng). Ghi nhận sự kiện + loại lý do. */
  const markDeliveryFailed = useCallback(
    (orderId, reason = "", kind = "OTHER") =>
      applyOrderChange(
        orderId,
        (o) => {
          const isSeller = o.sellerId === user?.id;
          const isManager = user?.role === "manager";
          const isBuyer = o.buyerId === user?.id;
          if (!isSeller && !isManager && !isBuyer)
            return { ok: false, reason: "Không có quyền cập nhật vận chuyển." };
          if (o.shippingStatus !== "OUT_FOR_DELIVERY")
            return { ok: false, reason: "Chỉ ghi nhận giao không thành công khi đang giao cho người mua." };
          if (!DELIVERY_FAILURE_KINDS[kind])
            return { ok: false, reason: "Loại lý do giao không thành công không hợp lệ." };
          if (isBuyer && !isSeller && !isManager && kind !== "REFUSED")
            return { ok: false, reason: "Người mua chỉ có thể từ chối nhận hàng." };
          return null;
        },
        (o) => {
          const attempts = deliveryFailureCount(o) + 1;
          const refusal = kind === "REFUSED";
          return {
            ...o,
            shippingStatus: "FAILED",
            deliveryAttempts: attempts,
            lastDeliveryFailureKind: kind,
            lastDeliveryFailureAt: nowISO(),
            buyerRefusedAt: refusal ? nowISO() : o.buyerRefusedAt || null,
            shippingEvents: appendShippingEvent(o, "FAILED", {
              failureReason: reason || DELIVERY_FAILURE_KINDS[kind],
              failureKind: kind,
            }),
            history: appendHistory(
              o,
              user?.name || "Hệ thống",
              refusal ? "Người mua từ chối nhận hàng" : "Giao hàng không thành công",
              "OUT_FOR_DELIVERY",
              "FAILED",
              `${reason || DELIVERY_FAILURE_KINDS[kind]} (Lần ${attempts}/${MAX_DELIVERY_ATTEMPTS})`
            ),
          };
        }
      ),
    [applyOrderChange, user]
  );

  /** Giao lại sau khi thất bại — CHỈ một lần (mô phỏng). */
  const retryDelivery = useCallback(
    (orderId) =>
      applyOrderChange(
        orderId,
        (o) => {
          const allowed = o.sellerId === user?.id || user?.role === "manager";
          if (!allowed) return { ok: false, reason: "Không có quyền cập nhật vận chuyển." };
          if (o.shippingStatus !== "FAILED")
            return { ok: false, reason: "Chỉ giao lại khi đang ở trạng thái thất bại." };
          if (!canRetryDelivery(o))
            return {
              ok: false,
              reason: "Đã giao lại một lần — cần chuyển hoàn hàng về người bán.",
            };
          return null;
        },
        (o) => ({
          ...o,
          shippingStatus: "OUT_FOR_DELIVERY",
          shippingEvents: appendShippingEvent(o, "OUT_FOR_DELIVERY"),
          history: appendHistory(
            o,
            user?.name || "Hệ thống",
            "Giao lại hàng (mô phỏng)",
            "FAILED",
            "OUT_FOR_DELIVERY",
            "Lần giao lại duy nhất được phép."
          ),
        })
      ),
    [applyOrderChange, user]
  );

  /** Chuyển hoàn hàng về người bán (mô phỏng) sau khi không giao được/bị từ chối. */
  const startReturnToSeller = useCallback(
    (orderId) =>
      applyOrderChange(
        orderId,
        (o) => {
          const allowed = o.sellerId === user?.id || user?.role === "manager" || o.buyerId === user?.id;
          if (!allowed) return { ok: false, reason: "Không có quyền cập nhật vận chuyển." };
          if (!canStartReturnToSeller(o))
            return {
              ok: false,
              reason: "Chỉ chuyển hoàn sau khi người mua từ chối nhận hoặc đã giao lại và tiếp tục thất bại.",
            };
          return null;
        },
        (o) => ({
          ...o,
          shippingStatus: "RETURNING",
          shippingEvents: appendShippingEvent(o, "RETURNING"),
          history: appendHistory(
            o,
            user?.name || "Hệ thống",
            "Chuyển hoàn hàng về người bán (mô phỏng)",
            "FAILED",
            "RETURNING",
            isBuyerRefusal(o)
              ? "Người mua từ chối nhận hàng — chuyển sang quy trình hoàn hàng."
              : "Giao lại thất bại — chuyển sang quy trình hoàn hàng."
          ),
        })
      ),
    [applyOrderChange, user]
  );

  /**
   * Xác nhận người bán đã nhận lại hàng chuyển hoàn (mô phỏng) — CHỈ khi có
   * sự kiện vận chuyển xác nhận hàng đã về người bán. Cập nhật kết quả đơn và
   * xử lý thanh toán theo tình hình THỰC TẾ (không tự coi là đã hoàn tiền).
   */
  const markReturnedToSeller = useCallback(
    (orderId) =>
      applyOrderChange(
        orderId,
        (o) => {
          const allowed = o.sellerId === user?.id || user?.role === "manager" || o.buyerId === user?.id;
          if (!allowed) return { ok: false, reason: "Không có quyền cập nhật vận chuyển." };
          if (o.shippingStatus !== "RETURNING")
            return { ok: false, reason: "Đơn chưa ở bước chuyển hoàn." };
          return null;
        },
        (o) => {
          const isCodOrder = o.paymentMethod === "COD";
          const prepaidPaid = !isCodOrder && o.paymentStatus === PAYMENT_STATUS.PAID;
          let note = "Hàng đã về người bán. Xử lý khoản tiền theo phương thức thanh toán.";
          const patch = {};
          if (prepaidPaid) {
            // Đã thu tiền trước → chuyển sang ĐANG XỬ LÝ hoàn tiền (chưa phải kết quả hoàn).
            patch.paymentStatus = PAYMENT_STATUS.REFUND_PROCESSING;
            patch.refund = {
              id: o.refund?.id || `RF-${o.id}`,
              scope: "SHIPPING_RETURN",
              status: REFUND_STATUS.PROCESSING,
              totalAmount: o.negotiatedPrice,
              createdAt: stamp(),
              simulated: true,
            };
            note =
              "Hàng đã về người bán. Đơn đã thu tiền trước — chuyển sang hoàn tiền ĐANG XỬ LÝ (chưa có kết quả).";
          } else if (isCodOrder) {
            note =
              "Hàng đã về người bán. Đơn COD chưa thu tiền nên không phát sinh khoản hoàn.";
          }
          return {
            ...o,
            ...patch,
            shippingStatus: "RETURNED",
            shippingEvents: appendShippingEvent(o, "RETURNED"),
            history: appendHistory(
              o,
              user?.name || "Hệ thống",
              "Đã nhận lại hàng hoàn (mô phỏng)",
              "RETURNING",
              "RETURNED",
              note
            ),
          };
        }
      ),
    [applyOrderChange, user]
  );

  /**
   * Ghi nhận KẾT QUẢ hoàn tiền cho khoản hoàn do "hàng hoàn về người bán"
   * (mô phỏng) — chỉ quản lý, và chỉ khi đang ở trạng thái hoàn tiền đang xử lý.
   */
  const confirmOrderRefundDone = useCallback(
    (orderId) =>
      applyOrderChange(
        orderId,
        (o) => {
          if (user?.role !== "manager")
            return { ok: false, reason: "Chỉ quản lý xác nhận kết quả hoàn tiền." };
          if (o.refund?.scope !== "SHIPPING_RETURN")
            return { ok: false, reason: "Đơn không có khoản hoàn do hàng hoàn về người bán." };
          if (!isRefundInProgress(o))
            return { ok: false, reason: "Đơn không ở trạng thái đang hoàn tiền." };
          return null;
        },
        (o) => ({
          ...o,
          paymentStatus: PAYMENT_STATUS.REFUNDED,
          refund: {
            ...o.refund,
            status: REFUND_STATUS.DONE,
            completedAt: stamp(),
            by: user?.name || "Hệ thống",
          },
          history: appendHistory(
            o,
            user?.name || "Hệ thống",
            "Xác nhận hoàn tiền do hàng hoàn về (mô phỏng)",
            o.paymentStatus,
            PAYMENT_STATUS.REFUNDED,
            "Mô phỏng — không phải giao dịch hoàn tiền thật."
          ),
        })
      ),
    [applyOrderChange, user]
  );

  /**
   * Ghi nhận SỰ CỐ VẬN CHUYỂN (mô phỏng): giữ lịch sử sự kiện và chuyển sang
   * luồng báo vấn đề/xác minh hiện có. KHÔNG kết luận bên nào có lỗi.
   */
  const reportShippingIncident = useCallback(
    (orderId, note = "") =>
      applyOrderChange(
        orderId,
        (o) => {
          const allowed =
            o.sellerId === user?.id || o.buyerId === user?.id || user?.role === "manager";
          if (!allowed) return { ok: false, reason: "Không có quyền ghi nhận sự cố vận chuyển." };
          if (!o.trackingCode) return { ok: false, reason: "Đơn chưa có vận đơn để ghi nhận sự cố." };
          if (["DELIVERED", "RETURNED", "VOIDED"].includes(o.shippingStatus))
            return { ok: false, reason: "Đơn đã kết thúc — không ghi nhận sự cố vận chuyển." };
          return null;
        },
        (o) => {
          const detail = String(note || "").trim() || "Sự cố vận chuyển (mô phỏng).";
          return {
            ...o,
            shippingIncident: {
              at: stamp(),
              note: detail,
              by: user?.name || "Hệ thống",
              resolved: false,
              simulated: true,
            },
            shippingEvents: appendShippingEvent(o, "INCIDENT", { note: detail }),
            history: appendHistory(
              o,
              user?.name || "Hệ thống",
              "Ghi nhận sự cố vận chuyển",
              o.shippingStatus,
              "INCIDENT",
              `${detail} — chuyển luồng báo vấn đề/xác minh, chưa kết luận bên nào có lỗi.`
            ),
          };
        }
      ),
    [applyOrderChange, user]
  );

  /** Ghi nhận chi trả cho người bán (MÔ PHỎNG — không phải chuyển tiền thật). */
  const recordSellerPayout = useCallback(
    (orderId) =>
      applyOrderChange(
        orderId,
        (o) => {
          if (user?.role !== "manager" && o.sellerId !== user?.id)
            return { ok: false, reason: "Chỉ người bán của đơn hoặc quản lý ghi nhận chi trả." };
          const pay = sellerPayoutEligibility(o, new Date());
          if (pay.status === PAYOUT_STATUS.PAID_SIMULATED)
            return { ok: false, reason: "Đã ghi nhận chi trả trước đó." };
          if (pay.status !== PAYOUT_STATUS.ELIGIBLE)
            return { ok: false, reason: `Chưa đủ điều kiện chi trả: ${pay.reasons.join(" ")}` };
          return null;
        },
        (o) => ({
          ...o,
          payout: {
            status: PAYOUT_STATUS.PAID_SIMULATED,
            amount: o.negotiatedPrice,
            at: new Date().toISOString(),
            by: user?.name || "Hệ thống",
            simulated: true,
          },
          history: appendHistory(
            o,
            user?.name || "Hệ thống",
            "Ghi nhận chi trả cho người bán (mô phỏng)",
            null,
            null,
            "Mô phỏng — KHÔNG phải giao dịch chuyển tiền thật."
          ),
        })
      ),
    [applyOrderChange, user]
  );

  /** Người mua xác nhận đã nhận hàng (chỉ sau khi giao thành công). */
  const confirmReceipt = useCallback(
    (orderId) =>
      applyOrderChange(
        orderId,
        (o) => {
          if (o.buyerId !== user.id)
            return { ok: false, reason: "Chỉ người mua của đơn xác nhận nhận hàng." };
          if (o.shippingStatus !== "DELIVERED")
            return { ok: false, reason: "Chỉ xác nhận nhận hàng khi đơn đã giao thành công." };
          if (o.receivedAt) return { ok: false, reason: "Đã xác nhận nhận hàng trước đó." };
          if (hasOpenReturn(o))
            return { ok: false, reason: "Còn yêu cầu trả hàng/khiếu nại đang mở — chưa thể hoàn tất." };
          return null;
        },
        (o) => ({
          ...o,
          receivedAt: nowISO(),
          status: "COMPLETED",
          history: appendHistory(
            o,
            user.name,
            "Người mua xác nhận nhận hàng",
            "DELIVERED",
            "COMPLETED",
            "Mở thời hạn hỗ trợ/trả hàng theo quy định của đồ án."
          ),
        })
      ),
    [applyOrderChange, user]
  );

  /**
   * MÔ PHỎNG tác vụ hoàn tất tự động sau 3 ngày hậu giao hàng.
   * Thực tế phải do backend/scheduler chạy — nút này chỉ minh hoạ luồng.
   */
  const simulateSupportExpiry = useCallback(
    (orderId) =>
      applyOrderChange(
        orderId,
        (o) => {
          const allowed = o.buyerId === user?.id || user?.role === "manager";
          if (!allowed) return { ok: false, reason: "Không có quyền thao tác đơn này." };
          if (!deliveryClock(o).hasProof)
            return { ok: false, reason: "Đơn chưa có bằng chứng giao hàng thành công." };
          if (o.receivedAt || o.supportExpired)
            return { ok: false, reason: "Đơn đã được xác nhận nhận hàng/hoàn tất." };
          if (!afterDeliveryWindowElapsed(o))
            return { ok: false, reason: `Chưa hết ${RETURN_WINDOW_DAYS} ngày kể từ khi giao hàng thành công.` };
          if (hasOpenReturn(o))
            return { ok: false, reason: "Còn yêu cầu trả hàng/khiếu nại đang mở — chưa thể hoàn tất." };
          return null;
        },
        (o) => ({
          ...o,
          supportExpired: true,
          receivedAt: nowISO(),
          status: "COMPLETED",
          history: appendHistory(
            o,
            "Hệ thống",
            `Hoàn tất sau ${RETURN_WINDOW_DAYS} ngày hậu giao hàng`,
            "DELIVERED",
            "COMPLETED",
            "Hoàn tất sau thời hạn kiểm tra hàng kể từ mốc giao hàng thành công."
          ),
        })
      ),
    [applyOrderChange, user]
  );

  /* ============ Hỗ trợ / khiếu nại / trả hàng ============ */

  /**
   * Người mua tạo yêu cầu trả hàng/khiếu nại (trong thời hạn 3 ngày kể từ khi
   * hệ thống ghi nhận giao hàng thành công + đã thông báo).
   * Yêu cầu phải có lý do + mô tả (+ bằng chứng nếu có) + mã đơn/mã chi tiết.
   */
  const createSupportRequest = useCallback(
    (orderId, { type, reason, description, evidence }) => {
      const res = applyOrderChange(
        orderId,
        (o) => {
          if (o.buyerId !== user.id)
            return { ok: false, reason: "Chỉ người mua của đơn tạo yêu cầu." };
          const gate = canRequestReturn(o, new Date());
          if (!gate.allowed) return { ok: false, reason: gate.reason };
          const chosenReason = reason || type;
          const v = validateReturnRequest({
            reason: chosenReason,
            description,
            evidence,
            orderId: o.id,
          });
          if (!v.ok) return { ok: false, reason: v.errors.join(" ") };
          return null;
        },
        (o) => {
          const chosenReason = reason || type;
          const createdIso = new Date().toISOString();
          const evid = splitEvidence(evidence);
          const req = {
            id: nextId("YC"),
            type: chosenReason,
            reason: chosenReason,
            description: String(description || "").trim(),
            evidence: evid,
            orderId: o.id,
            detailId: `TXD-${o.id}-${o.phoneId || "P"}`,
            createdAt: createdIso,
            notifiedAt: createdIso,
            sellerResponseDueAt: addHours(createdIso, SELLER_RESPONSE_HOURS),
            sellerRespondedAt: null,
            createdBy: user.name,
            status: RETURN_STATUS.PENDING_SELLER,
            costResponsibility: null,
            managerDecision: null,
            resolution: null,
            resolvedBy: null,
            resolvedAt: null,
            simulated: true,
            messages: [
              { from: "buyer", text: String(description || "").trim(), time: stamp() },
              ...(evid.length
                ? [{ from: "buyer", text: `Bằng chứng: ${evid.join("; ")}`, time: stamp() }]
                : []),
            ],
            history: [
              {
                time: stamp(),
                actor: user.name,
                action: "Tạo yêu cầu trả hàng/khiếu nại",
                note: chosenReason,
              },
            ],
          };
          return {
            ...o,
            supportRequests: [...(o.supportRequests || []), req],
            history: appendHistory(
              o,
              user.name,
              "Tạo yêu cầu trả hàng/khiếu nại",
              null,
              null,
              chosenReason
            ),
          };
        }
      );
      if (res.ok) {
        patchTransactionByOrder(orderId, (t) =>
          t.verification === "VERIFIED" || t.verification === "PENDING"
            ? {
                ...t,
                verification: "DISPUTED",
                disputeStatus: "OPEN",
                note: "Đang có yêu cầu trả hàng/khiếu nại — tạm loại khỏi dữ liệu giá.",
              }
            : t
        );
      }
      return res;
    },
    [user, applyOrderChange, patchTransactionByOrder]
  );

  /** Người bán (hoặc quản lý) phản hồi yêu cầu trả hàng/khiếu nại. */
  const respondSupportRequest = useCallback(
    (orderId, reqId, { message, escalate = false }) =>
      applyOrderChange(
        orderId,
        (o) => {
          const req = (o.supportRequests || []).find((r) => r.id === reqId);
          if (!req) return { ok: false, reason: "Không tìm thấy yêu cầu." };
          const allowed = o.sellerId === user.id || user?.role === "manager";
          if (!allowed)
            return { ok: false, reason: "Chỉ người bán của đơn hoặc quản lý phản hồi." };
          if (!isReturnOpen(req))
            return { ok: false, reason: "Yêu cầu đã khép lại." };
          if (!message || !message.trim())
            return { ok: false, reason: "Chưa nhập nội dung phản hồi." };
          return null;
        },
        (o) => {
          const req = o.supportRequests.find((r) => r.id === reqId);
          const isManagerActor = user?.role === "manager";
          const nextStatus = escalate ? RETURN_STATUS.PENDING_MANAGER : RETURN_STATUS.IN_PROGRESS;
          const updatedReq = {
            ...req,
            status: nextStatus,
            // Chỉ tính là "người bán đã phản hồi" khi chính người bán trả lời.
            sellerRespondedAt: isManagerActor ? req.sellerRespondedAt : stamp(),
            messages: [
              ...req.messages,
              {
                from: isManagerActor ? "manager" : "seller",
                text: message.trim(),
                time: stamp(),
              },
            ],
            history: [
              ...req.history,
              {
                time: stamp(),
                actor: user?.name || "Hệ thống",
                action: escalate ? "Chuyển quản lý xử lý" : "Người bán phản hồi",
                note: message.trim(),
              },
            ],
          };
          return {
            ...o,
            supportRequests: o.supportRequests.map((r) => (r.id === reqId ? updatedReq : r)),
          };
        }
      ),
    [user, applyOrderChange]
  );

  /**
   * Quá hạn 48 giờ mà người bán chưa phản hồi: ghi nhận quá hạn và cho phép
   * chuyển vụ việc đến quản lý. KHÔNG tự kết luận ai đúng, KHÔNG tự đóng/hoàn tiền.
   */
  const escalateOverdueSupport = useCallback(
    (orderId, reqId) =>
      applyOrderChange(
        orderId,
        (o) => {
          const req = (o.supportRequests || []).find((r) => r.id === reqId);
          if (!req) return { ok: false, reason: "Không tìm thấy yêu cầu." };
          const allowed = o.buyerId === user?.id || user?.role === "manager";
          if (!allowed) return { ok: false, reason: "Không có quyền chuyển xử lý." };
          if (!isReturnOpen(req)) return { ok: false, reason: "Yêu cầu đã khép lại." };
          if (!isSellerResponseOverdue(req)) 
            return { ok: false, reason: "Người bán chưa quá hạn 48 giờ phản hồi." };
          return null;
        },
        (o) => {
          const req = o.supportRequests.find((r) => r.id === reqId);
          const updatedReq = {
            ...req,
            status: RETURN_STATUS.PENDING_MANAGER,
            overdueAt: stamp(),
            history: [
              ...req.history,
              {
                time: stamp(),
                actor: user?.name || "Hệ thống",
                action: "Quá hạn phản hồi của người bán — chuyển quản lý",
                note: "Quá 48 giờ người bán chưa phản hồi.",
              },
            ],
          };
          return {
            ...o,
            supportRequests: o.supportRequests.map((r) => (r.id === reqId ? updatedReq : r)),
            history: appendHistory(
              o,
              user?.name || "Hệ thống",
              "Chuyển quản lý do người bán quá hạn",
              null,
              null,
              "Quá 48 giờ chưa phản hồi — chưa kết luận đúng/sai."
            ),
          };
        }
      ),
    [user, applyOrderChange]
  );

  /**
   * Quản lý xử lý yêu cầu trả hàng/khiếu nại.
   * decision: "ACCEPT_RETURN" | "REJECT" | "NEEDS_INFO" | "REFUND_DIRECT"
   * `costResponsibility`: "SELLER" | "BUYER" | "ADMIN" (chi phí trả hàng).
   * Mọi quyết định lưu người xử lý, thời gian, kết quả và lý do.
   * KHÔNG tự động chi trả/hoàn tiền khi chưa có kết quả xác minh.
   */
  const resolveSupportRequest = useCallback(
    (orderId, reqId, decision, reason = "", costResponsibility = null) => {
      const res = applyOrderChange(
        orderId,
        (o) => {
          if (user?.role !== "manager")
            return { ok: false, reason: "Chỉ quản lý xử lý khiếu nại/hoàn trả." };
          const req = (o.supportRequests || []).find((r) => r.id === reqId);
          if (!req) return { ok: false, reason: "Không tìm thấy yêu cầu." };
          if (!isReturnOpen(req))
            return { ok: false, reason: "Yêu cầu đã khép lại." };
          return null;
        },
        (o) => {
          const req = o.supportRequests.find((r) => r.id === reqId);
          let patch = {};
          let status = req.status;
          let note = reason;
          if (decision === "ACCEPT_RETURN") {
            status = RETURN_STATUS.ACCEPTED_RETURN;
            patch = { shippingStatus: "RETURNING" };
            note = reason || "Đồng ý cho trả hàng — chờ nhận lại hàng.";
          } else if (decision === "REJECT") {
            status = RETURN_STATUS.REJECTED;
            note = reason || "Không đủ căn cứ trả hàng.";
          } else if (decision === "NEEDS_INFO") {
            status = RETURN_STATUS.NEEDS_INFO;
            note = reason || "Cần bổ sung bằng chứng.";
          } else if (decision === "REFUND_DIRECT") {
            // Khởi tạo quy trình hoàn tiền (chưa phải kết quả hoàn tiền thành công).
            status = RETURN_STATUS.REFUND_PROCESSING;
            patch = {
              paymentStatus: PAYMENT_STATUS.REFUND_PROCESSING,
              refund: { state: PAYMENT_STATUS.REFUND_PROCESSING, at: stamp(), by: user.name, simulated: true },
            };
            note = reason || "Khởi tạo hoàn tiền trực tiếp (mô phỏng) — chờ xác nhận kết quả.";
          }
          const updatedReq = {
            ...req,
            status,
            resolution: note,
            managerDecision: decision,
            costResponsibility: costResponsibility || req.costResponsibility || null,
            resolvedBy: user.name,
            resolvedAt: stamp(),
            history: [
              ...req.history,
              {
                time: stamp(),
                actor: user.name,
                action: `Quản lý: ${status}`,
                note: costResponsibility ? `${note} · Chi phí: ${costResponsibility}` : note,
              },
            ],
          };
          return {
            ...o,
            ...patch,
            supportRequests: o.supportRequests.map((r) => (r.id === reqId ? updatedReq : r)),
            history: appendHistory(
              o,
              user.name,
              "Quản lý xử lý yêu cầu trả hàng/khiếu nại",
              null,
              null,
              note
            ),
          };
        }
      );
      if (res.ok) {
        patchTransactionByOrder(orderId, (t) => {
          if (decision === "ACCEPT_RETURN") {
            return {
              ...t,
              verification: "DISPUTED",
              returnStatus: "RETURNING",
              note: "Đang xử lý hoàn hàng — chưa hợp lệ.",
            };
          }
          if (decision === "REFUND_DIRECT") {
            return {
              ...t,
              verification: "DISPUTED",
              refundStatus: "REFUNDING",
              note: "Đang xử lý hoàn tiền — chưa đưa vào dữ liệu giá.",
            };
          }
          return t;
        });
      }
      return res;
    },
    [user, applyOrderChange, patchTransactionByOrder]
  );

  /** Xác nhận đã nhận lại hàng hoàn (quản lý hoặc người bán). */
  const confirmReturnReceived = useCallback(
    (orderId, reqId) => {
      const res = applyOrderChange(
        orderId,
        (o) => {
          const req = (o.supportRequests || []).find((r) => r.id === reqId);
          if (!req) return { ok: false, reason: "Không tìm thấy yêu cầu." };
          const allowed = o.sellerId === user?.id || user?.role === "manager";
          if (!allowed) return { ok: false, reason: "Không có quyền xác nhận." };
          if (req.status !== RETURN_STATUS.ACCEPTED_RETURN && req.status !== RETURN_STATUS.RETURNING)
            return { ok: false, reason: "Yêu cầu chưa ở bước hoàn hàng." };
          return null;
        },
        (o) => {
          const req = o.supportRequests.find((r) => r.id === reqId);
          const updatedReq = {
            ...req,
            status: RETURN_STATUS.RETURNED,
            history: [
              ...req.history,
              {
                time: stamp(),
                actor: user?.name || "Hệ thống",
                action: "Đã nhận lại hàng hoàn",
                note: "Chờ xử lý khoản tiền theo phương thức thanh toán.",
              },
            ],
          };
          return {
            ...o,
            shippingStatus: "RETURNED",
            supportRequests: o.supportRequests.map((r) => (r.id === reqId ? updatedReq : r)),
            history: appendHistory(
              o,
              user?.name || "Hệ thống",
              "Nhận lại hàng hoàn",
              "RETURNING",
              "RETURNED"
            ),
          };
        }
      );
      if (res.ok) {
        patchTransactionByOrder(orderId, (t) => ({
          ...t,
          verification: "RETURNED",
          returnStatus: "RETURNED",
          note: "Đã hoàn hàng — không đưa vào dữ liệu giá.",
        }));
      }
      return res;
    },
    [user, applyOrderChange, patchTransactionByOrder]
  );

  /**
   * Bắt đầu hoàn tiền (mô phỏng) sau khi đã nhận lại hàng. CHƯA đánh dấu thành
   * công — chỉ chuyển sang "hoàn tiền đang xử lý".
   */
  const startRefund = useCallback(
    (orderId, reqId) => {
      const res = applyOrderChange(
        orderId,
        (o) => {
          if (user?.role !== "manager")
            return { ok: false, reason: "Chỉ quản lý khởi tạo hoàn tiền." };
          const req = caseById(o, reqId);
          if (!req) return { ok: false, reason: "Không tìm thấy hồ sơ." };
          const eligibleStatuses = [
            RETURN_STATUS.RETURNED,
            RETURN_STATUS.REFUND_ELIGIBLE,
            RETURN_STATUS.PLAN_EFFECTIVE,
          ];
          if (!eligibleStatuses.includes(req.status))
            return { ok: false, reason: "Hồ sơ chưa đủ điều kiện hoàn tiền." };
          if (
            req.plan?.requiresReturn &&
            !req.returnInspectedAt &&
            req.returnShipment?.status !== RETURN_SHIPMENT_STATUS.DELIVERED_INSPECT
          )
            return {
              ok: false,
              reason: "Cần nhận lại và kiểm tra hàng trả trước khi hoàn tiền.",
            };
          if (isPaymentRefunded(o))
            return { ok: false, reason: "Đơn đã hoàn tiền trước đó." };
          if (isRefundInProgress(o))
            return { ok: false, reason: "Đang xử lý hoàn tiền — không gửi lệnh trùng." };
          if (!isPaymentSettled(o))
            return { ok: false, reason: "Chưa có khoản tiền đã thu để hoàn." };
          if (req.refund && [REFUND_STATUS.PROCESSING, REFUND_STATUS.FAILED, REFUND_STATUS.RECONCILE].includes(req.refund.status))
            return { ok: false, reason: "Hồ sơ đã có giao dịch hoàn đang chạy." };
          return null;
        },
        (o) => {
          const req = caseById(o, reqId);
          const totals = planTotals(
            req.plan || { goodsAmount: o.negotiatedPrice, fees: [] }
          );
          const fromPlan = req.plan?.goodsAmount != null;
          const refundEntity = {
            id: nextId("RF"),
            caseId: req.id,
            orderId: o.id,
            paymentRefId: o.transactionId || null,
            goodsAmount: fromPlan ? totals.goods : o.negotiatedPrice,
            fees: req.plan?.fees || [],
            totalAmount: fromPlan ? totals.total : o.negotiatedPrice,
            method: req.plan?.refundMethod || "Hoàn về phương thức thanh toán gốc (mô phỏng)",
            status: REFUND_STATUS.PROCESSING,
            createdAt: stamp(),
            processedAt: null,
            completedAt: null,
            attempts: [{ at: stamp(), by: user.name, result: "PROCESSING" }],
            buyerReportedNotReceived: false,
            simulated: true,
          };
          const updatedReq = {
            ...req,
            status: RETURN_STATUS.REFUND_PROCESSING,
            awaits: "MANAGER",
            refund: refundEntity,
            history: [
              ...(req.history || []),
              caseHistoryEntry(
                user.name,
                "Khởi tạo hoàn tiền (mô phỏng)",
                `Tổng tiền hoàn: ${refundEntity.totalAmount}`
              ),
            ],
          };
          return {
            ...o,
            paymentStatus: PAYMENT_STATUS.REFUND_PROCESSING,
            refund: refundEntity,
            supportRequests: o.supportRequests.map((r) =>
              r.id === reqId ? updatedReq : r
            ),
            history: appendHistory(
              o,
              user.name,
              "Hoàn tiền đang xử lý (mô phỏng)",
              o.paymentStatus,
              PAYMENT_STATUS.REFUND_PROCESSING,
              "Mô phỏng — chưa có kết quả hoàn tiền được xác minh."
            ),
          };
        }
      );
      if (res.ok) {
        patchTransactionByOrder(orderId, (t) => ({
          ...t,
          verification: "DISPUTED",
          refundStatus: "REFUNDING",
          note: "Đang xử lý hoàn tiền — chưa đưa vào dữ liệu giá.",
        }));
      }
      return res;
    },
    [user, applyOrderChange, patchTransactionByOrder]
  );

  /** Ghi nhận KẾT QUẢ hoàn tiền (mô phỏng) — mới đánh dấu đã hoàn tiền. */
  const confirmRefundDone = useCallback(
    (orderId, reqId) => {
      const res = applyOrderChange(
        orderId,
        (o) => {
          if (user?.role !== "manager")
            return { ok: false, reason: "Chỉ quản lý xác nhận kết quả hoàn tiền." };
          const req = caseById(o, reqId);
          if (!req) return { ok: false, reason: "Không tìm thấy hồ sơ." };
          if (!isRefundInProgress(o))
            return { ok: false, reason: "Đơn không ở trạng thái đang hoàn tiền." };
          return null;
        },
        (o) => {
          const req = caseById(o, reqId);
          const refund = {
            ...(req.refund || {}),
            status: REFUND_STATUS.DONE,
            completedAt: stamp(),
            attempts: [
              ...(req.refund?.attempts || []),
              { at: stamp(), by: user.name, result: "DONE" },
            ],
            verified: "SIMULATED_RESULT",
          };
          const updatedReq = {
            ...req,
            status: RETURN_STATUS.REFUNDED,
            awaits: null,
            refund,
            resolution: "Đã hoàn tiền (kết quả mô phỏng).",
            closedAt: stamp(),
            history: [
              ...(req.history || []),
              caseHistoryEntry(user.name, "Xác nhận hoàn tiền thành công (mô phỏng)", ""),
            ],
          };
          return {
            ...o,
            paymentStatus: PAYMENT_STATUS.REFUNDED,
            refund,
            supportRequests: o.supportRequests.map((r) =>
              r.id === reqId ? updatedReq : r
            ),
            history: appendHistory(
              o,
              user.name,
              "Đã hoàn tiền (kết quả mô phỏng)",
              o.paymentStatus,
              PAYMENT_STATUS.REFUNDED,
              "Mô phỏng — không phải giao dịch hoàn tiền thật."
            ),
          };
        }
      );
      if (res.ok) {
        patchTransactionByOrder(orderId, (t) => ({
          ...t,
          verification: "RETURNED",
          status: "REFUNDED",
          refundStatus: "REFUNDED",
          note: "Đã hoàn tiền (mô phỏng) — không đưa vào dữ liệu giá.",
        }));
      }
      return res;
    },
    [user, applyOrderChange, patchTransactionByOrder]
  );

  /** Hoàn tiền THẤT BẠI/CHỜ ĐỐI SOÁT — KHÔNG tự đóng hồ sơ. */
  const markRefundFailed = useCallback(
    (orderId, reqId, reason = "") =>
      applyOrderChange(
        orderId,
        (o) => {
          if (user?.role !== "manager")
            return { ok: false, reason: "Chỉ quản lý ghi nhận kết quả hoàn tiền." };
          const req = caseById(o, reqId);
          if (!req?.refund) return { ok: false, reason: "Chưa có giao dịch hoàn tiền." };
          if (req.refund.status !== REFUND_STATUS.PROCESSING)
            return { ok: false, reason: "Giao dịch hoàn không ở trạng thái đang xử lý." };
          return null;
        },
        (o) => {
          const req = caseById(o, reqId);
          const refund = {
            ...req.refund,
            status: REFUND_STATUS.FAILED,
            failedAt: stamp(),
            failureReason: reason || "Kết quả lệnh hoàn chưa thành công (mô phỏng).",
            attempts: [
              ...(req.refund.attempts || []),
              { at: stamp(), by: user.name, result: "FAILED", note: reason },
            ],
          };
          return patchCase(o, reqId, (r) => ({
            ...r,
            status: RETURN_STATUS.REFUND_RECONCILE,
            awaits: "MANAGER",
            refund,
            history: [
              ...(r.history || []),
              caseHistoryEntry(
                user.name,
                "Hoàn tiền thất bại — chờ đối soát",
                refund.failureReason
              ),
            ],
          }));
        }
      ),
    [user, applyOrderChange]
  );

  /** Đối soát xong và xác nhận hoàn thành công (mô phỏng). */
  const confirmRefundReconcile = useCallback(
    (orderId, reqId) => {
      const res = applyOrderChange(
        orderId,
        (o) => {
          if (user?.role !== "manager")
            return { ok: false, reason: "Chỉ quản lý đối soát." };
          const req = caseById(o, reqId);
          if (!req?.refund) return { ok: false, reason: "Chưa có giao dịch hoàn tiền." };
          if (req.refund.status !== REFUND_STATUS.FAILED && req.refund.status !== REFUND_STATUS.RECONCILE)
            return { ok: false, reason: "Giao dịch hoàn không ở trạng thái chờ đối soát." };
          return null;
        },
        (o) => {
          const req = caseById(o, reqId);
          const refund = {
            ...req.refund,
            status: REFUND_STATUS.DONE,
            completedAt: stamp(),
            reconciledAt: stamp(),
            attempts: [
              ...(req.refund.attempts || []),
              { at: stamp(), by: user.name, result: "DONE", note: "Đối soát thành công." },
            ],
          };
          return {
            ...o,
            paymentStatus: PAYMENT_STATUS.REFUNDED,
            refund,
            supportRequests: o.supportRequests.map((r) =>
              r.id === reqId
                ? {
                    ...r,
                    status: RETURN_STATUS.REFUNDED,
                    awaits: null,
                    refund,
                    closedAt: stamp(),
                    history: [
                      ...(r.history || []),
                      caseHistoryEntry(user.name, "Đối soát hoàn tiền thành công (mô phỏng)", ""),
                    ],
                  }
                : r
            ),
            history: appendHistory(
              o,
              user.name,
              "Đối soát hoàn tiền thành công (mô phỏng)",
              null,
              PAYMENT_STATUS.REFUNDED,
              ""
            ),
          };
        }
      );
      if (res.ok) {
        patchTransactionByOrder(orderId, (t) => ({
          ...t,
          verification: "RETURNED",
          status: "REFUNDED",
          refundStatus: "REFUNDED",
        }));
      }
      return res;
    },
    [user, applyOrderChange, patchTransactionByOrder]
  );

  /** Người mua BÁO CHƯA NHẬN ĐƯỢC TIỀN HOÀN — không tự đóng hồ sơ. */
  const buyerReportRefundNotReceived = useCallback(
    (orderId, reqId, note = "") =>
      applyOrderChange(
        orderId,
        (o) => {
          const req = caseById(o, reqId);
          if (!req) return { ok: false, reason: "Không tìm thấy hồ sơ." };
          if (o.buyerId !== user?.id)
            return { ok: false, reason: "Chỉ người mua của đơn báo." };
          if (!req.refund) return { ok: false, reason: "Chưa có giao dịch hoàn tiền." };
          return null;
        },
        (o) =>
          patchCase(o, reqId, (r) => ({
            ...r,
            awaits: "MANAGER",
            refund: { ...r.refund, buyerReportedNotReceived: true, reportedAt: stamp() },
            messages: [
              ...(r.messages || []),
              {
                from: "buyer",
                text: `Báo chưa nhận được tiền hoàn: ${note || "(không ghi chú)"}`,
                time: stamp(),
              },
            ],
            history: [
              ...(r.history || []),
              caseHistoryEntry(user.name, "Người mua báo chưa nhận được tiền hoàn", note),
            ],
          }))
      ),
    [user, applyOrderChange]
  );

  /** Quản lý đóng hồ sơ (ghi rõ kết quả). */
  const closeCase = useCallback(
    (orderId, reqId, note = "") =>
      applyOrderChange(
        orderId,
        (o) => {
          if (user?.role !== "manager")
            return { ok: false, reason: "Chỉ quản lý đóng hồ sơ." };
          const req = caseById(o, reqId);
          if (!req) return { ok: false, reason: "Không tìm thấy hồ sơ." };
          if (req.refund && [REFUND_STATUS.PROCESSING, REFUND_STATUS.FAILED, REFUND_STATUS.RECONCILE].includes(req.refund.status))
            return { ok: false, reason: "Không đóng hồ sơ khi khoản hoàn chưa có kết quả." };
          return null;
        },
        (o) =>
          patchCase(o, reqId, (r) => ({
            ...r,
            status: RETURN_STATUS.CLOSED,
            awaits: null,
            closedAt: stamp(),
            resolution: note || r.resolution || "Đã đóng hồ sơ.",
            history: [
              ...(r.history || []),
              caseHistoryEntry(user.name, "Đóng hồ sơ", note),
            ],
          }))
      ),
    [user, applyOrderChange]
  );

  /* ============ Hồ sơ trả hàng – hoàn tiền – khiếu nại ============ */

  /** Cập nhật đúng một hồ sơ trong đơn. */
  const patchCase = (o, caseId, updater) => ({
    ...o,
    supportRequests: (o.supportRequests || []).map((r) =>
      r.id === caseId ? { ...updater(r, o), updatedAt: new Date().toISOString() } : r
    ),
  });

  const caseHistoryEntry = (actor, action, note = "", visibility = "PUBLIC") => ({
    time: stamp(),
    actor: actor || "Hệ thống",
    action,
    note,
    visibility,
  });

  /**
   * Mở hồ sơ mới (người mua). Mỗi đơn CHỈ có một hồ sơ đang hoạt động —
   * nếu đã có thì phải bổ sung vào hồ sơ đang mở, không tạo trùng.
   */
  const openCase = useCallback(
    (orderId, payload = {}) => {
      const {
        type = CASE_TYPE.RETURN,
        reason,
        description,
        detectedAt,
        evidenceText,
        evidenceFiles,
        reflectionNote,
      } = payload;
      const res = applyOrderChange(
        orderId,
        (o) => {
          if (o.buyerId !== user?.id)
            return { ok: false, reason: "Chỉ người mua của đơn được mở hồ sơ." };
          if (activeCase(o))
            return {
              ok: false,
              reason:
                "Đơn đang có một hồ sơ hoạt động — hãy bổ sung vào hồ sơ đang mở thay vì tạo mới.",
            };
          if (type === CASE_TYPE.RETURN) {
            const gate = canRequestReturn(o, new Date());
            if (!gate.allowed) return { ok: false, reason: gate.reason };
          } else if (type === CASE_TYPE.NOT_RECEIVED) {
            const shipped =
              !!o.trackingCode ||
              ["SHIPPING", "DELIVERED", "COMPLETED"].includes(o.status);
            if (!shipped)
              return { ok: false, reason: "Đơn chưa được giao đi nên chưa thể báo chưa nhận được hàng." };
          } else if (type === CASE_TYPE.DISPUTE) {
            if (o.status !== "COMPLETED")
              return { ok: false, reason: "Chỉ mở khiếu nại sau khi đơn đã hoàn tất." };
          }
          const v = validateReturnRequest({
            reason: reason || type,
            description,
            evidence: evidenceText,
            orderId: o.id,
          });
          if (!v.ok) return { ok: false, reason: v.errors.join(" ") };
          return null;
        },
        (o) => {
          const createdIso = new Date().toISOString();
          const prevClosed = [...(o.supportRequests || [])].reverse().find(isCaseClosed);
          const evList = normalizeEvidenceList(evidenceText, {
            by: user.name,
            role: "buyer",
            at: createdIso,
          });
          if (evidenceFiles && evidenceFiles.length) {
            evList.push(
              makeEvidence({
                by: user.name,
                role: "buyer",
                text: "Tệp đính kèm khi mở yêu cầu",
                files: evidenceFiles,
                at: createdIso,
              })
            );
          }
          const chosenReason = reason || CASE_TYPE_LABEL[type];
          const orderHistoryEntry = {
            time: stamp(),
            actor: user.name,
            action: `Mở hồ sơ ${CASE_TYPE_LABEL[type]}`,
            from: null,
            to: null,
            note: `${chosenReason}${prevClosed ? ` · nối tiếp hồ sơ ${prevClosed.id}` : ""}`,
          };
          const req = {
            id: nextId("HS"),
            caseId: null, // gán bên dưới
            orderId: o.id,
            type,
            reason: chosenReason,
            description: String(description || "").trim(),
            reflectionNote: String(reflectionNote || "").trim(),
            detectedAt: detectedAt || createdIso,
            createdAt: createdIso,
            notifiedAt: createdIso,
            createdBy: user.name,
            createdById: user.id,
            status: RETURN_STATUS.PENDING_SELLER,
            ownerId: null,
            ownerName: null,
            awaits: "SELLER",
            sellerResponseDueAt: addHours(createdIso, SELLER_RESPONSE_HOURS),
            sellerRespondedAt: null,
            buyerSupplementDueAt: null,
            sellerReDecisionDueAt: null,
            buyerRejectChoiceDueAt: null,
            infoRequestedOnce: false,
            evidenceList: evList,
            evidence: evList.map((e) => e.text).filter(Boolean),
            messages: [
              { from: "buyer", text: String(description || "").trim(), time: stamp() },
              ...(String(reflectionNote || "").trim()
                ? [
                    {
                      from: "buyer",
                      text: `Ghi chú phản ánh: ${String(reflectionNote).trim()}`,
                      time: stamp(),
                    },
                  ]
                : []),
              ...(evidenceText
                ? [{ from: "buyer", text: `Bằng chứng: ${evidenceText}`, time: stamp() }]
                : []),
            ],
            history: [
              {
                time: stamp(),
                actor: user.name,
                action: "Mở hồ sơ",
                note: chosenReason,
                visibility: "PUBLIC",
              },
            ],
            internalNotes: [],
            plan: null,
            verification: null,
            returnShipment: null,
            refund: null,
            prevCaseId: prevClosed?.id || null,
            costResponsibility: null,
            managerDecision: null,
            resolution: null,
            resolvedBy: null,
            resolvedAt: null,
            simulated: true,
          };
          req.caseId = req.id;
          return {
            ...o,
            supportRequests: [...(o.supportRequests || []), req],
            history: [...o.history, orderHistoryEntry],
          };
        }
      );
      if (res.ok) {
        patchTransactionByOrder(orderId, (t) =>
          t.verification === "VERIFIED" || t.verification === "PENDING"
            ? {
                ...t,
                verification: "DISPUTED",
                disputeStatus: "OPEN",
                note: "Đang có hồ sơ trả hàng/khiếu nại — tạm loại khỏi dữ liệu giá.",
              }
            : t
        );
      }
      return res;
    },
    [user, applyOrderChange, patchTransactionByOrder]
  );

  /** Bổ sung bằng chứng cho hồ sơ (đã gửi thì KHÔNG sửa/xóa, chỉ thêm mới). */
  const addCaseEvidence = useCallback(
    (orderId, caseId, { text, files, visibility = "PARTIES" } = {}) => {
      if (!text || !String(text).trim())
        return { ok: false, reason: "Chưa nhập nội dung bằng chứng." };
      return applyOrderChange(
        orderId,
        (o) => {
          const req = caseById(o, caseId);
          if (!req) return { ok: false, reason: "Không tìm thấy hồ sơ." };
          const party = partyOf(o, { userId: user?.id, role: user?.role });
          if (party === "OUTSIDER")
            return { ok: false, reason: "Bạn không thuộc đơn hàng này." };
          return null;
        },
        (o) => {
          const req = caseById(o, caseId);
          const party = partyOf(o, { userId: user?.id, role: user?.role });
          const ev = makeEvidence({
            by: user?.name,
            role: party?.toLowerCase?.() || null,
            text,
            files: files || [],
            visibility: party === "MANAGER" && visibility === "ADMIN" ? "ADMIN" : "PARTIES",
          });
          return patchCase(o, caseId, (r) => ({
            ...r,
            evidenceList: [...(r.evidenceList || []), ev],
            evidence: [...(r.evidence || []), ev.text].filter(Boolean),
            messages: [
              ...(r.messages || []),
              {
                from: party === "MANAGER" ? "manager" : party === "SELLER" ? "seller" : "buyer",
                text: `Bằng chứng: ${String(text).trim()}`,
                time: stamp(),
              },
            ],
            history: [
              ...(r.history || []),
              caseHistoryEntry(user?.name, "Bổ sung bằng chứng", String(text).trim()),
            ],
          }));
        }
      );
    },
    [user, applyOrderChange]
  );

  /**
   * Người bán phản hồi hồ sơ (VI.3):
   *  - AGREE: đồng ý trả hàng (xác nhận nơi nhận trả nếu có).
   *  - REJECT: từ chối (BẮT BUỘC lý do) → chờ người mua chọn trong 48 giờ.
   *  - REQUEST_INFO: đề nghị bổ sung (chỉ MỘT lượt) → chờ người mua 48 giờ.
   */
  const sellerRespondCase = useCallback(
    (orderId, caseId, action, payload = {}) => {
      const { note = "", receiverName = "", receiverAddress = "", files } = payload;
      const res = applyOrderChange(
        orderId,
        (o) => {
          const req = caseById(o, caseId);
          if (!req) return { ok: false, reason: "Không tìm thấy hồ sơ." };
          if (o.sellerId !== user?.id && user?.role !== "manager")
            return { ok: false, reason: "Chỉ người bán của đơn hoặc quản lý phản hồi." };
          if (req.status !== RETURN_STATUS.PENDING_SELLER)
            return { ok: false, reason: "Hồ sơ không ở bước chờ người bán phản hồi." };
          if (action === "REJECT" && !String(note).trim())
            return { ok: false, reason: "Từ chối BẮT BUỘC phải nhập lý do." };
          if (action === "REQUEST_INFO" && !String(note).trim())
            return { ok: false, reason: "Cần ghi rõ cần làm rõ điều gì." };
          if (action === "REQUEST_INFO" && req.infoRequestedOnce)
            return {
              ok: false,
              reason: "Đề nghị bổ sung chỉ được một lượt trong giai đoạn trao đổi trực tiếp.",
            };
          return null;
        },
        (o) => {
          const req = caseById(o, caseId);
          const nowIso = new Date().toISOString();
          let upd;
          if (action === "AGREE") {
            const complete = !!(receiverName && receiverAddress);
            upd = {
              ...req,
              status: complete
                ? RETURN_STATUS.RETURN_AWAITING_HANDOVER
                : RETURN_STATUS.RETURN_PENDING_INFO,
              awaits: complete ? "BUYER" : "SELLER",
              sellerRespondedAt: stamp(),
              returnShipment: {
                id: nextId("RT"),
                carrier: CARRIER_NAME,
                trackingCode: null,
                receiverName: receiverName || null,
                receiverAddress: receiverAddress || null,
                fees: req.returnShipment?.fees || [],
                payer: req.returnShipment?.payer || null,
                status: complete
                  ? RETURN_SHIPMENT_STATUS.AWAITING_HANDOVER
                  : RETURN_SHIPMENT_STATUS.PENDING_INFO,
                handoverDueAt: complete ? returnHandoverDeadline(nowIso) : null,
                events: [],
                simulated: true,
              },
            };
          } else if (action === "REJECT") {
            upd = {
              ...req,
              status: RETURN_STATUS.AFTER_REJECT_BUYER,
              awaits: "BUYER",
              sellerRespondedAt: stamp(),
              buyerRejectChoiceDueAt: buyerRejectChoiceDeadline(nowIso),
            };
          } else {
            upd = {
              ...req,
              status: RETURN_STATUS.SELLER_SUPPLEMENT,
              awaits: "BUYER",
              sellerRespondedAt: stamp(),
              infoRequestedOnce: true,
              buyerSupplementDueAt: sellerSupplementDeadline(nowIso),
            };
          }
          const evList = files && files.length
            ? [
                ...(req.evidenceList || []),
                makeEvidence({ by: user?.name, role: "seller", text: note || "Bằng chứng người bán", files }),
              ]
            : req.evidenceList || [];
          return patchCase(o, caseId, () => ({
            ...upd,
            evidenceList: evList,
            messages: [
              ...(req.messages || []),
              {
                from: "seller",
                text:
                  action === "AGREE"
                    ? note || "Người bán đồng ý cho trả hàng."
                    : action === "REJECT"
                    ? `Người bán từ chối: ${note}`
                    : `Người bán đề nghị bổ sung: ${note}`,
                time: stamp(),
              },
            ],
            history: [
              ...(req.history || []),
              caseHistoryEntry(
                user?.name,
                action === "AGREE"
                  ? "Người bán đồng ý trả hàng"
                  : action === "REJECT"
                  ? "Người bán từ chối yêu cầu"
                  : "Người bán đề nghị bổ sung",
                note
              ),
            ],
          }));
        }
      );
      return res;
    },
    [user, applyOrderChange]
  );

  /** Người mua BỔ SUNG sau khi người bán/quản lý yêu cầu (VI.4 / VII). */
  const buyerSupplementCase = useCallback(
    (orderId, caseId, { text, files } = {}) => {
      if (!text || !String(text).trim())
        return { ok: false, reason: "Chưa nhập nội dung bổ sung." };
      return applyOrderChange(
        orderId,
        (o) => {
          const req = caseById(o, caseId);
          if (!req) return { ok: false, reason: "Không tìm thấy hồ sơ." };
          if (o.buyerId !== user?.id)
            return { ok: false, reason: "Chỉ người mua của đơn bổ sung." };
          if (
            ![RETURN_STATUS.SELLER_SUPPLEMENT, RETURN_STATUS.NEEDS_INFO].includes(
              req.status
            )
          )
            return { ok: false, reason: "Hồ sơ không ở bước chờ người mua bổ sung." };
          return null;
        },
        (o) => {
          const req = caseById(o, caseId);
          const nowIso = new Date().toISOString();
          const evList = [
            ...(req.evidenceList || []),
            makeEvidence({ by: user.name, role: "buyer", text, files: files || [] }),
          ];
          const backToSeller = req.status === RETURN_STATUS.SELLER_SUPPLEMENT;
          return patchCase(o, caseId, (r) => ({
            ...r,
            status: backToSeller ? RETURN_STATUS.IN_PROGRESS : RETURN_STATUS.UNDER_REVIEW,
            awaits: backToSeller ? "SELLER" : "MANAGER",
            sellerReDecisionDueAt: backToSeller
              ? sellerReDecisionDeadline(nowIso)
              : r.sellerReDecisionDueAt,
            evidenceList: evList,
            evidence: [...(r.evidence || []), String(text).trim()],
            messages: [
              ...(r.messages || []),
              { from: "buyer", text: `Bổ sung: ${String(text).trim()}`, time: stamp() },
            ],
            history: [
              ...(r.history || []),
              caseHistoryEntry(user?.name, "Người mua bổ sung thông tin", String(text).trim()),
            ],
          }));
        }
      );
    },
    [user, applyOrderChange]
  );

  /**
   * Sau khi người bán từ chối (VI.5): người mua chọn "yêu cầu RePrice giải quyết"
   * (ESCALATE) hoặc "đồng ý kết thúc" (CLOSE). Không phản hồi ⇒ chuyển admin,
   * KHÔNG coi im lặng là đồng ý.
   */
  const buyerChooseAfterReject = useCallback(
    (orderId, caseId, decision) =>
      applyOrderChange(
        orderId,
        (o) => {
          const req = caseById(o, caseId);
          if (!req) return { ok: false, reason: "Không tìm thấy hồ sơ." };
          if (o.buyerId !== user?.id)
            return { ok: false, reason: "Chỉ người mua của đơn thao tác." };
          if (req.status !== RETURN_STATUS.AFTER_REJECT_BUYER)
            return { ok: false, reason: "Hồ sơ không ở bước chờ người mua chọn." };
          return null;
        },
        (o) => {
          const req = caseById(o, caseId);
          const escalate = decision === "ESCALATE";
          return patchCase(o, caseId, (r) => ({
            ...r,
            status: escalate ? RETURN_STATUS.PENDING_MANAGER : RETURN_STATUS.CLOSED,
            awaits: escalate ? "MANAGER" : null,
            resolution: escalate
              ? "Người mua yêu cầu RePrice giải quyết."
              : "Người mua đồng ý kết thúc yêu cầu.",
            closedAt: escalate ? r.closedAt : stamp(),
            history: [
              ...(r.history || []),
              caseHistoryEntry(
                user?.name,
                escalate ? "Người mua yêu cầu RePrice giải quyết" : "Người mua đồng ý kết thúc",
                ""
              ),
            ],
          }));
        }
      ),
    [user, applyOrderChange]
  );

  /** Rút yêu cầu (VI.6) — có hộp thoại hệ quả; chặn nếu hàng đã gửi trả/hoàn tiền. */
  const withdrawCase = useCallback(
    (orderId, caseId, reason = "") =>
      applyOrderChange(
        orderId,
        (o) => {
          const req = caseById(o, caseId);
          if (!req) return { ok: false, reason: "Không tìm thấy hồ sơ." };
          const gate = canWithdrawCase(o, req, { userId: user?.id, role: user?.role });
          if (!gate.allowed) return { ok: false, reason: gate.reason };
          return null;
        },
        (o) => {
          const req = caseById(o, caseId);
          return patchCase(o, caseId, (r) => ({
            ...r,
            status: RETURN_STATUS.WITHDRAWN,
            awaits: null,
            withdrawnAt: stamp(),
            resolution: reason ? `Người mua rút yêu cầu: ${reason}` : "Người mua rút yêu cầu.",
            closedAt: stamp(),
            history: [
              ...(r.history || []),
              caseHistoryEntry(user?.name, "Người mua rút yêu cầu", reason),
            ],
          }));
        }
      ),
    [user, applyOrderChange]
  );

  /** Quản lý nhận phụ trách hồ sơ (VII). */
  const managerTakeCase = useCallback(
    (orderId, caseId) =>
      applyOrderChange(
        orderId,
        (o) => {
          if (user?.role !== "manager")
            return { ok: false, reason: "Chỉ quản lý nhận phụ trách." };
          const req = caseById(o, caseId);
          if (!req) return { ok: false, reason: "Không tìm thấy hồ sơ." };
          if (!isCaseOpen(req)) return { ok: false, reason: "Hồ sơ đã khép lại." };
          return null;
        },
        (o) => {
          const req = caseById(o, caseId);
          return patchCase(o, caseId, (r) => ({
            ...r,
            status: RETURN_STATUS.UNDER_REVIEW,
            awaits: "MANAGER",
            ownerId: user.id,
            ownerName: user.name,
            history: [
              ...(r.history || []),
              caseHistoryEntry(user.name, "Quản lý nhận phụ trách", ""),
            ],
          }));
        }
      ),
    [user, applyOrderChange]
  );

  /** Quản lý yêu cầu bổ sung (VII). */
  const managerRequestCaseInfo = useCallback(
    (orderId, caseId, note, awaits = "BUYER") => {
      if (!String(note || "").trim())
        return { ok: false, reason: "Cần ghi rõ nội dung cần bổ sung." };
      return applyOrderChange(
        orderId,
        (o) => {
          if (user?.role !== "manager")
            return { ok: false, reason: "Chỉ quản lý yêu cầu bổ sung." };
          const req = caseById(o, caseId);
          if (!req) return { ok: false, reason: "Không tìm thấy hồ sơ." };
          if (!isCaseOpen(req)) return { ok: false, reason: "Hồ sơ đã khép lại." };
          return null;
        },
        (o) => {
          const req = caseById(o, caseId);
          return patchCase(o, caseId, (r) => ({
            ...r,
            status: RETURN_STATUS.NEEDS_INFO,
            awaits,
            infoDueAt: addHours(new Date().toISOString(), CASE_DEADLINES.BUYER_SUPPLEMENT_HOURS),
            messages: [
              ...(r.messages || []),
              { from: "manager", text: `Yêu cầu bổ sung: ${note}`, time: stamp() },
            ],
            history: [
              ...(r.history || []),
              caseHistoryEntry(user.name, "Quản lý yêu cầu bổ sung", note),
            ],
          }));
        }
      );
    },
    [user, applyOrderChange]
  );

  /**
   * Phiếu xác minh vận chuyển (VIII).
   * action: "send" | "respond" | "outcome".
   */
  const managerVerifyShipping = useCallback(
    (orderId, caseId, action, payload = {}) =>
      applyOrderChange(
        orderId,
        (o) => {
          if (user?.role !== "manager")
            return { ok: false, reason: "Chỉ quản lý lập phiếu xác minh vận chuyển." };
          const req = caseById(o, caseId);
          if (!req) return { ok: false, reason: "Không tìm thấy hồ sơ." };
          if (!isCaseOpen(req)) return { ok: false, reason: "Hồ sơ đã khép lại." };
          return null;
        },
        (o) => {
          const req = caseById(o, caseId);
          const nowIso = new Date().toISOString();
          if (action === "send") {
            const ticket = {
              id: nextId("PV"),
              caseId,
              trackingCode: payload.trackingCode || o.trackingCode || null,
              issue: payload.issue || "Xác minh tình trạng giao hàng",
              question: payload.question || "",
              channel: payload.channel || "Kênh hỗ trợ đơn vị vận chuyển (mô phỏng)",
              requestCode: payload.requestCode || nextId("REQ"),
              status: VERIFICATION_STATUS.SENT,
              sentAt: stamp(),
              respondedAt: null,
              response: null,
              documents: [],
              outcome: null,
              nextCheckAt: addHours(nowIso, 24),
              ownerId: user.id,
              ownerName: user.name,
              simulated: true,
            };
            return patchCase(o, caseId, (r) => ({
              ...r,
              verification: ticket,
              history: [
                ...(r.history || []),
                caseHistoryEntry(user.name, "Lập phiếu xác minh vận chuyển", ticket.issue),
              ],
            }));
          }
          if (action === "respond") {
            if (!req.verification) return { ok: false, reason: "Chưa có phiếu xác minh." };
            return patchCase(o, caseId, (r) => ({
              ...r,
              verification: {
                ...r.verification,
                status: VERIFICATION_STATUS.RESPONDED,
                respondedAt: stamp(),
                response: payload.response || "",
                documents: payload.documents || r.verification.documents || [],
                nextCheckAt: null,
              },
              history: [
                ...(r.history || []),
                caseHistoryEntry(user.name, "Ghi nhận phản hồi vận chuyển", payload.response || ""),
              ],
            }));
          }
          // action === "outcome"
          const outcome = payload.outcome;
          if (!outcome) return { ok: false, reason: "Chưa chọn nhánh kết quả xác minh." };
          let orderPatch = {};
          let note = payload.note || "";
          if (outcome === VERIFICATION_OUTCOME.WRONG_UPDATE) {
            orderPatch = {
              deliveryProof: null,
              deliveredAt: null,
              supportDeadline: null,
              shippingStatus: "OUT_FOR_DELIVERY",
              history: appendHistory(
                o,
                user.name,
                "Hủy mốc kiểm tra sai (giao nhầm)",
                null,
                "OUT_FOR_DELIVERY",
                note || "Cập nhật giao hàng nhầm — tính lại theo lần giao thực tế."
              ),
            };
          } else if (outcome === VERIFICATION_OUTCOME.REDELIVER) {
            orderPatch = {
              shippingStatus: "OUT_FOR_DELIVERY",
              history: appendHistory(
                o,
                user.name,
                "Yêu cầu giao lại theo xác minh vận chuyển",
                null,
                "OUT_FOR_DELIVERY",
                note
              ),
            };
          } else if (outcome === VERIFICATION_OUTCOME.NO_REPLY) {
            note = note || "Đơn vị vận chuyển chưa trả lời — đánh dấu chờ/quá hạn, KHÔNG tự quy lỗi.";
          } else if (outcome === VERIFICATION_OUTCOME.CONFLICT) {
            note = note || "Bằng chứng mâu thuẫn — tiếp tục xác minh, chưa kết luận.";
          }
          return {
            ...patchCase(o, caseId, (r) => ({
              ...r,
              verification: r.verification
                ? {
                    ...r.verification,
                    outcome,
                    outcomeNote: note,
                    status:
                      outcome === VERIFICATION_OUTCOME.NO_REPLY
                        ? VERIFICATION_STATUS.AWAITING
                        : r.verification.status,
                    overdueAt:
                      outcome === VERIFICATION_OUTCOME.NO_REPLY ? stamp() : r.verification.overdueAt,
                  }
                : r.verification,
              history: [
                ...(r.history || []),
                caseHistoryEntry(
                  user.name,
                  `Kết quả xác minh: ${VERIFICATION_OUTCOME_LABEL[outcome] || outcome}`,
                  note
                ),
              ],
            })),
            ...orderPatch,
          };
        }
      ),
    [user, applyOrderChange]
  );

  /**
   * Ghi nhận CẦN KIỂM TRA KỸ THUẬT. Chính sách phí/đơn vị kiểm tra CHƯA CHỐT ⇒
   * chuyển "Chờ hoàn thiện phương án" và KHÔNG tự quyết.
   */
  const managerRequestTechnicalCheck = useCallback(
    (orderId, caseId, note) =>
      applyOrderChange(
        orderId,
        (o) => {
          if (user?.role !== "manager")
            return { ok: false, reason: "Chỉ quản lý ghi nhận." };
          if (!caseById(o, caseId)) return { ok: false, reason: "Không tìm thấy hồ sơ." };
          return null;
        },
        (o) =>
          patchCase(o, caseId, (r) => ({
            ...r,
            status: RETURN_STATUS.AWAITING_PLAN,
            awaits: "MANAGER",
            technicalCheck: { notedAt: stamp(), note: note || "", by: user.name, simulated: true },
            history: [
              ...(r.history || []),
              caseHistoryEntry(
                user.name,
                "Ghi nhận cần kiểm tra kỹ thuật",
                note || "Chờ hoàn thiện phương án (phí/đơn vị kiểm tra chưa chốt)."
              ),
            ],
          }))
      ),
    [user, applyOrderChange]
  );

  /** Ban hành phương án xử lý (IX). */
  const managerIssuePlan = useCallback(
    (orderId, caseId, planInput = {}) => {
      const fees = Array.isArray(planInput.fees) ? planInput.fees : [];
      const plan = {
        id: nextId("PA"),
        conclusion: planInput.conclusion || "",
        basis: planInput.basis || "",
        requiresReturn: planInput.requiresReturn === true,
        goodsAmount: planInput.goodsAmount,
        fees,
        returnAddress: planInput.returnAddress || "",
        tasks: Array.isArray(planInput.tasks) ? planInput.tasks : [],
        refundMethod: planInput.refundMethod || "",
        approvedBy: user?.name || null,
        approvedAt: null,
        effectiveAt: null,
        reviewUntil: null,
        simulated: true,
      };
      const missing = planMissingFields(plan);
      return applyOrderChange(
        orderId,
        (o) => {
          if (user?.role !== "manager")
            return { ok: false, reason: "Chỉ quản lý ban hành phương án." };
          if (!caseById(o, caseId)) return { ok: false, reason: "Không tìm thấy hồ sơ." };
          return null;
        },
        (o) => {
          const nowIso = new Date().toISOString();
          if (missing.length) {
            return patchCase(o, caseId, (r) => ({
              ...r,
              status: RETURN_STATUS.AWAITING_PLAN,
              awaits: "MANAGER",
              plan,
              history: [
                ...(r.history || []),
                caseHistoryEntry(
                  user.name,
                  "Chưa đủ căn cứ hoàn thiện phương án",
                  `Thiếu: ${missing.join(", ")}`
                ),
              ],
            }));
          }
          const finalized = {
            ...plan,
            approvedAt: stamp(),
            reviewUntil: planReviewDeadline(nowIso),
          };
          return patchCase(o, caseId, (r) => ({
            ...r,
            status: RETURN_STATUS.PLAN_REVIEW,
            awaits: "MANAGER",
            plan: finalized,
            history: [
              ...(r.history || []),
              caseHistoryEntry(
                user.name,
                "Ban hành phương án xử lý",
                `Hạn xem xét lại: ${formatDateTime(finalized.reviewUntil)}`
              ),
            ],
          }));
        }
      );
    },
    [user, applyOrderChange]
  );

  /**
   * Kết thúc (hoặc mở lại) thời hạn xem xét lại phương án (IX).
   * reopen = true ⇒ đề nghị xem xét lại đúng hạn ⇒ chuyển quản lý, CHƯA hoàn tiền.
   */
  const managerResolvePlanReview = useCallback(
    (orderId, caseId, { reopen = false, note = "" } = {}) =>
      applyOrderChange(
        orderId,
        (o) => {
          if (user?.role !== "manager")
            return { ok: false, reason: "Chỉ quản lý xử lý." };
          const req = caseById(o, caseId);
          if (!req) return { ok: false, reason: "Không tìm thấy hồ sơ." };
          if (req.status !== RETURN_STATUS.PLAN_REVIEW)
            return { ok: false, reason: "Phương án không ở bước chờ xem xét lại." };
          if (!reopen && req.plan?.reviewUntil && new Date(req.plan.reviewUntil).getTime() > Date.now())
            return {
              ok: false,
              reason:
                "Chưa hết thời hạn xem xét lại phương án (48 giờ).",
            };
          return null;
        },
        (o) => {
          const req = caseById(o, caseId);
          const nowIso = new Date().toISOString();
          if (reopen) {
            return patchCase(o, caseId, (r) => ({
              ...r,
              status: RETURN_STATUS.UNDER_REVIEW,
              awaits: "MANAGER",
              history: [
                ...(r.history || []),
                caseHistoryEntry(user.name, "Mở lại phương án để xem xét", note),
              ],
            }));
          }
          const plan = req.plan || {};
          const effective = { ...plan, effectiveAt: stamp() };
          let status;
          let awaits;
          if (plan.requiresReturn) {
            const hasAddress = !!(plan.returnAddress && plan.returnAddress.trim());
            status = hasAddress
              ? RETURN_STATUS.RETURN_AWAITING_HANDOVER
              : RETURN_STATUS.RETURN_PENDING_INFO;
            awaits = hasAddress ? "BUYER" : "SELLER";
          } else {
            status = RETURN_STATUS.REFUND_ELIGIBLE;
            awaits = "MANAGER";
          }
          const returnShipment =
            plan.requiresReturn
              ? {
                  ...(req.returnShipment || {
                    id: nextId("RT"),
                    carrier: CARRIER_NAME,
                    trackingCode: null,
                    events: [],
                    simulated: true,
                  }),
                  receiverName: req.returnShipment?.receiverName || null,
                  receiverAddress: plan.returnAddress || req.returnShipment?.receiverAddress || null,
                  status: plan.returnAddress
                    ? RETURN_SHIPMENT_STATUS.AWAITING_HANDOVER
                    : RETURN_SHIPMENT_STATUS.PENDING_INFO,
                  handoverDueAt: plan.returnAddress ? returnHandoverDeadline(nowIso) : null,
                }
              : req.returnShipment;
          return patchCase(o, caseId, (r) => ({
            ...r,
            status,
            awaits,
            plan: effective,
            returnShipment,
            history: [
              ...(r.history || []),
              caseHistoryEntry(user.name, "Phương án có hiệu lực", note),
            ],
          }));
        }
      ),
    [user, applyOrderChange]
  );

  /** Người bán/quản lý hoàn thiện thông tin nhận trả (X.1). */
  const sellerProvideReturnInfo = useCallback(
    (orderId, caseId, payload = {}) => {
      const { receiverName = "", receiverAddress = "", fees = [], payer = null } = payload;
      return applyOrderChange(
        orderId,
        (o) => {
          const req = caseById(o, caseId);
          if (!req) return { ok: false, reason: "Không tìm thấy hồ sơ." };
          if (o.sellerId !== user?.id && user?.role !== "manager")
            return { ok: false, reason: "Chỉ người bán hoặc quản lý cập nhật thông tin nhận trả." };
          return null;
        },
        (o) => {
          const req = caseById(o, caseId);
          const nowIso = new Date().toISOString();
          const complete = !!(receiverName && receiverAddress);
          return patchCase(o, caseId, (r) => ({
            ...r,
            status: complete ? RETURN_STATUS.RETURN_AWAITING_HANDOVER : RETURN_STATUS.RETURN_PENDING_INFO,
            awaits: complete ? "BUYER" : r.awaits || "MANAGER",
            returnShipment: {
              ...(r.returnShipment || {
                id: nextId("RT"),
                carrier: CARRIER_NAME,
                trackingCode: null,
                events: [],
                simulated: true,
              }),
              receiverName: receiverName || r.returnShipment?.receiverName || null,
              receiverAddress: receiverAddress || r.returnShipment?.receiverAddress || null,
              fees: fees.length ? fees : r.returnShipment?.fees || [],
              payer: payer || r.returnShipment?.payer || null,
              status: complete
                ? RETURN_SHIPMENT_STATUS.AWAITING_HANDOVER
                : RETURN_SHIPMENT_STATUS.PENDING_INFO,
              handoverDueAt: complete ? returnHandoverDeadline(nowIso) : null,
            },
            history: [
              ...(r.history || []),
              caseHistoryEntry(
                user?.name,
                complete ? "Hoàn thiện thông tin nhận trả" : "Cập nhật thông tin nhận trả (chưa đủ)",
                receiverAddress
              ),
            ],
          }));
        }
      );
    },
    [user, applyOrderChange]
  );

  /** Người mua bàn giao hàng trả (X) — tạo vận đơn trả (mô phỏng). */
  const buyerMarkReturnHandedOver = useCallback(
    (orderId, caseId) =>
      applyOrderChange(
        orderId,
        (o) => {
          const req = caseById(o, caseId);
          if (!req) return { ok: false, reason: "Không tìm thấy hồ sơ." };
          if (o.buyerId !== user?.id)
            return { ok: false, reason: "Chỉ người mua xác nhận bàn giao." };
          if (req.status !== RETURN_STATUS.RETURN_AWAITING_HANDOVER)
            return { ok: false, reason: "Hồ sơ chưa ở bước chờ bàn giao." };
          return null;
        },
        (o) => {
          const req = caseById(o, caseId);
          const code = req.returnShipment?.trackingCode || makeTrackingCode(`RT-${o.id}`);
          const nowStamp = stamp();
          return patchCase(o, caseId, (r) => ({
            ...r,
            status: RETURN_STATUS.RETURNING,
            awaits: "CARRIER",
            returnShipment: {
              ...r.returnShipment,
              trackingCode: code,
              status: RETURN_SHIPMENT_STATUS.IN_TRANSIT,
              handedOverAt: nowStamp,
              events: [
                ...(r.returnShipment?.events || []),
                {
                  time: nowStamp,
                  status: RETURN_SHIPMENT_STATUS.IN_TRANSIT,
                  description: "Người mua đã bàn giao kiện hàng trả (mô phỏng).",
                  source: "SIMULATED",
                },
              ],
            },
            history: [
              ...(r.history || []),
              caseHistoryEntry(user.name, "Người mua bàn giao hàng trả", code),
            ],
          }));
        }
      ),
    [user, applyOrderChange]
  );

  /** Tiến vận đơn trả (mô phỏng) — tới "Đã giao trả, chờ kiểm tra". */
  const advanceReturnShipment = useCallback(
    (orderId, caseId) =>
      applyOrderChange(
        orderId,
        (o) => {
          const req = caseById(o, caseId);
          if (!req) return { ok: false, reason: "Không tìm thấy hồ sơ." };
          if (o.sellerId !== user?.id && user?.role !== "manager")
            return { ok: false, reason: "Không có quyền cập nhật vận đơn trả." };
          if (
            ![
              RETURN_STATUS.RETURN_PENDING_INFO,
              RETURN_STATUS.RETURN_AWAITING_HANDOVER,
              RETURN_STATUS.RETURNING,
            ].includes(req.status)
          )
            return { ok: false, reason: "Hồ sơ không ở luồng vận chuyển trả." };
          return null;
        },
        (o) => {
          const req = caseById(o, caseId);
          const nowStamp = stamp();
          const nowIso = new Date().toISOString();
          const cur = req.returnShipment?.status || RETURN_SHIPMENT_STATUS.PENDING_INFO;
          const idx = RETURN_SHIPMENT_SEQUENCE.indexOf(cur);
          const next =
            idx >= 0 && idx < RETURN_SHIPMENT_SEQUENCE.length - 1
              ? RETURN_SHIPMENT_SEQUENCE[idx + 1]
              : RETURN_SHIPMENT_STATUS.DELIVERED_INSPECT;
          const delivered = next === RETURN_SHIPMENT_STATUS.DELIVERED_INSPECT;
          return patchCase(o, caseId, (r) => ({
            ...r,
            status: delivered ? RETURN_STATUS.RETURNED : r.status,
            awaits: delivered ? "SELLER" : r.awaits,
            returnInspectDueAt: delivered
              ? returnInspectDeadline(nowIso)
              : r.returnInspectDueAt,
            returnShipment: {
              ...r.returnShipment,
              status: next,
              events: [
                ...(r.returnShipment?.events || []),
                {
                  time: nowStamp,
                  status: next,
                  description: RETURN_SHIPMENT_STATUS_LABEL[next] || next,
                  source: "SIMULATED",
                },
              ],
            },
            history: [
              ...(r.history || []),
              caseHistoryEntry(user?.name, RETURN_SHIPMENT_STATUS_LABEL[next] || next, ""),
            ],
          }));
        }
      ),
    [user, applyOrderChange]
  );

  /** Người bán báo vấn đề hàng trả (X.3) → tranh chấp, chuyển quản lý. */
  const reportReturnProblem = useCallback(
    (orderId, caseId, { reason, description, files } = {}) => {
      if (!reason || !String(description || "").trim())
        return { ok: false, reason: "Cần chọn vấn đề và mô tả cụ thể." };
      return applyOrderChange(
        orderId,
        (o) => {
          const req = caseById(o, caseId);
          if (!req) return { ok: false, reason: "Không tìm thấy hồ sơ." };
          if (o.sellerId !== user?.id && user?.role !== "manager")
            return { ok: false, reason: "Chỉ người bán của đơn báo vấn đề hàng trả." };
          if (req.status !== RETURN_STATUS.RETURNED)
            return { ok: false, reason: "Hồ sơ chưa ở bước kiểm tra hàng trả." };
          return null;
        },
        (o) => {
          const req = caseById(o, caseId);
          return patchCase(o, caseId, (r) => ({
            ...r,
            status: RETURN_STATUS.RETURN_DISPUTE,
            awaits: "MANAGER",
            returnProblem: { reason, description, at: stamp(), by: user.name, simulated: true },
            evidenceList: files && files.length
              ? [
                  ...(r.evidenceList || []),
                  makeEvidence({ by: user.name, role: "seller", text: description, files }),
                ]
              : r.evidenceList,
            history: [
              ...(r.history || []),
              caseHistoryEntry(user.name, "Người bán báo vấn đề hàng trả", `${reason}: ${description}`),
            ],
          }));
        }
      );
    },
    [user, applyOrderChange]
  );

  /** Người bán xác nhận hàng trả phù hợp (X.3) → đủ điều kiện hoàn tiền. */
  const sellerConfirmReturnOk = useCallback(
    (orderId, caseId) =>
      applyOrderChange(
        orderId,
        (o) => {
          const req = caseById(o, caseId);
          if (!req) return { ok: false, reason: "Không tìm thấy hồ sơ." };
          if (o.sellerId !== user?.id && user?.role !== "manager")
            return { ok: false, reason: "Chỉ người bán của đơn xác nhận." };
          if (req.status !== RETURN_STATUS.RETURNED)
            return { ok: false, reason: "Hồ sơ chưa ở bước kiểm tra hàng trả." };
          return null;
        },
        (o) =>
          patchCase(o, caseId, (r) => ({
            ...r,
            status: RETURN_STATUS.REFUND_ELIGIBLE,
            awaits: "MANAGER",
            returnInspectedAt: stamp(),
            history: [
              ...(r.history || []),
              caseHistoryEntry(user?.name, "Xác nhận hàng trả phù hợp", ""),
            ],
          }))
      ),
    [user, applyOrderChange]
  );

  /** Ghi nhận trở ngại gửi trả (X.6). */
  const reportReturnObstacle = useCallback(
    (orderId, caseId, { reason, note, nextAction } = {}) =>
      applyOrderChange(
        orderId,
        (o) => {
          const req = caseById(o, caseId);
          if (!req) return { ok: false, reason: "Không tìm thấy hồ sơ." };
          const party = partyOf(o, { userId: user?.id, role: user?.role });
          if (party === "OUTSIDER") return { ok: false, reason: "Bạn không thuộc đơn này." };
          if (!reason) return { ok: false, reason: "Cần chọn trở ngại." };
          return null;
        },
        (o) =>
          patchCase(o, caseId, (r) => ({
            ...r,
            status: RETURN_STATUS.RETURN_OBSTACLE,
            awaits: "MANAGER",
            obstacle: {
              reason,
              note: note || "",
              nextAction: nextAction || "",
              at: stamp(),
              by: user?.name,
              simulated: true,
            },
            history: [
              ...(r.history || []),
              caseHistoryEntry(user?.name, "Báo trở ngại gửi trả", `${reason}${note ? ` — ${note}` : ""}`),
            ],
          }))
      ),
    [user, applyOrderChange]
  );

  /**
   * ĐIỀU KHIỂN DEMO — mô phỏng thời gian (XII.4). KHÔNG phải tính năng thật:
   * đẩy một mốc hạn vào quá khứ để trình diễn luồng quá hạn. Đánh dấu rõ.
   */
  const demoMakeOverdue = useCallback(
    (orderId, caseId, phase) =>
      applyOrderChange(
        orderId,
        (o) => (caseById(o, caseId) ? null : { ok: false, reason: "Không tìm thấy hồ sơ." }),
        (o) => {
          const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          const fieldMap = {
            SELLER_RESPONSE: "sellerResponseDueAt",
            BUYER_SUPPLEMENT: "buyerSupplementDueAt",
            SELLER_REDECISION: "sellerReDecisionDueAt",
            BUYER_REJECT_CHOICE: "buyerRejectChoiceDueAt",
            PLAN_REVIEW: "planReviewUntil",
            RETURN_INSPECT: "returnInspectDueAt",
            RETURN_HANDOVER: "returnShipment",
          };
          return patchCase(o, caseId, (r) => {
            let next = { ...r, demoShiftedAt: stamp() };
            const field = fieldMap[phase];
            if (field === "returnShipment") {
              next.returnShipment = { ...r.returnShipment, handoverDueAt: past };
            } else if (field === "planReviewUntil") {
              next.plan = { ...r.plan, reviewUntil: past };
            } else if (field) {
              next[field] = past;
            }
            next.history = [
              ...(r.history || []),
              caseHistoryEntry(
                "Điều khiển demo",
                "Mô phỏng quá hạn",
                `Đẩy mốc ${phase} về quá khứ (chỉ dùng trình diễn).`
              ),
            ];
            return next;
          });
        }
      ),
    [applyOrderChange]
  );

  /* --------------------------- Thông báo --------------------------- */

  const NOTIF_READ_KEY = "reprice_notif_read";
  const [readNotifIds, setReadNotifIds] = useState(() => {
    try {
      const saved = localStorage.getItem(NOTIF_READ_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((x) => typeof x === "string");
        }
      }
    } catch {
      /* bỏ qua */
    }
    return [];
  });

  /* ---- Đồng bộ giữa nhiều tab (cùng trình duyệt) ----
   * `localStorage` dùng chung giữa các tab: khi tab khác ghi demo state hoặc
   * trạng thái đã đọc thông báo, tab này nạp lại để hai tài khoản mở song song
   * thấy cùng một nguồn dữ liệu. So sánh nội dung trước khi set để không tạo
   * vòng lặp ghi qua lại giữa các tab.
   * GIỚI HẠN: chỉ đồng bộ trong CÙNG một trình duyệt (khác máy/khác trình duyệt
   * cần backend — chưa triển khai). */
  useEffect(() => {
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const onStorage = (e) => {
      if (!e.key) return;
      if (e.key === DEMO_STATE_KEY) {
        const parsed = loadDemoState();
        if (!parsed) return;
        if (!same(parsed.user ?? null, user)) setUser(parsed.user ?? null);
        if (Array.isArray(parsed.listings) && !same(parsed.listings, listings))
          setListings(parsed.listings);
        if (Array.isArray(parsed.orders) && !same(parsed.orders, orders))
          setOrders(parsed.orders.map(normalizeOrder));
        if (Array.isArray(parsed.negotiations) && !same(parsed.negotiations, negotiations))
          setNegotiations(parsed.negotiations);
        if (Array.isArray(parsed.transactions) && !same(parsed.transactions, transactions))
          setTransactions(parsed.transactions);
        if (parsed.referenceOverrides && !same(parsed.referenceOverrides, referenceOverrides))
          setReferenceOverrides(parsed.referenceOverrides);
      } else if (e.key === NOTIF_READ_KEY) {
        try {
          const parsed = JSON.parse(e.newValue || "[]");
          if (Array.isArray(parsed))
            setReadNotifIds(parsed.filter((x) => typeof x === "string"));
        } catch {
          /* bỏ qua */
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [
    user,
    listings,
    orders,
    negotiations,
    transactions,
    referenceOverrides,
  ]);

  /** Thông báo của tài khoản hiện tại — suy diễn từ thương lượng và đơn hàng. */
  const notifications = useMemo(() => {
    if (!user) return [];
    const list = [];
    negotiations
      .filter((n) => n.buyerId === user.id)
      .forEach((n) => {
        const phone = listings.find((p) => p.id === n.phoneId);
        const product = phone ? phoneName(phone) : n.phoneId;
        const lastOffer = [...n.offers].reverse()[0];
        const time = lastOffer?.time || n.createdAt;
        if (n.status === "SELLER_COUNTER") {
          list.push({
            id: `notif-neg-${n.id}-counter-${n.offers.length}`,
            kind: "counter",
            title: "Người bán đề nghị mức giá mới",
            message: `${product} — người bán đề nghị ${formatVND(n.counterPrice || 0)}.`,
            time,
            link: `/negotiation/${n.phoneId}`,
          });
        } else if (n.status === "AGREED") {
          list.push({
            id: `notif-neg-${n.id}-agreed-${n.offers.length}`,
            kind: "agreed",
            title: "Đề nghị được chấp nhận",
            message: `${product} — hai bên thống nhất ${formatVND(n.agreedPrice || 0)}.`,
            time,
            link: `/negotiation/${n.phoneId}`,
          });
        } else if (n.status === "REJECTED") {
          list.push({
            id: `notif-neg-${n.id}-rejected-${n.offers.length}`,
            kind: "rejected",
            title: "Thương lượng bị từ chối",
            message: `${product} — người bán đã từ chối giá thương lượng của bạn.`,
            time,
            link: `/negotiation/${n.phoneId}`,
          });
        }
      });
    /* Thông báo thương lượng cho NGƯỜI BÁN: có đề nghị mới cần phản hồi. */
    negotiations
      .filter((n) => n.sellerId === user.id)
      .forEach((n) => {
        const phone = listings.find((p) => p.id === n.phoneId);
        const product = phone ? phoneName(phone) : n.phoneId;
        const time = n.updatedAt || n.createdAt;
        const offer = lastBuyerOffer(n);
        if (n.status === "AWAITING_SELLER" && offer) {
          list.push({
            id: `notif-neg-seller-${n.id}-offer-${n.offers.length}`,
            kind: "neg-offer",
            title: "Đề nghị thương lượng mới",
            message: `${product} — người mua ${n.buyerName} đề nghị ${formatVND(
              offer.price
            )}. Cần bạn phản hồi.`,
            time,
            link: `/seller/negotiations/${n.id}`,
          });
        } else if (n.status === "AGREED") {
          list.push({
            id: `notif-neg-seller-${n.id}-agreed-${n.offers.length}`,
            kind: "neg-agreed",
            title: "Đã thống nhất giá",
            message: `${product} — hai bên thống nhất ${formatVND(
              n.agreedPrice || 0
            )}. Chờ người mua tạo đơn.`,
            time,
            link: `/seller/negotiations/${n.id}`,
          });
        }
      });
    orders
      .filter((o) => o.buyerId === user.id || o.sellerId === user.id)
      .forEach((o) => {
        const phone = listings.find((p) => p.id === o.phoneId);
        const product = phone ? phoneName(phone) : o.phoneId;
        const time = o.updatedAt || o.createdAt;
        const isBuyer = o.buyerId === user.id;
        // Đơn mới do người mua tạo -> báo người bán biết.
        if (o.status === "PENDING_BUYER" && !isBuyer) {
          list.push({
            id: `notif-order-${o.id}-new`,
            kind: "order-new",
            title: "Đơn hàng mới",
            message: `Đơn ${o.id} — ${product}: người mua vừa tạo đơn, đang chờ người mua xác nhận.`,
            time,
            link: `/orders/${o.id}`,
          });
        }
        // Đơn chờ người bán xác nhận -> thông báo cho người bán.
        if (o.status === "PENDING_SELLER" && !isBuyer) {
          list.push({
            id: `notif-order-${o.id}-pending-seller`,
            kind: "order-pending-seller",
            title: "Đơn hàng chờ xác nhận",
            message: `Đơn ${o.id} — ${product} chờ bạn xác nhận hoặc từ chối.`,
            time,
            link: `/orders/${o.id}`,
          });
        }
        // Hai bên đã xác nhận -> thông báo người mua.
        if (o.status === "CONFIRMED" && isBuyer) {
          const needPay = o.paymentMethod !== "COD" && !isPaymentSettled(o);
          list.push({
            id: `notif-order-${o.id}-confirmed`,
            kind: "order-confirmed",
            title: "Đơn hàng đã được xác nhận",
            message: needPay
              ? `Đơn ${o.id} — ${product}: hai bên đã xác nhận, hãy thanh toán.`
              : `Đơn ${o.id} — ${product}: người bán đã xác nhận đơn.`,
            time,
            link: `/orders/${o.id}`,
          });
        }
        // Người bán từ chối -> thông báo người mua.
        if (o.status === "SELLER_REJECTED" && isBuyer) {
          list.push({
            id: `notif-order-${o.id}-rejected`,
            kind: "order-rejected",
            title: "Người bán từ chối đơn hàng",
            message: `Đơn ${o.id} — ${product} bị người bán từ chối.`,
            time,
            link: `/orders/${o.id}`,
          });
        }
        // Đang giao hàng -> thông báo người mua.
        if (o.status === "SHIPPING" && isBuyer) {
          list.push({
            id: `notif-order-${o.id}-shipping`,
            kind: "order-shipping",
            title: "Đơn hàng đang giao",
            message: `Đơn ${o.id} — ${product} đang được vận chuyển.`,
            time,
            link: `/orders/${o.id}`,
          });
        }
        // Đã giao thành công (ĐVVC ghi nhận) -> thông báo người mua kèm mốc 72 giờ.
        if ((o.status === "DELIVERED" || o.shippingStatus === "DELIVERED") && isBuyer) {
          const clock = deliveryClock(o);
          list.push({
            id: `notif-order-${o.id}-delivered`,
            kind: "order-delivered",
            title: "Đơn hàng đã được giao thành công",
            message: `Đơn ${o.id} — ${product}: giao thành công${
              clock.startedAt ? ` lúc ${formatDateTime(clock.startedAt)}` : ""
            }${
              clock.deadlineAt
                ? ` · hạn mở yêu cầu trả hàng/hoàn tiền ${formatDateTime(
                    clock.deadlineAt
                  )}`
                : ""
            }. Mở đơn để kiểm tra hàng.`,
            time: clock.startedAt || time,
            link: `/orders/${o.id}`,
          });
        }
        if (o.status === "CANCELLED") {
          list.push({
            id: `notif-order-${o.id}`,
            kind: "order-cancelled",
            title: "Đơn hàng đã hủy",
            message: `Đơn ${o.id} — ${product} đã bị hủy.`,
            time,
            link: `/orders/${o.id}`,
          });
        } else if (o.status === "COMPLETED") {
          list.push({
            id: `notif-order-${o.id}`,
            kind: "order-completed",
            title: "Đơn hàng hoàn tất",
            message: `Đơn ${o.id} — ${product} đã hoàn tất giao dịch.`,
            time,
            link: `/orders/${o.id}`,
          });
        }
      });
    /* ---------------- Thông báo cho người quản lý ---------------- */
    if (user.role === "manager") {
      transactions
        .filter((t) => t.verification === "PENDING")
        .forEach((t) => {
          const phone = listings.find((p) => p.id === t.phoneId);
          const product = phone ? phoneName(phone) : t.phoneId;
          list.push({
            id: `notif-tx-${t.id}-pending`,
            kind: "tx-pending",
            title: "Giao dịch chờ duyệt giá",
            message: `${product} — ${formatVND(
              t.transactionPrice ?? t.price
            )} (đơn ${t.orderId}) chờ duyệt.`,
            time: t.date,
            link: "/manager/transactions",
          });
        });
      orders
        .filter((o) => o.status === "PENDING_SELLER")
        .forEach((o) => {
          const phone = listings.find((p) => p.id === o.phoneId);
          const product = phone ? phoneName(phone) : o.phoneId;
          list.push({
            id: `notif-mgr-${o.id}-pending-seller`,
            kind: "order-pending-seller",
            title: "Đơn chờ người bán xác nhận",
            message: `Đơn ${o.id} — ${product} đang chờ người bán xác nhận.`,
            time: o.updatedAt || o.createdAt,
            link: "/manager/orders",
          });
        });
      orders
        .filter((o) => o.shippingStatus === "FAILED")
        .forEach((o) => {
          list.push({
            id: `notif-mgr-${o.id}-failed`,
            kind: "shipping-failed",
            title: "Giao hàng thất bại",
            message: `Đơn ${o.id} giao hàng thất bại — cần theo dõi.`,
            time: o.updatedAt || o.createdAt,
            link: "/manager/orders",
          });
        });
      orders.forEach((o) => {
        (o.supportRequests || [])
          .filter((r) => isReturnOpen(r))
          .forEach((r) => {
            const step = casePendingStep(r);
            const needsManager = step.party === "MANAGER";
            list.push({
              id: `notif-mgr-req-${r.id}`,
              kind: "support-case",
              title: needsManager
                ? "Hồ sơ cần quản lý xử lý"
                : "Hồ sơ trả hàng/khiếu nại đang mở",
              message: `Đơn ${o.id} — ${r.reason || r.type}${
                step.dueAt ? ` · ${remainingText(step.dueAt)}` : ""
              }.`,
              time: r.updatedAt || r.createdAt,
              link: `/orders/${o.id}/cases/${r.id}`,
            });
            if (r.verification && r.verification.status !== "RESPONDED") {
              list.push({
                id: `notif-mgr-ver-${r.verification.id}`,
                kind: "shipping-verify",
                title: "Phiếu xác minh vận chuyển",
                message: `Đơn ${o.id} — ${r.verification.issue} (${r.verification.status}).`,
                time: r.verification.sentAt,
                link: `/orders/${o.id}/cases/${r.id}`,
              });
            }
            if (r.refund && ["FAILED", "RECONCILE"].includes(r.refund.status)) {
              list.push({
                id: `notif-mgr-refund-${r.refund.id}`,
                kind: "refund-issue",
                title: `Hoàn tiền ${r.refund.status === "FAILED" ? "thất bại" : "chờ đối soát"}`,
                message: `Đơn ${o.id} — giao dịch ${r.refund.id} cần xử lý.`,
                time: r.refund.failedAt || r.refund.createdAt,
                link: `/orders/${o.id}/cases/${r.id}`,
              });
            }
          });
      });
      return dedupeNotifications(list).sort((a, b) =>
        String(a.time) < String(b.time) ? 1 : -1
      );
    }

    /* ------- Thông báo bổ sung cho người mua / người bán ------- */
    orders
      .filter((o) => o.buyerId === user.id || o.sellerId === user.id)
      .forEach((o) => {
        const phone = listings.find((p) => p.id === o.phoneId);
        const product = phone ? phoneName(phone) : o.phoneId;
        const time = o.updatedAt || o.createdAt;
        const isBuyer = o.buyerId === user.id;
        // Người bán: đơn đã xác nhận, cần chuẩn bị hàng.
        if (!isBuyer && o.status === "CONFIRMED") {
          list.push({
            id: `notif-order-${o.id}-prep`,
            kind: "order-prepare",
            title: "Đơn đã xác nhận — chuẩn bị hàng",
            message: `Đơn ${o.id} — ${product}: hãy chuẩn bị hàng và tạo vận đơn.`,
            time,
            link: `/orders/${o.id}`,
          });
        }
        // Có mã vận đơn.
        if (o.trackingCode && o.shippingStatus !== "NOT_SHIPPED") {
          list.push({
            id: `notif-order-${o.id}-tracking`,
            kind: "order-tracking",
            title: "Đã tạo vận đơn",
            message: `Đơn ${o.id} — mã vận đơn ${o.trackingCode} (${o.carrier}).`,
            time,
            link: `/orders/${o.id}`,
          });
        }
        // Đang giao tới người mua (mốc người mua có thể từ chối nhận).
        if (o.shippingStatus === "OUT_FOR_DELIVERY" && isBuyer) {
          list.push({
            id: `notif-order-${o.id}-outfordelivery`,
            kind: "order-shipping",
            title: "Đơn đang giao tới bạn",
            message: `Đơn ${o.id} — ${product}: đang giao tới bạn. Bạn có thể từ chối nhận nếu hàng không đúng mô tả.`,
            time,
            link: `/orders/${o.id}`,
          });
        }
        // Giao hàng KHÔNG thành công / người mua từ chối nhận.
        if (o.shippingStatus === "FAILED") {
          const refused = isBuyerRefusal(o);
          list.push({
            id: `notif-order-${o.id}-failed`,
            kind: "shipping-failed",
            title: refused ? "Người mua từ chối nhận hàng" : "Giao hàng không thành công",
            message: refused
              ? `Đơn ${o.id} — ${product}: người mua từ chối nhận; hàng sẽ chuyển hoàn về người bán.`
              : `Đơn ${o.id} — ${product}: giao hàng không thành công, đang chờ xử lý.`,
            time,
            link: `/orders/${o.id}`,
          });
        }
        // Đang hoàn hàng về người bán (CHƯA về) / đã hoàn về.
        if (o.shippingStatus === "RETURNING") {
          list.push({
            id: `notif-order-${o.id}-returning`,
            kind: "shipping-returning",
            title: "Đang hoàn hàng về người bán",
            message: `Đơn ${o.id} — ${product}: kiện hàng đang trên đường hoàn về người bán (chưa về tới).`,
            time,
            link: `/orders/${o.id}`,
          });
        }
        if (o.shippingStatus === "RETURNED") {
          list.push({
            id: `notif-order-${o.id}-returned`,
            kind: "shipping-returned",
            title: "Đã hoàn hàng về người bán",
            message: `Đơn ${o.id} — ${product}: người bán đã nhận lại hàng hoàn. Khoản tiền xử lý theo phương thức thanh toán.`,
            time,
            link: `/orders/${o.id}`,
          });
        }
        // Sự cố vận chuyển.
        if (o.shippingIncident && !o.shippingIncident.resolved) {
          list.push({
            id: `notif-order-${o.id}-incident`,
            kind: "shipping-incident",
            title: "Sự cố vận chuyển",
            message: `Đơn ${o.id} — ${product}: ${o.shippingIncident.note} Bạn có thể báo vấn đề/xác minh.`,
            time,
            link: `/orders/${o.id}`,
          });
        }
        // Vận đơn đã hủy do đơn hủy trước khi bàn giao.
        if (o.shippingStatus === "VOIDED") {
          list.push({
            id: `notif-order-${o.id}-voided`,
            kind: "shipping-voided",
            title: "Đơn hủy — vận đơn đã hủy",
            message: `Đơn ${o.id} — ${product}: đơn đã hủy trước khi bàn giao, vận đơn không còn hiệu lực.`,
            time,
            link: `/orders/${o.id}`,
          });
        }
        // Hoàn tiền cấp đơn do hàng hoàn về người bán (mô phỏng).
        if (o.refund?.scope === "SHIPPING_RETURN") {
          const done = o.refund.status === "DONE";
          list.push({
            id: `notif-order-${o.id}-shiprefund`,
            kind: done ? "refund-done" : "refund-issue",
            title: done
              ? "Đã hoàn tiền do hàng hoàn về"
              : "Hoàn tiền do hàng hoàn về đang xử lý",
            message: `Đơn ${o.id} — khoản hoàn ${formatVND(
              o.refund.totalAmount || o.negotiatedPrice
            )} ${done ? "đã được ghi nhận." : "đang xử lý."}`,
            time,
            link: `/orders/${o.id}`,
          });
        }
        // Hồ sơ đang mở: thông báo cho bên cần hành động + kết quả hoàn tiền.
        (o.supportRequests || [])
          .filter((r) => isCaseOpen(r))
          .forEach((r) => {
            const step = casePendingStep(r);
            const isMyTurn =
              (step.party === "BUYER" && isBuyer) ||
              (step.party === "SELLER" && !isBuyer);
            const msgCount = (r.messages || []).length;
            if (isMyTurn) {
              list.push({
                // id gồm trạng thái + số lần trao đổi: mỗi bước mới là một sự kiện
                // riêng (không bị coi là "đã đọc" của bước trước), nhưng tải lại
                // trang vẫn ra cùng id nên không sinh trùng.
                id: `notif-order-${o.id}-req-${r.id}-${r.status}-${msgCount}`,
                kind: "support-case",
                title: `Hồ sơ ${r.id} cần bạn xử lý`,
                message: `${step.text}${step.dueAt ? ` · ${remainingText(step.dueAt)}` : ""}.`,
                time: r.updatedAt || r.createdAt,
                link: `/orders/${o.id}/cases/${r.id}`,
              });
            }
            // Người bán vừa thao tác trên hồ sơ mà CHƯA chuyển lượt cho người mua
            // -> thông báo cho người mua biết (đồng ý, từ chối, bổ sung bằng chứng…).
            const lastMsg = (r.messages || [])[msgCount - 1] || null;
            if (isBuyer && !isMyTurn && lastMsg && lastMsg.from === "seller") {
              list.push({
                id: `notif-order-${o.id}-reqseller-${r.id}-${msgCount}`,
                kind: "support-case",
                title: "Người bán đã phản hồi hồ sơ",
                message: `Hồ sơ ${r.id} — ${lastMsg.text}`,
                time: lastMsg.time || r.updatedAt || r.createdAt,
                link: `/orders/${o.id}/cases/${r.id}`,
              });
            }
            if (r.refund && r.refund.status === "DONE") {
              list.push({
                id: `notif-order-${o.id}-refund-${r.refund.id}`,
                kind: "refund-done",
                title: "Đã hoàn tiền",
                message: `Đơn ${o.id} — ${r.refund.totalAmount} đã được ghi nhận hoàn.`,
                time: r.refund.completedAt,
                link: `/orders/${o.id}/cases/${r.id}`,
              });
            }
            if (r.refund && ["FAILED", "RECONCILE"].includes(r.refund.status) && isBuyer) {
              list.push({
                id: `notif-order-${o.id}-refundissue-${r.refund.id}`,
                kind: "refund-issue",
                title: "Hoàn tiền đang được xử lý/đối soát",
                message: `Đơn ${o.id} — khoản hoàn chưa hoàn tất, RePrice đang đối soát.`,
                time: r.refund.failedAt || r.refund.createdAt,
                link: `/orders/${o.id}/cases/${r.id}`,
              });
            }
          });
        // COD chưa thu/đối soát xong (người bán).
        if (
          !isBuyer &&
          o.paymentMethod === "COD" &&
          !isPaymentSettled(o) &&
          !isPaymentRefunded(o)
        ) {
          list.push({
            id: `notif-order-${o.id}-cod`,
            kind: "cod-pending",
            title: "Chờ thu tiền / đối soát COD",
            message: `Đơn ${o.id} — ${PAYMENT_STATUS_LABEL[o.paymentStatus] || "chưa xác minh thu tiền"}.`,
            time,
            link: `/orders/${o.id}`,
          });
        }
      });
    return dedupeNotifications(list).sort((a, b) =>
      String(a.time) < String(b.time) ? 1 : -1
    );
  }, [user, negotiations, orders, listings, transactions]);

  const unreadCount = useMemo(
    () =>
      notifications.filter((n) => !readNotifIds.includes(n.id)).length,
    [notifications, readNotifIds]
  );

  const markNotificationRead = useCallback((id) => {
    setReadNotifIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      try {
        localStorage.setItem(NOTIF_READ_KEY, JSON.stringify(next));
      } catch {
        /* bỏ qua */
      }
      return next;
    });
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setReadNotifIds((prev) => {
      const next = [
        ...new Set([...prev, ...notifications.map((n) => n.id)]),
      ];
      try {
        localStorage.setItem(NOTIF_READ_KEY, JSON.stringify(next));
      } catch {
        /* bỏ qua */
      }
      return next;
    });
  }, [notifications]);

  /* --------------------- Đánh giá của người mua --------------------- */

  const [userReviews, setUserReviews] = useState([]);

  const addReview = useCallback((review) => {
    const item = { id: nextId("MY-RV"), date: nowISO(), ...review };
    setUserReviews((prev) => [item, ...prev]);
    return item;
  }, []);

  const hasReviewedOrder = useCallback(
    (orderId) => userReviews.some((r) => r.orderId === orderId),
    [userReviews]
  );

  /* -------------------- Kiểm tra dữ liệu (quản lý) --------------------- */

  const verifyTransaction = useCallback(
    (txId, action, reason = "") => {
      setTransactions((prev) =>
        prev.map((t) => {
          if (t.id !== txId) return t;
          const audit = {
            verifiedBy: user?.name || "Quản lý",
            verifiedAt: stamp(),
            decisionReason: reason,
          };
          switch (action) {
            case "verify":
              return {
                ...t,
                ...audit,
                verification: "VERIFIED",
                note: "Đã kiểm tra: dữ liệu hợp lệ, được đưa vào tập tham khảo.",
              };
            case "reject":
              return {
                ...t,
                ...audit,
                verification: "REJECTED",
                note: reason
                  ? `Bị loại khỏi tập tham khảo: ${reason}`
                  : "Dữ liệu không hợp lệ, bị loại khỏi tập tham khảo.",
              };
            case "needsInfo":
              return {
                ...t,
                ...audit,
                verification: "NEEDS_INFO",
                note: reason
                  ? `Cần bổ sung dữ liệu: ${reason}`
                  : "Cần bổ sung dữ liệu trước khi duyệt.",
              };
            case "dispute":
              return {
                ...t,
                ...audit,
                verification: "DISPUTED",
                note: "Đang trong khiếu nại/hoàn trả — chưa được đưa vào tập tham khảo.",
              };
            case "resolveReturn":
              return {
                ...t,
                ...audit,
                verification: "RETURNED",
                note: "Khiếu nại kết thúc: giao dịch hoàn trả — không đưa vào tập tham khảo.",
              };
            case "resolveAccept":
              return {
                ...t,
                ...audit,
                verification: "VERIFIED",
                note: "Khiếu nại kết thúc: xác nhận hợp lệ, đưa vào tập tham khảo.",
              };
            default:
              return t;
          }
        })
      );
    },
    [user]
  );

  /* ----------------------- Thống kê giá tham khảo -----------------------
   * Toàn bộ quy tắc tính dải (phân vị P10/P90, cửa sổ 3/6/12, tối thiểu 35
   * giao dịch, độ tin cậy, tách nguồn mô phỏng/thật) nằm ở lớp engine
   * (src/data/pricing*.js). Giao diện CHỈ đọc kết quả, không tự tính lại.
   */
  const referenceNow = useMemo(() => new Date(), []);
  // Khối lượng giao dịch MÔ PHỎNG để minh hoạ dải giá GĐ2 (xem demoVolume.js).
  // Dùng CHUNG cho trang chi tiết máy, dashboard quản trị và dải giá công khai ở
  // trang chủ — không tạo bộ dữ liệu giá riêng.
  const demoPhones = useMemo(
    () => [
      { phoneId: "P001", count: 35, basePrice: 9500000 },
      { phoneId: "P002", count: 35, basePrice: 7000000 },
      { phoneId: "P003", count: 35, basePrice: 11500000 },
      { phoneId: "P004", count: 35, basePrice: 12500000 },
    ],
    []
  );
  const referenceDetails = useMemo(() => {
    const base = buildDetailSet({ transactions, listings, demoPhones }).map((d) => {
      const ov = referenceOverrides[d.transaction_detail_id];
      if (!ov) return d;
      return {
        ...d,
        review_decision: ov.decision,
        reference_status: ov.decision === "REVOKE" ? "REVOKED" : d.reference_status,
        review_reason: ov.reason,
        review_by: ov.by,
        review_at: ov.at,
        review_history: ov.history || [],
      };
    });
    // Gom cụm quan hệ + cờ nghi vấn (đều ở tầng engine, KHÔNG tính ở giao diện).
    const { items } = withClusterIds(base);
    const flagsMap = computeAllSuspicionFlags(items);
    return items.map((d) => {
      const status = referenceDataStatus(d, referenceNow);
      return {
        ...d,
        suspicion_flags: flagsMap.get(d.transaction_detail_id) || [],
        // Trạng thái dữ liệu tham chiếu — TÁCH RIÊNG khỏi trạng thái đơn hàng.
        reference_data_status: status.status,
        reference_reasons: status.reasons,
      };
    });
  }, [transactions, listings, demoPhones, referenceOverrides, referenceNow]);

  /** Đầu ra giá tham khảo (GĐ1 + GĐ2 + độ tin cậy + vị trí giá) cho một tin đăng. */
  const referencePrice = useCallback(
    (phoneId) => {
      const phone = listings.find((p) => p.id === phoneId) || null;
      const details = referenceDetails.filter((d) => d.listing_id === phoneId);
      return getReferencePrice(phone, { details, now: referenceNow });
    },
    [listings, referenceDetails, referenceNow]
  );

  /**
   * Danh sách giá tham khảo CÔNG KHAI cho trang chủ: các tin đang hoạt động có
   * đủ dữ liệu để công bố dải P10–P90. Dùng CHUNG engine/dữ liệu với trang chi
   * tiết máy — không tạo bộ dữ liệu giá riêng.
   */
  const publicReferenceList = useMemo(() => {
    return listings
      .filter((p) => p.listingStatus === "ACTIVE")
      .map((p) => ({ phone: p, reference: referencePrice(p.id) }))
      .filter(({ reference }) => reference?.usedPrice?.status === "RANGE")
      .slice(0, 4);
  }, [listings, referencePrice]);

  /** Giá tham khảo cho "sản phẩm nháp" ở Bước 4 luồng đăng bán (theo model+dung lượng). */
  const referenceForProduct = useCallback(
    (product) =>
      getReferenceForProduct(product, {
        details: referenceDetails,
        now: referenceNow,
        role: "seller",
      }),
    [referenceDetails, referenceNow]
  );

  /**
   * Quyết định của quản trị cho MỘT mã chi tiết giao dịch (đưa vào hàng đợi dữ
   * liệu tham chiếu). Không thay đổi trạng thái nghiệp vụ đơn hàng.
   * decision: "ALLOW" | "PENDING" | "EXCLUDE" | "REVOKE".
   */
  const setReferenceDecision = useCallback(
    (detailId, decision, reason = "") => {
      if (!detailId || !decision) return;
      const by = user?.name || "Quản trị viên";
      const at = stamp();
      setReferenceOverrides((prev) => {
        const prevOv = prev[detailId];
        return {
          ...prev,
          [detailId]: {
            decision,
            reason,
            by,
            at,
            history: [...(prevOv?.history || []), { decision, reason, by, at }],
          },
        };
      });
    },
    [user]
  );

  /** Thu hồi một giao dịch + yêu cầu tính lại (state trên sẽ tự tính lại dải). */
  const revokeReference = useCallback(
    (detailId, reason = "") => setReferenceDecision(detailId, "REVOKE", reason),
    [setReferenceDecision]
  );

  /** Thống kê dải giá theo từng nhóm model+dung lượng (cho màn quản trị). */
  const referenceGroups = useMemo(() => {
    const map = new Map();
    for (const d of referenceDetails) {
      const s = d.phone_snapshot || {};
      if (!s.model || !s.storage) continue;
      const key = `${s.model}|${s.storage}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(d);
    }
    const out = [];
    for (const [key, items] of map) {
      const head = items[0].phone_snapshot;
      const range = getReferencePrice(
        { id: key, model: head.model, storage: head.storage },
        { details: items, now: referenceNow }
      );
      out.push({ key, model: head.model, storage: head.storage, count: items.length, reference: range });
    }
    return out.sort((a, b) => a.model.localeCompare(b.model));
  }, [referenceDetails, referenceNow]);

  const dashboardStats = useMemo(() => {
    const valid = transactions.filter((t) => isValidReference(t));
    const pending = transactions.filter((t) => t.verification === "PENDING");
    const disputed = transactions.filter((t) => t.verification === "DISPUTED");
    const returned = transactions.filter(
      (t) => t.verification === "RETURNED" || t.verification === "REJECTED"
    );
    const cancelled = transactions.filter((t) => t.status === "CANCELLED");
    const activeListings = listings.filter((l) => l.listingStatus === "ACTIVE");
    const publishableModels = listings.filter(
      (l) => referencePrice(l.id).usedPrice.status === "RANGE"
    ).length;
    return {
      totalListings: listings.length,
      activeListings: activeListings.length,
      totalTransactions: transactions.length,
      validTransactions: valid.length,
      pendingCount: pending.length,
      disputedCount: disputed.length,
      returnedCount: returned.length,
      cancelledCount: cancelled.length,
      modelsWithEnoughData: publishableModels,
      publishableModels,
      minTransactions: PRICING_CONFIG.minTransactions,
    };
  }, [transactions, listings, referencePrice]);

  const value = {
    user,
    login,
    apiSession,
    apiReady,
    register,
    registeredAccounts,
    loginAs,
    switchRole,
    demoMode,
    setDemoMode,
    roleSwitchLog,
    logout,
    resetDemoState,
    demoRestored: !!bootstrap,
    updateProfile,
    region,
    setRegion,
    favorites,
    isFavorite,
    toggleFavorite,
    removeFavorite,
    listings,
    getPhone,
    addListing,
    updateListingStatus,
    negotiations,
    startNegotiation,
    sendOffer,
    sellerRespond,
    acceptCounter,
    rejectCounter,
    sellerReject,
    cancelNegotiation,
    // ——— Quy tắc thương lượng (dùng chung cho giao diện) ———
    NEGOTIATION_STATUS,
    NEGOTIATION_STATUS_LABEL,
    NEGOTIATION_STATUS_TONE,
    OPEN_NEGOTIATION_STATUSES,
    isNegotiationOpen,
    canBuyerSendOffer,
    canSellerRespond,
    canBuyerHandleCounter,
    canBuyerCreateOrder,
    counterPriceBetween,
    lastBuyerOffer,
    roundPrice,
    validateOrderDraft,
    notifications,
    unreadCount,
    readNotifIds,
    markNotificationRead,
    markAllNotificationsRead,
    userReviews,
    addReview,
    hasReviewedOrder,
    orders,
    createOrder,
    confirmOrderByBuyer,
    respondOrderBySeller,
    cancelOrder,
    setOrderPaymentMethod,
    initiateQrPayment,
    simulatePaymentResult,
    advanceCodPayment,
    // Tương thích tên cũ: đối soát COD = tiến một bước trong luồng COD.
    reconcileCodPayment: advanceCodPayment,
    canStartShipping,
    prepareOrder,
    createShipment,
    advanceShipping,
    markDeliveryFailed,
    retryDelivery,
    startReturnToSeller,
    markReturnedToSeller,
    confirmOrderRefundDone,
    reportShippingIncident,
    recordSellerPayout,
    confirmReceipt,
    simulateSupportExpiry,
    createSupportRequest,
    respondSupportRequest,
    escalateOverdueSupport,
    resolveSupportRequest,
    confirmReturnReceived,
    startRefund,
    confirmRefundDone,
    // Tương thích tên cũ.
    processRefund: startRefund,
    // ——— Hồ sơ trả hàng – hoàn tiền – khiếu nại ———
    openCase,
    addCaseEvidence,
    sellerRespondCase,
    buyerSupplementCase,
    buyerChooseAfterReject,
    withdrawCase,
    managerTakeCase,
    managerRequestCaseInfo,
    managerVerifyShipping,
    managerRequestTechnicalCheck,
    managerIssuePlan,
    managerResolvePlanReview,
    sellerProvideReturnInfo,
    buyerMarkReturnHandedOver,
    advanceReturnShipment,
    reportReturnProblem,
    sellerConfirmReturnOk,
    reportReturnObstacle,
    markRefundFailed,
    confirmRefundReconcile,
    buyerReportRefundNotReceived,
    closeCase,
    demoMakeOverdue,
    // ——— Hằng số & tiện ích hồ sơ ———
    CASE_TYPE,
    CASE_TYPE_LABEL,
    CASE_DEADLINES,
    CASE_REASON_OPTIONS,
    RETURN_REASON_KEYS,
    RETURN_STATUS_LABEL,
    RETURN_SHIPMENT_STATUS,
    RETURN_SHIPMENT_STATUS_LABEL,
    RETURN_OBSTACLES,
    REFUND_STATUS,
    REFUND_STATUS_LABEL,
    REFUND_STATUS_TONE,
    VERIFICATION_STATUS,
    VERIFICATION_STATUS_LABEL,
    VERIFICATION_OUTCOME,
    VERIFICATION_OUTCOME_LABEL,
    activeCase,
    casesOf,
    isCaseOpen,
    isCaseClosed,
    casePendingStep,
    remainingText,
    canWithdrawCase,
    partyOf,
    isRefundRunning,
    isReturnInMotion,
    planMissingFields,
    planTotals,
    maskTracking,
    maskAddress,
    maskPaymentMethod,
    makeEvidence,
    transactions,
    verifyTransaction,
    checkReferenceEligibility,
    // Quy tắc nghiệp vụ (Phần XVI) để giao diện chỉ đọc, không tự suy diễn.
    PAYMENT_METHODS,
    PAYMENT_STATUS,
    PAYMENT_STATUS_LABEL,
    PAYMENT_STATUS_TONE,
    PAYOUT_STATUS,
    PAYOUT_STATUS_LABEL,
    PAYOUT_STATUS_TONE,
    CANCEL_PHASE,
    RETURN_STATUS,
    RETURN_REASON_OPTIONS,
    RETURN_WINDOW_DAYS,
    SELLER_RESPONSE_HOURS,
    MAX_DELIVERY_ATTEMPTS,
    canCancelOrder,
    canRequestReturn,
    canRetryDelivery,
    mustReturnToSeller,
    canStartReturnToSeller,
    hasCarrierHandover,
    shipmentNotYetHandedOver,
    isBuyerRefusal,
    nextActorFor,
    canCollectCod,
    deliveryClock,
    deliveryFailureCount,
    completionStatus,
    sellerPayoutEligibility,
    isPaymentSettled,
    isPaymentRefunded,
    isRefundInProgress,
    isReturnOpen,
    isSellerResponseOverdue,
    openReturnRequests,
    afterDeliveryWindowElapsed,
    SUPPORT_TYPES,
    referencePrice,
    referenceForProduct,
    publicReferenceList,
    referenceDetails,
    referenceGroups,
    setReferenceDecision,
    revokeReference,
    dashboardStats,
    pendingCheckout,
    setPendingCheckout,
    toast,
    showToast,
    clearToast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp phải dùng trong AppProvider");
  return ctx;
}
