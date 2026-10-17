import { useEffect } from "react";

/**
 * Modal hướng dẫn — đè lên câu hỏi hiện tại, không điều hướng.
 * Đóng hướng dẫn sẽ quay về đúng câu hỏi, giữ nguyên dữ liệu đã nhập.
 */
export default function HelpModal({ title, children, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hướng dẫn"
            className="rounded-lg p-2 text-ink-400 hover:bg-gray-100"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="mt-3 text-sm leading-relaxed text-ink-700">
          {children}
        </div>
        <div className="mt-5">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
