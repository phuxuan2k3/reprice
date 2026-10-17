import { formatVND, deltaPercent } from "../utils/format";
import StatusBadge from "./StatusBadge";

/**
 * Card giá: hiển thị giá đăng bán và so sánh với giá tham khảo (nếu có).
 */
export default function PriceCard({ price, stats }) {
  const delta = stats?.has ? deltaPercent(price, stats.avg) : null;
  return (
    <div className="card p-5">
      <div className="text-sm font-medium text-ink-500">Giá đăng bán</div>
      <div className="mt-1 text-3xl font-bold tracking-tight text-ink-900">
        {formatVND(price)}
      </div>
      {stats?.has && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          <span className="text-sm text-ink-500">
            Giá tham khảo:{" "}
            <span className="font-semibold text-ink-900">
              {formatVND(stats.avg)}
            </span>
          </span>
          {delta !== null &&
            (delta <= 0 ? (
              <StatusBadge tone="green">
                Thấp hơn tham khảo {Math.abs(delta)}%
              </StatusBadge>
            ) : (
              <StatusBadge tone="amber">
                Cao hơn tham khảo {delta}%
              </StatusBadge>
            ))}
        </div>
      )}
    </div>
  );
}
