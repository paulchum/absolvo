import fs from "node:fs";
import { anthropicConfigured, appUrl, deepseekConfigured, isLocalOrigin, trustProxy } from "../src/lib/env";
import { appleConfig } from "../src/lib/wallet/apple";
import { googleConfig } from "../src/lib/wallet/google";

/** Pre-launch assertions. FAIL blocks a launch; WARN is a decision to make knowingly. */
type Level = "PASS" | "WARN" | "FAIL";
const results: [Level, string][] = [];
const check = (ok: boolean, message: string, otherwise: Level = "FAIL") => results.push([ok ? "PASS" : otherwise, message]);
const env = (name: string) => process.env[name] || "";
const readable = (name: string) => { try { return Boolean(env(name)) && fs.statSync(env(name)).isFile(); } catch { return false; } };

check(appUrl().startsWith("https://") && !isLocalOrigin(), `APP_URL is a public HTTPS origin (${appUrl()})`);
check(env("ABSOLVO_DEV_BYPASS") !== "true", "The free dispensation is off (ABSOLVO_DEV_BYPASS)");
check(env("ABSOLVO_INQUISITOR") !== "mock" && anthropicConfigured(), "The live Inquisitor has an Anthropic credential");
check(deepseekConfigured(), "Malphas has a key (DEEPSEEK_API_KEY); else every refusal ends at the rejection scroll", "WARN");
check(env("STRIPE_SECRET_KEY").startsWith("sk_live_") || env("STRIPE_SECRET_KEY").startsWith("rk_live_"), "Stripe uses a live key", env("STRIPE_SECRET_KEY") ? "WARN" : "FAIL");
check(Boolean(env("STRIPE_WEBHOOK_SECRET")), "Stripe webhook secret is set (endpoint: /api/stripe/webhook)");
check(Boolean(env("ABSOLVO_SIGNING_KEY")), "Certificate signing key is pinned in the environment (else it lives only in the data volume)", "WARN");
check(/^[a-f\d]{64}$/i.test(env("ABSOLVO_SESSION_SECRET")), "Session secret is pinned (32-byte hex)", "WARN");
check(appleConfig().real && ["APPLE_PASS_CERT", "APPLE_PASS_KEY", "APPLE_WWDR_CERT"].every(readable), "Apple Wallet certificates are configured and readable (else passes are dev-signed)", "WARN");
if (env("GOOGLE_WALLET_ISSUER_ID") || env("GOOGLE_WALLET_SERVICE_ACCOUNT")) check(googleConfig().enabled && readable("GOOGLE_WALLET_SERVICE_ACCOUNT"), "Google Wallet issuer and service account are usable");
check(trustProxy(), "Client IPs come from a trusted proxy header (else per-IP roast limits are off)", "WARN");
check(env("ABSOLVO_ADMIN_TOKEN").length >= 16, "Graveyard moderation token is set (16+ characters)", "WARN");
check(Number(env("ABSOLVO_DAILY_SPEND_USD") || 25) > 0, `Daily Claude spend cut-off: $${env("ABSOLVO_DAILY_SPEND_USD") || "25 (default)"}`);

for (const [level, message] of results) console.log(`${level.padEnd(4)}  ${message}`);
const failed = results.filter(([level]) => level === "FAIL").length;
console.log(failed ? `\n${failed} check(s) block launch.` : "\nNo blocking problems.");
process.exit(failed ? 1 : 0);
