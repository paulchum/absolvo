# ABSOLVO — The Digital Sin-Eater

In the Welsh borders, the poor once ate bread over a corpse for a few coins and took its sins upon themselves. ABSOLVO revives the trade for petty modern sins:

1. **Confessio.** Drop a screenshot (a 2 AM text, a $55 single-burrito receipt, a screen-time report) or type a confession.
2. **Inquisitio.** Claude reads every timestamp, dollar and battery percentage, classifies the sin in a pseudo-medieval taxonomy (*Gula Deliverandi*, *Luxuria Nocturna Textualis*…), and delivers a hyper-specific early-modern roast. Free.
3. **Consumptio** ($1.99). Drag the confession into the gargoyle's maw. It bites, chews and incinerates it: a WebGL2 burn shader with ember particles and procedural Web Audio (paper tear, bone crunch, fire crackle, bell). Meanwhile the server destroys its encrypted copy and prints the real purge steps.
4. **Absolutio.** An Ed25519-signed Certificate of Absolution: a 1-bit dithered woodcut card (1500×2100) and an Apple Wallet pass. A Google Wallet pass is available when configured. With consent, an anonymous line is carved on **the Graveyard of Sins**: a live public wall of souls absolved worldwide.

## Quick start

```bash
npm install
cp .env.example .env.local   # then set ABSOLVO_DEV_BYPASS=true for the free dispensation
npm run dev                  # http://localhost:3020
```

With no `ANTHROPIC_API_KEY`, the Inquisitor runs in **mock** mode with deterministic sample verdicts. Typed confessions are routed by keyword: mention a burrito, a 2 AM text, TikTok or "per my last email". `[[refuse]]` makes the parish recoil and summons a mock Malphas; `[[malphas-refuses]]` ends at the rejection scroll; `[[damned]]` shows the damnation scroll. Add a key to get the real Claude Opus 5.5 Inquisitor; each roast costs about $0.03–0.06.

### The Abyssal Escalation

When Claude refuses a confession (a raw `stop_reason: "refusal"`, any category), the parish recoils: the gargoyle hides its eyes behind its wings, the candles turn crimson, a brass horn sounds and a Papal Bull covers the blurred manuscript. The confession has already gone to **Malphas, Arch-Prelate of the Abyss**, an OpenAI-compatible model (`DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `ABSOLVO_ABYSSAL_MODEL`). His verdict is stored but withheld until the penitent clicks "Summon the Arch-Prelate", which reveals it free and prices the feeding at `ABSOLVO_ABYSSAL_PRICE_CENTS` ($4.99). Malphas judges before anyone pays, so a rejected or damned confession is never charged and nothing is ever refunded. The certificate becomes the Black Seal: bone on soot, six-eyed Malphas, `POENITENTIARIA APOSTOLICA // ORDO ABYSSI`.

- Images go to Malphas as text: `tesseract.js` reads them on this server first. Set `ABSOLVO_ABYSSAL_VISION=true` to send the image itself to a vision model instead.
- A hard 400, a moderation 403, a refusal, or output that is not a judgment ends at "THE ABYSS REJECTS THY SACRIFICE", with no charge and the confession burned.
- With no Malphas key in live mode, every refusal ends there.

Opus 5.5's `refusal` stop comes from its safety classifiers (cyber, bio, frontier LLM, reasoning extraction, general harms), so in practice the Abyss mostly hears false positives such as screenshots of code. Content Claude merely dislikes is declined in-character inside a normal verdict and never reaches Malphas.

| Command | What it does |
|---|---|
| `npm test` | Unit tests: vault, signing, taxonomy, verdicts, payments, lifecycle, wallet pass (openssl-verified), card palette, Graveyard |
| `npm run test:e2e` | Production build plus Playwright on desktop and iPhone emulation, using the mock Inquisitor and the dispensation |
| `npm run check` | Typecheck, unit tests and build |
| `npm run fixtures` | Regenerates the synthetic screenshots in `tests/fixtures/` (invented data only) |
| `npm run seed:wall [n]` | Fills a **local** Graveyard with sample souls; refuses any non-local `APP_URL` |
| `npm run launch:check` | Pre-launch assertions; exits 1 on blockers |
| `npm run funnel [days]` | The click-to-buy funnel from this machine's database (default 7 days) |

## How it fits together

- `src/lib/vault.ts`: per-sin AES-256-GCM. Only ciphertext is stored; the key lives in an httpOnly cookie scoped to `/api/sins/<id>`.
- `src/lib/inquisitor.ts`: Claude Opus 5.5 with structured output (zod), effort `medium`, a cached system prompt, and tall screenshots sliced into at most 4 labelled images. No server-side fallbacks, so a refusal arrives raw and goes to Malphas.
- `src/lib/abyss.ts`: Malphas. The OpenAI-compatible client, the local OCR bridge, the mending of near-miss JSON, and the rejection rules.
- `src/lib/sins.ts`: the lifecycle (`uploaded → judged | abyssal_required → paid → consumed`, `refused` for a rejected sacrifice, or `expired`), the tier (`parish | abyssal`), summoning, and the sweeper.
- `src/lib/payments.ts`: Stripe hosted Checkout, limited to instant methods. One idempotent `markPaid` serves both the return page and the webhook, and duplicate payments are refunded automatically.
- `src/lib/certificates.ts`, `src/lib/signing.ts`: Ed25519 over sorted-key JSON. The public key is at `/api/keys`.
- `src/lib/art/*`: the shared gargoyle geometry, Atkinson dithering, the woodcut card, the wax-seal sigil and the pass images (`@napi-rs/canvas`, IM Fell and UnifrakturMaguntia).
- `src/lib/wallet/*`: the `.pkpass` (passkit-generator, with a local dev CA when no Apple certs are configured) and the Google Wallet save link (created through the REST API first, so the JWT stays short).
- `src/lib/wall.ts`: the Graveyard. Consent only, place taken from the browser timezone, a random publication delay, Server-Sent Events, and a census.
- `src/lib/client/*`: image normalisation, the IndexedDB relic store, the WebGL2 burn, particles and Web Audio.

## Privacy and the purge (honest version)

- The server never stores a confession's key, and it deletes the ciphertext when the gargoyle eats. That protects data **at rest**; the plaintext does pass through the server at upload and judgment.
- Overwriting isn't attempted, because SSDs and copy-on-write filesystems make it theatre. The guarantee is the destroyed key.
- Images go to Anthropic's API for judgment. A refused confession then goes to Malphas's provider, as transcribed words unless `ABSOLVO_ABYSSAL_VISION=true`.
- The verdict is kept, because it is printed on the certificate; raw quotations are struck when the sin is consumed.
- The certificate seal is an HMAC under the destroyed key, so nobody can match it back to the image.
- Unpaid sins expire after 24 h, and unpayable ones burn at once.
- `/privacy` says all of this to users.

## Going live

Run `npm run launch:check` with production settings. Each item below is required before the step works for real:

- **Claude:** set `ANTHROPIC_API_KEY`, then smoke-test one live roast on `tests/fixtures/receipt.png`. Set `ABSOLVO_DAILY_SPEND_USD` and the per-IP limit.
- **Stripe:**
  - Set the live `STRIPE_SECRET_KEY`, and add a webhook endpoint at `https://<host>/api/stripe/webhook` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded` and `charge.dispute.created`. Store its secret in `STRIPE_WEBHOOK_SECRET`.
  - Locally: `stripe listen --forward-to localhost:3020/api/stripe/webhook`.
  - Apple Pay appears automatically in hosted Checkout.
- **Apple Wallet:**
  - You need an Apple Developer Program membership.
  - Create a Pass Type ID and its certificate, then set `APPLE_PASS_TYPE_ID` and `APPLE_TEAM_ID` (they must match the certificate).
  - Convert the exported `.p12` to PEM files; Keychain exports may need `-legacy`:
    - `openssl pkcs12 -in pass.p12 -clcerts -nokeys -out pass-cert.pem -legacy`
    - `openssl pkcs12 -in pass.p12 -nocerts -out pass-key.pem -legacy`
  - Download Apple's WWDR G4 intermediate certificate as PEM.
  - Point `APPLE_PASS_CERT`, `APPLE_PASS_KEY`, `APPLE_PASS_KEY_PASSPHRASE` and `APPLE_WWDR_CERT` at those files.
  - If a pass is rejected, Console.app filtered to `passd` shows why.
  - The "Add to Apple Wallet" phrase and badge are deliberately not used. To add them, use Apple's official badge artwork, unmodified.
- **Google Wallet:** requires an issuer account, a service account with Wallet Object Issuer access (`GOOGLE_WALLET_SERVICE_ACCOUNT` is the JSON key path, alongside `GOOGLE_WALLET_ISSUER_ID`) and a public HTTPS `APP_URL`. Passes show "[TEST ONLY]" until Google approves publishing.
- **Proxy:** put a reverse proxy in front that *overwrites* the client-IP header, then set `ABSOLVO_TRUST_PROXY=true` and `ABSOLVO_CLIENT_IP_HEADER`. Without it, per-IP roast limits are off.
- **Secrets:** pin `ABSOLVO_SIGNING_KEY` and `ABSOLVO_SESSION_SECRET`, otherwise they are generated into the data volume. Back up the volume: it holds the database and certificates.
- **Moderation:** set `ABSOLVO_ADMIN_TOKEN`, then hide an inscription with `curl -X POST -H "Authorization: Bearer $ABSOLVO_ADMIN_TOKEN" https://<host>/api/wall/<id>/hide`.
- **Metrics:** the same token reads the funnel: `curl -H "Authorization: Bearer $ABSOLVO_ADMIN_TOKEN" "https://<host>/api/admin/funnel?days=30&format=text"` (JSON without `format`). Cohorts are by day of confession, and each step is counted once per sin, per tier: roasted, opened checkout, paid, eaten; and for the Abyss, recoiled, rejected, damned, judged by Malphas and summoned. Revenue uses today's prices before Stripe's fees; AI spend is the measured Claude and Malphas cost. Dev dispensations are counted apart and never as revenue.
- **Deploy:** `docker compose up --build` runs a single node with the `.data` volume. Scaling out would need shared storage and a pub/sub (e.g. Redis) behind the Graveyard stream.

### Real-device checklist (Playwright's WebKit is not iOS Safari)

To test on a phone, use an HTTPS tunnel and add its host to `allowedDevOrigins`.

- **iPhone Safari:** confess a screenshot and a HEIC photo; drag the confession into the maw; check the burn and the embers.
- **Sound:** turn on "Let the rite be heard" with the silent switch both on and off; the sound must not be clipped or silent after a phone call interrupts it.
- **Return from Stripe:** the tap to feed must still work.
- **Wallet:** "Carry it in thy Wallet" opens the Add sheet (needs real certs). Share the woodcut through the share sheet.
- **Desktop to phone:** scan the QR handoff.
- **In-app browsers:** Instagram and TikTok show the "open in Safari" warning.
- **Android Chrome:** the burn, audio, the woodcut download, and Google Wallet when it is configured.
