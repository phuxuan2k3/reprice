/** Huy hiệu "Dữ liệu mô phỏng" dùng cho các khu vực dữ liệu phân tích. */
export default function DataBadge({ className = "", variant = "light" }) {
  return (
    <span
      className={
        variant === "dark"
          ? `inline-flex items-center gap-1.5 rounded-full border border-dashed border-white/40 bg-white/10 px-2.5 py-1 text-xs font-medium text-white/80 ${className}`
          : `inline-flex items-center gap-1.5 rounded-full border border-dashed border-gray-300 bg-gray-50 px-2.5 py-1 text-xs font-medium text-ink-500 ${className}`
      }
    >
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M4 7v10c0 2 2 3 4 3h8c2 0 4-1 4-3V7" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
      Dữ liệu mô phỏng
    </span>
  );
}
