import { useRef, useState } from "react";
import Button from "./Button";

/**
 * Tải ảnh / video làm bằng chứng cho hồ sơ trả hàng – hoàn tiền – khiếu nại.
 *
 * LƯU Ý LƯU TRỮ: bản demo không có backend nên KHÔNG lưu nội dung tệp. Hệ thống
 * chỉ lưu METADATA (tên, kích thước, loại) của tệp đã chọn. Khi tải lại trang,
 * nội dung tệp không còn — ảnh/video cần được gửi lại nếu muốn xem trước.
 */

const MAX_MEDIA_BYTES = 20 * 1024 * 1024; // 20MB mỗi tệp
const MAX_MEDIA_COUNT = 6;

let mediaSeq = 0;

function kindOf(file) {
  const t = String(file.type || "");
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  return null;
}

function formatSize(bytes) {
  if (bytes === null || bytes === undefined) return "";
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * @param {Array<{id?:string,name:string,size?:number,type?:string}>} files  danh sách metadata
 * @param {(files:Array)=>void} onChange  nhận METADATA (không kèm URL tạm)
 */
export default function EvidenceUploader({ files = [], onChange }) {
  const inputRef = useRef(null);
  const [previews, setPreviews] = useState({});
  const [notice, setNotice] = useState("");

  const add = (list) => {
    const arr = Array.from(list || []);
    if (arr.length === 0) return;
    const room = Math.max(0, MAX_MEDIA_COUNT - files.length);
    const kept = [];
    const rejected = [];
    const nextPreviews = { ...previews };
    for (const f of arr) {
      if (kept.length >= room) {
        rejected.push(`${f.name}: vượt quá ${MAX_MEDIA_COUNT} tệp`);
        continue;
      }
      const kind = kindOf(f);
      if (!kind) {
        rejected.push(`${f.name}: chỉ nhận ảnh hoặc video`);
        continue;
      }
      if (f.size > MAX_MEDIA_BYTES) {
        rejected.push(`${f.name}: lớn hơn 20MB`);
        continue;
      }
      mediaSeq += 1;
      const id = `media-${mediaSeq}-${Date.now().toString(36)}`;
      nextPreviews[id] = URL.createObjectURL(f);
      kept.push({ id, name: f.name || `tệp-${mediaSeq}`, size: f.size, type: f.type, kind });
    }
    setPreviews(nextPreviews);
    setNotice(rejected.length ? `Bỏ qua: ${rejected.join("; ")}` : "");
    if (kept.length) onChange([...files, ...kept]);
  };

  const remove = (id) => {
    if (previews[id]) {
      URL.revokeObjectURL(previews[id]);
      setPreviews((p) => {
        const { [id]: _drop, ...rest } = p;
        return rest;
      });
    }
    onChange(files.filter((f) => f.id !== id));
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
          Tải ảnh/video bằng chứng
        </Button>
        <span className="text-xs text-ink-500">
          Tối đa {MAX_MEDIA_COUNT} tệp, mỗi tệp ≤ 20MB (ảnh hoặc video).
        </span>
      </div>
      <p className="mt-1 text-xs text-ink-400">
        Bản demo không lưu nội dung tệp — chỉ lưu tên/kích thước/loại. Cần xem lại
        ảnh/video thì tải lại tệp.
      </p>

      {notice && (
        <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">{notice}</p>
      )}

      {files.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {files.map((f) => (
            <li key={f.id || f.name} className="rounded-lg border border-gray-200 p-2">
              {previews[f.id] && f.kind === "image" && (
                <img
                  src={previews[f.id]}
                  alt={f.name}
                  className="h-24 w-full rounded-md object-cover"
                />
              )}
              {previews[f.id] && f.kind === "video" && (
                <video
                  src={previews[f.id]}
                  controls
                  className="h-24 w-full rounded-md bg-black object-contain"
                />
              )}
              {!previews[f.id] && (
                <div className="flex h-24 items-center justify-center rounded-md bg-gray-50 text-xs text-ink-400">
                  {f.kind === "video" ? "Video" : "Ảnh"} (không xem trước được)
                </div>
              )}
              <div className="mt-1 min-w-0 truncate text-xs text-ink-600" title={f.name}>
                {f.name}
              </div>
              <div className="text-[11px] text-ink-400">
                {f.kind === "video" ? "Video" : "Ảnh"}
                {f.size ? ` · ${formatSize(f.size)}` : ""}
              </div>
              <button
                type="button"
                onClick={() => remove(f.id)}
                className="mt-1 rounded-md border border-gray-300 px-1.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Xóa
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
