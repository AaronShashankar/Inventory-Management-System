# Reporting, reorder policy, reconciliation, and financial boundaries

## Stock reports

`stock_rows` aggregates balances per product within the selected warehouse, or companywide if no warehouse is selected. It joins the totals to all active products, defaulting absent balances to zero. Thus never-stocked products are visible. Output is sorted by SKU and paginated at the API boundary. Current implementation materializes the report in memory; use SQL aggregation/subqueries and streaming CSV for very large catalogs.

Low stock means `on_hand <= product.reorder_level`. The same product threshold is applied to whichever scope the user selects. It is not a separate configured threshold per warehouse. The dashboard always uses companywide scope. Example: Kathmandu 12 + Pokhara 8 with threshold 15 is healthy companywide and low in Kathmandu. This is a threshold signal, not a demand forecast or automatic procurement recommendation.

## Movement metrics

Ledger history includes actor, document, location, delta, resulting quantity, and UTC timestamp. Dashboard activity counts receipt/issue ledger entries over 14 UTC days; it avoids adding incompatible product units. Movement summary groups by product/unit/type and supports inclusive UTC start/end dates. Transfer net quantity is zero across all bins even though two movement entries occurred.

## CSV protection

Cells beginning with formula indicators `=`, `+`, `-`, or `@` (including after leading whitespace) are prefixed with an apostrophe before standard CSV quoting. This treats external master-data strings as data when opened in spreadsheet software. Export requires Admin/Manager/Viewer and respects selected warehouse scope.

## Reconciliation

`python manage.py reconcile_inventory` is read-only. For each organization it takes the same tenant lock as writers, sums movement deltas per product/bin, compares the union of ledger/balance keys, and exits nonzero on mismatch. Complexity is O(M+B) over movements and balances. Run after restore and on a schedule. It never silently repairs history. Investigate missing/extra movements and use an approved correction or controlled recovery procedure.

## Finance decisions

The organization defaults to NPR and one deployment/organization base currency. Unit costs and reference purchase prices are fixed two-decimal amounts; quantities are whole integers. The UI displays prices without interpreting them as inventory value. No mixed-unit grand total is labeled as a financial KPI.

Before accounting use, define costing (FIFO/weighted average), returns, discounts, landed costs, currency handling, accounting period locks, tax jurisdiction, invoice rules, and reconciliation to the general ledger with a qualified accountant. These are scope decisions from the blueprint, not implemented guarantees. Do not infer profit, COGS, tax payable, or balance-sheet inventory from the current reference price.
