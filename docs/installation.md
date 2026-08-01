# Installation & Environment Setup Guide

Follow these steps to run a local development workspace instance of WhatsAI.

---

## Prerequisites
Ensure the following tools are installed on your environment:
1.  **Node.js**: v18 or later.
2.  **npm**: v9 or later.
3.  **PostgreSQL**: v14 or later (must support the `pgvector` extension).
4.  **Redis**: v6 or later (required for BullMQ queuing).

---

## Step 1: Install Dependencies
Clone the repository, navigate to the directory, and install dependencies using npm:
```bash
npm install
```

---

## Step 2: Configure Environment Variables
Create a `.env` file in the root directory. Use the following definitions:

### Core Environment Variables

```ini
# Application configuration
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:3000

# PostgreSQL Connection String (requires pgvector support)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/whatsai?schema=public&sslmode=disable"

# Redis Server URL (for BullMQ background processor queue)
REDIS_URL="redis://localhost:6379"

# Session JWT Signing Secret (must be minimum 32 characters)
JWT_SECRET="super_secure_development_jwt_signing_token"

# AES Encryption Key (must be exactly 32 bytes hex encoded for AES-256-GCM credentials encryption)
ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

# Gemini AI API Configuration
GEMINI_API_KEY="AIzaSyYourGeminiApiKeyHere"

# Meta WhatsApp Cloud API credentials (mocked when empty)
META_VERIFY_TOKEN="whatsai_webhook_verify_token"
META_ACCESS_TOKEN="EAAG..."

# Stripe Billing Configuration (mocked when empty)
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
```

---

## Step 3: Database Initialization
1.  **Run migrations**: Execute database schemas setup and activate `vector` extensions:
    ```bash
    npm run db:migrate
    ```
2.  **Generate Prisma client types**:
    ```bash
    npm run db:generate
    ```
3.  **Seed database**: Seed standard admin groups, test operators, and mockup organizations:
    ```bash
    npm run db:seed
    ```

---

## Step 4: Run Application Local Server
Start NestJS and Next.js development processes concurrently:
```bash
npm run dev
```

*   **API Service**: `http://localhost:3001` (GraphQL/REST API gateways)
*   **Web Console**: `http://localhost:3000` (Management dashboard)
