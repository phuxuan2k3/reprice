/**
 * GOM CỤM GIAO DỊCH LIÊN QUAN — mô hình ĐỒ THỊ / THÀNH PHẦN LIÊN THÔNG.
 *
 * QUY TẮC AN TOÀN (theo đặc tả):
 *  - cluster_id CHỈ biểu thị quan hệ dữ liệu, KHÔNG phải nhãn gian lận, KHÔNG
 *    phải lý do tự động loại giao dịch, KHÔNG dùng trực tiếp để khóa tài khoản.
 *  - CHỈ tạo cạnh khi có căn cứ rõ ràng (cùng đơn / cùng người mua / cùng người
 *    bán / cùng cặp mua–bán / cùng thiết bị đã xác minh / quan hệ do QTV xác nhận).
 *  - TUYỆT ĐỐI KHÔNG tạo cạnh chỉ vì cùng model, cùng màu, cùng giá, ảnh giống
 *    nhau nhưng chưa có căn cứ nhận diện, hay cùng mạng/IP.
 *
 * Mỗi cạnh lưu: sourceTransactionDetailId, targetTransactionDetailId,
 * relationType, evidence, createdAt, createdBy/createdSource, active.
 *
 * Đây là dữ liệu MÔ PHỎNG phục vụ đồ án.
 */

export const RELATION_TYPE = {
  SAME_BUYER: "SAME_BUYER",
  SAME_SELLER: "SAME_SELLER",
  SAME_BUYER_SELLER_PAIR: "SAME_BUYER_SELLER_PAIR",
  SAME_ORDER: "SAME_ORDER",
  SAME_VERIFIED_DEVICE: "SAME_VERIFIED_DEVICE",
  MANUAL_RELATION: "MANUAL_RELATION",
};

export const RELATION_LABEL = {
  SAME_BUYER: "Cùng người mua",
  SAME_SELLER: "Cùng người bán",
  SAME_BUYER_SELLER_PAIR: "Cùng cặp người mua – người bán",
  SAME_ORDER: "Cùng mã đơn",
  SAME_VERIFIED_DEVICE: "Cùng thiết bị đã xác minh",
  MANUAL_RELATION: "Quan hệ do quản trị xác nhận",
};

const idOf = (d) => d?.transaction_detail_id;

/** Gom nhóm theo một khoá; bỏ qua khoá rỗng. */
function groupBy(details, keyFn) {
  const map = new Map();
  for (const d of details || []) {
    const k = keyFn(d);
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(d);
  }
  return map;
}

/**
 * Tạo danh sách cạnh quan hệ. Dùng cấu trúc "ngôi sao" (mỗi phần tử nối về phần
 * tử đầu của nhóm) để số cạnh là O(n) mà vẫn cho THÀNH PHẦN LIÊN THÔNG đúng.
 * `manualRelations`: [{ source, target, reason, createdBy }].
 */
export function buildRelationEdges(details, opts = {}) {
  const now = opts.now || new Date();
  const createdAt = now.toISOString();
  const createdSource = opts.createdSource || "engine";
  const edges = [];

  const pushGroupEdges = (map, relationType, evidenceFn) => {
    for (const [, members] of map) {
      if (members.length < 2) continue;
      const anchor = idOf(members[0]);
      for (let i = 1; i < members.length; i++) {
        const target = idOf(members[i]);
        if (!anchor || !target) continue;
        edges.push({
          sourceTransactionDetailId: anchor,
          targetTransactionDetailId: target,
          relationType,
          evidence: evidenceFn(members[0], members[i]),
          createdAt,
          createdBy: createdSource,
          createdSource,
          active: true,
        });
      }
    }
  };

  pushGroupEdges(
    groupBy(details, (d) => d.order_id),
    RELATION_TYPE.SAME_ORDER,
    (a) => `Cùng mã đơn ${a.order_id}`
  );
  pushGroupEdges(
    groupBy(details, (d) => d.buyer_id),
    RELATION_TYPE.SAME_BUYER,
    (a) => `Cùng người mua ${a.buyer_id}`
  );
  pushGroupEdges(
    groupBy(details, (d) => d.seller_id),
    RELATION_TYPE.SAME_SELLER,
    (a) => `Cùng người bán ${a.seller_id}`
  );
  pushGroupEdges(
    groupBy(details, (d) => (d.buyer_id && d.seller_id ? `${d.buyer_id}::${d.seller_id}` : null)),
    RELATION_TYPE.SAME_BUYER_SELLER_PAIR,
    (a) => `Cùng cặp ${a.buyer_id} – ${a.seller_id}`
  );
  // CHỈ khi có mã nhận diện thiết bị đã xác minh (không suy từ model/màu/giá).
  pushGroupEdges(
    groupBy(details, (d) => (d.verified_device_id ? d.verified_device_id : null)),
    RELATION_TYPE.SAME_VERIFIED_DEVICE,
    (a) => `Cùng thiết bị đã xác minh ${a.verified_device_id}`
  );
  // Quan hệ do quản trị viên xác nhận (bắt buộc có lý do).
  for (const mr of opts.manualRelations || []) {
    if (!mr?.source || !mr?.target || !mr?.reason) continue;
    edges.push({
      sourceTransactionDetailId: mr.source,
      targetTransactionDetailId: mr.target,
      relationType: RELATION_TYPE.MANUAL_RELATION,
      evidence: mr.reason,
      createdAt: mr.createdAt || createdAt,
      createdBy: mr.createdBy || createdSource,
      createdSource: "manual",
      active: mr.active !== false,
    });
  }

  return edges.filter((e) => e.active);
}

/**
 * Thành phần liên thông bằng Union–Find.
 * Trả { assignments: Map<detailId, clusterId>, clusters: [{clusterId, memberIds}] }.
 * clusterId ổn định theo thành viên nhỏ nhất. Không tạo cluster rỗng.
 */
export function computeConnectedComponents(detailIds, edges) {
  const parent = new Map();
  const find = (x) => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(x) !== r) {
      const next = parent.get(x);
      parent.set(x, r);
      x = next;
    }
    return r;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const id of detailIds || []) parent.set(id, id);
  for (const e of edges || []) {
    const s = e.sourceTransactionDetailId;
    const t = e.targetTransactionDetailId;
    if (!parent.has(s) || !parent.has(t)) continue;
    union(s, t);
  }

  const groups = new Map();
  for (const id of parent.keys()) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(id);
  }

  const assignments = new Map();
  const clusters = [];
  for (const members of groups.values()) {
    const memberIds = [...members].sort();
    const clusterId = `CL-${memberIds[0]}`;
    for (const id of memberIds) assignments.set(id, clusterId);
    clusters.push({ clusterId, memberIds });
  }
  clusters.sort((a, b) => a.clusterId.localeCompare(b.clusterId));
  return { assignments, clusters };
}

/**
 * Tính lại toàn bộ cụm từ tập bản ghi. Trả:
 *  { edges, clusters, assignments, byDetail: Map<detailId, {clusterId, members, size}> }
 * Không để giao dịch giữ cluster_id không tồn tại; không để một thành phần có
 * nhiều cluster_id đang hoạt động (clusterId suy trực tiếp từ thành viên).
 */
export function computeClusters(details, opts = {}) {
  const ids = (details || []).map(idOf).filter(Boolean);
  const edges = buildRelationEdges(details, opts);
  const { assignments, clusters } = computeConnectedComponents(ids, edges);
  const byDetail = new Map();
  for (const c of clusters) {
    for (const id of c.memberIds) {
      byDetail.set(id, { clusterId: c.clusterId, members: c.memberIds, size: c.memberIds.length });
    }
  }
  return { edges, clusters, assignments, byDetail };
}

/** Gắn cluster_id (và lý do cạnh) vào từng bản ghi (trả mảng mới). */
export function withClusterIds(details, opts = {}) {
  const { clusters, edges, byDetail } = computeClusters(details, opts);
  const items = (details || []).map((d) => {
    const info = byDetail.get(d.transaction_detail_id);
    const reasons = edges
      .filter(
        (e) =>
          e.sourceTransactionDetailId === d.transaction_detail_id ||
          e.targetTransactionDetailId === d.transaction_detail_id
      )
      .map((e) => `${RELATION_LABEL[e.relationType] || e.relationType} (${e.evidence})`);
    return info
      ? { ...d, cluster_id: info.clusterId, cluster_size: info.size, cluster_reasons: reasons }
      : { ...d, cluster_id: null, cluster_size: 1, cluster_reasons: [] };
  });
  return { items, clusters, edges };
}
