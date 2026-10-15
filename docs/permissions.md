# Authorization and authentication

| Capability | Admin | Manager | Staff | Viewer |
|---|---|---|---|---|
| Read products, stock, purchasing | Yes | Yes | Yes | Yes |
| Maintain master data | Yes | Yes | No | No |
| Receive, issue, transfer | Yes | Yes | Yes | No |
| Adjustment | Yes | Yes | No | No |
| Create/edit/submit/close/cancel PO | Yes | Yes | No | No |
| Create/post goods receipt | Yes | Yes | Yes | No |
| Full reports and CSV | Yes | Yes | No | Yes |
| Audit trail | Yes | Yes | No | Yes |
| Team membership/invitations | Yes | No | No | No |

Staff see operational balances, movements, and dashboard metrics. There are no per-warehouse assignments in this MVP. Membership is organization-wide. The last active administrator cannot be demoted or disabled through the API.

## Session security

1. Browser calls `GET /api/v1/auth/csrf/` to receive a CSRF cookie.
2. Login sends the cookie plus `X-CSRFToken`; anonymous login itself is CSRF-protected.
3. Django establishes an HttpOnly session cookie and rotates the CSRF token.
4. Every subsequent unsafe request includes the current CSRF token. No authentication tokens are stored in localStorage.
5. Logout invalidates the server session and clears frontend query caches.

Secure cookies, HTTPS redirect, HSTS, and content-type protection are enabled when DEBUG is false. The application trusts `X-Forwarded-Proto` only behind the documented controlled proxy; do not expose Gunicorn directly to untrusted traffic.

Password reset returns the same message whether the account exists. Tokens expire after one hour and become invalid when the password changes. Password validation requires 12 characters and rejects common/numeric passwords. Invitations create an unusable password and email the setup link; existing accounts receive membership without changing their password. SMTP must be configured before real invitations are used. Local development prints email to the console.

Authentication/reset endpoints use DRF's `10/min` scoped throttle. Its default cache is process-local and is an MVP backstop, not distributed brute-force defense. Production needs a shared cache or ingress rate limiting and monitoring. Reset email delivery is synchronous and can still reveal timing differences; use a queued worker when stronger enumeration resistance and delivery retries are required.

## Audit

Services append audit events for drafts, posting, purchasing transitions, catalog edits, and memberships. Credentials and tokens are never placed in event details. Catalog audit currently records changed field names, not complete before/after snapshots. Request IDs are returned in API errors and `X-Request-ID`, attached to audit events, and emitted in JSON request logs with method, path, status, and duration. Request bodies, passwords, cookies, and reset tokens are not logged. Configure external log retention and exception monitoring before deployment.
