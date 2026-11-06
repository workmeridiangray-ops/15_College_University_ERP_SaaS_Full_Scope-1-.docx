import { cookies } from "next/headers";
import { one } from "@/lib/db";
import { readUpload } from "@/lib/files";
import { userFromToken, SESSION_COOKIE, institutionAccess } from "@/lib/session";
import { can } from "@/lib/permissions";
import { portalStudentIds } from "@/services/students";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notFound = () => new Response("Not found", { status: 404 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return notFound();
  const user = await userFromToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user?.institutionId || institutionAccess(user) === "blocked") return new Response("Unauthorised", { status: 401 });
  const d = await one<{ institution_id: string; owner_type: string; owner_id: string; filename: string; stored_name: string; mime: string }>("SELECT institution_id, owner_type, owner_id, filename, stored_name, mime FROM documents WHERE id=$1", [id]);
  if (!d || d.institution_id !== user.institutionId) return notFound();
  let allowed = false;
  if (d.owner_type === "student") {
    if (user.role === "student" || user.role === "parent") allowed = (await portalStudentIds(user)).includes(d.owner_id);
    else allowed = can(user.role, "students.read");
  } else if (d.owner_type === "application") allowed = can(user.role, "admissions.manage");
  if (!allowed) return notFound();
  try {
    const buf = await readUpload(d.institution_id, d.stored_name);
    return new Response(new Uint8Array(buf), { headers: { "content-type": d.mime, "content-disposition": `attachment; filename="${d.filename.replace(/"/g, "")}"`, "x-content-type-options": "nosniff", "cache-control": "private, no-store" } });
  } catch { return notFound(); }
}
