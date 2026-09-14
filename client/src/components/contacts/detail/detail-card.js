import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** Buttons keep a 36px touch target below `sm`, then drop back to the compact shadcn sizes. */
export const TOUCH_SM = 'h-9 sm:h-8';
export const TOUCH_XS = 'h-8 sm:h-6';

/** Compact card used for every section of the contact detail page. */
export function DetailCard({ title, className, children }) {
  return (
    <Card className={cn('gap-4 py-5 transition-shadow duration-200 hover:shadow-md', className)}>
      <CardHeader className="px-5">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-5">{children}</CardContent>
    </Card>
  );
}

/** Label / value rows: stacked on phones, two columns from `sm`. */
export function DetailRows({ children }) {
  return <dl className="divide-y">{children}</dl>;
}

export function DetailRow({ label, children }) {
  return (
    <div className="grid gap-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm wrap-break-word">{children}</dd>
    </div>
  );
}

export function Muted({ children }) {
  return <span className="text-muted-foreground">{children}</span>;
}

export function EmptyNote({ children }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
