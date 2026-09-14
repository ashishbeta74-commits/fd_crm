import { AlertCircle, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Query failure with a Retry button (message comes from ApiError). */
export function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-center gap-2 text-destructive">
        <AlertCircle className="size-4 shrink-0" aria-hidden />
        {message}
      </p>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

export function EmptyState({ title, description }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
      <Inbox className="size-6 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
