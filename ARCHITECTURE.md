# Scalable Subsidy Scraper Architecture

## Problem Statement

The Canadian Innovation subsidies website (`innovation.ised-isde.canada.ca`) contains:
- **1,500+** subsidy programs requiring scraping
- **8+ hours** of total processing time (tested)
- **Salesforce Community Cloud** with dynamic JavaScript loading
- **Interactive list UI** requiring click-and-wait patterns
- **Real-time data generation** after each click

## Architectural Challenges

### 1. Serverless Limitations
- **Current Setup**: Vercel Functions (300s max timeout)
- **Problem**: Cannot run 8+ hour scraping job in single serverless function
- **Solution**: Background worker architecture with queue system

### 2. Scale & Duration
- **Problem**: Processing 1,500+ items sequentially takes too long
- **Solution**: Batch processing with parallelization where safe

### 3. Click-Based Interaction
- **Problem**: Each subsidy requires clicking list item, waiting for data load
- **Solution**: Stagehand's action capabilities with smart wait strategies

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                  │
│  - Dashboard UI                                             │
│  - Progress tracking                                        │
│  - Subsidy search/filter                                    │
│  - Report generation UI                                     │
└────────────┬────────────────────────────────────────────────┘
             │
             ├─ POST /api/scrape/start → Queue job
             ├─ GET  /api/scrape/status → Check progress
             ├─ GET  /api/subsidies → List all subsidies
             └─ POST /api/subsidies/[id]/report → Generate report
             │
┌────────────┴────────────────────────────────────────────────┐
│                   Vercel API Routes                         │
│  - Job queueing                                             │
│  - Status queries                                           │
│  - Data retrieval                                           │
│  - Gemini report generation                                 │
└────────────┬────────────────────────────────────────────────┘
             │
        Queue System
     (Vercel KV/Redis)
             │
┌────────────┴────────────────────────────────────────────────┐
│              Background Worker Process                      │
│  (Railway, Render, or dedicated server)                     │
│                                                             │
│  - Long-running Node.js process                            │
│  - Poll queue for jobs                                      │
│  - Execute Stagehand scraping                              │
│  - Handle retries & errors                                  │
│  - Save evidence packets                                    │
└────────────┬────────────────────────────────────────────────┘
             │
┌────────────┴────────────────────────────────────────────────┐
│                    Database Layer                           │
│         (Vercel Postgres / Supabase / PlanetScale)         │
│                                                             │
│  Tables:                                                    │
│  - scrape_jobs (status, progress, created_at)              │
│  - subsidies (all evidence packet data)                     │
│  - subsidy_snapshots (historical for change detection)     │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Strategy

### Option A: Vercel + External Worker (Recommended)

**Components:**
1. **Next.js Frontend** (Vercel)
   - Dashboard for scraping status
   - Subsidy search interface
   - Report generation UI

2. **Vercel KV** (Redis)
   - Job queue management
   - Progress tracking
   - Real-time updates

3. **Vercel Postgres** (or Supabase)
   - Evidence packet storage
   - Subsidy metadata
   - Change detection history

4. **Worker Service** (Railway/Render/Fly.io)
   - Long-running Node.js process
   - Stagehand + Playwright scraping
   - Processes 1-10 subsidies in parallel
   - Automatic retry on failures

**Deployment Flow:**
```bash
# Frontend + API
vercel deploy

# Worker (separate deployment)
railway up  # or render deploy, or fly deploy
```

### Option B: Batch Processing with Cron

**Components:**
1. **Vercel Cron Jobs** (hourly)
   - Process 50 subsidies per hour
   - Store state in database
   - Resume from last position
   - Complete full scrape in ~30 hours

2. **Incremental Updates**
   - Check each subsidy's last_scraped timestamp
   - Only re-scrape if > 7 days old
   - Prioritize subsidies with upcoming deadlines

**Trade-offs:**
- ✅ Simpler deployment (no external worker)
- ✅ Stays within Vercel ecosystem
- ❌ Slower initial scrape (30 hours vs 8 hours)
- ❌ Less real-time (batched updates)

### Option C: Hybrid Approach (Best of Both)

**Initial Scrape:**
- Use external worker for one-time 8-hour scrape
- Store all evidence packets in database

**Ongoing Updates:**
- Vercel Cron (daily or weekly)
- Re-validate changed subsidies only
- Full re-scrape monthly

## Database Schema

```typescript
// scrape_jobs table
interface ScrapeJob {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  total_items: number;
  completed_items: number;
  failed_items: number;
  started_at: Date;
  completed_at?: Date;
  error_message?: string;
}

// subsidies table (evidence packets)
interface Subsidy {
  id: string;
  program_name: string;
  url: string;
  language: 'en' | 'fr';
  
  // Extracted data
  eligibility_criteria: string[];
  min_amount?: number;
  max_amount?: number;
  funding_type: string;
  application_steps: string[];
  deadline_date?: Date;
  deadline_text: string;
  
  // Metadata
  content_hash: string;  // For change detection
  first_scraped_at: Date;
  last_scraped_at: Date;
  scrape_count: number;
  
  // Raw evidence
  raw_html?: string;  // Optional, for audit trail
}

// subsidy_snapshots (change history)
interface SubsidySnapshot {
  id: string;
  subsidy_id: string;
  content_hash: string;
  changes_detected: string[];  // What changed
  scraped_at: Date;
  previous_snapshot_id?: string;
}
```

## Scraping Implementation

### Worker Process Structure

```typescript
// worker/scraper.ts
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

const SubsidySchema = z.object({
  program_name: z.string(),
  eligibility_criteria: z.array(z.string()),
  min_amount: z.number().optional(),
  max_amount: z.number().optional(),
  funding_type: z.string(),
  application_steps: z.array(z.string()),
  deadline_text: z.string(),
});

async function scrapeAllSubsidies() {
  const stagehand = new Stagehand({
    env: "LOCAL",  // No Browserbase needed
    verbose: 1,
  });
  
  await stagehand.init();
  const page = stagehand.page;
  
  // Navigate to listing page
  await page.goto('https://innovation.ised-isde.canada.ca/...');
  
  // Extract list of subsidy links
  const subsidyLinks = await stagehand.extract(
    "Extract all subsidy program links from the list",
    z.object({
      links: z.array(z.object({
        text: z.string(),
        url: z.string(),
      }))
    })
  );
  
  console.log(`Found ${subsidyLinks.links.length} subsidies`);
  
  // Process each subsidy
  for (let i = 0; i < subsidyLinks.links.length; i++) {
    const link = subsidyLinks.links[i];
    
    try {
      console.log(`[${i+1}/${subsidyLinks.links.length}] ${link.text}`);
      
      // Click the list item
      await stagehand.act(`Click on the subsidy titled "${link.text}"`);
      
      // Wait for content to load
      await page.waitForTimeout(3000);
      
      // Extract subsidy details
      const details = await stagehand.extract(
        "Extract all subsidy program details",
        SubsidySchema
      );
      
      // Save to database
      await saveSubsidy({
        ...details,
        url: page.url(),
        language: 'fr',
      });
      
      // Update progress
      await updateJobProgress(i + 1, subsidyLinks.links.length);
      
      // Navigate back to list
      await page.goBack();
      await page.waitForTimeout(2000);
      
    } catch (error) {
      console.error(`Failed to scrape ${link.text}:`, error);
      await logFailedItem(link, error);
    }
  }
  
  await stagehand.close();
}
```

### Optimization Strategies

1. **Parallel Processing**
   ```typescript
   // Run 5 browsers in parallel
   const workers = 5;
   const chunks = chunkArray(subsidyLinks, Math.ceil(subsidyLinks.length / workers));
   
   await Promise.all(
     chunks.map((chunk, idx) => 
       scrapeChunk(chunk, idx)
     )
   );
   ```

2. **Smart Retries**
   ```typescript
   async function scrapeWithRetry(link: Link, maxRetries = 3) {
     for (let attempt = 1; attempt <= maxRetries; attempt++) {
       try {
         return await scrapeSingleSubsidy(link);
       } catch (error) {
         if (attempt === maxRetries) throw error;
         await sleep(1000 * attempt);  // Exponential backoff
       }
     }
   }
   ```

3. **Progress Checkpointing**
   ```typescript
   // Save progress every 10 items
   if (i % 10 === 0) {
     await saveCheckpoint({
       lastProcessedIndex: i,
       lastProcessedId: link.id,
     });
   }
   
   // Resume from checkpoint on restart
   const checkpoint = await loadCheckpoint();
   const startIndex = checkpoint?.lastProcessedIndex ?? 0;
   ```

4. **Change Detection**
   ```typescript
   import crypto from 'crypto';
   
   function calculateContentHash(data: any): string {
     const content = JSON.stringify(data, Object.keys(data).sort());
     return crypto.createHash('sha256').update(content).digest('hex');
   }
   
   async function detectChanges(subsidyId: string, newData: any) {
     const existing = await db.subsidies.findUnique({ where: { id: subsidyId } });
     if (!existing) return { isNew: true, changes: [] };
     
     const newHash = calculateContentHash(newData);
     if (newHash === existing.content_hash) {
       return { isNew: false, changes: [] };
     }
     
     // Detect specific changes
     const changes = [];
     if (newData.deadline_text !== existing.deadline_text) {
       changes.push('deadline_changed');
     }
     if (newData.max_amount !== existing.max_amount) {
       changes.push('amount_changed');
     }
     
     return { isNew: false, changes };
   }
   ```

## API Endpoints

### Start Scraping Job
```typescript
// app/api/scrape/start/route.ts
export async function POST(req: Request) {
  const { mode } = await req.json();
  // mode: 'full' | 'incremental' | 'specific'
  
  const jobId = generateId();
  
  // Queue the job
  await redis.lpush('scrape_queue', JSON.stringify({
    id: jobId,
    mode,
    created_at: new Date(),
  }));
  
  // Create job record
  await db.scrape_jobs.create({
    data: {
      id: jobId,
      status: 'queued',
      total_items: mode === 'full' ? 1500 : null,
    }
  });
  
  return Response.json({ jobId, status: 'queued' });
}
```

### Check Job Status
```typescript
// app/api/scrape/status/[jobId]/route.ts
export async function GET(
  req: Request,
  { params }: { params: { jobId: string } }
) {
  const job = await db.scrape_jobs.findUnique({
    where: { id: params.jobId }
  });
  
  return Response.json({
    status: job.status,
    progress: {
      completed: job.completed_items,
      total: job.total_items,
      percentage: (job.completed_items / job.total_items) * 100,
    },
    started_at: job.started_at,
    estimated_completion: estimateCompletion(job),
  });
}
```

### Generate Subsidy Report
```typescript
// app/api/subsidies/[id]/report/route.ts
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const subsidy = await db.subsidies.findUnique({
    where: { id: params.id }
  });
  
  const { text } = await generateText({
    model: google('models/gemini-1.5-pro'),  // 1M token context
    prompt: `Generate a comprehensive subsidy eligibility report.
    
Program: ${subsidy.program_name}

Evidence Packet:
${JSON.stringify(subsidy, null, 2)}

Generate a report with:
1. Eligibility Assessment (who qualifies)
2. Value Estimation (min/max amounts)
3. Application Steps (detailed process)
4. Deadlines & Timing
5. Citations (URL, last updated)
`,
  });
  
  return Response.json({ report: text });
}
```

## Deployment Guide

### 1. Set Up Database
```bash
# Create Vercel Postgres database
vercel storage create postgres subsidy-db

# Or use Supabase
npx supabase init
npx supabase db push
```

### 2. Set Up Redis Queue
```bash
# Create Vercel KV store
vercel storage create kv scrape-queue
```

### 3. Deploy Worker Service
```bash
# Option A: Railway
railway init
railway up

# Option B: Render
render deploy

# Option C: Fly.io
fly launch
fly deploy
```

### 4. Configure Environment Variables

**Vercel (Frontend + API):**
```env
# Database
POSTGRES_URL=postgresql://...
KV_REST_API_URL=https://...
KV_REST_API_TOKEN=...

# AI
GOOGLE_GENERATIVE_AI_API_KEY=...

# Worker URL (for webhooks)
WORKER_URL=https://your-worker.railway.app
```

**Worker Service:**
```env
# Database (same as Vercel)
POSTGRES_URL=postgresql://...

# Redis queue
REDIS_URL=redis://...

# Scraping config
PARALLEL_WORKERS=5
RETRY_ATTEMPTS=3
SCRAPE_DELAY_MS=2000
```

### 5. Start Worker
```bash
# worker/index.ts
npm run worker
```

## Monitoring & Observability

### Metrics to Track
- Items scraped per hour
- Success/failure rate
- Average time per subsidy
- Database size
- Worker health status

### Error Handling
- Automatic retry with exponential backoff
- Dead letter queue for persistent failures
- Slack/email alerts for worker crashes
- Daily summary reports

### Logging
```typescript
import pino from 'pino';

const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty'
  }
});

logger.info({ subsidyId, duration }, 'Subsidy scraped successfully');
logger.error({ subsidyId, error }, 'Scraping failed');
```

## Cost Estimation

### Infrastructure
- **Vercel Pro**: $20/month (unlimited functions)
- **Vercel Postgres**: $10/month (256MB)
- **Vercel KV**: $10/month (256MB)
- **Railway Worker**: $5-10/month (512MB RAM)
- **Gemini API**: $0.0005/1K input tokens (~$1-2/month for reports)

**Total: ~$46-52/month**

### Optimization for Cost
- Use cron approach (Option B) if budget constrained
- Only re-scrape changed subsidies
- Cache Gemini reports for 24 hours
- Use lower tier worker for periodic updates

## Timeline Estimate

### Initial Setup (Week 1)
- Database schema design
- Worker service setup
- Basic scraping logic
- Queue system integration

### Core Implementation (Week 2)
- Click-and-wait interaction patterns
- Parallel processing
- Error handling & retries
- Progress tracking

### Integration & Testing (Week 3)
- API endpoints
- Frontend dashboard
- End-to-end testing
- Performance optimization

### Production Launch (Week 4)
- Initial full scrape (8 hours)
- Monitoring setup
- Documentation
- Change detection validation

**Total: 3-4 weeks** for production-ready system

## Next Steps

1. **Decision Point**: Choose architecture option (A, B, or C)
2. **Database Setup**: Create schema and migrations
3. **Worker Prototype**: Test scraping 10-20 subsidies
4. **Gemini Integration**: Validate report quality
5. **Scale Testing**: Benchmark parallel processing
6. **Production Deploy**: Initial full scrape

## Questions to Address

1. **Budget**: What's the monthly infrastructure budget?
2. **Urgency**: Need full data immediately or can wait 30 hours?
3. **Maintenance**: Who will monitor worker health?
4. **Updates**: How often to re-scrape? (daily/weekly/monthly)
5. **Hosting**: Preference for external worker service?
