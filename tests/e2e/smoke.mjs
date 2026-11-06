// Real-browser smoke test: signs in through the UI as each role and visits every page that role should reach.
import { chromium } from "playwright";
const BASE = process.env.BASE_URL || "http://localhost:3100";
const PW = "Demo@12345678", D = "demo.campus.test";
const ADMIN = ["/app", "/app/students", "/app/admissions", "/app/academics", "/app/timetable", "/app/attendance", "/app/assignments", "/app/exams", "/app/fees", "/app/fees?tab=structures", "/app/fees?tab=payments", "/app/fees?tab=dues", "/app/library", "/app/hr", "/app/leave", "/app/announcements", "/app/users", "/app/reports", "/app/audit", "/app/settings", "/app/support", "/app/notifications"];
const PORTAL = ["/portal", "/portal/timetable", "/portal/attendance", "/portal/results", "/portal/fees", "/portal/assignments", "/portal/library", "/portal/announcements", "/portal/notifications", "/portal/support"];
const ROLES = [
  ["admin", `admin@${D}`, ADMIN], ["faculty", `dr.meera.iyer@${D}`, ["/app", "/app/timetable", "/app/attendance", "/app/assignments", "/app/exams", "/app/leave", "/app/announcements", "/app/support", "/app/academics"]],
  ["accountant", `sunita.rao@${D}`, ["/app", "/app/fees", "/app/fees?tab=dues", "/app/fees?tab=payments", "/app/students"]], ["librarian", `kiran.shah@${D}`, ["/app", "/app/library"]],
  ["hr", `pooja.menon@${D}`, ["/app", "/app/hr", "/app/leave"]], ["admissions", `vikram.singh@${D}`, ["/app", "/app/admissions", "/app/students"]],
  ["student", `aarav.sharma@${D}`, PORTAL], ["parent", `parent.sharma@${D}`, PORTAL], ["super", `platform@${D}`, ["/super", "/super/institutions", "/super/support", "/super/audit"]],
];
const browser = await chromium.launch();
let failures = 0, checked = 0;
for (const [role, email, pages] of ROLES) {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  const problems = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push("console: " + m.text().slice(0, 160)); });
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message.slice(0, 160)));
  page.on("requestfailed", (r) => { const why = r.failure()?.errorText ?? ""; if (why.includes("ERR_ABORTED")) return; /* request cancelled by navigation, not a failure */ problems.push(`requestfailed (${why}): ${r.url()}`); });
  page.on("response", (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(BASE + "/login");
  await page.getByLabel(/^Email/).fill(email); await page.getByLabel(/^Password/).fill(PW);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }), page.click("button:has-text('Sign in')")]);
  for (const p of pages) {
    const res = await page.goto(BASE + p, { waitUntil: "networkidle" });
    const body = await page.locator("body").innerText();
    const bad = !res || res.status() >= 400 || /Something went wrong|Application error|Page not found|don't have access/i.test(body);
    checked++;
    if (bad) { failures++; console.log(`✗ [${role}] ${p} -> ${res?.status()} ${body.slice(0, 100).replace(/\n/g, " ")}`); }
  }
  if (problems.length) { failures += problems.length; console.log(`✗ [${role}] browser problems:\n  ` + [...new Set(problems)].join("\n  ")); }
  else console.log(`✓ ${role}: ${pages.length} pages OK`);
  await ctx.close();
}
await browser.close();
console.log(`\n${checked} pages checked, ${failures} problem(s).`);
process.exit(failures ? 1 : 0);
