import type { ReactNode } from "react";

/**
 * ChartCard — the white panel every chart sits in.
 *
 * Server-safe (no hooks) so a page can compose it directly; only the charts
 * themselves are client components. The heading level is a prop because the
 * same card is used as a top-level section on the analytics page and as a
 * nested card on the dashboard overview.
 */
export default function ChartCard({
  title,
  subtitle,
  eyebrow,
  action,
  children,
  footer,
  headingLevel: Heading = "h2",
  className = "",
}: {
  title: string;
  subtitle?: string;
  /** Small uppercase kicker above the title (matches the rest of the portal). */
  eyebrow?: string;
  /** Optional link rendered on the right of the header. */
  action?: { href: string; label: string };
  children: ReactNode;
  footer?: ReactNode;
  headingLevel?: "h2" | "h3";
  className?: string;
}) {
  return (
    <section className={`flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">{eyebrow}</p> : null}
          <Heading className={`${eyebrow ? "mt-1" : ""} font-semibold text-slate-900`}>{title}</Heading>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {action ? (
          <a href={action.href} className="shrink-0 text-sm font-semibold text-blue-600 hover:underline">
            {action.label} →
          </a>
        ) : null}
      </header>
      <div className="mt-5 flex-1">{children}</div>
      {footer ? <div className="mt-5 border-t border-slate-100 pt-4">{footer}</div> : null}
    </section>
  );
}

/**
 * EmptyChart — shown when a query returns no rows. Every chart renders one of
 * these instead of an empty axis so the panel never looks broken.
 */
export function EmptyChart({ message }: { message: string }) {
  return (
    <div className="grid min-h-[220px] place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
      <p className="max-w-xs text-sm text-slate-500">{message}</p>
    </div>
  );
}