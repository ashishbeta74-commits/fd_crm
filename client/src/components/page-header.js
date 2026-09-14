export function PageHeader({ title, description, children }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-semibold tracking-tight wrap-break-word">{title}</h1>
        {description ? <p className="mt-1 text-sm text-pretty text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">{children}</div> : null}
    </div>
  );
}
