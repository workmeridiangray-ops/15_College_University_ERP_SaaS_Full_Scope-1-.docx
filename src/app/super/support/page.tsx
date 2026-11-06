import { requireUser } from "@/lib/web";
import { SupportList } from "@/components/support";
export const metadata = { title: "Support inbox" };
export const dynamic = "force-dynamic";
export default async function Page() { return <SupportList user={await requireUser(["super_admin"])} base="/super/support" />; }
