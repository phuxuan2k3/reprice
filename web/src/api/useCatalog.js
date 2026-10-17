import { useEffect, useMemo, useState } from "react";
import { catalogApi } from "./client";

/**
 * Danh mục máy từ backend cho wizard đăng tin: model của hãng, dung lượng và màu của model.
 * Trả tên model / "128GB" / tên màu để wizard dùng như trước, kèm modelId để gửi backend.
 */
export function useCatalog(brand, modelName) {
  const [models, setModels] = useState([]);
  const [variants, setVariants] = useState([]);

  useEffect(() => {
    if (!brand) {
      setModels([]);
      return;
    }
    let alive = true;
    catalogApi.models(brand).then((m) => alive && setModels(m)).catch(() => alive && setModels([]));
    return () => {
      alive = false;
    };
  }, [brand]);

  const modelId = useMemo(() => models.find((m) => m.name === modelName)?.id || null, [models, modelName]);

  useEffect(() => {
    if (!modelId) {
      setVariants([]);
      return;
    }
    let alive = true;
    catalogApi.variants(modelId).then((v) => alive && setVariants(v)).catch(() => alive && setVariants([]));
    return () => {
      alive = false;
    };
  }, [modelId]);

  return useMemo(
    () => ({
      modelNames: models.map((m) => m.name),
      modelId,
      storages: [...new Set(variants.map((v) => `${v.storageGb}GB`))],
      colors: [...new Set(variants.map((v) => v.color).filter(Boolean))],
    }),
    [models, modelId, variants]
  );
}
