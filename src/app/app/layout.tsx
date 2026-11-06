import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/web";
import { homeFor } from "@/lib/permissions";
import { Shell } from "@/components/shell";

export default async function StaffLayout({ children }: { children: ReactNode }) {
  const u = await requireUser();
  if (!u.institutionId || u.role === "student" || u.role === "parent" || u.role === "applicant") redirect(homeFor(u.role));
  return <Shell user={u} area="app">{children}</Shell>;
}
