import { cookies } from "next/headers";
import { one, query } from "@/lib/db";
import { saveUpload } from "@/lib/files";
import { sameOrigin } from "@/lib/origin";
import { authorize, userFromToken, SESSION_COOKIE } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { assertOwned } from "@/services/core";
import { audit } from "@/lib/audit";
export const dynamic = "force-dynamic";

const fail = (m: string, status = 400) => Response.json({ error: m }, { status });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail("Blocked cross-site request.", 403);
  try {
    const fd = await req.formData();
    const file = fd.get("file");
    if (!(file instanceof File)) return fail("Choose a file to upload.");
    const mode = String(fd.get("mode") ?? "");
    if (mode === "applicant") {
      // Applicants are not signed in: they prove ownership with tracking code + email.
      const a = await one<{ id: string; institution_id: string }>("SELECT id, institution_id FROM applications WHERE tracking_code=$1 AND lower(email)=lower($2)", [String(fd.get("code") ?? "").trim().toUpperCase(), String(fd.get("email") ?? "").trim()]);
      if (!a) return fail("No application matches that code and email.", 404);
      const n = Number((await one<{ n: string }>("SELECT count(*) n FROM documents WHERE owner_type='application' AND owner_id=$1", [a.id]))!.n);
      if (n >= 5) return fail("You can attach up to 5 documents.");
      const s = await saveUpload(a.institution_id, file);
      await query("INSERT INTO documents (institution_id, owner_type, owner_id, filename, stored_name, mime, size_bytes) VALUES ($1,'application',$2,$3,$4,$5,$6)", [a.institution_id, a.id, s.filename, s.storedName, s.mime, s.size]);
      return Response.json({ ok: true, filename: s.filename });
    }
    const user = await userFromToken((await cookies()).get(SESSION_COOKIE)?.value);
    const ctx = authorize(user, "students.write", { write: true });
    const studentId = String(fd.get("studentId") ?? "");
    await assertOwned("students", studentId, ctx.institutionId);
    const s = await saveUpload(ctx.institutionId, file);
    const d = await one<{ id: string }>("INSERT INTO documents (institution_id, owner_type, owner_id, filename, stored_name, mime, size_bytes, uploaded_by) VALUES ($1,'student',$2,$3,$4,$5,$6,$7) RETURNING id", [ctx.institutionId, studentId, s.filename, s.storedName, s.mime, s.size, ctx.user.id]);
    await audit(ctx.user, "document.uploaded", "student", studentId, { documentId: d!.id });
    return Response.json({ ok: true, filename: s.filename });
  } catch (e) {
    if (e instanceof AppError) return fail(e.message, e.code === "unauthenticated" ? 401 : e.code === "forbidden" ? 403 : e.code === "not_found" ? 404 : 400);
    return fail("The upload failed. Please try again.", 500);
  }
}
