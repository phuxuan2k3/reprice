/**
 * QUY TẮC HỒ SƠ TRẢ HÀNG – HOÀN TIỀN – KHIẾU NẠI — RePrice.
 *
 * Module THUẦN (không phụ thuộc React, không đọc localStorage) mô hình hoá
 * "hồ sơ" (case file) cùng bằng chứng, phiếu xác minh vận chuyển, vận đơn trả,
 * phương án xử lý và giao dịch hoàn tiền. Dùng chung cho context, giao diện và
 * bộ kiểm thử tự động.
 *
 * NGUYÊN TẮC:
 *  - Hồ sơ TÁCH BIỆT khỏi trạng thái đơn hàng / thanh toán / vận đơn / chi trả
 *    / hoàn tiền. Mỗi nhóm có trạng thái riêng.
 *  - Mỗi đơn chỉ có MỘT hồ sơ đang hoạt động.
 *  - Không tự kết luận đúng/sai, không tự hoàn tiền, không tự thu hồi tiền đã
 *    chuyển. Toàn bộ trạng thái tiền là MÔ PHỎNG.
 *  - Các chính sách chưa chốt (địa điểm nhận thay thế, phí/đơn vị kiểm tra kỹ
 *    thuật, phân bổ phí khi chưa rõ trách nhiệm) hiển thị "Chờ hoàn thiện
 *    phương án" và CHẶN bước phụ thuộc — không tự quyết định.
 */

import {
  CLOSED_RETURN_STATUSES,
  OPEN_RETURN_STATUSES,
  RETURN_STATUS,
  addDays,
  addHours,
} from "./orderRules.js";

/* ===================================================================== */
/* 1. LOẠI HỒ SƠ                                                         */
/* ===================================================================== */

export const CASE_TYPE = {
  RETURN: "RETURN", // yêu cầu trả hàng/hoàn tiền
  NOT_RECEIVED: "NOT_RECEIVED", // báo chưa nhận được hàng
  DISPUTE: "DISPUTE", // khiếu nại/hỗ trợ sau hoàn tất
};

export const CASE_TYPE_LABEL = {
  [CASE_TYPE.RETURN]: "Yêu cầu trả hàng/hoàn tiền",
  [CASE_TYPE.NOT_RECEIVED]: "Báo chưa nhận được hàng",
  [CASE_TYPE.DISPUTE]: "Yêu cầu hỗ trợ/khiếu nại",
};

/** Lý do trả hàng theo đặc tả VI.1 (không tự động chấp thuận chỉ vì chọn lý do). */
export const RETURN_REASON_KEYS = [
  "Sai máy/phiên bản",
  "Tình trạng sai mô tả",
  "Lỗi chức năng chưa công bố",
  "Thiếu/sai phụ kiện đã cam kết",
  "Hư hỏng nghi do vận chuyển",
];

export const CASE_REASON_OPTIONS = [...RETURN_REASON_KEYS, "Chưa nhận được hàng", "Lý do khác"];

/* ===================================================================== */
/* 2. MỐC THỜI HẠN                                                       */
/* ===================================================================== */

export const CASE_DEADLINES = {
  SELLER_RESPONSE_HOURS: 48, // người bán phản hồi
  BUYER_SUPPLEMENT_HOURS: 48, // người mua bổ sung sau khi người bán đề nghị
  SELLER_AFTER_SUPPLEMENT_HOURS: 24, // người bán quyết định lại sau khi có bổ sung
  BUYER_AFTER_REJECT_HOURS: 48, // người mua chọn sau khi người bán từ chối
  PLAN_REVIEW_HOURS: 48, // hạn xem xét lại nội bộ của phương án
  RETURN_INSPECT_HOURS: 48, // người bán kiểm tra hàng trả
  RETURN_HANDOVER_DAYS: 3, // hạn người mua bàn giao hàng trả
};

/* ===================================================================== */
/* 3. TRẠNG THÁI THÀNH PHẦN (phiếu xác minh / vận đơn trả / hoàn tiền)   */
/* ===================================================================== */

export const VERIFICATION_STATUS = {
  NOT_SENT: "NOT_SENT",
  SENT: "SENT",
  AWAITING: "AWAITING",
  RESPONDED: "RESPONDED",
};

export const VERIFICATION_STATUS_LABEL = {
  NOT_SENT: "Chưa gửi",
  SENT: "Đã gửi",
  AWAITING: "Chờ phản hồi",
  RESPONDED: "Đã phản hồi",
};

/** Nhánh kết quả xác minh vận chuyển (VIII.3). */
export const VERIFICATION_OUTCOME = {
  WRONG_UPDATE: "WRONG_UPDATE", // cập nhật nhầm → hủy mốc 72h sai
  REDELIVER: "REDELIVER", // giao lại
  LOST: "LOST", // thất lạc/chưa nhận được xác minh
  CONFLICT: "CONFLICT", // bằng chứng mâu thuẫn → tiếp tục xác minh
  NO_REPLY: "NO_REPLY", // chưa trả lời
};

export const VERIFICATION_OUTCOME_LABEL = {
  WRONG_UPDATE: "Cập nhật nhầm — điều chỉnh trạng thái",
  REDELIVER: "Giao lại cho người mua",
  LOST: "Thất lạc/chưa nhận được (xác minh)",
  CONFLICT: "Bằng chứng mâu thuẫn — tiếp tục xác minh",
  NO_REPLY: "Đơn vị vận chuyển chưa trả lời",
};

export const RETURN_SHIPMENT_STATUS = {
  PENDING_INFO: "RETURN_PENDING_INFO",
  AWAITING_HANDOVER: "RETURN_AWAITING_HANDOVER",
  IN_TRANSIT: "RETURNING",
  DELIVERED_INSPECT: "RETURNED",
  OBSTACLE: "RETURN_OBSTACLE",
  DISPUTE: "RETURN_DISPUTE",
  REFUND_ELIGIBLE: "REFUND_ELIGIBLE",
};

export const RETURN_SHIPMENT_STATUS_LABEL = {
  [RETURN_SHIPMENT_STATUS.PENDING_INFO]: "Chờ hoàn thiện thông tin nhận trả",
  [RETURN_SHIPMENT_STATUS.AWAITING_HANDOVER]: "Chờ bàn giao",
  [RETURN_SHIPMENT_STATUS.IN_TRANSIT]: "Đang vận chuyển trả",
  [RETURN_SHIPMENT_STATUS.DELIVERED_INSPECT]: "Đã giao trả, chờ kiểm tra",
  [RETURN_SHIPMENT_STATUS.OBSTACLE]: "Có trở ngại trả hàng",
  [RETURN_SHIPMENT_STATUS.DISPUTE]: "Có tranh chấp hàng trả",
  [RETURN_SHIPMENT_STATUS.REFUND_ELIGIBLE]: "Đủ điều kiện hoàn tiền",
};

export const RETURN_SHIPMENT_SEQUENCE = [
  RETURN_SHIPMENT_STATUS.PENDING_INFO,
  RETURN_SHIPMENT_STATUS.AWAITING_HANDOVER,
  RETURN_SHIPMENT_STATUS.IN_TRANSIT,
  RETURN_SHIPMENT_STATUS.DELIVERED_INSPECT,
];

/** Trở ngại trả hàng (X.6). */
export const RETURN_OBSTACLES = [
  "Vận chuyển chưa đến lấy",
  "Sai địa chỉ",
  "Người bán từ chối nhận",
  "Kiện trả thất lạc/hư hỏng",
  "Người mua quá hạn bàn giao",
];

/** Trạng thái giao dịch hoàn tiền (XI.2). */
export const REFUND_STATUS = {
  APPROVED: "APPROVED", // đã duyệt hoàn (chưa phải tiền đã về)
  PROCESSING: "PROCESSING", // đang xử lý hoàn
  DONE: "DONE", // hoàn thành công
  FAILED: "FAILED", // hoàn thất bại
  RECONCILE: "RECONCILE", // chờ đối soát
};

export const REFUND_STATUS_LABEL = {
  APPROVED: "Đã duyệt hoàn",
  PROCESSING: "Đang xử lý hoàn",
  DONE: "Hoàn thành công",
  FAILED: "Hoàn thất bại",
  RECONCILE: "Chờ đối soát",
};

export const REFUND_STATUS_TONE = {
  APPROVED: "blue",
  PROCESSING: "purple",
  DONE: "green",
  FAILED: "red",
  RECONCILE: "amber",
};

/* ===================================================================== */
/* 4. TIỆN ÍCH CHUNG                                                     */
/* ===================================================================== */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseTime(value) {
  if (value == null) return NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? NaN : t;
}

/** Đã quá hạn một mốc ISO hay chưa. */
export function isOverdue(dueAt, now = new Date()) {
  const t = parseTime(dueAt);
  if (Number.isNaN(t)) return false;
  return now.getTime() > t;
}

/** Khoảng thời gian còn lại dạng "còn 2 ngày 3 giờ" / "quá hạn 4 giờ". */
export function remainingText(dueAt, now = new Date()) {
  const t = parseTime(dueAt);
  if (Number.isNaN(t)) return "";
  const diff = t - now.getTime();
  const overdue = diff < 0;
  let ms = Math.abs(diff);
  const days = Math.floor(ms / DAY_MS);
  ms -= days * DAY_MS;
  const hours = Math.floor(ms / HOUR_MS);
  const mins = Math.floor((ms - hours * HOUR_MS) / 60000);
  const parts = [];
  if (days) parts.push(`${days} ngày`);
  if (hours) parts.push(`${hours} giờ`);
  if (!days && !hours) parts.push(`${Math.max(mins, 0)} phút`);
  return `${overdue ? "quá hạn" : "còn"} ${parts.join(" ")}`;
}

/* ===================================================================== */
/* 5. TRUY VẤN HỒ SƠ                                                     */
/* ===================================================================== */

export function casesOf(order) {
  return order?.supportRequests || [];
}

export function isCaseOpen(req) {
  return OPEN_RETURN_STATUSES.includes(req?.status);
}

export function isCaseClosed(req) {
  return CLOSED_RETURN_STATUSES.includes(req?.status);
}

/** Hồ sơ đang hoạt động của đơn (nếu có) — mỗi đơn chỉ có tối đa một. */
export function activeCase(order) {
  return casesOf(order).find(isCaseOpen) || null;
}

export function caseById(order, caseId) {
  return casesOf(order).find((r) => r.id === caseId) || null;
}

export function closedCases(order) {
  return casesOf(order).filter(isCaseClosed);
}

/* ===================================================================== */
/* 6. BẰNG CHỨNG (bất biến: đã gửi thì không sửa/xóa, chỉ bổ sung mới)   */
/* ===================================================================== */

export const EVIDENCE_VISIBILITY = {
  PARTIES: "PARTIES", // người mua + người bán xem được
  ADMIN: "ADMIN", // chỉ quản trị xem được
};

/**
 * Tạo bản ghi bằng chứng có cấu trúc. `files` chỉ lưu METADATA mô tả
 * (tên/kích thước/loại) — localStorage KHÔNG lưu được nội dung tệp.
 */
export function makeEvidence({ by, role, text, files, visibility = EVIDENCE_VISIBILITY.PARTIES, at } = {}) {
  const stamp = at || new Date().toISOString();
  return {
    id: `EV-${Math.random().toString(36).slice(2, 8).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}`,
    by: by || "—",
    role: role || null,
    at: stamp,
    text: String(text || "").trim(),
    files: Array.isArray(files) ? files : [],
    visibility,
    verification: null, // { status, note, by, at } khi QTV xác minh
    simulated: true,
  };
}

/** Chuẩn hoá danh sách bằng chứng (chấp nhận cả chuỗi cũ để tương thích). */
export function normalizeEvidenceList(evidence, ctx = {}) {
  if (!evidence) return [];
  const list = Array.isArray(evidence)
    ? evidence
    : String(evidence)
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
  return list
    .map((e) => {
      if (typeof e === "string") {
        const text = e.trim();
        if (!text) return null;
        return makeEvidence({ ...ctx, text });
      }
      if (e && typeof e === "object") {
        return e.id ? e : makeEvidence({ ...ctx, ...e });
      }
      return null;
    })
    .filter(Boolean);
}

/* ===================================================================== */
/* 7. "AI CẦN LÀM GÌ TRƯỚC THỜI ĐIỂM NÀO"                                 */
/* ===================================================================== */

/**
 * Xác định bên cần hành động và hạn tương ứng của hồ sơ.
 * Trả { party: "SELLER"|"BUYER"|"MANAGER"|"CARRIER"|null, text, dueAt }.
 */
export function casePendingStep(req) {
  if (!req) return { party: null, text: "", dueAt: null };
  const s = req.status;
  switch (s) {
    case RETURN_STATUS.PENDING_SELLER:
      return { party: "SELLER", text: "Người bán phản hồi yêu cầu", dueAt: req.sellerResponseDueAt };
    case RETURN_STATUS.SELLER_SUPPLEMENT:
      return { party: "BUYER", text: "Người mua bổ sung thông tin/bằng chứng", dueAt: req.buyerSupplementDueAt };
    case RETURN_STATUS.IN_PROGRESS:
      return { party: "SELLER", text: "Người bán quyết định sau khi người mua bổ sung", dueAt: req.sellerReDecisionDueAt };
    case RETURN_STATUS.AFTER_REJECT_BUYER:
      return { party: "BUYER", text: "Người mua chọn: yêu cầu RePrice giải quyết hoặc kết thúc", dueAt: req.buyerRejectChoiceDueAt };
    case RETURN_STATUS.PENDING_MANAGER:
      return { party: "MANAGER", text: "Quản lý nhận phụ trách và xác minh", dueAt: null };
    case RETURN_STATUS.NEEDS_INFO:
      return { party: req.awaits || "BUYER", text: "Các bên bổ sung theo yêu cầu của quản lý", dueAt: req.inforDueAt };
    case RETURN_STATUS.UNDER_REVIEW:
      return { party: "MANAGER", text: "Quản lý xác minh và ban hành phương án", dueAt: null };
    case RETURN_STATUS.AWAITING_PLAN:
      return { party: "MANAGER", text: "Chờ hoàn thiện phương án (thiếu thông tin bắt buộc)", dueAt: null };
    case RETURN_STATUS.PLAN_REVIEW:
      return { party: "MANAGER", text: "Chờ hết thời hạn xem xét lại phương án", dueAt: req.plan?.reviewUntil };
    case RETURN_STATUS.RETURN_PENDING_INFO:
      return { party: req.awaits || "MANAGER", text: "Hoàn thiện thông tin nhận trả", dueAt: null };
    case RETURN_STATUS.ACCEPTED_RETURN:
      return { party: "MANAGER", text: "Chuẩn bị phương án/địa chỉ nhận trả", dueAt: null };
    case RETURN_STATUS.RETURN_AWAITING_HANDOVER:
      return { party: "BUYER", text: "Người mua bàn giao hàng trả", dueAt: req.returnShipment?.handoverDueAt };
    case RETURN_STATUS.RETURNING:
      return { party: "CARRIER", text: "Đơn vị vận chuyển đang chuyển hàng trả (mô phỏng)", dueAt: null };
    case RETURN_STATUS.RETURNED:
      return { party: "SELLER", text: "Người bán kiểm tra hàng trả", dueAt: req.returnInspectDueAt };
    case RETURN_STATUS.RETURN_OBSTACLE:
      return { party: "MANAGER", text: "Quản lý xử lý trở ngại trả hàng", dueAt: null };
    case RETURN_STATUS.RETURN_DISPUTE:
      return { party: "MANAGER", text: "Quản lý xử lý tranh chấp hàng trả", dueAt: null };
    case RETURN_STATUS.REFUND_ELIGIBLE:
      return { party: "MANAGER", text: "Khởi tạo hoàn tiền theo phương án đã duyệt", dueAt: null };
    case RETURN_STATUS.REFUND_PROCESSING:
      return { party: "MANAGER", text: "Ghi nhận kết quả hoàn tiền (mô phỏng)", dueAt: null };
    case RETURN_STATUS.PENDING_REFUND:
      return { party: "MANAGER", text: "Ghi nhận kết quả hoàn tiền (mô phỏng)", dueAt: null };
    case RETURN_STATUS.REFUND_RECONCILE:
      return { party: "MANAGER", text: "Đối soát kết quả hoàn tiền (mô phỏng)", dueAt: null };
    default:
      return { party: null, text: "Hồ sơ đã khép lại", dueAt: null };
  }
}

/* ===================================================================== */
/* 8. PHƯƠNG ÁN XỬ LÝ                                                    */
/* ===================================================================== */

/**
 * Các trường BẮT BUỘC của phương án theo IX. Khi thiếu → chặn bước phụ thuộc.
 */
export function planMissingFields(plan) {
  if (!plan) return ["Chưa có phương án."];
  const missing = [];
  if (!plan.conclusion || !plan.conclusion.trim()) missing.push("Kết luận");
  if (!plan.basis || !plan.basis.trim()) missing.push("Căn cứ/bằng chứng");
  if (typeof plan.requiresReturn !== "boolean") missing.push("Có trả hàng hay không");
  if (plan.goodsAmount == null || Number.isNaN(Number(plan.goodsAmount)))
    missing.push("Tiền hàng được hoàn");
  if (!Array.isArray(plan.fees)) missing.push("Các khoản phí");
  if (plan.requiresReturn && (!plan.returnAddress || !plan.returnAddress.trim()))
    missing.push("Địa điểm nhận trả");
  if (!Array.isArray(plan.tasks) || plan.tasks.length === 0) missing.push("Ai làm gì, thời hạn");
  return missing;
}

export function isPlanComplete(plan) {
  return planMissingFields(plan).length === 0;
}

/** Tổng tiền hoàn = tiền hàng + các khoản phí. */
export function planTotals(plan) {
  const goods = Number(plan?.goodsAmount) || 0;
  const fees = Array.isArray(plan?.fees) ? plan.fees : [];
  const feeTotal = fees.reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
  return { goods, feeTotal, total: goods + feeTotal };
}

/* ===================================================================== */
/* 9. CHE DỮ LIỆU NHẠY CẢM (XII.5)                                       */
/* ===================================================================== */

/** Che bớt mã vận đơn, chỉ giữ đầu/cuối. */
export function maskTracking(code, canSeeAll = false) {
  if (!code) return "—";
  if (canSeeAll) return code;
  const s = String(code);
  if (s.length <= 6) return `${s.slice(0, 2)}***`;
  return `${s.slice(0, 3)}***${s.slice(-3)}`;
}

/** Che bớt địa chỉ (chỉ hiện khu vực chung). */
export function maskAddress(address, canSeeAll = false) {
  if (!address) return "—";
  if (canSeeAll) return address;
  const s = String(address).trim();
  const parts = s.split(",");
  if (parts.length > 1) return `${parts[parts.length - 1].trim()} (đã che chi tiết)`;
  return `${s.slice(0, 3)}*** (đã che chi tiết)`;
}

/** Che phương thức nhận hoàn tiền, chỉ hiện loại + 4 ký tự cuối. */
export function maskPaymentMethod(label, canSeeAll = false) {
  if (!label) return "—";
  if (canSeeAll) return label;
  const s = String(label);
  return `${s.slice(0, 2)}***${s.slice(-2)}`;
}

/* ===================================================================== */
/* 10. QUYỀN / ĐIỀU KIỆN HÀNH ĐỘNG                                       */
/* ===================================================================== */

/** Đơn vị đang đóng vai với đơn này. */
export function partyOf(order, actor = {}) {
  const { userId = null, role = null } = actor;
  if (role === "manager") return "MANAGER";
  if (userId && order?.buyerId === userId) return "BUYER";
  if (userId && order?.sellerId === userId) return "SELLER";
  return "OUTSIDER";
}

/** Người ngoài đơn KHÔNG được xem hồ sơ. */
export function canViewCase(order, actor = {}) {
  return partyOf(order, actor) !== "OUTSIDER";
}

/** Có đang có giao dịch hoàn chạy (không cho rút hồ sơ tự đóng). */
export function isRefundRunning(req) {
  return [
    RETURN_STATUS.REFUND_PROCESSING,
    RETURN_STATUS.PENDING_REFUND,
    RETURN_STATUS.REFUND_RECONCILE,
    RETURN_STATUS.REFUNDED,
  ].includes(req?.status);
}

/** Hàng đã gửi trả hay đang trong luồng trả (không cho rút tự đóng). */
export function isReturnInMotion(req) {
  return [
    RETURN_STATUS.RETURNING,
    RETURN_STATUS.RETURNED,
    RETURN_STATUS.RETURN_OBSTACLE,
    RETURN_STATUS.RETURN_DISPUTE,
    RETURN_STATUS.REFUND_ELIGIBLE,
  ].includes(req?.status);
}

/** Người mua có thể rút yêu cầu hay không (VI.6). */
export function canWithdrawCase(order, req, actor = {}) {
  if (!req || !isCaseOpen(req)) return { allowed: false, reason: "Hồ sơ đã khép lại." };
  if (partyOf(order, actor) !== "BUYER")
    return { allowed: false, reason: "Chỉ người mua được rút yêu cầu của mình." };
  if (isReturnInMotion(req) || isRefundRunning(req))
    return {
      allowed: false,
      reason:
        "Hàng đã gửi trả hoặc giao dịch hoàn đang chạy — không thể tự rút. Trường hợp này chuyển quản lý xử lý.",
    };
  return { allowed: true, reason: "" };
}

/** Mốc hạn bổ sung/tái quyết định cho người bán & người mua. */
export function sellerSupplementDeadline(fromIso) {
  return addHours(fromIso, CASE_DEADLINES.BUYER_SUPPLEMENT_HOURS);
}
export function sellerReDecisionDeadline(fromIso) {
  return addHours(fromIso, CASE_DEADLINES.SELLER_AFTER_SUPPLEMENT_HOURS);
}
export function buyerRejectChoiceDeadline(fromIso) {
  return addHours(fromIso, CASE_DEADLINES.BUYER_AFTER_REJECT_HOURS);
}
export function returnHandoverDeadline(fromIso) {
  return addDays(fromIso, CASE_DEADLINES.RETURN_HANDOVER_DAYS);
}
export function returnInspectDeadline(fromIso) {
  return addHours(fromIso, CASE_DEADLINES.RETURN_INSPECT_HOURS);
}
export function planReviewDeadline(fromIso) {
  return addHours(fromIso, CASE_DEADLINES.PLAN_REVIEW_HOURS);
}

/* ===================================================================== */
/* 11. QUY TẮC THỜI GIAN ĐÁNG CHÚ Ý                                      */
/* ===================================================================== */

/**
 * Hồ sơ đang quá hạn bước hiện tại (dùng để chuyển trạng thái thực sự, không
 * chỉ đổi màu). Trả { overdue, party, dueAt }.
 */
export function caseOverdue(req, now = new Date()) {
  const step = casePendingStep(req);
  if (!step.dueAt) return { overdue: false, party: step.party, dueAt: null };
  return { overdue: isOverdue(step.dueAt, now), party: step.party, dueAt: step.dueAt };
}
