import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useApiListings, usePublicReferences } from "../api/hooks";
import { sameRegion } from "../api/adapters";
import ProductCard from "../components/ProductCard";
import PhoneImage from "../components/PhoneImage";
import DataBadge from "../components/DataBadge";
import RegionPicker from "../components/RegionPicker";
import ReviewSection from "../components/ReviewSection";
import { formatVND, phoneName } from "../utils/format";

const BENEFITS = [
  {
    icon: (
      <path d="M12 22s8-3.6 8-10V5l-8-3-8 3v7c0 6.4 8 10 8 10z" />
    ),
    label: "Giá tham chiếu minh bạch",
  },
  {
    icon: (
      <>
        <path d="M12 2a4 4 0 0 0-4 4v3H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V6a4 4 0 0 0-4-4z" />
        <path d="M9 12v2.5M15 12v2.5" />
      </>
    ),
    label: "Người bán uy tín",
  },
  {
    icon: (
      <>
        <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2z" />
      </>
    ),
    label: "Tìm kiếm nhanh chóng",
  },
];

/** Minh họa điện thoại trong Hero — hai máy xếp hàng ngang, gọn và cân đối. */
function HeroArt({ phones }) {
  const main = phones[0];
  const sub = phones[1];
  if (!main) return null;
  return (
    <div
      className="relative hidden shrink-0 items-center justify-center gap-3 md:flex lg:gap-4"
      aria-hidden="true"
    >
      <div className="pointer-events-none absolute right-4 top-0 h-40 w-40 rounded-full bg-brand-100 blur-2xl" />
      <div className="pointer-events-none absolute bottom-0 left-6 h-32 w-32 rounded-full bg-red-100 blur-2xl" />
      <div className="relative w-36 rotate-3 rounded-3xl bg-white p-2.5 shadow-lift lg:w-40">
        <PhoneImage phone={main} className="w-full" />
      </div>
      {sub && (
        <div className="relative w-28 -rotate-3 rounded-3xl bg-white p-2 shadow-lift lg:w-32">
          <PhoneImage phone={sub} className="w-full" />
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const { region } = useApp();
  const { listings } = useApiListings();
  const publicReferenceList = usePublicReferences(listings);
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [scope, setScope] = useState("region");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    document.title = "RePrice — Mua bán điện thoại cũ, Giá tham khảo rõ ràng";
  }, []);

  const heroPhones = useMemo(
    () => listings.slice(0, 2),
    [listings]
  );

  const activeListings = useMemo(
    () => listings.filter((p) => p.listingStatus === "ACTIVE"),
    [listings]
  );

  const inRegion = useMemo(
    () => activeListings.filter((p) => sameRegion(p.region, region)),
    [activeListings, region]
  );

  const featured =
    scope === "region" ? inRegion.slice(0, 6) : activeListings.slice(0, 6);

  const onSearch = (e) => {
    e.preventDefault();
    const q = keyword.trim();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (region) params.set("region", region);
    navigate(q || region ? `/phones?${params.toString()}` : "/phones");
  };

  /* Lần đầu truy cập: hiển thị màn hình chọn khu vực trước khi vào trang chủ */
  if (!region) {
    return (
      <div className="bg-gradient-to-br from-brand-50 via-red-50 to-white">
        <RegionPicker />
      </div>
    );
  }

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-50 via-red-50 to-white">
        <div className="container-x grid items-center gap-8 py-10 md:grid-cols-[minmax(0,1fr)_auto] md:gap-8 md:py-12 lg:gap-12 lg:py-14">
          <div className="min-w-0">
            <h1 className="text-5xl font-extrabold tracking-tight text-ink-900 md:text-6xl">
              Re<span className="text-brand-500">Price</span>
            </h1>
            <p className="mt-4 text-xl font-bold text-brand-600 md:text-2xl">
              Giá tham chiếu điện thoại – mua bán dễ dàng hơn!
            </p>
            <p className="mt-4 max-w-xl leading-relaxed text-ink-500">
              RePrice giúp bạn tìm kiếm, so sánh và tham khảo giá điện thoại
              từ nhiều người bán uy tín, để bạn luôn mua được sản phẩm với mức
              giá hợp lý nhất.
            </p>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 lg:mt-7 lg:gap-x-8">
              {BENEFITS.map((b) => (
                <div key={b.label} className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10 text-brand-600">
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {b.icon}
                    </svg>
                  </span>
                  <span className="text-sm font-semibold text-ink-700">
                    {b.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <HeroArt phones={heroPhones} />
        </div>
      </section>

      {/* Thanh khu vực + tìm kiếm */}
      <section className="relative z-10 -mt-2 px-0">
        <div className="container-x">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-lift">
            <div className="grid items-center gap-4 md:grid-cols-[auto_1fr_auto]">
              <div className="flex items-center gap-3 px-1">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </span>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-ink-400">
                    Khu vực
                  </div>
                  <div className="text-sm font-semibold text-ink-900">
                    {region}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-600 transition hover:bg-brand-50"
                >
                  Đổi
                </button>
              </div>

              <form onSubmit={onSearch} className="flex gap-2">
                <input
                  type="search"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="Tìm theo tên điện thoại, dòng máy hoặc model..."
                  className="input flex-1"
                  aria-label="Tìm điện thoại"
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
                >
                  Tìm kiếm
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Sản phẩm nổi bật */}
      <section className="py-12">
        <div className="container-x">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-extrabold text-ink-900">
                Sản phẩm nổi bật
              </h2>
              <DataBadge />
            </div>
            <Link
              to="/phones"
              className="text-sm font-semibold text-brand-600 hover:underline"
            >
              Xem tất cả
            </Link>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-gray-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setScope("region")}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  scope === "region"
                    ? "bg-brand-500 text-white shadow-sm"
                    : "text-ink-500 hover:text-brand-600"
                }`}
              >
                Khu vực đã chọn
              </button>
              <button
                type="button"
                onClick={() => setScope("all")}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  scope === "all"
                    ? "bg-brand-500 text-white shadow-sm"
                    : "text-ink-500 hover:text-brand-600"
                }`}
              >
                Toàn quốc
              </button>
            </div>
            <span className="text-xs text-ink-400">
              {scope === "region"
                ? `Đang hiển thị tin đăng tại ${region}`
                : "Đang hiển thị tin đăng trên toàn quốc"}
            </span>
          </div>

          {featured.length === 0 ? (
            <div className="card mt-8 p-10 text-center">
              <p className="text-sm text-ink-500">
                Chưa có điện thoại nào đang rao bán tại khu vực{" "}
                <strong className="text-ink-700">{region}</strong>.
              </p>
              <button
                type="button"
                onClick={() => setScope("all")}
                className="mt-4 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
              >
                Xem toàn quốc
              </button>
            </div>
          ) : (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((phone) => (
                <ProductCard key={phone.id} phone={phone} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Giá tham khảo điện thoại cũ (công khai) */}
      {publicReferenceList.length > 0 && (
        <section className="border-t border-gray-100 bg-white py-12">
          <div className="container-x">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-extrabold text-ink-900">
                  Giá tham khảo điện thoại cũ
                </h2>
                <DataBadge />
              </div>
              <Link
                to="/phones"
                className="text-sm font-semibold text-brand-600 hover:underline"
              >
                Xem tất cả máy
              </Link>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-ink-500">
              Dải giá minh họa (P10–P90) tính từ dữ liệu giao dịch mô phỏng đủ
              điều kiện — chưa phải kết quả từ giao dịch thật đã xác minh. Bấm
              vào từng máy để xem chi tiết phương pháp và dữ liệu so sánh.
            </p>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {publicReferenceList.map(({ phone, reference }) => {
                const used = reference.usedPrice;
                return (
                  <Link
                    key={phone.id}
                    to={`/phones/${phone.id}`}
                    className="card flex flex-col p-4 transition hover:shadow-lift"
                  >
                    <div className="flex items-center justify-center rounded-xl bg-gray-50 p-3">
                      <PhoneImage phone={phone} className="h-28" />
                    </div>
                    <div className="mt-3 font-semibold text-ink-900">
                      {phoneName(phone)}
                    </div>
                    <div className="text-xs text-ink-500">
                      {phone.brand} · {phone.storage}
                    </div>
                    <div className="mt-3 text-xs font-medium uppercase tracking-wide text-ink-400">
                      Giá minh họa
                    </div>
                    <div className="text-lg font-bold text-brand-600">
                      {formatVND(used.lowerPrice)} – {formatVND(used.upperPrice)}
                    </div>
                    <div className="mt-1 text-xs text-ink-400">
                      {used.count} giao dịch đủ điều kiện
                    </div>
                    <span className="mt-3 text-sm font-semibold text-brand-600">
                      Xem chi tiết giá tham khảo →
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Đánh giá từ người dùng */}
      <ReviewSection />

      {/* CTA đăng bán */}
      <section className="mt-4 bg-gradient-to-r from-brand-600 to-brand-500">
        <div className="container-x flex flex-col items-center gap-5 py-12 text-center">
          <h2 className="text-2xl font-extrabold text-white md:text-3xl">
            Bạn có điện thoại cũ cần bán?
          </h2>
          <p className="max-w-lg text-sm leading-relaxed text-white/85">
            Đăng bán nhanh chóng, tham khảo giá hợp lý và kết nối trực tiếp
            với người mua tại khu vực của bạn.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to="/seller/create-listing"
              className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-brand-600 shadow-sm transition hover:bg-brand-50"
            >
              Đăng bán ngay
            </Link>
            <Link
              to="/phones"
              className="rounded-lg border border-white/50 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Tìm điện thoại cũ
            </Link>
          </div>
        </div>
      </section>

      {/* Hộp thoại đổi khu vực */}
      {pickerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Đổi khu vực"
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4"
          onClick={() => setPickerOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <RegionPicker onClose={() => setPickerOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
