import { beforeAll, describe, expect, it } from "vitest";
import { freshDb, makeInstitution, seedAcademics, makeFaculty } from "./helpers";
import { login, authorize, userFromToken } from "@/lib/session";
import { requestPasswordReset, resetPassword, createProgram, createSection, assertOwned, structure, listStaff } from "@/services/core";
import { query } from "@/lib/db";

let A: Awaited<ReturnType<typeof makeInstitution>>;
let B: Awaited<ReturnType<typeof makeInstitution>>;
let aAcad: Awaited<ReturnType<typeof seedAcademics>>;
let bAcad: Awaited<ReturnType<typeof seedAcademics>>;

beforeAll(async () => {
  await freshDb();
  A = await makeInstitution("Alpha College", "admin@alpha.test");
  B = await makeInstitution("Beta University", "admin@beta.test");
  aAcad = await seedAcademics(A.admin, "A");
  bAcad = await seedAcademics(B.admin, "B");
});

describe("authentication", () => {
  it("rejects a wrong password with a generic message", async () => {
    await expect(login("admin@alpha.test", "wrong-password-1")).rejects.toThrow("Incorrect email or password.");
    await expect(login("nobody@alpha.test", "whatever-123")).rejects.toThrow("Incorrect email or password.");
  });
  it("locks the account after repeated failures, then a reset unlocks it", async () => {
    const f = await makeFaculty(A.admin, "lock@alpha.test");
    for (let i = 0; i < 5; i++) await login("lock@alpha.test", "bad-password-" + i).catch(() => {});
    await expect(login("lock@alpha.test", "Passw0rd!long")).rejects.toThrow(/locked/);
    const { token } = await requestPasswordReset("lock@alpha.test");
    expect(token).toBeTruthy();
    await resetPassword(token!, "BrandNew123pass");
    await expect(login("lock@alpha.test", "BrandNew123pass")).resolves.toBeTruthy();
    // single use
    await expect(resetPassword(token!, "AnotherPass123")).rejects.toThrow(/invalid or has expired/);
    expect(f.id).toBeTruthy();
  });
  it("does not reveal whether an email exists on reset", async () => {
    expect((await requestPasswordReset("ghost@nowhere.test")).token).toBeNull();
  });
  it("invalidates expired sessions", async () => {
    await query("UPDATE sessions SET expires_at = now() - interval '1 minute'");
    expect(await userFromToken(A.token)).toBeNull();
  });
});

describe("permissions", () => {
  it("blocks roles lacking a permission and unauthenticated users", async () => {
    const lib = await makeFaculty(A.admin, "lib@alpha.test", "librarian");
    expect(() => authorize(lib.user, "fees.write", { write: true })).toThrow(/permission/);
    expect(() => authorize(null, "students.read")).toThrow(/session has expired/);
    expect(() => authorize(lib.user, "library.manage")).not.toThrow();
  });
  it("blocks writes for suspended and lapsed institutions", async () => {
    const f = await makeFaculty(A.admin, "fac2@alpha.test");
    await query("UPDATE institutions SET status='past_due' WHERE id=$1", [A.institutionId]);
    const u1 = (await login("fac2@alpha.test", "Passw0rd!long").then((r) => r.user));
    expect(() => authorize(u1, "attendance.mark", { write: true })).toThrow(/lapsed/);
    expect(() => authorize(u1, "attendance.read")).not.toThrow();
    await query("UPDATE institutions SET status='suspended' WHERE id=$1", [A.institutionId]);
    const u2 = (await userFromToken((await login("fac2@alpha.test", "Passw0rd!long")).token))!;
    expect(() => authorize(u2, "attendance.read")).toThrow(/suspended/);
    await query("UPDATE institutions SET status='trial' WHERE id=$1", [A.institutionId]);
    expect(f.id).toBeTruthy();
  });
});

describe("tenant isolation", () => {
  it("cannot reference another institution's records", async () => {
    await expect(createSection(A.admin, { programId: bAcad.program, name: "Z", yearNo: 1 })).rejects.toThrow(/not found/i);
    await expect(createProgram(A.admin, { name: "Xray", code: "XX1", departmentId: bAcad.dept, durationYears: 3, seats: 10 })).rejects.toThrow(/not found/i);
    await expect(assertOwned("courses", bAcad.course, A.institutionId)).rejects.toThrow(/not found/i);
  });
  it("lists only its own structure and staff", async () => {
    const s = await structure(A.admin);
    expect(s.programs.map((p: any) => p.id)).toEqual([aAcad.program]);
    const staff = await listStaff(A.admin);
    expect(staff.every((x: any) => !String(x.email).includes("beta"))).toBe(true);
  });
  it("prevents duplicate emails across institutions", async () => {
    await expect(makeFaculty(B.admin, "admin@alpha.test")).rejects.toThrow(/already exists/);
  });
});

describe("every staff role can open its dashboard data", () => {
  it("loads the institution record and dashboard for roles without student access (HR)", async () => {
    const { getInstitution } = await import("@/services/core");
    const { staffDashboard } = await import("@/services/dashboard");
    for (const role of ["hr_manager", "librarian", "accountant", "admissions_officer", "hod", "faculty"] as const) {
      const f = await makeFaculty(A.admin, `${role}-dash@alpha.test`, role as any);
      expect((await getInstitution(f.user))?.name).toBe("Alpha College");
      await expect(staffDashboard(f.user)).resolves.toBeTruthy();
    }
  });
});
