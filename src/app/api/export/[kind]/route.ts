import { cookies } from "next/headers";
import { userFromToken, SESSION_COOKIE, authorize } from "@/lib/session";
import { duesCsv } from "@/services/fees";
import { listStudents } from "@/services/students";
import { lowAttendance } from "@/services/academics";
import { toCsv } from "@/lib/csv";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const user = await userFromToken((await cookies()).get(SESSION_COOKIE)?.value);
  try {
    let csv: string;
    if (kind === "dues") csv = await duesCsv(user!);
    else if (kind === "students") {
      const all: unknown[][] = []; let page = 1, pages = 1;
      do { const r = await listStudents(user!, { page }); pages = r.pages; for (const s of r.rows as any[]) all.push([s.enrolment_no, s.name, s.email, s.phone, s.program, s.section, s.status]); page++; } while (page <= pages);
      csv = toCsv(["Enrolment", "Name", "Email", "Phone", "Program", "Section", "Status"], all);
    } else if (kind === "low-attendance") {
      authorize(user, "reports.read");
      csv = toCsv(["Enrolment", "Student", "Course", "Attendance %"], (await lowAttendance(user!)).map((r: any) => [r.enrolment_no, r.name, r.course, r.pct]));
    } else return new Response("Not found", { status: 404 });
    await audit(user!, "export." + kind, "export", kind);
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${kind}-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "private, no-store" } });
  } catch (e) {
    if (e instanceof AppError || !user) return new Response(e instanceof AppError ? e.message : "Unauthorised", { status: !user || (e instanceof AppError && e.code === "unauthenticated") ? 401 : 403 });
    return new Response("Export failed", { status: 500 });
  }
}
