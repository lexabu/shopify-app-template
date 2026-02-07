import { useState, useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

type Summary = {
  totalProducts: number;
  averageScore: number;
  needsAttention: number;
  optimized: number;
};

type ProductAnalysis = {
  id: string;
  productId: string;
  productHandle: string;
  optimizationScore: number;
  issuesCount: number;
  issues: {
    required: string[];
    title: string[];
    description: string[];
    tags: string[];
    seo: string[];
    images: string[];
    warnings: string[];
  };
};

type JobStatus = {
  id: string;
  status: "queued" | "scanning" | "completed" | "failed";
  totalProducts: number;
  scannedProducts: number;
  progress: number;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export default function ProductOptimizer() {
  const { shop } = useLoaderData<typeof loader>();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [products, setProducts] = useState<ProductAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial data
  useEffect(() => {
    fetchData();
  }, []);

  // Poll job status while scanning
  useEffect(() => {
    if (!jobStatus || jobStatus.status === "completed" || jobStatus.status === "failed") {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/optimize/status/${jobStatus.id}`);
        if (response.ok) {
          const status = await response.json();
          setJobStatus(status);

          if (status.status === "completed") {
            // Refresh data
            await fetchData();
            setScanning(false);
          } else if (status.status === "failed") {
            setError("Scan failed. Please try again.");
            setScanning(false);
          }
        }
      } catch (err) {
        console.error("Error polling job status:", err);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [jobStatus]);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        "/api/optimize/products?includeSummary=true&sortBy=score&limit=20"
      );

      if (!response.ok) {
        throw new Error("Failed to fetch products");
      }

      const data = await response.json();
      setSummary(data.summary);
      setProducts(data.products || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load products"
      );
    } finally {
      setLoading(false);
    }
  }

  async function startScan() {
    try {
      setScanning(true);
      setError(null);

      const response = await fetch("/api/optimize/scan", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to start scan");
      }

      const data = await response.json();
      setJobStatus({
        id: data.jobId,
        status: "queued",
        totalProducts: 0,
        scannedProducts: 0,
        progress: 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start scan");
      setScanning(false);
    }
  }

  function getScoreColor(score: number): string {
    if (score < 40) return "critical";
    if (score < 60) return "warning";
    if (score < 80) return "info";
    return "success";
  }

  function getScoreEmoji(score: number): string {
    if (score < 40) return "🔴";
    if (score < 60) return "🟡";
    if (score < 80) return "🟢";
    return "✅";
  }

  return (
    <s-page heading="Product Optimizer">
      <s-section>
        <s-paragraph>
          AI-powered product data optimization to help improve your product
          titles, tags, and descriptions for better SEO and discoverability.
        </s-paragraph>
      </s-section>

      {error && (
        <s-section>
          <s-banner tone="critical">
            <s-text>{error}</s-text>
          </s-banner>
        </s-section>
      )}

      {summary && (
        <s-section heading="Overview">
          <s-stack direction="inline" gap="base">
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-heading>Total Products</s-heading>
              <s-text>{summary.totalProducts}</s-text>
            </s-box>
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-heading>Need Attention</s-heading>
              <s-text>{summary.needsAttention}</s-text>
            </s-box>
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-heading>Average Score</s-heading>
              <s-text>{summary.averageScore}/100</s-text>
            </s-box>
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-heading>Optimized</s-heading>
              <s-text>{summary.optimized}</s-text>
            </s-box>
          </s-stack>
        </s-section>
      )}

      <s-section heading={scanning ? "Scanning Products..." : "Scan Products"}>
        {!scanning && (
          <>
            <s-paragraph>
              Click the button below to scan your products and identify
              optimization opportunities.
            </s-paragraph>
            <s-button variant="primary" onClick={startScan}>
              {summary && summary.totalProducts > 0
                ? "Re-scan Products"
                : "Start Product Scan"}
            </s-button>
          </>
        )}

        {scanning && jobStatus && (
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Progress: {jobStatus.scannedProducts} / {jobStatus.totalProducts || "..."} products
              ({jobStatus.progress}%)
            </s-paragraph>
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-text>Status: {jobStatus.status}</s-text>
            </s-box>
          </s-stack>
        )}
      </s-section>

      {!loading && products.length > 0 && (
        <s-section heading="Products Needing Attention">
          <s-paragraph>
            Products are sorted by optimization score (lowest first). Click on a
            product to see detailed suggestions.
          </s-paragraph>

          <s-stack direction="block" gap="base">
            {products.map((product) => {
              // Extract numeric ID from GID (e.g., "gid://shopify/Product/12345" -> "12345")
              const numericId = product.productId.split('/').pop() || product.productId;
              console.log("🔍 Product card:", {
                productId: product.productId,
                numericId,
                linkTo: `/app/optimize/${numericId}`
              });

              return (
                <s-box
                  key={product.id}
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                >
                  <s-stack direction="inline" gap="base">
                    <s-stack direction="block" gap="none">
                      <s-heading>
                        {getScoreEmoji(product.optimizationScore)}{" "}
                        {product.productHandle}
                      </s-heading>
                      <s-text>
                        Score: {product.optimizationScore}/100 |{" "}
                        {product.issuesCount} issue(s)
                      </s-text>
                      {product.issues.required && product.issues.required.length > 0 && (
                        <s-text tone="caution">
                          ⚠️ Missing: {product.issues.required.join(", ")}
                        </s-text>
                      )}
                      {product.issues.title.length > 0 && (
                        <s-text>Title: {product.issues.title[0]}</s-text>
                      )}
                      {product.issues.description.length > 0 && (
                        <s-text>
                          Description: {product.issues.description[0]}
                        </s-text>
                      )}
                      {product.issues.tags.length > 0 && (
                        <s-text>Tags: {product.issues.tags[0]}</s-text>
                      )}
                      {product.issues.warnings && product.issues.warnings.length > 0 && (
                        <s-text tone="caution">
                          ⚠️ Warning: {product.issues.warnings[0]}
                        </s-text>
                      )}
                    </s-stack>
                    <s-button href={`/app/optimize/${numericId}`}>
                      Review & Optimize
                    </s-button>
                  </s-stack>
                </s-box>
              );
            })}
          </s-stack>

          {products.length >= 20 && (
            <s-paragraph>
              Showing top 20 products. More products available after you start
              optimizing these.
            </s-paragraph>
          )}
        </s-section>
      )}

      {!loading && products.length === 0 && summary && summary.totalProducts === 0 && (
        <s-section heading="Get Started">
          <s-paragraph>
            No products have been scanned yet. Click "Start Product Scan" above
            to begin analyzing your products.
          </s-paragraph>
        </s-section>
      )}

      {!loading && products.length === 0 && summary && summary.totalProducts > 0 && (
        <s-section heading="All Done!">
          <s-banner tone="success">
            <s-text>
              🎉 Great job! All your products are well optimized. Average
              score: {summary.averageScore}/100
            </s-text>
          </s-banner>
        </s-section>
      )}

      {loading && !error && (
        <s-section>
          <s-text>Loading product data...</s-text>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
