import { requireUser } from "@/lib/web";
import { TicketView } from "@/components/support";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <TicketView user={await requireUser(["super_admin"])} id={(await params).id} base="/super/support" />; }
