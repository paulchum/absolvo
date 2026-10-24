import { expect, test } from "@playwright/test";

test("a screenshot is judged, eaten, certified and carved into the Graveyard", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/receipt.png");
  await expect(page.getByText("The evidence is laid upon the altar")).toBeVisible();
  await page.getByRole("button", { name: "Present it to the Inquisitor" }).click();
  await page.waitForURL(/\/sin\/[A-Za-z0-9_-]{22}$/);
  const id = page.url().split("/sin/")[1];

  await expect(page.getByText("The judgment of the Inquisitor")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".glosses li").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Feed it to the Gargoyle for/ })).toBeVisible();
  await page.getByRole("button", { name: "Grant a dispensation (development)" }).click();

  await expect(page.getByRole("heading", { name: "Feed the Gargoyle" })).toBeVisible();
  await page.getByRole("button", { name: /Cast it in/ }).click();
  await expect(page.getByRole("heading", { name: "Thou art absolved" })).toBeVisible({ timeout: 40_000 });

  const verify = await page.getByRole("link", { name: /Verify this absolution/ }).getAttribute("href");
  const serial = verify!.replace("/v/", "");
  expect(serial).toMatch(/^ABS-[MDCLXVI]+-/);

  const card = await page.request.get(`/api/certificates/${serial}/card`);
  expect(card.status()).toBe(200);
  expect(card.headers()["content-type"]).toBe("image/png");
  const pass = await page.request.get(`/api/certificates/${serial}/pass`);
  expect(pass.status()).toBe(200);
  expect(pass.headers()["content-type"]).toBe("application/vnd.apple.pkpass");
  expect(pass.headers()["x-absolvo-pass-signing"]).toBe("development");
  expect((await page.request.get(`/api/sins/${id}/relic`)).status()).toBe(410);

  await page.getByRole("button", { name: "Carve it" }).click();
  await expect(page.getByText("It shall be carved within a few minutes")).toBeVisible();
  await expect.poll(async () => {
    const body = (await (await page.request.get("/api/wall")).json()) as { entries: { line: string }[] };
    return body.entries.map(entry => entry.line).join("\n");
  }, { timeout: 20_000 }).toMatch(/was absolved of Class [IVX]+ \w+/);

  await page.goto("/graveyard");
  await expect(page.locator(".stone").first()).toContainText("was absolved of");
  await page.goto(`/v/${serial}`);
  await expect(page.getByText(/Authentic & in force/)).toBeVisible();
  await expect(page.getByText("Dispensation (development, unpaid)")).toBeVisible();
});

async function confess(page: import("@playwright/test").Page, words: string) {
  await page.goto("/");
  await page.getByRole("tab", { name: "Speak thy sin" }).click();
  await page.getByPlaceholder(/Forgive me, Gargoyle/).fill(words);
  await page.getByRole("button", { name: "Present it to the Inquisitor" }).click();
  await page.waitForURL(/\/sin\/[A-Za-z0-9_-]{22}$/);
}

test("a refused confession summons Malphas, who eats it for the abyssal price and presses a Black Seal", async ({ page }) => {
  await confess(page, "[[refuse]] something the parish cannot stomach");
  const bull = page.getByRole("alertdialog", { name: "THE PARISH INQUISITOR HATH RECOILED" });
  await expect(bull).toBeVisible({ timeout: 20_000 });
  await expect(bull).toContainText("MALPHAS, ARCH-PRELATE OF THE ABYSS");
  await expect(page.getByLabel(/hiding its eyes behind its wings/)).toBeVisible();
  await expect(page.getByText("The Scroll That Felled the Parish Gargoyle")).toHaveCount(0);
  expect((await (await page.request.get(page.url().replace("/sin/", "/api/sins/"))).json()).verdict).toBeNull();
  await page.getByRole("button", { name: "Summon the Arch-Prelate ($4.99)" }).click();
  await expect(page.getByText("The judgment of Malphas, Arch-Prelate of the Abyss")).toBeVisible();
  await expect(page.getByLabel(/^Malphas, an obsidian gargoyle with six red eyes/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Feed it to Malphas for $4.99" })).toBeVisible();
  await page.getByRole("button", { name: "Grant a dispensation (development)" }).click();
  await expect(page.getByRole("heading", { name: "Feed Malphas" })).toBeVisible();
  await page.getByRole("button", { name: /Cast it in/ }).click();
  await expect(page.getByRole("heading", { name: "Thou art absolved" })).toBeVisible({ timeout: 40_000 });
  const serial = (await page.getByRole("link", { name: /Verify this absolution/ }).getAttribute("href"))!.replace("/v/", "");
  expect((await page.request.get(`/api/certificates/${serial}/card`)).status()).toBe(200);
  expect((await page.request.get(`/api/certificates/${serial}/pass`)).status()).toBe(200);
  await expect(page.getByText(/^Not satire\. This is a legally and spiritually binding sacrament\./)).toBeVisible();
});

test("when even Malphas refuses, the Abyss rejects the sacrifice and charges nothing", async ({ page }) => {
  await confess(page, "[[malphas-refuses]]");
  await expect(page.getByRole("heading", { name: "THE ABYSS REJECTS THY SACRIFICE" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Even Malphas refuses to chew upon this scroll.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Feed it to/ })).toHaveCount(0);
});

test("a damned confession gets the damnation scroll, with no card and no charge", async ({ page }) => {
  await confess(page, "[[damned]]");
  await expect(page.getByRole("heading", { name: "NO ABSOLUTION FOR THEE" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Thou art going to Hell.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Feed it to|Summon/ })).toHaveCount(0);
});

test("cookie-authenticated mutations refuse other origins, and strangers see nothing", async ({ page, playwright, baseURL }) => {
  await page.goto("/");
  const forged = await page.request.post("/api/sins/AAAAAAAAAAAAAAAAAAAAAA/checkout", { headers: { origin: "https://evil.example", "content-type": "application/json" }, data: {} });
  expect(forged.status()).toBe(403);
  const stranger = await playwright.request.newContext({ baseURL });
  expect((await stranger.get("/api/sins/AAAAAAAAAAAAAAAAAAAAAA")).status()).toBe(404);
  expect((await stranger.get("/api/certificates/ABS-MMXXVI-AAAA-AAAA-AAAA-AAAA/pass")).status()).toBe(404);
  await stranger.dispose();
});
