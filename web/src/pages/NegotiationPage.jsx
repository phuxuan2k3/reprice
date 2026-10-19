import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import PhoneImage from "../components/PhoneImage";
import Button from "../components/Button";
import AccessNotice from "../components/AccessNotice";
import StatusBadge from "../components/StatusBadge";
import ReferencePricePanel from "../components/ReferencePricePanel";
import { formatVND, phoneName } from "../utils/format";
import { offerPriceWarning } from "../data/negotiationRules";

const STATUS_META = {
  AWAITING_SELLER: { tone: "amber", label: "Đang chờ người bán phản hồi" },
  SELLER_COUNTER: { tone: "blue", label: "Người bán đã đề nghị mức giá mới" },
  AGREED: { tone: "green", label: "Hai bên đã thống nhất giá" },
  REJECTED: { tone: "red", label: "Người bán đã từ chối" },
  CANCELLED: { tone: "gray", label: "Thương lượng đã hủy" },
};

export default function NegotiationPage() {
  const { id: phoneId } = useParams();
  const {
    user,
    loginAs,
    getPhone,
    referencePrice,
    negotiations,
    startNegotiation,
    sendOffer,
    acceptCounter,
    cancelNegotiation,
    rejectCounter,
    canBuyerCreateOrder,
    setPendingCheckout,
    showToast,
  } = useApp();
  const navigate = useNavigate();
  const [offer, setOffer] = useState("");
  const [note, setNote] = useState("");
  const [offerError, setOfferError] = useState("");
  // Cảnh báo giá bất thường đang chờ người mua xác nhận ({ code, message, price }).
  const [offerWarning, setOfferWarning] = useState(null);
  const offerRef = useRef(null);
  const bottomRef = useRef(null);

  const phone = getPhone(phoneId);
  // Chỉ lấy phiên của chính người mua đang đăng nhập (không xem phiên của người khác).
  const neg = negotiations.find(
    (n) => n.phoneId === phoneId && n.buyerId === user?.id
  );

  // Tự tạo phiên thương lượng khi vào trang (nếu chưa có)
  useEffect(() => {
    if (user && user.role === "buyer" && phone && !neg) {
      startNegotiation(phone.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, phoneId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [neg?.offers.length]);

  if (!phone) return <Navigate to="/phones" replace />;

  if (!user) {
    return (
      <AccessNotice
        requiredRole="buyer"
        requiredLabel="Người mua"
        title="Cần đăng nhập với vai trò Người mua"
        description="Để thương lượng giá với người bán, bạn cần đăng nhập với vai trò Người mua."
        onLogin={() => loginAs("buyer")}
      />
    );
  }
  if (user.role !== "buyer") {
    // Người bán mở nhầm trang thương lượng phía người mua → đưa về hộp thương lượng nhận được.
    if (phone.seller?.id === user.id) {
      return (
        <div className="container-x py-16 text-center">
          <h1 className="text-xl font-bold text-ink-900">
            Đây là trang thương lượng của Người mua
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            Bạn đang là người bán của tin đăng này. Xem và phản hồi đề nghị trong mục
            thương lượng nhận được.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Button onClick={() => navigate("/seller/negotiations")}>
              Mở thương lượng nhận được
            </Button>
          </div>
        </div>
      );
    }
    return (
      <AccessNotice
        requiredRole="buyer"
        requiredLabel="Người mua"
        title="Trang dành cho Người mua"
        description="Chỉ tài khoản Người mua mới có thể thương lượng giá."
        onLogin={() => loginAs("buyer")}
      />
    );
  }

  const reference = referencePrice(phone.id);
  const status = neg ? STATUS_META[neg.status] : STATUS_META.AWAITING_SELLER;
  const lastOffer = neg ? [...neg.offers].reverse().find((o) => o.from === "buyer") : null;
  const awaitingSeller = neg?.status === "AWAITING_SELLER" && neg.offers.length > 0;
  const sellerCountered = neg?.status === "SELLER_COUNTER";
  const agreed = neg?.status === "AGREED";
  const rejected = neg?.status === "REJECTED";
  const cancelled = neg?.status === "CANCELLED";

  const onSendOffer = (e) => {
    e.preventDefault();
    if (!neg) return;
    const raw = (offer || "").trim();
    const price = Number(raw);
    if (!raw) {
      setOfferError("Vui lòng nhập giá đề nghị.");
      offerRef.current?.focus();
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setOfferError("Giá đề nghị phải là số hợp lệ lớn hơn 0.");
      offerRef.current?.focus();
      return;
    }
    setOfferError("");
    const warning = offerPriceWarning("buyer", phone.price, price);
    if (warning) {
      setOfferWarning({ ...warning, price });
      return;
    }
    submitOffer(price);
  };

  const submitOffer = (price) => {
    setOfferWarning(null);
    const res = sendOffer(neg.id, price, note.trim());
    if (!res.ok) {
      setOfferError(res.reason);
      return;
    }
    setOffer("");
    setNote("");
    showToast("Đã gửi đề nghị tới người bán.");
  };

  /** Người mua từ chối đề nghị đối giá của người bán. */
  const onRejectCounter = () => {
    const res = rejectCounter(neg.id);
    if (!res.ok) {
      showToast(res.reason, "error");
      return;
    }
    showToast("Đã từ chối đề nghị của người bán. Hãy gửi đề nghị khác.");
  };

  /** Người mua chấp nhận đề nghị đối giá của người bán. */
  const onAcceptCounter = () => {
    const res = acceptCounter(neg.id);
    if (!res.ok) {
      showToast(res.reason, "error");
      return;
    }
    showToast("Hai bên đã thống nhất giá. Bạn có thể tạo đơn hàng.");
  };

  /** Đề nghị mức giá khác: điền giá người bán đề nghị vào form để sửa. */
  const onSuggestOtherOffer = () => {
    if (neg?.counterPrice) setOffer(String(neg.counterPrice));
    offerRef.current?.focus();
    offerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const goCheckout = () => {
    const gate = canBuyerCreateOrder(neg, { userId: user.id });
    if (!gate.allowed) {
      showToast(gate.reason, "error");
      return;
    }
    setPendingCheckout({
      phoneId: phone.id,
      price: neg.agreedPrice,
      negotiationId: neg.id,
      intent: "buy",
    });
    navigate("/orders/create");
  };

  return (
    <div className="container-x py-8">
      <nav className="text-sm text-ink-500">
        <Link to="/phones" className="hover:text-brand-600">Danh sách điện thoại</Link>
        <span className="mx-2">/</span>
        <Link to={`/phones/${phone.id}`} className="hover:text-brand-600">
          {phoneName(phone)}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ink-900">Thương lượng giá</span>
      </nav>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Thông tin sản phẩm */}
        <div className="space-y-4">
          <div className="card flex items-center gap-4 p-4">
            <div className="shrink-0 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100">
              <PhoneImage phone={phone} className="h-36 w-auto" />
            </div>
            <div>
              <div className="font-semibold text-ink-900">
                {phoneName(phone)}
              </div>
              <div className="text-sm text-ink-500">
                {phone.storage} · {phone.condition}
              </div>
              <div className="mt-2 text-lg font-bold text-brand-600">
                {formatVND(phone.price)}
              </div>
              <div className="text-xs text-ink-500">Giá người bán đăng</div>
            </div>
          </div>
          <ReferencePricePanel
            phone={phone}
            reference={reference}
            role={user?.role === "seller" ? "seller" : "buyer"}
            markerLabel="Giá đang rao"
          />
        </div>

        {/* Hộp thoại thương lượng */}
        <div className="card flex flex-col lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-4">
            <div>
              <h2 className="text-lg font-bold text-ink-900">Thương lượng giá</h2>
              <p className="text-sm text-ink-500">
                Với {phone.seller.name} · Mã phiên {neg?.id || "—"}
              </p>
            </div>
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          </div>

          {/* Danh sách đề nghị */}
          <div className="flex-1 space-y-4 overflow-y-auto p-5" style={{ maxHeight: 380 }}>
            {neg && neg.offers.length === 0 && (
              <div className="rounded-lg bg-gray-50 p-4 text-sm text-ink-500">
                Chưa có đề nghị nào. Hãy gửi đề nghị giá đầu tiên của bạn.
                Bạn có thể dựa vào giá tham khảo bên trái để ra mức giá hợp lý.
              </div>
            )}
            {neg?.offers.map((o, i) => (
              <div key={i} className={`flex ${o.from === "buyer" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    o.from === "buyer"
                      ? "rounded-br-md bg-brand-500 text-white"
                      : "rounded-bl-md bg-gray-100 text-ink-900"
                  }`}
                >
                  <div className="text-xs opacity-75">
                    {o.from === "buyer" ? "Bạn" : phone.seller.name} · {o.time}
                  </div>
                  <div className="mt-1 text-lg font-bold">{formatVND(o.price)}</div>
                  {o.note && <div className="mt-1 text-sm opacity-90">{o.note}</div>}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Hành động theo trạng thái */}
          <div className="border-t border-gray-100 p-5">
            {/* Chờ người bán phản hồi — không giả lập thay người bán */}
            {awaitingSeller && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="text-sm font-semibold text-amber-900">
                  Đã gửi đề nghị {formatVND(lastOffer?.price)} tới người bán
                </div>
                <p className="mt-1 text-xs text-amber-700">
                  Đề nghị đã được ghi nhận và thông báo tới người bán. Bạn sẽ nhận
                  thông báo ngay khi người bán phản hồi.
                </p>
              </div>
            )}

            {sellerCountered && (
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="text-sm font-semibold text-blue-900">
                  Người bán đề nghị: <span className="text-lg font-bold">{formatVND(neg.counterPrice)}</span>
                </div>
                <p className="mt-1 text-xs text-blue-700">
                  Bạn có thể chấp nhận mức giá này, đề nghị mức giá khác,
                  hoặc từ chối để gửi đề nghị mới.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={onAcceptCounter}>
                    Chấp nhận đề nghị
                  </Button>
                  <Button variant="outline" size="sm" onClick={onSuggestOtherOffer}>
                    Đề nghị mức giá khác
                  </Button>
                  <Button variant="ghost" size="sm" onClick={onRejectCounter}>
                    Từ chối đề nghị
                  </Button>
                </div>
              </div>
            )}

            {rejected && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
                <div className="text-sm font-semibold text-red-900">
                  Người bán đã từ chối giá thương lượng từ bạn.
                </div>
                <p className="mt-1 text-xs text-red-700">
                  Lịch sử thương lượng được giữ nguyên. Bạn có thể gửi
                  đề nghị mức giá khác hoặc đóng phiên này.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={onSuggestOtherOffer}>
                    Thương lượng lại
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/phones/${phone.id}`)}
                  >
                    Đóng
                  </Button>
                </div>
              </div>
            )}

            {agreed && (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-emerald-900">
                      Hai bên đã thống nhất giá
                    </div>
                    <div className="text-2xl font-bold text-emerald-700">
                      {formatVND(neg.agreedPrice)}
                    </div>
                    <div className="text-xs text-emerald-700">
                      Giá thống nhất đã được hệ thống ghi nhận.
                    </div>
                  </div>
                  <Button onClick={goCheckout}>Tạo đơn hàng</Button>
                </div>
              </div>
            )}

            {/* Nhập đề nghị */}
            {!agreed && !cancelled && (
              <form onSubmit={onSendOffer} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="offer">Đề nghị giá của bạn (₫)</label>
                    <input
                      id="offer"
                      ref={offerRef}
                      type="number"
                      min="0"
                      step="10000"
                      className="input"
                      placeholder="VD: 8900000"
                      value={offer}
                      aria-invalid={!!offerError}
                      onChange={(e) => {
                        setOffer(e.target.value);
                        if (offerError) setOfferError("");
                        setOfferWarning(null);
                      }}
                    />
                    {offerError && (
                      <p className="mt-1.5 text-xs font-medium text-red-600">
                        {offerError}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="label" htmlFor="note">Lời nhắn (tuỳ chọn)</label>
                    <input
                      id="note"
                      className="input"
                      placeholder="VD: Máy còn zin, lấy ngay"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </div>
                </div>
                {offerWarning && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-semibold">{offerWarning.message}</p>
                    <p className="mt-1">
                      Giá rao: <strong>{formatVND(phone.price)}</strong> · Giá bạn nhập:{" "}
                      <strong>{formatVND(offerWarning.price)}</strong>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={() => submitOffer(offerWarning.price)}>
                        Vẫn gửi
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setOfferWarning(null);
                          offerRef.current?.focus();
                        }}
                      >
                        Sửa lại
                      </Button>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit">Gửi đề nghị</Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setOffer(String(Math.round(phone.price * 0.95 / 10000) * 10000))}
                  >
                    Gợi ý: -5% so với giá đăng
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setOffer(
                        String(
                          reference?.usedPrice?.status === "RANGE"
                            ? Math.round(reference.usedPrice.upperPrice / 10000) * 10000
                            : phone.price
                        )
                      )
                    }
                  >
                    Gợi ý: theo cận trên dải tham khảo
                  </Button>
                </div>
              </form>
            )}

            {cancelled && (
              <div className="rounded-lg bg-gray-50 p-4 text-sm text-ink-500">
                Phiên thương lượng đã bị huỷ.
                <Link to={`/phones/${phone.id}`} className="ml-2 font-semibold text-brand-600 hover:text-brand-700">
                  Quay lại trang sản phẩm
                </Link>
              </div>
            )}

            {!cancelled && neg && neg.offers.length > 0 && !agreed && (
              <div className="mt-4">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    const res = cancelNegotiation(neg.id);
                    if (!res.ok) {
                      showToast(res.reason, "error");
                      return;
                    }
                    showToast("Đã huỷ phiên thương lượng.", "error");
                  }}
                >
                  Huỷ thương lượng
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
