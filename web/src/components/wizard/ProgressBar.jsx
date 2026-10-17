/** Thanh tiến trình 5 bước của quy trình đăng bán. */
const STEPS = [
  "Chọn điện thoại",
  "Tình trạng máy",
  "Ảnh và thông tin đi kèm",
  "Giá bán và liên hệ",
  "Xem lại và đăng tin",
];

export default function ProgressBar({ currentStep }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Tiến trình đăng bán">
      {STEPS.map((label, idx) => {
        const done = idx < currentStep;
        const active = idx === currentStep;
        return (
          <li
            key={label}
            className="flex flex-1 items-center gap-1.5"
            aria-current={active ? "step" : undefined}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                done
                  ? "bg-brand-500 text-white"
                  : active
                    ? "bg-brand-500 text-white ring-4 ring-brand-100"
                    : "bg-gray-100 text-ink-400"
              }`}
            >
              {done ? (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : (
                idx + 1
              )}
            </span>
            <span
              className={`hidden text-xs font-medium sm:block ${
                active
                  ? "text-brand-600"
                  : done
                    ? "text-ink-700"
                    : "text-ink-400"
              }`}
            >
              {label}
            </span>
            {idx < STEPS.length - 1 && (
              <span
                aria-hidden
                className={`h-0.5 flex-1 rounded ${
                  done ? "bg-brand-500" : "bg-gray-200"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
