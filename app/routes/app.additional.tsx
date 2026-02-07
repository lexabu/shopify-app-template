import { useEffect, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export default function SettingsPage() {
  const [customContext, setCustomContext] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load current settings
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    fetch("/api/settings")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        if (isMounted) {
          setCustomContext(data.customContext || "");
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error("Failed to load settings:", err);
          setError("Failed to load settings. Please refresh the page.");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ customContext }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save settings:", err);
      setError("Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <s-page heading="Settings">
      {error && (
        <s-section>
          <s-banner tone="critical">
            <s-text>{error}</s-text>
          </s-banner>
        </s-section>
      )}

      {success && (
        <s-section>
          <s-banner tone="success">
            <s-text>Settings saved successfully!</s-text>
          </s-banner>
        </s-section>
      )}

      <s-section heading="AI Custom Context">
        <s-paragraph>
          Add custom instructions to guide how the AI assistant behaves when helping your customers. This context is sent to the AI with every recommendation.
        </s-paragraph>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack gap="base">
            <s-heading>What can you customize?</s-heading>
            <s-unordered-list>
              <s-list-item><strong>Tone & Style:</strong> "Always be professional and formal" or "Use a casual, friendly tone"</s-list-item>
              <s-list-item><strong>Store Policies:</strong> "We offer free shipping on orders over $50" or "All products come with a 30-day return policy"</s-list-item>
              <s-list-item><strong>Brand Identity:</strong> "We are an eco-friendly brand focused on sustainability"</s-list-item>
              <s-list-item><strong>Special Information:</strong> "Our products are handmade and ship within 3-5 business days"</s-list-item>
              <s-list-item><strong>Target Audience:</strong> "Our customers are fitness enthusiasts and athletes"</s-list-item>
            </s-unordered-list>
          </s-stack>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack gap="base">
            <s-heading>Example Custom Context</s-heading>
            <s-box padding="base">
              <s-text>
                "You are helping customers of GreenLife Organics, an eco-friendly beauty brand. Always emphasize our commitment to sustainability and organic ingredients. Mention that all products are cruelty-free and vegan. We offer free shipping on orders over $40. Use a warm, friendly tone that reflects our natural, earth-conscious values."
              </s-text>
            </s-box>
          </s-stack>
        </s-box>

        {loading ? (
          <s-text>Loading settings...</s-text>
        ) : (
          <s-stack gap="base">
            <s-text>
              <strong>Your Custom Context:</strong>
            </s-text>
            <textarea
              value={customContext}
              onChange={(e) => setCustomContext(e.target.value)}
              placeholder="Enter custom instructions for the AI assistant... (Optional)"
              rows={8}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "4px",
                border: "1px solid #ccc",
                fontFamily: "inherit",
                fontSize: "14px",
                resize: "vertical",
              }}
            />
            <s-text>
              Leave empty to use default AI behavior. Maximum 1000 characters recommended.
            </s-text>
            <s-stack direction="inline" gap="base">
              <s-button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save Settings"}
              </s-button>
              {customContext && (
                <s-button
                  onClick={() => setCustomContext("")}
                  disabled={saving}
                >
                  Clear
                </s-button>
              )}
            </s-stack>
          </s-stack>
        )}
      </s-section>

      <s-section heading="How It Works">
        <s-paragraph>
          When a customer asks a question, the AI receives:
        </s-paragraph>
        <s-unordered-list>
          <s-list-item>1. Your custom context (if provided)</s-list-item>
          <s-list-item>2. The customer's question</s-list-item>
          <s-list-item>3. Matching products from your catalog</s-list-item>
        </s-unordered-list>
        <s-paragraph>
          The AI then generates a personalized response that follows your guidelines while recommending relevant products.
        </s-paragraph>
      </s-section>

      <s-section heading="Tips for Best Results">
        <s-unordered-list>
          <s-list-item>✅ Be specific about your brand voice and values</s-list-item>
          <s-list-item>✅ Mention key policies customers should know (shipping, returns, etc.)</s-list-item>
          <s-list-item>✅ Keep it concise - focus on the most important information</s-list-item>
          <s-list-item>❌ Avoid overly long context (aim for 2-4 sentences)</s-list-item>
          <s-list-item>❌ Don't include product-specific details - those come from your product data</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
