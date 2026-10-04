# ReDom Backend

The backend platform for ReDom, a social and communication platform built around identity, profiles, social networking, messaging, real-time communication, AI, commerce, payments, and security.

This repository contains the production backend workspace used by ReDom clients and services. It is organized as a pnpm monorepo, with the backend application located at `artifacts/redom-backend`.

## What this repository provides

ReDom Backend is an Express 5 and TypeScript service backed by PostgreSQL and Drizzle ORM. The API is organized into focused domains rather than one large controller.

Implemented backend domains include:

- Authentication and account registration
- Sessions, login history, recognized devices, and account security
- Two-factor authentication and recovery codes
- User profiles, profile editing, profile media, sharing, and privacy
- Feed and posts
- Comments, reactions, saves, shares, mentions, and stories
- Friends, friend requests, followers, following, blocking, muting, and restrictions
- Search and search history
- Direct messaging and group messaging
- End-to-end messaging encryption and conversation cryptography
- Message attachments, encrypted media, drafts, read receipts, reactions, forwarding, and link previews
- Group permissions, approvals, reports, invites, scheduled calls, and group controls
- Voice and video calls and call links
- Linked devices
- Business messaging profiles
- Public groups
- Events, RSVPs, event settings, locations, covers, and recurring events
- Marketplace listings, categories, interactions, reviews, and transactions
- Payments, subscriptions, refunds, payment webhooks, and transaction records
- ReDom Stars payments and Stars gifting
- ReDom AI chat, localization, image generation, image editing, image intelligence, file analysis, voice transcription, and AI quotas
- ReDom-v2.8—Video generation
- ReDom Movie Studio project planning, revision, continuity checks, and production
- Support, bug reports, appeals, reports, and moderation-related records
- ReDom OAuth and MCP integration endpoints
- Cloud object storage integrations
- Search infrastructure and geolocation/security helpers
- Structured logging, rate limiting, validation, and error monitoring

## Architecture

```text
ReDom Web / ReDom Mobile
          |
          v
      ReDom API
          |
   +------+-------------------------------+
   |      |       |       |       |       |
   v      v       v       v       v       v
 Auth   Social  Messages Calls   AI    Commerce
   |      |       |       |       |       |
   +------+-------+-------+-------+-------+
          |
          v
      PostgreSQL
       Drizzle ORM
          |
    +-----+----------------------+
    |            |               |
    v            v               v
  Redis      Object Storage   Search
             and media
```

The application uses PostgreSQL for persistent relational state, Drizzle ORM for typed database access and migrations, Redis-compatible infrastructure for selected runtime workloads, object storage for media, and external service integrations where required by individual domains.

## Technology

### Core

- TypeScript
- Node.js
- Express 5
- PostgreSQL
- Drizzle ORM
- Drizzle Kit
- Zod
- pnpm workspaces

### Security and infrastructure

- bcrypt
- JSON Web Tokens
- express-rate-limit
- Sentry
- Pino and pino-http
- MaxMind
- IP intelligence providers
- Cloudflare Turnstile
- Redis
- S3-compatible object storage
- Cloudflare R2 integration

### Platform integrations

- Twilio
- Resend
- Mapbox
- Meilisearch
- AI service integrations

## Repository structure

```text
redom-backend/
├── artifacts/
│   ├── redom-backend/
│   │   ├── src/
│   │   │   ├── config/
│   │   │   ├── controllers/
│   │   │   ├── database/
│   │   │   ├── lib/
│   │   │   ├── middleware/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   └── index.ts
│   │   └── package.json
│   └── ...
├── lib/
├── scripts/
├── package.json
└── pnpm-workspace.yaml
```

## API surface

The route registry currently exposes the following API areas.

### Health

- Health/status endpoints

### Authentication

- `/auth`
- Registration flows
- Login flows
- Verification
- Password handling
- Account security
- Authentication challenges
- Device recognition

### Sessions

- `/sessions`
- Session creation and validation
- Session lifecycle
- Active sessions

### OAuth and MCP

- `/oauth`
- ReDom OAuth
- ReDom MCP integration

### AI

- `/ai`

AI capabilities currently represented by the backend include:

- AI chat
- UI localization
- Image generation
- Image editing
- Image intelligence
- Image quota management
- Voice transcription
- File analysis
- AI feedback
- ReDom-v2.8—Video
- ReDom Movie Studio

Image generation supports configurable prompts, negative prompts, dimensions, aspect ratios, steps, image count, seeds, guidance scale, output formats, reference images, and reference strength.

Supported image aspect ratios include:

- 1:1
- 4:3
- 3:4
- 16:9
- 9:16
- 3:2
- 2:3
- 4:5
- 5:4
- 21:9

Image output formats include PNG, JPEG, and WebP.

Video generation supports:

- Prompt
- Generate or CGI operation
- 4 to 300 second duration
- 720p or 1080p resolution
- 16:9, 9:16, or 1:1 aspect ratio

Movie Studio supports:

- Project creation
- Duration
- Quality levels
- Cinematic style configuration
- Aspect ratio
- Audio
- Voice
- Project titles
- Planning
- Revisions
- Continuity checks
- Production
- Asynchronous job callbacks

### Social feed

- `/feed`
- Posts
- Feed preferences
- Media
- Visibility
- Post editing and deletion
- Sharing
- Comments
- Reactions
- Saves
- Mentions
- Stories

Post records support text, photo, video, reel, story, poll, shared, and quote types.

Post visibility supports:

- Public
- Friends
- Followers
- Only me

Posts also track comments-enabled, sharing-enabled, edited, deleted, publication, creation, and update state.

### Profiles

- `/profile`
- `/profile/edit`
- `/profile/media`
- `/profile/share`

Profile data includes:

- First name
- Last name
- Username
- Public ID
- Profile ID
- Profile share code
- Display name
- Bio
- Profile photo
- Cover photo
- Website
- Occupation
- Education
- Hometown
- Current city
- Relationship status
- Pronouns
- Profile visibility
- Verification status
- Join-date visibility
- Profile completion
- Friend count
- Follower count
- Following count
- Post count

Profile privacy also controls visibility of selected profile information such as bio, current city, hometown, and birthday components.

Profile responses can include:

- Friends
- Reels
- Photos
- Posts
- Suggestions
- Profile media
- Verification state
- Relationship information

### Friends and social graph

- `/friends`
- Friend requests
- Friends
- Followers
- Following
- Blocked users
- Muted users
- Restricted users

The backend maintains connection state and safety checks around requests and blocked relationships.

### Search

- `/search`
- User search
- Username search
- Public ID search
- Profile ID search
- Search history

Search results can include:

- User ID
- First name
- Last name
- Username
- Public ID
- Profile ID
- Profile photo
- Verification state

### Messaging

- `/messages`
- Conversation inbox
- Direct conversations
- Group conversations
- Message history
- Message media
- Encrypted media
- Drafts
- Read receipts
- Reactions
- Forwarding
- Shared messages
- Chat information
- Business profiles
- Scheduled group calls
- Group details
- Group approvals
- Group reports
- Group invite permissions
- Group send guards
- Messaging guards
- Conversation cryptography
- End-to-end encryption
- Linked-device messaging
- Message completion/lifecycle handling

Conversation and participant state includes fields such as:

- Conversation type
- Group name
- Group photo
- Message count
- Unread message count
- Muted state
- Pinned state
- Archived state
- Notification state
- Mentions-only mode
- Custom notification sound
- App wallpaper
- Call participation permissions
- Typing state
- Typing timestamp

Messages support:

- Text
- Captions
- Mentions
- Hashtags
- Hyperlinks
- Rich link previews
- Markdown
- Code blocks
- Translation state
- Encrypted payloads
- Encryption versions
- Forwarding
- Editing
- Pinning
- Sent/delivered/read state
- Read timestamps
- Per-user deletion
- Everyone deletion
- Deleted placeholders
- Attachments
- Reactions
- Call metadata
- System actions

Message moderation and safety metadata can track:

- AI review state
- Moderation status
- Spam detection
- Scam detection
- Adult-content detection
- Violence detection
- Hate-speech detection
- Malware detection
- Report count
- Restricted-message state
- Failed delivery

Message attachments support metadata including:

- Attachment type
- File URL
- Thumbnail URL
- File name
- MIME type
- File extension
- File size
- Duration
- Waveform
- Processing status
- Encryption state
- Encryption version
- View-once state
- View-once opening state
- View-once expiration

### Calls

- `/calls`
- `/calls/*` call links
- Voice calls
- Video calls
- Call lifecycle
- Call permissions
- Call links
- Group call scheduling

### Public groups

- `/public-groups`
- Public group discovery
- Membership
- Group administration

### Events

- `/events`
- Event creation
- Event discovery
- Hosted events
- Past events
- Event settings
- Event covers
- RSVPs
- Interested/Going responses
- Event cancellation
- Physical locations
- Virtual URLs
- Time zones
- Location radius
- Recurrence rules

Event records include name, description, start/end time, timezone, event type, privacy, location information, virtual URL, recurrence, cover media, status, and RSVP information.

### Marketplace

The backend contains marketplace data models for:

- Categories
- Listings
- Buyer/seller relationships
- Listing interactions
- Reviews
- Transactions

Marketplace listing fields include:

- Listing ID
- Title
- Description
- Category
- Condition
- Brand
- Model
- Color
- Price
- Currency
- Negotiability
- Offer acceptance
- Quantity
- Quantity sold
- Remaining stock
- Cover image
- Additional images
- Country
- State
- City
- Pickup availability
- Delivery availability
- Shipping availability
- Listing status
- AI moderation score
- Review status
- Rejection reason
- Moderator approval
- Views
- Saves
- Shares
- Messages received
- Purchases
- Return policy
- Return window
- Refund availability
- Featured state
- Sponsored state
- Promotion expiration
- Created/updated/published/sold/deleted timestamps

Listing status supports states such as:

- Draft
- Pending review
- Active
- Reserved
- Sold
- Out of stock
- Hidden
- Removed
- Deleted

### Payments

- `/payments`
- `/orders-payments`
- Refunds
- Subscription renewals
- Payment verification
- Payment callbacks
- Payment webhooks
- Customer payment notifications
- Stars payments
- Stars gifting

Payment transactions track:

- Internal transaction ID
- User
- Subscription
- Plan
- Reference
- ReDom transaction ID
- Payment provider
- Provider transaction ID
- External transaction ID
- Amount
- Currency
- Purpose
- Status
- Checkout URL
- Gateway status
- Paid timestamp
- Metadata
- Customer email status
- Refund status
- Refund ID
- Refund amount
- Refund request time
- Refund expected time
- Refund processed time
- Refund errors

### Support and safety

- `/support`
- `/bug-reports`
- `/refunds`
- Reports
- Appeals
- Evidence messages
- Account actions
- Activity logging
- Moderation state
- Safety restrictions

## Database model

The PostgreSQL schema is divided into focused Drizzle schema modules.

### Identity and security

- Users
- User profiles
- User settings
- User privacy
- Active sessions
- Sessions
- Login history
- Recognized devices
- Account actions
- Account security
- Registration challenges
- Registration flow reservations
- Email verification
- Phone verification
- TOTP login challenges
- Two-factor recovery codes
- Verification
- Verification documents
- Verification subscriptions

### Social graph

- Friends
- Friend requests
- Followers
- Following
- Blocked users
- Muted users
- Restricted users

### Content

- Posts
- Draft posts
- Post media
- Post mentions
- Comments
- Reactions
- Saves
- Saved collections
- Shares
- Stories
- Story viewers
- Polls
- Video metadata
- Video quality
- Video captions
- Video comments
- Video views

### Messaging

- Conversations
- Conversation participants
- Messages
- Message attachments
- Message media
- Message media envelopes
- Message deletions
- Message drafts
- Message reads
- Message requests
- Messaging cryptography
- Scheduled group calls
- Group invite links
- Public groups
- Public group members

### Commerce

- Marketplace categories
- Marketplace listings
- Marketplace interactions
- Marketplace reviews
- Marketplace transactions
- Payment plans
- Payment subscriptions
- Payment transactions
- Payment webhook events

### AI

- ReDom AI image generations
- ReDom AI image quotas
- ReDom AI security events
- ReDom AI videos
- ReDom Video Studio data

### Events and platform operations

- Events
- Notifications
- Notification preferences
- Feed preferences
- Search history
- Activity logs
- Reports
- Report evidence
- Appeals

## ReDom AI data model

Image generation records contain:

- User
- Job ID
- Operation
- Model
- Model ID
- Prompt
- Width
- Height
- Steps
- Seed
- Storage key
- Status
- Generation time
- Error
- Output manifest
- Engine settings
- Creation/completion timestamps

Video generation records contain:

- User
- Job ID
- Runtime
- Model
- Operation
- Prompt
- Target duration
- Resolution
- Aspect ratio
- Status
- Storage key
- Download token hash
- Download-token expiration
- Generation time
- Error
- Security request ID
- Creation/completion timestamps

## Validation and rate limiting

Request bodies are validated with Zod schemas at the route boundary.

Examples of protected AI limits include:

- UI localization: 30 requests per minute
- Image requests: 10 requests per minute
- Video job creation: 3 requests per minute
- Movie project creation: 5 requests per minute
- Movie production: 2 requests per minute

The exact limits are implementation details and may change as the platform evolves.

## Security

Security is treated as a backend responsibility rather than a client-side decision.

The backend includes:

- Authentication middleware
- Password hashing
- JWT-based authentication
- Session management
- Recognized-device records
- Two-factor authentication
- Recovery codes
- Login history
- Rate limiting
- Request validation
- Privacy-aware profile responses
- Block/restriction checks
- Message moderation metadata
- Encrypted message payload support
- Per-recipient encryption envelopes
- Encrypted media handling
- Signed/expiring media access patterns
- Protected video download tokens
- AI security events
- Sentry error monitoring
- Structured logging
- Cloudflare Turnstile integration
- IP and geolocation intelligence

Secrets and credentials are supplied through environment configuration and must never be committed to the repository.

## Storage

The backend integrates with S3-compatible object storage and Cloudflare R2 for media and generated assets.

Stored assets can include:

- Profile photos
- Cover photos
- Post media
- Message media
- Encrypted media
- Event covers
- AI-generated images
- AI-generated videos
- Movie outputs

## Development

### Requirements

- Node.js
- pnpm
- PostgreSQL
- Redis-compatible runtime where required
- Environment configuration for the integrations used by the selected features

### Install

```bash
pnpm install --frozen-lockfile
```

### Typecheck

```bash
pnpm run typecheck
```

### Build everything

```bash
pnpm run build
```

### Build the backend

```bash
cd artifacts/redom-backend
pnpm run build
```

### Start the built backend

```bash
cd artifacts/redom-backend
pnpm run start
```

The backend package also exposes a development script that builds and starts the service with `NODE_ENV=development`.

## Environment

The backend reads runtime configuration from environment variables.

Typical configuration categories include:

- PostgreSQL database connection
- Redis connection
- JWT/authentication configuration
- Object storage and Cloudflare R2
- AI service configuration
- Search service configuration
- Email delivery
- SMS/phone verification
- Map/geolocation services
- Sentry
- Cloudflare Turnstile
- Video engine configuration

Do not commit production secrets, API keys, access tokens, private keys, database URLs, or provider credentials.

## Database migrations

Drizzle Kit is configured for PostgreSQL with schema files under:

```text
artifacts/redom-backend/src/database/*.ts
```

Migration output is stored under the backend's Drizzle directory.

## API design

The API follows a REST-oriented route structure with JSON responses.

Successful responses generally use a structure such as:

```json
{
  "success": true
}
```

Domain-specific responses add the relevant resource, collection, identifier, or status fields.

Validation and authentication failures return appropriate HTTP status codes with structured error messages.

## Clients

The backend is designed to serve ReDom clients, including the ReDom web and mobile applications.

Client applications should treat the backend as the authority for:

- Authentication
- Session validity
- Device recognition
- Account security
- Privacy
- Relationships
- Messaging state
- Payment state
- AI quotas
- Media access
- Moderation and safety decisions

## Production principles

ReDom Backend is designed around several principles:

1. Keep security-sensitive decisions on the server.
2. Validate external input at API boundaries.
3. Keep persistent state in PostgreSQL.
4. Separate domain logic into services and route modules.
5. Keep media out of relational rows when object storage is appropriate.
6. Track asynchronous AI and media jobs explicitly.
7. Preserve audit and lifecycle metadata where it matters.
8. Apply privacy rules before returning profile information.
9. Use rate limits on expensive or abuse-sensitive operations.
10. Keep client applications thin around authentication, security, and payment decisions.

## Status

This repository is actively developed. APIs, database schemas, infrastructure integrations, and product capabilities can change as ReDom evolves.

The README describes the implementation currently represented by the repository and intentionally avoids presenting unreleased product concepts as completed backend functionality.

## License

The repository currently declares the MIT license at the workspace level.
