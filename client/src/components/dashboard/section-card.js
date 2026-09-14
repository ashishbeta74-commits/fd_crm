import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Row inside a dashboard list. Bleeds 8px past the card content on both sides so the hover
 * background wraps the text; pair it with `-my-2` on the list so the first/last rows keep the
 * card's original vertical rhythm.
 */
export const LIST_ROW = '-mx-2 rounded-md px-2 py-2 transition-colors duration-200 hover:bg-accent/60';

/** Dashboard card: title, body, and an optional footer link `{ href, label }` pinned to the bottom. */
export function SectionCard({ title, footer, children, className }) {
  return (
    <Card className={cn('gap-4 py-5', className)}>
      <CardHeader className="px-5">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 px-5">{children}</CardContent>
      {footer ? (
        <CardFooter className="px-5">
          {/* -my-2 + min-h-9 grows the touch target without changing the footer's height. */}
          <Link
            href={footer.href}
            className="group -my-2 -ml-1 inline-flex min-h-9 items-center gap-1 rounded-md px-1 text-sm font-medium text-primary transition-colors hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {footer.label}
            <ArrowRight className="size-3.5 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </CardFooter>
      ) : null}
    </Card>
  );
}

export function EmptyState({ children }) {
  return <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">{children}</div>;
}

/**
 * Clipped text (default one line - pass `line-clamp-*` in className for more) that reveals the
 * full value in a tooltip. Renders nothing for empty text.
 */
export function TruncatedText({ text, className }) {
  if (!text) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <p className={cn('truncate', className)}>{text}</p>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-xs whitespace-pre-line">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
