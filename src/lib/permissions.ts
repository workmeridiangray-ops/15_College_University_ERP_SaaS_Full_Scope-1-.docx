export type Role =
  | "super_admin" | "institution_admin" | "admissions_officer" | "accountant" | "hod"
  | "faculty" | "librarian" | "hr_manager" | "student" | "parent" | "applicant";

export const STAFF_ROLES: Role[] = ["institution_admin", "admissions_officer", "accountant", "hod", "faculty", "librarian", "hr_manager"];

export type Permission =
  | "org.manage" | "users.manage" | "academics.manage" | "students.read" | "students.write"
  | "admissions.manage" | "fees.read" | "fees.write" | "attendance.mark" | "attendance.read"
  | "assignments.manage" | "exams.manage" | "marks.enter" | "timetable.manage" | "announce.write"
  | "library.manage" | "hr.manage" | "leave.request" | "reports.read" | "audit.read" | "support.create";

const ALL_STAFF_COMMON: Permission[] = ["leave.request", "support.create"];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: [],
  institution_admin: [
    "org.manage", "users.manage", "academics.manage", "students.read", "students.write", "admissions.manage",
    "fees.read", "fees.write", "attendance.read", "attendance.mark", "assignments.manage", "exams.manage", "marks.enter",
    "timetable.manage", "announce.write", "library.manage", "hr.manage", "reports.read", "audit.read", ...ALL_STAFF_COMMON,
  ],
  admissions_officer: ["students.read", "admissions.manage", "announce.write", "reports.read", ...ALL_STAFF_COMMON],
  accountant: ["students.read", "fees.read", "fees.write", "reports.read", ...ALL_STAFF_COMMON],
  hod: ["students.read", "academics.manage", "attendance.read", "attendance.mark", "assignments.manage", "exams.manage", "marks.enter", "timetable.manage", "announce.write", "reports.read", ...ALL_STAFF_COMMON],
  faculty: ["students.read", "attendance.read", "attendance.mark", "assignments.manage", "exams.manage", "marks.enter", "announce.write", ...ALL_STAFF_COMMON],
  librarian: ["students.read", "library.manage", ...ALL_STAFF_COMMON],
  hr_manager: ["hr.manage", "reports.read", ...ALL_STAFF_COMMON],
  student: ["support.create"],
  parent: ["support.create"],
  applicant: [],
};

export function can(role: Role, perm: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
}

export function homeFor(role: Role): string {
  if (role === "super_admin") return "/super";
  if (role === "student" || role === "parent") return "/portal";
  if (role === "applicant") return "/apply";
  return "/app";
}
