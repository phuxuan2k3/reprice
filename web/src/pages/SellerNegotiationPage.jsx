import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import PhoneImage from "../components/PhoneImage";
import Button from "../components/Button";
import AccessNotice from "../components/AccessNotice";
import StatusBadge from "../components/StatusBadge";
import { formatVND, phoneName } from "../utils/format";
import { offerPriceWarning } from "../data/negotiationRules";

/**
 * CHI TIẾT MỘT PHIÊN THƯƠNG LƯỢNG (vai Người bán).
 * Người bán mở từ thông báo "Đề nghị thương lượng mới" và có ba lựa chọn:
 *   - Chấp nhận giá người mua đề nghị.
 *   - Đề nghị mức giá khác (mặc định mức giá giữa hai bên).
 *   - Từ chối (kèm lý do tuỳ chọn).
 * Mọi thao tác kiểm tra đúng vai trò của phiên (chỉ người bán sở hữu tin đăng).
 */
export default function SellerNegotiationPage() {
  const { negId } = useParams();
  const navigate = useNavigate();
  const {
    user,
    loginAs,
    negotiations,
    getPhone,
    sellerRespond,
    NEGOTIATION_STATUS_LABEL,
    NEGOTIATION_STATUS_TONE,
    lastBuyerOffer,
    counterPriceBetween,
    showToast,
  } = useApp();

  const [counterInput, setCounterInput] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [error, setError] = useState("");
  // Cảnh báo giá đối bất thường đang chờ người bán xác nhận ({ code, message, price }).
  const [counterWarning, setCounterWarning] = useState(null);

  const neg = negotiations.find((n) => n.id === negId);

  if (!user) {
    return (
      <AccessNotice
        requiredRole="seller"
        requiredLabel="Người bán"
        title="Cần đăng nhập với vai trò Người bán"
        description="Đăng nhập với vai trò Người bán để phản hồi đề nghị thương lượng."
        onLogin={() => loginAs("seller")}
      />
    );
  }
  if (user.role !== "seller" || !neg || neg.sellerId !== user.id) {
    return (
      <div className="container-x py-16 text-center">
        <h1 className="text-xl font-bold text-ink-900">
          Không tìm thấy phiên thương lượng
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          Phiên này không tồn tại hoặc không thuộc tin đăng của bạn.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Button onClick={() => navigate("/seller/negotiations")}>
            Về danh sách thương lượng
          </Button>
        </div>
      </div>
    );
  }

  const phone = getPhone(neg.phoneId);
  const offer = lastBuyerOffer(neg);
  const canRespond = neg.status === "AWAITING_SELLER" && !!offer;
  const defaultCounter =
    offer && phone
      ? counterPriceBetween(neg.listingPrice, offer.price)
      : neg.listingPrice;
  const statusLabel = NEGOTIATION_STATUS_LABEL[neg.status] || neg.status;

  const run = (res, okMsg) => {
    if (!res || !res.ok) {
      const reason = res?.reason || "Thao tác không hợp lệ.";
      setError(reason);
      showToast(reason, "error");
      return false;
    }
    setError("");
    showToast(okMsg);
    return true;
  };

  const onAccept = () => run(sellerRespond(neg.id, "accept"), "Đã chấp nhận đề nghị của người mua.");

  const onCounter = () => {
    const price = Number(counterInput || defaultCounter);
    if (!Number.isFinite(price) || price <= 0) {
      setError("Giá đề nghị phải là số hợp lệ lớn hơn 0.");
      return;
    }
    const warning = offerPriceWarning("seller", neg.listingPrice, price, offer?.price);
    if (warning) {
      setCounterWarning({ ...warning, price });
      return;
    }
    submitCounter(price);
  };

  const submitCounter = (price) => {
    setCounterWarning(null);
    run(sellerRespond(neg.id, "counter", price), "Đã gửi đề nghị mức giá khác cho người mua.");
  };

  const onReject = () =>
    run(sellerRespond(neg.id, "reject", null, rejectNote.trim()), "Đã từ chối đề nghị thương lượng.");

  return (
    <div className="container-x py-8">
      <nav className="text-sm text-ink-500">
        <Link to="/seller/negotiations" className="hover:text-brand-600">
          Thương lượng nhận được
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ink-900">Mã phiên {neg.id}</span>
      </nav>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Sản phẩm */}
        <div className="space-y-4">
          <div className="card flex items-center gap-4 p-4">
            {phone && (
              <div className="shrink-0 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100">
                <PhoneImage phone={phone} className="h-36 w-auto" />
              </div>
            )}
            <div>
              <div className="font-semibold text-ink-900">
                {phone ? phoneName(phone) : neg.phoneId}
              </div>
              {phone && (
                <div className="text-sm text-ink-500">
                  {phone.storage} · {phone.condition}
                </div>
              )}
              <div className="mt-2 text-lg font-bold text-brand-600">
                {formatVND(neg.listingPrice)}
              </div>
              <div className="text-xs text-ink-500">Giá bạn đang rao</div>
            </div>
          </div>

          <div className="card p-4 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Người mua
            </div>
            <div className="mt-1 font-semibold text-ink-900">{neg.buyerName}</div>
            {phone && (
              <Link
                to={`/phones/${phone.id}`}
                className="mt-3 inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Xem tin đăng →
              </Link>
            )}
            {neg.orderId && (
              <Link
                to={`/orders/${neg.orderId}`}
                className="mt-2 inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Xem đơn hàng {neg.orderId} →
              </Link>
            )}
          </div>
        </div>

        {/* Hộp thương lượng */}
        <div className="card flex flex-col lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-4">
            <div>
              <h1 className="text-lg font-bold text-ink-900">Phản hồi đề nghị</h1>
              <p className="text-sm text-ink-500">Mã phiên {neg.id}</p>
            </div>
            <StatusBadge tone={NEGOTIATION_STATUS_TONE[neg.status]}>
              {statusLabel}
            </StatusBadge>
          </div>

          {/* Lịch sử đề nghị */}
          <div className="flex-1 space-y-4 overflow-y-auto p-5" style={{ maxHeight: 380 }}>
            {neg.offers.length === 0 && (
              <div className="rounded-lg bg-gray-50 p-4 text-sm text-ink-500">
                Người mua chưa gửi đề nghị nào.
              </div>
            )}
            {neg.offers.map((o, i) => {
              const mine = o.from === "seller";
              return (
                <div key={i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      mine
                        ? "rounded-br-md bg-navy-900 text-white"
                        : "rounded-bl-md bg-gray-100 text-ink-900"
                    }`}
                  >
                    <div className="text-xs opacity-75">
                      {mine ? "Bạn" : neg.buyerName} · {o.time}
                    </div>
                    <div className="mt-1 text-lg font-bold">{formatVND(o.price)}</div>
                    {o.note && <div className="mt-1 text-sm opacity-90">{o.note}</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Hành động */}
          <div className="border-t border-gray-100 p-5">
            {canRespond ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <div className="text-sm font-semibold text-blue-900">
                    Người mua đề nghị:{" "}
                    <span className="text-lg font-bold">{formatVND(offer.price)}</span>
                  </div>
                  <p className="mt-1 text-xs text-blue-700">
                    Giá rao hiện tại: {formatVND(neg.listingPrice)}. Chọn một trong ba
                    cách phản hồi bên dưới.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="success" onClick={onAccept}>
                      Chấp nhận giá này
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 p-4">
                  <label className="label" htmlFor="counter-price">
                    Đề nghị mức giá khác (₫)
                  </label>
                  <input
                    id="counter-price"
                    type="number"
                    min="0"
                    step="10000"
                    className="input max-w-xs"
                    placeholder={String(defaultCounter ?? "")}
                    value={counterInput}
                    onChange={(e) => {
                      setCounterInput(e.target.value);
                      setCounterWarning(null);
                    }}
                  />
                  {counterWarning && (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <p className="font-semibold">{counterWarning.message}</p>
                      <p className="mt-1">
                        Giá rao: <strong>{formatVND(neg.listingPrice)}</strong>
                        {offer && (
                          <>
                            {" "}· Người mua đề nghị: <strong>{formatVND(offer.price)}</strong>
                          </>
                        )}{" "}
                        · Giá bạn nhập: <strong>{formatVND(counterWarning.price)}</strong>
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => submitCounter(counterWarning.price)}>
                          Vẫn gửi
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setCounterWarning(null)}>
                          Sửa lại
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCounterInput(String(defaultCounter ?? ""));
                        setCounterWarning(null);
                      }}
                    >
                      Dùng mức giá giữa hai bên
                    </Button>
                    <Button size="sm" onClick={onCounter}>
                      Gửi đề nghị mức giá khác
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border border-red-200 p-4">
                  <label className="label" htmlFor="reject-note">
                    Lý do từ chối (tuỳ chọn)
                  </label>
                  <input
                    id="reject-note"
                    className="input"
                    placeholder="VD: Giá đã sát giá thị trường"
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                  />
                  <div className="mt-2">
                    <Button size="sm" variant="danger" onClick={onReject}>
                      Từ chối đề nghị
                    </Button>
                  </div>
                </div>

                {error && (
                  <p className="text-xs font-medium text-red-600">{error}</p>
                )}
              </div>
            ) : (
              <div className="rounded-lg bg-gray-50 p-4 text-sm text-ink-600">
                {neg.status === "AGREED" && (
                  <span>
                    Bạn và người mua đã thống nhất giá{" "}
                    <strong>{formatVND(neg.agreedPrice)}</strong>. Chờ người mua tạo đơn
                    hàng theo giá đã chốt.
                  </span>
                )}
                {neg.status === "SELLER_COUNTER" && (
                  <span>
                    Bạn đã đề nghị mức giá <strong>{formatVND(neg.counterPrice)}</strong>{" "}
                    — đang chờ người mua phản hồi.
                  </span>
                )}
                {neg.status === "REJECTED" && (
                  <span>Bạn đã từ chối đề nghị này. Người mua có thể thương lượng lại.</span>
                )}
                {neg.status === "CANCELLED" && (
                  <span>Người mua đã hủy phiên thương lượng này.</span>
                )}
                {neg.status === "AWAITING_SELLER" && !offer && (
                  <span>Người mua chưa gửi đề nghị nào.</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
