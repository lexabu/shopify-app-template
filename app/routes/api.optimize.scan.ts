import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { createOptimizationJob } from "../services/product-optimizer-queue.server";

/**
 * POST /api/optimize/scan
 * Start a product optimization scan for the current shop
 * Returns the job ID for polling status
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    // Create optimization job (starts processing in background)
    const jobId = await createOptimizationJob(shop);

    return new Response(
      JSON.stringify({
        jobId,
        message: "Optimization scan started",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error starting optimization scan:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to start optimization scan",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
