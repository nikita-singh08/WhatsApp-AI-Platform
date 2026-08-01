# REST API Documentation

This guide describes the core API endpoints of the WhatsAI platform. All endpoints are prefixed with `/api` and require authenticated session cookies (`whatsai_session`) or Bearer authorization headers unless marked as public.

---

## 1. Authentication Endpoints

### POST `/api/auth/signup`
*   **Access**: Public
*   **Request Body**:
    ```json
    {
      "email": "user@example.com",
      "password": "Password123!",
      "name": "Jane Doe"
    }
    ```
*   **Response**: `201 Created` with user representation details.

### POST `/api/auth/login`
*   **Access**: Public
*   **Request Body**:
    ```json
    {
      "email": "user@example.com",
      "password": "Password123!"
    }
    ```
*   **Response**: `200 OK` (sets `whatsai_session` HTTP-only cookie and returns user representation details).

### POST `/api/auth/mfa/enroll`
*   **Access**: Authenticated
*   **Response**: Generates `secret` and `qrCodeUrl` for MFA scanner application.

---

## 2. Organization & Billing

### GET `/api/organizations/:orgId/billing/usage`
*   **Access**: Admin, Owner, Operator, ReadOnly
*   **Response**:
    ```json
    {
      "limits": {
        "seats": 5,
        "agents": 2,
        "dailyCostCapCents": 5000
      },
      "usage": {
        "activeSeats": 3,
        "activeAgents": 1,
        "dailyCentsSpent": 120
      }
    }
    ```

### PATCH `/api/organizations/:orgId/billing/cost-cap`
*   **Access**: Owner, Admin
*   **Request Body**:
    ```json
    {
      "costCapCents": 10000
    }
    ```

---

## 3. Agents Management

### POST `/api/organizations/:orgId/agents`
*   **Access**: Owner, Admin
*   **Request Body**:
    ```json
    {
      "name": "Tech Support Agent",
      "systemPrompt": "You are a customer assistant...",
      "tone": "helpful",
      "language": "en"
    }
    ```

### GET `/api/organizations/:orgId/tool-executions/pending`
*   **Access**: Admin, Operator
*   **Response**: Returns list of agent tool runs pending human approvals.

---

## 4. Third-Party Integrations

### POST `/api/organizations/:orgId/integrations/:provider`
*   **Access**: Owner, Admin
*   **Request Body**:
    ```json
    {
      "credentials": { "apiKey": "custom_key_here" },
      "config": { "calendarId": "primary" }
    }
    ```
*   **Providers**: `google_calendar`, `google_sheets`, `shopify`, `hubspot`, `slack`, `gemini` (BYOK).

---

## 5. Analytics Telemetry

### GET `/api/organizations/:orgId/analytics/cost`
*   **Access**: Owner, Admin, Operator, ReadOnly
*   **Query Params**: `timeframe` (`day` | `week` | `month`)
*   **Response**: Rollup of token costs per agent per date.

### GET `/api/organizations/:orgId/analytics/intents`
*   **Access**: Owner, Admin, Operator, ReadOnly
*   **Response**: Top intent classifications occurrence counts.

### GET `/api/organizations/:orgId/analytics/knowledge-gaps`
*   **Access**: Owner, Admin, Operator, ReadOnly
*   **Response**: Groups low-confidence queries triggering fallbacks.
