import type { ReactNode } from "react";
import { requireUser } from "@/lib/web";
import { Shell } from "@/components/shell";
export default async function SuperLayout({ children }: { children: ReactNode }) {
  const u = await requireUser(["super_admin"]);
  return <Shell user={u} area="super">{children}</Shell>;
}
