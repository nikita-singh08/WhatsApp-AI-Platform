# Product Requirements Document: WhatsApp AI Platform

**Version:** 2.0
**Status:** Draft — Pending Review
**Previous Version:** [PRD v1](file:///Users/nikitasingh/Desktop/WhatsAI/docs/whatsapp-ai-platform-prd.pdf)
**Review Basis:** [PRD Critical Review](file:///Users/nikitasingh/.gemini/antigravity-ide/brain/29c45e92-a72e-4b39-8d94-268cb65f8803/prd_critical_review.md)
**Prepared for:** AI-assisted development

---

## 1. Product Summary

### Product Name

WhatsApp AI Platform

### One-Line Description

A multi-tenant SaaS platform where businesses connect their own WhatsApp Business account, configure AI agents, upload knowledge, manage conversations, and let AI respond to customers on their behalf.

### Vision

Small businesses, freelancers, clinics, coaches, agencies, and online sellers receive customer messages all day but cannot always respond quickly, consistently, or intelligently. This platform gives every business its own AI employee on WhatsApp: an assistant that understands the business, answers customer questions, remembers context, uses approved tools, and escalates to humans when needed.

### Core Product Promise

Any business should be able to sign up, connect its WhatsApp Business account, configure an AI agent, add business knowledge, and start receiving AI-assisted WhatsApp replies — without writing code.

---

## 2. Product Goals

### Primary Goals

- Allow each customer to connect their own WhatsApp Business account.
- Route incoming WhatsApp messages to the correct organization and AI agent.
- Let customers configure AI behavior through a dashboard.
- Support knowledge base uploads and retrieval for accurate answers.
- Maintain conversation history and useful memory per customer.
- Provide billing, subscription limits, and usage tracking.
- Provide secure token storage and production-grade monitoring.
- Comply with WhatsApp Business Platform policies, including the 24-hour messaging window and message template requirements.

### Secondary Goals

- Support multiple agents per organization.
- Support integrations such as Google Calendar, Gmail, Google Sheets, CRM, and Shopify.
- Support human takeover when AI confidence is low or the user requests a person.
- Support analytics for response times, usage, unresolved conversations, and customer engagement.

### Non-Goals For Initial Release

- Automating personal WhatsApp Messenger accounts.
- Bypassing Meta WhatsApp Business Platform onboarding.
- Supporting unofficial WhatsApp libraries or WhatsApp Web automation.
- Building a full CRM from scratch.
- Building custom payment infrastructure instead of using Stripe.
- Supporting WhatsApp Flows (Meta's form-like interactive flows) in MVP.
- Building a white-label product in MVP.

---

## 3. Success Metrics

### Activation Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Signup-to-dashboard time | < 2 minutes | Time from form submit to dashboard render |
| WhatsApp connection rate | > 40% of signups within 14 days | % of orgs that complete WhatsApp Business connection |
| Time-to-first-AI-reply | < 30 minutes after WhatsApp connected | Time from connection to first customer message answered by AI |
| Onboarding checklist completion | > 60% within 7 days | % of orgs completing all onboarding steps |

### Engagement Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| AI resolution rate | > 70% of conversations | % of conversations resolved without human takeover |
| Average AI response time | P50 < 4 seconds, P95 < 8 seconds | Time from webhook receipt to WhatsApp API send call |
| Daily active organizations | Tracked monthly | Distinct orgs with at least 1 AI reply per day |
| Knowledge base adoption | > 60% of active orgs | % of orgs with at least 1 processed document |

### Business Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Monthly recurring revenue (MRR) | Tracked from v0.3 | Stripe subscription revenue |
| Trial-to-paid conversion | > 15% | % of free tier orgs upgrading within 30 days |
| Monthly churn rate | < 8% | % of paying orgs that cancel per month |
| AI cost per reply | < $0.03 average | LLM token cost / total AI replies sent |
| Customer support ticket volume | < 5% of active orgs per month | Support tickets / active orgs |

---

## 4. Target Users

### Primary Persona: Small Business Owner

**Examples:** Local clinic, coaching business, real estate broker, travel agency, salon, restaurant, repair service.

**Needs:**
- Fast replies to customers.
- Simple setup — no coding, no DevOps.
- Answers based on business information.
- Ability to pause AI or take over chats.
- Low-cost subscription.

**Pain Points:**
- Missed leads.
- Repeating the same answers.
- No staff for 24/7 support.
- Difficulty using complex CRM tools.
- Unfamiliar with Meta Business Manager — needs guided onboarding.

### Secondary Persona: Online Seller

**Examples:** Instagram seller, Shopify merchant, digital product seller.

**Needs:**
- Product information replies.
- Order-related answers.
- Lead capture.
- Follow-up messages.
- Integration with store or spreadsheet.

### Secondary Persona: Agency / Consultant

**Examples:** Marketing agency, AI automation freelancer, chatbot consultant.

**Needs:**
- Manage multiple client workspaces.
- Configure agents for each client.
- Monitor usage and performance.
- White-label potential in future.

### Admin Persona: Platform Owner

The founder/operator of this SaaS platform.

**Needs:**
- User management.
- Subscription and billing oversight.
- Error monitoring and incident response.
- Usage analytics.
- Support tools for debugging customer issues.
- Feature flag management.

---

## 5. User Roles And Permissions

### Role Definitions

#### Platform Super Admin

- View all organizations.
- View system health, queue depths, error rates.
- Manage subscription plans and feature flags.
- Suspend or delete organizations.
- Inspect logs, webhook delivery events, and agent runs.
- Impersonate organization for debugging (with audit trail).

> **Super Admin Dashboard** must be a separate, access-restricted section of the application. It is specified in detail in Section 11 (Dashboard — Admin Panel).

#### Organization Owner

- Manage organization profile.
- Connect WhatsApp Business account.
- Manage billing and subscription.
- Invite team members and assign roles.
- Create and configure agents.
- Upload knowledge base documents.
- View all conversations and analytics.
- Enable or disable AI memory for the organization.
- Delete organization (with confirmation and grace period).

#### Organization Admin

- Configure agents.
- Manage integrations.
- View all conversations.
- Manage knowledge base.
- Cannot manage billing **unless the Owner explicitly grants billing access** via a per-member permission toggle in Team Management settings.
- Cannot connect or disconnect WhatsApp accounts.

#### Agent Operator

- View conversations assigned to them, or all conversations if no assignment restrictions are configured.
- Take over from AI and reply manually.
- Add internal notes.
- Mark conversations as resolved.
- Self-assign unassigned conversations.
- Cannot edit billing, integrations, agents, or security settings.

#### Read-Only Member

- View conversations, analytics, and knowledge base.
- Cannot send messages, edit agents, or change settings.

### Permission Matrix

| Action | Owner | Admin | Operator | Read-Only |
|--------|:-----:|:-----:|:--------:|:---------:|
| Connect/disconnect WhatsApp | ✅ | ❌ | ❌ | ❌ |
| Manage billing | ✅ | Grantable | ❌ | ❌ |
| Create/edit agents | ✅ | ✅ | ❌ | ❌ |
| Upload knowledge base | ✅ | ✅ | ❌ | ❌ |
| View all conversations | ✅ | ✅ | Configurable | ✅ |
| Send manual replies | ✅ | ✅ | ✅ | ❌ |
| Pause/resume AI on conversation | ✅ | ✅ | ✅ | ❌ |
| Add internal notes | ✅ | ✅ | ✅ | ❌ |
| Invite/remove members | ✅ | ❌ | ❌ | ❌ |
| Transfer ownership | ✅ | ❌ | ❌ | ❌ |
| Delete organization | ✅ | ❌ | ❌ | ❌ |
| View analytics | ✅ | ✅ | Limited | ✅ |
| Manage integrations | ✅ | ✅ | ❌ | ❌ |
| Enable/disable memory | ✅ | ❌ | ❌ | ❌ |

---

## 6. Core User Journeys

### Journey 1: New Business Signs Up

1. User visits landing page.
2. User clicks sign up.
3. User creates account using email/password or Google OAuth.
4. Email verification is required before proceeding.
5. User creates an organization (name, industry, timezone).
6. User lands on onboarding checklist.
7. User is prompted to: connect WhatsApp → create an agent → add knowledge.

**Success Criteria:**
- User can reach dashboard within 2 minutes.
- User understands that official WhatsApp Business setup is required.
- User sees clear next step after signup.
- If WhatsApp Business Account is not yet approved by Meta, the dashboard shows a clear "Pending Verification" state with guidance on Meta's approval process and estimated timelines.

**Empty States:**
- Conversation inbox shows a friendly illustration with the text: "No conversations yet. Once your WhatsApp is connected and an agent is active, conversations will appear here."
- Knowledge base shows: "Add your first document to help your AI agent answer questions accurately."
- Analytics shows: "Analytics will populate once your AI agent starts handling conversations."

---

### Journey 2: Connect WhatsApp Business Account

1. Organization owner opens WhatsApp connection page.
2. User starts **Meta Embedded Signup** (primary path) or **manual setup** (fallback for advanced users).
3. User connects Meta Business account and WhatsApp Business account.
4. Platform stores: WhatsApp Business Account ID, Phone Number ID, display phone number, verified name, and access token (encrypted).
5. Platform verifies webhook configuration with a test event.
6. Platform confirms that incoming messages can be routed.
7. Platform records token expiry date and schedules refresh reminders.

**Embedded Signup (Primary Path):**
- Use Meta's Embedded Signup flow embedded in an iframe.
- On completion, the platform receives a temporary code, exchanges it for a System User access token, and stores it encrypted.
- Show a step-by-step wizard: "Step 1 of 3: Connect your Meta Business account."

**Manual Setup (Fallback Path):**
- User enters Phone Number ID, WhatsApp Business Account ID, and a System User access token.
- Platform validates the credentials by calling the Meta Graph API.
- Platform provides clear instructions with screenshots for generating tokens in Meta Business Manager.

**Success Criteria:**
- Platform knows which organization owns each connected phone number.
- Incoming webhook events are associated with the correct WhatsApp account.
- Errors are shown clearly if Meta setup is incomplete.
- Phone Number ID is globally unique across the platform — if a number is already connected to another organization, the connection is rejected with a clear error.
- Token expiry is tracked and the org owner is warned 7 days before expiry.

**Failure States:**
- If Meta onboarding is incomplete: show which steps are missing (e.g., "Phone number not verified" or "Business verification pending").
- If the token is invalid: show "Unable to verify your WhatsApp credentials. Please check that the access token has the correct permissions."
- If webhook verification fails: show diagnostic results (URL reachable, signature valid, challenge matched).

---

### Journey 3: Configure AI Agent

1. User creates an agent.
2. User selects agent type: support, sales, booking, FAQ, custom.
3. User enters: business name, tone (professional/friendly/casual), language, fallback behavior, working hours, and escalation rules.
4. User connects knowledge sources (selects which knowledge base documents/collections the agent should use).
5. User tests the agent in a built-in simulator (see Section 8 — Agent Testing).
6. User activates the agent and assigns it to a WhatsApp number.

**Agent-to-Number Assignment:**
- In single-agent mode (MVP), one agent is assigned as the default for a WhatsApp number. This is a 1:1 mapping.
- In multi-agent mode (v0.4+), multiple agents can be assigned to a number, with one designated as the default. A router selects the appropriate agent per message.
- If no agent is assigned to a number, incoming messages receive no AI reply and a warning is shown in the dashboard.

**Business Rules Format:**
- Business rules are entered as structured key-value pairs or natural language instructions. Examples:
  - "Never discuss competitor products."
  - "Always ask for the customer's name before providing a quote."
  - "If the customer mentions 'cancel', escalate to human immediately."
  - "Maximum discount is 15%. Do not offer more."
- The system validates that rules are not contradictory and warns the user if a conflict is detected.

**Escalation Rules:**
- Escalation is triggered by any of the following configurable conditions:
  - Sentiment score falls below a threshold (default: -0.5).
  - Customer explicitly requests a human (detected via intent classification).
  - Conversation exceeds a configured number of back-and-forth messages without resolution (default: 10).
  - Message contains keywords from a configurable escalation keyword list.
  - AI confidence score for the response is below a threshold (default: 0.4).
- The organization can customize all thresholds and keyword lists.

**Success Criteria:**
- User can create a working agent without coding.
- Agent prompt is saved version by version (up to 50 versions retained).
- Prompt versions include a diff view comparing any two versions.
- Agent can be disabled without disconnecting WhatsApp.
- Archived agents can be restored. Conversations that were being handled by an archived agent are reassigned to the default agent.

---

### Journey 4: Upload Knowledge Base

1. User opens Knowledge Base.
2. User uploads PDFs, DOCX files, TXT files, MD files, CSV files, or manual FAQs.
3. Platform validates file type and size (see limits below).
4. Platform processes documents: extracts text, chunks, generates embeddings, indexes.
5. User sees document processing status: pending → processing → ready / failed.
6. Agent uses knowledge in replies.

**File Limits:**
- Maximum file size: 25 MB per document.
- Maximum total storage per organization: determined by subscription plan (see Section 14).
- Supported formats: PDF, DOCX, TXT, MD, CSV.
- CSV files are parsed as structured data with column headers preserved as metadata. The AI can perform attribute-based lookups (e.g., "What's the price of Product X?").

**Document Updates:**
- Users can upload a new version of a document. The platform detects the same filename and offers to replace the previous version.
- Old chunks are deleted and new chunks are generated from the updated document.
- Each document shows "Last updated" timestamp. If a document has not been updated in 90 days, the dashboard shows a "Review recommended" badge.

**Failure States:**
- Failed documents show actionable error messages: "Could not extract text from this PDF. The file may be image-only. Try uploading an OCR-processed version."
- Password-protected files are rejected with a clear message.

**Future (Post-MVP):**
- Website URL crawling with scheduled re-crawl.
- Google Drive / Dropbox integration for automatic sync.

**Success Criteria:**
- User can see document processing status in real time.
- Agent cites or references the source document title when using knowledge base content in a reply.
- Per-agent knowledge source selection works — each agent only sees its assigned documents.

---

### Journey 5: Customer Sends WhatsApp Message

1. End customer messages the business's WhatsApp number.
2. Meta sends webhook event to platform.
3. Platform verifies HMAC-SHA256 signature.
4. Platform extracts Phone Number ID and resolves organization.
5. Platform deduplicates by WhatsApp message ID (idempotency).
6. Platform creates or updates conversation and contact.
7. Platform checks subscription status and plan limits.
8. Platform checks 24-hour messaging window status (see Section 7).
9. Platform runs AI pipeline.
10. Agent replies via the correct Phone Number ID and access token.
11. Message, AI reasoning metadata, token usage, and cost are stored.

**Message Types Handled:**
- **Text messages:** Fully supported. AI processes and responds.
- **Image messages:** Image is stored. AI receives a description: "Customer sent an image." If multimodal LLM is configured, the image is included in the AI context. Otherwise, the agent replies: "I received your image. Let me connect you with a team member who can help." (configurable fallback).
- **Document messages:** Stored and surfaced in the conversation inbox. AI acknowledges receipt.
- **Audio/voice messages:** Stored. AI acknowledges receipt. Speech-to-text transcription is a future enhancement.
- **Video messages:** Stored. AI acknowledges receipt.
- **Location messages:** Stored. Location coordinates are included in the AI context if relevant (e.g., for a delivery or booking agent).
- **Contact messages:** Stored. AI acknowledges receipt.
- **Stickers/reactions:** Stored. AI does not respond to reactions unless configured.

**Delivery Status Handling:**
- WhatsApp status callbacks (sent, delivered, read, failed) are processed and stored.
- Delivery failures trigger a retry (up to 3 attempts with exponential backoff).
- Permanent delivery failures (e.g., customer blocked the number) are logged and the conversation is marked with a warning.

**Success Criteria:**
- Correct organization is always selected.
- AI replies from the customer's own connected WhatsApp number.
- Duplicate webhook events do not create duplicate replies.
- Non-text messages are handled gracefully — never ignored silently.

---

### Journey 6: Human Takeover

1. AI detects escalation trigger (see escalation rules in Journey 3).
2. Conversation status changes to "Needs Human."
3. AI sends a configurable acknowledgement to the customer: "I'm connecting you with a team member. They'll be with you shortly." (default, editable per agent).
4. Team members are notified via:
   - **In-app notification** (badge + sound in conversation inbox).
   - **Email notification** (sent to all operators and admins, or assigned operator only).
   - **Future:** Push notification (mobile app), Slack/Teams integration.
5. Team member opens conversation and replies manually.
6. AI pauses completely for this conversation — no AI replies are sent during human takeover.
7. Team member marks conversation as resolved, or manually resumes AI.

**SLA Handling:**
- If no human responds within a configurable time window (default: 15 minutes), the system sends a follow-up notification.
- If no human responds within a second configurable window (default: 1 hour), the system optionally sends an auto-reply to the customer: "Thanks for your patience. Our team will get back to you as soon as possible."
- These timeouts and auto-replies are configurable per organization.

**Concurrent Access:**
- If two operators open the same conversation, the system shows a "Being viewed by [Name]" indicator.
- When one operator starts typing, a "Typing..." indicator is shown to the other.
- Only one manual reply can be in draft at a time. If both submit simultaneously, the first submission wins and the second operator sees a conflict warning.

**Success Criteria:**
- AI does not keep replying during human takeover.
- Operator can resume AI manually.
- Conversation state (AI active / Human active / Resolved) is visible in dashboard.
- Escalation-to-human-response time is tracked in analytics.

---

### Journey 7: Subscription And Billing

1. User selects plan from the billing page.
2. User pays through Stripe Checkout.
3. Platform receives Stripe webhook (`checkout.session.completed`).
4. Organization plan, limits, and feature access are updated.
5. Usage is tracked against plan limits in real time.
6. If usage approaches limits (80% threshold), platform shows a warning in the dashboard and sends an email.
7. If usage exceeds limits, platform behavior depends on limit type (see Overage Handling below).

**Overage Handling:**

| Limit Type | At 80% | At 100% | Behavior |
|-----------|--------|---------|----------|
| Monthly messages | Dashboard warning + email | New AI replies are paused. Human replies still work. Upgrade prompt shown. | Hard cap |
| Agents | — | Cannot create new agents | Hard cap |
| Team seats | — | Cannot invite new members | Hard cap |
| Knowledge base storage | Dashboard warning | Cannot upload new documents | Hard cap |
| Integrations | — | Cannot add new integrations | Hard cap |

**Plan Downgrades:**
- When an organization downgrades to a plan with lower limits, any resources exceeding the new limits remain active until the current billing period ends.
- At the start of the new period, excess resources (agents, members) are deactivated. The owner receives an email listing what was deactivated and can choose which to keep.

**Failed Payments:**
- Grace period: 7 days after a failed payment.
- During grace period: full platform access continues, with a persistent banner: "Your payment failed. Please update your payment method."
- After grace period: AI replies are paused. Dashboard access continues in read-only mode. Conversations are preserved.
- After 30 days of failed payment: account is suspended. Data is retained for 90 days before deletion.

**Success Criteria:**
- Billing status is always synced with Stripe.
- Customers cannot exceed plan limits silently.
- Failed payments trigger appropriate account state transitions.
- Annual billing is available at a 20% discount.

---

## 7. WhatsApp Business Platform Compliance

> This section addresses critical WhatsApp Business API constraints that the platform must respect.

### 24-Hour Messaging Window

Meta's WhatsApp Business API enforces a **24-hour customer service window**:
- A business can send free-form replies **only within 24 hours** of the customer's last message.
- After 24 hours, the business must use a **pre-approved Message Template** and pay Meta's per-message fee.

**Platform behavior:**
- Every conversation tracks the `last_customer_message_at` timestamp.
- When an AI agent or human operator attempts to reply, the platform checks whether the 24-hour window is still open.
- If **window is open:** Send the reply as a normal message. No restrictions.
- If **window is closed:** The platform blocks free-form replies and shows: "The 24-hour reply window has expired. You can send a message template to re-engage this customer."
- Dashboard shows a visual countdown timer on each conversation indicating time remaining in the window.
- Conversations where the window has expired are visually distinguished (greyed out or labeled "Window Expired").

### Message Templates

- Organizations can create, submit for Meta approval, and manage Message Templates from the dashboard.
- Templates support variables (e.g., `{{1}}` for customer name).
- The dashboard shows template approval status: pending, approved, rejected (with Meta's rejection reason).
- Approved templates can be sent to re-open conversations after the 24-hour window expires.
- Template messages are tracked separately for billing (Meta charges per template message sent).

**MVP Scope:** Template management UI and sending capability. Template creation and submission to Meta for approval.

### Quality Rating Monitoring

- Meta assigns a quality rating to each phone number: Green (High), Yellow (Medium), Red (Low).
- The platform queries Meta's API periodically (hourly) to check quality rating.
- Quality rating is displayed on the WhatsApp account management page.
- If quality drops to Yellow: dashboard warning + email to org owner.
- If quality drops to Red: dashboard alert + email warning that Meta may restrict or ban the number.

### Messaging Rate Limits

- Meta enforces per-phone-number messaging tiers (250 → 1K → 10K → 100K messages per 24-hour period).
- The platform tracks outbound message count per phone number per day.
- If the number approaches its tier limit (80%), a warning is shown.
- If the limit is reached, outbound messages are queued and sent when the limit resets, with a notification to the org owner.

### Interactive Messages

- **Buttons:** Support reply buttons (up to 3 quick-reply options) in AI responses. The agent can be configured to offer button choices when appropriate.
- **List messages:** Support list messages (up to 10 options) for menu-style interactions.
- **Quick replies:** Support quick-reply buttons for common responses.

**MVP Scope:** Text replies only. Interactive messages are a v0.4 enhancement. The AI pipeline and message sending layer must be designed to support structured message payloads from the start.

---

## 8. Functional Requirements

### Authentication

- Users can sign up using email/password or Google OAuth.
- Email verification is required before the user can create an organization or access the dashboard.
- Users can log out and reset password via email link.
- Sessions use secure, HttpOnly, SameSite cookies with a sliding window expiry of **24 hours** of inactivity.
- API tokens (for future API access) have a configurable expiry, default **90 days**.
- **MFA/2FA is required for Organization Owners** and recommended for all roles. Supported methods: authenticator app (TOTP). SMS-based MFA is not supported due to SIM-swap risks.
- **Brute-force protection:** After 5 failed login attempts, the account is locked for 15 minutes. After 10 failed attempts, the account is locked until email-based unlock.
- **CAPTCHA:** Displayed on signup and login forms after 3 failed attempts.
- Users can belong to multiple organizations. Organization switching is available via a dropdown in the dashboard header. The "active organization" is persisted in the session.
- Notifications are scoped to the active organization. A global notification badge shows unread items across all orgs.

### Organization Management

- Create organization with required fields: name, timezone. Optional: logo, industry, default language.
- Update organization profile at any time.
- **Industry** and **default language** influence agent behavior: industry is included in the agent's system prompt context, and default language sets the expected response language for new agents.

**Team Invitations:**
- Owner sends an invitation via email address.
- Invitee receives an email with a unique invitation link.
- If the invitee has an account: they accept and are added to the organization.
- If the invitee does not have an account: they are directed to sign up, and upon email verification, the invitation is automatically applied.
- Invitations expire after 7 days. The owner can resend.
- Assign roles at invitation time. Roles can be changed later.

**Ownership Transfer:**
- Owner initiates transfer by selecting an existing member (must be Admin or above).
- The new owner must accept the transfer via email confirmation.
- Upon acceptance: the original owner is demoted to Admin, the new owner assumes the Owner role.
- Billing responsibility transfers with ownership. The new owner is prompted to confirm payment method.
- Ownership cannot be transferred to someone outside the organization.

**Organization Deletion:**
- Owner initiates deletion.
- System shows a summary of what will be deleted: conversations, agents, knowledge base, WhatsApp connections, team members.
- Confirmation requires typing the organization name.
- Deletion begins a **30-day grace period** during which:
  - The organization is suspended (AI replies stop, dashboard is read-only).
  - The owner can cancel deletion at any time.
  - Stripe subscription is cancelled.
- After 30 days: all data is permanently deleted including conversations, contacts, knowledge base documents, embeddings, memory, audit logs, and encrypted tokens.

### WhatsApp Account Management

- Connect WhatsApp Business account via Embedded Signup (primary) or manual setup (fallback).
- Store: WhatsApp Business Account ID, Phone Number ID (unique across platform), display phone number, verified name, access token (encrypted at rest with AES-256-GCM).
- Show registration status (connected, pending verification, disconnected, error).
- Show webhook status (active, failing, not configured).
- Show Meta quality rating (green, yellow, red).
- Show 24-hour window status per conversation.
- Enable or disable AI for each phone number.
- Track token expiry and alert owner 7 days before expiry.

**Token Refresh:**
- System User tokens do not auto-refresh. The platform monitors token expiry.
- 7 days before expiry: email warning + dashboard alert.
- 1 day before expiry: urgent email + dashboard banner.
- On expiry: AI replies are paused for the affected number. Dashboard shows "WhatsApp disconnected — token expired. Reconnect to resume AI."
- The reconnection flow reuses the Embedded Signup or manual setup journey.

**Disconnection:**
- Owner can disconnect a WhatsApp number at any time.
- On disconnection: AI replies stop immediately. Existing conversations are preserved (read-only). The webhook continues to receive events (stored but not processed). The encrypted access token is deleted.
- The phone number is released and can be connected to another organization.

**Multiple Numbers Per Organization:**
- Supported post-MVP. Each number has its own agent assignment, quality rating, and rate limit tracking.
- Webhook events are routed by Phone Number ID, not by WhatsApp Business Account ID, to support this correctly.

**Setup Diagnostics:**
- Diagnostic page shows:
  - Webhook URL reachability (platform attempts to call its own webhook).
  - Last webhook event received (timestamp).
  - Signature verification status.
  - Token validity (tests a Meta Graph API call).
  - Phone number registration status from Meta.

### Agent Management

- Create, edit, duplicate, archive, and restore agents.
- Assign agent to a WhatsApp number (1:1 in MVP, N:1 in multi-agent mode).
- Configure: name, type (support/sales/booking/billing/FAQ/custom), description, tone (professional/friendly/casual/custom), language, business rules, escalation rules, allowed tools, strict knowledge mode, working hours, fallback message.
- **Strict knowledge mode:** When enabled, the agent only answers questions it can ground in the knowledge base. If no relevant knowledge is found, it responds with the configured fallback message instead of guessing.

**Working Hours Configuration:**
- Set business hours per day of week (e.g., Mon-Fri 9:00-18:00 IST, Sat 10:00-14:00 IST).
- **Outside working hours behavior** (configurable per agent):
  - **Auto-reply mode (default):** Send a configurable out-of-hours message: "Thanks for reaching out! Our team is available [hours]. We'll respond as soon as we're back."
  - **Queue mode:** Accept and store the message, but do not generate an AI reply. Process it when working hours resume.
  - **Always-on mode:** AI responds regardless of working hours.

**Agent Testing / Simulator:**
- Built-in chat simulator accessible from the agent configuration page.
- Simulates a customer conversation using the agent's current configuration, knowledge base, and business rules.
- Allows testing with configurable customer profiles (name, language, previous conversation history).
- Shows the full AI reasoning chain: knowledge chunks retrieved, memory used, intent classification, escalation decision, tools called.
- Test conversations are not stored as real conversations and do not count toward billing.

**Prompt Version History:**
- Every save of the agent's system prompt and business rules creates a new version.
- Up to 50 versions are retained per agent.
- Each version shows: timestamp, author (user who made the change), and a diff view against the previous version.
- Rollback to any previous version with one click. Rollback creates a new version (non-destructive).
- A/B testing of prompt versions is a future enhancement (not MVP).

### Conversation Inbox

- View all conversations for the active organization.
- **Real-time updates** via WebSocket connection. New messages appear instantly without page refresh.
- Filter by: open, resolved, AI active, human takeover, needs human, unread, assigned member, WhatsApp number, date range.
- **Search** conversations by: customer phone number, customer name (from contact record), message content (full-text search). Search is available from v0.2.
- **Pagination:** Conversations are loaded in pages of 25, with infinite scroll. Conversations are sorted by last message timestamp (most recent first).
- View full message history including: sender, timestamp, message type (text/image/document/etc.), delivery status (sent/delivered/read/failed).
- View AI-generated response metadata: knowledge chunks used, intent classification, confidence score, escalation decision, token count, cost, agent run ID.
- Manually reply through WhatsApp API (respecting 24-hour window).
- Pause or resume AI per conversation.
- Add internal notes (visible only to team members, not sent to the customer).
- Assign conversation to a team member. Auto-assignment (round-robin among available operators) is a v0.3 enhancement.

**Conversation Lifecycle:**

```
[New] → [AI Active] → [Resolved]
                ↓
         [Needs Human] → [Human Active] → [Resolved]
                                              ↓
                                      (Customer messages again)
                                              ↓
                                         [Reopened] → [AI Active]
```

- **New:** Conversation created when the first message is received from a new contact.
- **AI Active:** AI is handling the conversation.
- **Needs Human:** Escalation triggered. Waiting for a human operator.
- **Human Active:** A human operator has taken over.
- **Resolved:** Conversation marked as complete. If the customer sends a new message, the conversation reopens as AI Active.

### AI Reply System

- Generate replies based on agent configuration (system prompt, tone, language, business rules).
- Use organization knowledge base (filtered to agent-assigned documents).
- Use recent conversation history (last 20 messages).
- Use long-term memory where appropriate (contact facts, previous conversation summaries).
- Detect intent (what the customer wants) and sentiment (positive, neutral, negative).
- Detect when to escalate based on configured escalation rules.
- Respect working hours and out-of-hours behavior configuration.
- Respect 24-hour messaging window — never attempt to send a free-form reply outside the window.
- In strict knowledge mode: avoid answering outside available knowledge. Use fallback message instead.

**LLM Provider:**
- Primary: Google Gemini API (aligning with existing codebase).
- The LLM integration layer must be provider-agnostic, supporting a swap to OpenAI, Anthropic, or other compatible providers via configuration.
- Each organization uses the platform's LLM API key (not their own) in MVP. Bring-your-own-key is a future enhancement.

**Response Latency Targets:**
- P50: < 4 seconds (webhook received → WhatsApp API send call).
- P95: < 8 seconds.
- P99: < 15 seconds.
- If AI generation exceeds 20 seconds, the response is abandoned and a fallback message is sent: "I'm looking into this. Let me get back to you shortly."

**Cost Controls:**
- Track token usage (prompt tokens + completion tokens) per message, per conversation, per organization, per billing period.
- Platform-level daily cost cap per organization (configurable per plan, default $5/day for Starter, $20/day for Growth).
- If an organization hits its daily cost cap, AI replies are paused and the owner is notified. Human replies continue.
- Individual message token budget: maximum 8,000 tokens per AI request (system prompt + context + knowledge + memory + response). If context exceeds this, oldest messages and lowest-relevance knowledge chunks are truncated.

**Fallback Behavior:**
- **LLM API down:** Queue messages for retry. If LLM is unavailable for > 2 minutes, send a configurable fallback message to customers: "We're experiencing a brief delay. A team member will respond shortly." Notify org admins.
- **Knowledge base returns no results:** Agent responds based on its system prompt and conversation history only. If strict mode is on, send fallback message.
- **Cannot classify intent:** Default to the general/support agent. Log the classification failure for analytics.
- **LLM provider failover:** Future enhancement — automatic failover to a secondary LLM provider.

**Language Handling:**
- The agent's configured language is the expected response language.
- If the customer writes in a different language, the AI detects the language and responds in the customer's language (if the LLM supports it), unless the agent is configured as "single language only."
- Language detection is performed by the LLM as part of the response generation prompt.

**Response Validation:**
- Before sending, each AI response is checked for:
  - **PII leakage:** Ensure the response doesn't contain organization secrets, API keys, or other tenant data.
  - **Business rule compliance:** Verify the response doesn't violate configured business rules (e.g., offering a discount beyond the configured maximum).
  - **Content safety:** Basic profanity and hate speech detection. Responses flagged by the safety check are blocked and the conversation is escalated to human.
- Response validation failures are logged in agent runs with the reason.

### Memory

- **Short-term memory (per conversation):**
  - Conversation summary: updated automatically after every 10 messages.
  - Current intent and open tasks.
  - Customer preferences mentioned within the conversation.
  - Stored in the conversation record.

- **Long-term memory (per contact):**
  - Useful facts: name, preferences, past purchases or interests, important constraints, prior unresolved issues.
  - Maximum 50 facts per contact. When the limit is reached, the oldest and lowest-importance facts are evicted.
  - Each fact has an importance score (1-5) assigned by the AI.
  - Facts are stored with organization-level isolation (contact + organization scope).

**What Constitutes a "Useful" Fact:**
- The AI is instructed to store facts that would help future conversations: customer name, product preferences, past issues, communication preferences, special requirements.
- The AI is explicitly instructed to **never store:** payment card numbers, government IDs, passwords, health diagnoses (unless the business is a healthcare provider with appropriate consent), or any data the customer explicitly asks not to be stored.

**Memory Review:**
- Organization Admins and Owners can view stored memory for any contact via the conversation detail view.
- Admins can edit or delete individual memory facts.
- Bulk memory deletion is available per contact or for the entire organization.

**Memory Conflicts:**
- If long-term memory contradicts the current conversation (e.g., memory says "prefers email" but customer says "contact me on WhatsApp"), the current conversation takes precedence. The conflicting memory fact is updated.

**Privacy Controls:**
- Organization Owner can disable memory entirely for the organization.
- Individual contacts can request memory deletion (via the customer's message to the business, processed by a human operator who triggers deletion from the dashboard).
- **GDPR Data Subject Access Request (DSAR) support:** Organization admins can export all stored data for a specific contact (messages, memory facts, conversation summaries) as a downloadable JSON/CSV file.
- Memory deletion is permanent and irreversible.

### Knowledge Base

- Upload files: PDF, DOCX, TXT, MD, CSV.
- Add manual FAQs (question + answer pairs, entered via a form in the dashboard).
- Maximum file size: 25 MB per document.
- Storage quotas are per-plan (see Section 14).
- Process, chunk, embed, and index documents.
- Show processing status: pending → processing → ready → failed.
- Allow deleting documents (chunks and embeddings are also deleted).
- Support per-agent knowledge source selection.

**Chunking Strategy:**
- Target 500-1,000 tokens per chunk.
- Preserve document structure: headings, section titles, and metadata are stored with each chunk.
- CSV files: each row is a separate chunk with column headers as metadata.
- FAQ entries: each Q&A pair is a single chunk.

**Embedding Model:**
- Use a specific, versioned embedding model (e.g., `text-embedding-3-small` or Gemini's embedding model).
- Embedding model version is recorded per chunk.
- If the embedding model is changed, all existing chunks must be re-embedded. The platform provides a "Re-index all documents" action for admins.

**Document Staleness:**
- Each document displays "Last updated" date.
- If a document has not been updated in 90 days, a "Review recommended" badge is shown.
- Future: scheduled re-ingestion for URL-based sources.

**Source Traceability:**
- When the AI uses knowledge base content in a reply, the agent run metadata records which document(s) and chunk(s) were used.
- The conversation inbox AI metadata panel shows: "Sources: [Document Name, Page/Section]".
- This allows admins to trace incorrect answers back to the source document and correct them.

**Future (Post-MVP):**
- Website URL crawling with scheduled re-crawl.
- Google Drive / Dropbox integration.
- Image and table extraction from PDFs via OCR.

### Multi-Agent System

> Multi-agent is a v0.4 feature. MVP supports one active agent per organization. This section specifies the full design for v0.4+.

- Support default agent for each WhatsApp number.
- Support specialized agents: sales, support, booking, billing, FAQ, custom.
- Router decides which agent should handle a message.

**Router Behavior:**
- Input: latest user message, conversation history, conversation state, available agents and their descriptions.
- Output: selected agent ID, routing reason, confidence score.
- If confidence is below 0.5: route to the default agent and log a low-confidence routing event.
- If no agent matches: route to the default agent.
- Routing decision is logged in agent runs and visible in conversation metadata.

**Agent Handoff:**
- When the router switches agents mid-conversation, the new agent receives the full conversation history and relevant memory.
- The switch is transparent to the customer — no notification is sent.
- The conversation metadata records which agent handled each message.

**Operator Override:**
- Admins and Operators can manually reassign a conversation to a specific agent via the inbox.
- Manual assignment overrides the router for that conversation until the conversation is resolved.

**Tool Calling:**
- Agents can call allowed tools (configured per agent by the admin).
- Every tool call is logged: tool name, input, output, status, duration.
- **Approval mode** for sensitive tools: when a tool is marked as requiring approval, the tool call is paused and an operator is notified. The operator reviews the proposed action and approves or rejects it. The AI waits for approval before proceeding.
- Initial tools: `search_knowledge_base`, `create_human_handoff`, `get_business_hours`, `send_internal_notification`.
- Future tools: `check_calendar_availability`, `create_calendar_event`, `lookup_order`, `create_crm_lead`, `append_google_sheet_row`, `send_email`.

### Billing

- **Stripe Checkout** for new subscriptions.
- **Stripe Customer Portal** for plan changes, payment method updates, invoice history.
- Plans based on: message volume, team seats, agents, knowledge base storage, and integrations.
- **Annual billing** available at 20% discount.

**Billable Message Definition:**
- A **billable message** is each outbound message sent via the WhatsApp Business API by the platform, whether sent by AI or by a human operator.
- Inbound customer messages are not billed.
- Test messages sent via the agent simulator are not billed.
- Template messages count as billable messages.
- Each billable message is logged with: organization ID, timestamp, WhatsApp number, message type (AI/human/template), token count, estimated cost.

**AI Token Usage Tracking:**
- Token usage includes: system prompt tokens + conversation history tokens + knowledge base context tokens + memory context tokens + completion tokens.
- Token usage is tracked per message, aggregated per conversation, per agent, and per organization per billing period.
- The billing page shows: messages sent (count), AI tokens consumed, estimated AI cost, and plan utilization percentage.

**Anti-Abuse (Free Tier):**
- Free tier is limited to 1 organization per email domain (not per email address).
- New free accounts require email verification and phone number verification (SMS OTP).
- Rate limit on organization creation: maximum 3 organizations per user account across all plans.
- Platform Super Admin can suspend abusive accounts.

**Plan Downgrades:**
- Detailed in Journey 7 above.

**Failed Payments:**
- Detailed in Journey 7 above.

**Handle Stripe Webhooks:**
- `checkout.session.completed` — activate subscription.
- `invoice.payment_succeeded` — update billing status.
- `invoice.payment_failed` — trigger grace period flow.
- `customer.subscription.updated` — sync plan changes.
- `customer.subscription.deleted` — handle cancellation.
- All Stripe webhooks are verified via Stripe's signature verification.
- Unknown webhook types are logged and ignored.

### Dashboard

**Main Navigation:**
- Onboarding checklist (shown until complete, then collapsible).
- Conversation inbox.
- Agents.
- Knowledge base.
- Analytics.
- Integrations.
- Team management.
- Billing.
- WhatsApp accounts.
- Settings (organization profile, notification preferences, memory settings).
- System notifications.

**Admin Panel (Super Admin Only):**
- Separate route/section, access-restricted to Platform Super Admin role.
- All organizations list with: name, plan, status, member count, message volume, last active date.
- Organization detail view: members, WhatsApp accounts, agents, subscription status, usage metrics, audit logs.
- Global metrics: total orgs, total messages, total AI cost, error rate, webhook failure rate, queue depths.
- Feature flag management: enable/disable features per organization or globally.
- Impersonation: view an organization's dashboard as if logged in as their admin (with full audit trail of the impersonation session).
- Suspension/deletion: suspend or delete organizations with reason logging.

**Mobile Responsiveness:**
- The dashboard must be responsive and usable on mobile devices (min width: 375px).
- Conversation inbox must be fully functional on mobile: view conversations, read messages, send replies, pause/resume AI.
- Agent configuration and knowledge base upload may require desktop for optimal experience, but must not be broken on mobile.

**Empty States:**
- Every section has a designed empty state with:
  - A friendly illustration or icon.
  - A clear description of what the section does.
  - A primary action button to get started (e.g., "Upload your first document", "Create your first agent").

### Analytics

- Total conversations (by period).
- AI-resolved conversations and resolution rate.
- Human takeover rate and average human response time.
- Average AI response time (P50, P95).
- Message volume (inbound + outbound, by day/week/month).
- Top intents (what customers are asking about most).
- Knowledge gaps: queries where the AI had low confidence or no knowledge base match, grouped by topic.
- Failed webhook events and retry outcomes.
- Token usage and estimated AI cost (by day/week/month, by agent).
- WhatsApp quality rating history.
- 24-hour window expiry rate (% of conversations where the window expired before a reply was sent).

### Notifications

- Notify organization members about human takeover (in-app + email).
- Notify on failed WhatsApp connection or token expiry (in-app + email to owner).
- Notify on failed billing payment (in-app + email to owner).
- Notify on document processing failures (in-app + email to uploading user).
- Notify on WhatsApp quality rating drop to Yellow or Red (in-app + email to owner).
- Notify on plan limit approaching (80% threshold) (in-app + email to owner).
- Notify on daily AI cost cap reached (in-app + email to owner).

**Notification Preferences:**
- Each user can configure per-notification-type preferences: in-app only, in-app + email, or disabled.
- Organization-critical notifications (token expiry, billing failure, quality rating drop) cannot be fully disabled by non-owner members.

---

## 9. Integrations

### Required Integrations

- **Meta WhatsApp Business Platform / Cloud API** — core messaging.
- **Google Gemini API** (primary LLM) — AI response generation and embeddings.
- **Stripe** — billing, subscriptions, payment processing.
- **Email provider** (e.g., Resend, SendGrid, AWS SES) — transactional emails (invitations, notifications, password reset).
- **Sentry** — error monitoring and alerting.

### High-Priority Future Integrations

- Google Calendar — appointment booking.
- Gmail — email follow-ups.
- Google Sheets — lightweight CRM / product data.
- Shopify — product and order lookup.
- HubSpot or Zoho CRM — lead management.
- Slack — internal notifications and human takeover alerts.

### Integration Principles

- Each integration belongs to an organization.
- Integration credentials (OAuth tokens, API keys) are encrypted at rest with AES-256-GCM.
- Integration credentials are never sent to the frontend.
- Tool access must be explicitly enabled per agent.
- Tool calls must be logged with: tool name, input, output, status, execution time.
- Sensitive tool actions (e.g., creating a calendar event, updating a CRM record) support configurable approval mode.
- Integration health is monitored: if an integration fails repeatedly, the dashboard shows a warning and the integration is marked as "unhealthy."

---

## 10. Non-Functional Requirements

### Security

- Encrypt WhatsApp access tokens and integration credentials at rest using AES-256-GCM.
- Encrypt conversation message content at rest.
- Encrypt knowledge base document content at rest.
- Verify Meta webhook signatures using HMAC-SHA256 with constant-time comparison.
- Verify Stripe webhook signatures.
- Use role-based access control (RBAC) on all API endpoints.
- Isolate organization data strictly — every tenant-owned query must filter by `organization_id`. Backend must validate organization membership before returning any data.
- Never expose access tokens, API keys, or encryption keys to the frontend.
- Store audit logs for sensitive actions (token changes, billing changes, role changes, data deletion, org deletion, WhatsApp connection/disconnection).
- **MFA (TOTP-based)** required for Organization Owners and recommended for all roles.
- **API rate limiting:**
  - Dashboard API: 100 requests per minute per user.
  - Webhook endpoints: 1,000 requests per minute per IP (Meta and Stripe send bursts).
  - Public endpoints (login, signup): 20 requests per minute per IP.
- **CORS:** Dashboard API only accepts requests from the platform's own frontend domain.
- **CSP headers:** Content Security Policy headers on all dashboard pages.
- **Dependency security:** Automated dependency vulnerability scanning in CI (e.g., `npm audit`, Dependabot, Snyk).

### Reliability

- Webhook endpoint must respond with 200 within 3 seconds (Meta requirement). All processing happens asynchronously via queues.
- Duplicate webhook events must be idempotent (deduplicate by WhatsApp message ID).
- Failed outbound WhatsApp replies retry up to 3 times with exponential backoff (1s, 4s, 16s).
- Health checks: `GET /health`, `GET /health/db`, `GET /health/redis`, `GET /health/queue`.
- **Uptime target:** 99.5% (excluding planned maintenance).

### Performance

- Dashboard pages load in under 2 seconds for organizations with up to 10,000 conversations.
- Webhook acknowledgement within 500ms.
- AI response time: P50 < 4s, P95 < 8s, P99 < 15s.
- Knowledge retrieval (vector search): < 500ms for up to 1,000 chunks per organization.
- Conversation inbox real-time message delivery: < 1 second after message is processed.

### Scalability

- Architecture must support multiple organizations from day one.
- Background jobs (document ingestion, AI generation, outbound messaging, memory summarization) processed by separate worker processes.
- Database schema includes `organization_id` on all tenant-owned records.
- Queue workers scale independently from the web API process.
- **Vector search partitioning:** Knowledge chunks are filtered by `organization_id` during search. For scale beyond 100K total chunks, evaluate partitioning strategies (per-org indexes or filtered ANN search).
- **Webhook isolation:** A slow-processing organization must not delay webhook acknowledgement for other organizations. This is ensured by the enqueue-and-return pattern.

### Compliance And Privacy

- **Data retention:** Conversations and messages are retained for the duration of the organization's subscription plus 90 days after deletion/cancellation. Configurable retention periods (30, 60, 90, 180, 365 days) are a v0.3 enhancement.
- **Data deletion:** Provide complete data deletion for organizations (see Organization Deletion in Section 8).
- Allow deleting conversations and contact memories.
- **GDPR DSAR support:** Admins can export all data for a specific contact as JSON/CSV.
- **Data Processing Agreement (DPA):** A standard DPA template is available for download from the platform's website. Enterprise customers can request a custom DPA.
- **Data residency:** MVP deploys in a single region (US or EU, configurable at deployment time). Multi-region deployment is a future enhancement.
- Avoid collecting unnecessary personal data.
- Respect WhatsApp Business Platform policies and Commerce Policy.
- **AI disclosure:** The platform provides a configurable option for agents to identify themselves as AI in the first message of a conversation. Default: enabled. The disclosure message is editable (default: "Hi! I'm an AI assistant for [Business Name]. How can I help you today?"). Some jurisdictions require AI disclosure — the platform documentation includes guidance on compliance.
- **Terms of Service / Acceptable Use Policy:** The platform defines an AUP that prohibits: spam, unsolicited marketing without consent, illegal content, impersonation, phishing, and abuse of the WhatsApp Business API.
- **Content moderation:** If an organization repeatedly sends messages that result in low quality ratings or Meta enforcement actions, the platform may suspend the organization's AI capabilities pending review.
- **Consent for AI memory:** The platform's default agent greeting includes a brief privacy notice: "I may remember details from our conversation to serve you better. You can ask me to forget at any time." This is editable by the organization.

---

## 11. Operational Requirements

### Customer Support

- **v0.1-v0.2:** Email-based support (support@[platform-domain]). Target first response time: < 24 hours.
- **v0.3+:** In-app support widget (e.g., Intercom, Crisp). Target first response time: < 4 hours for paid plans.
- **Documentation:** Self-service knowledge base / help center covering: getting started, WhatsApp setup, agent configuration, troubleshooting, billing, FAQ. Available from v0.2.

### Status Page

- Public status page (e.g., via Statuspage.io or Instatus) showing:
  - Platform API status.
  - WhatsApp webhook processing status.
  - AI generation status.
  - Database status.
- Incident communication via status page + email to affected organization owners.

### Backup And Disaster Recovery

- **Database backups:** Automated daily backups with 30-day retention.
- **Recovery Point Objective (RPO):** < 24 hours (no more than 24 hours of data loss in worst case).
- **Recovery Time Objective (RTO):** < 4 hours (platform restored within 4 hours of a major incident).
- **Redis:** Used for cache and queues. Data in Redis is ephemeral — jobs are designed to be retryable, so Redis data loss results in temporary delays but not data loss.
- **Knowledge base embeddings:** Can be regenerated from stored source documents. Loss of embedding data is recoverable.
- Regular disaster recovery drills: quarterly (starting from v1.0).

### Incident Response

- On-call rotation for Platform Super Admin (starting v0.3).
- Sentry alerts routed to PagerDuty, Opsgenie, or equivalent.
- Incident severity levels:
  - **P1 (Critical):** Platform-wide outage. All AI replies failing. Response time: < 15 minutes.
  - **P2 (High):** Partial outage affecting multiple orgs. Response time: < 1 hour.
  - **P3 (Medium):** Single org affected or non-critical feature broken. Response time: < 4 hours.
  - **P4 (Low):** Cosmetic issue or minor bug. Response time: next business day.
- Post-incident review for all P1/P2 incidents within 48 hours.

### Database Migration Strategy

- All schema changes use versioned migrations (Prisma Migrate or equivalent).
- Migrations are reviewed in code review before merge.
- Destructive migrations (column removal, table deletion) are prohibited without a prior deprecation migration that:
  1. Makes the column/table optional.
  2. Deploys code that no longer depends on it.
  3. Backfills or archives data as needed.
  4. Only then removes the column/table in a subsequent release.
- Large data backfills run as background jobs, not inline migrations.
- Staging environment mirrors production schema. All migrations are tested on staging first.

---

## 12. Plan And Packaging

### Subscription Plans

#### Free / Trial

- 1 organization.
- 1 WhatsApp number.
- 1 agent.
- 50 billable messages per month.
- 5 MB knowledge base storage.
- Conversation inbox (up to 100 conversations retained).
- Community support only.
- **Anti-abuse:** Requires email + phone verification. Limited to 1 free org per email domain.

#### Starter — $29/month ($24/month annual)

- 1 WhatsApp number.
- 3 agents.
- 1,000 billable messages per month.
- 50 MB knowledge base storage.
- Conversation inbox (unlimited retention).
- Basic analytics.
- Email support (< 24 hour response).
- AI daily cost cap: $5/day.

#### Growth — $79/month ($63/month annual)

- 2 WhatsApp numbers.
- 10 agents.
- 5,000 billable messages per month.
- 5 team members.
- 200 MB knowledge base storage.
- Advanced analytics.
- Human takeover workflows.
- Integrations: Google Calendar, Google Sheets.
- Priority email support (< 4 hour response).
- Configurable data retention.
- AI daily cost cap: $20/day.

#### Agency — $199/month ($159/month annual)

- 5 organizations (client workspaces).
- 5 WhatsApp numbers (across all orgs).
- 25 agents (across all orgs).
- 20,000 billable messages per month.
- 15 team members.
- 1 GB knowledge base storage.
- All integrations.
- Priority support.
- Audit logs.
- White-label-ready structure (future).
- AI daily cost cap: $50/day.

#### Enterprise — Custom Pricing

- Unlimited organizations.
- Custom message volume.
- Custom knowledge base storage.
- Dedicated account manager.
- Custom SLA.
- Custom DPA.
- SOC 2 report access (when available).
- SSO integration (SAML/OIDC).
- Data residency options.

> **Note:** Pricing is subject to adjustment based on unit economics analysis after initial launch. Prices above are starting points.

---

## 13. MVP Definition

The first functional release (v0.1 + v0.2 combined) must include:

1. Authentication (email/password, Google OAuth, email verification, MFA for owners).
2. Organization workspace (create, profile, basic team management).
3. Connect WhatsApp Business account (Embedded Signup + manual setup).
4. Store WhatsApp account credentials securely (AES-256-GCM).
5. Webhook routing by Phone Number ID.
6. One active AI agent per organization.
7. Agent prompt configuration with version history.
8. Conversation inbox with real-time updates (WebSocket).
9. Knowledge base upload and retrieval (PDF, DOCX, TXT, CSV, FAQ).
10. Basic memory (conversation summaries, contact facts).
11. 24-hour messaging window enforcement.
12. Working hours configuration with out-of-hours auto-reply.
13. Human takeover with email notification.
14. Basic media message handling (store and acknowledge non-text messages).
15. Stripe subscription (Free + Starter plans).
16. Usage tracking and plan limit enforcement.
17. Error monitoring (Sentry).
18. Health endpoints.
19. Production deployment with separate web and worker processes.
20. Empty states for all dashboard sections.
21. Responsive dashboard (mobile-friendly inbox at minimum).

---

## 14. Release Roadmap

### Version 0.1: Foundation

- Auth (email/password, Google OAuth, email verification, MFA).
- Organization model (create, profile, team invitations, roles).
- Dashboard shell with navigation and empty states.
- WhatsApp account storage and connection (Embedded Signup + manual).
- Webhook receiver with signature verification and idempotency.
- Single AI agent with prompt configuration.
- Deployed backend with web + worker processes.
- Health endpoints and Sentry integration.
- Token expiry tracking and alerts.

### Version 0.2: Usable AI Assistant

- Conversation inbox with real-time updates (WebSocket).
- Full message history with delivery status.
- Prompt configuration with version history and diff view.
- Knowledge base upload, processing, and retrieval.
- Basic vector search (pgvector).
- AI replies from connected number with 24-hour window enforcement.
- Working hours and out-of-hours auto-reply.
- Human takeover with notification.
- Basic memory (conversation summaries, contact facts).
- Media message handling (store + acknowledge).
- Agent testing simulator.
- Conversation search.

### Version 0.3: SaaS Readiness

- Stripe billing (all plan tiers).
- Usage limits and enforcement with overage handling.
- Annual billing.
- Team roles with full permission enforcement.
- Monitoring dashboard (Super Admin panel).
- Audit logs.
- Notification preferences.
- GDPR DSAR export.
- Configurable data retention.
- Status page.
- Customer support integration (in-app widget).
- Help center / documentation site.
- Anti-abuse measures for free tier.
- Auto-assignment for conversations (round-robin).

### Version 0.4: Agentic Workflows

- Multi-agent router.
- Tool calling with approval mode.
- Google Calendar integration.
- Google Sheets integration.
- Conversation memory improvements (importance scoring, semantic retrieval).
- WhatsApp interactive messages (buttons, lists).
- Message Template management and sending.
- Meta quality rating monitoring.

### Version 0.5: Growth Features

- Shopify integration.
- CRM integration (HubSpot or Zoho).
- Slack integration for internal notifications.
- Advanced analytics (knowledge gaps, intent trends).
- Prompt A/B testing.
- Bring-your-own-LLM-key option.
- Multi-language dashboard (i18n).

### Version 1.0: Public Launch

- Stable onboarding with guided setup.
- Production deployment with staging environment.
- Complete documentation.
- Customer support workflow.
- Security hardening and penetration testing.
- SOC 2 Type I preparation.
- Public API with API keys and documentation.
- Enterprise plan features (SSO, custom DPA).

---

## 15. Acceptance Criteria

The project is considered fully working when:

1. A new user can sign up, verify their email, enable MFA, and create an organization.
2. The user can connect a WhatsApp Business account via Embedded Signup or manual setup.
3. The platform can receive a WhatsApp message for that account.
4. The webhook signature is verified and duplicate events are rejected.
5. The message is routed to the correct organization by Phone Number ID.
6. The organization's active AI agent generates a reply using the configured prompt, knowledge base, and memory.
7. The reply is sent from the organization's own WhatsApp number using their stored (encrypted) access token.
8. The 24-hour messaging window is enforced — no free-form replies are sent after the window expires.
9. Non-text messages (images, documents, audio) are stored and acknowledged gracefully.
10. Conversation history is visible in the dashboard with real-time updates.
11. Knowledge base content influences answers, and source documents are traceable in AI metadata.
12. Memory is stored and used safely, with no PII leakage and deletion support.
13. Human takeover pauses AI completely, notifications are sent, and operators can respond.
14. Billing can activate or restrict access based on plan limits.
15. Usage is tracked accurately and limits are enforced.
16. Failed payments trigger the grace period flow, not immediate suspension.
17. Errors are logged, reported to Sentry, and visible to Super Admins.
18. Tokens are encrypted at rest and never exposed to the frontend.
19. Organization data is strictly isolated — users cannot access another organization's data through any API endpoint.
20. The dashboard is responsive and usable on mobile devices.
21. All empty states guide the user toward the correct next action.

---

## Appendix A: Glossary

| Term | Definition |
|------|-----------|
| WhatsApp Business Account (WABA) | A Meta account that represents a business on WhatsApp. Contains phone numbers, message templates, and quality ratings. |
| Phone Number ID | A Meta-assigned identifier for a specific phone number registered under a WABA. Used for sending/receiving messages. |
| System User Access Token | A long-lived token generated in Meta Business Manager that grants API access to a WABA. Expires after ~60 days. |
| 24-Hour Window | Meta's rule that businesses can only send free-form replies within 24 hours of the customer's last message. |
| Message Template | A pre-approved message format (approved by Meta) that can be sent outside the 24-hour window. Per-message fees apply. |
| Billable Message | Each outbound message sent by the platform via the WhatsApp API (AI or human-authored). |
| Strict Knowledge Mode | Agent setting that restricts the AI to only answer questions grounded in the knowledge base. |
| Human Takeover | The process of pausing AI and transferring conversation handling to a human operator. |
| Agent Run | A single execution of the AI pipeline for one incoming message, including all LLM calls, knowledge retrieval, and tool calls. |

---

## Appendix B: Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Original | Initial PRD |
| 2.0 | 2026-07-16 | Incorporated all recommendations from PRD Critical Review: added success metrics, WhatsApp platform compliance (24-hour window, templates, quality ratings, rate limits, media types, interactive messages), detailed authentication (MFA, brute-force protection, email verification, session management), organization lifecycle (invitations, ownership transfer, deletion), WhatsApp token refresh and disconnection flows, detailed agent configuration (business rules format, escalation rules criteria, testing simulator, working hours behavior), conversation inbox (real-time updates, search, pagination, lifecycle states, media handling, delivery status), AI reply system (latency targets, cost controls, fallback behavior, language handling, response validation, LLM provider alignment), memory (capacity limits, usefulness criteria, review UI, conflict resolution, GDPR DSAR), knowledge base (file limits, document updates, staleness, source traceability, CSV handling, embedding model versioning), multi-agent (router behavior, handoff, operator override, tool approval mode), billing (pricing tiers, billable message definition, token tracking, overage handling, anti-abuse, plan downgrades, failed payment grace period, annual billing), permissions (grantable billing for admins, operator self-assignment, Super Admin dashboard), security (MFA, API rate limiting, encryption for messages and KB, CORS, CSP, dependency scanning), compliance (data retention, DSAR, DPA, AI disclosure, AUP, content moderation, memory consent), operational (support system, status page, backup RPO/RTO, incident response, migration strategy), scalability (webhook isolation, vector search partitioning, LLM failover), UX (mobile responsiveness, empty states, notification preferences, concurrent access handling), and enterprise plan. |
