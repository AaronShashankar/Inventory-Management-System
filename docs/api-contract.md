# REST API contract

Base: `/api/v1/`. Session authentication and CSRF apply. Send `X-Organization-ID: <uuid>` to select a membership; no caller-supplied organization field is accepted as tenant authority. Interactive schema is at `/api/docs/`, machine-readable schema at `/api/schema/`.

## Conventions

Lists: `{count, next, previous, results}`, 50 rows per page, `?page=2`. Master data supports GET collection/detail, POST collection, PATCH detail; hard delete is not exposed. UUIDs are strings. Money is a decimal string. Dates are ISO 8601; timestamps are UTC. Filter errors are 400; inaccessible IDs are 404; role failures 403; business conflicts 409. SessionAuthentication also uses 403 for missing authentication.

Errors: `{error: {code, message, fields, request_id}}`. Read `fields` for serializer errors. Unexpected exceptions are not exposed with stack traces when DEBUG=false. Infrastructure/CSRF middleware errors can use Django's native response instead of the API envelope.

## Routes

| Route | Methods / purpose |
|---|---|
| auth/csrf/ | GET token/cookie bootstrap |
| auth/login/ | POST username, password |
| auth/logout/ | POST invalidate session |
| auth/me/ | GET current user and active memberships |
| auth/password-reset/request/ | POST email |
| auth/password-reset/confirm/ | POST uid, token, password |
| organization/ | GET current settings; PATCH name/base_currency (admin); currency freezes once products exist |
| members/ | GET paginated members (admin) |
| members/{id}/ | PATCH role/is_active (admin) |
| members/invite/ | POST email and role (admin) |
| products/, categories/, units/, suppliers/, warehouses/, locations/ | GET/POST; GET/PATCH detail |
| inventory/balances/ | GET by product, location, location__warehouse, search |
| inventory/movements/ | GET by product, location, location__warehouse, document__type, created_at__gte/lte, search |
| stock-documents/ | GET/POST; GET/PATCH detail (full editable draft payload for PATCH) |
| stock-documents/{id}/post/ | POST empty body + Idempotency-Key |
| stock-documents/{id}/void-draft/ | POST empty body |
| purchase-orders/ | GET/POST; GET/PATCH detail (full draft payload) |
| purchase-orders/{id}/submit/, close/, cancel/ | POST lifecycle command |
| goods-receipts/ | GET/POST receipt draft; GET detail |
| goods-receipts/{id}/post/ | POST empty body + Idempotency-Key |
| dashboard/summary/ | GET active SKU/low-stock/open-PO counts, recent movements, activity |
| reports/stock-on-hand/, reports/low-stock/ | GET warehouse UUID, search, page |
| reports/movement-summary/ | GET optional start/end ISO dates, grouped per product/unit/type |
| reports/stock-on-hand/export.csv | GET optional warehouse UUID |
| audit-events/ | GET paginated immutable events |
| health/ | GET database readiness; public |

Products search SKU/name/barcode and filter category/is_active. Locations filter warehouse/is_active. Orders filter status. Documents filter status/type. Unknown fields do not grant authority. Master data unique conflicts return 409. Warehouses create a default MAIN location automatically.

## Example requests

Create a product (relations use their model names, not `_id` suffixes):

```json
{"sku":"USB-C-001","name":"USB-C Cable 1m","unit":"<uuid>","category":"<uuid>","reorder_level":15,"default_purchase_price":"250.00","is_active":true}
```

Receive draft:

```json
{"type":"RECEIVE","destination_location":"<bin-uuid>","reason":"OPENING_BALANCE","reference":"Opening count","lines":[{"product":"<product-uuid>","quantity":20}]}
```

Issue uses `source_location`; transfer uses both distinct locations. Adjustment uses `destination_location` and `adjustment_direction: IN|OUT` on each line. Do not send irrelevant locations or directions.

Post the returned document:

```http
POST /api/v1/stock-documents/<uuid>/post/
Idempotency-Key: <stable-uuid-for-this-attempt>
X-CSRFToken: <current-cookie-token>
X-Organization-ID: <organization-uuid>
Content-Type: application/json

{}
```

PO draft:

```json
{"supplier":"<uuid>","expected_date":"2026-11-01","lines":[{"product":"<uuid>","ordered_qty":100,"unit_price":"250.00"}]}
```

After submit, create a receipt:

```json
{"purchase_order":"<uuid>","location":"<bin-uuid>","lines":[{"purchase_order_line":1,"received_qty":40}]}
```

Receipt draft creation does not update stock. Post the goods receipt with an idempotency key. PO response lines include received_qty and the server-computed order total. API variations from blueprint examples (flat locations/members routes, relation names, receipt status through linked stock document) are intentional and documented here.
