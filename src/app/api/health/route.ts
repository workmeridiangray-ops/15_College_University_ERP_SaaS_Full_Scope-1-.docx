import { query } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await query("SELECT 1");
    return Response.json({ status: "ok", time: new Date().toISOString() });
  } catch {
    return Response.json({ status: "degraded", database: "unreachable" }, { status: 503 });
  }
}
