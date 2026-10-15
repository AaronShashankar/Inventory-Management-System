# Idempotent posting and safe retries

Implementation: `claim_key`, `post_document`, and `post_receipt`.

Clients create a UUID key when opening a posting confirmation and retain it for retries of that confirmation. POST requests have an empty body; draft content must be saved first. The identity hash is SHA-256 of a canonical sorted JSON object containing the target document/receipt ID. The key namespace is organization + actor + endpoint + key, protected by a unique constraint.

Inside the tenant-locked transaction:

- Missing/oversized keys fail validation.
- A new key creates a claim with request hash.
- Reusing a key for a different target returns 409 `IDEMPOTENCY_CONFLICT`.
- A matching completed claim returns the persisted document.
- A successful operation stores its ID and status in the claim and commits alongside the ledger.
- A failed transaction rolls back the claim as well as stock changes, allowing a corrected retry.

Concurrent requests for the same organization wait on the tenant lock, so there is no externally visible half-complete claim. Independent keys cannot post the same document twice because the locked document status is checked too. This protects retries of posting; **creating a new draft is not idempotent**. After an uncertain create response, inspect the document list before repeating the create request.

Records are retained indefinitely in this MVP. Do not delete them casually; a retention policy must define retry windows, archival, and document identity guarantees. Idempotency does not authorize an operation: current membership is checked before returning a retry result.
