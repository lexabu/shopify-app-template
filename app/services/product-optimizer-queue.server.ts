import db from "../db.server";
import { fetchAllProducts } from "./shopify-products.server";
import { analyzeProduct } from "./product-optimization.server";

type JobStatus = "queued" | "scanning" | "completed" | "failed";

/**
 * In-memory job processing state
 * Maps job ID to processing promise
 */
const activeJobs = new Map<string, Promise<void>>();

/**
 * Create a new optimization job and start processing in the background
 */
export async function createOptimizationJob(shop: string): Promise<string> {
  // Check if there's already an active job for this shop
  const existingJob = await db.optimizationJob.findFirst({
    where: {
      shop,
      status: { in: ["queued", "scanning"] },
    },
    orderBy: { startedAt: "desc" },
  });

  if (existingJob) {
    return existingJob.id;
  }

  // Create new job record
  const job = await db.optimizationJob.create({
    data: {
      shop,
      status: "queued",
      totalProducts: 0,
      scannedProducts: 0,
    },
  });

  // Start processing in background (don't await)
  const processingPromise = processOptimizationJob(job.id, shop).catch(
    (error) => {
      console.error(`Optimization job ${job.id} failed:`, error);
    }
  );

  activeJobs.set(job.id, processingPromise);

  return job.id;
}

/**
 * Process an optimization job in the background
 * Fetches all products and analyzes them in batches
 */
async function processOptimizationJob(
  jobId: string,
  shop: string
): Promise<void> {
  try {
    // Update job status to scanning
    await db.optimizationJob.update({
      where: { id: jobId },
      data: { status: "scanning" },
    });

    let cursor: string | null = null;
    let totalProducts = 0;
    let scannedProducts = 0;

    // Fetch and process products in batches of 50
    do {
      const { products, pageInfo } = await fetchAllProducts(shop, cursor);

      // Process this batch
      await processProductBatch(shop, products);

      scannedProducts += products.length;
      totalProducts = scannedProducts; // Update as we go

      // Update job progress
      await db.optimizationJob.update({
        where: { id: jobId },
        data: {
          totalProducts,
          scannedProducts,
        },
      });

      // Move to next page
      cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
    } while (cursor);

    // Mark job as completed
    await db.optimizationJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        completedAt: new Date(),
        totalProducts,
        scannedProducts,
      },
    });

    // Remove from active jobs
    activeJobs.delete(jobId);
  } catch (error) {
    console.error(`Error processing optimization job ${jobId}:`, error);

    // Mark job as failed
    await db.optimizationJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        completedAt: new Date(),
      },
    });

    // Remove from active jobs
    activeJobs.delete(jobId);

    throw error;
  }
}

/**
 * Process a batch of products (analyze and store results)
 */
async function processProductBatch(
  shop: string,
  products: Array<{
    id: string;
    title: string;
    handle: string;
    description: string;
    descriptionHtml: string;
    tags: string[];
    productType: string;
    vendor: string;
    seo: {
      title: string | null;
      description: string | null;
    };
    featuredImage: {
      url: string;
      altText: string | null;
    } | null;
    images: {
      nodes: Array<{
        url: string;
        altText: string | null;
      }>;
    };
    variants: {
      nodes: Array<{
        price: string;
      }>;
    };
    collections: {
      nodes: Array<{
        id: string;
        title: string;
      }>;
    };
  }>
): Promise<void> {
  // Analyze all products in batch
  const analyses = products.map((product) => {
    const analysis = analyzeProduct(product);

    return {
      shop,
      productId: product.id,
      productHandle: product.handle,
      optimizationScore: analysis.optimizationScore,
      issuesCount: analysis.issuesCount,
      issues: analysis.issues,
    };
  });

  // Store all analyses in database using upsert
  await Promise.all(
    analyses.map((analysis) =>
      db.productAnalysis.upsert({
        where: {
          shop_productId: {
            shop: analysis.shop,
            productId: analysis.productId,
          },
        },
        update: {
          optimizationScore: analysis.optimizationScore,
          issuesCount: analysis.issuesCount,
          issues: analysis.issues,
          analyzedAt: new Date(),
        },
        create: {
          shop: analysis.shop,
          productId: analysis.productId,
          productHandle: analysis.productHandle,
          optimizationScore: analysis.optimizationScore,
          issuesCount: analysis.issuesCount,
          issues: analysis.issues,
        },
      })
    )
  );
}

/**
 * Get job status and progress
 */
export async function getJobStatus(jobId: string) {
  const job = await db.optimizationJob.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    return null;
  }

  // Calculate progress percentage
  const progress =
    job.totalProducts > 0
      ? Math.round((job.scannedProducts / job.totalProducts) * 100)
      : 0;

  return {
    id: job.id,
    shop: job.shop,
    status: job.status,
    totalProducts: job.totalProducts,
    scannedProducts: job.scannedProducts,
    progress,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  };
}

/**
 * Get analyzed products for a shop with optional filters
 */
export async function getAnalyzedProducts(
  shop: string,
  options?: {
    minScore?: number;
    maxScore?: number;
    limit?: number;
    offset?: number;
    sortBy?: "score" | "issues" | "recent";
  }
) {
  const {
    minScore = 0,
    maxScore = 100,
    limit = 50,
    offset = 0,
    sortBy = "score",
  } = options || {};

  // Build where clause
  const where = {
    shop,
    optimizationScore: {
      gte: minScore,
      lte: maxScore,
    },
  };

  // Build orderBy clause
  const orderBy =
    sortBy === "score"
      ? { optimizationScore: "asc" as const }
      : sortBy === "issues"
        ? { issuesCount: "desc" as const }
        : { analyzedAt: "desc" as const };

  // Fetch products
  const [products, total] = await Promise.all([
    db.productAnalysis.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
    }),
    db.productAnalysis.count({ where }),
  ]);

  return {
    products,
    total,
    hasMore: offset + products.length < total,
  };
}

/**
 * Get optimization summary stats for a shop
 */
export async function getOptimizationSummary(shop: string) {
  const [totalProducts, avgScoreResult, needsAttention, optimized] =
    await Promise.all([
      // Total products analyzed
      db.productAnalysis.count({ where: { shop } }),

      // Average optimization score
      db.productAnalysis.aggregate({
        where: { shop },
        _avg: { optimizationScore: true },
      }),

      // Products needing attention (score < 60)
      db.productAnalysis.count({
        where: {
          shop,
          optimizationScore: { lt: 60 },
        },
      }),

      // Products with optimizations applied
      db.productOptimization.count({
        where: {
          shop,
          status: "applied",
        },
      }),
    ]);

  return {
    totalProducts,
    averageScore: Math.round(avgScoreResult._avg.optimizationScore || 0),
    needsAttention,
    optimized,
  };
}
