import { requirePerm } from "@/lib/web";
import { TicketView } from "@/components/support";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <TicketView user={await requirePerm("support.create")} id={(await params).id} base="/app/support" />; }
