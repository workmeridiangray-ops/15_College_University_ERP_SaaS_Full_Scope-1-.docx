"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

declare global { interface Window { Razorpay?: new (o: Record<string, unknown>) => { open(): void; on(e: string, f: () => void): void } } }

export function PayOnline({ invoiceId, balance }: { invoiceId: string; balance: number }) {
  const [state, setState] = useState<{ busy?: boolean; msg?: string; err?: string }>({});
  const router = useRouter();
  async function pay() {
    setState({ busy: true });
    try {
      const res = await fetch("/api/pay/order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ invoiceId }) });
      const o = await res.json();
      if (!res.ok) return setState({ err: res.status === 401 ? "Your session has expired. Sign in again." : o.error });
      await new Promise<void>((ok, bad) => { if (window.Razorpay) return ok(); const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.onload = () => ok(); s.onerror = () => bad(new Error("load")); document.body.appendChild(s); });
      const rz = new window.Razorpay!({
        key: o.keyId, amount: o.amountPaise, currency: "INR", order_id: o.orderId, name: "Fee payment",
        handler: () => { setState({ msg: "Payment received. Confirming with the bank…" }); let n = 0; const t = setInterval(() => { router.refresh(); if (++n > 8) { clearInterval(t); setState({ msg: "Your payment is being confirmed. It can take a minute; refresh to check." }); } }, 3000); },
        modal: { ondismiss: () => setState({}) },
      });
      rz.on("payment.failed", () => setState({ err: "The payment failed. You have not been charged for this attempt; please try again." }));
      rz.open();
      setState({});
    } catch { setState({ err: "Could not load the payment window. Check your connection and try again." }); }
  }
  return (<div><button onClick={pay} disabled={state.busy} className="btn-primary btn-sm">{state.busy ? "Opening…" : `Pay ₹${(balance / 100).toLocaleString("en-IN")} online`}</button>{state.msg && <p role="status" className="mt-1 text-xs text-emerald-700">{state.msg}</p>}{state.err && <p role="alert" className="mt-1 text-xs text-red-600">{state.err}</p>}</div>);
}
