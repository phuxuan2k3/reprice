import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import Button from "../components/Button";
import DataBadge from "../components/DataBadge";
import StatCard from "../components/StatCard";
import EmptyState from "../components/EmptyState";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
  ShippingStatusBadge,
  SupportStatusBadge,
  PayoutStatusBadge,
} from "../components/StatusBadge";
import { formatVND, formatDate, phoneName } from "../utils/format";
import { SHIPPING_STATUS_LABEL } from "../data/shipping";

const STATUS_FILTERS = [
  { value: "", label: "Tất cả trạng thái đơn" },
  { value: "PENDING_SELLER", label: "Chờ người bán xác nhận" },
  { value: "CONFIRMED", label: "Đã xác nhận" },
  { value: "SHIPPING", label: "Đang giao" },
  { value: "DELIVERED", label: "Đã giao" },
  { value: "COMPLETED", label: "Đã hoàn tất" },
  { value: "CANCELLED", label: "Đã hủy" },
  { value: "SELLER_REJECTED", label: "Bị từ chối" },
];

const PAYMENT_FILTERS = [
  { value: "", label: "Mọi thanh toán" },
  { value: "PENDING_PAYMENT", label: "Chờ thanh toán" },
  { value: "PAID", label: "Đã thanh toán" },
  { value: "PENDING_COD_COLLECTION", label: "Chờ thu tiền COD" },
  { value: "COD_COLLECTED", label: "Đã thu tiền COD" },
  { value: "PENDING_COD_RECONCILE", label: "Chờ đối soát COD" },
  { value: "COD_RECONCILED", label: "Đã đối soát COD" },
  { value: "REFUND_PROCESSING", label: "Hoàn tiền đang xử lý" },
  { value: "REFUNDED", label: "Đã hoàn tiền" },
];

const SHIPPING_FILTERS = [
  { value: "", label: "Mọi vận chuyển" },
  { value: "AWAITING_PICKUP", label: "Chờ lấy hàng" },
  { value: "IN_TRANSIT", label: "Đang trung chuyển" },
  { value: "OUT_FOR_DELIVERY", label: "Đang giao" },
  { value: "DELIVERED", label: "Giao thành công" },
  { value: "FAILED", label: "Giao không thành công" },
  { value: "RETURNING", label: "Đang hoàn hàng về người bán" },
  { value: "RETURNED", label: "Đã hoàn hàng về người bán" },
  { value: "INCIDENT", label: "Có sự cố vận chuyển" },
  { value: "VOIDED", label: "Vận đơn đã hủy (chưa bàn giao)" },
];

const RESOLVE_DECISIONS = [
  { value: "ACCEPT_RETURN", label: "Chấp nhận cho trả hàng" },
  { value: "REFUND_DIRECT", label: "Khởi tạo hoàn tiền (đang xử lý, mô phỏng)" },
  { value: "NEEDS_INFO", label: "Yêu cầu bổ sung thông tin" },
  { value: "REJECT", label: "Từ chối yêu cầu" },
];

const COST_OPTIONS = [
  { value: "", label: "Chưa xác định / không áp dụng" },
  { value: "SELLER", label: "Người bán chịu" },
  { value: "BUYER", label: "Người mua chịu" },
  { value: "ADMIN", label: "Quản lý quyết định" },
];

export default function ManagerOrdersPage() {
  const {
    user,
    loginAs,
    orders,
    getPhone,
    advanceShipping,
    markDeliveryFailed,
    retryDelivery,
    startReturnToSeller,
    advanceCodPayment,
    resolveSupportRequest,
    confirmReturnReceived,
    startRefund,
    confirmRefundDone,
    showToast,
    isReturnOpen,
    canRetryDelivery,
    mustReturnToSeller,
    canCollectCod,
    isSellerResponseOverdue,
    isPaymentSettled,
    isPaymentRefunded,
    PAYMENT_STATUS,
  } = useApp();

  const [statusFilter, setStatusFilter] = useState("");
  const [shippingFilter, setShippingFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [resolve, setResolve] = useState(null); // { orderId, reqId, type }
  const [decision, setDecision] = useState("ACCEPT_RETURN");
  const [reason, setReason] = useState("");
  const [cost, setCost] = useState("");

  const isManager = user?.role === "manager";

  const list = useMemo(() => {
    let l = [...orders].sort((a, b) =>
      String(b.updatedAt || b.createdAt) < String(a.updatedAt || a.createdAt) ? -1 : 1
    );
    if (statusFilter) l = l.filter((o) => o.status === statusFilter);
    if (shippingFilter === "INCIDENT")
      l = l.filter((o) => !!o.shippingIncident && !o.shippingIncident.resolved);
    else if (shippingFilter) l = l.filter((o) => o.shippingStatus === shippingFilter);
    if (paymentFilter) l = l.filter((o) => o.paymentStatus === paymentFilter);
    const kw = keyword.trim().toLowerCase();
    if (kw) {
      l = l.filter(
        (o) =>
          o.id.toLowerCase().includes(kw) ||
          o.buyerName.toLowerCase().includes(kw) ||
          o.sellerName.toLowerCase().includes(kw) ||
          String(o.trackingCode || "").toLowerCase().includes(kw)
      );
    }
    return l;
  }, [orders, statusFilter, shippingFilter, paymentFilter, keyword]);

  const openRequests = useMemo(() => {
    const rows = [];
    orders.forEach((o) => {
      (o.supportRequests || [])
        .filter((r) => isReturnOpen(r))
        .forEach((r) => rows.push({ order: o, req: r }));
    });
    return rows;
  }, [orders, isReturnOpen]);

  const stats = useMemo(
    () => ({
      total: orders.length,
      shipping: orders.filter((o) =>
        ["PREPARING", "AWAITING_PICKUP", "ACCEPTED", "SORTING", "IN_TRANSIT", "ARRIVED_HUB", "OUT_FOR_DELIVERY"].includes(
          o.shippingStatus
        )
      ).length,
      failed: orders.filter((o) => o.shippingStatus === "FAILED").length,
      requests: openRequests.length,
      refunding: orders.filter((o) => o.paymentStatus === "REFUND_PROCESSING").length,
    }),
    [orders, openRequests]
  );

  const run = (res, okMsg) => {
    if (res?.ok) showToast(okMsg);
    else showToast(res?.reason || "Không thể thực hiện thao tác.", "error");
  };

  const submitResolve = () => {
    const res = resolveSupportRequest(
      resolve.orderId,
      resolve.reqId,
      decision,
      reason.trim(),
      cost || null
    );
    if (res.ok) {
      showToast("Đã xử lý yêu cầu.");
      setResolve(null);
      setReason("");
      setCost("");
    } else {
      showToast(res.reason, "error");
    }
  };

  return (
    <div className="container-x py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Quản lý đơn hàng &amp; vận chuyển</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            Theo dõi đơn hàng, hành trình vận chuyển mô phỏng và xử lý khiếu nại/hoàn trả.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/manager/transactions" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Hàng đợi duyệt giá →
          </Link>
          <DataBadge />
        </div>
      </div>

      {!isManager && (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Bạn đang xem với quyền <strong>{user ? "không phải Người quản lý" : "khách"}</strong>{" "}
          — chỉ xem được dữ liệu.{" "}
          <button
            onClick={() => loginAs("manager")}
            className="font-bold underline hover:no-underline"
          >
            Đăng nhập nhanh với vai trò Người quản lý
          </button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Tổng đơn" value={stats.total} sub="Toàn hệ thống mô phỏng" accent="gray" />
        <StatCard label="Đang vận chuyển" value={stats.shipping} sub="Chờ lấy hàng → đang giao" accent="blue" />
        <StatCard label="Giao thất bại" value={stats.failed} sub="Cần theo dõi / giao lại" accent="red" />
        <StatCard label="Khiếu nại mở" value={stats.requests} sub="Cần xử lý" accent="amber" />
      </div>

      {/* Khiếu nại / hoàn trả */}
      {openRequests.length > 0 && (
        <div className="card mt-6 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
            Khiếu nại / hoàn trả đang mở
          </h2>
          <div className="mt-3 space-y-3">
            {openRequests.map(({ order, req }) => {
              const overdue = isSellerResponseOverdue(req, new Date());
              return (
              <div key={req.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-ink-900">
                    Đơn {order.id} — {req.reason || req.type}
                  </div>
                  <div className="flex items-center gap-2">
                    {overdue && (
                      <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                        Người bán quá hạn 48h
                      </span>
                    )}
                    <SupportStatusBadge status={req.status} />
                  </div>
                </div>
                <p className="mt-1 text-sm text-ink-700">{req.description}</p>
                {req.evidence && req.evidence.length > 0 && (
                  <p className="mt-1 text-xs text-ink-500">
                    Bằng chứng: {req.evidence.join("; ")}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-3">
                  <Link to={`/orders/${order.id}`} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                    Xem đơn →
                  </Link>
                  <Link
                    to={`/orders/${order.id}/cases/${req.id}`}
                    className="text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    Mở hồ sơ →
                  </Link>
                </div>
                {isManager && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setResolve({ orderId: order.id, reqId: req.id });
                        setDecision("ACCEPT_RETURN");
                        setReason("");
                        setCost("");
                      }}
                    >
                      Xử lý
                    </Button>
                    {(req.status === "ACCEPTED_RETURN" || req.status === "RETURNING") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => run(confirmReturnReceived(order.id, req.id), "Đã xác nhận nhận lại hàng.")}
                      >
                        Đã nhận lại hàng
                      </Button>
                    )}
                    {req.status === "RETURNED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => run(startRefund(order.id, req.id), "Đã khởi tạo hoàn tiền (đang xử lý, mô phỏng).")}
                      >
                        Khởi tạo hoàn tiền (mô phỏng)
                      </Button>
                    )}
                    {req.status === "REFUND_PROCESSING" && (
                      <Button
                        size="sm"
                        onClick={() => run(confirmRefundDone(order.id, req.id), "Đã ghi nhận kết quả hoàn tiền (mô phỏng).")}
                      >
                        Xác nhận hoàn tiền xong
                      </Button>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bộ lọc */}
      <div className="card mt-6 flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <select
          className="input lg:w-56"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          className="input lg:w-52"
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
        >
          {PAYMENT_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          className="input lg:w-52"
          value={shippingFilter}
          onChange={(e) => setShippingFilter(e.target.value)}
        >
          {SHIPPING_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <input
          type="search"
          className="input lg:ml-auto lg:w-72"
          placeholder="Tìm mã đơn, mã vận đơn, người mua/bán..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      {/* Danh sách đơn */}
      {list.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Không có đơn hàng nào" description="Thử thay đổi bộ lọc hoặc từ khóa." />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {list.map((o) => {
            const phone = getPhone(o.phoneId);
            const shippingActive =
              !!o.trackingCode &&
              !["DELIVERED", "FAILED", "RETURNING", "RETURNED", "VOIDED"].includes(o.shippingStatus);
            return (
              <div key={o.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold text-ink-900">{o.id}</span>
                      <OrderStatusBadge status={o.status} />
                      <ShippingStatusBadge status={o.shippingStatus} />
                      <PaymentStatusBadge status={o.paymentStatus} />
                      {o.payout?.status === "PAID_SIMULATED" && (
                        <PayoutStatusBadge status={o.payout.status} />
                      )}
                    </div>
                    <div className="mt-1 text-sm text-ink-500">
                      {phone ? phoneName(phone) : o.phoneId}
                      {phone && ` · ${phone.storage}`} · Người mua {o.buyerName} ↔ Người bán{" "}
                      {o.sellerName}
                    </div>
                    <div className="mt-1 text-sm">
                      <span className="text-ink-500">Giá thống nhất: </span>
                      <span className="font-semibold text-brand-600">
                        {formatVND(o.negotiatedPrice)}
                      </span>
                    </div>
                    {o.trackingCode && (
                      <div className="mt-1 text-xs text-ink-500">
                        Vận đơn <span className="font-mono">{o.trackingCode}</span> ·{" "}
                        {SHIPPING_STATUS_LABEL[o.shippingStatus]} · Dự kiến{" "}
                        {formatDate(o.etaDelivery)}
                      </div>
                    )}
                    {o.shippingIncident && !o.shippingIncident.resolved && (
                      <div className="mt-1 text-xs text-red-600">
                        Sự cố vận chuyển: {o.shippingIncident.note}
                      </div>
                    )}
                  </div>
                  <Link to={`/orders/${o.id}`}>
                    <Button size="sm" variant="outline">
                      Xem chi tiết
                    </Button>
                  </Link>
                </div>

                {isManager &&
                  (shippingActive ||
                    o.shippingStatus === "OUT_FOR_DELIVERY" ||
                    o.shippingStatus === "FAILED" ||
                    o.shippingStatus === "RETURNING" ||
                    (o.paymentMethod === "COD" &&
                      canCollectCod(o) &&
                      !isPaymentSettled(o) &&
                      !isPaymentRefunded(o))) && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-dashed border-gray-200 pt-3">
                    {shippingActive && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => run(advanceShipping(o.id), "Đã cập nhật vận chuyển.")}
                      >
                        Bước vận chuyển tiếp theo
                      </Button>
                    )}
                    {o.shippingStatus === "OUT_FOR_DELIVERY" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => run(markDeliveryFailed(o.id, "Quản lý đánh dấu thất bại."), "Đã ghi nhận giao thất bại.")}
                      >
                        Đánh dấu thất bại
                      </Button>
                    )}
                    {o.shippingStatus === "FAILED" && canRetryDelivery(o) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => run(retryDelivery(o.id), "Đã chuyển sang giao lại (lần duy nhất).")}
                      >
                        Giao lại (1 lần)
                      </Button>
                    )}
                    {o.shippingStatus === "FAILED" && mustReturnToSeller(o) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => run(startReturnToSeller(o.id), "Đã chuyển hoàn hàng về người bán (mô phỏng).")}
                      >
                        Chuyển hoàn về người bán
                      </Button>
                    )}
                    {o.paymentMethod === "COD" &&
                      canCollectCod(o) &&
                      !isPaymentSettled(o) &&
                      !isPaymentRefunded(o) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => run(advanceCodPayment(o.id), "Đã cập nhật một bước thu tiền COD (mô phỏng).")}
                        >
                          {o.paymentStatus === PAYMENT_STATUS.PENDING_COD_COLLECTION
                            ? "Ghi nhận đã thu tiền COD"
                            : o.paymentStatus === PAYMENT_STATUS.COD_COLLECTED
                            ? "Chuyển sang chờ đối soát"
                            : "Xác nhận đã đối soát COD"}
                        </Button>
                      )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal xử lý khiếu nại */}
      {resolve && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setResolve(null)}
        >
          <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-ink-900">Xử lý yêu cầu hỗ trợ</h3>
            <div className="mt-4">
              <label className="label" htmlFor="mgr-decision">
                Quyết định
              </label>
              <select
                id="mgr-decision"
                className="input"
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
              >
                {RESOLVE_DECISIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3">
              <label className="label" htmlFor="mgr-reason">
                Lý do / ghi chú
              </label>
              <textarea
                id="mgr-reason"
                className="input min-h-20 resize-y"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            {(decision === "ACCEPT_RETURN" || decision === "REJECT") && (
              <div className="mt-3">
                <label className="label" htmlFor="mgr-cost">
                  Trách nhiệm chi phí trả hàng
                </label>
                <select
                  id="mgr-cost"
                  className="input"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                >
                  {COST_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <p className="mt-3 text-xs text-ink-500">
              Mọi quyết định lưu người xử lý, thời gian, kết quả và lý do. Không tự chi
              trả/hoàn tiền thật khi chưa có kết quả xác minh.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => setResolve(null)}>
                Quay lại
              </Button>
              <Button onClick={submitResolve}>Xác nhận</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
