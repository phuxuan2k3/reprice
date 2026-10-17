-- Nhật ký quản trị ghi cả đối tượng không có uuid (ví dụ khóa cấu hình 'z_threshold').
ALTER TABLE admin_audit_logs ALTER COLUMN entity_id TYPE text;
