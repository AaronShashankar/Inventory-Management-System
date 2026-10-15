# Purchase order lifecycle and receipt allocation

Implementation: `backend/apps/purchasing/services.py`.

## Lifecycle

- DRAFT -> ORDERED through submit.
- ORDERED -> PARTIALLY_RECEIVED after a posted partial receipt.
- ORDERED/PARTIALLY_RECEIVED -> RECEIVED when every line is fulfilled.
- DRAFT/ORDERED -> CANCELLED; cancellation is not available after a posted partial receipt.
- ORDERED/PARTIALLY_RECEIVED/RECEIVED -> CLOSED. Closing abandons any remaining commitment and prevents further receipt posting.

Only Manager/Admin can save or transition purchase orders. Receipt creation and posting also allow Staff. Draft editing requires the complete supplier/date/lines payload. Submitting rechecks active supplier/products. Ordered quantity is positive, unit price is a nonnegative decimal, and duplicate products are rejected.

## Outstanding quantity

For each order line:

`outstanding = ordered_qty - SUM(received_qty WHERE linked stock document is POSTED)`

Draft and voided receipts do not count. Receipt creation validates the entered quantities against current outstanding amounts and creates a RECEIVE stock draft plus typed receipt lines. Partial receiving is explicit: omitted/zero UI lines are not received.

## Atomic posting

Under the same organization lock, recheck order state and recompute outstanding quantities. Reject over-receipt with 409 `OVER_RECEIPT`, including when another draft was posted first. Post the linked stock document internally, derive the new order state from posted receipt totals, append audit, and commit the receipt/idempotency state together.

Generic stock posting cannot bypass this path. Generic stock draft edits cannot change linked receipts. Voiding an unposted linked stock document is allowed; create a replacement goods receipt. Once a receipt is posted it cannot be unreceived by editing history.

## Money

Prices use `DecimalField(14,2)`. API serializes money as strings; server calculates order total from decimal line prices x integer quantities. A PO total is a purchasing commitment only: there are no taxes, landed costs, exchange rates, supplier balances, invoices, payments, COGS, FIFO, or weighted-average layers.
