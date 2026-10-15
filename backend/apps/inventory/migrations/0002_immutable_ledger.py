from django.db import migrations

SQL = """
CREATE FUNCTION inventory_deny_history_change() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Posted inventory and audit history is immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER immutable_movements BEFORE UPDATE OR DELETE ON inventory_stockmovement
FOR EACH ROW EXECUTE FUNCTION inventory_deny_history_change();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON accounts_auditevent
FOR EACH ROW EXECUTE FUNCTION inventory_deny_history_change();
CREATE FUNCTION inventory_protect_document() RETURNS trigger AS $$
BEGIN
    IF OLD.status = 'POSTED' THEN
        RAISE EXCEPTION 'Posted stock documents are immutable';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER immutable_posted_document BEFORE UPDATE OR DELETE ON inventory_stockdocument
FOR EACH ROW EXECUTE FUNCTION inventory_protect_document();
CREATE FUNCTION inventory_protect_line() RETURNS trigger AS $$
DECLARE target_id uuid;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        IF EXISTS (SELECT 1 FROM inventory_stockdocument WHERE id = OLD.document_id AND status = 'POSTED') THEN
            RAISE EXCEPTION 'Posted stock document lines are immutable';
        END IF;
    END IF;
    IF TG_OP <> 'DELETE' THEN
        target_id := NEW.document_id;
        IF EXISTS (SELECT 1 FROM inventory_stockdocument WHERE id = target_id AND status = 'POSTED') THEN
            RAISE EXCEPTION 'Cannot append or move lines into a posted document';
        END IF;
        RETURN NEW;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER immutable_posted_line BEFORE INSERT OR UPDATE OR DELETE ON inventory_stockdocumentline
FOR EACH ROW EXECUTE FUNCTION inventory_protect_line();
"""
REVERSE = """
DROP TRIGGER immutable_posted_line ON inventory_stockdocumentline;
DROP FUNCTION inventory_protect_line();
DROP TRIGGER immutable_posted_document ON inventory_stockdocument;
DROP FUNCTION inventory_protect_document();
DROP TRIGGER immutable_movements ON inventory_stockmovement;
DROP TRIGGER immutable_audit ON accounts_auditevent;
DROP FUNCTION inventory_deny_history_change();
"""
class Migration(migrations.Migration):
    dependencies = [("inventory", "0001_initial")]
    operations = [migrations.RunSQL(SQL, REVERSE)]
