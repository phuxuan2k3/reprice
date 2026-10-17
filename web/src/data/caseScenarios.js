/**
 * ĐƠN MẪU CHO LUỒNG TRẢ HÀNG – HOÀN TIỀN – KHIẾU NẠI (XIV).
 *
 * 12 kịch bản dùng CHUNG cho cả ba vai trò (người mua U01, người bán S01/S02…,
 * quản lý M01). Toàn bộ là DỮ LIỆU MÔ PHỎNG — không phải giao dịch thật.
 * Mỗi đơn có mã đơn / mã hồ sơ riêng và được `AppContext.normalizeOrder` chuẩn
 * hoá thêm nếu thiếu trường.
 */

const NOW = new Date("2026-10-15T09:00:00.000Z").getTime();
const HOUR = 3600000;
const DAY = 24 * HOUR;
const at = (deltaMs) => new Date(NOW + deltaMs).toISOString();

function snapshot(model, storage, price) {
  return {
    capturedAt: at(-30 * DAY),
    model,
    storage,
    color: "Xanh",
    condition: "Rất tốt",
    usageTime: "6 tháng",
    batteryHealth: 92,
    disclosedFaults: null,
    accessories: "Hộp, sạc, ốp",
    commitments: "Máy nguyên bản, không qua sửa chữa.",
    images: null,
    finalPrice: price,
    listingPrice: price + 300000,
    fees: [],
    policyVersion: "v1 (mô phỏng)",
    simulated: true,
  };
}

function evidence(by, text, when, visibility = "PARTIES") {
  return {
    id: `EV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    by,
    role: "buyer",
    at: when,
    text,
    files: [],
    visibility,
    verification: null,
    simulated: true,
  };
}

function entry(actor, action, note, when, visibility = "PUBLIC") {
  return { time: when, actor, action, note, visibility };
}

function makeCase({
  id,
  orderId,
  type = "RETURN",
  reason,
  description,
  status,
  createdAt,
  awaits = null,
  ownerName = null,
  evidenceList = [],
  messages = [],
  history = [],
  plan = null,
  verification = null,
  returnShipment = null,
  refund = null,
  prevCaseId = null,
  extra = {},
}) {
  return {
    id,
    caseId: id,
    orderId,
    type,
    reason,
    description,
    detectedAt: createdAt,
    createdAt,
    notifiedAt: createdAt,
    createdBy: "Nguyễn Minh",
    createdById: "U01",
    status,
    ownerId: ownerName ? "M01" : null,
    ownerName,
    awaits,
    sellerResponseDueAt: new Date(new Date(createdAt).getTime() + 48 * HOUR).toISOString(),
    sellerRespondedAt:
      status === "PENDING_SELLER"
        ? null
        : new Date(new Date(createdAt).getTime() + DAY).toISOString(),
    evidenceList,
    evidence: evidenceList.map((e) => e.text),
    messages,
    history,
    internalNotes: [],
    plan,
    verification,
    returnShipment,
    refund,
    prevCaseId,
    simulated: true,
    ...extra,
  };
}

function makeOrder(o) {
  return {
    id: o.id,
    phoneId: o.phoneId,
    listingPrice: o.price + 300000,
    negotiatedPrice: o.price,
    price: o.price,
    buyerId: o.buyerId || "U01",
    buyerName: o.buyerName || "Nguyễn Minh",
    sellerId: o.sellerId || "S01",
    sellerName: o.sellerName || "Trần Minh",
    address: "Quận 1, TP.HCM",
    payment: o.payment || "Chuyển khoản ngân hàng",
    paymentMethod: o.paymentMethod || "QR",
    paymentStatus: o.paymentStatus || "PAID",
    status: o.status || "COMPLETED",
    orderVersion: 1,
    versionValid: true,
    confirmations: [
      { role: "buyer", version: 1, time: at(-12 * DAY) },
      { role: "seller", version: 1, time: at(-12 * DAY) },
    ],
    shippingStatus: o.shippingStatus || "DELIVERED",
    trackingCode: o.trackingCode || `RPXSEED-${o.id.slice(-3)}`,
    carrier: "RePrice Express (mô phỏng)",
    handoverMethod: "PICKUP",
    prepareStatus: "READY",
    deliveredAt: o.deliveredAt || at(-2 * DAY),
    receivedAt: null,
    supportDeadline: null,
    supportExpired: false,
    deliveryProof:
      o.deliveryProof === null
        ? null
        : o.deliveryProof || {
            at: o.deliveredAt || at(-2 * DAY),
            source: "SIMULATED",
            notifiedAt: o.deliveredAt || at(-2 * DAY),
            deadlineAt: new Date(
              new Date(o.deliveredAt || at(-2 * DAY)).getTime() + 3 * DAY
            ).toISOString(),
            simulated: true,
          },
    shippingEvents: [],
    supportRequests: o.supportRequests || [],
    deliveryAttempts: o.deliveryAttempts || 0,
    cancelInfo: null,
    payout: o.payout ?? null,
    refund: o.refund ?? null,
    agreementSnapshot: o.agreementSnapshot === null ? null : snapshot(o.model || "iPhone 13", o.storage || "128GB", o.price),
    createdAt: o.createdAt || at(-14 * DAY),
    updatedAt: at(-1 * HOUR),
    negotiationId: null,
    transactionId: null,
  };
}

/* ------------------------------------------------------------------ */
/* 12 KỊCH BẢN                                                         */
/* ------------------------------------------------------------------ */

// 1. Đã giao, đang trong 72 giờ (chưa có hồ sơ).
const c1 = makeOrder({
  id: "DH-CASE-01",
  phoneId: "P001",
  price: 9200000,
  status: "DELIVERED",
  deliveredAt: at(-1 * DAY),
});

// 2. Yêu cầu trả hàng được người bán đồng ý (có nơi nhận trả, chờ bàn giao).
const c2case = makeCase({
  id: "HS-CASE-02",
  orderId: "DH-CASE-02",
  reason: "Tình trạng sai mô tả",
  description: "Máy có vết xước màn hình không có trong mô tả.",
  status: "RETURN_AWAITING_HANDOVER",
  createdAt: at(-3 * DAY),
  awaits: "BUYER",
  evidenceList: [evidence("Nguyễn Minh", "Ảnh vết xước màn hình", at(-3 * DAY))],
  messages: [{ from: "buyer", text: "Máy có vết xước màn hình.", time: at(-3 * DAY) }],
  history: [
    entry("Nguyễn Minh", "Mở hồ sơ", "Tình trạng sai mô tả", at(-3 * DAY)),
    entry("Trần Minh", "Người bán đồng ý trả hàng", "", at(-2 * DAY)),
  ],
  returnShipment: {
    id: "RT-CASE-02",
    carrier: "RePrice Express (mô phỏng)",
    trackingCode: null,
    receiverName: "Trần Minh",
    receiverAddress: "Số 5, Cầu Giấy, Hà Nội",
    fees: [{ label: "Phí trả hàng", amount: 50000 }],
    payer: "SELLER",
    status: "RETURN_AWAITING_HANDOVER",
    handoverDueAt: at(2 * DAY),
    events: [],
    simulated: true,
  },
});
const c2 = makeOrder({ id: "DH-CASE-02", phoneId: "P002", price: 6900000, status: "DELIVERED", deliveredAt: at(-4 * DAY), supportRequests: [c2case] });

// 3. Đang chờ người mua bổ sung bằng chứng.
const c3case = makeCase({
  id: "HS-CASE-03",
  orderId: "DH-CASE-03",
  reason: "Thiếu/sai phụ kiện đã cam kết",
  description: "Thiếu sạc nhanh như cam kết.",
  status: "SELLER_SUPPLEMENT",
  createdAt: at(-2 * DAY),
  awaits: "BUYER",
  evidenceList: [evidence("Nguyễn Minh", "Ảnh hộp máy chỉ có cáp", at(-2 * DAY))],
  messages: [
    { from: "buyer", text: "Thiếu sạc nhanh.", time: at(-2 * DAY) },
    { from: "seller", text: "Người bán đề nghị bổ sung: cần ảnh rõ phụ kiện nhận được.", time: at(-1 * DAY) },
  ],
  history: [
    entry("Nguyễn Minh", "Mở hồ sơ", "Thiếu/sai phụ kiện đã cam kết", at(-2 * DAY)),
    entry("Trần Minh", "Người bán đề nghị bổ sung", "cần ảnh rõ phụ kiện", at(-1 * DAY)),
  ],
  extra: { infoRequestedOnce: true, buyerSupplementDueAt: at(1 * DAY) },
});
const c3 = makeOrder({ id: "DH-CASE-03", phoneId: "P003", price: 5400000, status: "DELIVERED", deliveredAt: at(-3 * DAY), supportRequests: [c3case] });

// 4. Người bán từ chối → chuyển admin.
const c4case = makeCase({
  id: "HS-CASE-04",
  orderId: "DH-CASE-04",
  reason: "Hư hỏng nghi do vận chuyển",
  description: "Góc máy móp nhẹ khi nhận.",
  status: "PENDING_MANAGER",
  createdAt: at(-4 * DAY),
  awaits: "MANAGER",
  ownerName: null,
  evidenceList: [evidence("Nguyễn Minh", "Ảnh góc máy móp", at(-4 * DAY))],
  messages: [
    { from: "buyer", text: "Góc máy móp khi nhận.", time: at(-4 * DAY) },
    { from: "seller", text: "Người bán từ chối: đã đóng gói kỹ, không phải do đóng gói.", time: at(-3 * DAY) },
  ],
  history: [
    entry("Nguyễn Minh", "Mở hồ sơ", "Hư hỏng nghi do vận chuyển", at(-4 * DAY)),
    entry("Trần Minh", "Người bán từ chối yêu cầu", "đóng gói kỹ", at(-3 * DAY)),
    entry("Nguyễn Minh", "Người mua yêu cầu RePrice giải quyết", "", at(-2 * DAY)),
  ],
  extra: { buyerRejectChoiceDueAt: at(-1 * DAY) },
});
const c4 = makeOrder({ id: "DH-CASE-04", phoneId: "P004", price: 12900000, status: "DELIVERED", deliveredAt: at(-6 * DAY), supportRequests: [c4case] });

// 5. Báo đã giao nhưng người mua chưa nhận (đang xác minh vận chuyển).
const c5case = makeCase({
  id: "HS-CASE-05",
  orderId: "DH-CASE-05",
  type: "NOT_RECEIVED",
  reason: "Chưa nhận được hàng",
  description: "Vận đơn ghi đã giao nhưng tôi chưa nhận được kiện hàng.",
  status: "UNDER_REVIEW",
  createdAt: at(-2 * DAY),
  awaits: "MANAGER",
  ownerName: "Vũ Lan",
  evidenceList: [evidence("Nguyễn Minh", "Ảnh khu vực nhận hàng không có kiện", at(-2 * DAY))],
  messages: [{ from: "buyer", text: "Chưa nhận được hàng.", time: at(-2 * DAY) }],
  history: [
    entry("Nguyễn Minh", "Mở hồ sơ", "Chưa nhận được hàng", at(-2 * DAY)),
    entry("Vũ Lan", "Quản lý nhận phụ trách", "", at(-1 * DAY)),
    entry("Vũ Lan", "Lập phiếu xác minh vận chuyển", "Xác minh tình trạng giao hàng", at(-1 * DAY)),
  ],
  verification: {
    id: "PV-CASE-05",
    caseId: "HS-CASE-05",
    trackingCode: "RPXSEED-05",
    issue: "Xác minh tình trạng giao hàng",
    question: "Kiện hàng đã giao cho ai, có ảnh giao nhận không?",
    channel: "Kênh hỗ trợ đơn vị vận chuyển (mô phỏng)",
    requestCode: "REQ-CASE-05",
    status: "AWAITING",
    sentAt: at(-1 * DAY),
    respondedAt: null,
    response: null,
    documents: [],
    outcome: null,
    nextCheckAt: at(0),
    ownerId: "M01",
    ownerName: "Vũ Lan",
    simulated: true,
  },
});
const c5 = makeOrder({ id: "DH-CASE-05", phoneId: "P005", price: 11800000, status: "DELIVERED", deliveredAt: at(-3 * DAY), supportRequests: [c5case] });

// 6. Đang vận chuyển trả.
const c6case = makeCase({
  id: "HS-CASE-06",
  orderId: "DH-CASE-06",
  reason: "Hàng không đúng mô tả",
  description: "Máy là bản 64GB, không phải 128GB như mô tả.",
  status: "RETURNING",
  createdAt: at(-5 * DAY),
  awaits: "CARRIER",
  ownerName: "Vũ Lan",
  evidenceList: [evidence("Nguyễn Minh", "Ảnh thông tin dung lượng trong cài đặt", at(-5 * DAY))],
  messages: [{ from: "buyer", text: "Máy bản 64GB.", time: at(-5 * DAY) }],
  history: [
    entry("Nguyễn Minh", "Mở hồ sơ", "Hàng không đúng mô tả", at(-5 * DAY)),
    entry("Vũ Lan", "Phương án có hiệu lực", "", at(-4 * DAY)),
    entry("Nguyễn Minh", "Người mua bàn giao hàng trả", "RT-CASE-06", at(-3 * DAY)),
  ],
  plan: {
    id: "PA-CASE-06",
    conclusion: "Chấp thuận trả hàng và hoàn toàn bộ tiền hàng.",
    basis: "Ảnh cài đặt cho thấy dung lượng 64GB khác mô tả.",
    requiresReturn: true,
    goodsAmount: 8500000,
    fees: [{ label: "Phí trả hàng", amount: 60000 }],
    returnAddress: "Số 5, Cầu Giấy, Hà Nội",
    tasks: [{ who: "Người mua", what: "Gửi trả máy", dueAt: at(0) }],
    refundMethod: "Chuyển khoản ngân hàng ****6789",
    approvedBy: "Vũ Lan",
    approvedAt: at(-4 * DAY),
    effectiveAt: at(-4 * DAY),
    reviewUntil: at(-3 * DAY),
    simulated: true,
  },
  returnShipment: {
    id: "RT-CASE-06",
    carrier: "RePrice Express (mô phỏng)",
    trackingCode: "RPXSEED-RT-06",
    receiverName: "Lê Hà",
    receiverAddress: "Số 5, Cầu Giấy, Hà Nội",
    fees: [{ label: "Phí trả hàng", amount: 60000 }],
    payer: "SELLER",
    status: "RETURNING",
    handoverDueAt: at(-3 * DAY),
    handedOverAt: at(-3 * DAY),
    events: [
      { time: at(-3 * DAY), status: "RETURNING", description: "Người mua đã bàn giao kiện hàng trả (mô phỏng).", source: "SIMULATED" },
    ],
    simulated: true,
  },
});
const c6 = makeOrder({ id: "DH-CASE-06", phoneId: "P006", price: 8500000, status: "DELIVERED", shippingStatus: "RETURNING", deliveredAt: at(-7 * DAY), supportRequests: [c6case] });

// 7. Người bán báo nhận sai máy.
const c7case = makeCase({
  id: "HS-CASE-07",
  orderId: "DH-CASE-07",
  reason: "Hàng không đúng mô tả",
  description: "Gửi trả nhưng người bán báo nhận sai máy.",
  status: "RETURN_DISPUTE",
  createdAt: at(-6 * DAY),
  awaits: "MANAGER",
  ownerName: "Vũ Lan",
  evidenceList: [evidence("Nguyễn Minh", "Ảnh máy gửi trả", at(-6 * DAY))],
  messages: [{ from: "seller", text: "Hàng nhận được không đúng máy đã bán.", time: at(-2 * DAY) }],
  history: [
    entry("Nguyễn Minh", "Mở hồ sơ", "Hàng không đúng mô tả", at(-6 * DAY)),
    entry("Trần Minh", "Người bán báo vấn đề hàng trả", "sai máy", at(-2 * DAY)),
  ],
  plan: {
    id: "PA-CASE-07",
    conclusion: "Chấp thuận trả hàng và hoàn tiền (chờ xử lý tranh chấp hàng trả).",
    basis: "Người mua cung cấp ảnh máy gửi trả.",
    requiresReturn: true,
    goodsAmount: 6750000,
    fees: [],
    returnAddress: "Số 5, Cầu Giấy, Hà Nội",
    tasks: [{ who: "Quản lý", what: "Xác minh hàng trả", dueAt: at(1 * DAY) }],
    refundMethod: "Chuyển khoản ngân hàng ****6789",
    approvedBy: "Vũ Lan",
    approvedAt: at(-5 * DAY),
    effectiveAt: at(-5 * DAY),
    reviewUntil: at(-4 * DAY),
    simulated: true,
  },
  returnShipment: {
    id: "RT-CASE-07",
    carrier: "RePrice Express (mô phỏng)",
    trackingCode: "RPXSEED-RT-07",
    receiverName: "Trần Minh",
    receiverAddress: "Số 5, Cầu Giấy, Hà Nội",
    fees: [],
    payer: "SELLER",
    status: "RETURN_DISPUTE",
    handoverDueAt: at(-5 * DAY),
    handedOverAt: at(-5 * DAY),
    events: [
      { time: at(-4 * DAY), status: "RETURNED", description: "Đã giao trả, chờ kiểm tra", source: "SIMULATED" },
    ],
    simulated: true,
  },
  extra: {
    returnProblem: { reason: "Sai máy", description: "Máy nhận được là bản khác.", at: at(-2 * DAY), by: "Trần Minh", simulated: true },
  },
});
const c7 = makeOrder({ id: "DH-CASE-07", phoneId: "P007", price: 6750000, status: "DELIVERED", shippingStatus: "RETURNED", deliveredAt: at(-9 * DAY), supportRequests: [c7case] });

// 8. Đã duyệt hoàn, đang xử lý.
const c8refund = {
  id: "RF-CASE-08",
  caseId: "HS-CASE-08",
  orderId: "DH-CASE-08",
  paymentRefId: null,
  goodsAmount: 10200000,
  fees: [{ label: "Phí trả hàng", amount: 60000 }],
  totalAmount: 10260000,
  method: "Chuyển khoản ngân hàng ****6789",
  status: "PROCESSING",
  createdAt: at(-1 * DAY),
  processedAt: null,
  completedAt: null,
  attempts: [{ at: at(-1 * DAY), by: "Vũ Lan", result: "PROCESSING" }],
  buyerReportedNotReceived: false,
  simulated: true,
};
const c8case = makeCase({
  id: "HS-CASE-08",
  orderId: "DH-CASE-08",
  reason: "Lỗi chức năng chưa công bố",
  description: "Máy tự khởi động lại.",
  status: "REFUND_PROCESSING",
  createdAt: at(-8 * DAY),
  awaits: "MANAGER",
  ownerName: "Vũ Lan",
  evidenceList: [evidence("Nguyễn Minh", "Video máy tự khởi động lại", at(-8 * DAY))],
  messages: [{ from: "manager", text: "Đã duyệt hoàn, đang xử lý (mô phỏng).", time: at(-1 * DAY) }],
  history: [
    entry("Nguyễn Minh", "Mở hồ sơ", "Lỗi chức năng chưa công bố", at(-8 * DAY)),
    entry("Vũ Lan", "Khởi tạo hoàn tiền (mô phỏng)", "Tổng tiền hoàn: 10260000", at(-1 * DAY)),
  ],
  refund: c8refund,
  extra: { returnInspectedAt: at(-2 * DAY) },
});
const c8 = makeOrder({ id: "DH-CASE-08", phoneId: "P008", price: 10200000, status: "DELIVERED", shippingStatus: "RETURNED", paymentStatus: "REFUND_PROCESSING", deliveredAt: at(-10 * DAY), supportRequests: [c8case], refund: c8refund });

// 9. Hoàn thất bại / chờ đối soát.
const c9refund = {
  id: "RF-CASE-09",
  caseId: "HS-CASE-09",
  orderId: "DH-CASE-09",
  paymentRefId: null,
  goodsAmount: 4200000,
  fees: [],
  totalAmount: 4200000,
  method: "Hoàn về phương thức thanh toán gốc (mô phỏng)",
  status: "FAILED",
  createdAt: at(-4 * DAY),
  failedAt: at(-2 * DAY),
  failureReason: "Ngân hàng mô phỏng trả về lỗi xử lý.",
  attempts: [{ at: at(-4 * DAY), by: "Vũ Lan", result: "PROCESSING" }, { at: at(-2 * DAY), by: "Vũ Lan", result: "FAILED" }],
  buyerReportedNotReceived: true,
  simulated: true,
};
const c9case = makeCase({
  id: "HS-CASE-09",
  orderId: "DH-CASE-09",
  reason: "Sai máy/phiên bản",
  description: "Nhận máy bản khác.",
  status: "REFUND_RECONCILE",
  createdAt: at(-9 * DAY),
  awaits: "MANAGER",
  ownerName: "Vũ Lan",
  evidenceList: [evidence("Nguyễn Minh", "Ảnh model máy nhận được", at(-9 * DAY))],
  messages: [{ from: "buyer", text: "Báo chưa nhận được tiền hoàn.", time: at(-1 * DAY) }],
  history: [
    entry("Nguyễn Minh", "Mở hồ sơ", "Sai máy/phiên bản", at(-9 * DAY)),
    entry("Vũ Lan", "Hoàn tiền thất bại — chờ đối soát", "Ngân hàng mô phỏng báo lỗi", at(-2 * DAY)),
  ],
  refund: c9refund,
});
const c9 = makeOrder({ id: "DH-CASE-09", phoneId: "P009", price: 4200000, status: "DELIVERED", shippingStatus: "RETURNED", paymentStatus: "REFUND_PROCESSING", deliveredAt: at(-11 * DAY), supportRequests: [c9case], refund: c9refund });

// 10. Đã hoàn thành công.
const c10refund = {
  id: "RF-CASE-10",
  caseId: "HS-CASE-10",
  orderId: "DH-CASE-10",
  paymentRefId: null,
  goodsAmount: 7700000,
  fees: [],
  totalAmount: 7700000,
  method: "Chuyển khoản ngân hàng ****6789",
  status: "DONE",
  createdAt: at(-6 * DAY),
  completedAt: at(-4 * DAY),
  attempts: [{ at: at(-6 * DAY), by: "Vũ Lan", result: "PROCESSING" }, { at: at(-4 * DAY), by: "Vũ Lan", result: "DONE" }],
  buyerReportedNotReceived: false,
  simulated: true,
};
const c10case = makeCase({
  id: "HS-CASE-10",
  orderId: "DH-CASE-10",
  reason: "Hàng hư hỏng",
  description: "Máy hư hỏng khi nhận.",
  status: "REFUNDED",
  createdAt: at(-10 * DAY),
  awaits: null,
  ownerName: "Vũ Lan",
  evidenceList: [evidence("Nguyễn Minh", "Ảnh máy hư hỏng", at(-10 * DAY))],
  messages: [{ from: "manager", text: "Đã hoàn tiền (mô phỏng).", time: at(-4 * DAY) }],
  history: [
    entry("Nguyễn Minh", "Mở hồ sơ", "Hàng hư hỏng", at(-10 * DAY)),
    entry("Vũ Lan", "Xác nhận hoàn tiền thành công (mô phỏng)", "", at(-4 * DAY)),
  ],
  refund: c10refund,
  extra: { closedAt: at(-4 * DAY), resolution: "Đã hoàn tiền (kết quả mô phỏng)." },
});
const c10 = makeOrder({ id: "DH-CASE-10", phoneId: "P001", price: 7700000, status: "COMPLETED", shippingStatus: "RETURNED", paymentStatus: "REFUNDED", deliveredAt: at(-12 * DAY), supportRequests: [c10case], refund: c10refund });

// 11. Khiếu nại sau hoàn tất và tiền đã chuyển cho người bán.
const c11case = makeCase({
  id: "HS-CASE-11",
  orderId: "DH-CASE-11",
  type: "DISPUTE",
  reason: "Lý do khác",
  description: "Sau khi hoàn tất, phát hiện máy đã qua sửa chữa.",
  status: "PENDING_SELLER",
  createdAt: at(-1 * DAY),
  awaits: "SELLER",
  evidenceList: [evidence("Nguyễn Minh", "Ảnh tem niêm phong đã bóc", at(-1 * DAY))],
  messages: [{ from: "buyer", text: "Phát hiện máy đã qua sửa chữa.", time: at(-1 * DAY) }],
  history: [entry("Nguyễn Minh", "Mở hồ sơ", "Lý do khác", at(-1 * DAY))],
  prevCaseId: null,
});
const c11 = makeOrder({
  id: "DH-CASE-11",
  phoneId: "P002",
  price: 8100000,
  status: "COMPLETED",
  shippingStatus: "DELIVERED",
  paymentStatus: "PAID",
  deliveredAt: at(-20 * DAY),
  supportRequests: [c11case],
  payout: { status: "PAID_SIMULATED", amount: 8100000, at: at(-15 * DAY), by: "Vũ Lan", simulated: true },
});

// 12. Có trở ngại gửi trả.
const c12case = makeCase({
  id: "HS-CASE-12",
  orderId: "DH-CASE-12",
  reason: "Tình trạng sai mô tả",
  description: "Máy khác tình trạng mô tả.",
  status: "RETURN_OBSTACLE",
  createdAt: at(-4 * DAY),
  awaits: "MANAGER",
  ownerName: "Vũ Lan",
  evidenceList: [evidence("Nguyễn Minh", "Ảnh tình trạng máy", at(-4 * DAY))],
  messages: [{ from: "seller", text: "Chưa sắp xếp được điểm nhận trả.", time: at(-2 * DAY) }],
  history: [
    entry("Nguyễn Minh", "Mở hồ sơ", "Tình trạng sai mô tả", at(-4 * DAY)),
    entry("Trần Minh", "Báo trở ngại gửi trả", "Sai địa chỉ", at(-2 * DAY)),
  ],
  plan: {
    id: "PA-CASE-12",
    conclusion: "Chấp thuận trả hàng và hoàn tiền.",
    basis: "Ảnh tình trạng máy.",
    requiresReturn: true,
    goodsAmount: 9900000,
    fees: [],
    returnAddress: "Số 5, Cầu Giấy, Hà Nội",
    tasks: [{ who: "Người mua", what: "Gửi trả", dueAt: at(0) }],
    refundMethod: "Chuyển khoản ngân hàng ****6789",
    approvedBy: "Vũ Lan",
    approvedAt: at(-3 * DAY),
    effectiveAt: at(-3 * DAY),
    reviewUntil: at(-2 * DAY),
    simulated: true,
  },
  returnShipment: {
    id: "RT-CASE-12",
    carrier: "RePrice Express (mô phỏng)",
    trackingCode: null,
    receiverName: "Trần Minh",
    receiverAddress: "Sai địa chỉ (mô phỏng)",
    fees: [],
    payer: "SELLER",
    status: "RETURN_OBSTACLE",
    handoverDueAt: at(-1 * DAY),
    handedOverAt: null,
    events: [],
    simulated: true,
  },
  obstacle: {
    reason: "Sai địa chỉ",
    note: "Địa chỉ nhận trả không tồn tại.",
    nextAction: "Quản lý cập nhật địa chỉ nhận trả.",
    at: at(-2 * DAY),
    by: "Trần Minh",
    simulated: true,
  },
});
const c12 = makeOrder({ id: "DH-CASE-12", phoneId: "P003", price: 9900000, status: "DELIVERED", deliveredAt: at(-6 * DAY), supportRequests: [c12case] });

export const caseScenarioOrders = [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12];
