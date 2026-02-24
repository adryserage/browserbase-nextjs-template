/**
 * Start Scraping Job API
 * 
 * POST /api/scrape/start
 * 
 * Queues a new scraping job. The actual scraping is done by
 * the worker process running externally.
 */

import { NextRequest } from "next/server";

export const maxDuration = 60; // This endpoint just queues the job

interface StartScrapeRequest {
  mode?: "full" | "incremental" | "specific";
  specificIds?: string[];
}

export async function POST(req: NextRequest) {
  try {
    const body: StartScrapeRequest = await req.json();
    const mode = body.mode || "full";

    // Generate unique job ID
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // TODO: Create job in database
    // const job = await prisma.scrapeJob.create({
    //   data: {
    //     id: jobId,
    //     status: 'queued',
    //     mode: mode,
    //     totalItems: mode === 'full' ? null : body.specificIds?.length,
    //   }
    // });

    // TODO: Queue the job in Redis/KV
    // await kv.lpush('scrape_queue', JSON.stringify({
    //   jobId,
    //   mode,
    //   specificIds: body.specificIds,
    //   queuedAt: new Date().toISOString(),
    // }));

    // For now, just return mock response
    console.log(`Created scraping job: ${jobId} (mode: ${mode})`);

    // TODO: Trigger worker via webhook if using external service
    // await fetch(process.env.WORKER_WEBHOOK_URL, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ jobId }),
    // });

    return Response.json({
      jobId,
      status: "queued",
      mode,
      message: "Scraping job created successfully",
      estimatedDuration: mode === "full" ? "8-10 hours" : "varies",
      nextSteps: [
        "Check job status at /api/scrape/status/${jobId}",
        "View subsidies at /api/subsidies once complete",
      ],
    });
  } catch (error) {
    console.error("Failed to start scraping job:", error);
    return Response.json(
      {
        error: "Failed to start scraping job",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  // List recent jobs
  try {
    // TODO: Query from database
    // const recentJobs = await prisma.scrapeJob.findMany({
    //   take: 10,
    //   orderBy: { startedAt: 'desc' },
    // });

    return Response.json({
      jobs: [
        // Mock data for now
        {
          id: "job_example_1",
          status: "running",
          mode: "full",
          progress: {
            completed: 234,
            total: 1500,
            percentage: 15.6,
          },
          startedAt: new Date(Date.now() - 3600000).toISOString(),
        },
      ],
      message: "This endpoint will list recent scraping jobs once database is connected",
    });
  } catch (error) {
    return Response.json(
      { error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}
