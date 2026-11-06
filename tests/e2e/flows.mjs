// Interactive journeys driven through the real UI and server actions.
import { chromium } from "playwright";
import fs from "node:fs";
const BASE = process.env.BASE_URL || "http://localhost:3100";
const PW = "Demo@12345678", D = "demo.campus.test", RUN = Date.now().toString(36);
let OWNER = ""; const OWNER_PW = "Str0ngPassword!"; const results = []; let browser;
const ok = (name, cond, extra = "") => { results.push([name, !!cond, extra]); console.log(`${cond ? "✓" : "✗"} ${name}${!cond && extra ? "  → " + String(extra).slice(0, 200) : ""}`); };
const formWith = (page, button) => page.locator("form", { has: page.getByRole("button", { name: button }) }).first();
const login = async (page, email, pw = PW) => { await page.goto(BASE + "/login"); await page.getByLabel(/^Email/).fill(email); await page.getByLabel(/^Password/).fill(pw); await page.getByRole("button", { name: "Sign in" }).click(); await Promise.race([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 8000 }), page.locator("[role=alert]:not(:empty):not(next-route-announcer)").first().waitFor({ timeout: 8000 })]).catch(() => {}); await page.waitForLoadState("networkidle"); };
const pages = []; process.on("uncaughtException", async (e) => { console.log("FAILURE:", String(e.stack).split("\n").slice(0, 4).join(" / ")); for (const pg of pages) { try { console.log("  PAGE", pg.url(), JSON.stringify(await pg.locator("[role=alert]:not(:empty),[role=status]").allInnerTexts())); await pg.screenshot({ path: "/tmp/fail.png", fullPage: true }); } catch {} } process.exit(1); });
const newPage = async (viewport) => { const ctx = await browser.newContext(viewport ? { viewport } : {}); const p = await ctx.newPage(); pages.push(p); p.on("dialog", (d) => d.accept());
  for (const m of ["goto", "reload"]) { const orig = p[m].bind(p); p[m] = async (...a) => { const r = await orig(...a); await p.waitForFunction(() => { return [...document.forms].every((f) => Object.keys(f).some((k) => k.startsWith("__reactProps")) && [...f.querySelectorAll("button,input,select")].every((el) => Object.keys(el).some((k) => k.startsWith("__reactProps")))); }, null, { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(300); return r; }; }
  return [ctx, p]; };
const signupOwner = async (p, tag) => {
  const email = `owner.${tag}@newcollege.test`;
  await p.goto(BASE + "/signup");
  await p.getByLabel(/^Institution name/).fill(`Riverdale College ${tag}`); await p.getByLabel(/^Your name/).fill("Olivia Owner"); await p.getByLabel(/^Work email/).fill(email);
  await p.getByLabel(/^Password/).fill(OWNER_PW); await p.getByLabel(/^Confirm password/).fill(OWNER_PW); await p.getByLabel(/I agree/).check();
  await p.getByRole("button", { name: "Create workspace" }).click(); await p.waitForURL(/\/app/, { timeout: 20000 });
  return email;
};
const text = (p) => p.locator("body").innerText();

const ONLY = process.env.ONLY || ""; const want = (k) => !ONLY || ONLY.includes(k);
browser = await chromium.launch();

/* ---------- A. Self-serve onboarding and a full fee cycle in a brand-new institution ---------- */
if (want("A")) {
  const [ctx, p] = await newPage();
  const adminEmail = `owner.${RUN}@newcollege.test`; OWNER = adminEmail;
  await p.goto(BASE + "/signup");
  await p.getByLabel(/^Institution name/).fill(`Riverdale College ${RUN}`); await p.getByLabel(/^Your name/).fill("Olivia Owner"); await p.getByLabel(/^Work email/).fill(adminEmail);
  await p.getByLabel(/^Password/).fill("Str0ngPassword!"); await p.getByLabel(/^Confirm password/).fill("Str0ngPassword!"); await p.getByLabel(/I agree/).check();
  await p.getByRole("button", { name: "Create workspace" }).click(); await p.waitForURL(/\/app/, { timeout: 20000 });
  await p.getByText(/Free trial/).first().waitFor({ timeout: 10000 }); ok("A1 signup lands in a ready workspace with trial banner", true);

  await p.goto(BASE + "/app/academics");
  await formWith(p, "Add department").getByLabel(/^Name/).fill("Commerce"); await formWith(p, "Add department").getByLabel(/^Code/).fill("COM"); await p.getByRole("button", { name: "Add department" }).click();
  await p.getByText("Department added.").waitFor({ timeout: 10000 }); ok("A2 department created via UI", true);
  await p.waitForLoadState("networkidle");
  const pf = formWith(p, "Add program"); await pf.getByLabel(/^Name/).fill("BCom Honours"); await pf.getByLabel(/^Code/).fill("BCOM"); await pf.getByLabel(/^Department/).selectOption({ label: "Commerce" }); await p.getByRole("button", { name: "Add program" }).click();
  await p.getByText("Program added.").waitFor({ timeout: 10000 }); await p.waitForLoadState("networkidle");
  const sf = formWith(p, "Add section"); await sf.getByLabel(/^Program/).selectOption({ index: 1 }); await sf.getByLabel(/^Section/).fill("A"); await p.getByRole("button", { name: "Add section" }).click();
  await p.getByText("Section added.").waitFor({ timeout: 10000 }); ok("A3 program and section created", true);

  await p.goto(BASE + "/app/students");
  const af = formWith(p, "Create student"); await af.getByLabel(/^Full name/).fill("Sana Khan"); await af.getByLabel(/^Email/).fill(`sana.${RUN}@newcollege.test`); await af.getByLabel(/^Program/).selectOption({ index: 1 });
  await p.getByRole("button", { name: "Create student" }).click();
  await p.getByText(/Student created with enrolment number/).waitFor({ timeout: 15000 });
  const link = (await p.getByLabel("One-time link").inputValue()).replace(/^https?:\/\/[^/]+/, BASE);
  ok("A4 student created with a one-time activation link (email not configured)", /\/reset-password\?token=/.test(link), link);

  // The student activates their account in a separate browser session.
  const [c2, sp] = await newPage();
  await sp.goto(link); await sp.getByLabel(/^New password/).fill("StudentPass#2026"); await sp.getByLabel(/^Confirm password/).fill("StudentPass#2026"); await sp.getByRole("button", { name: "Set password" }).click();
  await sp.waitForURL(/login\?reset=1/); await login(sp, `sana.${RUN}@newcollege.test`, "StudentPass#2026"); await sp.waitForURL(/\/portal/); await sp.getByText("Overview").first().waitFor({ timeout: 10000 });
  ok("A5 student activates via link, signs in, lands in the portal", /Overview/.test(await text(sp)));
  await sp.goto(link); await sp.getByLabel(/^New password/).fill("AnotherPass#2026"); await sp.getByLabel(/^Confirm password/).fill("AnotherPass#2026"); await sp.getByRole("button", { name: "Set password" }).click();
  await sp.waitForTimeout(1500); ok("A6 activation link cannot be reused", /invalid or has expired/.test(await text(sp)), (await text(sp)).slice(0,300));

  await p.goto(BASE + "/app/fees?tab=structures");
  const ff = formWith(p, "Create"); await ff.getByLabel(/^Program/).selectOption({ index: 1 }); await ff.getByLabel(/^Name/).fill("Term 1 Tuition"); await ff.getByLabel(/^Amount/).fill("25000"); await ff.getByLabel(/^Due date/).fill("2026-12-31");
  await ff.getByRole("button", { name: "Create" }).click(); await p.getByText(/Fee structure created/).waitFor({ timeout: 10000 }); await p.reload();
  await p.getByRole("button", { name: "Generate invoices" }).click(); await p.waitForTimeout(2500); await p.getByText(/Created 1 invoice/).waitFor({ timeout: 10000 }); ok("A7 invoice generated for the enrolled student", true);

  await p.goto(BASE + "/app/fees?tab=invoices");
  await p.getByRole("button", { name: "Record payment" }).first().click();
  const pay = p.locator("form", { has: p.getByRole("button", { name: "Record", exact: true }) }).first();
  await pay.getByLabel(/^Amount/).fill("30000"); await pay.getByRole("button", { name: "Record", exact: true }).click();
  await p.getByText(/exceeds the outstanding balance/).waitFor({ timeout: 10000 }); ok("A8 overpayment rejected with a clear message, and the typed amount is kept", (await pay.getByLabel(/^Amount/).inputValue()) === "30000");
  await pay.getByLabel(/^Amount/).fill("10000"); await pay.getByRole("button", { name: "Record", exact: true }).dblclick();
  await p.getByText(/Payment recorded\. Receipt RCP-/).waitFor({ timeout: 10000 });
  await p.goto(BASE + "/app/fees?tab=payments");
  ok("A9 double-click records exactly one payment", (await p.locator("tbody tr").count()) === 1, await p.locator("tbody tr").count());
  await p.locator("tbody a").first().click(); await p.waitForURL(/receipt/, { waitUntil: "commit" }); await p.getByText(/Receipt/i).first().waitFor();
  ok("A10 printable receipt shows institution, student and amount", /Riverdale College/.test(await text(p)) && /Sana Khan/.test(await text(p)) && /10,000\.00/.test(await text(p)));
  await p.goto(BASE + "/app/fees?tab=invoices"); ok("A11 invoice now partial with the right balance", /partial/i.test(await text(p)) && /15,000\.00/.test(await text(p)));
  await sp.goto(BASE + "/portal/fees"); ok("A12 student sees the same balance and receipt in their portal", /15,000\.00/.test(await text(sp)) && /RCP-/.test(await text(sp)));

  // Cross-tenant: this admin must not reach another institution's records.
  const [c3, dp] = await newPage(); await login(dp, `admin@${D}`);
  await dp.goto(BASE + "/app/students"); const demoStudent = await dp.locator('a[href^="/app/students/"]').first().getAttribute("href");
  await p.goto(BASE + demoStudent); await p.waitForTimeout(1500); const t13 = await text(p); ok("A13 another institution's student profile shows not-found and no data", /not found|404/i.test(t13) && !/Aarav|Sharma|@demo/i.test(t13), t13.slice(0, 200));
  const r2 = await p.goto(BASE + "/api/files/" + demoStudent.split("/").pop()); ok("A14 foreign document id returns 404", r2.status() === 404, r2.status());
  const csv = await (await ctx.request.get(BASE + "/api/export/students")).text(); ok("A15 CSV export contains only own students", /Sana Khan/.test(csv) && !/Aarav/.test(csv));
  const r4 = await p.goto(BASE + "/super"); ok("A16 institution admin cannot open the platform console", !/Platform overview/.test(await text(p)) && p.url().includes("/app"));
  await c3.close(); await c2.close(); await ctx.close();
}

/* ---------- B. Login failures, lockout, expired session ---------- */
if (want("B")) {
  const [ctx, p] = await newPage(); if (!OWNER) { OWNER = await signupOwner(p, RUN + "b"); await ctx.clearCookies(); }
  await login(p, OWNER, "wrong-password-1");
  ok("B1 wrong password shows a generic error", /Incorrect email or password/.test(await text(p)));
  await login(p, "nobody@nowhere.test", "wrong-password-1"); ok("B2 unknown email shows the same error", /Incorrect email or password/.test(await text(p)));
  await login(p, OWNER, OWNER_PW); await p.waitForURL(/\/app/); ok("B3 correct credentials sign in", true);
  await ctx.clearCookies(); await p.goto(BASE + "/app/students"); await p.waitForURL(/login/, { timeout: 10000 }).catch(() => {});
  ok("B4 expired/missing session redirects to sign-in with an explanation", p.url().includes("/login") && /session has ended/.test(await text(p)), p.url());
  await p.getByRole("button", { name: "Sign in" }); await ctx.close();
  const [c2, p2] = await newPage(); const lockEmail = OWNER; /* a throw-away account, so seeded demo users are never locked */
  for (let i = 0; i < 5; i++) await login(p2, lockEmail, "bad-password-" + i);
  await login(p2, lockEmail, OWNER_PW); ok("B5 account locks after repeated failures, even with the right password", /temporarily locked/.test(await text(p2)));
  await c2.close();
  await (async () => { const { execSync } = await import("node:child_process"); })();
}

/* ---------- C. Faculty marks attendance ---------- */
if (want("C")) {
  const [ctx, p] = await newPage(); await login(p, `dr.meera.iyer@${D}`);
  await p.goto(BASE + "/app/attendance"); await p.getByLabel("Class").selectOption({ index: 1 }); await p.getByRole("button", { name: "Load class" }).click(); await p.waitForLoadState("networkidle");
  const firstRow = p.locator("li", { has: p.getByText(/^DEMO|\d{4}BSCCS/) }).first();
  await p.locator('label:has-text("Absent")').nth(0).click();
  await p.getByRole("button", { name: /Save attendance/ }).click(); await p.getByText(/Attendance saved for/).waitFor({ timeout: 10000 });
  ok("C1 faculty loads a roster, marks absent, saves", true);
  await p.goto(BASE + "/app/fees"); await p.waitForURL(/forbidden/, { timeout: 10000 }).catch(() => {}); ok("C2 faculty cannot open fees (redirected to 'no access')", /don.t have access/.test(await text(p)), p.url());
  await ctx.close();
}

/* ---------- D. Public application -> review -> admission -> activation ---------- */
if (want("D")) {
  const [ctx, p] = await newPage(); const email = `applicant.${RUN}@mail.test`;
  await p.goto(BASE + "/apply/demo-institute");
  await p.getByLabel(/^Program/).selectOption({ index: 1 }); await p.getByLabel(/^Full name/).fill("Tara Applicant"); await p.getByLabel(/^Email/).fill(email); await p.getByLabel(/^Mobile number/).fill("9876543210"); await p.getByLabel(/^Previous exam percentage/).fill("87.5");
  await p.getByRole("button", { name: "Submit application" }).click(); await p.getByText(/Your tracking code is APP-/).waitFor({ timeout: 10000 });
  await p.waitForFunction(() => /APP-[A-Z0-9]{8}/.test(document.body.innerText), null, { timeout: 15000 }); const code = (await text(p)).match(/APP-[A-Z0-9]{8}/)[0]; ok("D1 application submitted, tracking code issued", !!code, code);
  await p.getByRole("button", { name: "Submit application" }).click(); await p.waitForTimeout(500);
  await p.goto(BASE + "/track"); await p.getByLabel("Tracking code").fill(code); await p.getByLabel("Email").fill(email); await p.getByRole("button", { name: "Check status" }).click();
  await p.getByText(/waiting for review/).waitFor({ timeout: 10000 }); ok("D2 applicant tracks status", true);
  fs.writeFileSync("/tmp/e2e-doc.pdf", "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"); fs.writeFileSync("/tmp/e2e-fake.pdf", "MZ this is an executable pretending to be a pdf");
  await p.setInputFiles("#upload-file", "/tmp/e2e-fake.pdf"); await p.getByRole("button", { name: "Upload" }).click(); await p.getByText(/Only PDF, PNG or JPG/).waitFor({ timeout: 10000 }); ok("D3 disguised executable is rejected", true);
  await p.setInputFiles("#upload-file", "/tmp/e2e-doc.pdf"); await p.getByRole("button", { name: "Upload" }).click(); await p.getByText(/e2e-doc\.pdf uploaded/).waitFor({ timeout: 10000 }); ok("D4 real PDF accepted", true);
  const [c2, a] = await newPage(); await login(a, `vikram.singh@${D}`); await a.goto(BASE + "/app/admissions");
  const row = () => a.locator("tr", { has: a.getByText(email) });
  await row().getByRole("button", { name: "Start review" }).click(); await row().getByRole("button", { name: "Shortlist" }).waitFor();
  await row().getByRole("button", { name: "Shortlist" }).click(); await row().getByRole("button", { name: "Accept & enrol" }).waitFor();
  await row().getByRole("button", { name: "Accept & enrol" }).click(); await a.getByText(/Admitted as/).waitFor({ timeout: 15000 });
  const link = (await a.getByLabel("One-time link").inputValue()).replace(/^https?:\/\/[^/]+/, BASE); ok("D5 admissions officer moves the application to accepted and gets an activation link", /reset-password/.test(link));
  await a.goto(BASE + "/app/students?q=Tara"); ok("D6 accepted applicant now exists as a student", /Tara Applicant/.test(await text(a)));
  await p.goto(BASE + "/track"); await p.getByLabel("Tracking code").fill(code); await p.getByLabel("Email").fill(email); await p.getByRole("button", { name: "Check status" }).click(); await p.getByText(/Congratulations/).waitFor(); ok("D7 applicant sees the admitted status", true);
  await c2.close(); await ctx.close();
}

/* ---------- E. Parent isolation ---------- */
if (want("E")) {
  const [ctx, p] = await newPage(); await login(p, `parent.sharma@${D}`);
  const [c2, a] = await newPage(); await login(a, `admin@${D}`); await a.goto(BASE + "/app/students?q=Diya");
  const otherId = (await a.locator('a[href^="/app/students/"]').first().getAttribute("href")).split("/").pop();
  await p.goto(BASE + "/portal?child=" + otherId); const t = await text(p);
  ok("E1 parent cannot switch to a child who is not theirs", /Aarav Sharma/.test(t) && !/Diya Patel/.test(t));
  const res = await p.goto(BASE + "/app/students"); ok("E2 parent cannot open staff pages", !/Students/.test((await text(p)).slice(0, 80)) || p.url().includes("/portal"), p.url());
  await c2.close(); await ctx.close();
}

/* ---------- F. Responsive layout: no sideways scrolling on a phone ---------- */
if (want("F")) {
  const [ctx, p] = await newPage({ width: 375, height: 800 }); await login(p, `admin@${D}`);
  const bad = [];
  for (const u of ["/app", "/app/students", "/app/admissions", "/app/fees", "/app/fees?tab=invoices", "/app/fees?tab=payments", "/app/academics", "/app/timetable", "/app/attendance", "/app/assignments", "/app/exams", "/app/hr", "/app/leave", "/app/library", "/app/announcements", "/app/users", "/app/reports", "/app/audit", "/app/settings", "/app/support", "/app/notifications"]) {
    await p.goto(BASE + u, { waitUntil: "networkidle" });
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 1) bad.push(`${u} (+${over}px)`);
  }
  ok("F1 no page forces horizontal page scroll at 375px (tables scroll inside their card)", bad.length === 0, bad.join(", "));
  await p.goto(BASE + "/app"); await p.getByText("☰ Menu").click(); ok("F2 mobile menu opens and lists navigation", await p.getByRole("link", { name: "Students" }).first().isVisible());
  await p.screenshot({ path: "/tmp/mobile-dashboard.png" }); await ctx.close();
}

/* ---------- G. Unsaved-work protection ---------- */
if (want("G")) {
  const [ctx, p] = await newPage(); await login(p, `admin@${D}`); await p.goto(BASE + "/app/announcements");
  let sawBeforeUnload = false; p.removeAllListeners("dialog"); p.on("dialog", async (d) => { if (d.type() === "beforeunload") sawBeforeUnload = true; await d.accept(); });
  await p.getByLabel(/^Title/).click(); await p.keyboard.type("Draft title"); await p.goto(BASE + "/app");
  ok("G1 leaving a half-filled form asks for confirmation", sawBeforeUnload); await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
