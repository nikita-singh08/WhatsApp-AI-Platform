# System Architecture Overview

This document describes the high-level architecture, message processing pipeline, and integrations layout of the WhatsAI platform.

---

## High-Level Architecture Flow

```mermaid
graph TD
    Client[WhatsApp Client] -->|1. Message Payload| Meta[Meta Cloud API]
    Meta -->|2. HTTP Webhook POST| Ingest[NestJS API Webhook endpoint]
    Ingest -->|3. Signature Verification| Queue[Redis / BullMQ Queue]
    Queue -->|4. Async Job Dispatch| Worker[Queue Worker process]
    Worker -->|5. Query history & LTM| DB[(PostgreSQL Database + pgvector)]
    Worker -->|6. Query KB similarity| DB
    Worker -->|7. Multi-Agent Routing| LLM[Gemini API]
    Worker -->|8. Safety Checks| LLM
    Worker -->|9. Post Outbound Message| Meta
```

---

## 1. Message Ingestion & Processing Queue
1.  **Meta Cloud Webhook**: Payload is received at `POST /webhooks/meta/whatsapp`.
2.  **Signature Verification**: The signature is verified using HMAC-SHA256 signature hashes and `META_VERIFY_TOKEN`.
3.  **Idempotency & Enqueuing**: Message ID is cross-checked in the database to prevent duplicate processing, and the message is enqueued to `incoming-message` queue via BullMQ.
4.  **Asynchronous processing**: The API thread immediately returns `200 OK` under 500ms, offloading RAG lookup and LLM inference to separate worker processes.

---

## 2. AI Execution & RAG Pipeline
*   **Active Agent Classification**: The incoming message triggers `RouterService` to classify customer intent and dynamically route the query to the correct active specialized agent system prompt.
*   **RAG Retrieval**: Generates embedding vector (768 dimensions) using `text-embedding-004` and queries database using cosine similarity searches on `knowledge_chunks`.
*   **Context Assembly**: Pulls last 20 messages history, strict RAG chunks, and custom customer memory facts, keeping prompts within the token budget.
*   **Outbound Validation**: Safety filters scrub PII templates (masked as `[EMAIL MASKED]`/`[PHONE MASKED]`) and mask profanities with `****` before delivery.

---

## 3. Human-in-the-loop Tool Approvals
Sensitive agent tool calls (e.g., creating a calendar event) require human approval:

```mermaid
stateDiagram-v2
    [*] --> AI_Inference
    AI_Inference --> Tool_Interception : Agent requests Tool execution
    Tool_Interception --> Approval_Required : name == 'create_calendar_event'
    Tool_Interception --> Auto_Execute : Other tools (e.g., sheets row, orders lookup)
    Approval_Required --> Pending_State : Suspend AI queue replies & Log run
    Pending_State --> WebSockets_Notification : Push 'tool.pending_approval' to operator
    WebSockets_Notification --> Operator_Decision
    Operator_Decision --> Approved : Click Approve
    Operator_Decision --> Rejected : Click Reject
    Approved --> Execute_Tool : Call calendar booking API
    Execute_Tool --> Resume_AI : Feed execution output to LLM history & reply
    Rejected --> Resume_AI : Fail execution status & notify customer
    Resume_AI --> [*]
    Auto_Execute --> Resume_AI
```
