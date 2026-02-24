# Canadian Subsidy Scraper & Report Generator

A scalable web scraping system for extracting and analyzing 1,500+ Canadian government subsidy programs using Stagehand + Playwright and Gemini AI.

## 🎯 Purpose

This application scrapes the [Canadian Innovation Program Database](https://innovation.ised-isde.canada.ca/innovation/s/list-liste?language=fr_CA) to:
- Extract structured data from 1,500+ subsidy programs
- Build auditable evidence packets (eligibility, amounts, deadlines)
- Detect changes over time
- Generate AI-powered eligibility reports using Gemini 1.5 Pro

## ⚠️ Challenge: Long-Running Scraping

The target website:
- Uses **Salesforce Community Cloud** with dynamic JavaScript loading
- Requires **click-and-wait interactions** for each subsidy
- Contains **1,500+ programs** to scrape
- Takes **8+ hours** to process completely

**Solution**: Background worker architecture with job queue, progress tracking, and automatic retry.

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│   Frontend (Next.js on Vercel)     │
│   - Dashboard                       │
│   - Job management                  │
│   - Search/filter subsidies         │
│   - Generate reports                │
└──────────┬──────────────────────────┘
           │
┌──────────┴──────────────────────────┐
│   API Routes (Vercel Functions)    │
│   - /api/scrape/start               │
│   - /api/scrape/status/[jobId]      │
│   - /api/subsidies                  │
│   - /api/subsidies/[id]/report      │
└──────────┬──────────────────────────┘
           │
┌──────────┴──────────────────────────┐
│   Worker (Railway/Render/Fly.io)   │
│   - Long-running scraping process  │
│   - Stagehand + local Playwright   │
│   - Parallel processing             │
│   - Auto-retry & checkpoints        │
└──────────┬──────────────────────────┘
           │
┌──────────┴──────────────────────────┐
│   Database (Postgres)               │
│   - Scrape jobs & progress          │
│   - Subsidy evidence packets        │
│   - Change detection history        │
│   - Generated reports cache         │
└─────────────────────────────────────┘
```

## 📚 Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Detailed system design, options, and rationale
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Step-by-step deployment guide
- **[prisma/schema.prisma](./prisma/schema.prisma)** - Database schema

## ✨ Features

### Scraping Engine
- **Click-based interaction** with dynamic Salesforce UI
- **Parallel processing** (configurable workers)
- **Automatic retry** with exponential backoff
- **Progress checkpointing** for resume capability
- **Change detection** via content hashing
- **Failed item tracking** for manual review

### Evidence Packets
Each subsidy is stored as a structured evidence packet:
- Program name (English/French)
- Eligibility criteria
- Funding amounts (min/max)
- Application steps
- Deadlines
- Target audience & sectors
- Provinces covered
- Raw HTML for audit trail

### AI Report Generation
- **Gemini 1.5 Pro** with 1M token context window
- Citation-backed eligibility assessments
- Value estimates
- Application guidance
- Deadline tracking
- Report caching for efficiency

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Google Gemini API key
- Worker hosting (Railway, Render, or Fly.io)

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd browserbase-nextjs-template
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_key
POSTGRES_URL=postgresql://...
```

### 3. Set Up Database

```bash
npm run db:generate
npm run db:push
```

### 4. Test Locally

```bash
# Frontend
npm run dev

# Worker (in separate terminal)
cd worker
npm install
npm start
```

### 5. Deploy (See [DEPLOYMENT.md](./DEPLOYMENT.md))

1. Deploy frontend to Vercel
2. Deploy worker to Railway/Render/Fly.io
3. Start initial scrape (8-10 hours)
4. Monitor progress via API

## 📊 Usage

### Start Scraping Job

```bash
curl -X POST https://your-app.vercel.app/api/scrape/start \
  -H "Content-Type: application/json" \
  -d '{"mode": "full"}'

# Response:
# {
#   "jobId": "job_...",
#   "status": "queued",
#   "estimatedDuration": "8-10 hours"
# }
```

### Check Progress

```bash
curl https://your-app.vercel.app/api/scrape/status/job_...

# Response:
# {
#   "status": "running",
#   "progress": {
#     "completed": 342,
#     "total": 1500,
#     "percentage": 22.8
#   },
#   "estimatedRemainingTime": "6h 15m"
# }
```

### Generate Report

```bash
curl -X POST https://your-app.vercel.app/api/subsidies/SUBSIDY_ID/report

# Response: Detailed Gemini-generated eligibility report
```

## 🛠️ Tech Stack

### Frontend & API
- **Framework**: Next.js 15 with React 19 and TypeScript
- **Styling**: Tailwind CSS 4
- **Database ORM**: Prisma
- **Deployment**: Vercel

### Scraping Engine
- **Automation**: [Stagehand](https://stagehand.dev) with local Playwright
- **Extraction**: AI-powered structured data extraction with Zod schemas
- **Runtime**: Node.js 18+

### AI & Storage
- **AI Model**: Google Gemini 1.5 Pro (1M token context, 65k output)
- **Database**: PostgreSQL (Vercel Postgres, Supabase, or PlanetScale)
- **Queue**: Redis/Vercel KV (optional)

### Infrastructure
- **Frontend**: Vercel
- **Worker**: Railway, Render, or Fly.io
- **Database**: Managed PostgreSQL
- **Monitoring**: Worker logs + database queries

## 💰 Cost Estimate

### Development (Free Tier)
- Vercel: $0 (Hobby plan)
- Supabase: $0 (500MB)
- Railway: $5/month (Starter)
- Gemini API: ~$1-2/month
- **Total: ~$6-7/month**

### Production
- Vercel Pro: $20/month
- Vercel Postgres: $10/month (256MB)
- Railway: $10/month (1GB RAM)
- Gemini API: ~$5/month
- **Total: ~$45/month**

## 📈 Performance

- **Initial Scrape**: 8-10 hours for all 1,500+ subsidies
- **Per-item Time**: ~15-20 seconds average
- **Parallel Processing**: 3-5 workers (configurable)
- **Success Rate**: ~95% (with automatic retry)
- **Incremental Update**: 1-2 hours (changed items only)

## 🔧 Configuration

### Worker Settings

```env
PARALLEL_WORKERS=3        # Number of concurrent browsers
RETRY_ATTEMPTS=3          # Retries per failed item
SCRAPE_DELAY_MS=2000      # Delay between items (ms)
```

**Trade-offs:**
- More workers = faster completion but higher RAM usage
- Higher delay = more reliable but slower
- More retries = better success rate but longer duration

## 🐛 Troubleshooting

### Worker Crashes
- **Cause**: Out of memory
- **Solution**: Upgrade worker instance or reduce `PARALLEL_WORKERS`

### Timeout Errors
- **Cause**: Slow page load
- **Solution**: Increase timeouts in `worker/scraper.ts`

### Salesforce Blocking
- **Cause**: Too many requests
- **Solution**: Reduce workers to 1, increase delay to 5000ms

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed troubleshooting.

## 📅 Maintenance

### Incremental Updates

Run weekly to detect changes:

```bash
curl -X POST https://your-app.vercel.app/api/scrape/start \
  -d '{"mode": "incremental"}'
```

### Full Re-scrape

Run monthly for comprehensive refresh:

```bash
curl -X POST https://your-app.vercel.app/api/scrape/start \
  -d '{"mode": "full"}'
```

## 🤝 Contributing

This is a specialized scraping system for Canadian subsidies. Contributions welcome for:
- Performance optimizations
- Better error handling
- UI improvements
- Report generation enhancements

## 📄 License

MIT

## 🙏 Acknowledgments

- [Stagehand](https://stagehand.dev) - AI-powered browser automation
- [Vercel](https://vercel.com) - Hosting and deployment
- [Google Gemini](https://ai.google.dev/) - AI report generation
- Canadian Innovation Programs Database - Data source
