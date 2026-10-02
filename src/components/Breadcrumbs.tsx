import Link from "next/link";

export default function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-400">{items.map((item, index) => <span key={`${item.label}-${index}`} className="inline-flex items-center gap-2">{index > 0 && <span aria-hidden>›</span>}{item.href ? <Link href={item.href} className="hover:text-blue-600">{item.label}</Link> : <span className="text-slate-600">{item.label}</span>}</span>)}</nav>;
}
