import type { KaratPrice } from "../services/gold-price.server";

interface TickerPreviewProps {
  settings: {
    karats: string[];
    bgColor: string;
    textColor: string;
    tickerSpeed: number;
    position: string;
    currencySymbol: string;
    isActive: boolean;
  };
  prices: Record<string, KaratPrice> | null;
}

export function TickerPreview({ settings, prices }: TickerPreviewProps) {
  if (!settings.isActive) {
    return (
      <div
        style={{
          padding: "24px",
          textAlign: "center",
          color: "#6d7175",
          backgroundColor: "#f6f6f7",
          borderRadius: 8,
        }}
      >
        Ticker is disabled
      </div>
    );
  }

  // Use real prices if available, otherwise mock data
  const displayPrices = prices || {
    "24K": { pricePerGram: 85.2, karat: 24, purity: 1 },
    "22K": { pricePerGram: 78.1, karat: 22, purity: 0.917 },
    "21K": { pricePerGram: 74.55, karat: 21, purity: 0.875 },
    "18K": { pricePerGram: 63.9, karat: 18, purity: 0.75 },
    "14K": { pricePerGram: 49.7, karat: 14, purity: 0.583 },
  };

  const enabledKarats = settings.karats
    .map((k) => `${k}K`)
    .filter((k) => k in displayPrices)
    .sort((a, b) => parseInt(b) - parseInt(a));

  return (
    <div
      style={{
        backgroundColor: settings.bgColor,
        padding: "10px 16px",
        borderRadius: 8,
        overflow: "hidden",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 24,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        {enabledKarats.map((karat) => {
          const price = displayPrices[karat];
          if (!price) return null;
          return (
            <span
              key={karat}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
              }}
            >
              <span
                style={{
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: 11,
                  opacity: 0.85,
                }}
              >
                {karat}
              </span>
              <span
                style={{
                  color: settings.textColor,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {settings.currencySymbol}
                {price.pricePerGram.toFixed(2)}
              </span>
              <span
                style={{
                  color: "#ffffff",
                  opacity: 0.5,
                  fontSize: 11,
                }}
              >
                /g
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
