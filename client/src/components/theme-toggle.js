'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const noop = () => () => {};
// The stored theme is only known in the browser; render the light icon on the server so hydration matches.
const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

/** One-click light / dark toggle (sun = currently light, moon = currently dark). Remembered in the browser via next-themes. */
export function ThemeToggle({ className, side = 'bottom' }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const dark = mounted && resolvedTheme === 'dark';
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn('relative size-9 sm:size-8', className)}
          onClick={() => setTheme(dark ? 'light' : 'dark')}
          aria-label={label}
          aria-pressed={dark}
        >
          {/* The icons cross-fade and rotate on switch. */}
          <Sun className={cn('size-4 transition-all duration-300', dark ? 'scale-0 -rotate-90' : 'scale-100 rotate-0')} aria-hidden="true" />
          <Moon className={cn('absolute size-4 transition-all duration-300', dark ? 'scale-100 rotate-0' : 'scale-0 rotate-90')} aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
