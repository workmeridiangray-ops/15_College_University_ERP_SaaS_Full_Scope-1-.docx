import type { ReactNode } from "react";
import { requireUser } from "@/lib/web";
import { portalContext } from "@/services/portal";
import { ChildPicker } from "./child-picker";
import { Empty, PageHeader } from "./ui";
import type { SessionUser } from "@/lib/session";

/** Resolves the signed-in student/parent and the child being viewed, then renders the section. */
export async function PortalPage({ path, title, child, children }: { path: string; title: string; child?: string; children: (ctx: { user: SessionUser; studentId: string; name: string }) => Promise<ReactNode> | ReactNode }) {
  const user = await requireUser(["student", "parent"]);
  const { kids, current } = await portalContext(user, child);
  if (!current) return (<><PageHeader title={title} /><Empty title="No student is linked to your account yet" hint="Contact your institution's office so they can link your account." /></>);
  return (<><PageHeader title={title} subtitle={kids.length > 1 || user.role === "parent" ? `${current.name} · ${current.program}${current.section ? ` · Section ${current.section}` : ""}` : `${current.program}${current.section ? ` · Section ${current.section}` : ""}`} /><ChildPicker kids={kids} current={current.id} path={path} />{await children({ user, studentId: current.id, name: current.name })}</>);
}
