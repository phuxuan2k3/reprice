import { caseScenarioOrders } from "./caseScenarios.js";

/**
 * Người dùng mô phỏng cho 3 vai trò (cộng thêm khách chưa đăng nhập = 4 nhóm).
 * Dùng cho mock login — không có authentication thật.
 */
export const mockUsers = [
  {
    id: "U01",
    name: "Nguyễn Minh",
    phone: "0909 123 456",
    address: "Quận 1, TP.HCM",
    role: "buyer",
  },
  {
    id: "S01",
    name: "Trần Minh",
    phone: "0908 111 222",
    address: "Hà Nội",
    role: "seller",
  },
  {
    id: "M01",
    name: "Vũ Lan",
    phone: "0907 222 333",
    address: "Đà Nẵng",
    role: "manager",
  },
];

export const ROLE_LABEL = {
  guest: "Khách",
  buyer: "Người mua",
  seller: "Người bán",
  manager: "Người quản lý",
};

export const ROLE_TONE = {
  guest: "gray",
  buyer: "blue",
  seller: "amber",
  manager: "purple",
};

/**
 * Tài khoản demo dùng cho CÔNG CỤ CHUYỂN VAI TRÒ (chỉ các tài khoản có sẵn).
 * Mỗi vai trò ánh xạ tới đúng một tài khoản mẫu; chuyển vai chỉ đổi danh tính
 * đang đăng nhập, KHÔNG tạo đơn mới và KHÔNG reset dữ liệu.
 */
export const DEMO_ACCOUNTS = ["buyer", "seller", "manager"]
  .map((role) => mockUsers.find((u) => u.role === role))
  .filter(Boolean)
  .map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    roleLabel: ROLE_LABEL[u.role],
  }));

/** Đơn hàng demo sẵn cho người mua Nguyễn Minh (để demo theo dõi đơn).
 *  Đủ các trạng thái: Đã thanh toán, Đang giao, Hoàn tất, Chờ thanh toán,
 *  Đã hủy, Hoàn tiền — để demo lọc theo trạng thái. */
export const seedOrders = [
  {
    id: "DH-SEED-001",
    phoneId: "P002",
    price: 6750000,
    buyerId: "U01",
    buyerName: "Nguyễn Minh",
    sellerId: "S02",
    sellerName: "Lê Hà",
    address: "Quận 1, TP.HCM",
    payment: "Tiền mặt khi nhận hàng",
    status: "PAYMENT_DONE",
    createdAt: "2026-09-28",
    negotiationId: null,
  },
  {
    id: "DH-SEED-002",
    phoneId: "P004",
    price: 12900000,
    buyerId: "U01",
    buyerName: "Nguyễn Minh",
    sellerId: "S04",
    sellerName: "Hoàng Vy",
    address: "Quận 1, TP.HCM",
    payment: "Chuyển khoản ngân hàng",
    status: "SHIPPING",
    createdAt: "2026-10-02",
    negotiationId: "N-SEED-001",
  },
  {
    id: "DH-SEED-003",
    phoneId: "P006",
    price: 10200000,
    buyerId: "U01",
    buyerName: "Nguyễn Minh",
    sellerId: "S06",
    sellerName: "Mai Anh",
    address: "Quận 1, TP.HCM",
    payment: "Chuyển khoản ngân hàng",
    status: "COMPLETED",
    createdAt: "2026-08-14",
    negotiationId: "N-SEED-002",
  },
  {
    id: "DH-SEED-004",
    phoneId: "P001",
    price: 8900000,
    buyerId: "U01",
    buyerName: "Nguyễn Minh",
    sellerId: "S01",
    sellerName: "Trần Minh",
    address: "Quận 1, TP.HCM",
    payment: "Tiền mặt khi nhận hàng",
    status: "PENDING_PAYMENT",
    createdAt: "2026-10-08",
    negotiationId: "N-SEED-003",
  },
  {
    id: "DH-SEED-005",
    phoneId: "P009",
    price: 4200000,
    buyerId: "U01",
    buyerName: "Nguyễn Minh",
    sellerId: "S02",
    sellerName: "Lê Hà",
    address: "Quận 1, TP.HCM",
    payment: "Tiền mặt khi nhận hàng",
    status: "CANCELLED",
    createdAt: "2026-07-21",
    negotiationId: null,
  },
  {
    id: "DH-SEED-006",
    phoneId: "P005",
    price: 11800000,
    buyerId: "U01",
    buyerName: "Nguyễn Minh",
    sellerId: "S05",
    sellerName: "Nguyễn Tân",
    address: "Quận 1, TP.HCM",
    payment: "Chuyển khoản ngân hàng",
    status: "REFUNDED",
    createdAt: "2026-06-30",
    negotiationId: null,
  },
];

/**
 * Phiên thương lượng mẫu cho người mua Nguyễn Minh — DỮ LIỆM MÔ PHỎNG.
 * Đủ 3 loại phản hồi của người bán: chấp nhận, từ chối, đề nghị lại.
 */
export const seedNegotiations = [
  {
    id: "NEG-SEED-001",
    phoneId: "P009",
    buyerId: "U01",
    buyerName: "Nguyễn Minh",
    sellerId: "S02",
    sellerName: "Lê Hà",
    listingPrice: 4350000,
    createdAt: "2026-10-05",
    offers: [
      {
        from: "buyer",
        price: 4100000,
        note: "Máy còn dùng tốt, thanh toán nhanh.",
        time: "10:15",
        status: "accepted",
      },
      {
        from: "seller",
        price: 4100000,
        note: "Người bán đã chấp nhận đề nghị của bạn.",
        time: "10:32",
        status: "accepted",
      },
    ],
    status: "AGREED",
    agreedPrice: 4100000,
    counterPrice: null,
    orderId: null,
  },
  {
    id: "NEG-SEED-002",
    phoneId: "P005",
    buyerId: "U01",
    buyerName: "Nguyễn Minh",
    sellerId: "S05",
    sellerName: "Nguyễn Tân",
    listingPrice: 9150000,
    createdAt: "2026-10-04",
    offers: [
      {
        from: "buyer",
        price: 8500000,
        note: "",
        time: "14:20",
        status: "rejected",
      },
      {
        from: "seller",
        price: 8500000,
        note: "Người bán đã từ chối giá thương lượng từ bạn.",
        time: "15:02",
        status: "rejected",
      },
    ],
    status: "REJECTED",
    agreedPrice: null,
    counterPrice: null,
    orderId: null,
  },
  {
    id: "NEG-SEED-003",
    phoneId: "P002",
    buyerId: "U01",
    buyerName: "Nguyễn Minh",
    sellerId: "S02",
    sellerName: "Lê Hà",
    listingPrice: 6850000,
    createdAt: "2026-10-07",
    offers: [
      {
        from: "buyer",
        price: 6500000,
        note: "Máy dùng cẩn thận, có ốp từ đầu.",
        time: "09:05",
        status: "countered",
      },
      {
        from: "seller",
        price: 6900000,
        note: "Người bán đề nghị mức giá mới.",
        time: "09:40",
        status: "pending",
      },
    ],
    status: "SELLER_COUNTER",
    agreedPrice: null,
    counterPrice: 6900000,
    orderId: null,
  },
];

/* Đơn mẫu cho luồng Trả hàng – Hoàn tiền – Khiếu nại (12 kịch bản, mô phỏng).
 * Dùng chung cho cả ba vai trò; được chuẩn hoá thêm bởi AppContext.normalizeOrder. */
seedOrders.push(...caseScenarioOrders);
