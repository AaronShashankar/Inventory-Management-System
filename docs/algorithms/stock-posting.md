# Stock document validation and posting

Implementation: `backend/apps/inventory/services.py`.

## `save_draft`

Acquire the tenant lock, reauthorize the actor, and verify any existing document is a standalone DRAFT. Adjustment drafts require Manager/Admin both before and after any type change. Validate 1-100 unique active products, positive integer quantities, same-tenant active locations/warehouses, and a nonblank reason. RECEIVE requires destination only; ISSUE requires source only; TRANSFER requires distinct source/destination; ADJUST uses destination and an IN/OUT direction per line.

Create or replace draft lines and append an audit event. A sequential `STK-000001` number comes from the tenant/prefix sequence under the same lock. Drafts have no stock effect. Editing requires the complete editable document payload, even though the route uses PATCH, to prevent ambiguous partial replacement of nested lines.

## `post_document` and `_post_locked`

1. Begin an atomic transaction and lock the organization.
2. Resolve the tenant-owned document and check the actor's current role.
3. Reject linked purchase receipts on the generic stock endpoint.
4. Claim/validate the idempotency key and return the prior result for a completed retry.
5. Return an already POSTED document without applying stock again. Reject VOID_DRAFT.
6. Reload product/location state and validate the complete document.
7. Expand lines into signed changes: receipt +Q, issue -Q, transfer -Q/+Q, adjustment +/-Q.
8. Sort affected product/bin keys. Create missing zero balances safely under the tenant lock, then lock each balance row.
9. Reject any result below zero with 409 `INSUFFICIENT_STOCK`. Otherwise update the balance and append a movement with the resulting quantity and actor.
10. Mark the document POSTED, timestamp it, write the audit event, and store the idempotency result.
11. Commit everything together. Any validation/database error rolls back every line and movement.

A transfer's pair sums to zero. No intermediate source-only change becomes visible. If 5 units remain and concurrent requests issue 4 and 3, the organization/balance locks serialize them: one commits, one gets 409, and stock stays at 1 or 2.

Time complexity is O(L log L) for sorting plus O(L) database operations, with L capped at 100 lines. The tenant lock bounds complexity at the cost of per-tenant write throughput. There is no automatic retry for arbitrary database errors; retry an uncertain posting using the same key. A future deadlock retry policy must be bounded and preserve idempotency.

## Corrections

Posted documents are immutable in both API and PostgreSQL triggers. Create a reasoned adjustment to correct stock. Automatic linked reversal documents are not implemented; do not claim that a correction is a financial credit note or accounting reversal. Never directly edit balances to fix a discrepancy.
