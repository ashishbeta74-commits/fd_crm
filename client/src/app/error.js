'use client';

import { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ErrorPage({ error, retry, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  // Next 16.3+ passes `retry` (re-fetches and re-renders); `reset` is the older equivalent.
  const tryAgain = retry || reset;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <span className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-5" aria-hidden="true" />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground break-words">{error?.message || 'An unexpected error occurred.'}</p>
      {error?.digest ? <p className="text-xs text-muted-foreground">Reference: {error.digest}</p> : null}
      <Button className="mt-2" onClick={() => tryAgain?.()}>
        Try again
      </Button>
    </div>
  );
}
