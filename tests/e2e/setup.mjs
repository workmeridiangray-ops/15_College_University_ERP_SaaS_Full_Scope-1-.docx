// Run against a deployment that has an EMPTY database and SETUP_TOKEN=<token> set. Usage: SETUP_TOKEN=... BASE_URL=... node tests/e2e/setup.mjs
import { chromium } from "playwright";
const BASE = process.env.BASE_URL || "http://localhost:3300", TOKEN = process.env.SETUP_TOKEN;
const b = await chromium.launch(); const p = await (await b.newContext()).newPage(); let bad = 0;
const ok = (n, c) => { console.log(`${c ? "✓" : "✗"} ${n}`); if (!c) bad++; };
const hydrated = () => p.waitForFunction(() => [...document.forms].every((f) => Object.keys(f).some((k) => k.startsWith("__reactProps"))), null, { timeout: 8000 }).catch(() => {});
await p.goto(BASE + "/setup"); await hydrated();
const fill = async (o) => { for (const [k, v] of Object.entries(o)) await p.getByLabel(new RegExp("^" + k)).fill(v); await p.getByRole("button", { name: "Create administrator" }).click(); };
await fill({ "Setup token": "wrong-token", "Your name": "Pat Owner", Email: "pat@example.com", Password: "Str0ngPassphrase", "Confirm password": "Str0ngPassphrase" });
await p.getByText("That setup token is not correct.").first().waitFor({ timeout: 10000 }); ok("wrong token is refused", true);
ok("typed name and email survive the failed attempt (passwords are cleared)", (await p.getByLabel(/^Your name/).inputValue()) === "Pat Owner" && (await p.getByLabel(/^Email/).inputValue()) === "pat@example.com" && (await p.getByLabel(/^Password/).inputValue()) === "");
await p.getByLabel(/^Setup token/).fill(TOKEN); await p.getByLabel(/^Password/).fill("Str0ngPassphrase"); await p.getByLabel(/^Confirm password/).fill("Different12345"); await p.getByRole("button", { name: "Create administrator" }).click();
await p.getByText("do not match").first().waitFor({ timeout: 10000 }); ok("mismatched passwords are refused", true);
await p.getByLabel(/^Setup token/).fill(TOKEN); await p.getByLabel(/^Password/).fill("Str0ngPassphrase"); await p.getByLabel(/^Confirm password/).fill("Str0ngPassphrase"); await p.getByRole("button", { name: "Create administrator" }).click();
await p.getByText(/Platform administrator created/).waitFor({ timeout: 10000 }); ok("administrator created from the browser", true);
await p.goto(BASE + "/setup"); ok("setup page closes itself afterwards", /already complete/.test(await p.locator("body").innerText()));
await p.goto(BASE + "/login"); await hydrated(); await p.getByLabel(/^Email/).fill("pat@example.com"); await p.getByLabel(/^Password/).fill("Str0ngPassphrase"); await p.getByRole("button", { name: "Sign in" }).click();
await p.waitForURL(/\/super/, { timeout: 15000 }); ok("new administrator signs in and reaches the platform console", /Platform overview/.test(await p.locator("body").innerText()));
await b.close(); process.exit(bad ? 1 : 0);
