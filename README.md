# 🚀 Project Kathy Koko

An SMS-native AI Chief of Staff that manages calendars, validates tasks against goals, and ghostwrites emails for a triple-threat lifestyle: Senior MLE (Lyra), Independent Musician (Persephone album), and Homeowner (The Sanctuary).

## ✨ Features (Sprint 1 - MVP Foundation)

- ✅ **SMS Task Intake**: Send a text, Kathy parses it into a structured task using Claude
- ✅ **LLM-Powered Parsing**: Anthropic Claude extracts title, category, priority, due date
- ✅ **Idempotent Processing**: Twilio webhook with <500ms response + async job queue
- ✅ **PostgreSQL + pgvector**: Ready for semantic goal search (Sprint 2)
- ✅ **Bull + Redis**: Reliable job queue for background processing

## 🛠️ Tech Stack

- **Backend**: Node.js + TypeScript + Express
- **Database**: PostgreSQL 16 with pgvector extension
- **Job Queue**: Bull + Redis
- **SMS**: Twilio
- **LLM**: Anthropic Claude Sonnet 4.5
- **Future**: Google Calendar/Gmail API, Spotify for Artists, Meta Ads

## 📋 Prerequisites

- Node.js >= 18
- Docker + Docker Compose (for local PostgreSQL + Redis)
- Twilio account with phone number
- Anthropic API key

## 🚀 Quick Start

### 1. Clone and Install

\`\`\`bash
git clone <repo-url>
cd kathykoko
npm install
\`\`\`

### 2. Setup Environment Variables

\`\`\`bash
cp .env.example .env
\`\`\`

Edit `.env` and fill in:
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- `KATHY_PHONE_NUMBER` (your personal phone number)
- `ANTHROPIC_API_KEY`
- `ENCRYPTION_KEY` (generate with: `openssl rand -hex 32`)

### 3. Start Local Database + Redis

\`\`\`bash
npm run docker:up
\`\`\`

This starts:
- PostgreSQL 16 with pgvector on port 5432
- Redis 7 on port 6379

### 4. Run Database Migrations

The migrations run automatically when PostgreSQL starts (via docker-compose volume mount).

To verify:

\`\`\`bash
docker exec -it kathykoko-postgres psql -U kathykoko -d kathykoko -c "\\dt"
\`\`\`

You should see tables: `user_accounts`, `tasks`, `messages`, `calendar_events`, `emails`, `email_drafts`, `cultivation_goals`, `oauth_tokens`, `health_checkins`, `metrics_snapshots`, `lyra_work_hours`.

### 5. Start Development Server

\`\`\`bash
npm run dev
\`\`\`

Server will start on `http://localhost:3000`

### 6. Expose Webhook to Twilio (for testing)

Use ngrok or similar:

\`\`\`bash
ngrok http 3000
\`\`\`

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

### 7. Configure Twilio Webhook

1. Go to [Twilio Console](https://console.twilio.com/)
2. Navigate to Phone Numbers → Your SMS Number
3. Set "A MESSAGE COMES IN" webhook to: `https://abc123.ngrok.io/webhooks/sms/incoming`
4. Set HTTP method to `POST`

### 8. Test SMS Flow

Send an SMS to your Twilio number:

\`\`\`
"Book studio time for vocals on Friday"
\`\`\`

You should receive:

\`\`\`
Got it! Added: Book studio time for vocals on Friday
\`\`\`

Check the database:

\`\`\`bash
docker exec -it kathykoko-postgres psql -U kathykoko -d kathykoko -c "SELECT * FROM tasks;"
\`\`\`

## 📂 Project Structure

\`\`\`
kathykoko/
├── src/
│   ├── config/              # Database, Redis, API configs
│   ├── controllers/         # HTTP request handlers
│   ├── services/            # Business logic
│   │   ├── ai/              # Claude service
│   │   └── sms/             # Twilio, message parsing
│   ├── repositories/        # Database access layer
│   ├── jobs/                # Bull queue + workers
│   │   ├── queue.ts         # SMS processing queue
│   │   └── workers/         # Async job processors
│   ├── middleware/          # Twilio validation, logging, errors
│   ├── routes/              # API routes
│   ├── types/               # TypeScript types
│   └── migrations/          # SQL schema migrations
├── docker-compose.yml       # Local PostgreSQL + Redis
├── package.json
└── README.md
\`\`\`

## 🧪 Testing

### Health Check

\`\`\`bash
curl http://localhost:3000/health
\`\`\`

### Integration Check

\`\`\`bash
curl http://localhost:3000/health/integrations
\`\`\`

Should return:

\`\`\`json
{
  "status": "ok",
  "integrations": {
    "database": "ok",
    "redis": "ok"
  }
}
\`\`\`

## 🔄 SMS Processing Flow

1. **Webhook (<100ms)**: Twilio → `/webhooks/sms/incoming`
   - Validate signature
   - Check idempotency (MessageSid)
   - Store message in DB (status: `received`)
   - Enqueue Bull job
   - Return TwiML immediately

2. **Async Worker (2-5s)**: Bull processes job
   - Parse SMS with Claude
   - Create task in DB
   - Send confirmation SMS
   - Mark message as `processed`

## 📊 Database Schema

### Key Tables

- **tasks**: Parsed tasks with LLM validation
- **messages**: SMS log with idempotency tracking
- **cultivation_goals**: 2026 goals with pgvector embeddings (Sprint 2)
- **user_accounts**: Google accounts (personal, music, lyra)
- **calendar_events**: Cached Google Calendar events
- **emails**: Gmail metadata with urgency flags
- **oauth_tokens**: Encrypted Google OAuth tokens

## 🚧 Roadmap

- ✅ **Sprint 1**: SMS task intake + LLM parsing (CURRENT)
- 🔜 **Sprint 2**: Goal validation + "The Pushback" (vector search)
- 🔜 **Sprint 3**: Google Calendar integration + auto-blocking
- 🔜 **Sprint 4**: 40-hour killswitch + multi-account support
- 🔜 **Sprint 5**: Email scanning + ghostwriter (3 personas)
- 🔜 **Sprint 6**: Scheduled jobs (7:30 AM briefings, 8 PM check-ins)
- 🔜 **Sprint 7**: Production deployment to Railway

## 🛑 Common Issues

### "Missing required environment variables"
- Check `.env` file exists and has all required vars from `.env.example`

### "PostgreSQL pool error"
- Ensure Docker containers are running: `docker ps`
- Restart: `npm run docker:down && npm run docker:up`

### "Twilio signature validation failed"
- Ensure webhook URL is HTTPS (ngrok)
- Check `TWILIO_AUTH_TOKEN` is correct

### "Claude API error"
- Verify `ANTHROPIC_API_KEY` is valid
- Check API usage limits on Anthropic dashboard

## 📝 Environment Variables Reference

See `.env.example` for full list. Required for Sprint 1:

- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- `KATHY_PHONE_NUMBER`: Your personal phone
- `ANTHROPIC_API_KEY`: Claude API key
- `ENCRYPTION_KEY`: 32-byte hex for OAuth token encryption

## 🤝 Contributing

This is a personal project, but feedback welcome! Open an issue or PR.

## 📄 License

MIT

---

**Built with ❤️ by Kathy Koko** - Your AI Chief of Staff
