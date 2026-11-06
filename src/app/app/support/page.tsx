import { requirePerm } from "@/lib/web";
import { SupportList } from "@/components/support";
export const metadata = { title: "Support" };
export const dynamic = "force-dynamic";
export default async function Page() { return <SupportList user={await requirePerm("support.create")} base="/app/support" />; }
