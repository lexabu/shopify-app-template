import { useEffect, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

type DashboardData = {
  conversations: number;
  conversions: number;
  conversion_rate: number;
  attributed_revenue: number;
  commission_owed: number;
  top_queries: string[];
  rate_limiting: {
    current_minute: number;
    max_per_minute: number;
    current_hour: number;
    max_per_hour: number;
    current_day: number;
    max_per_day: number;
    percentage_used_minute: number;
    percentage_used_hour: number;
    percentage_used_day: number;
  };
  analytics: {
    ai_queries: number;
    basic_queries: number;
    fallback_used: number;
    total_queries: number;
  };
  rate_limit_rejections: {
    total: number;
    by_type: {
      shop_minute: number;
      shop_day: number;
      session_minute: number;
      session_hour: number;
      ip_minute: number;
      ip_hour: number;
    };
    last_updated: number;
  };
  product_optimizer: {
    products_analyzed: number;
    suggestions_generated: number;
    changes_applied_total: number;
    changes_applied_today: number;
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export default function Index() {
  const { shop } = useLoaderData<typeof loader>();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`/api/dashboard/${shop}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
      })
      .then((responseData) => {
        if (isMounted) {
          setData(responseData);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setData(null);
          setLoading(false);

          // Set user-friendly error message
          if (err.message.includes("Failed to fetch") || err.message.includes("NetworkError")) {
            setError("Unable to load dashboard. Please check your internet connection.");
          } else if (err.message.includes("HTTP 500") || err.message.includes("HTTP 502") || err.message.includes("HTTP 503")) {
            setError("Server error. Please try refreshing the page.");
          } else if (err.message.includes("HTTP 401") || err.message.includes("HTTP 403")) {
            setError("Authentication error. Please try logging in again.");
          } else {
            setError("Unable to load dashboard data. Please try refreshing the page.");
          }
        }
      });

    return () => {
      isMounted = false;
    };
  }, [shop]);

  return (
    <s-page heading="Product Finder Dashboard">
      {error && (
        <s-section>
          <s-banner tone="critical">
            <s-text>{error}</s-text>
          </s-banner>
        </s-section>
      )}

      {loading && !error && (
        <s-section>
          <s-text>Loading dashboard data...</s-text>
        </s-section>
      )}

      {!loading && !error && (
        <>
      <s-section>
        <s-stack direction="inline" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Conversations</s-heading>
            <s-text>{data?.conversations ?? 0}</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Conversions</s-heading>
            <s-text>{data?.conversions ?? 0}</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Conversion rate</s-heading>
            <s-text>
              {data
                ? `${(data.conversion_rate * 100).toFixed(1)}%`
                : "0%"}
            </s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Attributed revenue</s-heading>
            <s-text>
              {data ? `$${data.attributed_revenue.toFixed(2)}` : "$0.00"}
            </s-text>
          </s-box>
        </s-stack>
      </s-section>

      <s-section heading="Rate Limiting">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base">
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-heading>Current Hour</s-heading>
              <s-text>
                {data?.rate_limiting.current_hour ?? 0} / {data?.rate_limiting.max_per_hour ?? 1800} ({data?.rate_limiting.percentage_used_hour.toFixed(1) ?? 0}% used)
              </s-text>
            </s-box>
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-heading>Current Day</s-heading>
              <s-text>
                {data?.rate_limiting.current_day ?? 0} / {data?.rate_limiting.max_per_day ?? 5000} ({data?.rate_limiting.percentage_used_day.toFixed(1) ?? 0}% used)
              </s-text>
            </s-box>
          </s-stack>
          <s-paragraph>
            Rate limits protect your OpenAI API costs. Requests are limited to 30 per minute and 5,000 per day per shop. Hourly tracking shows rolling 60-minute window.
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Rate Limit Rejections (Last 24 Hours)">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base">
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-heading>Total Blocked</s-heading>
              <s-text>{data?.rate_limit_rejections.total ?? 0}</s-text>
            </s-box>
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-heading>Shop Limits</s-heading>
              <s-text>
                {(data?.rate_limit_rejections.by_type.shop_minute ?? 0) + (data?.rate_limit_rejections.by_type.shop_day ?? 0)}
              </s-text>
            </s-box>
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-heading>Session Limits</s-heading>
              <s-text>
                {(data?.rate_limit_rejections.by_type.session_minute ?? 0) + (data?.rate_limit_rejections.by_type.session_hour ?? 0)}
              </s-text>
            </s-box>
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-heading>IP Limits</s-heading>
              <s-text>
                {(data?.rate_limit_rejections.by_type.ip_minute ?? 0) + (data?.rate_limit_rejections.by_type.ip_hour ?? 0)}
              </s-text>
            </s-box>
          </s-stack>
          <s-paragraph>
            Tracks blocked requests by limit type. High IP-based rejections may indicate abuse or attack attempts. High session rejections may indicate users sending too many messages. Shop limit rejections affect all users.
          </s-paragraph>
        </s-stack>
        {data && data.rate_limit_rejections.total > 0 && (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Detailed Breakdown</s-heading>
            <s-unordered-list>
              {data.rate_limit_rejections.by_type.shop_minute > 0 && (
                <s-list-item>Shop per-minute limit: {data.rate_limit_rejections.by_type.shop_minute}</s-list-item>
              )}
              {data.rate_limit_rejections.by_type.shop_day > 0 && (
                <s-list-item>Shop daily limit: {data.rate_limit_rejections.by_type.shop_day}</s-list-item>
              )}
              {data.rate_limit_rejections.by_type.session_minute > 0 && (
                <s-list-item>Session per-minute limit: {data.rate_limit_rejections.by_type.session_minute}</s-list-item>
              )}
              {data.rate_limit_rejections.by_type.session_hour > 0 && (
                <s-list-item>Session hourly limit: {data.rate_limit_rejections.by_type.session_hour}</s-list-item>
              )}
              {data.rate_limit_rejections.by_type.ip_minute > 0 && (
                <s-list-item>IP per-minute limit: {data.rate_limit_rejections.by_type.ip_minute}</s-list-item>
              )}
              {data.rate_limit_rejections.by_type.ip_hour > 0 && (
                <s-list-item>IP hourly limit: {data.rate_limit_rejections.by_type.ip_hour}</s-list-item>
              )}
            </s-unordered-list>
          </s-box>
        )}
        {data && data.rate_limit_rejections.total > 100 && (
          <s-banner tone="warning">
            <s-text>⚠️ High number of blocked requests detected. This may indicate:</s-text>
            <s-unordered-list>
              <s-list-item>Bot or scraper activity (check IP-based rejections)</s-list-item>
              <s-list-item>Legitimate high traffic (consider requesting limit increases)</s-list-item>
              <s-list-item>Integration or testing tools making rapid requests</s-list-item>
            </s-unordered-list>
          </s-banner>
        )}
      </s-section>

      <s-section heading="Query Analytics (Today)">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base">
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-heading>Total Queries</s-heading>
              <s-text>{data?.analytics.total_queries ?? 0}</s-text>
            </s-box>
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-heading>AI Queries</s-heading>
              <s-text>{data?.analytics.ai_queries ?? 0}</s-text>
            </s-box>
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-heading>Basic Queries</s-heading>
              <s-text>{data?.analytics.basic_queries ?? 0}</s-text>
            </s-box>
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-heading>Fallback to Popular</s-heading>
              <s-text>{data?.analytics.fallback_used ?? 0}</s-text>
            </s-box>
          </s-stack>
          <s-paragraph>
            AI queries use OpenAI for smart recommendations. Basic queries use keyword matching. Fallback shows when no matching products were found and popular products were shown instead.
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Product Optimizer">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base">
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-heading>Products Analyzed</s-heading>
              <s-text>{data?.product_optimizer?.products_analyzed ?? 0}</s-text>
            </s-box>
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-heading>AI Suggestions Generated</s-heading>
              <s-text>{data?.product_optimizer?.suggestions_generated ?? 0}</s-text>
            </s-box>
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-heading>Changes Applied (Total)</s-heading>
              <s-text>{data?.product_optimizer?.changes_applied_total ?? 0}</s-text>
            </s-box>
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-heading>Changes Applied (Today)</s-heading>
              <s-text>{data?.product_optimizer?.changes_applied_today ?? 0}</s-text>
            </s-box>
          </s-stack>
          <s-paragraph>
            Track your product optimization activity. Products Analyzed shows how many products have been scanned. AI Suggestions Generated counts how many times you've used the AI to generate optimization suggestions. Changes Applied shows how many products have been updated.
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Top queries">
        {data?.top_queries?.length ? (
          <s-unordered-list>
            {data.top_queries.map((query) => (
              <s-list-item key={query}>{query}</s-list-item>
            ))}
          </s-unordered-list>
        ) : (
          <s-paragraph>No queries yet.</s-paragraph>
        )}
      </s-section>
        </>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
