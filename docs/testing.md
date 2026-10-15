# Testing and acceptance

## Backend

`cd backend && .venv/Scripts/python -m pytest -q` (use `.venv/bin/python` on Unix).

Tests use PostgreSQL, not SQLite. pytest-django creates an isolated test database. The concurrency case opens independent connections in threads, synchronizes start with a barrier, and asserts exactly one oversized combined issue succeeds. Other cases check receipt/issue/transfer reconciliation, duplicate posting and key conflicts, invalid quantities, rollback, same-bin rejection, foreign tenant relations, role restrictions, immutable state, partial/full receipts, over-receipt, closed order handling, login CSRF, zero-stock reporting, last admin protection, and CSV formula neutralization.

Use a disposable database role with permission to create the test database. CI provisions a PostgreSQL service. Never use production credentials for tests.

## Frontend

`npm run build` performs strict TypeScript checking and production build. `npm run lint` checks ESLint/TypeScript/hooks. `npm test` covers shared UI and API error/CSRF behavior. Playwright exercises the actual app/API, not mocked inventory responses.

Run both development servers, seed an administrator, set `E2E_USERNAME` and `E2E_PASSWORD`, then run `npm run test:e2e`. Install Chromium with `npx playwright install chromium` first. The test creates uniquely identified data through the app and posts a receipt/issue. It checks desktop/mobile layout and screenshots; output is ignored by Git. Use a disposable demo organization because E2E writes real test documents.

## Acceptance walk-through

1. Create a category, unit, warehouse (automatic MAIN bin), supplier, and product.
2. Create receipt draft of 20. Verify no balance change until confirmation/post.
3. Post; retry posting; assert exactly one +20 movement.
4. Issue 4; verify 16 on hand.
5. Transfer stock to another warehouse; verify matching signed movement pairs and unchanged companywide quantity.
6. Create PO for 100; submit; receive/post 40 then 60; verify RECEIVED and 100 received.
7. Try to over-receive or issue more than available; verify 409 and unchanged quantities.
8. Switch to Viewer; mutation routes reject requests even when called directly.
9. Export stock CSV and reconcile against posted movements.
10. Perform and record an isolated database backup/restore drill.

The exact executed results and remaining manual gates are recorded in `implementation-status.md`. Passing local tests is not a substitute for staging load testing, mail delivery verification, production TLS verification, and an operational owner signing off deployment.
