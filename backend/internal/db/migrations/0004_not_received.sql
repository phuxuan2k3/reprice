-- Báo chưa nhận hàng: QTV có thể cho giao lại, hoặc hỏi người mua xác nhận khi người thân đã nhận hộ.
ALTER TABLE support_cases DROP CONSTRAINT support_cases_status_check;
ALTER TABLE support_cases ADD CONSTRAINT support_cases_status_check CHECK (status IN (
    'AWAITING_SELLER','AWAITING_BUYER_INFO','AWAITING_SELLER_DECISION','AWAITING_BUYER_CHOICE','AWAITING_BUYER_CONFIRM',
    'ADMIN_REVIEW','PLAN_REVIEW','RETURN_APPROVED','AWAITING_HANDOVER','RETURNING',
    'RETURN_INSPECTION','REFUNDING','RESOLVED','REJECTED','WITHDRAWN'));

ALTER TABLE shipping_verifications DROP CONSTRAINT shipping_verifications_outcome_check;
ALTER TABLE shipping_verifications ADD CONSTRAINT shipping_verifications_outcome_check CHECK (outcome IN (
    'DELIVERY_MISRECORDED','STILL_IN_TRANSIT','WRONG_RECIPIENT','RECEIVED_BY_OTHER','LOST','INCONCLUSIVE'));
