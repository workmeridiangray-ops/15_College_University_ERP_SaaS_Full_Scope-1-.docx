import Link from "next/link";
export function ChildPicker({ kids, current, path }: { kids: { id: string; name: string }[]; current: string; path: string }) {
  if (kids.length < 2) return null;
  return (<nav className="mb-5 flex flex-wrap gap-2" aria-label="Choose child">{kids.map((k) => <Link key={k.id} href={`${path}?child=${k.id}`} className={`btn-sm ${k.id === current ? "btn-primary" : "btn-secondary"}`}>{k.name}</Link>)}</nav>);
}
