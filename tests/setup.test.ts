import { beforeEach, describe, expect, it } from "vitest";
import { freshDb } from "./helpers";
import { setupState, setupSuperAdmin } from "@/services/platform";
import { login, userFromToken } from "@/lib/session";
import { query } from "@/lib/db";

const TOKEN = "correct-horse-battery-staple";
const good = { token: TOKEN, email: "Owner@Example.com", name: "Platform Owner", password: "Str0ngPassphrase", confirm: "Str0ngPassphrase" };

describe("browser first-run setup", () => {
  beforeEach(async () => { await freshDb(); process.env.SETUP_TOKEN = TOKEN; });

  it("is disabled unless a long SETUP_TOKEN is configured", async () => {
    delete process.env.SETUP_TOKEN;
    expect(await setupState()).toBe("disabled");
    await expect(setupSuperAdmin(good)).rejects.toThrow(/not enabled/);
    process.env.SETUP_TOKEN = "short";
    expect(await setupState()).toBe("disabled");
  });

  it("rejects a wrong token and a mismatched password, creating nothing", async () => {
    expect(await setupState()).toBe("open");
    await expect(setupSuperAdmin({ ...good, token: "nope" })).rejects.toThrow(/not correct/);
    await expect(setupSuperAdmin({ ...good, confirm: "different1234" })).rejects.toThrow(/do not match/);
    await expect(setupSuperAdmin({ ...good, password: "short1", confirm: "short1" })).rejects.toThrow(/at least 10/);
    expect((await query("SELECT 1 FROM users WHERE role='super_admin'")).rows.length).toBe(0);
  });

  it("creates a working super admin once, then closes itself", async () => {
    await setupSuperAdmin(good);
    expect(await setupState()).toBe("done");
    const { token } = await login("owner@example.com", "Str0ngPassphrase");
    const u = (await userFromToken(token))!;
    expect(u.role).toBe("super_admin");
    expect(u.institutionId).toBeNull();
    await expect(setupSuperAdmin({ ...good, email: "second@example.com" })).rejects.toThrow(/already complete/);
  });

  it("locks out guessing after repeated wrong tokens", async () => {
    for (let i = 0; i < 20; i++) await expect(setupSuperAdmin({ ...good, token: "guess" + i })).rejects.toThrow(/not correct/);
    await expect(setupSuperAdmin(good)).rejects.toThrow(/Too many attempts/);
  });

  it("the database allows only one super admin even under a race", async () => {
    const results = await Promise.allSettled([
      setupSuperAdmin({ ...good, email: "a@example.com" }),
      setupSuperAdmin({ ...good, email: "b@example.com" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    expect((await query("SELECT 1 FROM users WHERE role='super_admin'")).rows.length).toBe(1);
  });
});
