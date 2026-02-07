import { useState, useEffect, useRef } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useParams, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

type ProductData = {
  id: string;
  title: string;
  handle: string;
  description: string;
  descriptionHtml?: string;
  tags: string[];
  productType?: string;
  vendor?: string;
  seo: {
    title: string | null;
    description: string | null;
  };
  featuredImage: {
    url: string;
    altText: string | null;
  } | null;
  images?: {
    nodes: Array<{
      url: string;
      altText: string | null;
    }>;
  };
  collections?: {
    nodes: Array<{
      id: string;
      title: string;
    }>;
  };
};

type Suggestions = {
  title: Array<{ title: string; reasoning: string }>;
  description: {
    content: string;
    improvements: string[];
  } | null;
  tags: {
    add: string[];
    remove: string[];
    reasoning: string;
  } | null;
  seo: {
    metaTitle: string;
    metaDescription: string;
    reasoning: string;
  } | null;
  imageAnalysis: {
    attributes: string[];
    keywords: string[];
  } | null;
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  console.log("📥 Product detail loader called:", {
    rawProductId: params.productId,
  });

  const { session } = await authenticate.admin(request);

  // Reconstruct full GID from numeric ID
  // params.productId could be just "12345" or full "gid://shopify/Product/12345"
  let productId = params.productId || "";
  if (productId && !productId.startsWith("gid://")) {
    productId = `gid://shopify/Product/${productId}`;
  }

  console.log("✅ Loader returning:", {
    shop: session.shop,
    numericId: params.productId,
    fullGid: productId,
  });

  return {
    shop: session.shop,
    productId,
  };
};

export default function ProductOptimizerDetail() {
  const { shop, productId } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  console.log("🎨 ProductOptimizerDetail component mounted/rendered:", {
    shop,
    productId,
  });

  const [productLoading, setProductLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [product, setProduct] = useState<ProductData | null>(null);
  const [analysis, setAnalysis] = useState<{
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
  } | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Selected choices - "current", "ai", or "custom"
  const [titleChoice, setTitleChoice] = useState<"current" | "ai" | "custom">("current");
  const [selectedAiTitleIndex, setSelectedAiTitleIndex] = useState<number>(0);
  const [customTitle, setCustomTitle] = useState<string>("");

  const [descriptionChoice, setDescriptionChoice] = useState<"current" | "ai" | "custom">("current");
  const [customDescription, setCustomDescription] = useState<string>("");

  const [selectedTagsToAdd, setSelectedTagsToAdd] = useState<boolean>(false);
  const [selectedTagsToRemove, setSelectedTagsToRemove] = useState<boolean>(false);
  const [customTagsToAdd, setCustomTagsToAdd] = useState<string>("");

  const [seoChoice, setSeoChoice] = useState<"current" | "ai" | "custom">("current");
  const [customSeoTitle, setCustomSeoTitle] = useState<string>("");
  const [customSeoDescription, setCustomSeoDescription] = useState<string>("");

  const [applying, setApplying] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);

  // Ref for scrolling to suggestions
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Helper to copy text to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Helper to copy AI suggestion directly into custom field
  const copyToCustomTitle = (text: string) => {
    setCustomTitle(text);
    setTitleChoice("custom");
  };

  const copyToCustomDescription = (text: string) => {
    setCustomDescription(text);
    setDescriptionChoice("custom");
  };

  const copyToCustomSeo = (title: string, description: string) => {
    setCustomSeoTitle(title);
    setCustomSeoDescription(description);
    setSeoChoice("custom");
  };

  // Fetch analysis data on mount
  useEffect(() => {
    console.log("🔄 useEffect triggered, fetching analysis for:", productId);

    async function fetchAnalysis() {
      try {
        setAnalysisLoading(true);
        console.log("📡 Fetching analysis from /api/optimize/products");

        const response = await fetch(`/api/optimize/products`);
        console.log("📡 Response status:", response.status, response.ok);

        if (response.ok) {
          const data = await response.json();
          console.log("📊 Received data:", {
            totalProducts: data.products?.length,
            lookingFor: productId,
          });

          const productAnalysis = data.products?.find(
            (p: any) => p.productId === productId
          );

          console.log("🔍 Found matching product:", productAnalysis ? "Yes" : "No");

          if (productAnalysis) {
            console.log("✅ Setting analysis:", {
              score: productAnalysis.optimizationScore,
              issuesCount: productAnalysis.issuesCount,
            });
            setAnalysis({
              optimizationScore: productAnalysis.optimizationScore,
              issuesCount: productAnalysis.issuesCount,
              issues: productAnalysis.issues,
            });
          } else {
            console.warn("⚠️ Product not found in analysis data");
          }
        } else {
          console.error("❌ Failed to fetch analysis, status:", response.status);
        }
      } catch (err) {
        console.error("❌ Error fetching analysis:", err);
      } finally {
        setAnalysisLoading(false);
        console.log("✅ Analysis loading complete");
      }
    }

    if (productId) {
      fetchAnalysis();
    } else {
      console.warn("⚠️ No productId provided, skipping fetch");
    }
  }, [productId]);

  // Fetch product info on mount (separate from suggestions)
  useEffect(() => {
    // Reset state when navigating to a new product
    setApplySuccess(false);
    setSuggestions(null);
    setError(null);

    async function fetchProductInfo() {
      try {
        setProductLoading(true);
        // Extract numeric ID from full GID for API call
        const numericId = productId.split('/').pop() || productId;
        const response = await fetch(`/api/optimize/product/${numericId}`);

        if (response.ok) {
          const data = await response.json();
          setProduct(data.product);
        } else {
          console.error("Failed to fetch product info");
        }
      } catch (err) {
        console.error("Error fetching product info:", err);
      } finally {
        setProductLoading(false);
      }
    }

    if (productId) {
      fetchProductInfo();
    }
  }, [productId]);

  async function generateSuggestions() {
    console.log("🤖 generateSuggestions called for productId:", productId);
    try {
      setLoading(true);
      setError(null);

      // Extract numeric ID from GID for URL (GID contains slashes that break URLs)
      const numericId = productId.split('/').pop() || productId;
      console.log("📡 Calling AI suggestions API:", `/api/optimize/suggestions/${numericId}`);
      const response = await fetch(
        `/api/optimize/suggestions/${numericId}`,
        {
          method: "POST",
        }
      );
      console.log("📡 AI suggestions response status:", response.status, response.ok);

      if (!response.ok) {
        throw new Error("Failed to generate suggestions");
      }

      const data = await response.json();
      setProduct(data.product);
      setSuggestions(data.suggestions);

      // Reset all selections to defaults
      setTitleChoice("current");
      setSelectedAiTitleIndex(0);
      setCustomTitle("");
      setDescriptionChoice("current");
      setCustomDescription("");
      setSelectedTagsToAdd(false);
      setSelectedTagsToRemove(false);
      setCustomTagsToAdd("");
      setSeoChoice("current");
      setCustomSeoTitle("");
      setCustomSeoDescription("");

      // Scroll to suggestions section after a brief delay
      setTimeout(() => {
        suggestionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate suggestions");
    } finally {
      setLoading(false);
    }
  }

  async function applyChanges() {
    if (!product || !suggestions) return;

    // Determine what values will be applied
    const isTitleChanging = titleChoice !== "current";
    const isDescriptionChanging = descriptionChoice !== "current";
    const isSeoChanging = seoChoice !== "current";

    // Confirm with user
    const changesList = [];
    if (isTitleChanging) changesList.push(`title (${titleChoice})`);
    if (isDescriptionChanging) changesList.push(`description (${descriptionChoice})`);
    if (selectedTagsToAdd && suggestions.tags?.add.length) changesList.push("add AI-suggested tags");
    if (customTagsToAdd.trim()) changesList.push("add custom tags");
    if (selectedTagsToRemove && suggestions.tags?.remove.length) changesList.push("remove tags");
    if (isSeoChanging) changesList.push(`SEO metadata (${seoChoice})`);

    if (changesList.length === 0) {
      window.alert("No changes selected. Please select at least one change to apply.");
      return;
    }

    const confirmed = window.confirm(
      `Apply the following changes to "${product.title}"?\n\n- ${changesList.join("\n- ")}\n\nThis will update the product in Shopify.`
    );

    if (!confirmed) return;

    try {
      setApplying(true);
      setError(null);

      // Build request body
      const body: any = {};

      if (isTitleChanging) {
        if (titleChoice === "ai" && suggestions.title?.[selectedAiTitleIndex]) {
          body.title = suggestions.title[selectedAiTitleIndex].title;
        } else if (titleChoice === "custom" && customTitle.trim()) {
          body.title = customTitle.trim();
        }
      }

      if (isDescriptionChanging) {
        if (descriptionChoice === "ai" && suggestions.description) {
          body.description = suggestions.description.content;
        } else if (descriptionChoice === "custom" && customDescription.trim()) {
          body.description = customDescription.trim();
        }
      }

      // Handle tags - combine AI suggestions with custom tags
      const tagsToAdd: string[] = [];
      if (selectedTagsToAdd && suggestions.tags?.add.length) {
        tagsToAdd.push(...suggestions.tags.add);
      }
      if (customTagsToAdd.trim()) {
        const customTags = customTagsToAdd.split(",").map(t => t.trim()).filter(t => t);
        tagsToAdd.push(...customTags);
      }

      if (tagsToAdd.length > 0 || (selectedTagsToRemove && suggestions.tags?.remove.length)) {
        body.tags = {
          current: product.tags,
          add: tagsToAdd,
          remove: selectedTagsToRemove ? suggestions.tags?.remove || [] : [],
        };
      }

      if (isSeoChanging) {
        if (seoChoice === "ai" && suggestions.seo) {
          body.seo = {
            metaTitle: suggestions.seo.metaTitle,
            metaDescription: suggestions.seo.metaDescription,
          };
        } else if (seoChoice === "custom") {
          body.seo = {
            metaTitle: customSeoTitle.trim() || product.seo.title || product.title,
            metaDescription: customSeoDescription.trim() || product.seo.description || "",
          };
        }
      }

      // Extract numeric ID from GID for URL (GID contains slashes that break URLs)
      const numericId = productId.split('/').pop() || productId;
      const response = await fetch(
        `/api/optimize/apply/${numericId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to apply changes");
      }

      const data = await response.json();
      console.log("✅ Changes applied:", data);

      setApplySuccess(true);

      // Update the product data with the applied changes
      if (data.product) {
        setProduct(data.product);
      }

      // Clear suggestions to show the updated state
      setSuggestions(null);

      // Scroll to top to show success message
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply changes");
    } finally {
      setApplying(false);
    }
  }

  async function navigateToNextProduct() {
    try {
      // Fetch all products to find current position
      const response = await fetch("/api/optimize/products?sortBy=score");

      if (response.ok) {
        const data = await response.json();
        if (data.products && data.products.length > 0) {
          const currentIndex = data.products.findIndex((p: any) => p.productId === productId);
          const nextIndex = currentIndex + 1;

          if (nextIndex < data.products.length) {
            const nextProduct = data.products[nextIndex];
            const numericId = nextProduct.productId.split('/').pop() || nextProduct.productId;
            navigate(`/app/optimize/${numericId}`);
          } else {
            // No more products, go back to list
            navigate("/app/optimize");
          }
        } else {
          navigate("/app/optimize");
        }
      } else {
        navigate("/app/optimize");
      }
    } catch (err) {
      console.error("Error navigating to next product:", err);
      navigate("/app/optimize");
    }
  }

  async function navigateToPreviousProduct() {
    try {
      // Fetch all products to find current position
      const response = await fetch("/api/optimize/products?sortBy=score");

      if (response.ok) {
        const data = await response.json();
        if (data.products && data.products.length > 0) {
          const currentIndex = data.products.findIndex((p: any) => p.productId === productId);
          const prevIndex = currentIndex - 1;

          if (prevIndex >= 0) {
            const prevProduct = data.products[prevIndex];
            const numericId = prevProduct.productId.split('/').pop() || prevProduct.productId;
            navigate(`/app/optimize/${numericId}`);
          } else {
            // Already at first product, go back to list
            navigate("/app/optimize");
          }
        } else {
          navigate("/app/optimize");
        }
      } else {
        navigate("/app/optimize");
      }
    } catch (err) {
      console.error("Error navigating to previous product:", err);
      navigate("/app/optimize");
    }
  }

  return (
    <s-page heading={product?.title || productId || "Loading..."}>
      <s-section>
        <s-stack direction="inline" gap="base">
          <s-button onClick={() => navigate("/app/optimize")}>
            ← Back to Products
          </s-button>
          <s-button onClick={navigateToPreviousProduct}>
            ← Previous
          </s-button>
          <s-button onClick={navigateToNextProduct}>
            Next →
          </s-button>
          {loading ? (
            <s-button variant="primary" disabled>
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                Analyzing
                <span style={{ display: "flex", gap: "2px" }}>
                  <span style={{
                    width: "4px",
                    height: "4px",
                    borderRadius: "50%",
                    backgroundColor: "currentColor",
                    animation: "bounce 1.4s infinite ease-in-out both",
                    animationDelay: "-0.32s"
                  }} />
                  <span style={{
                    width: "4px",
                    height: "4px",
                    borderRadius: "50%",
                    backgroundColor: "currentColor",
                    animation: "bounce 1.4s infinite ease-in-out both",
                    animationDelay: "-0.16s"
                  }} />
                  <span style={{
                    width: "4px",
                    height: "4px",
                    borderRadius: "50%",
                    backgroundColor: "currentColor",
                    animation: "bounce 1.4s infinite ease-in-out both"
                  }} />
                </span>
              </span>
            </s-button>
          ) : !suggestions ? (
            <s-button variant="primary" onClick={generateSuggestions}>
              Generate AI Suggestions
            </s-button>
          ) : (
            <s-button onClick={generateSuggestions}>
              Regenerate Suggestions
            </s-button>
          )}
        </s-stack>
      </s-section>
      {error && (
        <s-section>
          <s-banner tone="critical">
            <s-text>{error}</s-text>
          </s-banner>
        </s-section>
      )}

      {applySuccess && (
        <s-section>
          <s-stack direction="block" gap="base">
            <s-banner tone="success">
              <s-text>
                ✅ Changes applied successfully!
              </s-text>
            </s-banner>
            <s-stack direction="inline" gap="base">
              <s-button variant="primary" onClick={navigateToNextProduct}>
                Next Product →
              </s-button>
              <s-button onClick={() => window.location.reload()}>
                Refresh Page
              </s-button>
              <s-button onClick={() => navigate("/app/optimize")}>
                Back to List
              </s-button>
            </s-stack>
          </s-stack>
        </s-section>
      )}

      {/* Show Current Product Info */}
      <s-section heading="Current Product Information">
        {productLoading ? (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text>Loading product information...</s-text>
          </s-box>
        ) : product ? (
          <s-stack direction="block" gap="base">
            {/* Product Images */}
            {product.images?.nodes && product.images.nodes.length > 0 && (
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  <s-text><strong>Product Images ({product.images.nodes.length})</strong></s-text>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {product.images.nodes.map((image, index) => (
                      <img
                        key={index}
                        src={image.url}
                        alt={image.altText || `Product image ${index + 1}`}
                        style={{
                          width: "100px",
                          height: "100px",
                          objectFit: "cover",
                          borderRadius: "4px",
                          border: "1px solid #ddd",
                        }}
                      />
                    ))}
                  </div>
                </s-stack>
              </s-box>
            )}

            {/* Basic Info */}
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                <s-text><strong>Title:</strong> {product.title}</s-text>
                <s-text><strong>Handle:</strong> {product.handle}</s-text>
                {product.productType && <s-text><strong>Product Type:</strong> {product.productType}</s-text>}
                {product.vendor && <s-text><strong>Vendor:</strong> {product.vendor}</s-text>}
              </s-stack>
            </s-box>

            {/* Description */}
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                <s-text><strong>Description:</strong></s-text>
                {product.description ? (
                  <s-text>{product.description}</s-text>
                ) : (
                  <s-text tone="caution"><em>No description set</em></s-text>
                )}
              </s-stack>
            </s-box>

            {/* Tags */}
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                <s-text><strong>Tags:</strong></s-text>
                {product.tags.length > 0 ? (
                  <s-text>{product.tags.join(", ")}</s-text>
                ) : (
                  <s-text tone="caution"><em>No tags set</em></s-text>
                )}
              </s-stack>
            </s-box>

            {/* Collections */}
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                <s-text><strong>Collections:</strong></s-text>
                {product.collections?.nodes && product.collections.nodes.length > 0 ? (
                  <s-text>{product.collections.nodes.map(c => c.title).join(", ")}</s-text>
                ) : (
                  <s-text tone="caution"><em>Not in any collections</em></s-text>
                )}
              </s-stack>
            </s-box>

            {/* SEO */}
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                <s-text><strong>SEO Meta Title:</strong></s-text>
                {product.seo.title ? (
                  <s-text>{product.seo.title}</s-text>
                ) : (
                  <s-text tone="caution"><em>Not set (using product title)</em></s-text>
                )}
                <s-text><strong>SEO Meta Description:</strong></s-text>
                {product.seo.description ? (
                  <s-text>{product.seo.description}</s-text>
                ) : (
                  <s-text tone="caution"><em>Not set</em></s-text>
                )}
              </s-stack>
            </s-box>
          </s-stack>
        ) : (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text tone="caution">Unable to load product information</s-text>
          </s-box>
        )}
      </s-section>

      {/* Show Analysis Issues */}
      {!analysisLoading && analysis && (
        <s-section heading="Optimization Analysis">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="base">
              <s-text>
                <strong>Optimization Score:</strong> {analysis.optimizationScore}/100
              </s-text>
              <s-text>
                <strong>Total Issues Found:</strong> {analysis.issuesCount}
              </s-text>
            </s-stack>
          </s-box>

          {analysis.issues.required && analysis.issues.required.length > 0 && (
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                <s-text tone="caution">
                  <strong>⚠️ Missing Information</strong>
                </s-text>
                <s-unordered-list>
                  {analysis.issues.required.map((issue, index) => (
                    <s-list-item key={index}>{issue}</s-list-item>
                  ))}
                </s-unordered-list>
              </s-stack>
            </s-box>
          )}

          {analysis.issues.title.length > 0 && (
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                <s-text><strong>Title Issues:</strong></s-text>
                <s-unordered-list>
                  {analysis.issues.title.map((issue, index) => (
                    <s-list-item key={index}>{issue}</s-list-item>
                  ))}
                </s-unordered-list>
              </s-stack>
            </s-box>
          )}

          {analysis.issues.description.length > 0 && (
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                <s-text><strong>Description Issues:</strong></s-text>
                <s-unordered-list>
                  {analysis.issues.description.map((issue, index) => (
                    <s-list-item key={index}>{issue}</s-list-item>
                  ))}
                </s-unordered-list>
              </s-stack>
            </s-box>
          )}

          {analysis.issues.tags.length > 0 && (
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                <s-text><strong>Tags Issues:</strong></s-text>
                <s-unordered-list>
                  {analysis.issues.tags.map((issue, index) => (
                    <s-list-item key={index}>{issue}</s-list-item>
                  ))}
                </s-unordered-list>
              </s-stack>
            </s-box>
          )}

          {analysis.issues.seo.length > 0 && (
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                <s-text><strong>SEO Issues:</strong></s-text>
                <s-unordered-list>
                  {analysis.issues.seo.map((issue, index) => (
                    <s-list-item key={index}>{issue}</s-list-item>
                  ))}
                </s-unordered-list>
              </s-stack>
            </s-box>
          )}

          {analysis.issues.images.length > 0 && (
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                <s-text><strong>Image Issues:</strong></s-text>
                <s-unordered-list>
                  {analysis.issues.images.map((issue, index) => (
                    <s-list-item key={index}>{issue}</s-list-item>
                  ))}
                </s-unordered-list>
              </s-stack>
            </s-box>
          )}

          {analysis.issues.warnings && analysis.issues.warnings.length > 0 && (
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                <s-text tone="caution">
                  <strong>⚠️ Warnings</strong>
                </s-text>
                <s-unordered-list>
                  {analysis.issues.warnings.map((issue, index) => (
                    <s-list-item key={index}>
                      <span style={{ color: "orange" }}>{issue}</span>
                    </s-list-item>
                  ))}
                </s-unordered-list>
              </s-stack>
            </s-box>
          )}
        </s-section>
      )}

      {/* CSS for loading animation */}
      <style>
        {`
          @keyframes bounce {
            0%, 80%, 100% {
              transform: scale(0.6);
              opacity: 0.5;
            }
            40% {
              transform: scale(1);
              opacity: 1;
            }
          }
        `}
      </style>

      {suggestions && product && (
        <div ref={suggestionsRef}>
          {/* Image Analysis */}
          {suggestions.imageAnalysis && (
            <s-section heading="Image Analysis">
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  <s-text>
                    <strong>Visual Attributes:</strong>{" "}
                    {suggestions.imageAnalysis.attributes.join(", ")}
                  </s-text>
                  <s-text>
                    <strong>Keywords:</strong>{" "}
                    {suggestions.imageAnalysis.keywords.join(", ")}
                  </s-text>
                </s-stack>
              </s-box>
            </s-section>
          )}

          {/* Title Suggestions */}
          {suggestions.title && suggestions.title.length > 0 && (
            <s-section heading="Title Suggestions">
              <s-stack direction="block" gap="base">
                {/* Current title option (default) */}
                <s-box
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background={titleChoice === "current" ? "subdued" : undefined}
                >
                  <s-stack direction="inline" gap="base">
                    <input
                      type="radio"
                      name="title"
                      checked={titleChoice === "current"}
                      onChange={() => setTitleChoice("current")}
                    />
                    <s-stack direction="block" gap="none">
                      <s-text>
                        <strong>{product.title}</strong>
                      </s-text>
                      <s-text>
                        <em>Keep current title (no change)</em>
                      </s-text>
                    </s-stack>
                  </s-stack>
                </s-box>

                {/* AI-generated suggestions */}
                {suggestions.title.map((suggestion, index) => (
                  <s-box
                    key={index}
                    padding="base"
                    borderWidth="base"
                    borderRadius="base"
                    background={titleChoice === "ai" && selectedAiTitleIndex === index ? "subdued" : undefined}
                  >
                    <s-stack direction="block" gap="base">
                      <s-stack direction="inline" gap="base">
                        <input
                          type="radio"
                          name="title"
                          checked={titleChoice === "ai" && selectedAiTitleIndex === index}
                          onChange={() => {
                            setTitleChoice("ai");
                            setSelectedAiTitleIndex(index);
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <s-stack direction="block" gap="none">
                            <s-text>
                              <strong>{suggestion.title}</strong>
                            </s-text>
                            <s-text>
                              <em>{suggestion.reasoning}</em>
                            </s-text>
                          </s-stack>
                        </div>
                        <s-button
                          variant="tertiary"
                          onClick={() => copyToCustomTitle(suggestion.title)}
                        >
                          📝 Edit
                        </s-button>
                      </s-stack>
                    </s-stack>
                  </s-box>
                ))}

                {/* Custom title option */}
                <s-box
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background={titleChoice === "custom" ? "subdued" : undefined}
                >
                  <s-stack direction="block" gap="base">
                    <s-stack direction="inline" gap="base">
                      <input
                        type="radio"
                        name="title"
                        checked={titleChoice === "custom"}
                        onChange={() => setTitleChoice("custom")}
                      />
                      <s-text>
                        <strong>Use custom title</strong>
                      </s-text>
                    </s-stack>
                    <input
                      type="text"
                      value={customTitle}
                      onChange={(e) => {
                        setCustomTitle(e.target.value);
                        setTitleChoice("custom");
                      }}
                      placeholder="Enter your custom title..."
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "1px solid #c9cccf",
                        borderRadius: "4px",
                        fontSize: "14px",
                      }}
                    />
                    <s-text>
                      <em>💡 Click "Edit" on any AI suggestion to copy it here and customize</em>
                    </s-text>
                  </s-stack>
                </s-box>
              </s-stack>
            </s-section>
          )}

          {/* Description Suggestion */}
          {suggestions.description && (
            <s-section heading="Description Suggestion">
              <s-stack direction="block" gap="base">
                {/* Keep current option (default) */}
                <s-box
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background={descriptionChoice === "current" ? "subdued" : undefined}
                >
                  <s-stack direction="inline" gap="base">
                    <input
                      type="radio"
                      name="description"
                      checked={descriptionChoice === "current"}
                      onChange={() => setDescriptionChoice("current")}
                    />
                    <s-stack direction="block" gap="none">
                      <s-text>
                        <strong>Keep current description</strong>
                      </s-text>
                      <s-text>
                        <em>{product.description || "No description"}</em>
                      </s-text>
                    </s-stack>
                  </s-stack>
                </s-box>

                {/* AI suggestion option */}
                <s-box
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background={descriptionChoice === "ai" ? "subdued" : undefined}
                >
                  <s-stack direction="block" gap="base">
                    <s-stack direction="inline" gap="base">
                      <input
                        type="radio"
                        name="description"
                        checked={descriptionChoice === "ai"}
                        onChange={() => setDescriptionChoice("ai")}
                      />
                      <div style={{ flex: 1 }}>
                        <s-text>
                          <strong>Use AI-Generated Description</strong>
                        </s-text>
                      </div>
                      <s-button
                        variant="tertiary"
                        onClick={() => copyToCustomDescription(suggestions.description!.content)}
                      >
                        📝 Edit
                      </s-button>
                    </s-stack>

                    <s-box padding="base" borderWidth="base" borderRadius="base">
                      <div
                        dangerouslySetInnerHTML={{
                          __html: suggestions.description.content,
                        }}
                      />
                    </s-box>

                    {suggestions.description.improvements.length > 0 && (
                      <s-stack direction="block" gap="none">
                        <s-text>
                          <strong>Key Improvements:</strong>
                        </s-text>
                        <s-unordered-list>
                          {suggestions.description.improvements.map(
                            (improvement, index) => (
                              <s-list-item key={index}>{improvement}</s-list-item>
                            )
                          )}
                        </s-unordered-list>
                      </s-stack>
                    )}
                  </s-stack>
                </s-box>

                {/* Custom description option */}
                <s-box
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background={descriptionChoice === "custom" ? "subdued" : undefined}
                >
                  <s-stack direction="block" gap="base">
                    <s-stack direction="inline" gap="base">
                      <input
                        type="radio"
                        name="description"
                        checked={descriptionChoice === "custom"}
                        onChange={() => setDescriptionChoice("custom")}
                      />
                      <s-text>
                        <strong>Use custom description</strong>
                      </s-text>
                    </s-stack>
                    <textarea
                      value={customDescription}
                      onChange={(e) => {
                        setCustomDescription(e.target.value);
                        setDescriptionChoice("custom");
                      }}
                      placeholder="Enter your custom description (HTML supported)..."
                      rows={6}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "1px solid #c9cccf",
                        borderRadius: "4px",
                        fontSize: "14px",
                        fontFamily: "inherit",
                        resize: "vertical",
                      }}
                    />
                    <s-text>
                      <em>💡 Click "Edit" on the AI suggestion to copy it here and customize. HTML formatting is supported.</em>
                    </s-text>
                  </s-stack>
                </s-box>
              </s-stack>
            </s-section>
          )}

          {/* Tags Suggestions */}
          {suggestions.tags && (
            <s-section heading="Tags Suggestions">
              <s-stack direction="block" gap="base">
                {/* Current tags display */}
                <s-box padding="base" borderWidth="base" borderRadius="base">
                  <s-stack direction="block" gap="none">
                    <s-text>
                      <strong>Current Tags:</strong>
                    </s-text>
                    <s-text>
                      <em>{product.tags.length > 0 ? product.tags.join(", ") : "No tags"}</em>
                    </s-text>
                  </s-stack>
                </s-box>

                {/* Add tags option */}
                {suggestions.tags.add.length > 0 && (
                  <s-box
                    padding="base"
                    borderWidth="base"
                    borderRadius="base"
                    background={selectedTagsToAdd ? "subdued" : undefined}
                  >
                    <s-stack direction="block" gap="base">
                      <s-stack direction="inline" gap="base">
                        <input
                          type="checkbox"
                          checked={selectedTagsToAdd}
                          onChange={(e) => setSelectedTagsToAdd(e.target.checked)}
                        />
                        <s-stack direction="block" gap="none">
                          <s-text>
                            <strong>Add suggested tags</strong>
                          </s-text>
                          <s-text tone="success">
                            + {suggestions.tags.add.join(", ")}
                          </s-text>
                        </s-stack>
                      </s-stack>
                    </s-stack>
                  </s-box>
                )}

                {/* Remove tags option */}
                {suggestions.tags.remove.length > 0 && (
                  <s-box
                    padding="base"
                    borderWidth="base"
                    borderRadius="base"
                    background={selectedTagsToRemove ? "subdued" : undefined}
                  >
                    <s-stack direction="block" gap="base">
                      <s-stack direction="inline" gap="base">
                        <input
                          type="checkbox"
                          checked={selectedTagsToRemove}
                          onChange={(e) => setSelectedTagsToRemove(e.target.checked)}
                        />
                        <s-stack direction="block" gap="none">
                          <s-text>
                            <strong>Remove suggested tags</strong>
                          </s-text>
                          <s-text tone="critical">
                            - {suggestions.tags.remove.join(", ")}
                          </s-text>
                        </s-stack>
                      </s-stack>
                    </s-stack>
                  </s-box>
                )}

                {/* Custom tags input */}
                <s-box
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background={customTagsToAdd.trim() ? "subdued" : undefined}
                >
                  <s-stack direction="block" gap="base">
                    <s-text>
                      <strong>Add your own tags</strong>
                    </s-text>
                    <input
                      type="text"
                      value={customTagsToAdd}
                      onChange={(e) => setCustomTagsToAdd(e.target.value)}
                      placeholder="Enter tags separated by commas (e.g., summer, sale, new-arrival)"
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "1px solid #c9cccf",
                        borderRadius: "4px",
                        fontSize: "14px",
                      }}
                    />
                    <s-text>
                      <em>💡 You can add your own tags in addition to AI suggestions. Separate with commas.</em>
                    </s-text>
                  </s-stack>
                </s-box>

                {/* Reasoning */}
                <s-box padding="base" borderWidth="base" borderRadius="base">
                  <s-text>
                    <em>💡 {suggestions.tags.reasoning}</em>
                  </s-text>
                </s-box>
              </s-stack>
            </s-section>
          )}

          {/* SEO Metadata */}
          {suggestions.seo && (
            <s-section heading="SEO Metadata">
              <s-stack direction="block" gap="base">
                {/* Keep current option (default) */}
                <s-box
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background={seoChoice === "current" ? "subdued" : undefined}
                >
                  <s-stack direction="inline" gap="base">
                    <input
                      type="radio"
                      name="seo"
                      checked={seoChoice === "current"}
                      onChange={() => setSeoChoice("current")}
                    />
                    <s-stack direction="block" gap="none">
                      <s-text>
                        <strong>Keep current SEO metadata</strong>
                      </s-text>
                      <s-text>
                        <em>Title: {product.seo.title || "Not set (using product title)"}</em>
                      </s-text>
                      <s-text>
                        <em>Description: {product.seo.description || "Not set"}</em>
                      </s-text>
                    </s-stack>
                  </s-stack>
                </s-box>

                {/* AI suggestion option */}
                <s-box
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background={seoChoice === "ai" ? "subdued" : undefined}
                >
                  <s-stack direction="block" gap="base">
                    <s-stack direction="inline" gap="base">
                      <input
                        type="radio"
                        name="seo"
                        checked={seoChoice === "ai"}
                        onChange={() => setSeoChoice("ai")}
                      />
                      <div style={{ flex: 1 }}>
                        <s-text>
                          <strong>Use AI-Generated SEO Metadata</strong>
                        </s-text>
                      </div>
                      <s-button
                        variant="tertiary"
                        onClick={() => copyToCustomSeo(suggestions.seo!.metaTitle, suggestions.seo!.metaDescription)}
                      >
                        📝 Edit
                      </s-button>
                    </s-stack>

                    <s-stack direction="block" gap="none">
                      <s-text>
                        <strong>Meta Title:</strong> {suggestions.seo.metaTitle}
                      </s-text>
                      <s-text>
                        <strong>Meta Description:</strong> {suggestions.seo.metaDescription}
                      </s-text>
                    </s-stack>

                    <s-text>
                      <em>💡 {suggestions.seo.reasoning}</em>
                    </s-text>
                  </s-stack>
                </s-box>

                {/* Custom SEO option */}
                <s-box
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background={seoChoice === "custom" ? "subdued" : undefined}
                >
                  <s-stack direction="block" gap="base">
                    <s-stack direction="inline" gap="base">
                      <input
                        type="radio"
                        name="seo"
                        checked={seoChoice === "custom"}
                        onChange={() => setSeoChoice("custom")}
                      />
                      <s-text>
                        <strong>Use custom SEO metadata</strong>
                      </s-text>
                    </s-stack>

                    <s-stack direction="block" gap="base">
                      <s-stack direction="block" gap="none">
                        <s-text><strong>Meta Title:</strong></s-text>
                        <input
                          type="text"
                          value={customSeoTitle}
                          onChange={(e) => {
                            setCustomSeoTitle(e.target.value);
                            setSeoChoice("custom");
                          }}
                          placeholder="Enter custom meta title..."
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            border: "1px solid #c9cccf",
                            borderRadius: "4px",
                            fontSize: "14px",
                          }}
                        />
                      </s-stack>

                      <s-stack direction="block" gap="none">
                        <s-text><strong>Meta Description:</strong></s-text>
                        <textarea
                          value={customSeoDescription}
                          onChange={(e) => {
                            setCustomSeoDescription(e.target.value);
                            setSeoChoice("custom");
                          }}
                          placeholder="Enter custom meta description..."
                          rows={3}
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            border: "1px solid #c9cccf",
                            borderRadius: "4px",
                            fontSize: "14px",
                            fontFamily: "inherit",
                            resize: "vertical",
                          }}
                        />
                      </s-stack>
                    </s-stack>

                    <s-text>
                      <em>💡 Click "Edit" on the AI suggestion to copy it here and customize</em>
                    </s-text>
                  </s-stack>
                </s-box>
              </s-stack>
            </s-section>
          )}

          {/* Action Buttons */}
          <s-section heading="Apply Changes">
            <s-paragraph>
              Review the suggestions above and select which changes you'd like
              to apply. Then click "Apply Selected Changes" to update your
              product in Shopify.
            </s-paragraph>

            <s-stack direction="inline" gap="base">
              <s-button
                variant="primary"
                disabled={
                  applying ||
                  applySuccess ||
                  (titleChoice === "current" &&
                    descriptionChoice === "current" &&
                    !selectedTagsToAdd &&
                    !selectedTagsToRemove &&
                    !customTagsToAdd.trim() &&
                    seoChoice === "current")
                }
                onClick={applyChanges}
              >
                {applying
                  ? "Applying Changes..."
                  : applySuccess
                    ? "Changes Applied ✓"
                    : "Apply Selected Changes"}
              </s-button>

              <s-button
                disabled={applying}
                onClick={() => navigate("/app/optimize")}
              >
                Skip This Product
              </s-button>
            </s-stack>
          </s-section>
        </div>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
