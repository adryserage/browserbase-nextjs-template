/**
 * Scraping Job Status API
 * 
 * GET /api/scrape/status/[jobId]
 * 
 * Returns the current status and progress of a scraping job
 */

import { NextRequest } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { jobId } = params;

  try {
    // TODO: Query from database
    // const job = await prisma.scrapeJob.findUnique({
    //   where: { id: jobId },
    // });
    //
    // if (!job) {
    //   return Response.json(
    //     { error: 'Job not found' },
    //     { status: 404 }
    //   );
    // }

    // Mock response for now
    const mockJob = {
      id: jobId,
      status: "running",
      mode: "full",
      progress: {
        total: 1500,
        completed: 342,
        failed: 12,
        percentage: 22.8,
      },
      startedAt: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
      estimatedCompletionAt: new Date(Date.now() + 21600000).toISOString(), // 6 hours from now
      lastCheckpoint: new Date(Date.now() - 300000).toISOString(), // 5 min ago
      stats: {
        averageTimePerItem: 17, // seconds
        itemsPerMinute: 3.5,
        estimatedRemainingTime: "6h 15m",
      },
      recentItems: [
        { name: "Clean Technology Program", status: "completed", timestamp: new Date(Date.now() - 60000).toISOString() },
        { name: "Innovation Vouchers", status: "completed", timestamp: new Date(Date.now() - 120000).toISOString() },
        { name: "SME Research Grant", status: "failed", timestamp: new Date(Date.now() - 180000).toISOString() },
      ],
    };

    return Response.json(mockJob);
  } catch (error) {
    console.error(`Failed to get status for job ${jobId}:`, error);
    return Response.json(
      {
        error: "Failed to fetch job status",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * Cancel/pause a running job
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { jobId } = params;

  try {
    // TODO: Update job status in database
    // await prisma.scrapeJob.update({
    //   where: { id: jobId },
    //   data: { status: 'cancelled' }
    // });

    // TODO: Send signal to worker to stop
    // await kv.publish('worker_commands', JSON.stringify({
    //   action: 'cancel',
    //   jobId,
    // }));

    return Response.json({
      message: `Job ${jobId} cancellation requested`,
      note: "Worker will stop after completing current item",
    });
  } catch (error) {
    return Response.json(
      { error: "Failed to cancel job" },
      { status: 500 }
    );
  }
}
