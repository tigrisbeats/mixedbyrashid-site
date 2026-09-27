# Launch audit — September 26, 2026

## Source reconciliation

This branch starts from GitHub `main` at `6837d28`. It uses the current static portal, Netlify Identity, PostgreSQL, Stripe, and Dropbox implementation. The older local `codex/full-platform` React/R2 implementation is a separate historical branch; its migration and launch reports do not describe this portal and were not copied into this branch.

## Changes prepared for review

- Both webhook endpoints use the official Stripe SDK to verify signatures. Valid signed events must match the endpoint's test/live mode, and fulfillment requires `payment_status=paid`.
- Unpaid completion events are acknowledged without creating paid orders. Later asynchronous success can fulfill them. Invalid receipts and database failures return a retryable server error. Logs contain event identifiers rather than request bodies or credentials.
- Duplicate successful events cannot overwrite a paid receipt or restore a refunded order to paid. Receipt currency, amount, service, and numeric metadata are validated.
- Checkout requires an API key for its own mode, checks the returned session mode, and uses the current Stripe SDK. The dependency lockfile is committed, and CI uses `npm ci`.
- Revision requests check payment, project stage, approval, and remaining allowance in the same SQL update that consumes a round. Repeated requests cannot consume another round while the project is already in revision.
- Final delivery checks payment and cancellation in addition to the existing royalty agreement gate. Private download responses are not cacheable.
- Project mutations reject requests from a missing or unrelated origin before accessing Identity, database, or storage.

## Validation

- 43 local tests pass. Added signed Stripe fixtures execute the production fulfillment SQL against PGlite after all six current portal migrations. Added revision contention and allowance tests and direct HTTP-handler origin rejection tests.
- All 26 server modules pass `node --check`; `git diff --check` passes.
- Read-only production checks: `/api/portal-health` returns 200 with database/schema ready; `/api/projects` returns 401 without a session; `/login` returns 200.

These tests do not establish real Stripe-origin payment delivery, independent concurrent Neon connections, authenticated hosted customer/admin journeys, or Dropbox file transfers. PGlite serializes local connections. No provider credentials or production data were changed, and no production deployment or main-branch push was performed.

## Remaining acceptance work

- Verify the proposed branch on its Netlify preview before release, including signed fixture delivery and real sandbox Checkout success when preview credentials and an isolated test database are verified.
- Exercise paid customer and owner file workflows against the existing Dropbox integration. Do not create an R2 replacement based on the older local report.
- Check current hosted policy and scheduling requirements against the owner's latest decisions before adding booking rules from historical work.
- Production activation or merging remains a separate owner action under the existing instruction to leave main and production untouched.
