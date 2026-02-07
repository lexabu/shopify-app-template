import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getJobStatus } from "../services/product-optimizer-queue.server";

/**
 * GET /api/optimize/status/:jobId
 * Get the status and progress of an optimization job
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  try {
    await authenticate.admin(request);

    const { jobId } = params;
    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "Job ID is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const status = await getJobStatus(jobId);

    if (!status) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify(status), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching job status:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to fetch job status",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
