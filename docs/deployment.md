# Deployment and operations runbook

## Local versus production

Compose is configured for local development: PostgreSQL on 127.0.0.1:55439, backend on 127.0.0.1:8000, Nginx on 127.0.0.1:18080. Persistent DB storage uses the named `postgres_data` volume. Do not delete that volume to resolve an application problem.

When using the Docker web entry point for local email links, set PUBLIC_APP_URL=http://localhost:18080.

Before production:

1. Create a staging environment with separate secrets/database. Set DEBUG=false, a random secret key, exact ALLOWED_HOSTS, HTTPS PUBLIC_APP_URL and CSRF_TRUSTED_ORIGINS.
2. Configure SMTP and test invitations/password resets. Avoid console email outside development.
3. Use a managed database or restrict database access to the application network. Separate runtime/migration roles; the local DB role is intentionally more privileged for development/tests.
4. Terminate TLS at a controlled proxy. The checked-in Nginx configuration is HTTP-only for local use. Configure its HTTPS listener/certificates before production so `X-Forwarded-Proto` is trustworthy and redirects do not loop. If another proxy terminates TLS, explicitly configure trusted forwarding instead of blindly forwarding arbitrary client headers.
5. Run migrations once as a release job. Build frontend assets and start Gunicorn as an unprivileged user. Both Dockerfiles install locked dependencies.
6. Run `python manage.py check --deploy` with production settings. Verify authenticated flow, CSRF, all stock operations, and database readiness on staging.
7. Configure ingress rate limits/shared throttle cache, external uptime checks, exception monitoring, and structured log aggregation. JSON request logs and audit events carry the same request ID; configure external retention and alerting.
8. Schedule encrypted, off-host backups with retention and restore testing. Confirm operational and legal retention requirements.

The runtime containers do not automatically migrate on startup: concurrent replicas must not race schema changes. Pin container image digests in a release pipeline after image security review; Compose currently tracks supported image tags.

## Backup and restore drill (PowerShell)

Use container-side files so Windows text redirection cannot corrupt a binary dump:

```powershell
docker compose exec -T db pg_dump -U inventory -d inventory -Fc -f /tmp/inventory.dump
docker compose cp db:/tmp/inventory.dump ./inventory-backup.dump
# Copy to encrypted off-host storage; do not commit the dump.
# Restore into a NEW isolated database, never over the live database:
docker compose exec -T db createdb -U inventory inventory_restore_check
docker compose exec -T db pg_restore -U inventory -d inventory_restore_check --no-owner /tmp/inventory.dump
$env:DATABASE_URL='postgresql://inventory:inventory@127.0.0.1:55439/inventory_restore_check'
backend/.venv/Scripts/python backend/manage.py reconcile_inventory
Remove-Item Env:DATABASE_URL
```

Validate counts, memberships, document status, and the demo flow against the restored database. Record date, backup age, restore duration, checksum, and result. Remove the isolated restore database only after confirming it is the disposable drill target. A successful dump is not proof of a recoverable backup.

## Failure handling

- Insufficient stock: review latest availability; do not bypass the ledger.
- Unknown outcome after post: retry the same document and idempotency key.
- Unknown outcome after draft creation: check the document list before creating again.
- Reconciliation mismatch: stop stock mutations for the affected tenant, retain logs/backups, investigate direct SQL changes, and use a documented recovery process. Reconciliation never auto-repairs.
- Failed migration: preserve the database; use tested backward-compatible rollback or restore into a new database and switch under a maintenance plan.
- Compromised session: deactivate membership/account, rotate credentials as appropriate, inspect audit and infrastructure logs.

## Limitations to plan for

Per-tenant write serialization is appropriate for modest transaction volume. Benchmark before high-throughput deployment. Report assembly and reference dropdowns currently load full tenant datasets. Audit records contain event identity/changed field names, not full before/after snapshots. There is no queue, automated backup scheduler, email retry worker, monitoring vendor integration, or automated linked reversal workflow.
