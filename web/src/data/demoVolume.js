/**
 * KHỐI LƯỢNG GIAO DỊCH MÔ PHỎNG CHO DEMO.
 *
 * Lý do tồn tại: quy tắc GĐ2 yêu cầu TỐI THIỂU 35 giao dịch chi tiết hợp lệ
 * trong một cửa sổ cuốn chiếu. Bộ dữ liệu seed hiện chỉ có vài bản ghi mỗi máy,
 * nên để MINH HOẠ được dải giá, module này SINH THÊM bản ghi MÔ PHỎNG có gắn
 * nhãn rõ ràng (`data_provenance: "SIMULATED"`).
 *
 * Tuyệt đối KHÔNG trộn dữ liệu này với dữ liệu thật (REAL_VERIFIED). Đây chỉ là
 * dữ liệu mô phỏng phục vụ đồ án, không phải giao dịch thật.
 */

const DAY = 24 * 60 * 60 * 1000;

const iso = (d) => new Date(d).toISOString().slice(0, 10);

/**
 * Sinh `count` bản ghi chi tiết mô phỏng cho một máy.
 * Giá được rải quanh `basePrice`; ngày giao dịch trải trong ~75 ngày gần đây.
 */
export function makeDemoVolume(opts) {
  const {
    phoneId,
    model,
    storage,
    condition = "Tốt",
    batteryHealth = 89,
    repairHistory = "Chưa từng sửa chữa hoặc thay linh kiện",
    color = "Đen",
    sellers = ["S01", "S02", "S03"],
    buyers = ["B01", "B02", "B03", "B04", "B05", "B06", "B07", "B08"],
    sellerNames = {},
    basePrice = 9500000,
    count = 35,
    now = new Date(),
  } = opts;

  const out = [];
  for (let i = 0; i < count; i++) {
    const daysAgo = 5 + Math.round((i / count) * 75); // 5..80 ngày trước
    const txDate = new Date(now.getTime() - daysAgo * DAY);
    const sellerId = sellers[i % sellers.length];
    const buyerId = buyers[i % buyers.length];
    const price =
      basePrice + ((i % 7) - 3) * 120000 + (i % 3) * 50000;
    out.push({
      transaction_detail_id: `TXD-DEMO-${phoneId}-${String(i + 1).padStart(3, "0")}`,
      order_id: `DH-DEMO-${phoneId}-${String(i + 1).padStart(3, "0")}`,
      listing_id: phoneId,
      buyer_id: buyerId,
      seller_id: sellerId,
      buyer_name: buyerId,
      seller_name: sellerNames[sellerId] || sellerId,
      phone_snapshot: {
        model,
        storage,
        condition,
        color,
        batteryHealth,
        appearance: condition,
        functionality: "Đã kiểm tra, hoạt động đầy đủ",
        repairHistory,
        usageMonths: 12,
      },
      listing_price: basePrice + 300000,
      agreed_price: price,
      actual_paid_price: price,
      shipping_fee: 0,
      payment_status: "PAID",
      delivery_status: "DELIVERED",
      after_delivery_status: "OK",
      return_status: "NONE",
      refund_status: "NONE",
      dispute_status: "NONE",
      data_provenance: "SIMULATED",
      price_data_status: "VERIFIED",
      transaction_date: iso(txDate),
      delivered_at: iso(txDate),
      eligible_at: iso(new Date(txDate.getTime() + 3 * DAY)),
      created_at: iso(txDate),
      updated_at: iso(txDate),
      cluster_id: null,
      suspicion_flags: [],
      history: [],
    });
  }
  return out;
}
