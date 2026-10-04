# ReDom Engineering Handbook

> **Purpose:** Permanent, repository-local engineering memory for ReDom Platforms, Inc.
>
> This document captures the architecture, product rules, implementation decisions, security requirements, AI behavior, payment rules, UI conventions, deployment model, and workflow constraints accumulated during ReDom development. It exists so a new developer or AI agent can continue the project without requiring the project owner to re-explain the system from scratch.
>
> **Repository source of truth:** GitHub.
> **Primary repository:** `ReDomApp/redom-backend`
> **Primary branch:** `main`
>
> **Important:** This handbook is a durable design/context record, not a replacement for reading the actual source code. When this document conflicts with current code, current explicit product requirements, or an authoritative provider specification, investigate the conflict and do not silently invent behavior.

---

## 1. ReDom in one sentence

ReDom is a social/platform product with mobile and web clients, a production backend, PostgreSQL persistence, payments, notifications/email, documentation/help surfaces, and an AI-assisted product experience.

The goal of this handbook is to preserve the **why, what, and non-negotiable implementation rules** around that system.

---

# 2. Absolute engineering principles

1. **GitHub is the source of truth.**
2. Do not invent architecture merely because a framework convention suggests it.
3. Read the existing implementation before changing an existing feature.
4. Preserve existing security logic unless the requested change explicitly replaces it.
5. Preserve exact copy, object placement, dimensions, navigation, validation, and behavior when implementing parity.
6. Do not replace real provider branding with text labels when an official/approved logo asset is required.
7. Prefer the existing ReDom SVG assets and ReDom visual language over generic icons/images.
8. Never expose secrets, API keys, private tokens, PAN, CVV, or credentials in source, logs, documentation, or client state.
9. Payment state must be authoritative from the backend/provider verification, not from client optimism.
10. Any change to policy/behavior should update the relevant policy/documentation section as part of the same product change when appropriate.
11. Do not create a second competing implementation when the existing implementation is the intended source of behavior.
12. A new AI/developer joining the project should read this handbook **before making architectural or cross-cutting changes**.
13. **Nothing is generic.** When an authoritative source can identify a real provider, network, account, device, security state, website, language, or other dynamic value, use that actual value. Never replace it with a fabricated, placeholder, catch-all, guessed, or generic identity.
14. An inability to determine one value must never be used as a reason to fabricate another value or silently weaken a security decision.

---

# 2A. CHANGE-FAST / VERIFY-FIRST — PERMANENT RULE

ReDom is actively developed almost every day/week. The implementation can evolve faster than this handbook, so historical documentation must never be mistaken for a frozen specification.

## Precedence order

When determining what ReDom does **today**, use this order:

1. Current explicit product/security requirement from the project owner.
2. Current code and configuration on GitHub `main`.
3. Current authoritative database/provider/infrastructure state when the task depends on runtime state.
4. Current tests and verification results.
5. This handbook and AI context files as durable engineering context.
6. Git history as historical evidence of how/why the product evolved.

If two sources conflict, do not silently pick the older description. Investigate the current implementation and resolve the discrepancy.

## Verify before relying on fast-changing information

Before implementing or answering a task that depends on any of the following, inspect the current repository/state rather than relying on an old remembered value:

- screen/navigation count;
- route names and destinations;
- Web parity registry;
- UI layout/copy/assets;
- security/authentication/authorization logic;
- payment providers and payment methods;
- refund windows and retry rules;
- Stars packages/trials;
- API endpoints and services;
- database schema/migrations;
- policy/legal wording;
- Docs/Help pages and footers;
- provider integrations;
- environment/deployment architecture;
- domains/URLs;
- feature availability such as “Coming Soon” or “Under Development”;
- AI behavior and URL-generation rules.

## Historical counts and decisions

Numbers such as the previously established **101 mobile screens / 101 Web registry entries** are historical checkpoints unless the current source confirms them. The same principle applies to any other screen count, package list, policy duration, provider, route, or implementation detail.

Git history is valuable for understanding development chronology and why an implementation changed. It must not be used to force an old implementation back into the current product.

## Continuous-update rule

Whenever a durable product/engineering rule changes:

1. change the implementation;
2. verify the resulting behavior;
3. update the relevant policy/documentation;
4. update this handbook/context when the change is durable;
5. preserve the historical decision in Git history rather than pretending the old state never existed.

This keeps ReDom's memory useful without allowing its memory to become stale authority.

# 3. System architecture

## 3.1 Production relationship

**GitHub → Render (Web + API) → ReDom Production API → Neon PostgreSQL**

- GitHub: source of truth.
- Render: production backend deployment.
- ReDom backend: authoritative API/business/security layer.
- Neon: production PostgreSQL database.
- Replit: development workspace.
- Expo Go/development builds: mobile testing/development.
- Render: ReDom Web static-site deployment and production backend deployment.
- The Web application is a separate web implementation; it is not an Expo/React Native web wrapper.

Do **not** substitute Railway for Render in the architecture.

## 3.2 Client separation

### Mobile
- ReDom mobile application.
- Expo/React Native implementation.
- Mobile screens, navigation, assets, services, and security behavior are the reference implementation for mobile product behavior.

### Web
- ReDom Web is a distinct web application.
- TypeScript + React + Vite.
- Located under the web artifact/workspace structure used by the repository.
- Must not import React Native or Expo merely to obtain parity.
- Web parity means reproducing the mobile product's intended behavior in native web implementation.

### Documentation/help
- ReDom Docs and Help are separate web surfaces.
- Intended domains include:
  - `docs.wnncompany.com`
  - `help.wnncompany.com`
- Temporary/current ReDom web infrastructure has used `wnncompany.com`.
- Checkout infrastructure has included `checkout.wnncompany.com`.

---

# 4. ReDom Web mobile-to-web parity rules

The project has a strict **Mobile-to-Web Parity Implementation Brief**.

## Before changing or creating ANY Web screen

1. Read the corresponding mobile screen.
2. Read its navigation entry/route.
3. Read related assets.
4. Read related services and API calls.
5. Read validation/security logic.
6. Read dependent components.
7. Understand exact user flow.
8. Only then implement the equivalent web screen.

## Parity means

Reproduce:

- exact or intentionally equivalent copy;
- field labels and descriptions;
- field/card dimensions;
- spacing;
- hierarchy;
- button placement;
- object order;
- states;
- loading states;
- error states;
- validation;
- security checks;
- navigation destinations;
- back behavior;
- success behavior;
- failure behavior;
- disabled states;
- bottom sheets/modals/popups;
- confirmation screens;
- provider logos;
- SVG assets;
- policy links;
- account/security requirements.

Do not make a generic web approximation when the mobile implementation already defines the intended behavior.

## Screen registry

The established parity target was:

- **101 navigable mobile screens** in `AppNavigator.tsx`.
- **101 corresponding entries** in the Web parity registry.

If the current source changes this count, the source takes precedence and the registry/documentation should be updated.

---

# 5. ReDom visual/asset system

## Core colors

- ReDom Blue: `#1877F2`
- TEXT: `#1C1E21`
- MUTED: `#65676B`
- BORDER: `#CCD0D5`
- ERROR: `#E41E3F`
- WHITE: `#FFFFFF`

## Asset rules

- Prefer ReDom's own SVG assets.
- ReDom logo must use the actual official SVG rather than an invented text substitute.
- Security shield must use the approved ReDom security SVG.
- Provider branding must use real/official logos where required, not merely the provider name written as text.
- Do not use arbitrary stock images where a product SVG is required.
- Chrome/site identity should use the actual ReDom logo/favicon asset.

---

# 6. ReDom Pay

## Product structure

ReDom Pay is accessible through:

**Menu → Settings and Privacy → Orders and Payments → ReDom Pay**

Primary tabs:

- Transactions (default)
- Manage

Transaction categories:

- All
- Money transfer
- Orders
- Donations
- Cards

Transaction cards use the established ReDom Pay design and date presentation, including formats such as **April 4, 2026**.

## Payment providers

### Card payments

The authoritative provider for ReDom card flows is the ReDom Platforms payment account with the card-payment provider used by the implementation.

Important implementation rule:
- Card data is tokenized/validated by the payment provider.
- ReDom must not store PAN or CVV.
- Provider verification is authoritative.

### Bank transfer

Paystack is used for Bank Transfer flows in supported African-country scenarios.

Paystack is **not** the card provider for the Add Card flow.

### Other methods

The Add Payment Method bottom sheet has established options:

1. Credit/Debit Card — active card flow.
2. PayPal — Coming Soon.
3. Bank Payment Method — Under Development (unless the current implementation has subsequently changed this state).

---

# 7. Saved payment methods

Established rule:

- Maximum **3 saved payment methods per ReDom account**.
- Manage shows saved methods with provider logo, last four digits, and country.
- Updating a saved payment method is not supported.
- The intended operation is **Remove & Add New**.
- Removing a payment method requires the established connected-account security-code flow.

Security code:
- Normally 8 digits.
- Delivered through the connected account's verified email or phone mechanism as implemented.
- Never store plaintext security codes.

---

# 8. Add Card flow

Established fields/requirements:

- Card number
- MM/YY
- CVV
- Country selector
- Full name
- Address

Country selection must follow the payment provider's supported-country capability rather than an arbitrary hardcoded six-country restriction.

Address autocomplete uses the established ReDom address-search service flow.

Important security rule:
- Never store PAN or CVV in ReDom's database.
- Use provider tokenization/payment methods.
- Validate through the provider.
- Preserve the established processing state.

The UI has an intentional **minimum 10-second processing presentation** for the card-validation flow where that requirement is still active. Do not remove it merely because a provider response arrives faster; inspect the current implementation first.

---

# 9. ReDom Stars

## Internal value

**1 ReDom Star = $0.10 internal value.**

Established package examples include:

- 10 Stars — $1.99 promotional price
- 20 Stars — $2.99
- 50 Stars — $4.87
- 100 Stars — $10.76
- 150 Stars — $14.00
- 200 Stars — $19.99
- 500 Stars — $50.00
- 700 Stars — $70.00
- 1000 Stars — $99.99

If the live product catalog differs, use the authoritative database/provider configuration and update this handbook.

## Buy Stars payment rule

- Buy Stars is card-payment-provider based.
- Only card payment is used for the Stars purchase flow.
- Local currency/country behavior must use supported-country/currency mechanisms and authoritative FX rather than a fake hardcoded exchange rate.

---

# 10. ReDom Stars trial

The first Stars buyer can receive the established one-time trial behavior.

Current durable design:

- Trial grants **20 Stars**.
- Trial is one-time.
- No immediate charge at trial creation.
- The future one-time charge is attempted at the scheduled day-7 point.
- The user must be told the exact expected charge date/time.
- The backend records trial start time.
- The backend stores the payment method association required for the future charge.
- No Stars/transaction should be treated as fully purchased before the appropriate confirmed states exist.

### Retry rule

If the first scheduled charge fails:

- retry approximately 24 hours later;
- this is the final retry;
- do not perform a third attempt;
- after the final failure, mark the transaction/final state as failed according to the current schema.

### Authoritative processing

The client must not decide that payment succeeded.

The unified payment flow should:

1. Create/initialize the provider checkout/payment session.
2. Return/launch the appropriate client payment experience.
3. Use the ReDom deep-link callback where required:
   `redom://payment/callback`
4. Keep the UI in processing state as required.
5. Backend verifies session/payment/account/package.
6. Backend atomically fulfills the purchase.
7. Only after confirmed backend state does the client show success/credit Stars.

Abandoned checkout should not create a successful Stars transaction.

---

# 11. Transaction identifiers

Established formats:

- Paystack: `RP-` + 7–12 digits.
- Stripe/card-provider transaction: `RS-` + 13–16 digits.
- Existing legacy transactions using `R-` + digits remain valid and should not be unnecessarily migrated solely for cosmetic consistency.

Do not generate IDs that violate the established format.

---

# 12. Refund system

## Refund window

The refund workflow uses the **refund request creation timestamp** as the authoritative timestamp for the review window.

Do not incorrectly calculate eligibility from the original purchase timestamp when the policy specifically refers to refund-request creation.

Established implementation progression included:

- earlier 10-minute minimum review timing;
- later upgraded to a **1-hour refund window** where the current policy specifies that value.

When code and older documentation disagree, inspect the current policy/implementation and update stale documentation.

## Refund request security flow

Established requirements include:

1. Validate requester email.
2. Locate the transaction.
3. Require Transaction ID or provider reference as appropriate.
4. Generate a security code through the established security-mail mechanism.
5. Security code is normally 8 digits; the older fallback design used 6 digits.
6. Store a secure hash rather than plaintext.
7. Limit failed verification attempts.
8. After 3 failed attempts, close the verification/refund attempt according to the security policy.
9. Use the payment provider's webhook/state as an authoritative external payment signal.
10. Send transactional/refund emails through the established email service.

Known support addresses used in the project include:
- `support@wnncompany.com`
- `refunds@...` where configured
- `payment@...` where configured
- `security@...` for security-code delivery

Do not invent addresses if the current environment/configuration differs.

---

# 13. Payment URL / account URL encoding rules

The ReDom AI/payment-support system has a deliberate security boundary around links.

### For validated active ReDom accounts

- It may encode/return valid ReDom account-specific web URLs when the account is authenticated/validated and the URL is actually related to that account.
- It must never encode another user's account URL.
- Account-specific URLs must be tied to the currently authenticated/validated account.

### Payment-related questions

Payment-related public information can be provided without requiring a ReDom account where appropriate.

The AI can use authoritative payment-provider knowledge for payment concepts, supported countries, payment methods, refunds, etc., while presenting the information as ReDom product guidance.

### Provider disclosure rule

The established product requirement was that a user should not need to know which external payment provider powers a feature in order to ask a payment question. The AI should answer the actual ReDom question naturally rather than unnecessarily exposing internal provider relationships in plain product copy.

When a provider name is specifically required by the legal/UI/product context, follow that explicit context.

### URL safety

Only encode URLs that are:
- validated;
- relevant to the requested operation;
- permitted for the requesting account;
- not another user's private/account-specific resource.

Never create an account-specific URL from guesswork.

---

# 14. ReDom AI behavior

The ReDom AI is a product feature, not merely a generic chatbot.

## Core behavior

It should:

- understand ReDom's product terminology;
- understand ReDom policies;
- answer settings/privacy/payment/product questions;
- understand the relationship between account state and permitted actions;
- distinguish public information from authenticated/account-specific information;
- respect security boundaries;
- never invent account state;
- never claim an action succeeded without backend confirmation;
- never reveal secrets or another user's data;
- use the correct current policy rather than stale remembered wording;
- explain policy behavior clearly to users.

## Payment knowledge

The AI should have broad knowledge of payment concepts and the external payment infrastructure used by ReDom so it can answer questions such as:

- supported countries;
- supported currencies;
- payment methods;
- payment failures;
- refunds;
- transaction behavior;
- card verification;
- payment security.

But the user may simply ask a ReDom question without knowing the underlying provider. The AI should answer the ReDom question directly and follow the product's provider-disclosure rule above.

## Account-aware links

The AI must not turn arbitrary user text into a private account URL.

Before producing a private ReDom account URL:
- validate the account;
- validate the relationship between the URL and that account;
- ensure the URL is an allowed route;
- reject cross-account access.

---

# 15. Settings and Privacy

Established top-level areas include:

- Your account
- Tools and resources
- Preferences
- Audience and visibility
- Payments
- Your activity
- Community Standards and legal policies

Known settings include:

- Language
- Dark Mode
- Link History — Under Development (unless current implementation changed)
- Orders and Payments

### Policy-upgrade rule

When an implementation change modifies behavior covered by a policy:

1. implement the product/security change;
2. update the corresponding policy/documentation section;
3. keep user-facing wording aligned with actual implementation;
4. do not leave policy text describing an obsolete flow.

---

# 16. Documentation and Help

## Domains

Targeted documentation/help surfaces include:

- `docs.wnncompany.com`
- `help.wnncompany.com`

## Footer requirement

**Every footer on every screen/page inside Docs and Help must contain the required official ReDom company information.**

Do not implement the footer only on the home page.

The established company/address information used for the docs/help footer is:

**ReDom Platforms, Inc.**  
**495 Flatbush Ave, Brooklyn, NY 11225, United States**

If an authoritative corporate/legal record specifies updated information, update all relevant footers consistently.

## Logo

Docs/help must use the **official ReDom logo asset**, not a text approximation.

## Payment-provider logos

Where payment providers are shown, use the actual current provider branding/logo assets, not text-only labels where the design specifically requires logos.

---

# 17. ReDom Web deployment

The established deployment model:

- Web application → Render.
- Backend → Render.
- Database → Neon.
- GitHub → source of truth.

The ReDom Web project is separate from the mobile Expo project.

ReDom Web is deployed on Render as a static site, with `wnncompany.com` infrastructure and the production web domain.

Do not accidentally move Web deployment responsibility to Render merely because the backend is on Render.

---

# 18. Backend/development workflow

The current repository is a pnpm workspace.

Verified repository facts at the time this handbook was created include:

- repository: `ReDomApp/redom-backend`
- branch: `main`
- package manager: pnpm
- workspace configuration: `pnpm-workspace.yaml`
- lockfile: `pnpm-lock.yaml`
- development environment includes Replit configuration.
- root build includes typechecking and workspace builds.

Do not delete/replace the lockfile casually.

Where Render requires reproducible installs, the project has used frozen-lockfile installation behavior. If dependency manifests and lockfile disagree, resolve the dependency graph correctly rather than bypassing reproducibility as a permanent fix.

---

# 19. Database

Neon PostgreSQL is the production database.

Established requirements:

- use migrations;
- do not assume an empty database means the application is healthy;
- schema changes must be reflected in migrations;
- production schema must be verified;
- payment/account/security state must be persisted atomically where required;
- never store sensitive payment-card authentication data that the payment provider forbids/states should not be stored.

Drizzle migrations were an important part of the established database workflow.

---

# 20. Previously encountered backend problem areas

Past work identified/changed code around areas including:

- network provider controller/service;
- MaxMind/IP information;
- event routes;
- bug reporting service;
- authentication/network-provider logic;
- database/migration setup.

These names are historical context, not permission to recreate deleted files. Always inspect the current repository before modifying them.

---

# 21. Location/IP services

The project has considered MaxMind and IPinfo for IP/location intelligence.

An earlier MaxMind implementation had problems and IPinfo was considered/used as the replacement/reference.

Do not assume an IP provider is authoritative for exact physical address. IP geolocation is approximate unless an explicit trusted location mechanism exists.

---

# 22. Email and notifications

Known integrations include:

- Resend for transactional email.
- OneSignal for notifications.

Email should be:
- triggered by authoritative backend events;
- safe against duplicate delivery where idempotency is required;
- free of secrets and sensitive payment data unless explicitly required and protected;
- aligned with the current policy wording.

Security codes should never be logged in plaintext.

---

# 23. Third-party/service ecosystem

The established ReDom ecosystem has included:

- GitHub
- Render
- Neon PostgreSQL
- Replit
- Vercel
- Expo
- OpenAI
- Stripe/card-payment infrastructure
- Paystack
- Resend
- OneSignal
- MaxMind
- IPinfo
- RCS for Business / Google
- Namecheap
- payment/identity services as explicitly integrated

Use the actual current repository/environment configuration rather than assuming every historical service remains active.

---

# 24. Domain/DNS context

Known domain infrastructure has included:

- `wnncompany.com`
- `www.wnncompany.com`
- `docs.wnncompany.com`
- `help.wnncompany.com`
- `checkout.wnncompany.com`

Namecheap has been used for domain registration/DNS.

Vercel has been used for ReDom Web and documentation/help projects.

---

# 25. Identity/KYC/payment-account context

ReDom's payment setup has involved business verification and identity/business documentation.

Do not put copies of sensitive identity documents, SSNs, EIN documents, passports, driver's licenses, or private verification material into the public repository.

Only record:
- non-secret configuration;
- public company information;
- references to where private documents are securely stored;
- required provider setup steps.

---

# 26. Security philosophy

Security is part of product behavior, not a final checklist.

Always consider:

- authentication;
- authorization;
- account ownership;
- session validity;
- provider verification;
- webhook signature verification;
- idempotency;
- replay protection;
- rate limits;
- failed-attempt limits;
- secure code hashing;
- data minimization;
- private URL authorization;
- transaction atomicity;
- auditability;
- secret management.

Never solve a security problem by moving sensitive validation solely to the client.

---

# 27. UX behavior rules

When copying an established ReDom screen:

- Do not casually rename labels.
- Do not replace a button with a different control.
- Do not change a bottom sheet into a page unless explicitly required.
- Do not change a modal into a toast if the reference uses a modal.
- Do not change the navigation destination.
- Do not omit loading/error/empty states.
- Do not make cards arbitrarily larger/smaller.
- Do not replace SVGs with generic icon libraries when an approved asset exists.
- Do not invent copy.
- Do not remove security messaging simply because it makes the screen shorter.

---

# 28. Current Web implementation philosophy

The Web project is approaching a large mobile-to-web parity target.

For every screen:

**Reference mobile → understand behavior → reproduce in Web → verify navigation → verify state → verify visuals → verify security → verify copy.**

Do not treat parity as only a visual exercise.

---

# 29. AI/developer handoff protocol

When a new AI or developer starts on ReDom:

### Step 1

Read this handbook.

### Step 2

Inspect the GitHub repository tree.

### Step 3

Identify whether the requested change is:
- mobile;
- web;
- backend;
- database;
- payment;
- docs/help;
- AI;
- security;
- deployment.

### Step 4

Read the existing implementation for the exact feature.

### Step 5

Search the repository for:
- routes;
- services;
- models/schema;
- policy text;
- existing components;
- tests;
- assets;
- environment variable names.

### Step 6

Make the smallest change that satisfies the requirement without breaking established behavior.

### Step 7

Run the appropriate typecheck/build/test/verification.

### Step 8

If the behavior changed, update relevant policy/documentation.

### Step 9

Record important architectural decisions here.

---

# 30. Things an AI must NOT do

- Do not claim to have deployed something without verifying the deployment.
- Do not claim a payment succeeded without backend/provider confirmation.
- Do not claim a Google/Vercel/Render/Neon state is current without checking when current state matters.
- Do not fabricate an API response.
- Do not fabricate a URL.
- Do not expose secrets.
- Do not use another user's account URL.
- Do not store card PAN/CVV.
- Do not weaken authentication to make a test pass.
- Do not silently change product policy.
- Do not silently replace the payment architecture.
- Do not use generic placeholder logos when actual branding is required.
- Do not import React Native/Expo into ReDom Web solely to avoid implementing web parity.
- Do not treat a historical design decision as current if source code proves it has changed.
- **Do not substitute a generic provider/network/account/device/security identity when an actual value is available.**
- **Do not invent a carrier, ISP, VPN, Tor provider, proxy, hosting provider, official website, device identity, account identity, 2FA state, or other security-sensitive value.**
- **Do not treat "generic" as a security fallback. Unknown state and generic identity are not interchangeable.**
- **Do not silently assume a secure/recognized state when the authoritative backend cannot establish it.**

---

# 31. Decision log principle

When a major decision is made, record:

- Date
- Decision
- Why
- Affected systems
- Security implications
- Policy/documentation implications
- Migration/rollback implications

This prevents the project from accumulating undocumented assumptions.

---

# 32. Known product/legal/company presentation

Established public-facing company identity:

**ReDom Platforms, Inc.**

Established business address used in ReDom's public-facing company/footer context:

**495 Flatbush Ave, Brooklyn, NY 11225, United States**

Google Maps has been associated with a ReDom Platforms, Inc. corporate-office listing at this address in the development context.

Do not represent a map listing as legal incorporation proof. Public directory/map data and legal corporate records are different evidence sources.

---

# 33. What this handbook is for

This file exists specifically so that:

> If the original AI conversation becomes unavailable, another AI can read the repository and understand how ReDom is supposed to work before touching the code.

It should therefore be updated whenever an important permanent ReDom rule is established.

**Do not put secrets or private credentials into this file.**

---

# 34. Final instruction to future ReDom agents

**Treat ReDom as an existing production-oriented product, not a blank template.**

Before implementing anything:

**READ → UNDERSTAND → VERIFY → IMPLEMENT → TEST → DOCUMENT.**

Preserve established behavior. Follow the source code. Follow the current product requirement. Protect account and payment security. Keep mobile/web behavior aligned. Keep policy and implementation synchronized.

If something is ambiguous, inspect the repository and the existing implementation before guessing.

---

# 35. Recognized-device authentication and account selector

This is a permanent authentication architecture requirement for **both ReDom Web and ReDom Mobile**.

## 35.1 Client separation

The recognized-device experience must be implemented independently in:

- **ReDom Web:** `artifacts/redomweb`
- **ReDom Mobile:** `artifacts/redom-frontend`

They share the ReDom backend but are not the same frontend implementation.

**Web must not import React Native or Expo. Mobile must not be redesigned around the Web implementation.**

Both clients must reproduce the same intended authentication behavior while using their own platform-native/web architecture.

## 35.2 Authentication entry decision

Whenever a user reaches the authentication entry point, the client must first determine whether the current browser/device has recognized ReDom account associations.

Flow:

```
Authentication Entry
        |
        +-- Recognized accounts found --> Account selector
        |
        +-- No recognized accounts ----> Existing Login screen
```

If no recognized account exists, do not show fake accounts or an empty account picker. Continue directly to the existing ReDom login flow.

## 35.3 Device recognition is backend-authoritative

Do not implement recognized-device security as a frontend boolean or a browser/local-storage flag.

Examples of invalid security shortcuts:

```ts
isRecognized = true;
```

or:

```js
localStorage.setItem("recognized", "true");
```

The backend must determine whether the device/browser is recognized.

The architecture should maintain a protected ReDom device-recognition credential/record and account associations. A browser/device fingerprint may be a signal, but it must not by itself be treated as an authentication credential.

Google/browser-saved account information may assist account discovery/autofill where available, but it is not proof of ReDom account ownership.

## 35.4 Recognized account cards

When recognized accounts exist, display each account in its own independent card.

Each card contains:

- actual account/profile image;
- actual ReDom account display name;
- right-facing chevron;
- exact established spacing, dimensions, border, radius, typography, and alignment from the approved reference;
- the entire card as the selectable target.

Never hard-code the example names or photos from design references into production behavior.

If a real account has no profile image, use the established ReDom neutral-avatar asset/state.

## 35.5 Existing flows must be reused

The recognized-account layer wraps the existing authentication system; it does not create competing login/signup/reset systems.

### Log into another account

The exact action:

**Log into another account**

must route to the existing ReDom login screen.

### Create new account

The exact action:

**Create new account**

must route to the existing ReDom account-creation flow.

### Forgot password

The exact action:

**Forgot password?**

must route to the existing ReDom forgot-password flow.

Do not create parallel authentication flows for these actions.

## 35.6 Selecting a recognized account

Selecting a recognized account opens the existing-style password screen for that account.

The password screen must preserve the approved reference:

- back control;
- actual profile image;
- actual account name;
- independent password field;
- secure input;
- eye/eye-slash SVG;
- independent Log in button;
- Forgot password? action;
- exact visual hierarchy and spacing.

Pressing **Log in** must send the credentials to the backend and must never simply navigate to Home-feed.

The backend validates:

1. account;
2. password;
3. account status;
4. recognized-device state;
5. additional device verification requirements;
6. 2FA/security configuration;
7. session eligibility.

Only after the required authentication/security checks succeed may the user enter Home-feed.

## 35.7 2FA and device verification

The client must respect the backend's actual security state.

Possible sequence:

```
Account password
      |
      +-- recognized + no extra verification --> Home-feed
      |
      +-- verification required --------------> Verification code
      |
      +-- 2FA enabled ------------------------> 2FA verification
                                                     |
                                                     v
                                                  Home-feed
```

Do not assume that a recognized device automatically bypasses 2FA.

Do not assume that a failed/unknown security determination means "no 2FA."

Do not move security decisions exclusively to the client.

## 35.8 Manage profiles

The three-dot control on the recognized-account selector opens the account-management experience shown in the approved reference.

The title is:

**Manage profiles**

Every account is again displayed in its own independent card with the same actual profile data and approved visual construction.

Selecting an account opens its profile-management detail screen.

The detail screen contains the established:

**Remove profile**

action and the corresponding account/device association explanation.

## 35.9 Remove profile semantics

**Remove profile** removes that account from the recognized-account picker for the current device/browser.

It does **not**:

- delete the ReDom account;
- delete the profile;
- disable the account;
- delete database account data;
- revoke every session;
- revoke the entire recognized-device credential.

The device itself remains recognized.

Example:

```
Before:
Device
 ├── Account A
 ├── Account B
 └── Account C

Remove Account B

After:
Device
 ├── Account A
 └── Account C
```

The recognized-device state remains valid.

Removing an account from the picker and forgetting/revoking the entire device are separate operations.

## 35.10 Language selector

The language control at the authentication screen is interactive.

For example:

**English (US) ▼**

opens the established bottom sheet rather than a full-page language screen.

The sheet must reproduce the approved reference:

- dimmed backdrop;
- rounded top corners;
- drag handle;
- close X;
- **Select your language** heading;
- independently rendered language rows;
- right-aligned selected/unselected checkbox;
- horizontal separators;
- scrolling;
- exact language strings and native characters;
- exact spacing and visual hierarchy.

Established reference languages include:

- English (US)
- Hausa
- Español
- Français (France)
- Português (Brasil)
- العربية
- 中文(简体)
- Italiano
- 한국어
- Bahasa Indonesia
- Deutsch
- 日本語
- Af-Soomaali
- Afaan Oromoo
- Afrikaans
- Azərbaycan dili
- Bahasa Melayu

The current supported-language configuration remains authoritative if it differs.

## 35.11 Reference visual fidelity

The supplied authentication/profile screenshots are the visual source of truth for this flow.

Do not replace the reference with a generic approximation.

Preserve:

- exact copy;
- typography;
- colors;
- spacing;
- card dimensions;
- border thickness;
- radius;
- icon placement;
- SVGs;
- profile-image sizing;
- button sizing;
- sheet geometry;
- backdrop;
- navigation;
- field hierarchy;
- error/loading states.

Every major object must have its own intentional card/field/container where the reference does.

---

# 36. Authentication network/provider Terms block

The authentication selector includes a Terms block whose provider/network identity is dynamically resolved from the user's detected public IP/network information.

## 36.1 Required wording

The base wording is:

> **By continuing, you agree to [NETWORK NAME]'s Terms which includes letting [NETWORK NAME] request and receive your phone number. Change Settings**

Only the network/provider identity is dynamic. The wording, capitalization, punctuation, hierarchy, and visual treatment must otherwise follow the approved reference.

Do not replace this with a permanently hard-coded carrier such as MTN.

Do not replace it with:

> "By continuing, you agree to our terms."

when a real network/provider identity has been detected.

## 36.2 Provider resolution

The backend/network-intelligence layer must determine the actual identifiable provider/network for the current public IP.

The resolved network object should conceptually contain:

```ts
{
  name: string,
  type: string,
  officialWebsite: string | null,
  detected: boolean
}
```

The exact schema/service is determined by the existing implementation.

## 36.3 Nothing is generic

This is a **global security/product rule**, not merely a Terms-copy rule.

When the network intelligence identifies:

- mobile carrier/ISP;
- VPN provider;
- Tor-related network/provider;
- proxy provider;
- hosting/datacenter provider;
- other identifiable network/provider;

use the **actual detected identity**.

Do not intentionally collapse these into:

- Generic Network;
- Generic Provider;
- Generic Hosting;
- Generic VPN;
- Generic ISP;
- Unknown Carrier;

when the source actually provides an identifiable value.

Examples:

```
Detected:
MTN Nigeria
Type:
mobile/ISP

Display:
MTN Nigeria
```

```
Detected:
Example VPN
Type:
VPN

Display:
Example VPN
```

```
Detected:
Generic Hosting
Type:
hosting/datacenter

Display:
Generic Hosting
```

The fact that a provider happens to be a hosting company does not authorize replacing its actual name with another generic category.

## 36.4 VPN/Tor/proxy/hosting requirement

There is **no requirement to first convert VPN, Tor, proxy, or hosting traffic into a generic label**.

If the detection service identifies the actual provider/network, use that identity.

Examples of invalid behavior:

```
VPN detected
    ↓
Generic Network
```

```
Tor detected
    ↓
Generic Network
```

```
Hosting detected
    ↓
Generic Network
```

```
Proxy detected
    ↓
Generic Network
```

The system must preserve the actual classification and provider identity returned by the authoritative network-intelligence source.

## 36.5 No provider identity available

Only when the authoritative network-intelligence service genuinely cannot establish an identifiable provider/network may the existing ReDom generic fallback wording be used.

This is a true **no-identifiable-data state**.

It is not a reason to replace a known VPN, Tor, proxy, hosting provider, ISP, mobile carrier, or other network identity with a generic label.

Never invent a provider name.

## 36.6 Official website link

The network/provider Terms link must use the verified official website belonging to the **actually detected provider/network**.

Flow:

```
Detected network/provider
        ↓
Verified provider metadata
        ↓
Official HTTPS website
        ↓
External browser
```

Do not:

- construct an official website URL from guesswork;
- send the user to an unrelated provider;
- use an arbitrary user-supplied website;
- substitute a generic website;
- claim a website is official without verified provider metadata.

The Web implementation should use the appropriate browser-opening mechanism. The Mobile implementation should use the platform's external-browser mechanism.

## 36.7 Change Settings

**Change Settings** remains a separate interactive control.

It must not be merged into the network Terms link.

The two actions are:

- **[NETWORK NAME]'s Terms** → verified official network/provider website.
- **Change Settings** → the established settings flow.

## 36.8 Global "Nothing Is Generic" rule

The following is an architectural invariant across ReDom:

> **NOTHING IS GENERIC.**

Do not use generic, placeholder, fabricated, guessed, or catch-all identity values anywhere in authentication, security, device recognition, network detection, account selection, profile management, payment, or related user-facing security flows when an actual authoritative value can be obtained.

This applies to:

- network/provider name;
- ISP;
- mobile carrier;
- VPN;
- Tor network/provider;
- proxy;
- hosting/datacenter;
- official website;
- country;
- region;
- language;
- device identity;
- browser/device state;
- account identity;
- profile information;
- 2FA state;
- verification state;
- session state;
- payment provider/state;
- transaction state;
- any other security-sensitive dynamic value.

## 36.9 Unknown is not generic

When a value genuinely cannot be determined:

1. preserve the actual unknown state;
2. follow the existing ReDom handling for that specific field;
3. do not fabricate a replacement identity;
4. do not silently downgrade security;
5. do not assume the safest/least restrictive state without an explicit security rule.

For example:

```
Unable to determine device recognition
        ↓
Do NOT assume recognized
        ↓
Use the existing secure verification path
```

and:

```
Unable to determine 2FA state
        ↓
Do NOT assume 2FA is disabled
        ↓
Use the authoritative backend security state/failure handling
```

## 36.10 Single authoritative source

Where multiple UI fields depend on the same dynamic identity, resolve it once from the authoritative source and use that same resolved object consistently.

Do not produce:

```
Detected provider → Actual Provider
Terms name → Generic Provider
Website → unrelated website
Description → generic description
```

Instead:

```
Authoritative provider resolution
        ↓
name
type
official website
other permitted metadata
        ↓
all relevant UI fields
```

This prevents inconsistent identity presentation and security mistakes.

---

# 37. Final security invariant

For every ReDom implementation, the following rule overrides convenience:

> **USE THE REAL AUTHORITATIVE VALUE OR PRESERVE THE TRUE UNKNOWN STATE. NEVER INVENT A GENERIC IDENTITY.**

The implementation must never fabricate identity data to make a UI look complete, never replace an identifiable provider with a generic category, never use generic security state as a shortcut, and never treat frontend assumptions as authoritative security decisions.

This rule applies equally to **ReDom Web, ReDom Mobile, the shared ReDom Backend, database state, AI behavior, and provider/network integrations**.

---

# 38. Final instruction to future ReDom agents

**Treat ReDom as an existing production-oriented product, not a blank template.**

Before implementing anything:

**READ → UNDERSTAND → VERIFY → IMPLEMENT → TEST → DOCUMENT.**

Preserve established behavior. Follow the source code. Follow the current product requirement. Protect account and payment security. Keep mobile/web behavior aligned. Keep policy and implementation synchronized.

**Nothing is generic. If the real value can be determined, use the real value. If it cannot be determined, preserve the true unknown state and follow the established secure handling. Never fabricate an identity or silently weaken security.**

If something is ambiguous, inspect the repository and the existing implementation before guessing.


# 39. ReDom AI Image Intelligence & Creative Studio

ReDom AI's image experience is an **objective-driven image intelligence and creative workflow**, not a collection of unrelated generic image buttons.

When a user explicitly supplies an image to ReDom AI, the system may analyze that image and act on the user's natural-language objective.

## 39.1 Image understanding

The image intelligence layer should inspect, where technically available:

- objects and subjects;
- visible text/OCR;
- logo and brand marks;
- colors and palette;
- typography;
- composition;
- aspect ratio;
- dimensions;
- transparency;
- background;
- file format;
- file size;
- visual style;
- layout;
- approximate intended use.

The system must distinguish **binary facts measured from the file** from visual/AI inferences.

## 39.2 Brand recognition

For a request such as:

> "What brand is this?"

ReDom should use the supplied image's visual clues and current Internet research where appropriate.

A result may contain:

- likely brand;
- confidence;
- evidence such as logo geometry, typography, color treatment and matching public imagery.

Do not present a memory-only guess as Internet-verified.

## 39.3 Creative branding

For requests such as:

> "Build my own branding using the colors of this image, but use ReDom as the name."

ReDom should infer:

- reference image;
- requested characteristics to preserve;
- new brand identity/name;
- intended output.

It should create an **original ReDom asset** rather than copying a protected logo, exact trademark or distinctive brand identifier.

If the user requests only a palette or general visual feeling, preserve those requested characteristics while creating new geometry/identity.

## 39.4 Natural-language image editing

The user should not need to know image-processing terminology.

Examples:

- "Change only ReDom to Facebook."
- "Change only the blue to red."
- "Remove the text."
- "Make the background transparent."
- "Keep everything but change the product name to ReDom."
- "Make this look more professional."

The intent parser should determine the smallest appropriate edit scope.

For a "change only" request, preserve unrelated:

- background;
- layout;
- colors;
- shapes;
- shadows;
- lighting;
- object positions;
- other text;
- other visual elements.

Use the image-editing/inpainting path rather than generating an unrelated fresh image.

## 39.5 Platform-aware preparation

For requests such as:

> "Make this my Facebook cover."

ReDom should research the **current platform requirements** when they are not already authoritative in the product configuration.

Research may include:

- recommended dimensions;
- aspect ratio;
- minimum dimensions;
- maximum file size;
- supported formats;
- crop behavior;
- mobile/desktop safe areas;
- positioning requirements.

Then ReDom should actually prepare the image:

```
Uploaded image
    ↓
Understand objective
    ↓
Research current platform requirements
    ↓
Calculate target dimensions
    ↓
Crop / resize / preserve composition
    ↓
Optimize compression
    ↓
Validate
    ↓
Downloadable result
```

The user should not have to supply the raw pixel dimensions unless they specifically want to override the researched platform requirement.

## 39.6 File-size optimization

For:

> "Compress this below 500 KB."

ReDom should:

1. inspect the original;
2. measure dimensions and format;
3. determine an appropriate output format;
4. preserve transparency where required;
5. iteratively optimize quality;
6. reduce dimensions only when necessary;
7. verify the resulting binary size;
8. repeat until the requested limit is satisfied or report that the constraint cannot be met without further quality loss;
9. provide the resulting downloadable asset;
10. explain what changed.

The size requirement is a real binary validation requirement, not merely explanatory text.

## 39.7 PDF export

When a user asks to export an image as PDF, ReDom should create an actual downloadable PDF containing the supplied/processed image rather than merely explaining how the user can create one.

## 39.8 Objective-driven routing

The intended internal workflow is:

```
Image
  ↓
Image Understanding
  ↓
Intent / Objective Understanding
  ↓
+-----------------------------+
| Identify / Research         |
| Generate / Brand            |
| Edit / Inpaint              |
| Platform Preparation        |
| Crop / Resize               |
| Compression                 |
| PDF Export                  |
| Validation                  |
+-----------------------------+
  ↓
Final downloadable result
```

The user should be able to express the objective naturally. ReDom chooses the appropriate supported workflow.

## 39.9 Security

Explicit image submission to ReDom AI is user-authorized input to the AI workflow. It must not silently inspect unrelated private message media.

The existing image security service remains authoritative for generation/editing safety. Image processing operations such as compression, crop, resize, rotation and PDF conversion are not inherently fraudulent, but edits to government/financial documents, authenticity-related modifications, identity-photo manipulation and other protected operations remain subject to the existing security policy.

## 39.10 Nothing generic

This capability follows ReDom's permanent **NOTHING IS GENERIC** rule.

Do not fabricate:

- brand identity;
- platform dimensions;
- file-size limits;
- supported formats;
- colors;
- image metadata;
- OCR text;
- account state;
- provider identity;
- research evidence.

When current external information is required, research it. When binary metadata can be measured, measure it. When the user asks for a transformation, actually perform and validate it.
