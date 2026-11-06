import { requireUser } from "@/lib/web";
import { SupportList } from "@/components/support";
export const metadata = { title: "Support" };
export const dynamic = "force-dynamic";
export default async function Page() { return <SupportList user={await requireUser(["student", "parent"])} base="/portal/support" />; }
