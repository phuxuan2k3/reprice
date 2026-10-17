/**
 * Gọi backend RePrice (docs/openapi.yaml). Mặc định cùng origin `/api/v1`:
 * khi dev, Vite proxy sang localhost:8080 (vite.config.js); khi deploy, backend phục vụ luôn web.
 */
const BASE = import.meta.env.VITE_API_URL || "/api/v1";
const TOKEN_KEY = "reprice_token";

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* trình duyệt chặn storage: phiên chỉ sống trong tab */
  }
}

export async function api(path, { method = "GET", body, query } = {}) {
  const qs = query
    ? "?" +
      new URLSearchParams(
        Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== "")
      ).toString()
    : "";
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = readToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(BASE + path + qs, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Không kết nối được máy chủ RePrice. Kiểm tra backend đã chạy chưa.");
  }
  if (res.status === 401 && token) setToken(null);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error || {};
    throw new ApiError(res.status, e.code || "UNKNOWN", e.message || `Lỗi ${res.status}`, e.details);
  }
  return data;
}

/** Vai trò trên thanh chuyển vai của web → demoRole của backend. */
const DEMO_ROLE = { buyer: "BUYER", seller: "SELLER", manager: "ADMIN" };

/** Đăng nhập backend bằng tài khoản demo ứng với vai trò; guest thì đăng xuất. */
export async function loginAsRole(role) {
  if (!DEMO_ROLE[role]) {
    setToken(null);
    return null;
  }
  const accounts = await api("/demo/accounts");
  const account = accounts.find((a) => a.demoRole === DEMO_ROLE[role]);
  if (!account) throw new ApiError(404, "NOT_FOUND", "Không có tài khoản demo cho vai trò này.");
  const session = await api("/demo/login-as", { method: "POST", body: { userId: account.id } });
  setToken(session.token);
  return session.user;
}

export const listingsApi = {
  list: (query) => api("/listings", { query }),
  get: (id) => api(`/listings/${id}`),
  referencePrice: (id, price) => api(`/listings/${id}/reference-price`, { query: { price } }),
  priceRange: (versionId) => api(`/price-ranges/${versionId}`),
};

const post = (path, body) => api(path, { method: "POST", body: body ?? {} });

export const tradeApi = {
  buyNow: (listingId, expectedPrice) => post(`/listings/${listingId}/buy-now`, { expectedPrice }),
  startNegotiation: (listingId, amount, note) => post(`/listings/${listingId}/negotiations`, { amount, note }),
  myNegotiations: (role) => api("/me/negotiations", { query: { role } }),
  negotiation: (id) => api(`/negotiations/${id}`),
  counterOffer: (id, amount, note) => post(`/negotiations/${id}/offers`, { amount, note }),
  accept: (id) => post(`/negotiations/${id}/accept`),
  reject: (id, note) => post(`/negotiations/${id}/reject`, { note }),
  cancelNegotiation: (id) => post(`/negotiations/${id}/cancel`),

  myOrders: (role) => api("/me/orders", { query: { role } }),
  order: (id) => api(`/orders/${id}`),
  orderHistory: (id) => api(`/orders/${id}/history`),
  setShippingInfo: (id, info) => api(`/orders/${id}/shipping-info`, { method: "PUT", body: info }),
  pay: (id, method, channel) => post(`/orders/${id}/payment`, { method, channel }),
  cancelOrder: (id, reason) => post(`/orders/${id}/cancel`, { reason }),
  handover: (id) => post(`/orders/${id}/handover`),
  receive: (id) => post(`/orders/${id}/receive`),

  notifications: () => api("/me/notifications", { query: { pageSize: 50 } }),
  readNotification: (id) => post(`/me/notifications/${id}/read`),
  readAllNotifications: () => post("/me/notifications/read-all"),
};

/** Cổng thanh toán, đơn vị vận chuyển và đồng hồ giả lập (chỉ có khi backend bật DEMO_MODE). */
export const demoApi = {
  paymentResult: (orderId, result) => post(`/demo/payments/${orderId}/result`, { result }),
  advanceShipment: (id) => post(`/demo/shipments/${id}/advance`),
  failShipment: (id, kind) => post(`/demo/shipments/${id}/fail`, { kind }),
  advanceClock: (hours) => post("/demo/clock/advance", { hours }),
  clock: () => api("/demo/clock"),
};

export const catalogApi = {
  models: (brand) => api("/catalog/models", { query: { brand } }),
  variants: (modelId) => api(`/catalog/models/${modelId}/variants`),
};

export const sellerApi = {
  myListings: (status) => api("/me/listings", { query: { status } }),
  create: (input) => post("/listings", input),
  update: (id, input) => api(`/listings/${id}`, { method: "PATCH", body: input }),
  publish: (id) => post(`/listings/${id}/publish`, { confirmAccuracy: true }),
  pause: (id) => post(`/listings/${id}/pause`),
  resume: (id) => post(`/listings/${id}/resume`),
  remove: (id) => api(`/listings/${id}`, { method: "DELETE" }),
  preview: (input) => post("/reference-price/preview", input),
  /** Tải một ảnh (multipart, không đặt Content-Type để trình duyệt tự thêm boundary). */
  async uploadPhoto(id, file) {
    const form = new FormData();
    form.append("file", file);
    const headers = {};
    const token = readToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${BASE}/listings/${id}/photos`, { method: "POST", headers, body: form });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const e = data?.error || {};
      throw new ApiError(res.status, e.code || "UNKNOWN", e.message || `Lỗi ${res.status}`, e.details);
    }
    return data;
  },
};

export const adminApi = {
  dashboard: () => api("/admin/dashboard"),
  references: (query) => api("/admin/reference-transactions", { query }),
  reference: (id) => api(`/admin/reference-transactions/${id}`),
  decide: (id, action, reason) => post(`/admin/reference-transactions/${id}/decisions`, { action, reason }),
  config: () => api("/admin/pricing-config"),
  setZThreshold: (zThreshold, reason) => api("/admin/pricing-config", { method: "PUT", body: { zThreshold, reason } }),
  auditLogs: () => api("/admin/audit-logs"),
  resetDemo: () => post("/demo/reset"),
};

async function postForm(path, form) {
  const headers = {};
  const token = readToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(BASE + path, { method: "POST", headers, body: form });
  } catch {
    throw new ApiError(0, "NETWORK", "Không kết nối được máy chủ RePrice.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error || {};
    throw new ApiError(res.status, e.code || "UNKNOWN", e.message || `Lỗi ${res.status}`, e.details);
  }
  return data;
}

export const caseApi = {
  open: (orderId, input) => post(`/orders/${orderId}/cases`, input),
  mine: () => api("/me/cases"),
  get: (id) => api(`/cases/${id}`),
  addEvidence(id, note, files) {
    const form = new FormData();
    form.append("note", note || "");
    for (const f of files || []) form.append("files", f);
    return postForm(`/cases/${id}/evidence`, form);
  },
  sellerResponse: (id, action, message) => post(`/cases/${id}/seller-response`, { action, message }),
  buyerSupplement: (id, message) => post(`/cases/${id}/buyer-supplement`, { message }),
  buyerChoice: (id, action, note) => post(`/cases/${id}/buyer-choice`, { action, note }),
  returnHandover: (id, obstacle) => post(`/cases/${id}/return-handover`, { obstacle }),
  returnInspection: (id, result, problemType, message) => post(`/cases/${id}/return-inspection`, { result, problemType, message }),
  reviewRequest: (id, reason) => post(`/cases/${id}/review-request`, { reason }),
  refundNotReceived: (id, note) => post(`/cases/${id}/refund-not-received`, { note }),
  // QTV
  all: (open) => api("/admin/cases", { query: { open } }),
  assign: (id) => post(`/admin/cases/${id}/assign`),
  requestInfo: (id, party, message, dueHours) => post(`/admin/cases/${id}/request-info`, { party, message, dueHours }),
  verifyShipping: (id, question, outcome, response) => post(`/admin/cases/${id}/shipping-verifications`, { question, outcome, response }),
  resolve: (id, decision, rationale, refundAmount) => post(`/admin/cases/${id}/resolutions`, { decision, rationale, refundAmount }),
  refunds: () => api("/admin/refunds"),
  processRefund: (id) => post(`/admin/refunds/${id}/process`),
  retryRefund: (id) => post(`/admin/refunds/${id}/retry`),
  demoRefundResult: (id, result) => post(`/demo/refunds/${id}/result`, { result }),
};
