ALTER TABLE payments ADD COLUMN idempotency_key text;
CREATE UNIQUE INDEX payments_idem_uq ON payments (institution_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
ALTER TABLE payments ADD COLUMN provider_event_id text;
CREATE INDEX payments_order_idx ON payments (provider_order_id);
ALTER TABLE invoices ADD COLUMN version integer NOT NULL DEFAULT 1;
