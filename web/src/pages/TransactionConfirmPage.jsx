import { Link, Navigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { VerificationBadge } from "../components/StatusBadge";
import DataBadge from "../components/DataBadge";
import Button from "../components/Button";
import { formatVND, formatDate, phoneName } from "../utils/format";

export default function TransactionConfirmPage() {
  const { id } = useParams();
  const { transactions, getPhone } = useApp();
  const tx = transactions.find((t) => t.id === id);

  if (!tx) return <Navigate to="/phones" replace />;
  const phone = getPhone(tx.phoneId);
  const verified = tx.verification === "VERIFIED";
  const pending = tx.verification === "PENDING";

  return (
    <div className="container-x py-10">
      <div className="mx-auto max-w-2xl">
        <div className="card p-8 text-center">
          {/* Trạng thái */}
          <div
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
              verified
                ? "bg-emerald-50"
                : pending
                ? "bg-amber-50"
                : "bg-gray-100"
            }`}
          >
            {verified ? (
              <svg className="h-8 w-8 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 13l4 4L19 7" />
              </svg>
            ) : pending ? (
              <svg className="h-8 w-8 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 3" />
              </svg>
            ) : (
              <svg className="h-8 w-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            )}
          </div>

          <h1 className="mt-5 text-2xl font-bold text-ink-900">
            {verified
              ? "Giao dịch hợp lệ — đã vào tập tham khảo"
              : pending
              ? "Giao dịch đã được ghi nhận"
              : "Bản ghi giao dịch"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">
            {verified
              ? "Quản lý đã kiểm tra và xác nhận dữ liệu hợp lệ. Giao dịch này được đưa vào tập dữ liệu tính giá tham khảo."
              : pending
              ? "Giao dịch hoàn tất đã được hệ thống ghi nhận. Quản lý sẽ kiểm tra dữ liệu trước khi đưa vào tập tham khảo."
              : tx.note}
          </p>

          <div className="mt-5 flex justify-center">
            <VerificationBadge verification={tx.verification} />
          </div>
        </div>

        {/* Chi tiết */}
        <div className="card mt-4 p-6">
          <h2 className="font-semibold text-ink-900">Thông tin giao dịch</h2>
          <div className="mt-4 space-y-3 text-sm">
            {[
              ["Mã giao dịch", tx.id],
              ["Mã đơn hàng", tx.orderId],
              ["Sản phẩm", phone ? `${phoneName(phone)} ${phone.storage}` : "—"],
              ["Giá thống nhất", formatVND(tx.price)],
              ["Người mua", tx.buyer],
              ["Người bán", tx.seller],
              ["Ngày giao dịch", formatDate(tx.date)],
              ["Trạng thái giao dịch", tx.status === "COMPLETED" ? "Hoàn tất" : "Đã huỷ"],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 border-b border-gray-50 pb-3 last:border-0">
                <span className="text-ink-500">{label}</span>
                <span className="text-right font-medium text-ink-900">{value}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <DataBadge />
            <span className="text-xs text-ink-400">Nguồn: {tx.source === "SIMULATED" ? "Dữ liệu mô phỏng" : tx.source}</span>
          </div>
        </div>

        {pending && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-800">
            <strong>Điều gì xảy ra tiếp theo?</strong> Quản lý kiểm tra
            giao dịch tại mục "Quản lý và kiểm tra dữ liệu giao dịch".
            Nếu hợp lệ, giá giao dịch sẽ được dùng để tính giá tham khảo
            cho mẫu máy này. Nếu bị huỷ, khiếu nại hoặc hoàn trả — sẽ
            không được tính.
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/manager/transactions">
            <Button variant="outline">Kiểm tra dữ liệu giao dịch</Button>
          </Link>
          <Link to="/manager/dashboard">
            <Button variant="outline">Xem Dashboard giá tham khảo</Button>
          </Link>
          <Link to="/phones">
            <Button>Tiếp tục mua sắm</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
