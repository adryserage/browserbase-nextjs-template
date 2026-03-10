# Solution: Handling 8+ Hour Scraping with 1,500+ Subsidies

## Problem Summary

The Canadian Innovation subsidies website presents unique challenges:

1. **Salesforce Community Cloud**: Dynamic JavaScript rendering
2. **Click-based interaction**: Each subsidy requires clicking a list item and waiting
3. **Scale**: 1,500+ programs to scrape
4. **Duration**: 8+ hours of processing time (tested and proven)

## Why Standard Approaches Don't Work

### ❌ Serverless Functions (Vercel/AWS Lambda)
- **Max timeout**: 300 seconds (5 minutes)
- **Problem**: 8 hours = 28,800 seconds
- **Verdict**: Impossible in single function

### ❌ Multiple Chained Functions
- **Cold starts**: Each function restart adds 5-10s overhead
- **State management**: Complex to maintain progress across functions
- **Cost**: Expensive at scale (1,500+ invocations)
- **Verdict**: Unreliable and costly

### ❌ Browser-based Scraping (Frontend)
- **Browser tabs**: Can't run for 8 hours
- **Network reliability**: User connection drops
- **Resource limits**: Tab crashes with heavy scraping
- **Verdict**: Not feasible

## ✅ Our Solution: Background Worker Architecture

### Core Concept

Separate the **long-running scraping** from the **web application**:

```
Web App (Vercel)          Worker (Railway/Render)
─────────────────         ───────────────────────
│ User clicks "Start"│ ──▶│ Receives job via API │
│ Job queued         │    │ Runs for 8+ hours    │
│ Shows progress     │◀───│ Updates database     │
│ User sees status   │    │ Saves checkpoints    │
└────────────────────     └──────────────────────
```

### Key Components

#### 1. Web Application (Next.js on Vercel)
**Purpose**: User interface and job management

**Capabilities**:
- Queue new scraping jobs
- Check job status
- View scraped subsidies
- Generate AI reports

**Limitations**:
- 300s timeout for API routes
- NOT used for actual scraping

#### 2. Worker Process (Railway/Render/Fly.io)
**Purpose**: Long-running scraping execution

**Capabilities**:
- Runs indefinitely (8+ hours)
- Uses local Playwright (no Browserbase needed)
- Handles click-and-wait interactions
- Automatic retry on failures
- Progress checkpointing

**Why It Works**:
- Not serverless = no timeouts
- Dedicated resources
- Can restart from checkpoints

#### 3. Database (PostgreSQL)
**Purpose**: Shared state between app and worker

**Stores**:
- Scraping job status
- Progress (342/1,500 complete)
- Evidence packets (extracted data)
- Failed items for retry

### How It Solves Each Challenge

#### Challenge 1: Salesforce Dynamic Loading
**Solution**: Stagehand's AI-powered extraction
```typescript
// Worker automatically waits for content to load
await stagehand.act(`Click on the subsidy titled "${name}"`);
await page.waitForTimeout(2000); // Wait for dynamic content

// AI extracts structured data
const data = await stagehand.extract(
  "Extract all subsidy details",
  SubsidySchema
);
```

#### Challenge 2: Click-based Interaction
**Solution**: Sequential processing with navigation
```typescript
for (let i = 0; i < items.length; i++) {
  // Click item
  await stagehand.act(`Click on subsidy ${i}`);
  
  // Extract data
  const data = await scrapeWithRetry(item);
  
  // Navigate back to list
  await page.goBack();
  await page.waitForTimeout(2000);
}
```

#### Challenge 3: Scale (1,500+ Items)
**Solution**: Parallel workers + progress tracking
```typescript
// Option 1: Sequential (safe)
await processSequentially(items); // One at a time

// Option 2: Parallel (faster)
const workers = 3;
await Promise.all(
  chunks.map(chunk => processChunk(chunk))
);

// Either way, progress is tracked
// 342/1,500 complete (22.8%)
```

#### Challenge 4: Duration (8+ Hours)
**Solution**: Checkpointing + resume capability
```typescript
// Save progress every 10 items
if (i % 10 === 0) {
  await saveCheckpoint({
    jobId,
    lastProcessedIndex: i,
    completedItems: completed,
  });
}

// On restart (crash, etc.)
const checkpoint = await loadCheckpoint();
await processSequentially(items, checkpoint.lastProcessedIndex);
```

## Workflow Example

### User Perspective

1. **Start Job** (via web interface)
   ```
   Click "Start Scraping" button
   ↓
   Job ID: job_12345
   Status: Queued
   ```

2. **Monitor Progress** (refreshed every 30s)
   ```
   Status: Running
   Progress: 342/1,500 (22.8%)
   ETA: 6h 15m remaining
   Recent: "Clean Tech Program" ✓
   ```

3. **Job Completes** (8 hours later)
   ```
   Status: Completed
   Total: 1,500
   Successful: 1,488
   Failed: 12
   Duration: 8h 23m
   ```

4. **Use Data**
   ```
   Browse subsidies
   Search by sector, province
   Generate AI eligibility reports
   ```

### Worker Perspective

```typescript
// Worker starts
console.log("Starting job job_12345");

// Navigate to site
await page.goto("https://innovation.ised-isde.canada.ca/...");

// Get list
const items = await getSubsidyList(); // 1,500 items

// Process each
for (let i = 0; i < items.length; i++) {
  console.log(`[${i+1}/1,500] ${items[i].name}`);
  
  try {
    // Click & extract
    await stagehand.act(`Click on ${items[i].name}`);
    const data = await stagehand.extract(...);
    
    // Save to database
    await db.subsidies.create({ data });
    
    // Update progress
    await db.scrapeJobs.update({
      where: { id: "job_12345" },
      data: { completedItems: i + 1 }
    });
    
    // Checkpoint every 10
    if (i % 10 === 0) {
      await saveCheckpoint(i);
    }
    
    // Navigate back
    await page.goBack();
    
  } catch (error) {
    console.error(`Failed: ${items[i].name}`);
    await logFailure(items[i], error);
    // Continue with next item
  }
}

console.log("Job complete!");
```

## Deployment Architecture

### Development (Local Testing)

```
Your Computer
├── Frontend (localhost:3000)
│   npm run dev
│
├── Worker (separate terminal)
│   cd worker && npm start
│
└── Database (local PostgreSQL)
    psql -U postgres
```

### Production (Deployed)

```
┌──────────────────────────────┐
│   Vercel (Frontend + API)    │
│   - User interface           │
│   - Job management           │
│   - Report generation        │
└────────────┬─────────────────┘
             │
    ┌────────┴─────────┐
    │                  │
    ▼                  ▼
┌───────────┐   ┌──────────────┐
│ Database  │   │   Worker     │
│ (Postgres)│   │  (Railway)   │
│           │◀──│              │
│ Jobs      │   │ Stagehand +  │
│ Subsidies │   │ Playwright   │
│ Progress  │   │              │
└───────────┘   └──────────────┘
```

## Cost Breakdown

### Why It's Affordable

**Traditional cloud scraping (Browserbase)**:
- $0.10 per browser minute
- 8 hours = 480 minutes
- 480 × $0.10 = **$48 per scrape**
- Monthly (weekly scrapes) = **$192+/month**

**Our solution (local Playwright)**:
- Worker: $5-10/month (fixed cost)
- Database: $0-10/month
- API hosting: $0-20/month
- **Total: $5-40/month** (regardless of scrape frequency)

**Savings**: 80-95% cost reduction

## Reliability Features

### 1. Automatic Retry
```typescript
async function scrapeWithRetry(item, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await scrapeSingle(item);
    } catch (error) {
      if (attempt < maxAttempts) {
        await sleep(1000 * Math.pow(2, attempt)); // Exponential backoff
      }
    }
  }
  // Log as failed, continue with next
  await logFailure(item);
  return null;
}
```

### 2. Progress Checkpoints
- Saved every 10 items
- Stored in database
- Worker resumes from last checkpoint on restart

### 3. Failed Item Tracking
- All failures logged to `failed_items` table
- Includes error message and attempt count
- Can be retried manually later

### 4. Health Monitoring
- Worker logs all activity
- Database tracks last update time
- Alerts if worker hasn't updated in 10 minutes

## Performance Optimization

### Sequential vs Parallel

**Sequential (1 worker)**:
- Time: 15-20s per item
- Duration: 8-10 hours for 1,500 items
- RAM: 512MB
- Reliability: Highest

**Parallel (3 workers)**:
- Time: 15-20s per item (per worker)
- Duration: 3-4 hours for 1,500 items
- RAM: 1.5GB
- Reliability: Good

**Parallel (5 workers)**:
- Time: 15-20s per item (per worker)
- Duration: 2-3 hours for 1,500 items
- RAM: 2.5GB
- Reliability: May trigger rate limits

**Recommendation**: Start with 3 workers, adjust based on results

## Handling Edge Cases

### Worker Crash
- **Detection**: Last checkpoint timestamp
- **Recovery**: Restart worker, resumes from checkpoint
- **Data loss**: Max 10 items (since last checkpoint)

### Network Issues
- **Retry logic**: Exponential backoff (1s, 2s, 4s)
- **Timeout**: 60s for page load, 15s for extraction
- **Fallback**: Log as failed, continue with next

### Salesforce Blocking
- **Detection**: HTTP 429 or CAPTCHA
- **Response**: Increase delay between requests
- **Prevention**: Random delays (2-5 seconds)

### Database Connection Loss
- **Retry**: Automatic reconnection (Prisma)
- **Buffer**: In-memory queue for recent items
- **Alert**: Notification if persists > 5 minutes

## Future Enhancements

### Phase 1 (Current): Initial Scrape
- ✅ Extract all 1,500+ subsidies
- ✅ Store evidence packets
- ✅ Track progress

### Phase 2: Change Detection
- Compare content hashes
- Identify what changed (deadline, amount, etc.)
- Email alerts for important changes

### Phase 3: Scheduled Updates
- Vercel Cron job (weekly)
- Incremental scrape (changed items only)
- Automatic re-validation

### Phase 4: Advanced Reports
- Multi-subsidy comparison
- Eligibility scoring (1-100)
- Application strategy recommendations
- Historical deadline analysis

## Conclusion

This architecture solves the 8+ hour scraping challenge by:

1. **Separating concerns**: Web app for UI, worker for scraping
2. **Using right tools**: Long-running worker instead of serverless
3. **Building reliability**: Checkpoints, retries, error handling
4. **Scaling smartly**: Parallel workers when safe
5. **Tracking progress**: Real-time updates via database

The result: A robust, cost-effective system that can scrape 1,500+ complex pages over 8 hours, with automatic recovery from failures.

## Next Steps

See [DEPLOYMENT.md](./DEPLOYMENT.md) for step-by-step deployment instructions.

Key decisions to make:
1. **Worker platform**: Railway (easiest) vs Render vs Fly.io
2. **Database**: Vercel Postgres vs Supabase vs external
3. **Update frequency**: Daily, weekly, or monthly re-scrapes
4. **Worker size**: 512MB (slow) vs 1GB (fast) vs 2GB (fastest)
