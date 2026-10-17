-- RePrice schema v1. Nguồn: docs/erd.md. Trạng thái khớp docs/state-diagrams.md.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================== tài khoản, danh mục, tin đăng

CREATE TABLE users (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name      text NOT NULL,
    email          text NOT NULL UNIQUE,
    phone          text NOT NULL DEFAULT '',
    password_hash  text NOT NULL,
    province       text NOT NULL DEFAULT '',
    ward           text NOT NULL DEFAULT '',
    is_admin       boolean NOT NULL DEFAULT false,
    seller_rating  numeric(2,1),
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        text NOT NULL,
    title       text NOT NULL,
    body        text NOT NULL DEFAULT '',
    link        text NOT NULL DEFAULT '',
    read_at     timestamptz,
    created_at  timestamptz NOT NULL
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

CREATE TABLE phone_models (
    id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand  text NOT NULL,
    name   text NOT NULL,
    UNIQUE (brand, name)
);

CREATE TABLE phone_variants (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id    uuid NOT NULL REFERENCES phone_models(id),
    storage_gb  int NOT NULL CHECK (storage_gb > 0),
    ram_gb      int CHECK (ram_gb > 0),
    color       text
);
CREATE UNIQUE INDEX phone_variants_uniq ON phone_variants (model_id, storage_gb, coalesce(ram_gb, 0), coalesce(color, ''));

CREATE TABLE listings (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id           uuid NOT NULL REFERENCES users(id),
    variant_id          uuid REFERENCES phone_variants(id),
    price               bigint CHECK (price > 0),
    status              text NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN ('DRAFT','ACTIVE','PAUSED','IN_TRANSACTION','SOLD','REMOVED')),
    appearance          text CHECK (appearance IN ('EXCELLENT','GOOD','FAIR','POOR')),
    functionality       text CHECK (functionality IN ('FULL','HAS_FAULTS','NOT_FULLY_CHECKED')),
    remaining_checked   boolean,
    battery_health_pct  smallint CHECK (battery_health_pct BETWEEN 0 AND 100),
    battery_status_text text,
    battery_bucket      text CHECK (battery_bucket IN ('GE_90','FROM_80_TO_89','LT_80')),
    condition_key       text,
    network_lock        text CHECK (network_lock IN ('UNLOCKED','LOCKED','UNKNOWN')),
    usage_months        int CHECK (usage_months >= 0),
    warranty_type       text CHECK (warranty_type IN ('NONE','BRAND','STORE','BOTH','UNKNOWN')),
    warranty_until      date,
    warranty_store      text,
    description         text NOT NULL DEFAULT '',
    province            text NOT NULL DEFAULT '',
    ward                text NOT NULL DEFAULT '',
    contact_phone       text NOT NULL DEFAULT '',
    draft_step          smallint NOT NULL DEFAULT 1,
    hidden_reason       text,
    published_at        timestamptz,
    created_at          timestamptz NOT NULL,
    updated_at          timestamptz NOT NULL
);
CREATE INDEX listings_search_idx ON listings (status, published_at DESC);
CREATE INDEX listings_seller_idx ON listings (seller_id, status);
CREATE INDEX listings_variant_idx ON listings (variant_id) WHERE status = 'ACTIVE';

CREATE TABLE listing_photos (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id  uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    url         text NOT NULL,
    position    smallint NOT NULL,
    is_cover    boolean NOT NULL DEFAULT false
);
CREATE INDEX listing_photos_listing_idx ON listing_photos (listing_id, position);

CREATE TABLE listing_faults (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id  uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    component   text NOT NULL,
    severity    text NOT NULL CHECK (severity IN ('DEGRADED','NOT_WORKING')),
    note        text NOT NULL DEFAULT ''
);

CREATE TABLE listing_accessories (
    listing_id  uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    type        text NOT NULL CHECK (type IN ('BOX','CHARGER','CABLE','EARPHONES','CASE','OTHER')),
    note        text NOT NULL DEFAULT '',
    PRIMARY KEY (listing_id, type)
);

CREATE TABLE listing_history (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id  uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    changed_by  uuid REFERENCES users(id),
    changes     jsonb NOT NULL,
    created_at  timestamptz NOT NULL
);

CREATE TABLE favorites (
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    listing_id  uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL,
    PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE catalog_requests (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id   uuid NOT NULL REFERENCES users(id),
    listing_id  uuid REFERENCES listings(id) ON DELETE SET NULL,
    brand       text NOT NULL,
    model_text  text NOT NULL,
    status      text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    created_at  timestamptz NOT NULL
);

-- =========================================================== thương lượng, đơn hàng

CREATE TABLE negotiations (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id              uuid NOT NULL REFERENCES listings(id),
    buyer_id                uuid NOT NULL REFERENCES users(id),
    seller_id               uuid NOT NULL REFERENCES users(id),
    listing_price_at_start  bigint NOT NULL CHECK (listing_price_at_start > 0),
    status                  text NOT NULL DEFAULT 'AWAITING_SELLER'
                            CHECK (status IN ('AWAITING_SELLER','AWAITING_BUYER','AGREED','REJECTED','CANCELLED','CLOSED')),
    agreed_price            bigint CHECK (agreed_price > 0),
    closed_reason           text,
    created_at              timestamptz NOT NULL,
    updated_at              timestamptz NOT NULL,
    CHECK (buyer_id <> seller_id),
    CHECK ((status = 'AGREED') = (agreed_price IS NOT NULL))
);
CREATE UNIQUE INDEX negotiations_one_open ON negotiations (listing_id, buyer_id)
    WHERE status IN ('AWAITING_SELLER','AWAITING_BUYER');
CREATE INDEX negotiations_buyer_idx ON negotiations (buyer_id, updated_at DESC);
CREATE INDEX negotiations_seller_idx ON negotiations (seller_id, updated_at DESC);

CREATE TABLE negotiation_offers (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    negotiation_id  uuid NOT NULL REFERENCES negotiations(id) ON DELETE CASCADE,
    by_party        text NOT NULL CHECK (by_party IN ('BUYER','SELLER')),
    amount          bigint NOT NULL CHECK (amount > 0),
    note            text NOT NULL DEFAULT '',
    created_at      timestamptz NOT NULL
);
CREATE INDEX negotiation_offers_idx ON negotiation_offers (negotiation_id, created_at);

CREATE TABLE orders (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code             text NOT NULL UNIQUE,
    buyer_id         uuid NOT NULL REFERENCES users(id),
    seller_id        uuid NOT NULL REFERENCES users(id),
    negotiation_id   uuid UNIQUE REFERENCES negotiations(id),
    status           text NOT NULL DEFAULT 'AWAITING_PAYMENT'
                     CHECK (status IN ('AWAITING_PAYMENT','CONFIRMED','SHIPPING','DELIVERED','RECEIVED',
                                       'ON_HOLD','COMPLETED','REFUNDED','CANCELLED','RETURNED_TO_SELLER')),
    shipping_fee     bigint NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0),
    recipient_name   text,
    recipient_phone  text,
    address_line     text,
    province         text,
    ward             text,
    created_at       timestamptz NOT NULL,
    payment_due_at   timestamptz NOT NULL,
    delivered_at     timestamptz,
    received_at      timestamptz,
    return_deadline  timestamptz,
    completed_at     timestamptz,
    cancelled_at     timestamptz,
    cancel_reason    text,
    CHECK (buyer_id <> seller_id)
);
CREATE INDEX orders_buyer_idx ON orders (buyer_id, created_at DESC);
CREATE INDEX orders_seller_idx ON orders (seller_id, created_at DESC);
CREATE INDEX orders_payment_due_idx ON orders (payment_due_at) WHERE status = 'AWAITING_PAYMENT';
CREATE INDEX orders_return_deadline_idx ON orders (return_deadline) WHERE status IN ('DELIVERED','RECEIVED');

CREATE TABLE order_items (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id                    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    listing_id                  uuid NOT NULL REFERENCES listings(id),
    variant_id                  uuid NOT NULL REFERENCES phone_variants(id),
    listing_price_at_agreement  bigint NOT NULL CHECK (listing_price_at_agreement > 0),
    agreed_price                bigint NOT NULL CHECK (agreed_price > 0),
    snapshot                    jsonb NOT NULL,
    condition_key               text
);
CREATE INDEX order_items_order_idx ON order_items (order_id);
CREATE INDEX order_items_listing_idx ON order_items (listing_id);

CREATE TABLE order_status_history (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status  text,
    to_status    text NOT NULL,
    actor_id     uuid REFERENCES users(id),
    reason       text NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL
);
CREATE INDEX order_status_history_idx ON order_status_history (order_id, created_at);

CREATE TABLE payments (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id      uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    method        text CHECK (method IN ('PREPAID','COD')),
    channel       text CHECK (channel IN ('BANK_TRANSFER','EWALLET','QR')),
    amount        bigint NOT NULL CHECK (amount > 0),
    status        text NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','PAID','FAILED','COD_PENDING','COD_COLLECTED','VOID')),
    provider_ref  text,
    simulated     boolean NOT NULL DEFAULT true,
    paid_at       timestamptz,
    created_at    timestamptz NOT NULL
);

CREATE TABLE payouts (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    seller_id    uuid NOT NULL REFERENCES users(id),
    amount       bigint NOT NULL CHECK (amount > 0),
    status       text NOT NULL DEFAULT 'HELD' CHECK (status IN ('HELD','RELEASED','REVERSED')),
    simulated    boolean NOT NULL DEFAULT true,
    released_at  timestamptz
);

CREATE TABLE reviews (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    uuid NOT NULL UNIQUE REFERENCES orders(id),
    buyer_id    uuid NOT NULL REFERENCES users(id),
    seller_id   uuid NOT NULL REFERENCES users(id),
    rating      smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment     text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL
);

-- =========================================================== trả hàng, hoàn tiền, khiếu nại

CREATE TABLE support_cases (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code               text NOT NULL UNIQUE,
    order_id           uuid NOT NULL REFERENCES orders(id),
    type               text NOT NULL CHECK (type IN ('RETURN','NOT_RECEIVED','COMPLAINT')),
    reason             text NOT NULL CHECK (reason IN ('WRONG_DEVICE','NOT_AS_DESCRIBED','UNDISCLOSED_FAULT',
                                                       'MISSING_ACCESSORY','SHIPPING_DAMAGE','NOT_RECEIVED','OTHER')),
    description        text NOT NULL DEFAULT '',
    discovered_at      timestamptz,
    status             text NOT NULL CHECK (status IN (
                           'AWAITING_SELLER','AWAITING_BUYER_INFO','AWAITING_SELLER_DECISION','AWAITING_BUYER_CHOICE',
                           'ADMIN_REVIEW','PLAN_REVIEW','RETURN_APPROVED','AWAITING_HANDOVER','RETURNING',
                           'RETURN_INSPECTION','REFUNDING','RESOLVED','REJECTED','WITHDRAWN')),
    awaiting_party     text CHECK (awaiting_party IN ('BUYER','SELLER','ADMIN')),
    due_at             timestamptz,
    supplement_used    boolean NOT NULL DEFAULT false,
    opened_by          uuid NOT NULL REFERENCES users(id),
    assigned_admin_id  uuid REFERENCES users(id),
    return_recipient   jsonb,
    opened_at          timestamptz NOT NULL,
    closed_at          timestamptz,
    CHECK ((closed_at IS NULL) = (status NOT IN ('RESOLVED','REJECTED','WITHDRAWN')))
);
CREATE UNIQUE INDEX support_cases_one_open ON support_cases (order_id) WHERE closed_at IS NULL;
CREATE INDEX support_cases_due_idx ON support_cases (due_at) WHERE closed_at IS NULL;

CREATE TABLE support_case_items (
    case_id        uuid NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
    order_item_id  uuid NOT NULL REFERENCES order_items(id),
    PRIMARY KEY (case_id, order_item_id)
);

CREATE TABLE case_events (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id      uuid NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
    actor_id     uuid REFERENCES users(id),
    action       text NOT NULL,
    from_status  text,
    to_status    text,
    note         text NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL
);
CREATE INDEX case_events_idx ON case_events (case_id, created_at);

CREATE TABLE evidence (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id      uuid NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
    uploaded_by  uuid NOT NULL REFERENCES users(id),
    note         text NOT NULL DEFAULT '',
    visibility   text NOT NULL DEFAULT 'PARTIES' CHECK (visibility IN ('PARTIES','ADMIN_ONLY')),
    created_at   timestamptz NOT NULL
);

CREATE TABLE evidence_files (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id  uuid NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    file_name    text NOT NULL,
    mime_type    text NOT NULL,
    size_bytes   bigint NOT NULL CHECK (size_bytes >= 0),
    storage_url  text NOT NULL
);

CREATE TABLE resolutions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id          uuid NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
    issued_by        uuid NOT NULL REFERENCES users(id),
    decision         text NOT NULL CHECK (decision IN ('APPROVE_RETURN','REFUND_NO_RETURN','REJECT','CONTINUE_VERIFY')),
    rationale        text NOT NULL,
    requires_return  boolean NOT NULL,
    refund_amount    bigint CHECK (refund_amount > 0),
    fee_allocation   jsonb NOT NULL DEFAULT '[]',
    review_deadline  timestamptz NOT NULL,
    is_current       boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL
);
CREATE UNIQUE INDEX resolutions_one_current ON resolutions (case_id) WHERE is_current;

CREATE TABLE shipments (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id         uuid NOT NULL REFERENCES orders(id),
    support_case_id  uuid REFERENCES support_cases(id),
    direction        text NOT NULL CHECK (direction IN ('OUTBOUND','RETURN')),
    tracking_code    text NOT NULL UNIQUE,
    carrier          text NOT NULL,
    status           text NOT NULL DEFAULT 'AWAITING_PICKUP'
                     CHECK (status IN ('AWAITING_PICKUP','PICKED_UP','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED',
                                       'FAILED','RETURNING','RETURNED','VOIDED','INCIDENT')),
    attempts         smallint NOT NULL DEFAULT 0,
    simulated        boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL,
    CHECK ((direction = 'RETURN') = (support_case_id IS NOT NULL))
);
CREATE INDEX shipments_order_idx ON shipments (order_id);

CREATE TABLE shipment_events (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id  uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    status       text NOT NULL,
    note         text NOT NULL DEFAULT '',
    simulated    boolean NOT NULL DEFAULT true,
    occurred_at  timestamptz NOT NULL
);
CREATE INDEX shipment_events_idx ON shipment_events (shipment_id, occurred_at);

CREATE TABLE shipping_verifications (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id       uuid NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
    shipment_id   uuid NOT NULL REFERENCES shipments(id),
    ticket_code   text,
    question      text NOT NULL,
    status        text NOT NULL DEFAULT 'NOT_SENT' CHECK (status IN ('NOT_SENT','SENT','AWAITING','RESPONDED')),
    response      text,
    outcome       text CHECK (outcome IN ('DELIVERY_MISRECORDED','STILL_IN_TRANSIT','WRONG_RECIPIENT','LOST','INCONCLUSIVE')),
    sent_at       timestamptz,
    responded_at  timestamptz
);

CREATE TABLE refunds (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         uuid REFERENCES support_cases(id),
    order_id        uuid NOT NULL REFERENCES orders(id),
    amount          bigint NOT NULL CHECK (amount > 0),
    status          text NOT NULL DEFAULT 'APPROVED'
                    CHECK (status IN ('APPROVED','PROCESSING','SUCCEEDED','FAILED','RECONCILING')),
    provider_ref    text,
    failure_reason  text,
    created_at      timestamptz NOT NULL,
    updated_at      timestamptz NOT NULL
);
-- Không có hai lệnh hoàn chạy song song cho cùng một đơn.
CREATE UNIQUE INDEX refunds_one_active ON refunds (order_id) WHERE status IN ('APPROVED','PROCESSING','RECONCILING');

-- =========================================================== giá tham khảo, dữ liệu tham chiếu

CREATE TABLE store_sources (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    retailer_name  text NOT NULL UNIQUE,
    website        text NOT NULL,
    active         boolean NOT NULL DEFAULT true
);

CREATE TABLE store_price_quotes (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id    uuid NOT NULL REFERENCES store_sources(id),
    variant_id   uuid NOT NULL REFERENCES phone_variants(id),
    color        text,
    price        bigint NOT NULL CHECK (price > 0),
    in_stock     boolean NOT NULL,
    url          text NOT NULL,
    verified_at  timestamptz NOT NULL,
    status       text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED'))
);
CREATE UNIQUE INDEX store_price_quotes_uniq ON store_price_quotes (source_id, variant_id, coalesce(color, ''));

CREATE TABLE reference_transactions (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id     uuid UNIQUE REFERENCES order_items(id),
    variant_id        uuid NOT NULL REFERENCES phone_variants(id),
    condition_key     text,
    data_source       text NOT NULL CHECK (data_source IN ('REAL','SIMULATED')),
    status            text NOT NULL DEFAULT 'PENDING_COMPLETION'
                      CHECK (status IN ('PENDING_COMPLETION','PENDING_VERIFICATION','ELIGIBLE','EXCLUDED','REVOKED')),
    actual_price      bigint NOT NULL CHECK (actual_price > 0),
    transaction_date  date NOT NULL,
    eligible_at       timestamptz,
    cluster_id        uuid,
    updated_at        timestamptz NOT NULL,
    CHECK (data_source = 'SIMULATED' OR order_item_id IS NOT NULL)
);
CREATE INDEX reference_transactions_group_idx
    ON reference_transactions (variant_id, condition_key, data_source, status, transaction_date);
CREATE INDEX reference_transactions_cluster_idx ON reference_transactions (cluster_id);

CREATE TABLE suspicion_flags (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_transaction_id  uuid NOT NULL REFERENCES reference_transactions(id) ON DELETE CASCADE,
    code                      text NOT NULL CHECK (code IN ('PAYMENT_DELIVERY_CONTRADICTION','SNAPSHOT_MISSING_OR_INCONSISTENT',
                                  'DUPLICATE_DETAIL_CONFLICT','BUYER_SELLER_SAME_SUBJECT','DEVICE_CIRCULATION','ELIGIBLE_THEN_RETURNED')),
    evidence                  text NOT NULL,
    status                    text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLEARED','CONFIRMED')),
    raised_at                 timestamptz NOT NULL,
    resolved_at               timestamptz
);
CREATE INDEX suspicion_flags_open_idx ON suspicion_flags (reference_transaction_id) WHERE status = 'OPEN';

CREATE TABLE reference_decisions (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_transaction_id  uuid NOT NULL REFERENCES reference_transactions(id) ON DELETE CASCADE,
    admin_id                  uuid NOT NULL REFERENCES users(id),
    action                    text NOT NULL CHECK (action IN ('ALLOW','KEEP_PENDING','EXCLUDE','REVOKE','REVOKE_RECALC')),
    reason                    text NOT NULL CHECK (reason <> ''),
    from_status               text NOT NULL,
    to_status                 text NOT NULL,
    created_at                timestamptz NOT NULL
);

CREATE TABLE transaction_relations (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    a_id           uuid NOT NULL REFERENCES reference_transactions(id) ON DELETE CASCADE,
    b_id           uuid NOT NULL REFERENCES reference_transactions(id) ON DELETE CASCADE,
    relation_type  text NOT NULL CHECK (relation_type IN ('SAME_ORDER','SAME_BUYER','SAME_SELLER','SAME_DEVICE')),
    basis          text NOT NULL DEFAULT '',
    CHECK (a_id < b_id),
    UNIQUE (a_id, b_id, relation_type)
);

CREATE TABLE price_range_versions (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id         uuid NOT NULL REFERENCES phone_variants(id),
    condition_key      text NOT NULL,
    data_source        text NOT NULL CHECK (data_source IN ('REAL','SIMULATED')),
    result             text NOT NULL CHECK (result IN ('RANGE','SINGLE_PRICE','INSUFFICIENT_DATA','NO_DATA')),
    window_months      smallint CHECK (window_months IN (3, 6, 12)),
    transaction_count  int NOT NULL,
    p10                bigint,
    p90                bigint,
    period_start       date,
    period_end         date,
    is_current         boolean NOT NULL DEFAULT true,
    computed_at        timestamptz NOT NULL
);
CREATE UNIQUE INDEX price_range_versions_current
    ON price_range_versions (variant_id, condition_key, data_source) WHERE is_current;

CREATE TABLE price_range_members (
    version_id                uuid NOT NULL REFERENCES price_range_versions(id) ON DELETE CASCADE,
    reference_transaction_id  uuid NOT NULL REFERENCES reference_transactions(id) ON DELETE CASCADE,
    PRIMARY KEY (version_id, reference_transaction_id)
);
CREATE INDEX price_range_members_txn_idx ON price_range_members (reference_transaction_id);

-- =========================================================== quản trị, hệ thống

CREATE TABLE pricing_config (
    key         text PRIMARY KEY,
    value       jsonb,
    updated_by  uuid REFERENCES users(id),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO pricing_config (key, value) VALUES
    ('min_transactions', '35'),
    ('windows_months', '[3, 6, 12]'),
    ('new_price_max_age_hours', '24'),
    ('z_threshold', NULL),
    ('max_seller_concentration', NULL),
    ('max_cluster_concentration', NULL),
    ('min_independent_buyers', NULL),
    ('min_independent_sellers', NULL);

CREATE TABLE system_clock (
    id              smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    offset_seconds  bigint NOT NULL DEFAULT 0 CHECK (offset_seconds >= 0)
);
INSERT INTO system_clock (id, offset_seconds) VALUES (1, 0);

CREATE TABLE admin_audit_logs (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id     uuid NOT NULL REFERENCES users(id),
    action       text NOT NULL,
    entity_type  text NOT NULL,
    entity_id    uuid NOT NULL,
    reason       text NOT NULL DEFAULT '',
    before       jsonb,
    after        jsonb,
    created_at   timestamptz NOT NULL
);
CREATE INDEX admin_audit_logs_entity_idx ON admin_audit_logs (entity_type, entity_id, created_at DESC);
