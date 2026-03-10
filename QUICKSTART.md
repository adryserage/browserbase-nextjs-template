# Quick Start Guide

Get the Canadian Subsidy Scraper running in under 10 minutes.

## Prerequisites Checklist

- [ ] Node.js 18+ installed
- [ ] Git installed  
- [ ] Google account (for Gemini API)
- [ ] Database option chosen (Vercel Postgres recommended for simplicity)

## 5-Minute Local Setup

### 1. Clone and Install (2 minutes)

```bash
# Clone repository
git clone <your-repo-url>
cd browserbase-nextjs-template

# Install dependencies
npm install

# Install worker dependencies
cd worker
npm install
cd ..
```

### 2. Set Up Database (1 minute)

**Option A: Local PostgreSQL** (for testing)
```bash
# macOS (via Homebrew)
brew install postgresql@14
brew services start postgresql@14
createdb subsidy_scraper

# Ubuntu/Debian
sudo apt-get install postgresql
sudo -u postgres createdb subsidy_scraper

# Set connection string
export POSTGRES_URL="postgresql://localhost:5432/subsidy_scraper"
```

**Option B: Vercel Postgres** (for production)
```bash
npm i -g vercel
vercel login
vercel storage create postgres subsidy-scraper
# Copy connection string from output
```

### 3. Get Gemini API Key (1 minute)

```bash
# Visit: https://makersuite.google.com/app/apikey
# Click "Create API Key"
# Copy the key (starts with AIza...)
```

### 4. Configure Environment (30 seconds)

```bash
# Create environment file
cp .env.example .env.local

# Edit .env.local
# Add your Gemini key and database URL
```

### 5. Initialize Database (30 seconds)

```bash
# Generate Prisma client
npm run db:generate

# Create database tables
npm run db:push
```

### 6. Start Services (1 minute)

**Terminal 1** - Frontend:
```bash
npm run dev
```

**Terminal 2** - Worker (for testing):
```bash
cd worker
npm start
```

**Terminal 3** - Test scraping (optional):
```bash
# Start a test job
curl -X POST http://localhost:3000/api/scrape/start \
  -H "Content-Type: application/json" \
  -d '{"mode": "full"}'
```

## Test Scraping (Small Sample)

Before running the full 8-hour scrape, test with a small sample:

### Modify Worker for Testing

Edit `worker/scraper.ts`, find the `getSubsidyList()` method and add:

```typescript
const items: SubsidyListItem[] = listData.programs
  .filter(p => p.hasMoreInfo)
  .map((p, idx) => ({
    text: p.name,
    index: idx,
  }))
  .slice(0, 10); // Only scrape first 10 items for testing
```

Run worker:
```bash
cd worker
npm start
```

Expected output:
```
🤖 Canadian Subsidy Scraper Worker
==================================================
Found 10 subsidy programs to scrape
[1/10] Scraping: Clean Technology Program
  ✓ Successfully scraped: Clean Technology Program
[2/10] Scraping: Innovation Vouchers
  ✓ Successfully scraped: Innovation Vouchers
...
✅ Scraping completed!
   Total: 10
   Completed: 10
   Failed: 0
   Duration: 0h 3m 45s
```

### Verify in Database

```bash
psql $POSTGRES_URL

# Check scraped data
SELECT COUNT(*) FROM subsidies;
# Should show 10

SELECT program_name, last_scraped_at 
FROM subsidies 
ORDER BY last_scraped_at DESC 
LIMIT 5;
```

## Production Deployment (15 minutes)

### 1. Deploy Frontend to Vercel (5 minutes)

```bash
# From project root
vercel

# Follow prompts:
# - Link to existing project or create new
# - Set project name
# - Deploy

# Add environment variables in Vercel dashboard:
vercel env add GOOGLE_GENERATIVE_AI_API_KEY
vercel env add POSTGRES_URL

# Redeploy
vercel --prod
```

### 2. Deploy Worker to Railway (5 minutes)

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Create new project
cd worker
railway init

# Add environment variables
railway variables set POSTGRES_URL="your_database_url"
railway variables set PARALLEL_WORKERS=3
railway variables set TARGET_URL="https://innovation.ised-isde.canada.ca/innovation/s/list-liste?language=fr_CA&token=a0BMm00000612cDMAQ"

# Deploy
railway up

# Monitor
railway logs
```

### 3. Start Full Scrape (5 minutes setup, 8 hours execution)

```bash
# Remove the .slice(0, 10) from worker/scraper.ts
# Commit and push changes
git add worker/scraper.ts
git commit -m "Enable full scraping"
git push

# Redeploy worker
railway up

# Or trigger via API
curl -X POST https://your-app.vercel.app/api/scrape/start \
  -H "Content-Type: application/json" \
  -d '{"mode": "full"}'
```

## Monitoring Your Scrape

### Check Progress via API

```bash
# Get job status
curl https://your-app.vercel.app/api/scrape/status/JOB_ID

# Response:
{
  "status": "running",
  "progress": {
    "completed": 342,
    "total": 1500,
    "percentage": 22.8
  },
  "estimatedRemainingTime": "6h 15m"
}
```

### View Worker Logs

**Railway:**
```bash
railway logs --tail
```

**Or in Railway dashboard**: 
- Go to your project
- Click on deployment
- View "Logs" tab

### Check Database

```bash
# Connect to database
psql $POSTGRES_URL

# View recent activity
SELECT 
  s.program_name,
  s.last_scraped_at,
  EXTRACT(EPOCH FROM (NOW() - s.last_scraped_at)) as seconds_ago
FROM subsidies s
ORDER BY s.last_scraped_at DESC
LIMIT 10;

# Count total scraped
SELECT COUNT(*) as total_subsidies FROM subsidies;

# Check job status
SELECT 
  id,
  status,
  completed_items,
  total_items,
  ROUND(100.0 * completed_items / NULLIF(total_items, 0), 1) as progress_pct
FROM scrape_jobs
ORDER BY started_at DESC
LIMIT 5;
```

## Troubleshooting

### Worker Won't Start

**Error**: `Module not found`
```bash
cd worker
npm install
npm start
```

**Error**: `Database connection failed`
```bash
# Test connection
psql $POSTGRES_URL

# If fails, check:
# 1. Database is running
# 2. Connection string is correct
# 3. Firewall allows connection
```

### Scraping Fails Immediately

**Check website accessibility**:
```bash
curl -I https://innovation.ised-isde.canada.ca/innovation/s/list-liste
```

**If blocked**: Website may require cookies/headers. Update worker:
```typescript
await page.goto(url, {
  waitUntil: "networkidle",
  timeout: 60000,
  // Add headers if needed
});
```

### Worker Runs Out of Memory

**Symptom**: Worker crashes after 100-200 items

**Solutions**:
1. Reduce parallel workers: `PARALLEL_WORKERS=1`
2. Increase delay: `SCRAPE_DELAY_MS=3000`
3. Upgrade Railway plan (more RAM)
4. Add garbage collection:
```typescript
// In scraper loop
if (i % 50 === 0) {
  if (global.gc) global.gc();
}
```

### Timeouts / Slow Loading

**Increase timeouts** in `worker/scraper.ts`:
```typescript
await page.goto(url, {
  waitUntil: "networkidle",
  timeout: 90000,  // 90 seconds instead of 60
});

await page.waitForTimeout(5000);  // 5 seconds instead of 2
```

### Database Connection Pooling

If seeing "too many connections":

```typescript
// Add to worker/scraper.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.POSTGRES_URL,
    },
  },
  // Limit connections
  connectionLimit: 5,
});
```

## Common Commands Reference

### Development
```bash
npm run dev              # Start Next.js dev server
npm run worker:dev       # Start worker in watch mode
npm run db:generate      # Regenerate Prisma client
npm run db:push          # Push schema changes to DB
```

### Production
```bash
npm run build            # Build Next.js app
npm start                # Start production server
cd worker && npm start   # Start worker process
```

### Database
```bash
psql $POSTGRES_URL                    # Connect to database
npm run db:migrate                    # Create migration
npx prisma studio                     # Open database GUI
```

### Deployment
```bash
vercel --prod                         # Deploy frontend
railway up                            # Deploy worker
railway logs --tail                   # View logs
```

## Next Steps

1. ✅ Complete local setup
2. ✅ Test with 10 items
3. ✅ Deploy to production
4. ⏳ Run full 8-hour scrape
5. 📊 Build dashboard UI
6. 🤖 Add Gemini report generation
7. 🔄 Set up scheduled re-scraping

## Getting Help

- **Architecture questions**: See [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Deployment issues**: See [DEPLOYMENT.md](./DEPLOYMENT.md)
- **How it works**: See [SOLUTION.md](./SOLUTION.md)
- **Database schema**: See [prisma/schema.prisma](./prisma/schema.prisma)

## Success Criteria

You'll know everything is working when:

1. ✅ Worker starts without errors
2. ✅ First subsidy scraped successfully
3. ✅ Data appears in database
4. ✅ Progress updates in logs
5. ✅ Job completes (8-10 hours later)
6. ✅ All 1,500+ subsidies in database

Estimated time from scratch to first successful scrape: **30 minutes**

Estimated time to complete full scrape: **8-10 hours** (mostly waiting)
