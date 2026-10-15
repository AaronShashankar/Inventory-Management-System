# Inventory Management System — Complete Full-Stack Project Blueprint

**Document version:** 1.0  
**Prepared:** 15 October 2026  
**Project type:** Multi-user inventory and warehouse management web application  
**Architecture:** Modular monolith, REST API, React SPA  
**Target:** Portfolio / college-ready MVP that can grow into a real business application

---

## 1. Executive summary

Build a browser-based system that helps a small or medium business answer: **what products do we have, where are they, what did we buy, what did we sell/issue, what is running low, and who changed the stock?**

This is **not just a product CRUD website**. Its core is a reliable, auditable inventory ledger, with receiving, issuing, transfers, adjustments, reorder alerts, purchasing, users, permissions, reports, and operational dashboards.

### 1.1 Target users
- Owner / Administrator: configure business and warehouses, manage users, see everything.
- Inventory Manager: catalog maintenance, stock operations, purchasing, reporting.
- Warehouse Staff: receive and move physical stock with limited permissions.
- Viewer / Auditor: inspect inventory, reports, and history without changing quantities.

### 1.2 MVP success criteria
- Staff can add products, categories, suppliers, warehouses, and locations.
- Staff can receive goods and issue goods with no inventory corruption.
- Every stock change has a movement record, timestamp, actor, reference, and reason.
- Users can see on-hand stock per warehouse and product, including low-stock alerts.
- Manager can prepare purchase orders and receive goods partially.
- Unauthorized users cannot access or mutate another organization's records.
- Two users issuing the final units simultaneously cannot both succeed.
- Dashboard and exports match the ledger and stock balances.

### 1.3 Explicit scope decisions
**Initial architecture:** one organization per deployment is the simplest learning path. This blueprint nevertheless includes `organization_id` so that multi-tenant support can be introduced safely. If building SaaS from day one, enforce strict organization scoping everywhere, not merely in the frontend.

**Inventory model:** stock quantity tracked by **product + warehouse + optional bin/location**. Do not start with batches, serial numbers, expiration, reservations, manufacturing, POS, accounting integration, or multiple currencies; these are phase-two options.

**Stock policy:** on-hand quantities may never be negative in MVP. Stock can change only via posted operations. Drafts do not affect inventory. Posted documents are immutable; corrections are reversal/adjustment movements.

**Units:** choose a base stock unit per product (e.g., pieces). MVP quantities are whole numbers. Fractional kg/liters can be added later with decimal quantities and documented precision/conversion rules.

**Valuation:** reports initially show quantities and reference purchase prices; financial inventory valuation is explicitly **not** an MVP accounting guarantee. Later introduce FIFO or weighted-average cost layers if required.

---

## 2. Problem statement and goals

### Business problems
1. Spreadsheets become inconsistent when several staff edit stock.
2. Product quantities lack a reliable history or audit trail.
3. Businesses learn too late that high-demand items are out of stock.
4. Purchases, stock receipts, sales/issues, and inter-warehouse transfers are disconnected.
5. Inventory managers spend time assembling reports manually.

### Functional goals
- Searchable product catalog with SKU and barcode support.
- Stock visibility across warehouses and bins.
- Repeatable, verifiable workflows for receiving, issuing, transferring, and correcting stock.
- Supplier directory and purchase order lifecycle.
- Reorder thresholds and reporting.
- Role-based authorization and audit trail.

### Non-functional goals
- Correctness before cleverness; database is authoritative.
- Consistent JSON API with pagination, validation, and predictable errors.
- Responsive UI accessible on desktop/tablet/mobile.
- Recoverable backups and observable failures.
- Well-tested stock-posting service, including concurrency.

---

## 3. Feature scope and priority

| Module | MVP (P0) | Later (P1/P2) |
|---|---|---|
| Authentication | Login/logout, password reset, staff invitations | MFA, SSO |
| Roles | Admin, Manager, Staff, Viewer | Custom permissions |
| Products | SKU, name, category, unit, active status, search | Variants, images, barcodes, bulk import |
| Suppliers | CRUD, contact details | Supplier scorecards |
| Warehouses | Warehouses + optional bin code | Hierarchical locations |
| Inventory | Stock summary, movement ledger, availability checks | Reservations, cycle counts |
| Stock operations | Receive, issue, transfer, adjustment | Returns, damaged stock flow |
| Purchasing | PO draft, submit, partial receiving, close | Approvals, supplier invoices |
| Alerts | Low-stock list, dashboard warning | Scheduled email alerts |
| Reporting | Stock on hand, movements, receipts/issues, CSV | Advanced analytics, PDF |
| Audit | Event logs for sensitive actions | Tamper-evident audit export |
| Admin | Organization settings, users | Multi-org plans, billing |

### Deliberately excluded from MVP
Customer orders and payment collection, taxation/VAT accounting, credit notes, manufacturing BOM, pick-pack-ship logistics, third-party marketplace synchronization, offline stock posting, demand forecasting, automatic procurement, and IoT barcode equipment integration.

---

## 4. Technology stack

| Layer | Choice | Why |
|---|---|---|
| Language | Python 3.12+ (verify compatibility before pinning) | Mature backend ecosystem |
| Backend | Django + Django REST Framework | ORM, migrations, admin, permissions, APIs |
| Backend style | Modular Django monolith with service layer | Fewer moving parts, strong transaction control |
| Database | PostgreSQL | ACID transactions, constraints, row locks |
| Frontend | React + TypeScript + Vite | Typed, responsive SPA |
| Styling | Tailwind CSS | Consistent UI building blocks |
| UI components | shadcn/ui or equivalent accessible components | Dialogs, tables, forms |
| Routing | React Router | Nested authenticated routes |
| Server state | TanStack Query | Caching, mutations, invalidation |
| Forms | React Hook Form + Zod | Client-side typed validation |
| HTTP | Axios or typed fetch wrapper | Centralized errors, CSRF headers |
| Charts | Recharts | Dashboard plots |
| API schema | drf-spectacular / OpenAPI | API documentation, optional type generation |
| Testing backend | pytest + pytest-django | Database and service tests |
| Testing frontend | Vitest + React Testing Library | Components and hooks |
| E2E | Playwright | Business-flow browser tests |
| Formatting/linting | Ruff, ESLint, Prettier | Predictable code quality |
| Local development | Docker Compose | PostgreSQL + app parity |
| Web hosting | Nginx + Gunicorn (WSGI) | Straightforward deployment |
| CI | GitHub Actions | Lint, tests, migrations checks |
| Background jobs | Optional Celery + Redis in P1 | Scheduled notifications and exports |

**Version policy:** use supported releases of Django/DRF, PostgreSQL, Node, React, and dependencies at setup time. Lock exact versions in requirements/lockfiles, run a compatibility check, and automate security updates. Do not blindly install `latest` in production.

**Authentication choice:** For a first-party React SPA on the same site/origin, use **Django session authentication with Secure, HttpOnly, SameSite cookies and CSRF protection**, avoiding tokens in localStorage. If the frontend and API use separate origins, configure CORS, cookie domain/SameSite, HTTPS, and CSRF carefully; JWT with short-lived access tokens and protected refresh cookies is an alternative, not a default requirement.

---

## 5. High-level architecture

```mermaid
flowchart TD
    U[Browser / React SPA] --> N[Nginx / TLS]
    N -->|static assets| S[Built frontend files]
    N -->|/api/v1/*| D[Django REST Framework]
    D --> A[Authentication + RBAC + Tenant Scope]
    A --> V[Serializers / API Views]
    V --> L[Domain Services]
    L --> P[(PostgreSQL)]
    L --> E[Audit Events + Movement Ledger]
    E --> P
    D --> O[OpenAPI Schema]
    L -. optional scheduled work .-> C[Celery]
    C -.-> R[(Redis)]
```

**Request flow:** frontend submits a command → API authenticates and authorizes → serializer validates input shape → **domain service** enforces business rules → PostgreSQL transaction locks relevant balances, posts ledger entries, updates materialized balances and document status → API returns persisted result → UI invalidates relevant caches.

**Architecture rule:** Business rules for posting stock must not be duplicated in React components, serializers, signals, or viewsets. Put them in explicit service functions. Django signals are not the right place for critical stock mutations.

---

## 6. Monorepo structure

```text
inventory-management/
├── README.md
├── .env.example
├── .gitignore
├── docker-compose.yml
├── docs/
│   ├── architecture.md
│   ├── database.md
│   ├── api-contract.md
│   ├── permissions.md
│   └── deployment.md
├── backend/
│   ├── pyproject.toml
│   ├── manage.py
│   ├── config/
│   │   ├── settings/{base,local,production}.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   ├── apps/
│   │   ├── accounts/       # custom User, membership, auth
│   │   ├── organizations/  # Organization, settings
│   │   ├── catalog/        # Product, category, units
│   │   ├── partners/       # Supplier
│   │   ├── warehouses/     # Warehouse, StorageLocation
│   │   ├── inventory/      # Balance, movement, posting services
│   │   ├── purchasing/     # Purchase orders + receiving
│   │   ├── reporting/      # SQL queries, reports, exports
│   │   └── audit/          # AuditEvent
│   └── tests/
│       ├── unit/
│       ├── integration/
│       └── concurrency/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── app/            # providers, router
│   │   ├── components/     # shared UI
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   ├── products/
│   │   │   ├── suppliers/
│   │   │   ├── warehouses/
│   │   │   ├── inventory/
│   │   │   ├── purchasing/
│   │   │   ├── reports/
│   │   │   └── settings/
│   │   ├── lib/            # API client, formatters
│   │   └── types/
│   └── tests/
├── infra/
│   ├── nginx/
│   └── scripts/
└── .github/workflows/ci.yml
```

---

## 7. Roles and permissions

| Action | Admin | Manager | Staff | Viewer |
|---|:---:|:---:|:---:|:---:|
| View catalog/stock | ✓ | ✓ | ✓ | ✓ |
| Manage products/suppliers | ✓ | ✓ | — | — |
| Create purchase orders | ✓ | ✓ | — | — |
| Submit/close PO | ✓ | ✓ | — | — |
| Receive stock against PO | ✓ | ✓ | ✓ | — |
| Issue or transfer stock | ✓ | ✓ | ✓ | — |
| Manual stock adjustment | ✓ | ✓ | — | — |
| View reports | ✓ | ✓ | limited | ✓ |
| Manage users/roles | ✓ | — | — | — |
| View audit log | ✓ | ✓ | — | ✓ |

Implementation: `Membership(user, organization, role)` and custom DRF permission classes such as `HasOrgRole`, with **both queryset filtering and per-object checks**. If restricting staff to warehouses, add `WarehouseAssignment` and enforce it in services too. Do not trust organization IDs from user-submitted request bodies as proof of access.

---

## 8. Data model

### 8.1 Design conventions
- Use UUID primary keys for public objects (or BigInt IDs internally with public UUIDs).
- All business-owned rows have `organization_id`; index it and enforce cross-entity organization consistency in service validation.
- Use `created_at`, `updated_at` (UTC timestamps); add `created_by` where relevant.
- Currency amounts use `NUMERIC(14,2)` / Django `DecimalField`; never Python floats for money.
- Product SKU unique **per organization**; location code unique **per warehouse**.
- No hard delete of posted transactions or referenced products. Deactivate/archive instead.
- Financial/business documents use independent human-readable sequences; do not depend on random UUID order.
- PostgreSQL check/unique constraints protect invariants in addition to service validation.

### 8.2 Tables and important fields

#### Identity and master data

| Table | Fields | Constraints / notes |
|---|---|---|
| `organizations` | `id`, `name`, `slug`, `base_currency`, `created_at` | Unique slug |
| `users` | `id`, `email`, `password`, `is_active`, `date_joined` | Custom Django user from first migration |
| `memberships` | `id`, `organization_id`, `user_id`, `role`, `is_active` | Unique `(organization_id, user_id)` |
| `categories` | `id`, `organization_id`, `name`, `parent_id?` | Avoid cycles if hierarchy used |
| `units` | `id`, `organization_id`, `code`, `name` | e.g., `PCS` |
| `products` | `id`, `organization_id`, `sku`, `name`, `description`, `category_id?`, `unit_id`, `barcode?`, `reorder_level`, `default_purchase_price`, `is_active` | Unique `(organization_id, sku)`; reorder ≥ 0 |
| `suppliers` | `id`, `organization_id`, `name`, `email?`, `phone?`, `address?`, `is_active` | Tenant-scoped |
| `warehouses` | `id`, `organization_id`, `code`, `name`, `address?`, `is_active` | Unique `(organization_id, code)` |
| `storage_locations` | `id`, `organization_id`, `warehouse_id`, `code`, `name?`, `is_active` | Unique `(warehouse_id, code)`; MVP default bin `MAIN` |

#### Inventory and operations

| Table | Fields | Constraints / notes |
|---|---|---|
| `inventory_balances` | `id`, `organization_id`, `product_id`, `location_id`, `on_hand`, `updated_at` | Unique `(organization_id, product_id, location_id)`, `on_hand >= 0` |
| `stock_documents` | `id`, `organization_id`, `document_no`, `type`, `status`, `source_location_id?`, `destination_location_id?`, `reason?`, `reference?`, `posted_at?`, `posted_by?`, `created_by` | type = RECEIVE/ISSUE/TRANSFER/ADJUST; status = DRAFT/POSTED/VOID_DRAFT; unique org + doc no |
| `stock_document_lines` | `id`, `document_id`, `product_id`, `quantity`, `unit_cost?`, `adjustment_direction?` | `quantity > 0`; for adjustments direction IN/OUT; no duplicate product per doc/location (or aggregate explicitly) |
| `stock_movements` | `id`, `organization_id`, `document_id`, `document_line_id`, `product_id`, `location_id`, `delta_quantity`, `quantity_after`, `occurred_at`, `actor_id`, `reference?` | Append-only. Incoming positive, outgoing negative. Non-zero delta. Index product/location/time |
| `purchase_orders` | `id`, `organization_id`, `po_number`, `supplier_id`, `status`, `order_date`, `expected_date?`, `created_by`, `submitted_at?`, `closed_at?` | DRAFT/ORDERED/PARTIALLY_RECEIVED/RECEIVED/CANCELLED/CLOSED |
| `purchase_order_lines` | `id`, `purchase_order_id`, `product_id`, `ordered_qty`, `unit_price` | `ordered_qty > 0`, `unit_price >= 0`; unique product or support multiple lines |
| `goods_receipts` | `id`, `organization_id`, `receipt_number`, `purchase_order_id`, `warehouse_id`, `location_id`, `status`, `posted_at?`, `created_by` | DRAFT/POSTED/VOID_DRAFT |
| `goods_receipt_lines` | `id`, `goods_receipt_id`, `purchase_order_line_id`, `received_qty` | Positive, sum across POSTED receipts ≤ ordered quantity unless approved over-receiving |
| `audit_events` | `id`, `organization_id`, `actor_id?`, `action`, `entity_type`, `entity_id`, `before_json?`, `after_json?`, `ip_address?`, `created_at`, `request_id?` | Append-only, redact secrets / personal data |
| `idempotency_records` | `id`, `organization_id`, `actor_id`, `key`, `endpoint`, `request_hash`, `response_json`, `created_at` | Unique `(organization_id, actor_id, endpoint, key)`; retention policy |

**Why both `stock_movements` and `inventory_balances`?** Movements are the append-only historical source of truth. Balance rows are a transactionally updated materialized view for fast reads. A reconciliation job must be able to recompute balances from the movement ledger.

### 8.3 Entity relationship diagram

```mermaid
 erDiagram
    ORGANIZATION ||--o{ MEMBERSHIP : contains
    USER ||--o{ MEMBERSHIP : joins
    ORGANIZATION ||--o{ PRODUCT : owns
    CATEGORY ||--o{ PRODUCT : groups
    UNIT ||--o{ PRODUCT : measures
    ORGANIZATION ||--o{ SUPPLIER : owns
    ORGANIZATION ||--o{ WAREHOUSE : owns
    WAREHOUSE ||--o{ STORAGE_LOCATION : contains
    PRODUCT ||--o{ INVENTORY_BALANCE : has
    STORAGE_LOCATION ||--o{ INVENTORY_BALANCE : holds
    STOCK_DOCUMENT ||--|{ STOCK_DOCUMENT_LINE : contains
    STOCK_DOCUMENT_LINE ||--o{ STOCK_MOVEMENT : posts
    PRODUCT ||--o{ STOCK_MOVEMENT : moved
    STORAGE_LOCATION ||--o{ STOCK_MOVEMENT : affected
    SUPPLIER ||--o{ PURCHASE_ORDER : supplies
    PURCHASE_ORDER ||--|{ PURCHASE_ORDER_LINE : contains
    PURCHASE_ORDER ||--o{ GOODS_RECEIPT : fulfilled_by
    GOODS_RECEIPT ||--|{ GOODS_RECEIPT_LINE : contains
    PURCHASE_ORDER_LINE ||--o{ GOODS_RECEIPT_LINE : received_against
```

A transfer creates two movements per line: negative delta at source, positive delta at destination; the sum across the pair equals zero. A goods receipt posts its corresponding stock movements using a shared document/reference linkage, e.g. a `stock_document_id` on `goods_receipts` that is unique and nullable before posting. **Add that field when implementing purchasing.**

### 8.4 Suggested indexes

```sql
CREATE UNIQUE INDEX uq_org_sku ON products (organization_id, sku);
CREATE UNIQUE INDEX uq_balance ON inventory_balances (organization_id, product_id, location_id);
CREATE INDEX ix_movement_product_location_time
  ON stock_movements (organization_id, product_id, location_id, occurred_at DESC);
CREATE INDEX ix_po_org_status ON purchase_orders (organization_id, status);
CREATE INDEX ix_doc_org_status_date ON stock_documents (organization_id, status, created_at DESC);
```

Use Django model constraints/migrations as the actual authoritative mechanism; SQL here illustrates intended schema. Also index foreign keys used by list filters, and benchmark queries before adding speculative indexes.

---

## 9. Core inventory rules — critical section

### 9.1 Definitions
- **On hand**: units physically recorded at a location (balance table).
- **Incoming**: posted receipt or inbound adjustment increases on hand.
- **Outgoing**: posted issue or outbound adjustment decreases on hand.
- **Transfer**: a single atomic operation from one location to another.
- **Available**: equal to on hand in MVP (no reservations). In P1, `available = on_hand - reserved`.
- **Low stock**: aggregate on-hand across relevant warehouses (or configurable per warehouse) is at or below product reorder level; document the exact rule in UI.

### 9.2 Invariants
1. No stock changes outside the `post_*` services.
2. Drafts never change balances; posted documents cannot be edited or reposted.
3. Every balance change creates a matching movement in the **same DB transaction**.
4. A product/location balance cannot be negative.
5. Source and destination in a transfer must differ.
6. Operation actor must be active and authorized for the organization and warehouses.
7. Duplicate submissions with the same idempotency key must return the same outcome, not repost stock.
8. Cross-org product/location/document combinations must be rejected.
9. All movement quantities are integers in MVP; no silently rounded fractional quantities.
10. The sum of ledger deltas for each product/location equals its balance (including any migrated opening-balance movement).

### 9.3 Atomic posting algorithm

```text
POST STOCK ISSUE(document_id, idempotency_key)
  validate authenticated actor, organization, role and warehouse access
  BEGIN TRANSACTION
    lock idempotency key record or establish unique key safely
    lock stock document row FOR UPDATE
    if already POSTED: return existing post result (for identical request)
    assert status DRAFT; validate every line and organization consistency
    canonicalize affected (product_id, location_id) keys; sort deterministically
    create missing balance rows safely using uniqueness/upsert where needed
    lock all affected balance rows FOR UPDATE in sorted order
    ensure outgoing amounts do not exceed on_hand
    for each affected balance:
       update on_hand
       insert stock movement with signed delta and quantity_after
    update stock document to POSTED, posted_by, posted_at
    create audit event
    persist idempotent response
  COMMIT
  return posted document
```

For production, implement duplicate-request handling around a unique idempotency key and request hash; retries after a conflicting in-progress request must wait/read committed result or return an explicit retryable conflict. On failure, the **entire** transaction rolls back. Locking rows in a consistent order reduces deadlocks. Retry detected deadlocks with bounded backoff only when the operation is safely idempotent.

**Concurrent example:** There are 5 units of SKU-101. User A issues 4 and user B issues 3. Their transactions serialize on the same balance row; only one succeeds. The other receives HTTP `409 CONFLICT` with an `INSUFFICIENT_STOCK` error.

### 9.4 Business workflows

#### Product creation
Create unit/category if required → check SKU uniqueness → save product → no inventory is created by the product CRUD endpoint. An opening balance must be posted as a receipt or authorized adjustment with reason `OPENING_BALANCE`.

#### Receiving stock (unlinked)
Create receipt draft → add line items and target location → validate → post → positive movement(s) + balances updated → audit event.

#### Issuing stock
Create issue draft → add lines and source location → validate sufficient stock → post → negative movement(s) + balances updated → audit.

#### Transferring stock
Create transfer draft with source and destination → validate nonidentical locations → lock both balances → subtract source and add destination → insert both movements → post once. No intermediate visible state.

#### Adjustments
Manager selects product, location, direction and reason (`DAMAGED`, `COUNT_CORRECTION`, etc.) → requires explanation → post delta → audit event. Never overwrite `on_hand` directly. To set an absolute counted quantity, calculate delta while holding the row lock, then post that delta.

#### Purchasing
Create purchase order → add supplier/products/quantities/prices → submit ORDERED → create goods receipt against PO → receive a partial/full quantity → post movements → update derived received quantities and PO status **in the same transaction**. After all lines received, mark RECEIVED. Cancel only before any posting, otherwise CLOSE remainder under explicit policy.

#### Reversal/correction
Do not mutate old stock movements. Create a linked reversal document with opposite movements, validating that reversal would not make stock negative; if it would, require further operational resolution. Add `reverses_document_id` for this enhancement before launching corrections in production.

### 9.5 Sample quantities

| Action | Warehouse A | Warehouse B | Ledger changes |
|---|---:|---:|---|
| Opening receipt +20 into A | 20 | 0 | A +20 |
| Issue 5 from A | 15 | 0 | A -5 |
| Transfer 4 A → B | 11 | 4 | A -4, B +4 |
| Adjust 1 damaged from B | 11 | 3 | B -1 |

Result: on-hand total = 14; net posted movement deltas = +14.

---

## 10. API design

Base path: `/api/v1/`; paginated list format: `{count, next, previous, results}`. Require authentication by default. Apply tenant scoping and role checks to **every** endpoint. Server calculates totals; client-provided totals are not trusted.

### 10.1 Authentication and administration

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/login/` | Authenticate; establish session |
| POST | `/auth/logout/` | Invalidate session |
| GET | `/auth/me/` | Current user + memberships |
| POST | `/auth/password-reset/request/` | Request reset with enumeration-safe response |
| POST | `/auth/password-reset/confirm/` | Confirm reset |
| GET/POST | `/organizations/{org_id}/members/` | List/invite authorized members |
| PATCH | `/organizations/{org_id}/members/{id}/` | Change role/activation |

### 10.2 Catalog and stock

| Method | Endpoint | Description |
|---|---|---|
| GET/POST | `/products/` | List/create products |
| GET/PATCH | `/products/{id}/` | Detail/update; no delete if referenced |
| GET/POST | `/categories/` | Category management |
| GET/POST | `/suppliers/` | Supplier management |
| GET/POST | `/warehouses/` | Warehouse management |
| GET/POST | `/warehouses/{id}/locations/` | Bin management |
| GET | `/inventory/balances/` | Filter product, warehouse, location, low_stock |
| GET | `/inventory/movements/` | Immutable history, filter by type/date/product |
| GET/POST | `/stock-documents/` | List/create operation drafts |
| GET/PATCH | `/stock-documents/{id}/` | Details / edit draft |
| POST | `/stock-documents/{id}/post/` | Atomic posting; require `Idempotency-Key` header |
| POST | `/stock-documents/{id}/void-draft/` | Cancel unposted draft |

### 10.3 Purchasing and reporting

| Method | Endpoint | Description |
|---|---|---|
| GET/POST | `/purchase-orders/` | List/create purchase orders |
| GET/PATCH | `/purchase-orders/{id}/` | Detail/edit draft |
| POST | `/purchase-orders/{id}/submit/` | Move to ORDERED |
| POST | `/purchase-orders/{id}/close/` | Close remaining quantity |
| GET/POST | `/goods-receipts/` | List/create goods-receipt drafts |
| POST | `/goods-receipts/{id}/post/` | Receive and post purchase inventory |
| GET | `/dashboard/summary/` | Product counts, low stock, recent movements |
| GET | `/reports/stock-on-hand/` | Filtered warehouse inventory |
| GET | `/reports/movement-summary/` | Date range summary |
| GET | `/reports/low-stock/` | At/below reorder threshold |
| GET | `/reports/stock-on-hand/export.csv` | Role-limited CSV export |
| GET | `/audit-events/` | Authorized paginated audit log |

### 10.4 Sample payloads

**Create product:**

```json
{
  "sku": "USB-C-001",
  "name": "USB-C Cable 1m",
  "category_id": "<category-uuid>",
  "unit_id": "<unit-uuid>",
  "reorder_level": 15,
  "default_purchase_price": "250.00",
  "is_active": true
}
```

**Stock issue draft:**

```json
{
  "type": "ISSUE",
  "source_location_id": "<location-uuid>",
  "reason": "Customer order #1002",
  "lines": [
    { "product_id": "<product-uuid>", "quantity": 3 }
  ]
}
```

**Post operation:**

```http
POST /api/v1/stock-documents/<document-uuid>/post/
Idempotency-Key: 2ec6bd8d-f8ab-44a2-bad5-8a61b309e87b
Cookie: sessionid=...
X-CSRFToken: <csrf-token>
```

**Success response:**

```json
{
  "id": "<document-uuid>",
  "status": "POSTED",
  "posted_at": "2026-10-15T09:10:00Z",
  "movements_created": 1
}
```

**Error convention:**

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Only 2 units are available in the selected location.",
    "fields": { "lines.0.quantity": ["Requested quantity exceeds on-hand stock."] },
    "request_id": "<request-id>"
  }
}
```

Status policy: `400` invalid syntax/validation, `401` unauthenticated when authentication scheme supports it, `403` forbidden, `404` missing/not visible, `409` business conflict, `429` rate-limited, `500` unexpected. Never leak stack traces in responses.

### 10.5 Filtering and pagination
- Search products by normalized SKU/name/barcode.
- Filter balances by warehouse, category, and below-threshold status.
- Paginate every potentially large endpoint; cursor pagination for ledger is preferable at scale.
- Sort with explicit safe allowlists to prevent accidental expensive queries.

---

## 11. UI/UX and page plan

### Navigation map

```text
/login
/app/dashboard
/app/products
/app/products/new
/app/products/:id
/app/categories
/app/suppliers
/app/warehouses
/app/warehouses/:id/locations
/app/inventory/stock
/app/inventory/movements
/app/inventory/receive
/app/inventory/issue
/app/inventory/transfer
/app/inventory/adjust
/app/purchase-orders
/app/purchase-orders/new
/app/purchase-orders/:id
/app/goods-receipts/new
/app/reports
/app/settings/profile
/app/settings/team
/app/audit-log
```

### Key screen specifications

**Dashboard:** summary cards (active SKUs, on-hand units, low-stock SKUs, pending POs); recent movements; reorder list; links to receive/issue. Clearly label counts vs financial totals.

**Products:** searchable/filterable table; SKU, product, category, unit, reorder level, status; add/edit dialog/page; view inventory by warehouse and movement history. Do not show a direct editable stock quantity field.

**Stock overview:** grouped warehouse/location balances, filter by product/location; export. Show zero-stock SKUs when requested with an outer join or dedicated query.

**Receive / issue form:** source or destination selector, add/remove line items, SKU autocomplete, quantity validation, current balance preview, reason, save draft and post confirmation. Clearly state that **Post** changes inventory irreversibly (except through a new reversal).

**Transfers:** from/to selectors, product lines, available quantity preview, confirmation. Display both movement halves in history.

**Purchase orders:** supplier selector, products with quantities/prices, draft editing, submit, receive against PO, remaining quantities, lifecycle badge.

**Reports:** filter range, warehouses/products, on-hand and low-stock tables, CSV export.

**System UX:** skeletons for loading; actionable empty states; inline errors; navigation guard for unsaved drafts; accessible keyboard controls and contrast; responsive tables with filters on mobile; never rely only on badge color for status.

---

## 12. Frontend architecture

Recommended feature package pattern:

```text
features/inventory/
  api/inventoryApi.ts
  hooks/useBalances.ts
  hooks/usePostStockDocument.ts
  components/StockDocumentForm.tsx
  components/StockMovementTable.tsx
  pages/StockOverviewPage.tsx
  pages/IssueStockPage.tsx
  schemas/stockDocument.schema.ts
  types.ts
```

### State separation
- **TanStack Query:** remote products, balances, documents, purchase orders, reports.
- **React Hook Form:** local form state, validation and dirty indicators.
- **Context or small Zustand store (optional):** current organization, sidebar and UI preferences only.
- **Backend:** final authority for stock, permissions and document status.

### Query keys and invalidation

```typescript
const keys = {
  products: (filters: Record<string, unknown>) => ["products", filters] as const,
  balances: (filters: Record<string, unknown>) => ["balances", filters] as const,
  movements: (filters: Record<string, unknown>) => ["movements", filters] as const,
  dashboard: ["dashboard"] as const,
};

// After a successful POST stock document:
// invalidate balances, movements, relevant document details, dashboard, reports.
// Do not optimistically assume posting succeeded: backend may reject due to concurrent stock changes.
```

Important: scoped query keys must include active organization ID when multi-org support is enabled. Clear or isolate caches on logout and organization switch to prevent stale information from a previous context being displayed.

---

## 13. Backend implementation guidelines

### Responsibility split
- **Models:** schema, basic field constraints, relationships.
- **Serializers:** request/response shape and validation of individual fields.
- **Permissions:** user access, role checks, warehouse scope.
- **ViewSets:** HTTP orchestration and status codes.
- **Services:** business commands: `post_receipt`, `post_issue`, `post_transfer`, `post_adjustment`, `post_goods_receipt`.
- **Selectors/queries:** read-only complex queries: balances, low stock, PO outstanding quantity.
- **Audit:** record commands and privileged settings changes; append in transaction where critical.

### Partial Django service sketch (illustrative, not copy-paste complete)

```python
from django.db import transaction
from django.core.exceptions import ValidationError

@transaction.atomic
def post_issue(document_id, actor, idempotency_key):
    # Resolve active membership and permission for this document's organization.
    # Lock idempotency claim and document safely; check identical request hash.
    document = (
        StockDocument.objects.select_for_update()
        .get(id=document_id, type="ISSUE")
    )
    if document.status != "DRAFT":
        raise ValidationError("Document is not an editable draft")

    # Validate all lines, tenant membership, product status and location access.
    # Aggregate requested quantity by product+location.
    # Lock balance rows in stable order (create missing rows safely as necessary).
    # Check stock sufficiency, then update balance and append one movement per line.
    # Set posted metadata and create audit event, all in THIS transaction.
    # Implement duplicate request handling using idempotency key + request hash.
    raise NotImplementedError("Implement complete validated posting service")
```

**Do not ship this sketch:** it intentionally leaves security-critical and accounting-critical operations unimplemented. Add database-backed service tests before connecting the public endpoint.

### Validation checklist
- SKU uniqueness scoped to org; case-insensitive normalization policy (`upper()` for SKU) applied consistently.
- Prevent inactive product, inactive warehouse or mismatched location from stock posting.
- Enforce `quantity > 0`, `reorder_level >= 0`, `unit_price >= 0`.
- Cross-organization FK combinations forbidden in service layer even if individual FKs exist.
- All posted movements and audit records are immutable to application users.
- Re-posting a document is rejected unless it is a verified retry of the same idempotent request.

---

## 14. Security model

1. HTTPS/TLS everywhere in production, HSTS when appropriate.
2. Environment-provided secret key; separate prod/test/dev values; no secrets in repository.
3. Session cookie `Secure`, `HttpOnly`, `SameSite=Lax` (or documented alternative); CSRF for writes.
4. Strong password hashing via Django defaults and password validators; reset tokens single use / expiring.
5. Server-side permission checks and tenant filters for every read and write, including exports.
6. Rate limits login/password reset, plus suspicious repeated failures.
7. Validate serializers, restrict uploads, inspect MIME/content and size; use safe object keys.
8. Parameterized ORM queries, escape rendered user content, no dangerously injected HTML.
9. CORS allowlist only if needed; no wildcard credentials origins.
10. Never log passwords, authentication cookies, reset tokens, full sensitive records or raw secrets.
11. Return `404` when an object is outside the user's organization rather than exposing its existence.
12. Maintain audit trails for posting, permission changes and sensitive configuration updates.
13. CSV exports defend against spreadsheet formula injection for text fields beginning with `=`, `+`, `-`, `@` (escape properly according to chosen CSV consumer policy).
14. Apply dependency scanning, backups and least privilege DB account.
15. Prevent staff from changing role via mass assignment; explicit serializer field whitelists.

**Production hardening:** define session timeouts, device/session revocation policy, incident handling, key rotation, backup retention, and account recovery processes before real business use.

---

## 15. Testing strategy

### 15.1 Unit tests
- SKU normalization and product validation.
- Low stock calculation and threshold boundary conditions.
- Permission decisions by role.
- Document state-transition validators.
- Quantity aggregation, zero/negative rejection, transfer source≠destination.

### 15.2 Database/service integration tests (must-have)

| Test | Expected result |
|---|---|
| Receive 20 | Balance +20, one positive movement |
| Issue 5 from 20 | Balance 15, one negative movement |
| Issue 21 from 20 | HTTP 409, no changes |
| Transfer 4 A→B | A -4, B +4, two movements in one commit |
| Same post submitted twice with same key | No duplicated stock, stable result |
| Post operation after posted | Correct error/no second posting |
| Failed partial operation | All balances and movements roll back |
| Staff posts forbidden adjustment | 403 and no state change |
| Org A queries Org B data | No leakage (404/empty list) |
| Partial PO receipt | Remaining qty and status correct |
| Receive beyond outstanding PO qty | 409 and no changes |
| Concurrent issues exceed stock | Exactly one succeeds; stock never negative |
| Ledger reconciliation | Summed movement deltas equal balance rows |

**Concurrency test:** use a PostgreSQL-backed transactional integration test with two independent database connections/processes and real row locking. SQLite does **not** reproduce PostgreSQL locking semantics; do not claim concurrency safety from SQLite tests.

### 15.3 Frontend tests
- Login/access redirects; role-based navigation.
- Product create/edit validation.
- Posting form error and success states.
- Confirmation dialogs and duplicate-click prevention.
- Query invalidation refreshes inventory after posting.
- Accessibility smoke checks for dialogs/forms.

### 15.4 E2E acceptance scenarios
1. Admin creates warehouse, product and supplier.
2. Manager creates PO for 100, receives 40, then 60; PO ends RECEIVED.
3. Warehouse staff issues 5 units; dashboard shows accurate count.
4. Staff transfers stock across two warehouses; both balances update.
5. Viewer can view reports but cannot post an adjustment.
6. Low stock alert appears when quantity reaches threshold.

---

## 16. Development environment and setup

### Prerequisites
- Python supported by chosen Django version; PostgreSQL; Node.js supported by current Vite; Git; Docker Engine + Compose (optional but recommended).
- Inspect `python --version`, `node --version`, `npm --version`, `docker --version`, `docker compose version`.

### Bootstrap sequence

```bash
mkdir inventory-management && cd inventory-management
git init
mkdir backend frontend docs infra
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install django djangorestframework psycopg[binary] django-filter drf-spectacular
# Pin versions and record dependencies in pyproject.toml / lockfile.
django-admin startproject config backend
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install @tanstack/react-query react-router-dom axios react-hook-form zod @hookform/resolvers
```

**Note:** The sample Django `startproject` command assumes the `backend/` directory is available and Python environment is active; create Django apps after project creation. Select one pinned dependency workflow (e.g. uv/pyproject or pip-tools), and do not mix lockfile approaches. Use `django-admin startproject config backend` from repo root when backend contains only the environment and no conflicting project files.

### Local `.env.example`

```dotenv
# Backend
DJANGO_DEBUG=true
DJANGO_SECRET_KEY=replace-me-local-only
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DATABASE_URL=postgresql://inventory:inventory@localhost:5432/inventory_db
FRONTEND_ORIGIN=http://localhost:5173
# Frontend
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

For cross-origin local sessions (`localhost:5173` ↔ `localhost:8000`), configure credentialed requests, trusted CSRF origin(s), cookies and CORS appropriately. **Simpler option:** use Vite dev proxy `/api` → Django and serve same-origin routes in production; document CSRF token acquisition.

### Local workflow
1. Start PostgreSQL and create dev database.
2. Configure environment variables.
3. Create custom `User` model **before first migration**.
4. `python manage.py makemigrations && python manage.py migrate`.
5. Create admin/seed organization + membership (idempotent management command).
6. `python manage.py runserver` and `npm run dev`.
7. Seed sample products, suppliers, warehouses and inventory using **posted opening balance documents**, not direct SQL quantity updates.

---

## 17. Step-by-step implementation roadmap

**Time estimates:** indicative solo-developer workdays, not a delivery commitment. Actual duration depends on experience and testing depth. Each phase is a working milestone with its own acceptance gate.

| Phase | Deliverables | Est. workdays | Acceptance gate |
|---|---|---:|---|
| 0. Specification | user stories, scope, flowcharts, wireframes, ERD | 2–3 | Roles, workflows, MVP frozen |
| 1. Setup | monorepo, Docker DB, settings, CI/lint | 1–2 | local apps and tests run |
| 2. Auth/tenancy | custom user, organizations, memberships, auth | 3–4 | login and authorization tests pass |
| 3. Master data | categories, units, products, suppliers, warehouses, locations | 4–5 | CRUD with org scope and validations |
| 4. Inventory engine | balances, documents, ledger, atomic posting | 6–9 | ledger invariants and concurrency tests pass |
| 5. Inventory UI | stock overview, receive/issue/transfer/adjust | 5–7 | end-to-end stock flows correct |
| 6. Purchasing | PO lifecycle, receipts, partial receiving | 4–6 | remaining qty/PO status correct |
| 7. Dashboard/reports | low stock, KPI cards, movement/CSV reports | 3–5 | reconciles with ledger |
| 8. Audit/security | audit viewer, access, rate limits, validation hardening | 3–5 | abuse/access tests pass |
| 9. QA/deploy | E2E, backup restore, logging, production release | 4–6 | launch checklist complete |

**Overall planning range:** ~35–52 focused workdays for a robust solo MVP. A smaller demonstration version (catalog + warehouses + receipts/issues + stock report) is possible in less time by intentionally omitting purchasing, full tenancy, advanced audit UI, and exports — not by skipping transactional correctness.

### Detailed phase task breakdown

#### Phase 0 — Product design
- [ ] Define user roles and sample business: e.g. electronics accessories wholesaler.
- [ ] Draw flows for add product, receive, issue, transfer, PO receiving.
- [ ] Decide single-org vs multi-org SaaS and bin/location granularity.
- [ ] Finalize document states and allowed transitions.
- [ ] Draw ERD and low-fidelity wireframes.

#### Phase 1 — Foundation
- [ ] Initialize backend/frontend and environment examples.
- [ ] Configure PostgreSQL, static assets, CORS/CSRF strategy.
- [ ] Add Ruff, ESLint/Prettier and pytest/Vitest setup.
- [ ] Add CI and health endpoint.

#### Phase 2 — Access
- [ ] Custom User model, memberships and admin bootstrapping.
- [ ] Login/logout/me/reset flow.
- [ ] Protect routes; enforce server-side RBAC + org scoping.
- [ ] Tests for cross-organization isolation.

#### Phase 3 — Catalog
- [ ] Product/category/unit/supplier/warehouse/location models.
- [ ] DRF serializers, permissions, filters, pagination, APIs.
- [ ] React tables and forms with search and validation.
- [ ] Seed command and sample catalog.

#### Phase 4 — Stock engine
- [ ] InventoryBalance, StockDocument, StockDocumentLine, StockMovement.
- [ ] Transactional receipt, issue, transfer, adjustment services.
- [ ] Stable row lock order, unique/upsert balance strategy.
- [ ] Idempotency records + safe retries.
- [ ] Comprehensive integration and concurrency tests.
- [ ] Ledger reconciliation management command.

#### Phase 5 — Stock screens
- [ ] Stock overview and per-product detail.
- [ ] Draft/post UX and confirmation modal.
- [ ] Movement history filters and clear failure states.
- [ ] Cache invalidation for balances/reports.

#### Phase 6 — Purchasing
- [ ] PO model, lines and lifecycle.
- [ ] Goods receipts tied to PO lines and stock documents.
- [ ] Prevent over-receipt; support partial receiving.
- [ ] Purchase order and receiving pages.

#### Phase 7 — Business insights
- [ ] Summary cards and filters.
- [ ] Low-stock report and reorder calculation.
- [ ] Stock movement / receiving reports.
- [ ] CSV exports and formula-injection protection.

#### Phase 8 — Hardening
- [ ] Role restriction review, audit events, secure password reset.
- [ ] Request IDs, structured logs, error monitoring.
- [ ] Rate limits and security headers.
- [ ] Accessibility and responsive UI checks.

#### Phase 9 — Release
- [ ] Create deployment environment and apply migrations.
- [ ] Configure HTTPS, persistent DB, static/media storage.
- [ ] Automated backup; perform restore drill.
- [ ] Run E2E regression, security and concurrency tests.
- [ ] Verify monitoring and alerting; release tagged version.

---

## 18. Deployment architecture

```mermaid
flowchart LR
   Browser[Web Browser] -->|HTTPS| Proxy[Nginx]
   Proxy -->|/| Static[React Static Build]
   Proxy -->|/api/v1| Django[Gunicorn + Django]
   Django --> Database[(Managed PostgreSQL)]
   Django -. optional .-> Object[(S3-compatible Storage)]
   Backup[Backup Process] --> Database
   Mon[Logs + Error Monitoring] -.-> Django
```

### Recommended hosting approach
For learning: use Docker Compose on a small VPS (Nginx, backend, PostgreSQL) with **persistent database volumes and backups**. For serious production: use managed PostgreSQL with automated backups and a separate app host. Avoid exposing PostgreSQL publicly.

### Deployment checklist
- [ ] `DEBUG=False`; secret key and database credentials in secrets manager/environment.
- [ ] `ALLOWED_HOSTS` and CSRF trusted origins exact.
- [ ] HTTPS redirect, secure cookies, appropriate CORS policy.
- [ ] Collected Django static assets and built frontend served correctly.
- [ ] Migrations run once per release under controlled deployment job.
- [ ] Database backups automated, encrypted and periodically restored in test.
- [ ] Application logs include request ID; errors are monitored.
- [ ] Health endpoint and external uptime checks enabled.
- [ ] Rollback plan considers backwards-compatible migrations.
- [ ] Test creating/receiving/issuing/transferring against production-like staging first.

---

## 19. Operational reports and key metrics

| Metric | Definition |
|---|---|
| Active SKUs | Count of active products |
| Total units on hand | Sum of all location balances; note mixed units makes the grand total informational only |
| Low-stock SKUs | Count below/at threshold using selected warehouse scope |
| Inventory by warehouse | Grouped on-hand by warehouse and product |
| Daily receipts | Sum positive receipt movement quantities by posting day |
| Daily issues | Absolute quantity of ISSUE movements by posting day |
| Net movement | Sum signed deltas across selected period |
| Purchase order outstanding | Ordered quantity minus posted received quantity per line |
| Movement audit | Who posted what, when, against which reference |

**Important:** Do not combine stock units from incomparable products as if they formed a meaningful financial metric. “Stock value” requires a defined accounting valuation method and should not be derived casually from last purchase price.

---

## 20. Risks, decisions and mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| Concurrent stock issue | Negative/incorrect quantities | `transaction.atomic` + row locks + DB constraints |
| Duplicate click / network retry | Double postings | Idempotency key + locked document state |
| Cross-tenant data leak | Severe confidentiality incident | Scoped querysets, service checks and automated tests |
| Rewriting posted movement | Broken audit trail | Append-only ledger; corrections by reversal |
| Wrong purchasing remainder | Over-receipt | Lock PO/receipt state; compute outstanding in transaction |
| Database restore failure | Business data loss | Automatic backups + tested restore drill |
| Decimal/multiple unit complexity | Stock errors | One base unit, integer quantity for MVP |
| Browser offline posting | Conflicts, duplicated work | No offline mutation in MVP; retry safely with idempotency |
| Scope creep | Delayed MVP | P0/P1 boundaries and phase acceptance gates |

---

## 21. Future enhancements (after MVP)

1. Barcode scanner integration (USB keyboard-style first, mobile camera later).
2. Product variants (size/color) and serial/batch/expiration tracking.
3. Reservations and fulfillment orders (`available = on_hand - reserved`).
4. Inventory cycle counts and counting sessions with discrepancy approval.
5. Weighted-average or FIFO inventory valuation and accounting integration.
6. Supplier lead times and recommended reorder quantities.
7. Approval workflows for high-value adjustments and purchase orders.
8. Returns / damaged or quarantined stock locations.
9. CSV bulk imports with preview/validation; supplier catalogs.
10. Email notifications with Celery and Redis; real-time live dashboard only when needed.
11. Multi-organization SaaS billing, per-warehouse staff permissions.
12. Detailed stock forecasting and anomaly detection (optional, not necessary for core project).

---

## 22. Suggested milestones and Git workflow

Use `main` for stable releases and `develop` for integration if working in a team. Feature branches such as `feature/inventory-posting-service` and PRs into `develop` are practical; release the tested integration branch into `main`. For a solo project, `main` + feature branches is often sufficient. Avoid mixing unreviewed DB schema and API contract changes.

### Example milestones
- **M1:** Repository, access, roles and master-data API complete.
- **M2:** Posted receipt/issue/transfer services + tests complete.
- **M3:** Inventory UI and low-stock dashboard complete.
- **M4:** Purchasing / receiving lifecycle complete.
- **M5:** Audit, reports, CI and deployment complete.

### Example minimum PR checklist
- [ ] Schema migration is reversible or has documented data migration.
- [ ] Authorization and tenant scope are tested.
- [ ] Business-rule services have unit/integration tests.
- [ ] API response/error contract remains consistent.
- [ ] Type checking/lint/test suite pass.
- [ ] User-facing loading, error, and empty states included.

---

## 23. Practical starter backlog — first 20 issues

1. Initialize monorepo, README and environment template.
2. Set up PostgreSQL Docker service.
3. Configure Django/DRF/OpenAPI.
4. Configure React/Tailwind/router/query client.
5. Create custom User and Organization/Membership models.
6. Build session login/logout/current-user APIs.
7. Build frontend protected layout and role-aware nav.
8. Create Category and Unit models/APIs.
9. Create Product model with unique organization SKU.
10. Build Products table, search, add/edit forms.
11. Create Supplier CRUD.
12. Create Warehouse and StorageLocation CRUD.
13. Create InventoryBalance and StockMovement models.
14. Create StockDocument/Line model and state machine.
15. Implement receipt posting service plus tests.
16. Implement issue posting service plus insufficient-stock tests.
17. Add transfer service with transaction tests.
18. Add idempotency, concurrent issue tests and ledger reconciliation.
19. Build stock overview, receive/issue/transfer UI.
20. Build dashboard and low-stock report before starting purchasing.

### Definition of done for the project's first usable slice
An admin logs in, creates a warehouse and product, posts a receipt of 20 units, issues 4, and sees 16 on hand, with two immutable movements and the correct actor, timestamps and location. A duplicate post does not change stock, and a second user cannot issue more than remains.

---

## 24. Demo scenario for a college / portfolio presentation

**Example business:** a small electronics accessories distributor.

1. Admin logs in and adds warehouses `Kathmandu` and `Pokhara`.
2. Adds product SKU `USB-C-001` (USB-C Cable 1m), reorder threshold 15.
3. Adds supplier `ABC Electronics` and creates a PO for 100 cables.
4. Posts a partial goods receipt for 40 cables into Kathmandu.
5. Issues 20 cables; remaining 20 in Kathmandu.
6. Transfers 8 cables to Pokhara; Kathmandu 12, Pokhara 8.
7. Dashboard highlights Kathmandu as low stock if using per-warehouse threshold; if using companywide threshold, 20 total is **not** low. Demonstrate which policy was selected.
8. Shows the audit ledger (receipt +40, issue -20, transfer -8/+8).
9. Viewer cannot create an adjustment.
10. Exports stock-on-hand and displays PO remaining quantity 60.

This demo shows complete business workflows, data modeling, role permissions, transactions and reporting without requiring AI.

---

## 25. Final architecture recommendations

**Recommended build order:** Auth → Master Data → Ledger and balances → Posting service tests → Stock UI → Purchasing → Reports → Security review → Deploy.

**Three rules that matter most:**
1. **Never directly edit stock quantities.** Always post a validated movement document.
2. **Never allow partial postings.** All balance changes, movement records and status changes occur in one transaction.
3. **Never trust the UI for security or stock correctness.** Revalidate role, tenant, ownership and availability in the backend at commit time.

### Definition of project completion
The app is ready to be demonstrated when a new admin can set up stock, multiple staff can use inventory operations safely, the purchasing lifecycle works, reports reconcile to the ledger, role restrictions work, tests pass against PostgreSQL, and a documented backup restore has been tested.

---

## 26. References and documentation

- Django documentation: https://docs.djangoproject.com/
- Django REST Framework permissions: https://www.django-rest-framework.org/api-guide/permissions/
- Django REST Framework authentication: https://www.django-rest-framework.org/api-guide/authentication/
- PostgreSQL explicit row-level locking: https://www.postgresql.org/docs/current/explicit-locking.html
- TanStack Query React docs: https://tanstack.com/query/latest/docs/framework/react/overview
- Vite documentation: https://vite.dev/guide/
- React documentation: https://react.dev/
- OWASP Cheat Sheet Series: https://cheatsheetseries.owasp.org/
- Django deployment checklist: https://docs.djangoproject.com/en/stable/howto/deployment/checklist/

**Note:** This is a design and implementation plan, not a completed codebase. Code sketches are illustrative. Exact dependency versions, hosting choice, tax requirements, and whether multi-tenant SaaS is needed should be finalized before production deployment.
