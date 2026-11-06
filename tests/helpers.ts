import { useMemoryDb } from "@/lib/db";
import { migrate } from "@/lib/migrate";
import { signupInstitution, createStaffUser, createDepartment, createProgram, createSection, createCourse } from "@/services/core";
import { userFromToken, login } from "@/lib/session";

export async function freshDb() {
  useMemoryDb();
  await migrate();
}

export async function makeInstitution(name: string, email: string) {
  const r = await signupInstitution({ institutionName: name, adminName: "Admin " + name, email, password: "Passw0rd!long", planCode: "growth" });
  const { token } = await login(email, "Passw0rd!long");
  const admin = (await userFromToken(token))!;
  return { ...r, admin, token };
}

export async function seedAcademics(admin: NonNullable<Awaited<ReturnType<typeof userFromToken>>>, tag = "A") {
  const dept = await createDepartment(admin, { name: `Computer Science ${tag}`, code: `CS${tag}` });
  const program = await createProgram(admin, { name: `BSc Computer Science ${tag}`, code: `BSC${tag}`, departmentId: dept, durationYears: 3, seats: 60 });
  const section = await createSection(admin, { programId: program, name: "A", yearNo: 1 });
  const course = await createCourse(admin, { programId: program, code: `CS10${tag}`, name: "Intro to Programming", credits: 4, semester: 1 });
  return { dept, program, section, course };
}

export async function makeFaculty(admin: NonNullable<Awaited<ReturnType<typeof userFromToken>>>, email: string, role: "faculty" | "accountant" | "librarian" | "hr_manager" | "admissions_officer" | "hod" = "faculty") {
  const id = await createStaffUser(admin, { name: "Staff " + email, email, role, password: "Passw0rd!long", designation: "Lecturer", baseSalary: 40000 });
  const { token } = await login(email, "Passw0rd!long");
  return { id, user: (await userFromToken(token))!, token };
}
