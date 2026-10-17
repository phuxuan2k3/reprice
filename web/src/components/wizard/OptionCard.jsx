/** Thẻ lựa chọn dùng trong quy trình đăng bán (single-select). */
export default function OptionCard({ selected, title, desc, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`w-full rounded-xl border-2 p-4 text-left transition ${
        selected
          ? "border-brand-500 bg-brand-50 shadow-sm"
          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
      }`}
    >
      <span
        className={`block font-semibold ${
          selected ? "text-brand-600" : "text-ink-900"
        }`}
      >
        {title}
      </span>
      {desc && (
        <span className="mt-1 block text-sm text-ink-500">{desc}</span>
      )}
    </button>
  );
}
