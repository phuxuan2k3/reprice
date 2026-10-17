/**
 * KIỂM THỬ QUY TẮC HỒ SƠ TRẢ HÀNG – HOÀN TIỀN – KHIẾU NẠI — chạy bằng:
 *   node scripts/case-selftest.mjs   (hoặc `npm run test:cases`)
 *
 * Phủ: phân loại trạng thái hồ sơ (mở/đóng), bước tiếp theo theo trạng thái,
 * điều kiện rút yêu cầu, tính đầy đủ của phương án xử lý, tổng tiền hoàn,
 * che dữ liệu nhạy cảm, và các mốc thời hạn 48h/24h/3 ngày.
 *
 * Không phụ thuộc React. Không có backend. Toàn bộ là quy tắc mô phỏng.
 */

import {
  CASE_TYPE,
  CASE_DEADLINES,
  RETURN_SHIPMENT_STATUS,
  REFUND_STATUS,
  canWithdrawCase,
  casePendingStep,
  isCaseOpen,
  isRefundRunning,
  isReturnInMotion,
  isPlanComplete,
  planMissingFields,
  planTotals,
  maskTracking,
  maskAddress,
  maskPaymentMethod,
  buyerRejectChoiceDeadline,
  planReviewDeadline,
  returnHandoverDeadline,
  returnInspectDeadline,
  remainingText,
  isOverdue,
  makeEvidence,
  normalizeEvidenceList,
} from "../src/data/caseRules.js";
import { RETURN_STATUS } from "../src/data/orderRules.js";

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    console.error(`  ✗ ${name}`);
  }
}

/* 1. Phân loại mở / đóng */
check("PENDING_SELLER mở", isCaseOpen({ status: RETURN_STATUS.PENDING_SELLER }));
check("SELLER_SUPPLEMENT mở", isCaseOpen({ status: RETURN_STATUS.SELLER_SUPPLEMENT }));
check("RETURN_DISPUTE mở", isCaseOpen({ status: RETURN_STATUS.RETURN_DISPUTE }));
check("REFUND_RECONCILE mở", isCaseOpen({ status: RETURN_STATUS.REFUND_RECONCILE }));
check("REFUNDED đóng", !isCaseOpen({ status: RETURN_STATUS.REFUNDED }));
check("WITHDRAWN đóng", !isCaseOpen({ status: RETURN_STATUS.WITHDRAWN }));
check("CLOSED đóng", !isCaseOpen({ status: RETURN_STATUS.CLOSED }));

/* 2. Bước tiếp theo theo trạng thái */
check(
  "PENDING_SELLER → người bán",
  casePendingStep({ status: RETURN_STATUS.PENDING_SELLER }).party === "SELLER"
);
check(
  "SELLER_SUPPLEMENT → người mua",
  casePendingStep({ status: RETURN_STATUS.SELLER_SUPPLEMENT }).party === "BUYER"
);
check(
  "AFTER_REJECT_BUYER → người mua",
  casePendingStep({ status: RETURN_STATUS.AFTER_REJECT_BUYER }).party === "BUYER"
);
check(
  "RETURN_DISPUTE → quản lý",
  casePendingStep({ status: RETURN_STATUS.RETURN_DISPUTE }).party === "MANAGER"
);
check(
  "RETURNED → người bán",
  casePendingStep({ status: RETURN_STATUS.RETURNED }).party === "SELLER"
);
check(
  "RETURNING → vận chuyển",
  casePendingStep({ status: RETURN_STATUS.RETURNING }).party === "CARRIER"
);

/* 3. Rút yêu cầu */
const buyerOrder = { buyerId: "U01", sellerId: "S01" };
const buyerActor = { userId: "U01", role: "buyer" };
check(
  "Người mua rút được khi chờ người bán",
  canWithdrawCase(
    buyerOrder,
    { status: RETURN_STATUS.PENDING_SELLER },
    buyerActor
  ).allowed === true
);
check(
  "Không rút khi đang vận chuyển trả",
  canWithdrawCase(buyerOrder, { status: RETURN_STATUS.RETURNING }, buyerActor).allowed === false
);
check(
  "Không rút khi hoàn tiền đang xử lý",
  canWithdrawCase(
    buyerOrder,
    { status: RETURN_STATUS.REFUND_PROCESSING },
    buyerActor
  ).allowed === false
);
check(
  "Người bán KHÔNG rút được yêu cầu của người mua",
  canWithdrawCase(
    buyerOrder,
    { status: RETURN_STATUS.PENDING_SELLER },
    { userId: "S01", role: "seller" }
  ).allowed === false
);

/* 4. Phương án xử lý */
check("Phương án rỗng thiếu nhiều trường", planMissingFields({}).length >= 4);
const fullPlan = {
  conclusion: "Hoàn toàn bộ tiền hàng",
  basis: "Bằng chứng ảnh",
  requiresReturn: true,
  goodsAmount: 5000000,
  fees: [{ label: "Phí trả hàng", amount: 50000 }],
  returnAddress: "Số 5, Cầu Giấy, Hà Nội",
  tasks: [{ who: "Người mua", what: "Gửi trả", dueAt: "2026-10-20" }],
};
check("Phương án đủ trường hợp lệ", isPlanComplete(fullPlan));
check(
  "Thiếu địa điểm nhận trả bị chặn",
  planMissingFields({ ...fullPlan, returnAddress: "" }).includes("Địa điểm nhận trả")
);
check(
  "Không trả hàng thì không cần địa chỉ",
  isPlanComplete({ ...fullPlan, requiresReturn: false, returnAddress: "" })
);
const totals = planTotals(fullPlan);
check("Tổng hoàn = tiền hàng + phí", totals.goods === 5000000 && totals.feeTotal === 50000 && totals.total === 5050000);

/* 5. Che dữ liệu nhạy cảm */
check("Che mã vận đơn", maskTracking("RPX123456789").includes("***"));
check("Admin xem đủ mã vận đơn", maskTracking("RPX123456789", true) === "RPX123456789");
check("Che địa chỉ", maskAddress("Số 1, Lê Lợi, Quận 1, TP.HCM").includes("đã che"));
check("Che phương thức thanh toán", maskPaymentMethod("Chuyển khoản ****6789").includes("***"));

/* 6. Mốc thời hạn cộng đúng giờ/ngày */
const base = "2026-10-15T00:00:00.000Z";
const plusH = (iso, h) => new Date(new Date(iso).getTime() + h * 3600000).toISOString();
check(
  "Hạn người mua chọn sau từ chối = 48h",
  buyerRejectChoiceDeadline(base) === plusH(base, CASE_DEADLINES.BUYER_AFTER_REJECT_HOURS)
);
check(
  "Hạn xem xét lại phương án = 48h",
  planReviewDeadline(base) === plusH(base, CASE_DEADLINES.PLAN_REVIEW_HOURS)
);
check(
  "Hạn kiểm tra hàng trả = 48h",
  returnInspectDeadline(base) === plusH(base, CASE_DEADLINES.RETURN_INSPECT_HOURS)
);
check(
  "Hạn bàn giao = 3 ngày",
  returnHandoverDeadline(base) === plusH(base, CASE_DEADLINES.RETURN_HANDOVER_DAYS * 24)
);

/* 7. Quá hạn & thời gian còn lại */
check("Quá hạn nhận diện đúng", isOverdue("2020-01-01T00:00:00.000Z", new Date("2026-01-01")) === true);
check("Chưa quá hạn nhận diện đúng", isOverdue("2030-01-01T00:00:00.000Z", new Date("2026-01-01")) === false);
check("remainingText báo quá hạn", remainingText("2020-01-01T00:00:00.000Z", new Date("2026-01-01")).startsWith("quá hạn"));

/* 8. Trạng thái tiền chạy / hàng đang trả */
check("REFUND_DONE không còn 'đang chạy'", isRefundRunning({ status: RETURN_STATUS.REFUNDED }) === true);
check("PENDING_SELLER không có hoàn tiền chạy", isRefundRunning({ status: RETURN_STATUS.PENDING_SELLER }) === false);
check("RETURNING là hàng đang trả", isReturnInMotion({ status: RETURN_STATUS.RETURNING }) === true);
check("RETURN_AWAITING_HANDOVER chưa gửi trả", isReturnInMotion({ status: RETURN_STATUS.RETURN_AWAITING_HANDOVER }) === false);

/* 9. Bằng chứng có cấu trúc + bất biến (không sửa, chỉ thêm) */
const ev = makeEvidence({ by: "Nguyễn Minh", role: "buyer", text: "Ảnh máy" });
check("Bằng chứng có mã", !!ev.id && ev.id.startsWith("EV-"));
check("Bằng chứng mặc định hiển thị cho hai bên", ev.visibility === "PARTIES");
const norm = normalizeEvidenceList("dòng một\ndòng hai", { by: "A", role: "buyer" });
check("Chuỗi cũ được chuẩn hoá thành mảng bằng chứng", norm.length === 2 && !!norm[0].text);

/* 10. Loại hồ sơ + trạng thái vận đơn trả */
check("Có 3 loại hồ sơ", Object.keys(CASE_TYPE).length === 3);
check("Có trạng thái 'đủ điều kiện hoàn tiền'", !!RETURN_SHIPMENT_STATUS.REFUND_ELIGIBLE);
check("Có trạng thái hoàn tiền thất bại", REFUND_STATUS.FAILED === "FAILED");

console.log(
  `\nKết quả kiểm thử quy tắc HỒ SƠ trả hàng–hoàn tiền–khiếu nại: ${pass} đạt, ${fail} lỗi.\n`
);
process.exit(fail === 0 ? 0 : 1);
