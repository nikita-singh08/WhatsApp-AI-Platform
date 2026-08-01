# Production Deployment Guide

Follow this guide to configure and deploy WhatsAI in production environments.

---

## 1. Release Orchestration Architecture

A standard deployment requires three active decoupled processes running:
1.  **API Service Gateway (NestJS)**: Manages incoming REST requests, WebSockets, Webhooks, and pushes work items to Redis queues.
2.  **Worker Processor (BullMQ)**: Consumes WhatsApp webhooks from Redis, queries knowledge vector indexes, calls Gemini, and sends outbound Meta API replies.
3.  **Scheduler Daemon**: Triggers nightly cleanup tasks (grace window expirations, retention sweeps).

---

## 2. Docker Setup
To run the components, use the following `docker-compose.yml` template:

```yaml
version: '3.8'

services:
  postgres:
    image: ankane/pgvector:latest
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: production_postgres_password
      POSTGRES_DB: whatsai
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      DATABASE_URL: "postgresql://postgres:production_postgres_password@postgres:5432/whatsai"
      REDIS_URL: "redis://redis:6379"
      JWT_SECRET: "your_production_jwt_signing_secret"
      ENCRYPTION_KEY: "your_32_bytes_aes_key"
      GEMINI_API_KEY: "AIzaSy..."
    ports:
      - "3001:3001"
    depends_on:
      - postgres
      - redis

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: "https://api.yourdomain.com"
    depends_on:
      - api

volumes:
  pgdata:
```

---

## 3. Deployment Workflow & DB Migrations
Ensure migrations are completed before launching services:

1.  **Orchestrate DB schema update**:
    ```bash
    npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
    ```
2.  **Verify pgvector indexes are healthy**: Ensure the extension has been successfully initialized in PostgreSQL.
3.  **Set Stripe webhook listener keys**: Secure webhook endpoints by mapping matching secret tokens in environment files to prevent spoofing.
