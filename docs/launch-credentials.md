# MixedByRashid launch credentials

Never commit credential values to Git. Store them only in Netlify environment variables.

## Current safety switches

- `PAYMENTS_ENABLED=false` keeps custom production Checkout Sessions disabled.
- `STRIPE_LIVE_WEBHOOK_ENABLED=false` keeps live webhook fulfillment disabled until the signing secret is configured and verified.
- `MIXING_ENABLED=false` until private storage and the full project flow are verified.
- `PRIVATE_STORAGE_ENABLED=false` until Dropbox credentials and file operations are verified.
- `STRIPE_SANDBOX_ENABLED=true` for deploy previews only; production ignores this flag.

## Stripe deploy-preview

Required:

- `STRIPE_TEST_SECRET_KEY` — secret, deploy-preview context.
- `STRIPE_PREVIEW_SIGNING_SECRET` — secret, deploy-preview context.

Webhook URL:

`https://deploy-preview-3--mixedbyrashid.netlify.app/api/stripe-preview`

Events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

## Stripe production

Required before enabling payments:

- `STRIPE_LIVE_SECRET_KEY` — secret, production context.
- `STRIPE_LIVE_SIGNING_SECRET` — secret, production context.
- `STRIPE_LIVE_WEBHOOK_ENABLED=true` after the live webhook signing secret is configured and verified.
- `PAYMENTS_ENABLED=true` only if custom production Checkout Sessions are deliberately enabled later. Hosted studio Payment Links do not require this flag.

Production webhook URL:

`https://mixedbyrashid.netlify.app/api/stripe-webhook`

Events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

`MIXING_ENABLED` can remain false while studio deposits are enabled. Mixing/mastering checkout is additionally gated by `MIXING_ENABLED=true` in production.

## Dropbox private project storage

The backend requires an OAuth app with background/offline access and these minimum scopes:

- `files.content.write`
- `files.content.read`
- `files.metadata.read`
- `file_requests.write`

Use App Folder access unless there is a deliberate need for the integration to access unrelated Dropbox files. App Folder keeps MixedByRashid project data isolated inside the app's Dropbox folder.

Required Netlify variables:

- `DROPBOX_APP_KEY` — secret.
- `DROPBOX_APP_SECRET` — secret.
- `DROPBOX_REFRESH_TOKEN` — secret.
- `PRIVATE_STORAGE_ENABLED=true` only after provisioning, file request creation, file listing, temporary download, and cleanup deletion are verified.

The Dropbox OAuth authorization must request offline access so the token exchange returns a refresh token. The backend uses that refresh token to obtain short-lived access tokens at runtime.

## Already present

- `DATABASE_URL` in production.
- `SITE_URL=https://mixedbyrashid.netlify.app/` in production.

## Final enable order

1. Verify Stripe sandbox Checkout -> signed webhook -> `portal_orders` paid/ready state.
2. Verify Dropbox project provisioning -> file request -> file listing -> temporary link -> cleanup.
3. Configure and verify the Stripe live webhook signing secret.
4. Set `STRIPE_LIVE_WEBHOOK_ENABLED=true` so hosted Stripe Payment Link events can create/update portal orders while `PAYMENTS_ENABLED=false` keeps custom checkout disabled.
5. Enable `PAYMENTS_ENABLED=true` only if custom production Checkout Sessions are intentionally launched later.
6. Set `PRIVATE_STORAGE_ENABLED=true` after storage verification.
7. Set `MIXING_ENABLED=true` only when the complete mixing/mastering intake and delivery path is ready for customers.
