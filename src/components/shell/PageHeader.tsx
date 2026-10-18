import { Breadcrumbs } from "@/components/shell/Breadcrumbs";

type PageHeaderProps = {
  title: string;
  description: string;
  breadcrumbs?: { label: string; href?: string }[];
  badge?: string;
  actions?: React.ReactNode;
};

export function PageHeader({
  title,
  description,
  breadcrumbs,
  badge,
  actions,
}: PageHeaderProps) {
  return (
    <header className="mb-8 border-b border-border pb-6">
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <div className="mb-3">
          <Breadcrumbs items={breadcrumbs} />
        </div>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {badge ? (
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
              {badge}
            </p>
          ) : null}
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted md:text-base">
            {description}
          </p>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </header>
  );
}
