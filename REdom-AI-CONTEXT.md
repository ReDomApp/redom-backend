# ReDom AI Context

> Read this file first when joining ReDom development. It is the compact entry point to the full engineering memory in `REdom-ENGINEERING-HANDBOOK.md`.

## Identity
- Product/company: **ReDom Platforms, Inc.**
- Primary GitHub repository: **ReDomApp/redom-backend**
- Primary branch: **main**
- GitHub is the source of truth.

## Architecture
- GitHub → Render → ReDom Production API → Neon PostgreSQL.
- Replit = development workspace.
- Vercel = ReDom Web deployment.
- Expo = mobile development/testing.
- ReDom Web is a separate TypeScript/React/Vite web implementation; do not import React Native/Expo for parity.
- Docs/Help are separate web surfaces.
- Do not substitute Railway for Render.

## Web parity — NON-NEGOTIABLE
Before changing/creating any web screen:
1. Read the corresponding mobile screen.
2. Read navigation/route.
3. Read assets.
4. Read services/API calls.
5. Read validation/security logic.
6. Read dependencies.
7. Reproduce behavior in native Web implementation.

Parity includes exact copy, field/card sizing, spacing, placement, states, validation, security, navigation, buttons, modals/bottom sheets, loading/error behavior, logos and SVGs.

Established parity target: **101 navigable mobile screens** and **101 web registry entries**. Verify the current source before relying on the count.

## Brand
- ReDom Blue: #1877F2
- TEXT: #1C1E21
- MUTED: #65676B
- BORDER: #CCD0D5
- ERROR: #E41E3F
- WHITE: #FFFFFF
- Use approved ReDom SVGs.
- Use actual provider logos where branding is required; do not substitute plain text.

## ReDom Pay
Menu → Settings and Privacy → Orders and Payments → ReDom Pay.

Tabs:
- Transactions
- Manage

Transaction categories:
- All
- Money transfer
- Orders
- Donations
- Cards

Saved payment methods:
- Max 3 per account.
- Show provider logo, last 4 digits, country.
- No update-in-place; Remove & Add New.
- Removal requires the established security-code flow.

Card flow:
- Card number, MM/YY, CVV, country, full name, address.
- Provider tokenization/validation.
- Never store PAN/CVV.
- Country support must follow authoritative provider support, not an arbitrary six-country list.
- Preserve the established minimum processing presentation where current implementation requires it.

Bank transfer:
- Paystack is used for the established African bank-transfer flow.
- Paystack is not the card provider for Add Card.

## Stars
- 1 ReDom Star = $0.10 internal value.
- Established packages include 10/$1.99 promo, 20/$2.99, 50/$4.87, 100/$10.76, 150/$14.00, 200/$19.99, 500/$50, 700/$70, 1000/$99.99.
- Buy Stars is card-payment-provider based.
- Use supported countries/currencies and authoritative FX.

Trial:
- One-time first-buyer trial.
- Grant 20 Stars.
- No immediate charge.
- Future charge at day 7.
- Disclose exact expected charge date/time.
- Store trial start and payment-method association server-side.
- First failure → retry ~24h later.
- Second failure is final; no third attempt.
- Do not treat unconfirmed states as successful.
- Unified checkout callback can use `redom://payment/callback`.
- Backend verifies session/payment/account/package and atomically fulfills.
- Abandoned checkout creates no successful transaction.

Transaction IDs:
- Paystack: RP- + 7–12 digits.
- Card-provider/Stripe flow: RS- + 13–16 digits.
- Existing legacy R- + digits remain valid.

## Refunds
- Refund-request creation time is authoritative for the review/window calculation.
- The policy evolved from 10 minutes to a 1-hour refund window; inspect current code/policy before changing.
- Validate email.
- Locate transaction.
- Require transaction ID/provider reference as applicable.
- Security code normally 8 digits; hash it.
- Limit failed attempts; 3 failures closes the attempt.
- Provider webhooks are authoritative.
- Use Resend for transactional email.

## AI behavior
The ReDom AI should understand:
- ReDom products/features/policies.
- Settings/privacy.
- Payments and refunds.
- Account authorization.
- Public vs private information.
- Security boundaries.
- Provider/payment concepts.

It must:
- Never invent account state.
- Never claim a payment/action succeeded without authoritative confirmation.
- Never reveal secrets or another user's data.
- Never create another user's private URL.
- Only produce account-specific URLs after validating that the URL belongs to the active/validated account.
- Answer payment questions naturally even when the user does not know the underlying provider.
- Follow the established product rule about when underlying provider names should or should not appear in plain product copy.

## URL encoding/account-link security
For validated active accounts, allowed account-specific URLs may be encoded only when:
- the account is authenticated/validated;
- the URL is actually related to that account;
- the route is permitted.
Never encode another user's account URL.

Payment-related public information can be answered without forcing account authentication where appropriate.

## Settings/Privacy
Established sections:
- Your account
- Tools and resources
- Preferences
- Audience and visibility
- Payments
- Your activity
- Community Standards and legal policies

Known settings:
- Language
- Dark Mode
- Link History (historically Under Development)
- Orders and Payments

**Policy-upgrade rule:** when implementation changes behavior covered by a policy, update the relevant policy/documentation so policy and code remain synchronized.

## Docs/Help
Target domains:
- docs.wnncompany.com
- help.wnncompany.com

**Every footer on every Docs/Help screen/page must contain the required official ReDom company information.**

Established company identity:
- ReDom Platforms, Inc.
- 495 Flatbush Ave, Brooklyn, NY 11225, United States

Use the official ReDom logo and actual provider branding assets where required.

## Security
Treat security as product behavior:
- auth
- authorization
- ownership
- session validity
- webhook verification
- provider verification
- idempotency
- replay protection
- rate limits
- failed-attempt limits
- secure hashing
- atomic transactions
- data minimization
- private URL authorization
- secret management

Never move sensitive validation solely to the client.

## Development
- pnpm workspace.
- Preserve pnpm-lock.yaml.
- Render builds have used frozen-lockfile installation.
- Use migrations for Neon/Postgres schema changes.
- Do not assume an empty database is healthy.
- Drizzle migrations are part of the established database workflow.
- Resend = email.
- OneSignal = notifications.
- MaxMind/IPinfo = historical/current IP intelligence context; verify actual current integration.
- Namecheap = domain/DNS context.
- Vercel = web.
- Render = backend.

## Working rule
**READ → UNDERSTAND → VERIFY → IMPLEMENT → TEST → DOCUMENT.**

Do not fabricate current service states, URLs, deployments, payment outcomes, provider responses, or account state.

For the complete rules and history, read:
**REdom-ENGINEERING-HANDBOOK.md**
