import { useState, useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

type AnalyticsData = {
  analytics: {
    totalEvents: number;
    uniqueShopsCount: number;
    eventsByCategory: Array<{ category: string; count: number }>;
    topEvents: Array<{ event: string; count: number }>;
    activeShops: Array<{ shop: string; eventCount: number }>;
    eventsByDay: Array<{ date: string; count: number }>;
  };
  feedback: {
    totalFeedback: number;
    byType: Array<{ type: string; count: number }>;
    byStatus: Array<{ status: string; count: number }>;
    averageNpsRating: number | null;
    recentFeedback: Array<{
      id: string;
      shop: string;
      type: string;
      message: string;
      rating: number | null;
      createdAt: string;
    }>;
  } | null;
  period: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export default function AdminAnalytics() {
  const { shop } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const adminKey = searchParams.get("key");

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [days, setDays] = useState(30);

  useEffect(() => {
    async function fetchAnalytics() {
      if (!adminKey) {
        setUnauthorized(true);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(`/api/admin/analytics?days=${days}&feedback=true&key=${adminKey}`);
        if (response.status === 404) {
          setUnauthorized(true);
          return;
        }
        if (!response.ok) throw new Error("Failed to fetch analytics");
        const result = await response.json();
        setData(result);
        setUnauthorized(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, [days, adminKey]);

  if (loading) {
    return (
      <s-page heading="Admin Analytics">
        <s-section>
          <s-text>Loading analytics...</s-text>
        </s-section>
      </s-page>
    );
  }

  if (unauthorized) {
    return (
      <s-page heading="Not Found">
        <s-section>
          <s-text>Page not found.</s-text>
        </s-section>
      </s-page>
    );
  }

  if (error) {
    return (
      <s-page heading="Admin Analytics">
        <s-section>
          <s-banner tone="critical">
            <s-text>{error}</s-text>
          </s-banner>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Admin Analytics">
      {/* Period selector */}
      <s-section>
        <s-stack direction="inline" gap="base">
          <s-button
            variant={days === 7 ? "primary" : undefined}
            onClick={() => setDays(7)}
          >
            7 days
          </s-button>
          <s-button
            variant={days === 30 ? "primary" : undefined}
            onClick={() => setDays(30)}
          >
            30 days
          </s-button>
          <s-button
            variant={days === 90 ? "primary" : undefined}
            onClick={() => setDays(90)}
          >
            90 days
          </s-button>
        </s-stack>
      </s-section>

      {/* Overview */}
      <s-section heading="Overview">
        <s-stack direction="inline" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Total Events</s-heading>
            <s-text>{data?.analytics.totalEvents ?? 0}</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Active Shops</s-heading>
            <s-text>{data?.analytics.uniqueShopsCount ?? 0}</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Total Feedback</s-heading>
            <s-text>{data?.feedback?.totalFeedback ?? 0}</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Avg NPS Score</s-heading>
            <s-text>
              {data?.feedback?.averageNpsRating?.toFixed(1) ?? "N/A"}
            </s-text>
          </s-box>
        </s-stack>
      </s-section>

      {/* Events by Category */}
      <s-section heading="Events by Category">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          {data?.analytics.eventsByCategory.map((cat) => (
            <s-stack key={cat.category} direction="inline" gap="base">
              <s-text><strong>{cat.category}:</strong></s-text>
              <s-text>{cat.count}</s-text>
            </s-stack>
          ))}
        </s-box>
      </s-section>

      {/* Top Events */}
      <s-section heading="Top Events">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-unordered-list>
            {data?.analytics.topEvents.slice(0, 10).map((evt) => (
              <s-list-item key={evt.event}>
                {evt.event}: {evt.count}
              </s-list-item>
            ))}
          </s-unordered-list>
        </s-box>
      </s-section>

      {/* Most Active Shops */}
      <s-section heading="Most Active Shops">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-unordered-list>
            {data?.analytics.activeShops.map((s) => (
              <s-list-item key={s.shop}>
                {s.shop}: {s.eventCount} events
              </s-list-item>
            ))}
          </s-unordered-list>
        </s-box>
      </s-section>

      {/* Feedback by Type */}
      {data?.feedback && (
        <s-section heading="Feedback Summary">
          <s-stack direction="inline" gap="base">
            {data.feedback.byType.map((t) => (
              <s-box key={t.type} padding="base" borderWidth="base" borderRadius="base">
                <s-heading>{t.type}</s-heading>
                <s-text>{t.count}</s-text>
              </s-box>
            ))}
          </s-stack>
        </s-section>
      )}

      {/* Recent Feedback */}
      {data?.feedback?.recentFeedback && data.feedback.recentFeedback.length > 0 && (
        <s-section heading="Recent Feedback">
          <s-stack direction="block" gap="base">
            {data.feedback.recentFeedback.map((fb) => (
              <s-box key={fb.id} padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="none">
                  <s-stack direction="inline" gap="base">
                    <s-text><strong>{fb.type}</strong></s-text>
                    {fb.rating !== null && (
                      <s-text>Rating: {fb.rating}/10</s-text>
                    )}
                    <s-text><em>{fb.shop}</em></s-text>
                  </s-stack>
                  <s-text>{fb.message}</s-text>
                  <s-text>
                    <em>{new Date(fb.createdAt).toLocaleDateString()}</em>
                  </s-text>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
