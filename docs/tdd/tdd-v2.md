# Technical Design Document: WhatsApp AI Platform

**Version:** 2.0
**Status:** Draft — Pending Review
**Previous Version:** [TDD v1](file:///Users/nikitasingh/Downloads/whatsapp-ai-platform-tdd.md)
**Aligned With:** [PRD v2](file:///Users/nikitasingh/Desktop/WhatsAI/docs/prd/prd-v2.md)
**Prepared for:** AI-assisted development

---

## 1. System Overview

The system is a multi-tenant SaaS platform that allows organizations to connect their own WhatsApp Business accounts, configure AI agents, upload knowledge, and let AI respond to WhatsApp customers on their behalf.

The core technical challenge is tenant-safe routing:

1. Receive webhook event from Meta.
2. Verify HMAC-SHA256 signature authenticity.
3. Extract WhatsApp Phone Number ID.
4. Resolve the owning organization.
5. Validate subscription status, plan limits, and 24-hour messaging window.
6. Load that organization's agent, memory, knowledge, tools, and WhatsApp credentials.
7. Generate a response within latency budget (P50 <4s, P95 <8s).
8. Validate response against safety and business rules.
9. Send reply through the correct WhatsApp number using the organization's encrypted access token.
10. Store conversation, messages, usage, costs, logs, memory, and delivery status.

---

## 2. Recommended Technology Stack

### Frontend
- Next.js
- TypeScript
- Tailwind CSS
- React Query or TanStack Query
- Shadcn/UI or equivalent component system
- WebSocket client for real-time inbox updates

### Backend
- Node.js
- TypeScript
- NestJS recommended for modular service architecture
- Express is acceptable if kept modular

### Authentication
- Auth.js (NextAuth) for email/password and Google OAuth
- Custom TOTP-based MFA module (using `otplib`)
- Secure session management with HttpOnly, SameSite cookies
- Clerk is acceptable as an alternative, provided it supports TOTP MFA and the permission model defined in PRD v2

### Database
- PostgreSQL
- Prisma ORM
- pgvector for embeddings
- Full-text search via PostgreSQL `tsvector` / `ts_query` for conversation search

### Queue And Cache
- Redis (persistent mode for queues)
- BullMQ for background jobs

### AI
- Google Gemini API (primary LLM provider)
- Provider-agnostic abstraction layer supporting swap to OpenAI, Anthropic, or compatible providers via configuration
- Gemini embedding model for knowledge search (versioned, e.g., `text-embedding-004`)
- Each organization uses the platform's LLM API key in MVP

### Billing
- Stripe Checkout
- Stripe Customer Portal
- Stripe webhooks (5 event types)

### Email
- Resend, SendGrid, or AWS SES for transactional emails (invitations, notifications, password reset, alerts)

### Monitoring
- Sentry for error tracking
- Structured JSON logs
- Health endpoints (API, DB, Redis, Queue)
- Optional: OpenTelemetry for distributed tracing

### Deployment
- Railway, Render, Fly.io, or Google Cloud Run for MVP
- PostgreSQL managed database with automated daily backups
- Redis managed instance with persistence enabled
- Separate web, worker, and scheduler processes

---

## 3. Repository Structure

Recommended monorepo:

```text
whatsapp-ai-platform/
  apps/
    web/
      src/
        app/
        components/
        features/
        lib/
        hooks/
        styles/
    api/
      src/
        main.ts
        modules/
        common/
        config/
        jobs/
        websocket/
  packages/
    database/
      prisma/
      src/
    shared/
      src/
        types/
        constants/
        validators/
    ai/
      src/
        providers/
        prompts/
        agents/
        tools/
        validation/
        cost/
    integrations/
      src/
        whatsapp/
        stripe/
        email/
        google/
    notifications/
      src/
        channels/
        templates/
  infra/
    docker/
    railway/
    scripts/
  docs/
    prd/
    tdd/
  tests/
    e2e/
    integration/
```

If using a simpler structure:

```text
src/
  modules/
    auth/
    organizations/
    whatsapp/
    conversations/
    agents/
    knowledge/
    memory/
    billing/
    integrations/
    monitoring/
    notifications/
    admin/
    analytics/
    cost-control/
    websocket/
```

---

## 4. Service Modules

### Auth Service
Responsibilities:
- User signup with email/password or Google OAuth.
- Email verification (required before org creation or dashboard access).
- Session management using HttpOnly, SameSite cookies with 24-hour sliding window expiry.
- Password reset via email link.
- MFA/TOTP enrollment and verification (required for Owners, recommended for all).
- Brute-force protection: lock account after 5 failed attempts for 15 minutes; after 10 failed attempts, lock until email-based unlock.
- CAPTCHA integration: display CAPTCHA on signup and login forms after 3 failed attempts.
- Organization membership lookup.
- Role-based permission checks (RBAC).

Recommended implementation:
- Auth.js (NextAuth) for OAuth and credential providers.
- Custom TOTP module using `otplib` for MFA.
- Store MFA secrets encrypted in `user_mfa_methods` table.
- Backend must never trust frontend role claims without database verification.

### Organization Service
Responsibilities:
- Create organizations (name, timezone required; logo, industry, default_language optional).
- Enforce max 3 organizations per user account across all plans.
- Enforce 1 free-tier organization per email domain (anti-abuse).
- Manage members and roles (owner, admin, operator, readonly).
- Team invitation flow: generate unique link, send email, 7-day expiry, auto-apply on signup.
- Ownership transfer: require acceptance via email, demote original owner to admin, transfer billing.
- Organization deletion: 30-day grace period with suspension, then permanent data purge.
- Store organization settings (industry, timezone, default_language, memory_enabled).
- Enforce tenant isolation on all queries.
- Track onboarding progress (checklist completion state).

### WhatsApp Service
Responsibilities:
- Store WhatsApp Business credentials (encrypted at rest with AES-256-GCM).
- Support Embedded Signup (primary) and manual setup (fallback) connection flows.
- Enforce Phone Number ID global uniqueness across the platform.
- Send outbound WhatsApp messages (text, and future: interactive).
- Verify incoming webhook HMAC-SHA256 signatures.
- Parse webhook payloads (messages, status updates).
- Resolve organization from Phone Number ID.
- Track webhook events and delivery status (sent, delivered, read, failed).
- Track token expiry: warn at 7 days, urgent at 1 day, pause AI on expiry.
- Handle disconnection: stop AI, preserve conversations read-only, delete encrypted token, release phone number.
- Setup diagnostics: webhook URL reachability, last event timestamp, signature status, token validity, phone registration status.
- Enforce 24-hour messaging window on all outbound messages.
- Track outbound message rate per phone number per day (Meta rate limit awareness).

### Message Template Service
Responsibilities:
- CRUD operations for WhatsApp message templates.
- Submit templates to Meta for approval via Graph API.
- Track template approval status (pending, approved, rejected with reason).
- Support template variables (e.g., `{{1}}` for customer name).
- Send template messages to re-open conversations after 24-hour window expiry.
- Track template messages separately for billing (Meta charges per template).

### Conversation Service
Responsibilities:
- Create and update conversations.
- Store inbound and outbound messages (all types: text, image, document, audio, video, location, contact, sticker, reaction).
- Track conversation lifecycle: New → AI Active → Needs Human → Human Active → Resolved → Reopened.
- Track 24-hour messaging window per conversation (`last_customer_message_at`).
- Support human takeover with AI pause.
- Assign conversations to team members.
- Store internal notes (visible to team only, not sent to customer).
- Provide full-text search across messages (PostgreSQL tsvector).
- Paginate conversations (25 per page, sorted by last_message_at).
- Broadcast real-time updates via WebSocket.
- Handle concurrent access: track viewing operators per conversation.
- Process delivery status callbacks (sent/delivered/read/failed).
- Retry failed outbound messages (up to 3 attempts, exponential backoff: 1s, 4s, 16s).

### Agent Service
Responsibilities:
- CRUD, duplicate, archive, and restore agents.
- Store agent configuration: name, type, description, tone, language, system prompt, business rules (jsonb), escalation config (jsonb), allowed tools, strict knowledge mode, fallback message, working hours, outside-hours mode (auto-reply/queue/always-on).
- Assign agent to WhatsApp number (1:1 in MVP, N:1 in multi-agent mode v0.4).
- Manage prompt version history (max 50 per agent, diff view, rollback creates new version).
- Execute agent pipeline.
- Log agent runs (model, tokens, cost, metadata).
- Provide agent test/simulator endpoint (not stored as real conversations, not billed).
- Validate business rules for contradictions.
- On archive: reassign active conversations to default agent.

### Knowledge Service
Responsibilities:
- Upload documents (PDF, DOCX, TXT, MD, CSV).
- Validate file type, size (max 25 MB per document), and organization storage quota.
- Manual FAQ entries (question + answer pairs).
- Extract text from documents.
- Chunk text (500-1,000 tokens, preserve headings/metadata).
- CSV handling: each row as separate chunk, column headers as metadata.
- FAQ handling: each Q&A pair as single chunk.
- Generate embeddings (versioned model, e.g., `text-embedding-004`).
- Record embedding model version per chunk.
- Store chunks in pgvector with organization_id filtering.
- Retrieve relevant context for a message (top-K similarity search, <500ms for up to 1K chunks).
- Support per-agent knowledge source selection.
- Document versioning: detect same filename, replace old chunks with new.
- Track document staleness: show "Review recommended" badge after 90 days.
- Source traceability: record which documents/chunks were used in each agent run.
- Re-index all documents action (for embedding model changes).

### Memory Service
Responsibilities:
- Store short-term conversation summaries (auto-update every 10 messages).
- Store long-term contact facts (max 50 per contact, importance score 1-5).
- Enforce memory write rules: store useful facts (name, preferences, past issues); never store payment cards, gov IDs, passwords, health diagnoses (unless healthcare with consent).
- Evict oldest/lowest-importance facts when limit reached.
- Retrieve relevant memory by contact ID, conversation ID, semantic similarity, recency, importance.
- Handle memory conflicts: current conversation takes precedence, update conflicting facts.
- Apply privacy and deletion rules.
- Support bulk memory deletion (per contact, per organization).
- Support GDPR DSAR export (JSON/CSV per contact: messages, memory facts, conversation summaries).
- Admin memory review: view, edit, delete individual facts per contact.

### Billing Service
Responsibilities:
- Create Stripe Checkout sessions (monthly and annual billing).
- Receive and process Stripe webhooks (5 event types — see Section 7).
- Sync subscription status.
- Define and enforce plan limits:
  - Free: 1 org, 1 number, 1 agent, 50 messages/mo, 5 MB KB, 100 conversations retained.
  - Starter ($29/mo, $24/mo annual): 1 number, 3 agents, 1K messages/mo, 50 MB KB, $5/day AI cap.
  - Growth ($79/mo, $63/mo annual): 2 numbers, 10 agents, 5K messages/mo, 5 seats, 200 MB KB, $20/day AI cap.
  - Agency ($199/mo, $159/mo annual): 5 orgs, 5 numbers, 25 agents, 20K messages/mo, 15 seats, 1 GB KB, $50/day AI cap.
  - Enterprise: custom.
- Track billable messages (each outbound message via WA API — AI, human, or template).
- Track AI token usage (system prompt + history + KB context + memory + completion tokens).
- Enforce overage rules (hard caps per limit type — see Section 17).
- Handle plan downgrades: keep excess resources until period end, deactivate at renewal with owner notification.
- Handle failed payments: 7-day grace period → read-only → 30-day suspension → 90-day data deletion.
- Anti-abuse: 1 free org per email domain, phone verification for free tier, max 3 orgs per user.
- Annual billing at 20% discount.

### Notification Service
Responsibilities:
- Deliver notifications across channels: in-app (WebSocket) and email.
- Support 7 notification types:
  1. Human escalation (to operators/admins).
  2. WhatsApp connection failure / token expiry (to owner).
  3. Billing payment failure (to owner).
  4. Document processing failure (to uploading user).
  5. WhatsApp quality rating drop to Yellow/Red (to owner).
  6. Plan limit approaching 80% (to owner).
  7. Daily AI cost cap reached (to owner).
- Respect per-user notification preferences (in-app only, in-app + email, disabled).
- Enforce non-disableable critical notifications for non-owners (token expiry, billing failure, quality drop).
- SLA follow-up: re-notify on unacknowledged escalations (15 min, then 1 hour with customer auto-reply).

### Integration Service
Responsibilities:
- Store third-party integration credentials (encrypted at rest with AES-256-GCM).
- Execute tool calls on behalf of agents.
- Enforce per-agent tool permissions.
- Support approval mode for sensitive tools: pause execution, notify operator, wait for approve/reject.
- Log all tool executions (tool name, input, output, status, duration).
- Monitor integration health: mark as "unhealthy" after repeated failures, show dashboard warning.

### Cost Control Service
Responsibilities:
- Track token usage per message, per conversation, per agent, per organization, per billing period.
- Enforce per-organization daily AI cost cap (configurable per plan).
- Enforce per-message token budget (max 8,000 tokens per AI request).
- Truncate oldest messages and lowest-relevance knowledge chunks when context exceeds budget.
- Pause AI replies when daily cap is reached; notify owner; human replies continue.
- Provide cost analytics data for dashboard.

### Analytics Service
Responsibilities:
- Aggregate and serve analytics data:
  - Total conversations by period.
  - AI resolution rate (conversations resolved without human takeover).
  - Human takeover rate and average human response time.
  - Average AI response time (P50, P95).
  - Message volume (inbound + outbound, by day/week/month).
  - Top intents (most common customer topics).
  - Knowledge gaps (low-confidence or no-match queries, grouped by topic).
  - Failed webhook events and retry outcomes.
  - Token usage and estimated AI cost (by day/week/month, by agent).
  - WhatsApp quality rating history.
  - 24-hour window expiry rate.

### Admin Service (Super Admin)
Responsibilities:
- List all organizations with: name, plan, status, member count, message volume, last active date.
- Organization detail view: members, WhatsApp accounts, agents, subscription, usage, audit logs.
- Global metrics: total orgs, total messages, total AI cost, error rate, webhook failure rate, queue depths.
- Feature flag management: enable/disable features per organization or globally.
- Impersonation: view an organization's dashboard as their admin (with full audit trail).
- Suspension/deletion: suspend or delete organizations with reason logging.
- System health: queue depths, worker status, error rates.

### Monitoring Service
Responsibilities:
- Structured JSON logs with correlation IDs.
- Error reporting to Sentry.
- Health checks (API, DB, Redis, Queue).
- Admin diagnostics.
- Status page integration (Statuspage.io or Instatus).

---

## 5. Database Schema

All tenant-owned tables must include `organization_id`.
All tables use `uuid` primary keys and `timestamptz` for timestamps.

### users
```sql
id uuid primary key
email text unique not null
name text
avatar_url text
auth_provider text not null -- 'email', 'google'
external_auth_id text
email_verified_at timestamptz
phone_number text
phone_verified_at timestamptz
is_platform_admin boolean default false
login_attempts integer default 0
locked_until timestamptz
created_at timestamptz not null
updated_at timestamptz not null
```

### user_mfa_methods
```sql
id uuid primary key
user_id uuid references users(id)
method text not null default 'totp' -- 'totp'
secret_encrypted text not null -- AES-256-GCM encrypted TOTP secret
is_enabled boolean default false
verified_at timestamptz
created_at timestamptz not null
updated_at timestamptz not null
unique (user_id, method)
```

### organizations
```sql
id uuid primary key
name text not null
slug text unique
logo_url text
industry text
timezone text default 'UTC'
default_language text default 'en'
memory_enabled boolean default true
status text not null default 'active' -- active, suspended, pending_deletion
deletion_scheduled_at timestamptz
created_at timestamptz not null
updated_at timestamptz not null
```

### organization_members
```sql
id uuid primary key
organization_id uuid references organizations(id)
user_id uuid references users(id)
role text not null -- owner, admin, operator, readonly
billing_access boolean default false -- grantable billing for admins
status text not null default 'active'
created_at timestamptz not null
updated_at timestamptz not null
unique (organization_id, user_id)
```

Roles:
- owner
- admin
- operator
- readonly

### invitations
```sql
id uuid primary key
organization_id uuid references organizations(id)
invited_by_user_id uuid references users(id)
email text not null
role text not null
token text unique not null
status text not null default 'pending' -- pending, accepted, expired, cancelled
expires_at timestamptz not null -- 7 days from creation
created_at timestamptz not null
updated_at timestamptz not null
```

### onboarding_progress
```sql
id uuid primary key
organization_id uuid references organizations(id) unique
whatsapp_connected boolean default false
agent_created boolean default false
knowledge_uploaded boolean default false
first_ai_reply boolean default false
billing_configured boolean default false
completed_at timestamptz
created_at timestamptz not null
updated_at timestamptz not null
```

### whatsapp_accounts
```sql
id uuid primary key
organization_id uuid references organizations(id)
meta_business_account_id text
whatsapp_business_account_id text
phone_number_id text unique not null
display_phone_number text
verified_name text
access_token_encrypted text not null -- AES-256-GCM
token_expires_at timestamptz
quality_rating text default 'unknown' -- green, yellow, red, unknown
quality_rating_updated_at timestamptz
messaging_tier text default 'TIER_250' -- TIER_250, TIER_1K, TIER_10K, TIER_100K
daily_outbound_count integer default 0
daily_outbound_reset_at timestamptz
webhook_status text default 'unknown' -- active, failing, not_configured
last_webhook_event_at timestamptz
registration_status text default 'unknown' -- connected, pending_verification, disconnected, error
setup_method text -- 'embedded_signup', 'manual'
is_active boolean default true
created_at timestamptz not null
updated_at timestamptz not null
```

### agents
```sql
id uuid primary key
organization_id uuid references organizations(id)
name text not null
type text not null -- support, sales, booking, billing, faq, custom
description text
system_prompt text not null
tone text -- professional, friendly, casual, custom
language text
business_rules jsonb default '[]' -- array of rule objects
escalation_config jsonb not null default '{
  "sentiment_threshold": -0.5,
  "human_request_detection": true,
  "max_unresolved_turns": 10,
  "escalation_keywords": [],
  "confidence_threshold": 0.4
}'
strict_knowledge_mode boolean default false
fallback_message text default 'I don''t have enough information to answer that question. Let me connect you with a team member.'
human_escalation_enabled boolean default true
working_hours jsonb -- {mon: {start: "09:00", end: "18:00"}, ...}
outside_hours_mode text default 'auto_reply' -- auto_reply, queue, always_on
outside_hours_message text default 'Thanks for reaching out! Our team is available during business hours. We''ll respond as soon as we''re back.'
ai_disclosure_enabled boolean default true
ai_disclosure_message text default 'Hi! I''m an AI assistant for {{business_name}}. How can I help you today?'
allowed_tools jsonb default '["search_knowledge_base", "create_human_handoff", "get_business_hours", "send_internal_notification"]'
status text not null default 'draft' -- draft, active, archived
created_at timestamptz not null
updated_at timestamptz not null
```

Agent types:
- support
- sales
- booking
- billing
- faq
- custom

### agent_versions
```sql
id uuid primary key
agent_id uuid references agents(id)
version_number integer not null
system_prompt text not null
business_rules jsonb
escalation_config jsonb
config jsonb not null -- full snapshot of agent config at this version
created_by_user_id uuid references users(id)
created_at timestamptz not null

-- Max 50 versions per agent enforced at application level
-- Oldest versions beyond 50 are pruned
```

### whatsapp_account_agents
```sql
id uuid primary key
organization_id uuid references organizations(id)
whatsapp_account_id uuid references whatsapp_accounts(id)
agent_id uuid references agents(id)
is_default boolean default true
created_at timestamptz not null
unique (whatsapp_account_id, agent_id)
```

### contacts
```sql
id uuid primary key
organization_id uuid references organizations(id)
wa_id text not null
phone_number text
name text
metadata jsonb
created_at timestamptz not null
updated_at timestamptz not null
unique (organization_id, wa_id)
```

### conversations
```sql
id uuid primary key
organization_id uuid references organizations(id)
whatsapp_account_id uuid references whatsapp_accounts(id)
contact_id uuid references contacts(id)
assigned_user_id uuid references users(id)
current_agent_id uuid references agents(id)
status text not null default 'new' -- new, ai_active, needs_human, human_active, resolved
last_message_at timestamptz
last_customer_message_at timestamptz -- for 24-hour window tracking
window_expires_at timestamptz -- computed: last_customer_message_at + 24 hours
short_term_memory jsonb -- conversation summary, current intent, open tasks
search_vector tsvector -- for full-text search
created_at timestamptz not null
updated_at timestamptz not null
```

Statuses:
- new
- ai_active
- needs_human
- human_active
- resolved

Lifecycle:
```
[new] → [ai_active] → [resolved]
                ↓
         [needs_human] → [human_active] → [resolved]
                                              ↓
                                      (Customer messages again)
                                              ↓
                                         [ai_active]
```

### messages
```sql
id uuid primary key
organization_id uuid references organizations(id)
conversation_id uuid references conversations(id)
direction text not null -- inbound, outbound
sender_type text not null -- customer, ai, human, system
whatsapp_message_id text unique
message_type text not null -- text, image, document, audio, video, location, contact, sticker, reaction, template
text_body text
media_url text
media_mime_type text
media_caption text
location_latitude decimal
location_longitude decimal
template_name text
template_variables jsonb
raw_payload jsonb
delivery_status text default 'pending' -- pending, sent, delivered, read, failed
delivery_failure_reason text
retry_count integer default 0
agent_run_id uuid references agent_runs(id)
search_vector tsvector -- for full-text search
created_at timestamptz not null
```

Directions:
- inbound
- outbound

Sender types:
- customer
- ai
- human
- system

Message types:
- text
- image
- document
- audio
- video
- location
- contact
- sticker
- reaction
- template

### internal_notes
```sql
id uuid primary key
organization_id uuid references organizations(id)
conversation_id uuid references conversations(id)
user_id uuid references users(id)
content text not null
created_at timestamptz not null
updated_at timestamptz not null
```

### webhook_events
```sql
id uuid primary key
provider text not null -- meta, stripe
event_id text unique
event_type text -- messages, statuses, etc.
organization_id uuid references organizations(id)
whatsapp_account_id uuid references whatsapp_accounts(id)
payload jsonb not null
status text not null default 'received' -- received, processing, processed, failed
error_message text
retry_count integer default 0
created_at timestamptz not null
processed_at timestamptz
```

### knowledge_bases
```sql
id uuid primary key
organization_id uuid references organizations(id)
name text not null
description text
status text default 'active'
created_at timestamptz not null
updated_at timestamptz not null
```

### knowledge_documents
```sql
id uuid primary key
organization_id uuid references organizations(id)
knowledge_base_id uuid references knowledge_bases(id)
title text not null
source_type text not null -- upload, faq, url (future)
source_url text
file_url text
file_name text
file_size_bytes integer
mime_type text
processing_status text default 'pending' -- pending, processing, ready, failed
error_message text
embedding_model_version text -- e.g., 'text-embedding-004'
last_updated_content_at timestamptz
staleness_warning boolean default false -- set true if not updated in 90 days
created_at timestamptz not null
updated_at timestamptz not null
```

### knowledge_chunks
```sql
id uuid primary key
organization_id uuid references organizations(id)
knowledge_document_id uuid references knowledge_documents(id)
chunk_index integer not null
content text not null
embedding vector -- dimension depends on model
embedding_model_version text
section_title text -- preserved heading/metadata
metadata jsonb -- column headers for CSV, page number for PDF, etc.
created_at timestamptz not null
```

Index: `CREATE INDEX ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WHERE organization_id = ...`

For scale beyond 100K total chunks, evaluate per-organization partitioning or filtered ANN search.

### memories
```sql
id uuid primary key
organization_id uuid references organizations(id)
contact_id uuid references contacts(id)
conversation_id uuid references conversations(id) -- null for long-term facts
type text not null -- conversation_summary, customer_fact, preference, business_context
content text not null
importance integer default 1 -- 1-5, assigned by AI
embedding vector
created_at timestamptz not null
updated_at timestamptz not null
```

Memory types:
- conversation_summary
- customer_fact
- preference
- business_context

Memory limits:
- Max 50 long-term facts per contact per organization.
- When limit reached, evict oldest facts with lowest importance score.

### agent_runs
```sql
id uuid primary key
organization_id uuid references organizations(id)
agent_id uuid references agents(id)
conversation_id uuid references conversations(id)
input_message_id uuid references messages(id)
output_message_id uuid references messages(id)
status text not null -- pending, running, completed, failed, timeout
model text
prompt_tokens integer
completion_tokens integer
total_tokens integer
cost_cents integer
latency_ms integer
intent_classified text
sentiment text -- positive, neutral, negative
confidence_score decimal
escalation_triggered boolean default false
escalation_reason text
knowledge_chunks_used jsonb -- [{document_id, chunk_id, document_title, section_title}]
memory_facts_used jsonb -- [{memory_id, content}]
tools_called jsonb -- [{tool_name, status}]
validation_result text -- passed, failed_pii, failed_business_rule, failed_safety
validation_failure_reason text
metadata jsonb
error_message text
is_test boolean default false -- true for simulator runs
created_at timestamptz not null
completed_at timestamptz
```

### tool_executions
```sql
id uuid primary key
organization_id uuid references organizations(id)
agent_run_id uuid references agent_runs(id)
tool_name text not null
input jsonb
output jsonb
status text not null -- pending_approval, approved, rejected, running, completed, failed
requires_approval boolean default false
approved_by_user_id uuid references users(id)
approved_at timestamptz
error_message text
duration_ms integer
created_at timestamptz not null
completed_at timestamptz
```

### integrations
```sql
id uuid primary key
organization_id uuid references organizations(id)
provider text not null -- google_calendar, google_sheets, shopify, hubspot, slack
status text not null default 'connected' -- connected, disconnected, unhealthy, error
health_check_failures integer default 0
credentials_encrypted text -- AES-256-GCM
config jsonb
created_at timestamptz not null
updated_at timestamptz not null
unique (organization_id, provider)
```

### subscriptions
```sql
id uuid primary key
organization_id uuid references organizations(id) unique
stripe_customer_id text
stripe_subscription_id text
plan text not null -- free, starter, growth, agency, enterprise
billing_interval text default 'monthly' -- monthly, annual
status text not null -- active, past_due, grace_period, suspended, cancelled
grace_period_ends_at timestamptz
suspension_date timestamptz
data_deletion_scheduled_at timestamptz -- 90 days after suspension
current_period_start timestamptz
current_period_end timestamptz
created_at timestamptz not null
updated_at timestamptz not null
```

### usage_records
```sql
id uuid primary key
organization_id uuid references organizations(id)
metric text not null -- billable_messages, ai_tokens, kb_storage_bytes, active_agents, team_seats
quantity integer not null
period_start date not null
period_end date not null
metadata jsonb -- {agent_id, message_type, token_breakdown}
created_at timestamptz not null
```

### daily_cost_tracking
```sql
id uuid primary key
organization_id uuid references organizations(id)
date date not null
total_tokens integer default 0
estimated_cost_cents integer default 0
cost_cap_cents integer not null -- from plan config
cap_reached boolean default false
cap_reached_at timestamptz
created_at timestamptz not null
updated_at timestamptz not null
unique (organization_id, date)
```

### message_templates
```sql
id uuid primary key
organization_id uuid references organizations(id)
whatsapp_account_id uuid references whatsapp_accounts(id)
name text not null
language text not null
category text not null -- marketing, utility, authentication
components jsonb not null -- header, body, footer, buttons with variables
meta_template_id text -- assigned by Meta after submission
status text not null default 'draft' -- draft, pending_approval, approved, rejected
rejection_reason text
created_at timestamptz not null
updated_at timestamptz not null
```

### notification_preferences
```sql
id uuid primary key
user_id uuid references users(id)
organization_id uuid references organizations(id)
notification_type text not null -- escalation, whatsapp_failure, billing_failure, document_failure, quality_drop, limit_warning, cost_cap
channel text not null default 'in_app_and_email' -- in_app_only, in_app_and_email, disabled
created_at timestamptz not null
updated_at timestamptz not null
unique (user_id, organization_id, notification_type)
```

Critical notification types (escalation, whatsapp_failure, billing_failure, quality_drop) cannot be set to `disabled` by non-owner members. Enforced at application level.

### feature_flags
```sql
id uuid primary key
name text unique not null
description text
is_enabled_globally boolean default false
enabled_for_organizations jsonb default '[]' -- array of organization UUIDs
created_at timestamptz not null
updated_at timestamptz not null
```

### quality_rating_history
```sql
id uuid primary key
whatsapp_account_id uuid references whatsapp_accounts(id)
organization_id uuid references organizations(id)
rating text not null -- green, yellow, red
recorded_at timestamptz not null
```

### audit_logs
```sql
id uuid primary key
organization_id uuid references organizations(id)
actor_user_id uuid references users(id)
actor_type text not null default 'user' -- user, system, super_admin
action text not null
resource_type text
resource_id text
metadata jsonb
ip_address text
impersonation_session_id text -- set when super admin is impersonating
created_at timestamptz not null
```

Auditable actions:
- Token changes (WhatsApp connect/disconnect/refresh)
- Billing changes (plan change, payment method update)
- Role changes (invite, role update, remove member)
- Data deletion (org deletion, conversation deletion, memory deletion)
- Agent changes (create, update, archive, restore, activate)
- Impersonation sessions (start, end)
- Security events (MFA enable/disable, password reset, account lockout)

---

## 6. API Design

All dashboard APIs require authentication. All organization-scoped APIs require organization membership verification.

### Auth And User
```http
POST /api/auth/signup                    -- email/password signup
POST /api/auth/login                     -- email/password login
POST /api/auth/login/google              -- Google OAuth callback
POST /api/auth/logout
POST /api/auth/verify-email              -- verify email token
POST /api/auth/forgot-password           -- send reset email
POST /api/auth/reset-password            -- reset with token
POST /api/auth/mfa/enroll               -- begin TOTP enrollment (returns QR code)
POST /api/auth/mfa/verify               -- verify TOTP code and activate
POST /api/auth/mfa/disable              -- disable MFA (requires current TOTP code)
POST /api/auth/mfa/challenge            -- verify TOTP during login
GET  /api/me                             -- current user profile
PATCH /api/me                            -- update profile
GET  /api/me/organizations               -- list user's organizations
```

### Organizations
```http
POST   /api/organizations
GET    /api/organizations/:organizationId
PATCH  /api/organizations/:organizationId
DELETE /api/organizations/:organizationId              -- initiate 30-day deletion
POST   /api/organizations/:organizationId/cancel-deletion
GET    /api/organizations/:organizationId/members
POST   /api/organizations/:organizationId/invitations
GET    /api/organizations/:organizationId/invitations  -- list pending invitations
DELETE /api/organizations/:organizationId/invitations/:invitationId  -- cancel invitation
POST   /api/organizations/:organizationId/invitations/:token/accept
PATCH  /api/organizations/:organizationId/members/:memberId  -- change role, toggle billing access
DELETE /api/organizations/:organizationId/members/:memberId
POST   /api/organizations/:organizationId/transfer-ownership
GET    /api/organizations/:organizationId/onboarding   -- onboarding checklist state
```

### WhatsApp Accounts
```http
GET    /api/organizations/:organizationId/whatsapp-accounts
POST   /api/organizations/:organizationId/whatsapp-accounts                    -- connect (embedded or manual)
PATCH  /api/organizations/:organizationId/whatsapp-accounts/:accountId
DELETE /api/organizations/:organizationId/whatsapp-accounts/:accountId         -- disconnect
POST   /api/organizations/:organizationId/whatsapp-accounts/:accountId/test-message
GET    /api/organizations/:organizationId/whatsapp-accounts/:accountId/diagnostics
POST   /api/organizations/:organizationId/whatsapp-accounts/:accountId/refresh-token
```

### Message Templates
```http
GET    /api/organizations/:organizationId/whatsapp-accounts/:accountId/templates
POST   /api/organizations/:organizationId/whatsapp-accounts/:accountId/templates
PATCH  /api/organizations/:organizationId/whatsapp-accounts/:accountId/templates/:templateId
DELETE /api/organizations/:organizationId/whatsapp-accounts/:accountId/templates/:templateId
POST   /api/organizations/:organizationId/whatsapp-accounts/:accountId/templates/:templateId/submit  -- submit to Meta
POST   /api/organizations/:organizationId/whatsapp-accounts/:accountId/templates/:templateId/send    -- send to contact
```

### Webhooks
```http
GET  /webhooks/meta/whatsapp              -- Meta verification (hub.mode, hub.verify_token, hub.challenge)
POST /webhooks/meta/whatsapp              -- incoming messages and status updates
POST /webhooks/stripe                     -- Stripe events
```

### Agents
```http
GET    /api/organizations/:organizationId/agents
POST   /api/organizations/:organizationId/agents
GET    /api/organizations/:organizationId/agents/:agentId
PATCH  /api/organizations/:organizationId/agents/:agentId
POST   /api/organizations/:organizationId/agents/:agentId/duplicate
POST   /api/organizations/:organizationId/agents/:agentId/test      -- simulator
POST   /api/organizations/:organizationId/agents/:agentId/activate
POST   /api/organizations/:organizationId/agents/:agentId/archive
POST   /api/organizations/:organizationId/agents/:agentId/restore
GET    /api/organizations/:organizationId/agents/:agentId/versions
GET    /api/organizations/:organizationId/agents/:agentId/versions/:versionId/diff  -- diff against previous
POST   /api/organizations/:organizationId/agents/:agentId/rollback  -- body: {version_number}
```

### Conversations
```http
GET    /api/organizations/:organizationId/conversations                               -- paginated, filterable, searchable
GET    /api/organizations/:organizationId/conversations/:conversationId
GET    /api/organizations/:organizationId/conversations/:conversationId/messages       -- paginated message history
POST   /api/organizations/:organizationId/conversations/:conversationId/messages       -- manual reply (checks 24h window)
POST   /api/organizations/:organizationId/conversations/:conversationId/pause-ai
POST   /api/organizations/:organizationId/conversations/:conversationId/resume-ai
POST   /api/organizations/:organizationId/conversations/:conversationId/resolve
PATCH  /api/organizations/:organizationId/conversations/:conversationId/assign        -- assign to team member
POST   /api/organizations/:organizationId/conversations/:conversationId/reassign-agent -- override router (v0.4)
GET    /api/organizations/:organizationId/conversations/:conversationId/notes          -- internal notes
POST   /api/organizations/:organizationId/conversations/:conversationId/notes
DELETE /api/organizations/:organizationId/conversations/:conversationId/notes/:noteId
```

### Knowledge Base
```http
GET    /api/organizations/:organizationId/knowledge-bases
POST   /api/organizations/:organizationId/knowledge-bases
PATCH  /api/organizations/:organizationId/knowledge-bases/:kbId
DELETE /api/organizations/:organizationId/knowledge-bases/:kbId
GET    /api/organizations/:organizationId/knowledge-bases/:kbId/documents
POST   /api/organizations/:organizationId/knowledge-bases/:kbId/documents              -- upload file or create FAQ
PATCH  /api/organizations/:organizationId/knowledge-bases/:kbId/documents/:documentId  -- replace content
DELETE /api/organizations/:organizationId/knowledge-bases/:kbId/documents/:documentId
POST   /api/organizations/:organizationId/knowledge-bases/:kbId/search                 -- test search query
POST   /api/organizations/:organizationId/knowledge-bases/:kbId/reindex                -- re-embed all documents
```

### Memory
```http
GET    /api/organizations/:organizationId/contacts/:contactId/memories                -- view contact memories
PATCH  /api/organizations/:organizationId/contacts/:contactId/memories/:memoryId      -- edit fact
DELETE /api/organizations/:organizationId/contacts/:contactId/memories/:memoryId      -- delete fact
DELETE /api/organizations/:organizationId/contacts/:contactId/memories                -- bulk delete per contact
DELETE /api/organizations/:organizationId/memories                                     -- bulk delete all org memories
POST   /api/organizations/:organizationId/contacts/:contactId/export                  -- GDPR DSAR export (JSON/CSV)
```

### Billing
```http
GET  /api/organizations/:organizationId/billing/subscription
POST /api/organizations/:organizationId/billing/checkout       -- create Stripe Checkout session
POST /api/organizations/:organizationId/billing/portal         -- create Stripe Customer Portal session
GET  /api/organizations/:organizationId/billing/usage          -- current period usage summary
GET  /api/organizations/:organizationId/billing/cost           -- AI cost breakdown
```

### Analytics
```http
GET /api/organizations/:organizationId/analytics/overview          -- key metrics
GET /api/organizations/:organizationId/analytics/conversations     -- conversation analytics
GET /api/organizations/:organizationId/analytics/usage             -- usage metrics
GET /api/organizations/:organizationId/analytics/knowledge-gaps    -- low-confidence queries
GET /api/organizations/:organizationId/analytics/intents           -- top intents
GET /api/organizations/:organizationId/analytics/cost              -- AI cost by agent/period
GET /api/organizations/:organizationId/analytics/quality           -- WhatsApp quality rating history
```

### Notifications
```http
GET   /api/me/notifications                                      -- current user notifications (active org)
PATCH /api/me/notifications/:notificationId/read                  -- mark as read
GET   /api/organizations/:organizationId/notification-preferences -- user's preferences for this org
PATCH /api/organizations/:organizationId/notification-preferences -- update preferences
```

### Admin (Super Admin Only)
```http
GET    /api/admin/organizations                                    -- list all orgs
GET    /api/admin/organizations/:organizationId                    -- org detail
POST   /api/admin/organizations/:organizationId/suspend            -- suspend with reason
POST   /api/admin/organizations/:organizationId/unsuspend
DELETE /api/admin/organizations/:organizationId                    -- force delete
POST   /api/admin/organizations/:organizationId/impersonate        -- start impersonation session
POST   /api/admin/impersonate/end                                  -- end impersonation
GET    /api/admin/metrics                                          -- global metrics
GET    /api/admin/feature-flags
POST   /api/admin/feature-flags
PATCH  /api/admin/feature-flags/:flagId
GET    /api/admin/health                                           -- system health summary
```

### Health
```http
GET /health                -- overall health
GET /health/db             -- database connectivity
GET /health/redis          -- Redis connectivity
GET /health/queue          -- BullMQ queue depths and worker status
```

### Rate Limiting

| Endpoint Category | Rate Limit |
|---|---|
| Dashboard API (authenticated) | 100 requests/min per user |
| Webhook endpoints (/webhooks/*) | 1,000 requests/min per IP |
| Public endpoints (login, signup, password reset) | 20 requests/min per IP |
| Admin API | 200 requests/min per user |

Implementation: Redis-based sliding window rate limiter middleware.

---

## 7. Webhook Flow

### Meta Webhook Verification
1. Meta sends `GET /webhooks/meta/whatsapp`.
2. Backend checks `hub.verify_token` against configured `META_WEBHOOK_VERIFY_TOKEN`.
3. If valid, return `hub.challenge`.
4. If invalid, return 403.

### Incoming Message Flow
1. Meta sends `POST /webhooks/meta/whatsapp`.
2. Backend verifies HMAC-SHA256 signature using `META_APP_SECRET` with constant-time comparison.
3. Backend stores raw payload in `webhook_events` with status `received`.
4. Backend returns 200 immediately (must respond within 3 seconds per Meta requirement).
5. Backend extracts `phone_number_id` from payload.
6. Backend finds `whatsapp_accounts` by `phone_number_id`.
7. Backend resolves `organization_id`.
8. Backend checks organization status (active, not suspended).
9. Backend checks subscription status and plan limits.
10. Backend deduplicates by WhatsApp message ID.
11. Backend determines message type (message vs. status update).
12. For status updates: update `messages.delivery_status` and return.
13. For messages: create or update contact.
14. Create or update conversation (set `last_customer_message_at`, compute `window_expires_at`).
15. Store inbound message (with correct `message_type` for media/location/contact/etc.).
16. Enqueue `process-incoming-message` job.
17. Worker runs AI pipeline (see Section 9).
18. Worker sends outbound WhatsApp reply (if within 24-hour window and AI is active).
19. Worker stores outbound message and agent run metadata.

### Status Update Flow
1. Meta sends status callback (sent, delivered, read, failed).
2. Backend matches by `whatsapp_message_id`.
3. Update `messages.delivery_status`.
4. On `failed`: log failure reason, trigger retry (up to 3 attempts, exponential backoff: 1s, 4s, 16s).
5. On permanent failure (customer blocked, invalid number): log and mark conversation with warning.

### Stripe Webhook Flow
1. Stripe sends `POST /webhooks/stripe`.
2. Backend verifies Stripe signature using `STRIPE_WEBHOOK_SECRET`.
3. Backend processes based on event type:
   - `checkout.session.completed` → activate subscription, update plan and limits.
   - `invoice.payment_succeeded` → update billing status, reset grace period if applicable.
   - `invoice.payment_failed` → start 7-day grace period, notify owner.
   - `customer.subscription.updated` → sync plan changes (upgrade, downgrade).
   - `customer.subscription.deleted` → handle cancellation, start suspension flow.
4. Unknown webhook types are logged and ignored.

### Idempotency Rules
- Use WhatsApp message ID as unique key for messages.
- Use provider event ID as unique key for webhook events.
- If duplicate event arrives, return 200 without creating another reply.
- Stripe events are idempotent by Stripe event ID.

---

## 8. WhatsApp Platform Compliance

### 24-Hour Messaging Window

Every conversation tracks `last_customer_message_at`. The platform computes `window_expires_at` (= `last_customer_message_at` + 24 hours).

Before sending any outbound message:
1. Check if `window_expires_at > now()`.
2. If **window is open**: send the reply as a normal message.
3. If **window is closed**: block the free-form reply. Return error to the sending layer.
   - For AI replies: do not send. Log the window expiry event.
   - For human replies via dashboard: show "The 24-hour reply window has expired. You can send a message template to re-engage this customer."
4. Dashboard shows a visual countdown timer on each conversation.
5. Conversations with expired windows are visually distinguished (greyed out / labeled "Window Expired").

### Message Templates

- Organizations manage templates from the dashboard (see Message Template Service).
- Templates are submitted to Meta via the Graph API for approval.
- Dashboard shows template approval status: pending, approved, rejected (with Meta's rejection reason).
- Approved templates can be sent to contacts after the 24-hour window expires.
- Template messages are tracked as billable messages.
- Template variable substitution happens at send time.

### Quality Rating Monitoring

- Scheduled job polls Meta's Graph API hourly to check quality rating for each active phone number.
- Quality rating (green, yellow, red) is stored in `whatsapp_accounts.quality_rating`.
- History is stored in `quality_rating_history` table for analytics.
- On Yellow: dashboard warning + email notification to org owner.
- On Red: dashboard alert + urgent email warning about potential Meta restrictions/ban.

### Messaging Rate Limits

- Meta enforces per-phone-number messaging tiers (250 → 1K → 10K → 100K per 24-hour period).
- Platform tracks `daily_outbound_count` per WhatsApp account.
- At 80% of tier limit: show warning in dashboard.
- At 100%: queue outbound messages instead of sending immediately. Notify org owner.
- Queued messages are sent when the limit resets (tracked via `daily_outbound_reset_at`).
- `messaging_tier` is synced from Meta's API.

### Media Message Handling

| Message Type | AI Behavior | Storage |
|---|---|---|
| Text | Full AI processing and response | text_body |
| Image | Store URL. If multimodal LLM configured, include in AI context. Otherwise, acknowledge receipt with configurable fallback. | media_url, media_mime_type |
| Document | Store and surface in inbox. AI acknowledges receipt. | media_url, media_mime_type |
| Audio/Voice | Store. AI acknowledges receipt. STT is future. | media_url |
| Video | Store. AI acknowledges receipt. | media_url |
| Location | Store coordinates. Include in AI context if relevant (booking/delivery agent). | location_latitude, location_longitude |
| Contact | Store. AI acknowledges receipt. | raw_payload |
| Sticker/Reaction | Store. AI does not respond unless configured. | raw_payload |

### Interactive Messages (v0.4)

The message schema and sending layer support structured message payloads from day one:
- Reply buttons (up to 3 quick-reply options).
- List messages (up to 10 options).
- Quick replies.

In MVP, only text replies are sent. The `message_type` field and `raw_payload` jsonb accommodate future interactive formats without schema changes.

---

## 9. AI Agent Pipeline

### Pipeline Steps
1. Load organization (verify status: active, not suspended).
2. Load WhatsApp account (verify is_active, token not expired).
3. Load conversation and contact.
4. Check AI status on conversation (skip if paused or human_active).
5. Check 24-hour messaging window (skip if window expired).
6. Check daily AI cost cap (skip if cap reached, notify owner).
7. Check working hours and outside-hours mode.
   - If `auto_reply`: send outside-hours message, store, return.
   - If `queue`: store message, do not process, return.
   - If `always_on`: continue pipeline.
8. Select agent (single agent in MVP; router in v0.4+).
9. Check if first message in conversation and `ai_disclosure_enabled`: prepend disclosure message.
10. Retrieve recent messages (last 20).
11. Retrieve relevant long-term memories (by contact, semantic similarity, importance).
12. Retrieve relevant knowledge chunks (by organization, filtered to agent's assigned knowledge bases, top-K similarity).
13. Assemble context within token budget (max 8,000 tokens):
    - System prompt + business rules.
    - Agent configuration (tone, language, escalation rules).
    - Knowledge chunks (by relevance score).
    - Long-term memory facts.
    - Recent messages.
    - If context exceeds budget: truncate oldest messages first, then lowest-relevance knowledge chunks.
14. Classify intent and sentiment.
15. Evaluate escalation rules:
    - Sentiment below threshold (default: -0.5)?
    - Customer requesting human (intent classification)?
    - Conversation exceeds max unresolved turns (default: 10)?
    - Message contains escalation keywords?
    - AI confidence below threshold (default: 0.4)?
16. If escalation triggered: set conversation to `needs_human`, send acknowledgment, notify operators, return.
17. Decide action: answer, ask clarification, call tool, or generate response.
18. If tool call needed and tool requires approval: pause and notify operator. Wait for approval.
19. Generate final response via LLM.
20. Validate response:
    - **PII check:** Ensure response doesn't contain org secrets, API keys, or other tenant data.
    - **Business rule compliance:** Verify response doesn't violate configured business rules.
    - **Content safety:** Basic profanity and hate speech detection.
    - If validation fails: block response, escalate to human, log failure reason in agent_run.
21. If strict knowledge mode and no relevant knowledge found: send fallback message instead of generated response.
22. Language handling: if customer writes in a different language than configured, respond in customer's language (LLM-based detection).
23. Send WhatsApp reply via the correct Phone Number ID and access token.
24. Store outbound message, agent run metadata (tokens, cost, latency, knowledge chunks used, memory used, intent, sentiment, confidence, validation result).
25. Update short-term memory (conversation summary every 10 messages).
26. Update long-term memory (extract and store useful facts, update conflicting facts).
27. Update usage records (billable message count, token usage).
28. Update daily cost tracking.

### Latency Budget

| Target | Value |
|---|---|
| P50 | < 4 seconds (webhook received → WhatsApp API send) |
| P95 | < 8 seconds |
| P99 | < 15 seconds |
| Hard timeout | 20 seconds — abandon and send fallback message |

Fallback message on timeout: "I'm looking into this. Let me get back to you shortly." (configurable).

### Fallback Behavior

| Scenario | Behavior |
|---|---|
| LLM API down | Queue messages for retry. If unavailable > 2 minutes, send fallback: "We're experiencing a brief delay. A team member will respond shortly." Notify org admins. |
| Knowledge base returns no results | Agent responds based on system prompt and conversation history only. If strict mode: send fallback message. |
| Cannot classify intent | Default to the general/support agent. Log classification failure. |
| LLM provider failover | Future enhancement — automatic failover to secondary LLM provider. |

### Agent Router (v0.4+)

Router input:
- Latest user message.
- Conversation history.
- Conversation state.
- Available agents (with descriptions and types).
- Business rules.

Router output:
```json
{
  "agentId": "uuid",
  "reason": "Customer is asking about pricing, route to sales agent",
  "confidence": 0.89
}
```

Router rules:
- If confidence below 0.5: route to default agent, log low-confidence event.
- If no agent matches: route to default agent.
- Routing decision logged in agent_runs and visible in conversation metadata.

### Agent Handoff (v0.4+)
- When router switches agents mid-conversation, new agent receives full conversation history and relevant memory.
- Switch is transparent to customer — no notification sent.
- Conversation metadata records which agent handled each message.

### Operator Override (v0.4+)
- Admins and Operators can manually reassign a conversation to a specific agent via the inbox.
- Manual assignment overrides the router for that conversation until resolved.

### LLM Provider Abstraction

```typescript
interface LLMProvider {
  generateChatCompletion(params: {
    model: string;
    messages: Message[];
    tools?: ToolDefinition[];
    maxTokens?: number;
    temperature?: number;
  }): Promise<ChatCompletion>;

  generateEmbedding(params: {
    model: string;
    input: string | string[];
  }): Promise<EmbeddingResult>;
}
```

Implementations:
- `GeminiProvider` (primary, MVP)
- `OpenAIProvider` (future)
- `AnthropicProvider` (future)

Provider is selected via configuration. All provider-specific logic is encapsulated.

---

## 10. Memory Architecture

### Short-Term Memory
Stored per conversation (in `conversations.short_term_memory` jsonb):
- Conversation summary (auto-updated every 10 messages).
- Current intent.
- Open tasks.
- Customer preferences within that conversation.

### Long-Term Memory
Stored per contact (in `memories` table):
- Name.
- Preferences.
- Past purchases or interests.
- Important constraints.
- Prior unresolved issues.

Capacity: max 50 facts per contact per organization. When limit reached, evict oldest facts with lowest importance score.

### Memory Write Rules
- Only store facts that would help future conversations.
- Store: customer name, product preferences, past issues, communication preferences, special requirements.
- Never store: payment card numbers, government IDs, passwords, health diagnoses (unless healthcare provider with consent), or data the customer explicitly asks not to be stored.
- Each fact has an importance score (1-5) assigned by the AI.
- Store with organization and contact scope.

### Memory Retrieval
Retrieve by:
- Contact ID.
- Conversation ID.
- Semantic similarity (embedding-based search).
- Recency.
- Importance score.

Priority: current conversation context > recent memories > highest importance > semantic relevance.

### Memory Conflict Resolution
If long-term memory contradicts the current conversation (e.g., memory says "prefers email" but customer says "contact me on WhatsApp"):
- Current conversation takes precedence.
- Conflicting memory fact is updated with new information.
- Update is logged.

### Memory Review (Admin/Owner)
- View all stored memory facts for any contact via conversation detail or contact detail view.
- Edit individual memory facts (content, importance).
- Delete individual memory facts.
- Bulk delete all memories for a contact.
- Bulk delete all memories for the entire organization.

### GDPR DSAR Support
- Admins can export all stored data for a specific contact as downloadable JSON/CSV.
- Export includes: all messages, memory facts, conversation summaries, contact metadata.
- Export endpoint: `POST /api/organizations/:orgId/contacts/:contactId/export`.

### Memory Privacy Controls
- Organization Owner can disable memory entirely for the organization (`organizations.memory_enabled`).
- Individual contacts can request memory deletion (processed by human operator via dashboard).
- Memory deletion is permanent and irreversible.
- Default agent greeting includes configurable privacy notice: "I may remember details from our conversation to serve you better. You can ask me to forget at any time."

---

## 11. Knowledge Base Architecture

### Ingestion Flow
1. User uploads document (validates type, size ≤ 25 MB, org storage quota).
2. Document record created with `pending` status.
3. Worker extracts text.
4. Worker chunks text (500-1,000 tokens, preserve headings/metadata).
   - PDF: paragraphs with page numbers.
   - CSV: each row as chunk with column headers as metadata.
   - FAQ: each Q&A pair as single chunk.
5. Worker generates embeddings (versioned model, e.g., `text-embedding-004`).
6. Worker stores chunks with embedding model version.
7. Document status becomes `ready`.
8. On failure: status becomes `failed` with actionable error message.

Error messages:
- "Could not extract text from this PDF. The file may be image-only. Try uploading an OCR-processed version."
- "Password-protected files are not supported. Please upload an unprotected version."
- "File exceeds the 25 MB size limit."
- "Unsupported file format. Supported: PDF, DOCX, TXT, MD, CSV."

### Retrieval Flow
1. Embed user query using the same embedding model.
2. Search `knowledge_chunks` WHERE `organization_id` matches AND (optionally) `knowledge_document_id` is in agent's assigned knowledge bases.
3. Return top-K relevant chunks (by cosine similarity).
4. Performance target: < 500ms for up to 1,000 chunks per organization.
5. Include chunks in agent context, ordered by relevance score.

### Document Versioning
- When a user uploads a file with the same filename as an existing document, offer to replace.
- On replacement: delete old chunks and embeddings, create new chunks from updated content.
- `last_updated_content_at` is set to current timestamp.

### Document Staleness
- If `last_updated_content_at` is > 90 days old, set `staleness_warning = true`.
- Dashboard shows "Review recommended" badge on stale documents.
- Staleness check runs as a scheduled job (daily).

### Embedding Model Versioning
- `embedding_model_version` is stored per chunk and per document.
- If the embedding model is changed, all existing chunks must be re-embedded.
- "Re-index all documents" action is available for admins (triggers background job).

### Source Traceability
- Each agent_run records `knowledge_chunks_used`: array of `{document_id, chunk_id, document_title, section_title}`.
- Conversation inbox AI metadata panel shows: "Sources: [Document Name, Section]".
- Enables admins to trace incorrect answers to source documents.

### Chunking Strategy
- Target 500-1,000 tokens per chunk.
- Preserve document structure: headings, section titles, page numbers.
- Store document title and source with each chunk.
- CSV: column headers stored in chunk metadata for attribute-based lookups.

---

## 12. Tool Calling And Integrations

### Tool Execution Principles
- Tool access is configured per organization (via integrations).
- Tool permission is configured per agent (`allowed_tools` jsonb).
- Every tool call is logged (tool name, input, output, status, duration).
- Sensitive tool actions support approval mode.

### Approval Mode
When a tool is marked as requiring approval:
1. Agent run pauses at the tool call step.
2. Tool execution is created with `status = pending_approval`.
3. Operator is notified via in-app notification.
4. Operator reviews proposed action (tool name, input parameters).
5. Operator approves or rejects.
6. On approval: tool executes, result is returned to the AI, pipeline continues.
7. On rejection: AI is informed the tool was not available, pipeline continues without tool result.

### Initial Tools
- `search_knowledge_base` — query the org's knowledge base for relevant context.
- `create_human_handoff` — escalate conversation to human operator.
- `get_business_hours` — return the org's configured business hours.
- `send_internal_notification` — send a notification to team members.

### Future Tools (v0.4+)
- `check_calendar_availability` — Google Calendar integration.
- `create_calendar_event` — Google Calendar integration.
- `lookup_order` — Shopify integration.
- `create_crm_lead` — HubSpot/Zoho integration.
- `append_google_sheet_row` — Google Sheets integration.
- `send_email` — Gmail integration.

### Integration Health Monitoring
- Each integration tracks `health_check_failures`.
- If an integration fails 3 consecutive times, status is set to `unhealthy`.
- Dashboard shows warning for unhealthy integrations.
- Unhealthy integrations are not offered to agents until status recovers.

---

## 13. WebSocket Architecture

### Purpose
Real-time updates for the conversation inbox, notifications, and presence indicators.

### Connection
- WebSocket server runs on the API process.
- Client authenticates via the same session cookie.
- Connection is scoped to the user's active organization.
- On organization switch, client reconnects with new org context.

### Channels

| Channel | Events | Subscribers |
|---|---|---|
| `org:{orgId}:conversations` | new_message, conversation_updated, conversation_created | All org members viewing inbox |
| `org:{orgId}:conversation:{convId}` | new_message, typing_indicator, viewing_indicator, status_change | Members viewing specific conversation |
| `user:{userId}:notifications` | new_notification | Individual user |
| `org:{orgId}:agents` | agent_status_change | Admins viewing agent config |

### Presence
- When a user opens a conversation, they join the conversation channel.
- Server tracks who is viewing each conversation.
- "Being viewed by [Name]" indicator shown to other viewers.
- "Typing..." indicator broadcast when an operator begins typing a reply.
- Presence data is stored in Redis with TTL (expires when user leaves or disconnects).

### Concurrency Control
- Only one manual reply can be in draft at a time per conversation.
- If two operators submit simultaneously, first submission wins (optimistic locking on conversation version).
- Second operator sees a conflict warning and must reload.

---

## 14. Notification System

### Notification Types

| Type | Trigger | Default Channel | Recipients |
|---|---|---|---|
| `escalation` | AI escalates to human | in-app + email | Operators + Admins (or assigned operator) |
| `whatsapp_failure` | Token expiry (7d/1d), connection error | in-app + email | Owner |
| `billing_failure` | Payment failed, grace period start | in-app + email | Owner |
| `document_failure` | KB document processing failed | in-app + email | Uploading user |
| `quality_drop` | WA quality rating → Yellow or Red | in-app + email | Owner |
| `limit_warning` | Usage at 80% of plan limit | in-app + email | Owner |
| `cost_cap` | Daily AI cost cap reached | in-app + email | Owner |

### SLA Follow-Up (Escalation)
- If no human responds within 15 minutes: re-send escalation notification.
- If no human responds within 1 hour: optionally send auto-reply to customer: "Thanks for your patience. Our team will get back to you as soon as possible."
- Timeouts are configurable per organization.

### Notification Preferences
- Per-user, per-organization, per-notification-type.
- Options: `in_app_only`, `in_app_and_email`, `disabled`.
- Critical types (`whatsapp_failure`, `billing_failure`, `quality_drop`) cannot be `disabled` by non-owner members.

### Delivery
- In-app: via WebSocket to connected clients, stored in a notifications table for retrieval.
- Email: queued via BullMQ, sent through configured email provider.

---

## 15. Queue And Background Jobs

### Queues
- `incoming-message` — process incoming WhatsApp messages through AI pipeline.
- `outbound-message` — send messages via WhatsApp API (with retry).
- `document-ingestion` — extract, chunk, embed, and index knowledge documents.
- `billing-sync` — sync subscription status with Stripe.
- `memory-summarization` — update conversation summaries.
- `analytics-rollup` — aggregate analytics data.
- `notification-email` — send email notifications.
- `quality-rating-check` — hourly quality rating sync with Meta.
- `staleness-check` — daily check for stale knowledge documents.
- `token-expiry-check` — daily check for upcoming token expirations.
- `cost-cap-reset` — daily reset of AI cost tracking.
- `rate-limit-reset` — daily reset of outbound message counters.

### Job Rules
- All jobs must be idempotent.
- Failed jobs retry with exponential backoff (configurable per queue).
- Permanent failures (after max retries) are logged and visible in admin diagnostics.
- Webhooks must enqueue work and return 200 within 500ms.
- Jobs carry `organization_id` for tenant-scoped processing.
- A slow-processing organization must not delay webhook acknowledgement for others (enqueue-and-return pattern).

### Job Priority
- `incoming-message`: high priority (AI response latency).
- `outbound-message`: high priority.
- `notification-email`: medium priority.
- `document-ingestion`: low priority (can be batched).
- `analytics-rollup`: low priority (scheduled).

---

## 16. Cost Control System

### Per-Message Token Budget
- Maximum 8,000 tokens per AI request (system prompt + context + knowledge + memory + response).
- If assembled context exceeds budget:
  1. Truncate oldest conversation messages first.
  2. Remove lowest-relevance knowledge chunks.
  3. Remove lowest-importance memory facts.
- Token count is estimated before LLM call and verified after.

### Per-Organization Daily Cost Cap
- Configurable per plan:
  - Starter: $5/day (500 cents).
  - Growth: $20/day (2,000 cents).
  - Agency: $50/day (5,000 cents).
  - Enterprise: custom.
  - Free: $1/day (100 cents).
- Tracked in `daily_cost_tracking` table.
- Before each AI request: check if `estimated_cost_cents + new_request_estimate > cost_cap_cents`.
- If cap would be exceeded: skip AI reply, notify owner, human replies continue.
- Daily reset at midnight UTC (via scheduled job).

### Cost Estimation
- Cost per token is configured per LLM provider/model.
- Example: Gemini 1.5 Flash input = $0.075/1M tokens, output = $0.30/1M tokens.
- `cost_cents` in `agent_runs` = (prompt_tokens × input_rate + completion_tokens × output_rate).

### Usage Tracking
- Billable message: each outbound message sent via WA API (AI, human, or template).
- Token usage: system prompt + history + KB context + memory context + completion tokens.
- Aggregated: per message, per conversation, per agent, per organization, per billing period.
- Dashboard billing page shows: messages sent, AI tokens consumed, estimated AI cost, plan utilization %.

---

## 17. Security Design

### Token Security
- WhatsApp access tokens encrypted at rest with AES-256-GCM.
- Integration credentials encrypted at rest with AES-256-GCM.
- MFA TOTP secrets encrypted at rest with AES-256-GCM.
- Encryption key stored in environment variable (`ENCRYPTION_KEY`) or secret manager.
- Tokens never sent to frontend.
- Tokens never logged (even in structured logs).

### Data Encryption At Rest
- Conversation message content: database-level Transparent Data Encryption (TDE) via managed PostgreSQL.
- Knowledge base document content: database-level TDE.
- WhatsApp tokens, integration credentials, MFA secrets: application-level AES-256-GCM (more granular control).

### Webhook Security
- Verify Meta webhook signature using HMAC-SHA256 with constant-time comparison (`crypto.timingSafeEqual`).
- Verify Stripe webhook signature using Stripe's library.
- Reject unknown providers.
- Store raw webhook payload for audit.

### Tenant Isolation
- Every tenant-owned query must filter by `organization_id`.
- Backend must validate organization membership before returning data.
- Never trust organization ID from frontend without permission check.
- Database queries should use parameterized queries (Prisma handles this).
- API middleware extracts `organization_id` from route and validates membership.

### Access Control (RBAC)

| Role | Key Permissions |
|---|---|
| owner | All actions. Manage billing, connect WhatsApp, invite members, transfer ownership, delete org, enable/disable memory. |
| admin | Create/edit agents, manage KB, manage integrations, view all conversations. Billing only if `billing_access = true`. Cannot connect/disconnect WhatsApp. |
| operator | View conversations (assigned or all, configurable), send manual replies, pause/resume AI, add notes, self-assign unassigned conversations, mark resolved. Cannot edit agents, billing, integrations, or security settings. |
| readonly | View conversations, analytics, knowledge base. Cannot send messages or change anything. |

Sensitive actions requiring owner/admin:
- Connect/disconnect WhatsApp.
- Update tokens.
- Change billing (owner or admin with `billing_access`).
- Delete data (conversations, memory, organization).
- Invite/remove members (owner only).
- Modify agents.

### Authentication Security
- MFA/TOTP required for Organization Owners, recommended for all roles.
- Brute-force protection: 5 attempts → 15 min lock, 10 attempts → email unlock.
- CAPTCHA on signup/login after 3 failed attempts.
- Sessions: HttpOnly, SameSite=Strict, Secure cookies, 24-hour sliding window.
- API tokens (future): configurable expiry, default 90 days.

### HTTP Security Headers
- **CORS:** Dashboard API accepts requests only from the platform's own frontend domain.
- **CSP:** Content Security Policy headers on all dashboard pages.
- **HSTS:** Strict-Transport-Security header.
- **X-Content-Type-Options:** nosniff.
- **X-Frame-Options:** DENY (except for Meta Embedded Signup iframe).

### Dependency Security
- Automated vulnerability scanning in CI: `npm audit` on every build.
- Dependabot or Snyk integration for automated PRs.

---

## 18. Monitoring And Observability

### Logging
Use structured JSON logs with:
- `request_id` — unique per HTTP request.
- `organization_id` — tenant context.
- `user_id` — actor context.
- `conversation_id` — conversation context.
- `webhook_event_id` — webhook context.
- `agent_run_id` — AI pipeline context.
- `error_code` — categorized error.
- `latency_ms` — request/job duration.
- `impersonation_session_id` — if super admin is impersonating.

Log levels: DEBUG, INFO, WARN, ERROR, FATAL.

Sensitive data (tokens, credentials, PII) must never appear in logs.

### Error Tracking
Use Sentry for:
- API exceptions.
- Worker failures.
- Webhook processing failures.
- AI provider failures (LLM API errors, timeouts).
- Validation failures (PII, business rule, safety).

Sentry alerts routed to PagerDuty, Opsgenie, or equivalent (from v0.3).

### Health Endpoints
```http
GET /health         -- {"status": "ok", "timestamp": "..."}
GET /health/db      -- database connectivity check
GET /health/redis   -- Redis connectivity check
GET /health/queue   -- BullMQ queue depths, worker count, stuck jobs
```

### Metrics
Track:
- Webhook received count (by provider, by org).
- Webhook processing latency (P50, P95, P99).
- Webhook failure count.
- AI response latency (P50, P95, P99).
- WhatsApp send success/failure count.
- Queue depth (per queue).
- Queue job completion latency.
- Document ingestion success/failure count.
- Token usage (per org, per agent).
- Cost per organization (per day).
- Active WebSocket connections.
- Rate limit rejections.
- Authentication failures.

### Status Page
External status page (Statuspage.io or Instatus) showing:
- Platform API status.
- WhatsApp webhook processing status.
- AI generation status.
- Database status.

Incident communication via status page + email to affected organization owners.

---

## 19. Operational Requirements

### Backup And Disaster Recovery
- **Database backups:** Automated daily backups with 30-day retention (via managed PostgreSQL provider).
- **Recovery Point Objective (RPO):** < 24 hours (no more than 24 hours of data loss in worst case).
- **Recovery Time Objective (RTO):** < 4 hours (platform restored within 4 hours of a major incident).
- **Redis:** Used for cache, queues, and WebSocket presence. Data is ephemeral — jobs are idempotent, so Redis data loss results in temporary delays but not data loss.
- **Knowledge base embeddings:** Can be regenerated from stored source documents. Loss of embedding data is recoverable.
- Regular disaster recovery drills: quarterly (starting from v1.0).

### Incident Response
- On-call rotation for Platform Super Admin (starting v0.3).
- Sentry alerts routed to PagerDuty/Opsgenie.
- Incident severity levels:

| Severity | Definition | Response Time |
|---|---|---|
| P1 (Critical) | Platform-wide outage. All AI replies failing. | < 15 minutes |
| P2 (High) | Partial outage affecting multiple orgs. | < 1 hour |
| P3 (Medium) | Single org affected or non-critical feature broken. | < 4 hours |
| P4 (Low) | Cosmetic issue or minor bug. | Next business day |

- Post-incident review for all P1/P2 incidents within 48 hours.

### Uptime Target
- 99.5% uptime (excluding planned maintenance).
- Maintenance windows communicated 48 hours in advance via status page and email.

### Customer Support
- v0.1-v0.2: Email-based support. Target first response: < 24 hours.
- v0.3+: In-app support widget (Intercom, Crisp, or equivalent). Target: < 4 hours for paid plans.
- Self-service documentation / help center from v0.2.

---

## 20. Deployment Architecture

### Runtime Processes

Web process:
- Serves dashboard API.
- Receives webhooks.
- Returns responses quickly.
- Serves WebSocket connections.

Worker process:
- Processes incoming messages (AI pipeline).
- Sends outbound WhatsApp messages.
- Processes knowledge documents.
- Handles retries for failed messages.
- Sends notification emails.

Scheduler process:
- Periodic usage/analytics rollups.
- Subscription sync.
- Memory summarization.
- Quality rating checks (hourly).
- Token expiry checks (daily).
- Staleness checks (daily).
- Cost cap resets (daily).
- Rate limit resets (daily).

### Environment Variables
```text
# Core
DATABASE_URL=
REDIS_URL=
APP_URL=                        # Frontend URL
API_URL=                        # Backend URL
ENCRYPTION_KEY=                 # AES-256-GCM key for tokens/credentials/MFA

# Meta WhatsApp
META_APP_ID=                    # For Embedded Signup
META_APP_SECRET=                # For webhook signature verification
META_WEBHOOK_VERIFY_TOKEN=      # For webhook verification challenge

# AI / LLM
GEMINI_API_KEY=                 # Primary LLM provider
# OPENAI_API_KEY=              # Future: secondary provider
# ANTHROPIC_API_KEY=           # Future: tertiary provider

# Billing
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PUBLISHABLE_KEY=

# Email
EMAIL_PROVIDER=                 # resend, sendgrid, ses
EMAIL_PROVIDER_API_KEY=
EMAIL_FROM_ADDRESS=

# Monitoring
SENTRY_DSN=

# Security
CAPTCHA_SECRET_KEY=             # For login/signup CAPTCHA
CORS_ORIGIN=                    # Allowed frontend domain

# Optional
PAGERDUTY_API_KEY=
STATUS_PAGE_API_KEY=
```

### Production Requirements
- HTTPS required on all endpoints.
- Persistent PostgreSQL database with daily backups.
- Persistent Redis (AOF or RDB persistence enabled).
- Secrets managed outside code (environment variables or secret manager).
- Database backups with 30-day retention.
- Error monitoring enabled (Sentry).
- Separate staging and production environments.
- Staging mirrors production schema; all migrations tested on staging first.
- WebSocket support on the hosting platform.

---

## 21. CI/CD

### CI Checks
- TypeScript type check.
- ESLint.
- Unit tests.
- Integration tests.
- Prisma schema validation.
- Build frontend.
- Build backend.
- `npm audit` — dependency vulnerability scan.
- Prisma migration drift detection.

### Deployment Flow
1. Merge to main.
2. CI runs all checks.
3. Build Docker image or platform build.
4. Run migrations on staging.
5. Deploy to staging (web + worker + scheduler).
6. Run smoke tests on staging.
7. If staging passes: run migrations on production.
8. Deploy to production (web + worker + scheduler).
9. Run production smoke tests.
10. Monitor error rates for 15 minutes post-deploy.

### Migration Rules
- All schema changes use versioned Prisma migrations.
- Migrations must be reviewed in code review before merge.
- Destructive migrations (column removal, table deletion) follow a 4-step protocol:
  1. Make the column/table optional in a migration.
  2. Deploy code that no longer depends on it.
  3. Backfill or archive data as needed (via background job).
  4. Remove the column/table in a subsequent release.
- Add columns before requiring them in code.
- Large data backfills run as background jobs, not inline migrations.
- All migrations tested on staging before production.

---

## 22. Testing Strategy

### Unit Tests
- Webhook parser (Meta payload extraction, signature verification).
- Organization resolver (Phone Number ID → organization).
- Permission checks (RBAC enforcement for all roles).
- Agent router (intent classification, agent selection).
- Knowledge retrieval (embedding search, relevance filtering).
- Billing limit logic (plan enforcement, overage rules).
- 24-hour window calculation and enforcement.
- Token budget assembly and truncation.
- Cost cap calculation and enforcement.
- Memory write rules (fact extraction, eviction, conflict resolution).
- Response validation (PII, business rules, safety).
- Rate limiting middleware.
- Notification routing (preferences, critical notification enforcement).

### Integration Tests
- Meta webhook verification (GET challenge-response).
- Incoming message → conversation creation → AI pipeline (mocked LLM).
- WhatsApp outbound send with mocked Meta API.
- Stripe webhook → subscription update → plan limit change.
- Knowledge document upload → chunking → embedding → retrieval.
- Team invitation → acceptance → org membership.
- Organization deletion → grace period → data purge.
- Escalation → notification → human takeover → AI resume.
- 24-hour window expiry → block free-form reply → allow template.
- Daily cost cap → pause AI → notify → reset next day.

### End-To-End Tests
- Signup, email verification, MFA enrollment, organization creation.
- WhatsApp account connection (mocked Embedded Signup).
- Agent creation and configuration.
- Knowledge document upload and processing.
- Simulated WhatsApp webhook → conversation in inbox → AI response generated and stored.
- Human takeover flow (escalation → notification → manual reply → resolve).
- Billing: subscribe, usage tracking, limit enforcement, plan change.
- Agent simulator (test conversation, not billed).
- Organization deletion and cancellation.

### Security Tests
- User cannot access another organization's conversations (tenant isolation).
- Operator cannot change billing (RBAC).
- Admin without `billing_access` cannot access billing endpoints.
- Read-only member cannot send messages or modify agents.
- Invalid webhook signature is rejected.
- Tokens are not returned in any API response.
- Expired session is rejected.
- Locked account cannot authenticate.
- Rate limits are enforced (429 returned on excess).
- CORS rejects requests from unauthorized origins.
- MFA is required for owner role actions.

### Performance Tests
- Dashboard loads in < 2 seconds for organizations with up to 10,000 conversations.
- Webhook acknowledgement within 500ms.
- AI response time: P50 < 4s, P95 < 8s.
- Knowledge retrieval (vector search): < 500ms for up to 1,000 chunks.
- WebSocket message delivery: < 1 second after message processing.

---

## 23. Implementation Milestones

Milestones aligned with PRD v2 Release Roadmap.

### Milestone 1: Foundation (→ PRD v0.1)
- Monorepo setup (apps/web, apps/api, packages/).
- Auth: email/password, Google OAuth, email verification, MFA/TOTP.
- Database schema: users, user_mfa_methods, organizations, organization_members, invitations, onboarding_progress.
- Organization CRUD with team invitations and roles.
- Dashboard shell with navigation and empty states.
- WhatsApp account connection (Embedded Signup + manual setup).
- Webhook receiver with HMAC-SHA256 verification and idempotency.
- WhatsApp account storage with AES-256-GCM token encryption.
- Token expiry tracking and alerts.
- Single AI agent with prompt configuration.
- Health endpoints (/health, /health/db, /health/redis, /health/queue).
- Sentry integration.
- Deployed backend with web + worker processes.
- Environment variables and secrets management.

### Milestone 2: Usable AI Assistant (→ PRD v0.2)
- Conversation inbox with real-time updates (WebSocket).
- Full message history with delivery status tracking.
- Message search (full-text via PostgreSQL tsvector).
- Pagination (25 per page, sorted by last_message_at).
- Prompt version history with diff view (max 50 versions).
- Knowledge base: upload, processing, chunking, embedding, retrieval.
- Vector search with pgvector.
- AI reply generation via Gemini (provider-agnostic abstraction layer).
- 24-hour messaging window enforcement.
- Working hours and outside-hours modes (auto-reply, queue, always-on).
- Human takeover with email notification.
- Conversation lifecycle (New → AI Active → Needs Human → Human Active → Resolved → Reopened).
- Basic memory (conversation summaries, contact facts, importance scoring).
- Media message handling (store + acknowledge non-text).
- Agent testing simulator.
- Response validation (PII, business rules, safety).
- Cost tracking per message.
- Internal notes on conversations.
- Concurrent access indicators (viewing, typing).

### Milestone 3: SaaS Readiness (→ PRD v0.3)
- Stripe billing (all plan tiers: Free, Starter, Growth, Agency).
- Annual billing at 20% discount.
- Usage limits and enforcement with overage handling (hard caps).
- Plan downgrades with graceful resource deactivation.
- Failed payment grace period flow (7d → read-only → 30d → suspend → 90d → delete).
- Daily AI cost cap enforcement.
- Anti-abuse measures (1 free/domain, phone verification, 3 orgs/user).
- Team roles with full permission enforcement (including grantable billing for admins).
- Super Admin panel (org list, global metrics, feature flags, impersonation, suspension).
- Audit logs for all sensitive actions.
- Notification system with per-user preferences.
- GDPR DSAR export (per-contact JSON/CSV).
- Configurable data retention.
- Status page integration.
- Customer support widget (Intercom/Crisp).
- Help center / documentation site.
- Conversation auto-assignment (round-robin among available operators).
- Rate limiting on all API endpoints.
- CORS and CSP headers.

### Milestone 4: Agentic Workflows (→ PRD v0.4)
- Multi-agent router (intent-based agent selection).
- Agent handoff with full context transfer.
- Operator override of agent assignment.
- Tool calling with approval mode.
- Google Calendar integration.
- Google Sheets integration.
- Memory improvements (semantic retrieval, conflict resolution).
- WhatsApp interactive messages (buttons, lists).
- Message Template management (CRUD, Meta submission, sending).
- Meta quality rating monitoring (hourly polling, alerts, history).
- Messaging rate limit tracking and queueing.

### Milestone 5: Growth Features (→ PRD v0.5)
- Shopify integration.
- CRM integration (HubSpot or Zoho).
- Slack integration for internal notifications.
- Advanced analytics (knowledge gaps, intent trends, cost analytics).
- Prompt A/B testing.
- Bring-your-own-LLM-key option.
- Multi-language dashboard (i18n).
- LLM provider failover (automatic switch to secondary).

### Milestone 6: Public Launch (→ PRD v1.0)
- Stable onboarding with guided progressive disclosure.
- Production deployment with staging environment.
- Complete documentation (API docs, help center, developer guide).
- Customer support workflow.
- Security hardening and penetration testing.
- SOC 2 Type I preparation.
- Public API with API keys and documentation.
- Enterprise plan features (SSO via SAML/OIDC, custom DPA, data residency options).
- Disaster recovery drills.

---

## 24. Critical Engineering Rules For AI-Assisted Development

1. **Multi-tenancy is non-negotiable.** Do not build around one hardcoded WhatsApp number. Do not store customer-specific WhatsApp credentials in `.env`.
2. **Every organization-owned table must include `organization_id`.** Every query must filter by it.
3. **Every API route must check organization membership** before returning or modifying data.
4. **Webhooks must be idempotent.** Use WhatsApp message ID and provider event ID as deduplication keys.
5. **Webhooks must return 200 within 500ms.** Enqueue work, never process inline.
6. **The system must route by WhatsApp Phone Number ID before running AI.** Phone Number ID → organization → agent → pipeline.
7. **Tokens must be encrypted at rest** with AES-256-GCM. Never log tokens. Never send to frontend.
8. **The 24-hour messaging window must be enforced on every outbound message.** Never send a free-form reply outside the window.
9. **AI responses must be validated** before sending: PII check, business rule compliance, content safety.
10. **The daily AI cost cap must be checked before every AI request.** Runaway costs are unacceptable.
11. **Agent execution must be logged** with full metadata: tokens, cost, latency, knowledge used, intent, sentiment, validation result.
12. **Tool calls must be permissioned and auditable.** Sensitive tools require approval before execution.
13. **Workers must handle slow AI and document processing** gracefully. Use timeouts (20s for AI, configurable for ingestion).
14. **Frontend must never receive provider secrets,** encryption keys, or access tokens.
15. **Rate limiting must be applied** to all API endpoints. Dashboard: 100/min/user. Webhooks: 1,000/min/IP. Public: 20/min/IP.
16. **Memory must respect privacy rules.** Never store payment cards, gov IDs, passwords. Allow deletion. Support DSAR export.
17. **LLM provider must be abstracted.** All LLM calls go through a provider-agnostic interface. No direct SDK imports outside the provider module.

---

## 25. Definition Of Done

The technical implementation is complete when:

1. Multi-user auth works with email/password, Google OAuth, email verification, and TOTP MFA.
2. Organizations and roles work with full RBAC (owner, admin with grantable billing, operator, readonly).
3. Team invitations work with email link, 7-day expiry, and auto-apply on signup.
4. Each organization can connect a WhatsApp Business account via Embedded Signup or manual setup.
5. Incoming Meta webhooks are verified (HMAC-SHA256) and routed correctly by Phone Number ID.
6. AI replies use the correct organization's WhatsApp credentials (encrypted, never exposed).
7. The 24-hour messaging window is enforced on all outbound messages.
8. Non-text messages (images, documents, audio, video, location, contacts) are stored and acknowledged.
9. Conversations are stored with full lifecycle (New → AI Active → Needs Human → Human Active → Resolved → Reopened).
10. Conversation inbox has real-time updates via WebSocket, search, pagination, and concurrent access indicators.
11. Knowledge base upload, processing, and retrieval works with source traceability.
12. Memory is stored and retrieved safely: max 50 facts, importance scoring, eviction, no PII storage.
13. Memory deletion and GDPR DSAR export work correctly.
14. Human takeover pauses AI completely, notifications are sent, SLA follow-ups work.
15. Agent configuration includes business rules, escalation rules (5 triggers), working hours (3 modes), strict knowledge mode, and AI disclosure.
16. Agent prompt version history works with max 50 versions, diff view, and non-destructive rollback.
17. Agent simulator works and test conversations are not billed.
18. AI responses are validated (PII, business rules, content safety) before sending.
19. Response latency targets are met: P50 < 4s, P95 < 8s, 20s hard timeout with fallback.
20. Cost controls work: per-message token budget (8K), daily cost cap per plan, cost tracking.
21. Billing works through Stripe with all plan tiers, annual billing, overage enforcement.
22. Failed payments trigger the grace period flow (7d → read-only → 30d → suspend).
23. Plan downgrades handle excess resources gracefully.
24. Anti-abuse measures work (1 free/domain, phone verification, 3 orgs max).
25. Notifications are delivered via in-app + email with per-user preferences.
26. Rate limiting is enforced on all API endpoints.
27. CORS, CSP, and security headers are configured.
28. Errors are logged, reported to Sentry, and visible to Super Admins.
29. Super Admin panel shows all orgs, global metrics, feature flags, and supports impersonation.
30. Audit logs capture all sensitive actions.
31. Token expiry is tracked and owners are warned at 7 days and 1 day before expiry.
32. Deployment runs separate web, worker, and scheduler processes.
33. Health endpoints cover API, DB, Redis, and queue.
34. Tests cover webhook routing, tenant isolation, billing, AI pipeline, RBAC, 24-hour window, and cost controls.
35. Staging environment mirrors production; all migrations are tested on staging first.

---

## Appendix A: Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Original | Initial TDD |
| 2.0 | 2026-07-17 | Full alignment with PRD v2. Added: MFA/TOTP authentication, email verification, brute-force protection, rate limiting, CORS/CSP. Organization lifecycle (invitations, ownership transfer, deletion with 30-day grace). WhatsApp platform compliance (24-hour window, message templates, quality rating, rate limits, media handling, interactive messages). Expanded agent configuration (business rules, escalation config with 5 triggers, working hours with 3 modes, simulator, fallback message, AI disclosure). Conversation inbox (WebSocket real-time, search, pagination, lifecycle states, concurrent access, internal notes, delivery status). AI pipeline expansion (Gemini primary with provider abstraction, latency budget P50<4s/P95<8s, cost controls, response validation, language detection, fallback behavior). Memory expansion (50-fact limit, importance scoring, eviction, conflict resolution, GDPR DSAR export, admin review). Knowledge base expansion (file limits, document versioning, staleness detection, embedding model versioning, source traceability, CSV/FAQ handling). Cost control system (daily cap per plan, per-message token budget). Notification system (7 types, per-user preferences, SLA follow-up). WebSocket architecture (real-time inbox, presence, typing indicators). Billing expansion (concrete pricing, billable message definition, overage handling, plan downgrades, failed payment grace period, annual billing, anti-abuse). Super Admin panel (org management, global metrics, feature flags, impersonation). Operational requirements (RPO/RTO, incident severity levels, status page, support system). 8 new database tables. 20+ new API endpoints. Milestones aligned to PRD v2 roadmap (v0.1-v1.0). LLM provider corrected from OpenAI to Gemini with provider-agnostic abstraction. Environment variables updated. |
