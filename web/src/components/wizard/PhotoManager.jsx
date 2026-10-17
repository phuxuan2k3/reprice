import { useRef, useState } from "react";
import Button from "../Button";

/**
 * Quản lý ảnh tải lên.
 * - Chọn nhiều ảnh từ thiết bị hoặc CHỤP TRỰC TIẾP bằng camera (nếu thiết bị
 *   hỗ trợ): nút "Chụp ảnh" dùng `capture="environment"` để ưu tiên camera sau.
 * - Xem thu nhỏ, chọn ảnh bìa, sắp xếp, xóa.
 * - Ảnh sai định dạng hoặc > 8MB bị báo lỗi (giới hạn của bản demo).
 * - object URL chỉ tồn tại trong phiên — không lưu bền vững nội dung ảnh.
 */

const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB

let photoSeq = 0;

function toPhoto(file) {
  photoSeq += 1;
  const isImage = String(file.type || "").startsWith("image/");
  const tooLarge = file.size > MAX_PHOTO_BYTES;
  let status = "ready";
  let reason = null;
  if (!isImage) {
    status = "error";
    reason = "Không phải tệp ảnh";
  } else if (tooLarge) {
    status = "error";
    reason = `Ảnh lớn hơn 8MB`;
  }
  return {
    id: `photo-${photoSeq}-${Date.now().toString(36)}`,
    name: file.name || "ảnh",
    size: file.size,
    objectUrl: status === "ready" ? URL.createObjectURL(file) : null,
    file,
    status,
    reason,
    cover: false,
  };
}

export default function PhotoManager({ photos, onChange }) {
  const inputRef = useRef(null);
  const cameraRef = useRef(null);
  const [notice, setNotice] = useState("");

  const addFiles = (files) => {
    const list = Array.from(files || []);
    if (list.length === 0) return;
    const added = list.map(toPhoto);
    const failed = added.filter((p) => p.status === "error");
    setNotice(
      failed.length
        ? `${failed.length} ảnh không hợp lệ (${[...new Set(failed.map((f) => f.reason))]
            .join(", ")}). Các ảnh hợp lệ vẫn được giữ.`
        : ""
    );
    onChange([...photos, ...added]);
  };

  const removePhoto = (id) => {
    const target = photos.find((p) => p.id === id);
    if (target?.objectUrl) URL.revokeObjectURL(target.objectUrl);
    let next = photos.filter((p) => p.id !== id);
    // Nếu ảnh bìa bị xóa, đặt ảnh đầu tiên làm ảnh bìa
    if (target?.cover && next.length > 0 && !next.some((p) => p.cover)) {
      next = next.map((p, i) => (i === 0 ? { ...p, cover: true } : p));
    }
    onChange(next);
  };

  const setCover = (id) => {
    onChange(photos.map((p) => ({ ...p, cover: p.id === id })));
  };

  const move = (id, dir) => {
    const idx = photos.findIndex((p) => p.id === id);
    const nextIdx = idx + dir;
    if (idx < 0 || nextIdx < 0 || nextIdx >= photos.length) return;
    const next = [...photos];
    [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
    onChange(next);
  };

  /** Chọn/chụp lại ảnh bị lỗi mà không cần xóa thủ công trước. */
  const retry = (id) => {
    const target = photos.find((p) => p.id === id);
    if (target?.file && String(target.file.type || "").startsWith("image/") &&
        target.file.size <= MAX_PHOTO_BYTES) {
      onChange(
        photos.map((p) =>
          p.id === id
            ? { ...p, status: "ready", reason: null, objectUrl: URL.createObjectURL(p.file) }
            : p
        )
      );
      return;
    }
    // Tệp không thể dùng lại được -> chọn tệp khác.
    removePhoto(id);
    inputRef.current?.click();
  };

  const formatSize = (bytes) =>
    bytes > 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {/* Chụp trực tiếp: ưu tiên camera sau trên thiết bị hỗ trợ. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center transition hover:border-brand-400 hover:bg-brand-50"
        >
          <svg className="h-8 w-8 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 16l4.6-4.6a2 2 0 0 1 2.8 0L16 16m-8-6h.01M20 16l-3.2-3.2a2 2 0 0 0-2.8 0L8 18" />
            <rect x="3" y="3" width="18" height="18" rx="3" />
          </svg>
          <span className="text-sm font-semibold text-ink-900">
            Chọn ảnh từ thiết bị
          </span>
          <span className="text-xs text-ink-500">
            Chọn được nhiều ảnh. Ảnh sai định dạng hoặc lớn hơn 8MB sẽ báo lỗi.
          </span>
        </button>

        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-200 bg-brand-50/60 px-4 py-8 text-center transition hover:border-brand-400 hover:bg-brand-50"
        >
          <svg className="h-8 w-8 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1-1.6A1 1 0 0 1 9.5 4h5a1 1 0 0 1 .8.4l1 1.6h1.2A2.5 2.5 0 0 1 20 8.5V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
            <circle cx="12" cy="12.5" r="3.2" />
          </svg>
          <span className="text-sm font-semibold text-brand-700">
            Chụp ảnh trực tiếp
          </span>
          <span className="text-xs text-ink-500">
            Mở camera sau trên điện thoại. Nếu thiết bị/trình duyệt không hỗ trợ,
            hệ thống mở hộp chọn ảnh để bạn chọn tệp có sẵn.
          </span>
        </button>
      </div>

      {notice && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
          {notice}
        </p>
      )}

      {/* Hướng dẫn chụp */}
      <div className="mt-4 rounded-lg bg-gray-50 p-3.5">
        <div className="text-xs font-semibold text-ink-900">
          Nên chụp
        </div>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-ink-500">
          <li>Mặt trước màn hình (sáng, rõ nét)</li>
          <li>Mặt sau máy</li>
          <li>Khung viền máy</li>
          <li>Vị trí có hư hỏng (nếu có)</li>
        </ul>
      </div>

      {/* Danh sách ảnh */}
      {photos.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p, idx) => (
            <li
              key={p.id}
              className={`relative rounded-xl border-2 p-2 ${
                p.cover ? "border-brand-500" : "border-gray-200"
              } ${p.status === "error" ? "bg-red-50" : "bg-white"}`}
            >
              {p.status === "error" ? (
                <div className="flex h-28 flex-col items-center justify-center gap-1 text-center">
                  <svg className="h-6 w-6 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                  </svg>
                  <span className="text-xs font-medium text-red-600">
                    {p.reason || "Ảnh bị lỗi"} ({formatSize(p.size)})
                  </span>
                  <div className="mt-1 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => retry(p.id)}
                      className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
                    >
                      Chọn lại
                    </button>
                    <button
                      type="button"
                      onClick={() => removePhoto(p.id)}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-ink-700 hover:bg-gray-100"
                    >
                      Xóa
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <img
                    src={p.objectUrl}
                    alt={`Ảnh ${idx + 1} — ${p.name}`}
                    className="h-28 w-full rounded-lg object-cover"
                  />
                  {p.cover && (
                    <span className="absolute left-3 top-3 rounded-full bg-brand-500 px-2 py-0.5 text-xs font-semibold text-white">
                      Ảnh bìa
                    </span>
                  )}
                  <div className="mt-1.5 flex items-center justify-between gap-1">
                    <span className="min-w-0 truncate text-xs text-ink-500">
                      {idx + 1}. {p.name}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {!p.cover && (
                      <button
                        type="button"
                        onClick={() => setCover(p.id)}
                        className="rounded-md border border-gray-300 px-1.5 py-0.5 text-xs font-medium text-ink-700 hover:bg-gray-100"
                      >
                        Đặt làm bìa
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => move(p.id, -1)}
                      disabled={idx === 0}
                      aria-label="Chuyển ảnh lên trước"
                      className="rounded-md border border-gray-300 px-1.5 py-0.5 text-xs disabled:opacity-40 hover:bg-gray-100"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      onClick={() => move(p.id, 1)}
                      disabled={idx === photos.length - 1}
                      aria-label="Chuyển ảnh lùi sau"
                      className="rounded-md border border-gray-300 px-1.5 py-0.5 text-xs disabled:opacity-40 hover:bg-gray-100"
                    >
                      →
                    </button>
                    <button
                      type="button"
                      onClick={() => removePhoto(p.id)}
                      className="rounded-md border border-gray-300 px-1.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Xóa
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {photos.length === 0 && (
        <p className="mt-3 text-xs text-ink-400">
          Chưa có ảnh nào được chọn. Bạn có thể chọn ảnh có sẵn hoặc chụp trực tiếp.
        </p>
      )}
    </div>
  );
}
