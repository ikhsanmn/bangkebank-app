-- Ledger and audit guards. The database, not the app, guarantees that:
--   * a bank account balance only changes by inserting a ledger posting,
--   * every ledger entry balances to zero when its transaction commits,
--   * ledger and audit rows are never updated, deleted or truncated,
--   * transfers only move pending -> settled | failed.

CREATE FUNCTION bb_apply_posting() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- An overdraft trips bank_account_available_non_negative (SQLSTATE 23514).
  UPDATE "bankAccount"
     SET "currentBalance" = "currentBalance" + NEW."amount",
         "availableBalance" = "availableBalance" + NEW."amount",
         "updatedAt" = now()
   WHERE "id" = NEW."bankAccountId";
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER ledger_posting_apply AFTER INSERT ON "ledgerPosting"
  FOR EACH ROW WHEN (NEW."bankAccountId" IS NOT NULL) EXECUTE FUNCTION bb_apply_posting();
--> statement-breakpoint
CREATE FUNCTION bb_guard_balance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."currentBalance" <> 0 OR NEW."availableBalance" <> 0 THEN
      RAISE EXCEPTION 'bank accounts open with a zero balance; fund them with a ledger entry';
    END IF;
  -- Depth 1 is a direct UPDATE; the posting trigger runs at depth 2.
  ELSIF pg_trigger_depth() < 2 AND (NEW."currentBalance" IS DISTINCT FROM OLD."currentBalance"
     OR NEW."availableBalance" IS DISTINCT FROM OLD."availableBalance") THEN
    RAISE EXCEPTION 'balances change only through ledger postings';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER bank_account_guard_balance BEFORE INSERT OR UPDATE ON "bankAccount"
  FOR EACH ROW EXECUTE FUNCTION bb_guard_balance();
--> statement-breakpoint
CREATE FUNCTION bb_check_entry_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  total numeric;
  postings integer;
BEGIN
  SELECT coalesce(sum("amount"), 0), count(*) INTO total, postings
    FROM "ledgerPosting" WHERE "entryId" = NEW."entryId";
  IF total <> 0 OR postings < 2 THEN
    RAISE EXCEPTION 'ledger entry % is unbalanced (sum %, % postings)', NEW."entryId", total, postings;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_entry_balanced AFTER INSERT ON "ledgerPosting"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bb_check_entry_balanced();
--> statement-breakpoint
CREATE FUNCTION bb_reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
END $$;
--> statement-breakpoint
CREATE TRIGGER ledger_entry_immutable BEFORE UPDATE OR DELETE ON "ledgerEntry"
  FOR EACH ROW EXECUTE FUNCTION bb_reject_change();
--> statement-breakpoint
CREATE TRIGGER ledger_posting_immutable BEFORE UPDATE OR DELETE ON "ledgerPosting"
  FOR EACH ROW EXECUTE FUNCTION bb_reject_change();
--> statement-breakpoint
CREATE TRIGGER audit_event_immutable BEFORE UPDATE OR DELETE ON "auditEvent"
  FOR EACH ROW EXECUTE FUNCTION bb_reject_change();
--> statement-breakpoint
CREATE TRIGGER ledger_entry_no_truncate BEFORE TRUNCATE ON "ledgerEntry"
  FOR EACH STATEMENT EXECUTE FUNCTION bb_reject_change();
--> statement-breakpoint
CREATE TRIGGER ledger_posting_no_truncate BEFORE TRUNCATE ON "ledgerPosting"
  FOR EACH STATEMENT EXECUTE FUNCTION bb_reject_change();
--> statement-breakpoint
CREATE TRIGGER audit_event_no_truncate BEFORE TRUNCATE ON "auditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION bb_reject_change();
--> statement-breakpoint
CREATE FUNCTION bb_guard_transfer_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" NOT IN ('pending', 'failed') THEN
      RAISE EXCEPTION 'transfers start pending (or are recorded as failed), not %', NEW."status";
    END IF;
  ELSIF NEW."status" IS DISTINCT FROM OLD."status"
     AND NOT (OLD."status" = 'pending' AND NEW."status" IN ('settled', 'failed')) THEN
    RAISE EXCEPTION 'illegal transfer status change % -> %', OLD."status", NEW."status";
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER transfer_guard_status BEFORE INSERT OR UPDATE ON "transfer"
  FOR EACH ROW EXECUTE FUNCTION bb_guard_transfer_status();
