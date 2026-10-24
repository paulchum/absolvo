import { formatFunnel, funnel } from "../src/lib/metrics";

/** `npm run funnel [days]`: the click-to-buy funnel from this machine's database (ABSOLVO_DATA_DIR). */
const days = Number(process.argv[2] ?? 7);
if (!Number.isInteger(days) || days < 1 || days > 366) {
  console.error("Usage: npm run funnel [days, 1 to 366]");
  process.exit(1);
}
console.log(formatFunnel(funnel(days)));
