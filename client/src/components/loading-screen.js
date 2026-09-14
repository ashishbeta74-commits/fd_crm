import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Branded loading state: the CRM mark with a spinning ring, a label and a sliding progress bar.
 * `fullscreen` fills the viewport (sign-in check); otherwise it fills the page area (route changes).
 */
export function LoadingScreen({ label = 'Loading…', hint, fullscreen = false, className }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={cn('flex items-center justify-center px-4', fullscreen ? 'min-h-svh bg-background' : 'min-h-[60svh]', className)}>
      <div className="flex w-full max-w-xs flex-col items-center gap-5 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
        <div className="relative flex size-20 items-center justify-center">
          <span className="absolute inset-0 rounded-full border-2 border-border" aria-hidden />
          <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-brand-gold motion-safe:animate-spin" aria-hidden />
          <Image src="/images/fd-monogram.png" alt="" width={231} height={301} priority className="h-11 w-auto" />
        </div>
        <div className="grid gap-1">
          <p className="text-base font-semibold tracking-tight">{label}</p>
          {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
        </div>
        <div className="h-1 w-40 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full w-1/3 rounded-full bg-brand-gold motion-safe:animate-[loading-slide_1.2s_ease-in-out_infinite]" />
        </div>
      </div>
    </div>
  );
}
