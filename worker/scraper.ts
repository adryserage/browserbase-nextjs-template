/**
 * Worker Process for Canadian Subsidy Scraping
 * 
 * This long-running process handles the 8+ hour scraping job
 * for 1,500+ subsidies from the Canadian Innovation website.
 * 
 * Features:
 * - Click-based interaction with dynamic Salesforce UI
 * - Parallel processing (configurable workers)
 * - Automatic retry with exponential backoff
 * - Progress checkpointing for resume capability
 * - Change detection via content hashing
 */

import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import crypto from "crypto";

// Environment configuration
const CONFIG = {
  PARALLEL_WORKERS: parseInt(process.env.PARALLEL_WORKERS || "3"),
  RETRY_ATTEMPTS: parseInt(process.env.RETRY_ATTEMPTS || "3"),
  SCRAPE_DELAY_MS: parseInt(process.env.SCRAPE_DELAY_MS || "2000"),
  TARGET_URL: process.env.TARGET_URL || "https://innovation.ised-isde.canada.ca/innovation/s/list-liste?language=fr_CA&token=a0BMm00000612cDMAQ",
  CHECKPOINT_INTERVAL: 10, // Save progress every 10 items
};

// Subsidy data schema for extraction
const SubsidySchema = z.object({
  programName: z.string().describe("Official program name"),
  description: z.string().optional().describe("Brief program description"),
  eligibilityCriteria: z.array(z.string()).describe("List of who is eligible"),
  minAmount: z.number().optional().describe("Minimum funding amount in CAD"),
  maxAmount: z.number().optional().describe("Maximum funding amount in CAD"),
  fundingType: z.string().optional().describe("Grant, loan, tax credit, etc."),
  applicationSteps: z.array(z.string()).describe("Steps to apply"),
  deadlineText: z.string().optional().describe("Deadline information"),
  targetAudience: z.array(z.string()).optional().describe("Target groups"),
  sector: z.array(z.string()).optional().describe("Industry sectors"),
  province: z.array(z.string()).optional().describe("Provinces/territories"),
});

type SubsidyData = z.infer<typeof SubsidySchema>;

interface SubsidyListItem {
  text: string;
  index: number;
  selector?: string;
}

interface ScrapingProgress {
  jobId: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  lastProcessedIndex: number;
  startedAt: Date;
}

/**
 * Main scraper class
 */
export class SubsidyScraper {
  private stagehand?: Stagehand;
  private progress: ScrapingProgress;
  private failedItems: Array<{ item: SubsidyListItem; error: string }> = [];

  constructor(jobId: string) {
    this.progress = {
      jobId,
      totalItems: 0,
      completedItems: 0,
      failedItems: 0,
      lastProcessedIndex: -1,
      startedAt: new Date(),
    };
  }

  /**
   * Initialize Stagehand with local Playwright
   */
  async initialize(): Promise<void> {
    console.log("Initializing Stagehand with local Playwright...");
    
    this.stagehand = new Stagehand({
      env: "LOCAL", // Use local Playwright instead of Browserbase
      verbose: 1,
      debugDom: false,
      headless: true, // Set to false for debugging
      logger: (message: any) => {
        console.log(`[Stagehand] ${JSON.stringify(message)}`);
      },
    });

    await this.stagehand.init();
    console.log("Stagehand initialized successfully");
  }

  /**
   * Navigate to the main listing page and extract all subsidy links
   */
  async getSubsidyList(): Promise<SubsidyListItem[]> {
    if (!this.stagehand) throw new Error("Stagehand not initialized");
    
    const page = this.stagehand.page;
    console.log(`Navigating to: ${CONFIG.TARGET_URL}`);
    
    await page.goto(CONFIG.TARGET_URL, {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    // Wait for the results list to load
    console.log("Waiting for subsidy list to load...");
    await page.waitForTimeout(5000);

    // Extract the list of subsidy programs
    console.log("Extracting subsidy program list...");
    
    const listData = await this.stagehand.extract(
      "Extract ALL subsidy program entries from the list. Each entry should have the program name/title. Get every single item in the list.",
      z.object({
        programs: z.array(z.object({
          name: z.string().describe("Program name or title"),
          hasMoreInfo: z.boolean().describe("Whether this item can be clicked for more details"),
        })).describe("Complete list of all subsidy programs visible")
      })
    );

    const items: SubsidyListItem[] = listData.programs
      .filter(p => p.hasMoreInfo)
      .map((p, idx) => ({
        text: p.name,
        index: idx,
      }));

    this.progress.totalItems = items.length;
    console.log(`Found ${items.length} subsidy programs to scrape`);

    return items;
  }

  /**
   * Scrape a single subsidy program
   */
  async scrapeSingleSubsidy(item: SubsidyListItem): Promise<SubsidyData & { url: string }> {
    if (!this.stagehand) throw new Error("Stagehand not initialized");
    
    const page = this.stagehand.page;
    
    console.log(`[${item.index + 1}/${this.progress.totalItems}] Scraping: ${item.text}`);

    try {
      // Click on the list item to load details
      await this.stagehand.act(`Click on the subsidy program titled "${item.text}"`);
      
      // Wait for the detail panel/page to load
      await page.waitForTimeout(CONFIG.SCRAPE_DELAY_MS);
      
      // Check if we're on a new page or if content loaded in panel
      const currentUrl = page.url();
      console.log(`  Current URL: ${currentUrl}`);

      // Extract subsidy details
      const details = await this.stagehand.extract(
        `Extract all available details about the subsidy program "${item.text}". Include eligibility requirements, funding amounts, application process, deadlines, and any other relevant information.`,
        SubsidySchema
      );

      console.log(`  ✓ Successfully scraped: ${details.programName}`);

      // Get raw HTML for audit trail
      const rawHtml = await page.content();

      return {
        ...details,
        url: currentUrl,
      };

    } catch (error) {
      console.error(`  ✗ Failed to scrape ${item.text}:`, error);
      throw error;
    }
  }

  /**
   * Navigate back to the main list
   */
  async navigateBackToList(): Promise<void> {
    if (!this.stagehand) throw new Error("Stagehand not initialized");
    
    const page = this.stagehand.page;
    
    try {
      // Try browser back button first
      await page.goBack({ waitUntil: "networkidle", timeout: 10000 });
      await page.waitForTimeout(2000);
    } catch (error) {
      // If back doesn't work, navigate to main URL
      console.log("  Back button failed, navigating to main URL");
      await page.goto(CONFIG.TARGET_URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(3000);
    }
  }

  /**
   * Scrape with retry logic
   */
  async scrapeWithRetry(item: SubsidyListItem): Promise<(SubsidyData & { url: string }) | null> {
    for (let attempt = 1; attempt <= CONFIG.RETRY_ATTEMPTS; attempt++) {
      try {
        const data = await this.scrapeSingleSubsidy(item);
        return data;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`  Attempt ${attempt}/${CONFIG.RETRY_ATTEMPTS} failed: ${errorMsg}`);
        
        if (attempt < CONFIG.RETRY_ATTEMPTS) {
          // Exponential backoff
          const delay = 1000 * Math.pow(2, attempt);
          console.log(`  Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Try to recover by going back to list
          try {
            await this.navigateBackToList();
          } catch {
            // If navigation fails, reinitialize
            console.log("  Recovery failed, reinitializing browser...");
            await this.cleanup();
            await this.initialize();
            await this.stagehand!.page.goto(CONFIG.TARGET_URL);
            await this.stagehand!.page.waitForTimeout(3000);
          }
        } else {
          // Final attempt failed
          this.failedItems.push({ item, error: errorMsg });
          this.progress.failedItems++;
          return null;
        }
      }
    }
    return null;
  }

  /**
   * Calculate content hash for change detection
   */
  calculateContentHash(data: SubsidyData): string {
    const content = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /**
   * Save subsidy to database
   * (This would connect to your actual database)
   */
  async saveSubsidy(data: SubsidyData & { url: string }): Promise<void> {
    const contentHash = this.calculateContentHash(data);
    
    // TODO: Implement actual database save
    // For now, just log to console
    console.log(`  Saving subsidy: ${data.programName}`);
    console.log(`  Content hash: ${contentHash.slice(0, 16)}...`);
    
    // Example Prisma code:
    // await prisma.subsidy.upsert({
    //   where: { url: data.url },
    //   create: {
    //     programName: data.programName,
    //     url: data.url,
    //     contentHash,
    //     eligibilityCriteria: data.eligibilityCriteria,
    //     // ... other fields
    //   },
    //   update: {
    //     contentHash,
    //     lastScrapedAt: new Date(),
    //     scrapeCount: { increment: 1 },
    //     // ... other fields
    //   }
    // });
  }

  /**
   * Save progress checkpoint
   */
  async saveCheckpoint(): Promise<void> {
    console.log(`\n📊 Checkpoint: ${this.progress.completedItems}/${this.progress.totalItems} completed, ${this.progress.failedItems} failed`);
    
    // TODO: Save to database or Redis
    // await redis.set(`checkpoint:${this.progress.jobId}`, JSON.stringify(this.progress));
  }

  /**
   * Process all subsidies sequentially
   */
  async processSequentially(items: SubsidyListItem[], startIndex: number = 0): Promise<void> {
    for (let i = startIndex; i < items.length; i++) {
      const item = items[i];
      
      const data = await this.scrapeWithRetry(item);
      
      if (data) {
        await this.saveSubsidy(data);
        this.progress.completedItems++;
      }
      
      this.progress.lastProcessedIndex = i;
      
      // Save checkpoint periodically
      if ((i + 1) % CONFIG.CHECKPOINT_INTERVAL === 0) {
        await this.saveCheckpoint();
      }
      
      // Navigate back to list for next item
      if (i < items.length - 1) {
        await this.navigateBackToList();
      }
    }
  }

  /**
   * Process subsidies in parallel (use with caution)
   */
  async processInParallel(items: SubsidyListItem[]): Promise<void> {
    const workers = CONFIG.PARALLEL_WORKERS;
    const chunks = this.chunkArray(items, Math.ceil(items.length / workers));
    
    console.log(`Processing ${items.length} items with ${workers} parallel workers`);
    
    await Promise.all(
      chunks.map((chunk, workerIndex) =>
        this.processChunk(chunk, workerIndex)
      )
    );
  }

  /**
   * Process a chunk of items with dedicated browser
   */
  async processChunk(items: SubsidyListItem[], workerIndex: number): Promise<void> {
    const scraper = new SubsidyScraper(`${this.progress.jobId}-worker-${workerIndex}`);
    await scraper.initialize();
    
    const itemsList = await scraper.getSubsidyList();
    // Filter to only items in this chunk
    const chunkItems = itemsList.filter(item => items.some(i => i.text === item.text));
    
    await scraper.processSequentially(chunkItems);
    await scraper.cleanup();
  }

  /**
   * Helper: chunk array
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Run the complete scraping job
   */
  async run(mode: "sequential" | "parallel" = "sequential"): Promise<void> {
    try {
      await this.initialize();
      
      const items = await this.getSubsidyList();
      
      console.log(`\n🚀 Starting ${mode} scraping of ${items.length} subsidies`);
      console.log(`   Estimated time: ${this.estimateTime(items.length)}`);
      
      if (mode === "parallel") {
        await this.processInParallel(items);
      } else {
        await this.processSequentially(items);
      }
      
      await this.saveCheckpoint();
      
      console.log("\n✅ Scraping completed!");
      console.log(`   Total: ${this.progress.totalItems}`);
      console.log(`   Completed: ${this.progress.completedItems}`);
      console.log(`   Failed: ${this.progress.failedItems}`);
      console.log(`   Duration: ${this.getDuration()}`);
      
      if (this.failedItems.length > 0) {
        console.log("\n⚠️  Failed items:");
        this.failedItems.forEach(({ item, error }) => {
          console.log(`   - ${item.text}: ${error}`);
        });
      }
      
    } catch (error) {
      console.error("\n❌ Scraping failed:", error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Estimate completion time
   */
  private estimateTime(itemCount: number): string {
    // Assume 15-20 seconds per item on average
    const secondsPerItem = 17;
    const totalSeconds = itemCount * secondsPerItem;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    
    return `~${hours}h ${minutes}m`;
  }

  /**
   * Get elapsed duration
   */
  private getDuration(): string {
    const elapsed = Date.now() - this.progress.startedAt.getTime();
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.stagehand) {
      try {
        await this.stagehand.close();
        console.log("Browser closed");
      } catch (error) {
        console.error("Error closing browser:", error);
      }
    }
  }
}

/**
 * Main entry point
 */
async function main() {
  const jobId = process.env.JOB_ID || `job-${Date.now()}`;
  const mode = (process.env.SCRAPE_MODE || "sequential") as "sequential" | "parallel";
  
  console.log("🤖 Canadian Subsidy Scraper Worker");
  console.log("=" .repeat(50));
  console.log(`Job ID: ${jobId}`);
  console.log(`Mode: ${mode}`);
  console.log(`Workers: ${CONFIG.PARALLEL_WORKERS}`);
  console.log("=".repeat(50));
  
  const scraper = new SubsidyScraper(jobId);
  
  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n⚠️  Received SIGINT, shutting down gracefully...");
    await scraper.saveCheckpoint();
    await scraper.cleanup();
    process.exit(0);
  });
  
  process.on("SIGTERM", async () => {
    console.log("\n⚠️  Received SIGTERM, shutting down gracefully...");
    await scraper.saveCheckpoint();
    await scraper.cleanup();
    process.exit(0);
  });
  
  try {
    await scraper.run(mode);
    process.exit(0);
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export default SubsidyScraper;
