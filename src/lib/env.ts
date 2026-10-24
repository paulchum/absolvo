import path from "node:path";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

function number(name: string, fallback: number, min = 0) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min) throw new Error(`${name} must be a number of at least ${min}.`);
  return value;
}

export function appUrl() { return (process.env.APP_URL || "http://localhost:3020").replace(/\/$/, ""); }
export function appOrigin() { return new URL(appUrl()).origin; }
export function dataDir() { return path.resolve(/*turbopackIgnore: true*/ process.env.ABSOLVO_DATA_DIR || ".data"); }
export function isProduction() { return process.env.NODE_ENV === "production"; }
export function secureCookies() { return appUrl().startsWith("https://"); }

export function isLocalOrigin(value = appUrl()) {
  try {
    const { hostname, protocol } = new URL(value);
    return (protocol === "http:" || protocol === "https:") && (["localhost", "127.0.0.1", "[::1]"].includes(hostname) || hostname.endsWith(".localhost"));
  } catch { return false; }
}

export function anthropicConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
}
export function inquisitorMode(): "live" | "mock" {
  const mode = process.env.ABSOLVO_INQUISITOR || "auto";
  if (mode === "live" || mode === "mock") return mode;
  if (mode !== "auto") throw new Error("ABSOLVO_INQUISITOR must be auto, live or mock.");
  if (anthropicConfigured()) return "live";
  if (isProduction() && !isLocalOrigin()) throw new Error("The Inquisitor needs ANTHROPIC_API_KEY (or ABSOLVO_INQUISITOR=mock).");
  return "mock";
}
export function model() { return process.env.ABSOLVO_MODEL || "claude-opus-5-5"; }
export function effort(): Effort {
  const value = (process.env.ABSOLVO_EFFORT || "medium") as Effort;
  if (!EFFORTS.includes(value)) throw new Error("ABSOLVO_EFFORT must be low, medium, high, xhigh or max.");
  return value;
}
export function judgmentsPerHour() { return Math.floor(number("ABSOLVO_JUDGMENTS_PER_HOUR", 6, 1)); }
/** Applies to everyone at once, so free roasts stay bounded even when client IPs are unknown. */
export function globalJudgmentsPerHour() { return Math.floor(number("ABSOLVO_JUDGMENTS_GLOBAL_PER_HOUR", 240, 1)); }
export function dailySpendMicros() { return Math.round(number("ABSOLVO_DAILY_SPEND_USD", 25) * 1_000_000); }
export function tokenPrices() {
  return { input: number("ABSOLVO_INPUT_USD_PER_MILLION", 4), output: number("ABSOLVO_OUTPUT_USD_PER_MILLION", 20) };
}

/** Malphas, the Arch-Prelate of the Abyss: any OpenAI-compatible endpoint (DeepSeek by default, or OpenRouter). */
export function deepseekConfigured() { return Boolean(process.env.DEEPSEEK_API_KEY); }
export function deepseekBaseUrl() { return (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1").replace(/\/$/, ""); }
export function abyssalModel() { return process.env.ABSOLVO_ABYSSAL_MODEL || "deepseek-chat"; }
/** True when the abyssal model reads images itself; otherwise images are transcribed locally first. */
export function abyssalVision() { return process.env.ABSOLVO_ABYSSAL_VISION === "true"; }
export function abyssMode(): "live" | "mock" | "off" {
  if (deepseekConfigured()) return "live";
  return inquisitorMode() === "mock" ? "mock" : "off";
}
export function abyssalTokenPrices() {
  return { input: number("ABSOLVO_ABYSSAL_INPUT_USD_PER_MILLION", 1), output: number("ABSOLVO_ABYSSAL_OUTPUT_USD_PER_MILLION", 4) };
}

export function stripeSecretKey() { return process.env.STRIPE_SECRET_KEY || ""; }
export function stripeConfigured() { return Boolean(process.env.STRIPE_SECRET_KEY); }
export type Tier = "parish" | "abyssal";
export function price(tier: Tier = "parish") {
  const cents = tier === "abyssal" ? Math.round(number("ABSOLVO_ABYSSAL_PRICE_CENTS", 499, 50)) : Math.round(number("ABSOLVO_PRICE_CENTS", 199, 50));
  const currency = (process.env.ABSOLVO_CURRENCY || "usd").toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) throw new Error("ABSOLVO_CURRENCY must be a three-letter currency code.");
  return { cents, currency, priceId: (tier === "abyssal" ? process.env.STRIPE_ABYSSAL_PRICE_ID : process.env.STRIPE_PRICE_ID) || null };
}
export function formatPrice(tier: Tier = "parish") {
  const { cents, currency } = price(tier);
  return new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

/** The free dispensation exists only on a developer's machine: every condition must hold at request time. */
export function bypassRefusal(requestHost: string, forwardedFor: string | null) {
  if (process.env.ABSOLVO_DEV_BYPASS !== "true") return "The dispensation is disabled.";
  if (isProduction() && process.env.ABSOLVO_DEV_BYPASS_IN_PRODUCTION !== "true") return "Dispensations are refused in production builds.";
  if (!isLocalOrigin()) return "Dispensations are refused when APP_URL is public.";
  if (stripeSecretKey().startsWith("sk_live_") || stripeSecretKey().startsWith("rk_live_")) return "Dispensations are refused with live Stripe keys.";
  const host = requestHost.replace(/:\d+$/, "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host) && !host.endsWith(".localhost")) return "Dispensations are granted only on this machine.";
  const peer = (forwardedFor || "").split(",")[0].trim();
  if (peer && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer)) return "Dispensations are granted only on this machine.";
  return null;
}

export function unpaidTtlMs() { return number("ABSOLVO_UNPAID_TTL_HOURS", 24, 1) * 3_600_000; }
export function paidGraceMs() { return number("ABSOLVO_PAID_GRACE_MINUTES", 60, 1) * 60_000; }
export const CHECKOUT_MINUTES = 30;

export function wallDelayRange(): [number, number] {
  const raw = (process.env.ABSOLVO_WALL_DELAY_SECONDS || "30-180").trim();
  const [low, high = low] = raw.split("-").map(part => Number(part.trim()));
  if (!Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high < low) throw new Error("ABSOLVO_WALL_DELAY_SECONDS must look like 30-180.");
  return [low * 1000, high * 1000];
}
export function wallMaxStreams() { return Math.floor(number("ABSOLVO_WALL_MAX_STREAMS", 500, 1)); }
export function adminToken() { return process.env.ABSOLVO_ADMIN_TOKEN || ""; }

export function trustProxy() { return process.env.ABSOLVO_TRUST_PROXY === "true"; }
export function clientIpHeader() {
  const name = (process.env.ABSOLVO_CLIENT_IP_HEADER || "x-real-ip").toLowerCase();
  if (!["x-real-ip", "cf-connecting-ip", "x-vercel-forwarded-for", "fly-client-ip"].includes(name)) throw new Error("Configure a supported trusted client IP header.");
  return name;
}
