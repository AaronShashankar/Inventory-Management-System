# Database model and integrity

## Entities

| Module | Tables | Purpose |
|---|---|---|
| accounts | User, Organization, Membership, AuditEvent | Identity, tenant boundaries, permissions, immutable audit events |
| catalog | Category, Unit, Product, Supplier, Warehouse, StorageLocation | Referenced operational master data |
| inventory | DocumentSequence, StockDocument, StockDocumentLine | Human-readable sequences and draft/post state |
| inventory | InventoryBalance, StockMovement, IdempotencyRecord | Materialized balances, authoritative history, retry claims |
| purchasing | PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine | Ordered commitments and received quantities |

Public business objects use UUIDs. Membership and line IDs are internal numeric identifiers. Tenant-owned models carry organization, timestamps, and UUID primary keys. Lines inherit ownership through their parent, and service/serializer validation checks each relation.

## Constraints

- SKU, category name, unit code, warehouse code, document number, PO number, and receipt number have tenant-level unique constraints.
- Bin codes are unique within a warehouse. Bins are explicit, never null balance dimensions.
- Balances are unique per organization/product/bin and cannot be negative.
- Stock, PO, and receipt lines require positive quantities; one product/PO line appears once per document.
- Purchase and reference costs are nonnegative decimal fields; quantities are integers.
- Movement deltas cannot be zero, and resulting quantities cannot be negative.
- Foreign keys use PROTECT for referenced business data. Public APIs offer deactivation instead of hard deletion.
- PostgreSQL triggers reject updates/deletes of movement and audit rows, changes to posted documents, and inserts/updates/deletes of lines in posted stock documents.

The database owner can bypass triggers deliberately. These protections are not a tamper-proof security guarantee against a privileged database administrator. Use separate migration and runtime roles in production.

## Source of truth

StockMovement is the historical source of truth. InventoryBalance is its transactionally maintained projection. An incoming receipt creates a positive movement; issue creates a negative movement; transfer creates both. All rows, audit events, document status, and idempotency result commit or roll back together.

A GoodsReceipt has exactly one StockDocument. Posting through the generic stock route is rejected for linked receipts. Receipt status is derived from the linked document. Received PO quantities sum only lines whose receipt document is POSTED.

## Schema changes

Commit generated migrations. Run `makemigrations --check --dry-run` in CI. Apply migrations once per release, before starting the new service version. The immutability trigger migration is PostgreSQL-specific by design; SQLite is not a supported database. Back up before destructive migrations. Test upgrades and rollback in an isolated environment.

An existing product's base unit cannot change after stock-document use. A bin cannot move warehouses after use. Renaming master data changes current descriptive joins in history; document numbers, quantities, actors, and timestamps remain preserved. Introduce descriptive snapshots if legally immutable printed documents become a requirement.
