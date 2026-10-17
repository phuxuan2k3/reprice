import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import PhoneImage from "../components/PhoneImage";
import Button from "../components/Button";
import DataBadge from "../components/DataBadge";
import StatusBadge from "../components/StatusBadge";
import { formatVND, phoneName, phoneUsage } from "../utils/format";

export default function CreateOrderPage() {
  const { user, getPhone, pendingCheckout, negotiations, createOrder, showToast } =
    useApp();
  const navigate = useNavigate();

  const [address, setAddress] = useState(user?.address || "");
  const [payment, setPayment] = useState("Tiền mặt khi nhận hàng");
  const [addressError, setAddressError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);

  // Không có thông tin chờ thanh toán -> về danh sách
  if (!pendingCheckout) {
    return <Navigate to="/phones" replace />;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const phone = getPhone(pendingCheckout.phoneId);
  if (!phone) return <Navigate to="/phones" replace />;

  const price = pendingCheckout.price || phone.price;
  const priceValid = Number.isFinite(Number(price)) && Number(price) > 0;
  const shippingFee = 0;
  const total = price + shippingFee;
  const isNegotiated = !!pendingCheckout.negotiationId;

  // Kiểm tra lại phiên thương lượng trước khi cho tạo đơn (không tạo đơn theo
  // giá chưa được hai bên thống nhất).
  const negotiation = isNegotiated
    ? negotiations.find((n) => n.id === pendingCheckout.negotiationId)
    : null;
  const negotiationIssue = !isNegotiated
    ? ""
    : !negotiation
    ? "Không tìm thấy phiên thương lượng của đơn hàng này."
    : negotiation.orderId
    ? "Phiên thương lượng này đã tạo đơn hàng rồi."
    : negotiation.status !== "AGREED" || !negotiation.agreedPrice
    ? "Phiên thương lượng chưa thống nhất giá — không thể tạo đơn theo giá chưa chốt."
    : "";
  // Giá rao của tin đăng có thể đã thay đổi kể từ khi thương lượng.
  const listingChanged =
    isNegotiated &&
    !!negotiation &&
    negotiation.listingPrice != null &&
    Number(negotiation.listingPrice) !== Number(phone.price);

  const onSubmit = (e) => {
    e.preventDefault();
    if (submitting) return; // Chống tạo đơn trùng khi bấm nhiều lần
    if (negotiationIssue) {
      showToast(negotiationIssue, "error");
      return;
    }
    if (!address.trim()) {
      setAddressError("Vui lòng nhập địa chỉ nhận hàng.");
      return;
    }
    if (!priceValid) {
      showToast("Giá đã thống nhất không hợp lệ. Vui lòng thương lượng lại.", "error");
      return;
    }
    setAddressError("");
    setSubmitting(true);
    const res = createOrder({
      phoneId: phone.id,
      price,
      address: address.trim(),
      payment,
      negotiationId: pendingCheckout.negotiationId,
    });
    setSubmitting(false);
    if (!res?.ok) {
      showToast(res?.reason || "Tạo đơn hàng thất bại. Vui lòng thử lại.", "error");
      return;
    }
    showToast(
      res.listingChanged
        ? "Tạo đơn hàng thành công. Lưu ý: giá rao đã thay đổi kể từ khi thương lượng."
        : "Tạo đơn hàng thành công."
    );
    setDone({ orderId: res.orderId, listingChanged: res.listingChanged });
  };

  /* ---------------- Màn hình tạo đơn thành công ---------------- */
  if (done) {
    return (
      <div className="container-x py-8">
        <div className="mx-auto max-w-2xl">
          <div className="card p-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-7 w-7 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h1 className="mt-4 text-2xl font-bold text-ink-900">
              Tạo đơn hàng thành công
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              Đơn hàng đã được ghi nhận và lưu trên trình duyệt của bạn
              (bản demo chưa có máy chủ).
            </p>
            <div className="mt-6 rounded-xl border border-gray-100 bg-gray-50 p-5 text-left">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-500">Mã đơn</dt>
                  <dd className="font-semibold text-ink-900">{done.orderId}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-500">Sản phẩm</dt>
                  <dd className="text-right font-medium text-ink-900">
                    {phoneName(phone)} {phone.storage}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">Giá đăng bán</dt>
                  <dd className="font-medium text-ink-900">
                    {formatVND(phone.price)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">
                    {isNegotiated
                      ? "Giá hai bên thống nhất"
                      : "Giá người bán rao"}
                  </dt>
                  <dd className="font-semibold text-brand-600">{formatVND(price)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">Trạng thái</dt>
                  <dd>
                    <StatusBadge tone="amber">
                      Chờ người mua xác nhận
                    </StatusBadge>
                  </dd>
                </div>
              </dl>
            </div>
            {done.listingChanged && (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left text-xs text-amber-800">
                Giá rao của tin đăng đã thay đổi kể từ khi thương lượng. Đơn được giữ
                theo giá hai bên đã chốt; hai bên nên xác nhận lại khi xác nhận đơn.
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button onClick={() => navigate(`/orders/${done.orderId}`)}>
                Xem chi tiết đơn
              </Button>
              <Button variant="outline" onClick={() => navigate("/phones")}>
                Về danh sách điện thoại
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* -------- Chặn tạo đơn khi phiên thương lượng chưa hợp lệ -------- */
  if (negotiationIssue) {
    return (
      <div className="container-x py-16">
        <div className="card mx-auto max-w-xl p-8 text-center">
          <h1 className="text-xl font-bold text-ink-900">Chưa thể tạo đơn hàng</h1>
          <p className="mt-2 text-sm text-ink-500">{negotiationIssue}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Button onClick={() => navigate(`/negotiation/${phone.id}`)}>
              Về trang thương lượng
            </Button>
            <Button variant="outline" onClick={() => navigate(`/phones/${phone.id}`)}>
              Về trang sản phẩm
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-x py-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-ink-900">Xác nhận tạo đơn</h1>
        <p className="mt-1 text-sm text-ink-500">
          Kiểm tra lại thông tin trước khi tạo đơn hàng.
        </p>

        {listingChanged && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Giá rao của tin đăng đã thay đổi kể từ khi hai bên thương lượng (giá
            lúc thương lượng: <strong>{formatVND(negotiation.listingPrice)}</strong>,
            giá hiện tại: <strong>{formatVND(phone.price)}</strong>). Giá hai bên đã
            chốt vẫn được giữ nguyên — hãy xác nhận lại trước khi tạo đơn.
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-6">
          {/* Sản phẩm */}
          <div className="card p-5">
            <div className="flex items-center gap-4">
              <div className="shrink-0 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100">
                <PhoneImage phone={phone} className="h-28 w-auto" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-ink-900">
                  {phoneName(phone)} <span className="text-ink-500">{phone.storage}</span>
                </div>
                <div className="text-sm text-ink-500">
                  {phone.condition} · Dùng {phoneUsage(phone)} · Pin {phone.batteryHealth}%
                </div>
                <div className="text-sm text-ink-500">
                  Người bán: <span className="font-medium text-ink-900">{phone.seller.name}</span> · {phone.region}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-brand-600">
                  {formatVND(price)}
                </div>
                <div className="text-xs text-ink-500">
                  {isNegotiated ? "Giá hai bên thống nhất" : "Giá người bán rao"}
                </div>
                {isNegotiated && (
                  <div className="mt-0.5 text-xs text-ink-400">
                    Giá đăng: {formatVND(phone.price)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Thông tin giao hàng */}
          <div className="card space-y-4 p-5">
            <h2 className="font-semibold text-ink-900">Thông tin giao hàng</h2>
            <div>
              <label className="label" htmlFor="buyer">Người mua</label>
              <input id="buyer" className="input" value={user.name} readOnly />
            </div>
            <div>
              <label className="label" htmlFor="address">Địa chỉ nhận hàng</label>
              <input
                id="address"
                className="input"
                placeholder="Số nhà, phường, quận, thành phố"
                value={address}
                aria-invalid={!!addressError}
                onChange={(e) => {
                  setAddress(e.target.value);
                  if (addressError) setAddressError("");
                }}
              />
              {addressError && (
                <p className="mt-1.5 text-xs font-medium text-red-600">
                  {addressError}
                </p>
              )}
            </div>
            <div>
              <label className="label">Phương thức thanh toán</label>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  {
                    value: "Chuyển khoản ngân hàng",
                    title: "Thanh toán trước",
                    hint: "Chuyển khoản/QR (mô phỏng). Đơn chỉ coi là đã thanh toán sau khi cổng mô phỏng xác nhận.",
                  },
                  {
                    value: "Tiền mặt khi nhận hàng",
                    title: "Thanh toán khi nhận hàng (COD)",
                    hint: "Chọn COD KHÔNG đồng nghĩa đã thu tiền. Phải xác minh thu tiền và đối soát sau khi giao.",
                  },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                      payment === opt.value ? "border-brand-500 bg-brand-50" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="payment"
                      value={opt.value}
                      checked={payment === opt.value}
                      onChange={(e) => setPayment(e.target.value)}
                      className="mt-0.5 h-4 w-4 accent-brand-500"
                    />
                    <span>
                      <span className="block text-sm font-medium text-ink-900">{opt.title}</span>
                      <span className="mt-0.5 block text-xs text-ink-500">{opt.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Tổng tiền */}
          <div className="card p-5">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-500">
                  Giá sản phẩm ({isNegotiated ? "đã thống nhất" : "giá rao"})
                </span>
                <span className="font-medium text-ink-900">{formatVND(price)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500">Phí vận chuyển</span>
                <span className="font-medium text-emerald-600">Miễn phí</span>
              </div>
              <div className="flex justify-between border-t border-gray-100 pt-3 text-base font-bold">
                <span>Tổng thanh toán</span>
                <span className="text-brand-600">{formatVND(total)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" size="lg" disabled={submitting}>
              {submitting ? "Đang tạo đơn…" : "Xác nhận tạo đơn"}
            </Button>
            <Button type="button" variant="outline" size="lg" onClick={() => navigate(`/phones/${phone.id}`)}>
              Quay lại
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <DataBadge />
            <span className="text-xs text-ink-400">
              Đơn hàng sẽ chuyển sang giao dịch hoàn tất sau khi hai bên
              thực hiện xong — và chỉ lúc đó mới được xem xét đưa vào
              tập dữ liệu tham khảo.
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
