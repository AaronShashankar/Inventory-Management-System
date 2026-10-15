# Architecture and engineering decisions

## Boundaries

Stockroom is a modular monolith: one Django application process family, one PostgreSQL database, and a React SPA. Master data and transactional workflows are separate modules. HTTP views authenticate, select the organization, validate request shape, invoke a service, and serialize the persisted result. Services own business transitions. React never calculates authoritative stock, order remainder, or purchase totals.

`accounts` owns identity, memberships, authorization, and audit. `catalog` holds master data, including suppliers and warehouses to keep the MVP module graph small. `inventory` owns stock writes. `purchasing` orchestrates receipts through the inventory engine inside the same transaction. `reporting` reads persisted state. There are no critical stock signals, hidden stock mutations, or editable quantity endpoints.

## Concurrency decision

All application business writes acquire the organization's row lock first. PostgreSQL holds it until transaction completion. Posting additionally locks balance rows in stable `(product UUID, location UUID)` order. This deliberately favors understandable correctness over peak throughput: writes for one organization serialize, while different organizations can write independently. It removes races around absent balances, number sequences, idempotency claims, catalog deactivation, and role changes.

If measured tenant write volume requires finer locks, replace this boundary only after defining a common lock graph and expanding concurrency tests for transfers, missing balances, receipt races, and role revocation. Keep the database checks and unique constraints.

## Identity and tenant context

The custom UUID user model exists in the first migration. Login uses Django's username field; bootstrap and invitations use the email as username. Membership maps a user to one or more organizations. Requests may send `X-Organization-ID`; absence selects the first active membership deterministically. The tenant is never taken from write payloads. List queries and relation fields are tenant-scoped; services reauthorize the actor.

The UI clears scoped caches on organization changes and logout. The API client attaches tenant and CSRF headers. Vite proxies `/api` to Django, avoiding cross-origin cookie/CORS complexity. Production uses the same-origin Nginx pattern.

## Frontend

React Router handles public and role-protected screens. TanStack Query owns server data and invalidation. React Hook Form and Zod validate the stock operation form; native controlled forms handle simpler CRUD. Database validation remains authoritative. Native HTML dialogs provide focus trapping and Escape behavior. CSS uses a reusable token palette and responsive layouts; custom CSS is the equivalent styling layer chosen instead of Tailwind/shadcn to avoid unnecessary dependencies.

Charts count ledger entries by operation, not sums of incompatible product quantities. Recharts is used only for the dashboard. Lists paginate at 50 rows. Reference pickers currently load all pages; move to server-side autocomplete when catalogs grow.

## Dependency policy

Backend exact versions are in `requirements.txt`; frontend exact resolution is in `package-lock.json`. Install with pip requirements and `npm ci`. Version compatibility was checked against [Django 5.2 release notes](https://docs.djangoproject.com/en/5.2/releases/5.2/) and [Vite's guide](https://vite.dev/guide/). Python 3.14 is supported by Django 5.2.8 and later; this project resolves a newer 5.2 patch. Node 24 satisfies Vite's supported Node requirements.

Use Dependabot updates, CI, and review migration/release notes before upgrades. Never run dependency updates automatically against a production deployment.
