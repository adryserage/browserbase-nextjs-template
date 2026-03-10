# Deployment Guide: Canadian Subsidy Scraper

This guide explains how to deploy the long-running subsidy scraper that processes 1,500+ items over 8+ hours.

## Architecture Overview

The system consists of three main components:

1. **Next.js Frontend + API** (Vercel) - Dashboard, job management, report generation
2. **Worker Process** (Railway/Render/Fly.io) - Long-running scraping job
3. **Database** (Vercel Postgres/Supabase) - Evidence packet storage

## Prerequisites

- Node.js 18+ installed locally
- Git installed
- Vercel account (free tier OK for testing)
- Railway/Render/Fly.io account (free tier OK)
- Google Cloud account for Gemini API key

## Step 1: Get API Keys

### Gemini API Key
1. Visit https://makersuite.google.com/app/apikey
2. Sign in with Google account
3. Click "Create API Key"
4. Copy the key (starts with `AIza...`)

### Database Setup (Choose One)

#### Option A: Vercel Postgres
```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Create database
vercel storage create postgres subsidy-db

# Get connection string
vercel env pull .env.local
```

#### Option B: Supabase (Free 500MB)
1. Visit https://supabase.com
2. Create new project
3. Go to Settings > Database
4. Copy "Connection string" (URI format)
5. Replace password with your actual password

## Step 2: Deploy Frontend to Vercel

```bash
# Clone the repository
git clone <your-repo-url>
cd browserbase-nextjs-template

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local

# Edit .env.local with your values
# GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
# POSTGRES_URL=your_database_url_here

# Test locally
npm run dev
# Visit http://localhost:3000

# Deploy to Vercel
vercel

# Add environment variables in Vercel dashboard:
# - GOOGLE_GENERATIVE_AI_API_KEY
# - POSTGRES_URL
```

## Step 3: Set Up Database Schema

```bash
# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Verify tables created
# Check your database dashboard
```

## Step 4: Deploy Worker Process

### Option A: Railway (Recommended)

1. **Install Railway CLI**
```bash
npm i -g @railway/cli
railway login
```

2. **Create Railway Project**
```bash
cd worker
railway init
```

3. **Set Environment Variables**
```bash
railway variables set POSTGRES_URL="your_database_url"
railway variables set PARALLEL_WORKERS=3
railway variables set RETRY_ATTEMPTS=3
railway variables set SCRAPE_DELAY_MS=2000
railway variables set TARGET_URL="https://innovation.ised-isde.canada.ca/innovation/s/list-liste?language=fr_CA&token=a0BMm00000612cDMAQ"
```

4. **Create Dockerfile**
```dockerfile
# worker/Dockerfile
FROM node:18-slim

# Install dependencies for Playwright
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Run the worker
CMD ["npm", "start"]
```

5. **Deploy**
```bash
railway up
```

6. **Monitor Logs**
```bash
railway logs
```

### Option B: Render.com

1. Go to https://render.com
2. Click "New" > "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: subsidy-scraper-worker
   - **Environment**: Node
   - **Build Command**: `cd worker && npm install`
   - **Start Command**: `cd worker && npm start`
   - **Instance Type**: Starter (512MB RAM) or higher
5. Add environment variables (same as Railway)
6. Click "Create Web Service"

### Option C: Fly.io

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
flyctl auth login

# Navigate to worker directory
cd worker

# Initialize
flyctl launch
# Choose a name: subsidy-worker
# Choose a region close to your database

# Edit fly.toml to add environment variables:
[env]
  PARALLEL_WORKERS = "3"
  RETRY_ATTEMPTS = "3"
  SCRAPE_DELAY_MS = "2000"

# Add secrets (sensitive data)
flyctl secrets set POSTGRES_URL="your_database_url"

# Deploy
flyctl deploy

# Monitor
flyctl logs
```

## Step 5: Run Initial Scrape

### Manual Trigger (Development)

```bash
# SSH into worker
railway run bash  # or render ssh, or flyctl ssh console

# Run scraper
npm start

# Or with custom config
JOB_ID=initial_scrape SCRAPE_MODE=sequential npm start
```

### API Trigger (Production)

```bash
# Start a new scraping job
curl -X POST https://your-vercel-app.vercel.app/api/scrape/start \
  -H "Content-Type: application/json" \
  -d '{"mode": "full"}'

# Response:
# {
#   "jobId": "job_1234567890_abc123",
#   "status": "queued",
#   "estimatedDuration": "8-10 hours"
# }

# Check status
curl https://your-vercel-app.vercel.app/api/scrape/status/job_1234567890_abc123
```

## Step 6: Monitor Progress

### Check Worker Logs

**Railway:**
```bash
railway logs --tail
```

**Render:**
- Visit Render dashboard > Your service > Logs

**Fly.io:**
```bash
flyctl logs
```

### Check Database

```bash
# Connect to database
psql $POSTGRES_URL

# Check job status
SELECT * FROM scrape_jobs ORDER BY started_at DESC LIMIT 5;

# Check subsidy count
SELECT COUNT(*) FROM subsidies;

# Check recent subsidies
SELECT program_name, last_scraped_at FROM subsidies ORDER BY last_scraped_at DESC LIMIT 10;
```

## Step 7: Verify Results

Once scraping completes:

```bash
# Query all subsidies
curl https://your-vercel-app.vercel.app/api/subsidies

# Generate a report for specific subsidy
curl -X POST https://your-vercel-app.vercel.app/api/subsidies/SUBSIDY_ID/report
```

## Cost Breakdown

### Minimum (Free Tier)
- **Vercel**: $0 (Hobby plan - 100GB bandwidth)
- **Supabase**: $0 (500MB database)
- **Railway**: $5/month (Starter plan - 512MB RAM)
- **Gemini API**: ~$0-2/month (for report generation only)
- **Total**: ~$5-7/month

### Recommended (Production)
- **Vercel Pro**: $20/month (unlimited functions)
- **Vercel Postgres**: $10/month (256MB)
- **Railway**: $10/month (1GB RAM)
- **Gemini API**: ~$5/month
- **Total**: ~$45/month

## Optimization Strategies

### 1. Parallel Processing

Increase workers for faster scraping (requires more RAM):

```bash
# Railway/Render/Fly.io
railway variables set PARALLEL_WORKERS=5
```

**Trade-off**: Higher RAM usage, faster completion (5-6 hours vs 8-10 hours)

### 2. Incremental Updates

After initial scrape, only update changed subsidies:

```bash
# Run weekly cron job
curl -X POST https://your-app.vercel.app/api/scrape/start \
  -d '{"mode": "incremental"}'
```

### 3. Resume from Checkpoint

If scraping fails midway:

```bash
# Worker automatically saves checkpoints every 10 items
# On restart, it will resume from last checkpoint
npm start  # Automatically resumes if checkpoint exists
```

### 4. Rate Limiting

Reduce server load by adjusting delay:

```bash
railway variables set SCRAPE_DELAY_MS=3000  # 3 seconds between items
```

## Troubleshooting

### Worker Crashes

**Symptom**: Worker stops after a few minutes

**Solution**:
1. Check memory usage (might need larger instance)
2. Review logs for specific errors
3. Increase `RETRY_ATTEMPTS` for flaky connections
4. Add more delays between requests

### Timeout Errors

**Symptom**: "Navigation timeout" or "waitForTimeout" errors

**Solution**:
```typescript
// In scraper.ts, increase timeouts:
await page.goto(url, { 
  waitUntil: "networkidle", 
  timeout: 90000  // Increase from 60s to 90s
});
```

### Database Connection Errors

**Symptom**: "Connection refused" or "Too many connections"

**Solution**:
1. Check database connection string
2. Verify database is not paused (Supabase auto-pauses after 7 days inactivity)
3. Check connection pool limits in Prisma schema

### Salesforce Blocking

**Symptom**: "Access denied" or CAPTCHA challenges

**Solution**:
1. Reduce `PARALLEL_WORKERS` to 1 (sequential processing)
2. Increase `SCRAPE_DELAY_MS` to 5000 (5 seconds)
3. Add random delays:
```typescript
await page.waitForTimeout(2000 + Math.random() * 2000);
```

## Monitoring & Alerts

### Set Up Alerts

**Railway:**
```bash
# Configure in Railway dashboard > Settings > Notifications
# Alert on: Memory usage > 80%, Worker restarts
```

**Vercel:**
```bash
# Go to Vercel dashboard > Integrations
# Add: Slack, Discord, or email notifications
```

### Health Checks

Create a health endpoint in worker:

```typescript
// worker/health.ts
import express from 'express';
const app = express();

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

app.listen(process.env.PORT || 3000);
```

## Scheduled Re-scraping

### Option 1: Vercel Cron

```typescript
// app/api/cron/rescrape/route.ts
export const runtime = 'edge';

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Trigger incremental scrape
  await fetch(`${process.env.VERCEL_URL}/api/scrape/start`, {
    method: 'POST',
    body: JSON.stringify({ mode: 'incremental' })
  });

  return Response.json({ ok: true });
}
```

Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/rescrape",
    "schedule": "0 0 * * 0"  // Every Sunday at midnight
  }]
}
```

### Option 2: Railway Cron

Add to `railway.toml`:
```toml
[build]
  command = "npm install"

[deploy]
  startCommand = "npm start"
  
[cron]
  schedule = "0 0 * * 0"
  command = "npm start"
```

## Next Steps

1. **Initial Scrape**: Run the full scrape once (8-10 hours)
2. **Validate Data**: Check database for completeness
3. **Test Reports**: Generate Gemini reports for sample subsidies
4. **Set Up Monitoring**: Configure alerts and health checks
5. **Schedule Updates**: Set up weekly incremental scrapes
6. **Build UI**: Create dashboard for browsing subsidies

## Support

For issues or questions:
1. Check worker logs first
2. Verify database connectivity
3. Review this deployment guide
4. Check GitHub issues for similar problems
