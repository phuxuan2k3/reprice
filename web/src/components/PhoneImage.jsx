/** Hình minh họa điện thoại (SVG) — tự vẽ theo màu hãng, không cần ảnh ngoài. */
import { phoneName, phoneUsage } from "../utils/format";
export default function PhoneImage({ phone, className = "", variant = "front" }) {
  // Tin có ảnh thật (tải lên backend): mặt trước = ảnh bìa, cạnh / sau = ảnh thứ 2, 3 nếu có.
  const photo = phone.photoUrls?.[{ front: 0, side: 1, back: 2 }[variant] ?? 0];
  if (photo) {
    return <img src={photo} alt={`${phoneName(phone)} — ảnh thực tế`} className={`${className} object-contain`} loading="lazy" />;
  }
  const gid = `grad-${phone.id.replace(/[^a-zA-Z0-9]/g, "")}-${variant}`;
  const batteryWidth = Math.max(0, Math.min(100, phone.batteryHealth || 0));
  const duplicated =
    !!phone.brand &&
    phone.model.toLowerCase().startsWith(phone.brand.toLowerCase());

  /* Thân máy theo góc nhìn: mặt trước (màn hình), cạnh bên, mặt sau. */
  if (variant === "side") {
    return (
      <svg viewBox="0 0 200 400" className={className} role="img" aria-label={`${phoneName(phone)} — cạnh bên`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={phone.color || "#E53935"} />
            <stop offset="100%" stopColor={phone.colorDark || "#111827"} />
          </linearGradient>
        </defs>
        <rect x="60" y="4" width="80" height="392" rx="26" fill="#0B0F19" />
        <rect x="66" y="12" width="68" height="376" rx="22" fill={`url(#${gid})`} />
        <rect x="78" y="60" width="44" height="4" rx="2" fill="#ffffff" opacity="0.5" />
        <rect x="78" y="76" width="44" height="4" rx="2" fill="#ffffff" opacity="0.5" />
        <rect x="78" y="92" width="44" height="4" rx="2" fill="#ffffff" opacity="0.5" />
        <text x="100" y="240" textAnchor="middle" fill="#ffffff" opacity="0.8" fontSize="12" fontFamily="Inter, sans-serif">
          {phone.storage}
        </text>
      </svg>
    );
  }

  if (variant === "back") {
    return (
      <svg viewBox="0 0 200 400" className={className} role="img" aria-label={`${phoneName(phone)} — mặt sau`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={phone.color || "#E53935"} />
            <stop offset="100%" stopColor={phone.colorDark || "#111827"} />
          </linearGradient>
        </defs>
        <rect x="8" y="4" width="184" height="392" rx="30" fill="#0B0F19" />
        <rect x="16" y="12" width="168" height="376" rx="24" fill={`url(#${gid})`} />
        {/* camera module góc trái trên */}
        <rect x="34" y="36" width="52" height="86" rx="16" fill="#0B0F19" opacity="0.85" />
        <circle cx="60" cy="60" r="14" fill="#1F2937" />
        <circle cx="60" cy="60" r="10" fill="#0B0F19" />
        <circle cx="60" cy="60" r="4" fill="#374151" />
        <circle cx="60" cy="96" r="14" fill="#1F2937" />
        <circle cx="60" cy="96" r="10" fill="#0B0F19" />
        <circle cx="60" cy="96" r="4" fill="#374151" />
        <circle cx="60" cy="132" r="5" fill="#374151" />
        <text x="100" y="220" textAnchor="middle" fill="#ffffff" opacity="0.9" fontSize="16" fontWeight="700" fontFamily="Inter, sans-serif">
          {duplicated ? phoneName(phone) : phone.model}
        </text>
        <text x="100" y="246" textAnchor="middle" fill="#ffffff" opacity="0.7" fontSize="12" fontFamily="Inter, sans-serif">
          {phone.storage}
        </text>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 200 400" className={className} role="img" aria-label={phoneName(phone)}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={phone.color || "#E53935"} />
          <stop offset="100%" stopColor={phone.colorDark || "#111827"} />
        </linearGradient>
      </defs>
      {/* thân máy */}
      <rect x="8" y="4" width="184" height="392" rx="30" fill="#0B0F19" />
      <rect x="16" y="12" width="168" height="376" rx="24" fill={`url(#${gid})`} />
      {/* camera */}
      <circle cx="100" cy="30" r="5" fill="#000000" opacity="0.75" />
      <circle cx="100" cy="30" r="2" fill="#374151" />
      {/* tên hãng / model / dung lượng */}
      {/* Nếu model đã chứa tên hãng (VD: "Xiaomi 14") thì chỉ hiện 1 dòng, tránh lặp */}
      {!duplicated && (
        <text x="100" y="178" textAnchor="middle" fill="#ffffff" fontSize="19" fontWeight="700" fontFamily="Inter, sans-serif">
          {phone.brand}
        </text>
      )}
      <text
        x="100"
        y={duplicated ? "190" : "204"}
        textAnchor="middle"
        fill="#ffffff"
        opacity="0.92"
        fontSize={duplicated ? "18" : "17"}
        fontWeight="600"
        fontFamily="Inter, sans-serif"
      >
        {duplicated ? phoneName(phone) : phone.model}
      </text>
      <text x="100" y="226" textAnchor="middle" fill="#ffffff" opacity="0.75" fontSize="13" fontFamily="Inter, sans-serif">
        {phone.storage}
      </text>
      {/* thanh pin */}
      <rect x="58" y="258" width="84" height="10" rx="5" fill="#ffffff" opacity="0.25" />
      <rect x="58" y="258" width={(84 * batteryWidth) / 100} height="10" rx="5" fill="#ffffff" opacity="0.92" />
      <text x="100" y="290" textAnchor="middle" fill="#ffffff" opacity="0.85" fontSize="11" fontFamily="Inter, sans-serif">
        Pin {phone.batteryHealth}%
      </text>
      <text x="100" y="312" textAnchor="middle" fill="#ffffff" opacity="0.55" fontSize="10" fontFamily="Inter, sans-serif">
        {phone.condition} · {phoneUsage(phone)}
      </text>
    </svg>
  );
}
