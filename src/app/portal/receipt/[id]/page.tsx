import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/web";
import { receipt } from "@/services/fees";
import { ReceiptView } from "@/components/receipt";
import { PrintButton } from "@/components/print-button";
import { AppError } from "@/lib/errors";
export const metadata = { title: "Receipt" };
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(["student", "parent"]);
  let r; try { r = await receipt(u, (await params).id); } catch (e) { if (e instanceof AppError) notFound(); throw e; }
  if (!r) notFound();
  return (<><div className="mb-4 flex justify-center gap-3 print:hidden"><PrintButton /><Link href="/portal/fees" className="btn-secondary">← Back</Link></div><ReceiptView r={r} /></>);
}
