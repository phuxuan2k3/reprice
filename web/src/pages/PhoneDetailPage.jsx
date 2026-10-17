import { useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useApiListing, useApiListings } from "../api/hooks";
import { tradeApi } from "../api/client";
import PhoneImage from "../components/PhoneImage";
import PriceCard from "../components/PriceCard";
import ReferencePricePanel from "../components/ReferencePricePanel";
import StatusBadge, { ConditionBadge } from "../components/StatusBadge";
import Button from "../components/Button";
import DataBadge from "../components/DataBadge";
import { ReviewCard, ReviewDetailModal } from "../components/ReviewSection";
import { reviews } from "../data/reviews";
import { formatAgo, formatDate, formatVND, phoneName, phoneUsage } from "../utils/format";

const LISTING_CLOSED = {
  IN_TRANSACTION: "Điện thoại này đang trong một giao dịch, tạm thời không nhận thương lượng.",
  SOLD: "Điện thoại này đã được bán.",
  PAUSED: "Người bán đang tạm ẩn tin này.",
  REMOVED: "Tin này đã bị gỡ.",
};

const VARIANTS = [
  { key: "front", label: "Mặt trước" },
  { key: "side", label: "Cạnh bên" },
  { key: "back", label: "Mặt sau" },
];

export default function PhoneDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const {
    user,
    apiSession,
    startNegotiation,
    favorites,
    isFavorite,
    toggleFavorite,
    setPendingCheckout,
    showToast,
  } = useApp();
  const navigate = useNavigate();
  const [variant, setVariant] = useState("front");
  const [shopOpen, setShopOpen] = useState(false);
  const [activeReview, setActiveReview] = useState(null);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerNote, setOfferNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { phone, reference, loading, error } = useApiListing(id, apiSession);
  const { listings } = useApiListings();

  const specRows = useMemo(() => {
    if (!phone) return [];
    return [
      ["Hãng", phone.brand],
      ["Model", phone.model],
      ["Dung lượng", phone.storage],
      ["Màu sắc", phone.colorName || "—"],
      ["Tình trạng", null],
      ["Thời gian sử dụng", phoneUsage(phone)],
      ["Tình trạng pin", phone.batteryHealth != null ? `Sức khỏe pin ${phone.batteryHealth}%` : "Chưa rõ"],
      ["Tình trạng màn hình", phone.screenCondition || "—"],
      ["Lịch sử sửa chữa", phone.repairHistory || "—"],
      ["Phụ kiện đi kèm", phone.accessories || "—"],
      ["Bảo hành", phone.warranty || "—"],
      ["Khu vực người bán", phone.region],
      ["Thời gian đăng", formatAgo(phone.listedMinutesAgo)],
    ];
  }, [phone]);

  const related = useMemo(() => {
    if (!phone) return [];
    return listings
      .filter(
        (p) =>
          p.brand === phone.brand &&
          p.id !== phone.id &&
          p.listingStatus === "ACTIVE"
      )
      .slice(0, 3);
  }, [listings, phone]);

  const sellerListings = useMemo(() => {
    if (!phone) return [];
    return listings.filter(
      (p) => p.seller.id === phone.seller.id && p.listingStatus === "ACTIVE"
    );
  }, [listings, phone]);

  if (loading && !phone) {
    return <div className="container-x py-8 text-sm text-ink-500">Đang tải thông tin điện thoại…</div>;
  }
  if (error?.status === 404) return <Navigate to="/phones" replace />;
  if (error || !phone) {
    return (
      <div className="container-x py-8">
        <p className="text-sm text-red-600">{error?.message || "Không tải được tin đăng."}</p>
        <Link to="/phones" className="mt-3 inline-block text-sm font-medium text-brand-600">Quay lại danh sách</Link>
      </div>
    );
  }

  const sendOffer = async (e) => {
    e.preventDefault();
    const amount = Number(offerAmount);
    if (!amount) {
      showToast("Nhập mức giá muốn đề nghị.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const neg = await tradeApi.startNegotiation(phone.id, amount, offerNote.trim());
      showToast("Đã gửi đề nghị giá cho người bán.");
      navigate(`/negotiations/${neg.id}`);
    } catch (err) {
      if (err.details?.negotiationId) {
        showToast(err.message, "error");
        navigate(`/negotiations/${err.details.negotiationId}`);
      } else {
        showToast(err.message, "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fav = isFavorite(phone.id);
  // Khách vẫn thấy nút (bấm sẽ được mời đăng nhập); người đã đăng nhập theo allowedActions của backend.
  const isOwner = phone.fromApi && reference?.viewerRole === "SELLER";
  const canTrade = phone.listingStatus === "ACTIVE" && !isOwner && (!user || !phone.fromApi || phone.allowedActions.includes("NEGOTIATE"));

  /**
   * Khách bấm hành động cần đăng nhập -> màn hình Đăng nhập với thông báo.
   * Ghi lại ý định (mua ngay / thương lượng) vào URL để sau khi đăng nhập tiếp
   * tục đúng hành động thay vì bắt người dùng bấm lại.
   */
  const requireLogin = (action = null) => {
    const suffix = action ? `&action=${action}` : "";
    navigate(
      `/login?message=login-required&next=${encodeURIComponent(
        location.pathname
      )}${suffix}`
    );
  };

  const onFavorite = () => {
    if (!user) {
      requireLogin();
      return;
    }
    const added = toggleFavorite(phone.id);
    showToast(
      added
        ? "Đã thêm vào sản phẩm yêu thích."
        : "Đã xóa khỏi sản phẩm yêu thích."
    );
  };

  const onNegotiate = () => {
    if (!user) {
      requireLogin("negotiate");
      return;
    }
    if (user.role !== "buyer") {
      showToast("Chức năng thương lượng dành cho Người mua.", "error");
      return;
    }
    if (phone.fromApi) {
      setOfferAmount("");
      setOfferNote("");
      setOfferOpen(true);
      return;
    }
    const negId = startNegotiation(phone.id);
    if (negId) navigate(`/negotiation/${phone.id}`);
  };

  const onBuyNow = () => {
    if (!user) {
      requireLogin("buy");
      return;
    }
    if (user.role !== "buyer") {
      showToast("Chức năng mua hàng dành cho Người mua.", "error");
      return;
    }
    if (phone.fromApi) {
      setSubmitting(true);
      tradeApi
        .buyNow(phone.id, phone.price)
        .then((order) => {
          showToast(`Đã tạo đơn ${order.code}. Nhập thông tin nhận hàng và thanh toán trong 24 giờ.`);
          navigate(`/orders/${order.id}`);
        })
        .catch((err) => showToast(err.message, "error"))
        .finally(() => setSubmitting(false));
      return;
    }
    setPendingCheckout({
      phoneId: phone.id,
      price: phone.price,
      negotiationId: null,
    });
    navigate("/orders/create");
  };

  const onReviewClick = (review) => {
    if (!user) {
      showToast("Bạn cần đăng nhập để xem chi tiết đánh giá", "error");
      navigate(`/login?message=login-required&next=${encodeURIComponent(location.pathname)}`);
      return;
    }
    setActiveReview(review);
  };

  return (
    <div className="container-x py-8">
      {/* Breadcrumb + quay lại */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="text-sm text-ink-500">
          <Link to="/" className="hover:text-brand-600">Trang chủ</Link>
          <span className="mx-2">/</span>
          <Link to="/phones" className="hover:text-brand-600">Tìm điện thoại</Link>
          <span className="mx-2">/</span>
          <span className="text-ink-900">{phoneName(phone)}</span>
        </nav>
        <Link
          to="/phones"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3.5 py-2 text-sm font-medium text-ink-700 transition hover:bg-gray-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Quay lại danh sách
        </Link>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        {/* ---------------- A. Khu vực hình ảnh ---------------- */}
        <div>
          <div className="card p-6">
            <div className="rounded-xl bg-gradient-to-br from-gray-50 to-gray-100">
              <PhoneImage phone={phone} variant={variant} className="mx-auto h-auto w-full max-w-xs" />
            </div>
            {/* Thumbnail */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              {VARIANTS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setVariant(v.key)}
                  aria-pressed={variant === v.key}
                  className={`rounded-xl border-2 p-2 transition ${
                    variant === v.key
                      ? "border-brand-500 bg-brand-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <PhoneImage phone={phone} variant={v.key} className="mx-auto h-24 w-auto" />
                  <span className="mt-1 block text-center text-xs font-medium text-ink-700">
                    {v.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Thông số kỹ thuật */}
          <div className="card mt-4 divide-y divide-gray-100">
            <div className="px-5 py-4">
              <h2 className="font-semibold text-ink-900">Thông số sản phẩm</h2>
            </div>
            {specRows.map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 px-5 py-3.5">
                <span className="text-sm text-ink-500">{label}</span>
                {label === "Tình trạng" ? (
                  <ConditionBadge condition={phone.condition} />
                ) : (
                  <span className="text-right text-sm font-medium text-ink-900">
                    {value}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ---------------- Thông tin giá & hành động ---------------- */}
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="text-2xl font-bold text-ink-900 md:text-3xl">
              {phoneName(phone)} <span className="text-ink-500">{phone.storage}</span>
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-ink-500">
              <span>Mã tin: {phone.id.slice(0, 8)}</span>
              <span aria-hidden>·</span>
              <span>{phone.region}</span>
              <span aria-hidden>·</span>
              <span>Đăng {formatAgo(phone.listedMinutesAgo)}</span>
            </div>
          </div>

          {/* Giá người bán rao */}
          <div className="card p-5">
            <div className="text-sm font-medium text-ink-500">
              Giá người bán rao
            </div>
            <div className="mt-1 text-3xl font-bold tracking-tight text-brand-600">
              {formatVND(phone.price)}
            </div>
          </div>

          {/* Giá tham khảo RePrice (card nổi bật riêng) */}
          <ReferencePricePanel
            phone={phone}
            reference={reference}
            role={reference?.viewerRole === "SELLER" ? "seller" : "buyer"}
          />

          {/* Hành động */}
          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              variant={fav ? "outline" : "outline"}
              onClick={onFavorite}
              className="flex-1 border-brand-500 text-brand-600 hover:bg-brand-50"
            >
              {fav ? "★ Đã yêu thích" : "☆ Thêm vào yêu thích"}
            </Button>
            {canTrade && (
              <>
                <Button size="lg" onClick={onNegotiate} className="flex-1">
                  Thương lượng
                </Button>
                <Button size="lg" onClick={onBuyNow} disabled={submitting} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                  Mua ngay
                </Button>
              </>
            )}
          </div>
          {isOwner && (
            <div className="rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm">
              Đây là tin của bạn.{" "}
              <Link to="/seller/listings" className="font-semibold text-brand-600 hover:underline">Quản lý tin đăng</Link>
            </div>
          )}
          {!isOwner && phone.listingStatus !== "ACTIVE" && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-ink-600">
              {LISTING_CLOSED[phone.listingStatus] || "Điện thoại này hiện không mở bán."}
            </div>
          )}
          <p className="text-xs text-ink-400">
            Giá tham khảo chỉ mang tính gợi ý. Giá giao dịch thực tế do hai bên
            thống nhất qua thương lượng.
          </p>

          {/* Mô tả */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-ink-900">Mô tả từ người bán</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-700">{phone.description}</p>
          </div>

          {/* Người bán */}
          <div className="card p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-600">
                {phone.seller.name.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="font-semibold text-ink-900">{phone.seller.name}</div>
                <div className="flex flex-wrap items-center gap-1.5 text-sm text-ink-500">
                  <svg className="h-3.5 w-3.5 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17l-6.2 3.9 1.6-7L2 9.2l7.1-.6z" />
                  </svg>
                  {phone.seller.rating}/5 · {phone.seller.deals} đánh giá · Tham gia từ {formatDate(phone.seller.joined)}
                </div>
                <div className="mt-0.5 text-sm text-ink-500">Khu vực: {phone.region}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShopOpen(true)}>
                Xem shop
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- Đánh giá ---------------- */}
      <section className="mt-12">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-bold text-ink-900">
            Đánh giá về người bán và sản phẩm
          </h2>
          <DataBadge />
        </div>
        <p className="mt-1 text-sm text-ink-500">
          Mở chi tiết đánh giá cần đăng nhập. Đây là dữ liệu mô phỏng.
        </p>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.slice(0, 3).map((review) => (
            <ReviewCard key={review.id} review={review} onClick={() => onReviewClick(review)} />
          ))}
        </div>
      </section>

      {/* ---------------- Sản phẩm tương tự ---------------- */}
      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-ink-900">
            {phone.brand} tương tự đang rao bán
          </h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p) => (
              <Link
                key={p.id}
                to={`/phones/${p.id}`}
                className="card group p-4 transition hover:shadow-lift"
              >
                <PhoneImage phone={p} className="mx-auto h-40 w-auto" />
                <div className="mt-3 text-center">
                  <div className="font-semibold text-ink-900 group-hover:text-brand-600">
                    {phoneName(p)}
                  </div>
                  <div className="mt-1 flex items-center justify-center gap-2">
                    <span className="text-sm font-bold text-brand-600">{formatVND(p.price)}</span>
                    <ConditionBadge condition={p.condition} />
                  </div>
                  <div className="mt-1 text-xs text-ink-500">{p.region} · {formatAgo(p.listedMinutesAgo)}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Modal xem shop */}
      {shopOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Trang người bán ${phone.seller.name}`}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4"
          onClick={() => setShopOpen(false)}
        >
          <div
            className="card mx-auto my-8 w-full max-w-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-600">
                  {phone.seller.name.charAt(0)}
                </div>
                <div>
                  <div className="font-semibold text-ink-900">{phone.seller.name}</div>
                  <div className="flex items-center gap-1 text-sm text-ink-500">
                    <svg className="h-3.5 w-3.5 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17l-6.2 3.9 1.6-7L2 9.2l7.1-.6z" />
                    </svg>
                    {phone.seller.rating}/5 · {phone.seller.deals} đánh giá
                  </div>
                  <div className="text-xs text-ink-500">
                    Tham gia từ {formatDate(phone.seller.joined)} · Khu vực {phone.region}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShopOpen(false)}
                aria-label="Đóng"
                className="rounded-lg p-2 text-ink-400 hover:bg-gray-100"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="mt-5 border-t border-gray-100 pt-4">
              <div className="text-sm font-semibold text-ink-900">
                Sản phẩm đang rao bán ({sellerListings.length})
              </div>
              {sellerListings.length === 0 ? (
                <p className="mt-3 text-sm text-ink-500">Người bán chưa có sản phẩm nào đang hoạt động.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {sellerListings.map((p) => (
                    <li key={p.id}>
                      <Link
                        to={`/phones/${p.id}`}
                        onClick={() => setShopOpen(false)}
                        className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3.5 py-2.5 transition hover:border-brand-300 hover:bg-brand-50"
                      >
                        <span className="text-sm font-medium text-ink-900">
                          {phoneName(p)} <span className="text-ink-500">{p.storage}</span>
                        </span>
                        <span className="text-sm font-bold text-brand-600">{formatVND(p.price)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal đề nghị giá (backend) */}
      {offerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Đề nghị giá"
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4"
          onClick={() => !submitting && setOfferOpen(false)}
        >
          <form className="card mx-auto my-16 w-full max-w-md p-6" onClick={(e) => e.stopPropagation()} onSubmit={sendOffer}>
            <h2 className="text-lg font-bold text-ink-900">Đề nghị giá</h2>
            <p className="mt-1 text-sm text-ink-500">
              {phoneName(phone)} {phone.storage} · giá rao {formatVND(phone.price)}
            </p>
            <label className="label mt-4" htmlFor="offer-amount">Mức giá bạn đề nghị (₫)</label>
            <input
              id="offer-amount"
              className="input"
              inputMode="numeric"
              autoFocus
              value={offerAmount ? Number(offerAmount).toLocaleString("vi-VN") : ""}
              onChange={(e) => setOfferAmount(e.target.value.replace(/\D/g, ""))}
              placeholder="Ví dụ 9.000.000"
            />
            <label className="label mt-3" htmlFor="offer-note">Ghi chú cho người bán (không bắt buộc)</label>
            <input id="offer-note" className="input" value={offerNote} onChange={(e) => setOfferNote(e.target.value)} />
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOfferOpen(false)} disabled={submitting}>Hủy</Button>
              <Button type="submit" disabled={submitting}>{submitting ? "Đang gửi…" : "Gửi đề nghị"}</Button>
            </div>
          </form>
        </div>
      )}

      {/* Modal chi tiết đánh giá */}
      {activeReview && (
        <ReviewDetailModal review={activeReview} onClose={() => setActiveReview(null)} />
      )}
    </div>
  );
}
