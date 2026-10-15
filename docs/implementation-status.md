# Implementation status and release considerations

As of 15 October 2026. This records the implemented MVP and does not mark every future item in the original blueprint complete.

## Delivered

| Blueprint area | Implementation |
|---|---|
| Foundation | Modular Django/DRF, React/TypeScript/Vite, PostgreSQL, locked dependencies, Docker, CI, health check |
| Authentication | Session/CSRF login/logout/me, membership tenancy, four roles, invitations, single-use password reset |
| Administration | Team role/activation management, last-admin guard, organization name/base currency settings |
| Catalog | Product/category/unit/supplier/warehouse/bin creation and editing; deactivate referenced entities |
| Inventory | Draft/edit/post/void documents, receive/issue/transfer/adjust, nonnegative balances, immutable ledger, audit, retry keys |
| Purchasing | Draft/edit/submit/cancel/close orders, partial/full receipts, outstanding quantity checks, receipt-specific posting |
| UI | Responsive workspace, protected navigation, live dashboard, tables, forms, errors/empty/loading states, confirmation dialogs |
| Reports | Stock per bin, company/warehouse stock and low-stock reports including zeros, movement summary API, CSV |
| Documentation | Architecture, database, permission matrix, API/OpenAPI, algorithm notes, setup, testing, deployment/restore runbook |
| Verification | PostgreSQL service/API/concurrency tests, frontend tests, browser stock and purchasing workflows, backup/restore reconciliation |

## Verified locally

- PostgreSQL 17 migrations and schema drift checks.
- 30 backend tests passed against PostgreSQL; 8 frontend unit tests and 2 real-browser workflow tests passed.
- Separate-connection concurrent issues: exactly one succeeds when combined requests exceed stock.
- Database triggers reject edits to posted documents, posted lines, ledger movements, and audit rows.
- Both Linux Docker application images built successfully; both browser acceptance scenarios also passed against the Nginx/Gunicorn stack at port 18080.
- React unit tests, strict TypeScript production build, ESLint, Python Ruff formatting/lint.
- OpenAPI generation/validation with warnings treated as failure.
- Chromium: create product, receive 20, issue 4, verify 16; desktop/mobile layout; PO for 100, receipt 40 then 60, status RECEIVED.
- Backup of local seeded PostgreSQL restored to `stockroom_restore_20261015`; reconciliation passed on restored data. This demonstrates the local procedure, not an off-host production recovery SLA.

## Explicit design variations

Catalog, partners, and warehouse models share one cohesive catalog app. Audit/organization models share accounts. Custom CSS and native accessible dialogs replace Tailwind/shadcn. Location/member routes are flat tenant-scoped endpoints. Goods receipt status derives from its linked stock document. Draft PATCH requires complete editable nested data. Conservative organization locks serialize tenant writes. Base currency cannot be changed after products exist.

## Remaining operational gates and deliberate exclusions

- Production deployment requires a hosting target, DNS/TLS, secrets, SMTP, off-host backup scheduling, monitoring, shared/ingress rate limiting, staging load tests, and an assigned operational owner. These cannot be considered configured by checking in a runbook.
- Automatic linked reversals are not implemented; authorized adjustments correct quantities with reasons. No FIFO/weighted-average costing, COGS, VAT/taxes, supplier invoice/payment accounting, fractional units, reservations, serial/batch tracking, or multi-currency conversion.
- Password emails are synchronous; configure and verify real delivery. Local email is console-only. Distributed throttling is a production follow-up.
- Audit events preserve action/entity/actor/changed field names; full before/after master-data snapshots are not implemented.
- Per-warehouse staff assignments, organization self-service creation, dedicated product-detail pages, category hierarchy, and full profile editing are not implemented.
- Movement-summary date filtering exists in the API; the UI currently exposes the immutable searchable ledger and stock/low-stock reports. A dedicated receipt/issue analytics screen can build on that endpoint.
- Reference dropdowns and report assembly load full tenant sets; large catalogs need autocomplete and database-side report pagination/streaming.
- The local restore drill is tested; production restore timing, encrypted retention, alert delivery, and disaster recovery ownership remain deployment acceptance gates.

Do not describe the project as accounting-certified, externally security-audited, or production-deployed. CI configuration is committed; remote CI execution must be checked separately after push.
