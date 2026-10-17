/** Card chỉ số dùng ở Dashboard. */
export default function StatCard({ label, value, sub, accent = "red" }) {
  const accents = {
    red: "bg-brand-50 text-brand-600",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    blue: "bg-blue-50 text-blue-600",
    purple: "bg-purple-50 text-purple-600",
    gray: "bg-gray-100 text-ink-700",
  };
  return (
    <div className="card p-5">
      <div className="text-sm font-medium text-ink-500">{label}</div>
      <div className={`mt-3 inline-block rounded-lg px-3 py-1 text-2xl font-bold tabular-nums ${accents[accent]}`}>
        {value}
      </div>
      {sub && <div className="mt-2 text-xs text-ink-500">{sub}</div>}
    </div>
  );
}
