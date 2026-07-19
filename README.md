# 🤖 WhatsAI

> A multi-tenant SaaS platform that enables businesses to connect their own WhatsApp Business accounts to AI-powered assistants for customer support, business automation, and intelligent conversations.

---

## 🚀 Project Status

**Version:** v1.0.0 (MVP)

**Status:** 🟢 MVP Complete | Ready for Beta Testing

WhatsAI is designed with a scalable production architecture that allows each organization to securely connect its own WhatsApp Business account, configure custom AI agents, upload business knowledge, and automate customer interactions.

---

# ✨ Features

### 🔐 Authentication & Security

- Email & Password Authentication
- Multi-Factor Authentication (TOTP)
- Role-Based Access Control (RBAC)
- Secure Session Management
- Organization-based User Management

---

### 💬 WhatsApp Integration

- Connect WhatsApp Business Cloud API
- Secure Webhook Verification
- Multi-Tenant Message Routing
- Human Takeover Support
- Conversation History

---

### 🧠 AI Capabilities

- Google Gemini Integration
- Retrieval Augmented Generation (RAG)
- Knowledge Base Search
- Conversation Memory
- Configurable AI Prompts
- AI Settings per Organization

---

### 📚 Knowledge Base

- Upload Documents
- Semantic Search using pgvector
- Organization-specific Knowledge
- AI Context Retrieval

---

### 🏢 Multi-Tenant SaaS

- Multiple Organizations
- Organization Isolation
- Team Members
- Secure Data Separation

---

### ⚙️ Backend Infrastructure

- Queue Processing (BullMQ)
- PostgreSQL Database
- Prisma ORM
- Modular NestJS Architecture
- Shared Packages
- Background Jobs

---

# 🛠 Tech Stack

## Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS

## Backend

- NestJS
- Prisma ORM
- PostgreSQL
- Redis
- BullMQ

## AI

- Google Gemini
- RAG Pipeline
- pgvector

## Infrastructure

- Docker
- npm Workspaces
- REST APIs
- WebSockets

---

# 📂 Project Structure

```
WhatsAI
│
├── apps
│   ├── api                 # NestJS Backend
│   └── web                 # Next.js Dashboard
│
├── packages
│   ├── ai                  # Gemini & RAG
│   ├── database            # Prisma & Database
│   ├── integrations        # WhatsApp & Third-party APIs
│   ├── notifications       # Email & Notifications
│   └── shared              # Shared Types & Utilities
│
├── docs
│   ├── architecture.md
│   ├── installation.md
│   ├── api.md
│   └── deployment.md
│
└── README.md
```

---

# 🏗 Architecture

The platform follows a modular multi-tenant SaaS architecture.

```
                    User Dashboard
                           │
                           ▼
                    Next.js Frontend
                           │
                           ▼
                    NestJS API Server
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
 Authentication      WhatsApp Service     AI Service
        │                  │                  │
        ▼                  ▼                  ▼
 PostgreSQL         BullMQ Queue       Google Gemini
        │                  │                  │
        └──────────────► Knowledge Base ◄────┘
                         (pgvector)
```

---

# 🚀 Quick Start

## Clone Repository

```bash
git clone https://github.com/your-username/WhatsAI.git

cd WhatsAI
```

---

## Install Dependencies

```bash
npm install
```

---

## Configure Environment

Create your environment variables.

```
.env
```

Refer to:

```
docs/installation.md
```

---

## Generate Prisma Client

```bash
npm run db:generate
```

---

## Run Database Migrations

```bash
npm run db:migrate
```

---

## Seed Development Database

```bash
npm run db:seed
```

---

## Start Development

```bash
npm run dev
```

---

Frontend

```
http://localhost:3000
```

Backend

```
http://localhost:3001
```

---

# 📖 Documentation

Detailed documentation is available inside the **docs** folder.

- Installation Guide
- API Documentation
- Architecture
- Deployment Guide

---

# 🔐 Security

WhatsAI includes multiple security layers:

- Password Hashing
- AES-256 Encryption
- JWT Authentication
- TOTP Multi-Factor Authentication
- Secure Session Management
- Role-Based Authorization
- Webhook Signature Verification
- Organization Data Isolation

---

# 🧪 Current MVP Scope

The current MVP includes:

- User Authentication
- Multi-Tenant Organizations
- WhatsApp Integration
- AI Agent Configuration
- Knowledge Base
- Conversation Memory
- Dashboard
- Background Jobs
- Human Takeover
- Queue Processing

---

# 🛣 Roadmap

Upcoming features include:

- Subscription & Billing
- Advanced Analytics
- Multi-Agent Workflows
- CRM Integrations
- Google Calendar Automation
- Shopify Integration
- HubSpot Integration
- Slack Integration
- Email Automation
- Voice AI
- Mobile Application

---

# 🤝 Contributing

Contributions, feature requests, and bug reports are welcome.

Please open an issue before submitting large pull requests.

---

# 📄 License

This project is licensed under the MIT License.

---

# 👨‍💻 Author

**Nikita Singh**

- GitHub: https://github.com/nikita-singh08
- LinkedIn: https://www.linkedin.com/in/nikita-singh-b981442b4/

---

## ⭐ Support

If you found this project useful, consider giving it a ⭐ on GitHub.
