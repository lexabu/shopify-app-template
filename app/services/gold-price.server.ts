import wretch from "wretch";

// --- Types ---

interface SwissQuoteProfile {
  spreadProfile: "standard" | "premium" | "prime";
  bidSpread: number;
  askSpread: number;
  bid: number;
  ask: number;
}

interface SwissQuoteResponse {
  topo: { platform: string; server: string };
  spreadProfilePrices: SwissQuoteProfile[];
  ts: number;
}

interface GoldApiResponse {
  timestamp: number;
  price: number;
  currency: string;
}

export interface KaratPrice {
  pricePerGram: number;
  karat: number;
  purity: number;
}

export interface GoldPriceData {
  spotPrice: number;
  prices: Record<string, KaratPrice>;
  fetchedAt: number;
  source: "swissquote" | "goldapi";
}

// --- Constants ---

const PRIMARY_GOLD_URL =
  "https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/XAU/USD";
const FALLBACK_GOLD_URL = "https://www.goldapi.io/api/XAU/USD";

const TROY_OZ_TO_GRAMS = 31.1035;
const KARATS = [24, 22, 21, 18, 14] as const;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// --- Cache ---

let cache: GoldPriceData | null = null;

function isCacheValid(): boolean {
  return cache !== null && Date.now() - cache.fetchedAt < CACHE_TTL_MS;
}

// --- Primary API: SwissQuote ---

async function getPrimaryGoldPrice(): Promise<number> {
  const response = await wretch(PRIMARY_GOLD_URL)
    .get()
    .json<SwissQuoteResponse[]>();

  // Search across ALL entries for the standard profile
  // The API returns multiple platform entries (SwissquoteLtd, AT, etc.)
  // and "standard" may not be in the first entry
  for (const entry of response) {
    const standard = entry.spreadProfilePrices?.find(
      (p: SwissQuoteProfile) => p.spreadProfile === "standard",
    );
    if (standard) return standard.ask;
  }

  // Fallback: try premium/prime across all entries
  for (const entry of response) {
    const premium = entry.spreadProfilePrices?.find(
      (p: SwissQuoteProfile) => p.spreadProfile === "premium",
    );
    if (premium) {
      console.warn("SwissQuote: Using premium profile (standard unavailable)");
      return premium.ask;
    }
  }

  for (const entry of response) {
    const prime = entry.spreadProfilePrices?.find(
      (p: SwissQuoteProfile) => p.spreadProfile === "prime",
    );
    if (prime) {
      console.warn("SwissQuote: Using prime profile (standard/premium unavailable)");
      return prime.ask;
    }
  }

  throw new Error("No valid SwissQuote price profiles available");
}

// --- Fallback API: GoldAPI ---

async function getFallbackGoldPrice(): Promise<number> {
  const apiKey = process.env.GOLD_API_KEY;
  if (!apiKey) {
    throw new Error("GOLD_API_KEY not configured for fallback");
  }

  const response = await wretch(FALLBACK_GOLD_URL)
    .headers({
      "x-access-token": apiKey,
      "Content-Type": "application/json",
    })
    .get()
    .json<GoldApiResponse>();

  if (!response.price) {
    throw new Error("Invalid response from GoldAPI (no price field)");
  }

  return response.price;
}

// --- Price Calculation ---

function calculateKaratPrices(spotPricePerOz: number): Record<string, KaratPrice> {
  const prices: Record<string, KaratPrice> = {};

  for (const karat of KARATS) {
    const purity = karat / 24;
    const pricePerGram = (spotPricePerOz / TROY_OZ_TO_GRAMS) * purity;

    prices[`${karat}K`] = {
      pricePerGram: Math.round(pricePerGram * 100) / 100,
      karat,
      purity: Math.round(purity * 1000) / 1000,
    };
  }

  return prices;
}

// --- Main Export ---

/**
 * Get gold prices with caching and fallback.
 * Returns cached data if within TTL, otherwise fetches fresh prices.
 * Tries SwissQuote first (free, no API key), falls back to GoldAPI.
 */
export async function getGoldPrices(): Promise<GoldPriceData> {
  if (isCacheValid()) {
    return cache!;
  }

  let spotPrice: number;
  let source: "swissquote" | "goldapi";

  try {
    spotPrice = await getPrimaryGoldPrice();
    source = "swissquote";
  } catch (primaryError) {
    console.error(
      "Primary gold API (SwissQuote) failed:",
      primaryError instanceof Error ? primaryError.message : primaryError,
    );

    try {
      spotPrice = await getFallbackGoldPrice();
      source = "goldapi";
      console.warn("Using fallback gold API (GoldAPI) successfully");
    } catch (fallbackError) {
      console.error(
        "Fallback gold API (GoldAPI) also failed:",
        fallbackError instanceof Error
          ? fallbackError.message
          : fallbackError,
      );

      // If we have stale cache, return it rather than failing
      if (cache) {
        console.warn("Returning stale cached gold price data");
        return cache;
      }

      throw new Error(
        `Both gold price APIs failed. Primary: ${
          primaryError instanceof Error ? primaryError.message : "Unknown"
        }. Fallback: ${
          fallbackError instanceof Error ? fallbackError.message : "Unknown"
        }`,
      );
    }
  }

  const prices = calculateKaratPrices(spotPrice);

  cache = {
    spotPrice,
    prices,
    fetchedAt: Date.now(),
    source,
  };

  return cache;
}
