'use client';

import { Suspense, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, CalendarClock, Copy, LayoutDashboard, Linkedin, Mail, Menu, Upload, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ReminderBell } from '@/components/reminders/reminder-bell';
import { ThemeToggle } from '@/components/theme-toggle';
import { SidebarViews } from '@/components/views/sidebar-views';
import { useAuth } from '@/components/auth/auth-provider';
import { LoginScreen } from '@/components/auth/login-screen';
import { UserMenu } from '@/components/auth/user-menu';
import { LoadingScreen } from '@/components/loading-screen';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/contacts', label: 'Contacts', icon: Users, children: SidebarViews },
  { href: '/follow-ups', label: 'Follow-ups', icon: CalendarClock },
  { href: '/linkedin', label: 'LinkedIn CRM', icon: Linkedin, accent: true },
  { href: '/duplicates', label: 'Duplicates', icon: Copy },
  { href: '/templates', label: 'Email templates', icon: Mail },
  { href: '/scripts', label: 'Phone scripts & Q&A', icon: BookOpen },
  { href: '/import', label: 'Import', icon: Upload },
];

// One easing for everything that moves in the shell, so the rail, drawer, labels and page slide together.
const EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]';

/**
 * Text that folds away when the sidebar is a rail: it shrinks to zero width and fades, instead
 * of popping out, so the rail feels like it slides shut over it.
 */
function Foldable({ collapsed, className, children }) {
  return (
    <span
      className={cn('block min-w-0 overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-300', EASE, collapsed ? 'max-w-0 -translate-x-2 opacity-0' : 'max-w-48 translate-x-0 opacity-100', className)}
      aria-hidden={collapsed || undefined}
    >
      {children}
    </span>
  );
}

function NavLinks({ onNavigate, collapsed = false }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {NAV.map(({ href, label, icon: Icon, children: Children, accent }, i) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        const link = (
          <Link
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            aria-label={collapsed ? label : undefined}
            style={{ '--i': i }}
            className={cn(
              'group/nav relative flex min-h-9 items-center gap-3 rounded-md py-2 text-sm font-medium transition-[background-color,color,padding,transform] duration-300',
              EASE,
              collapsed ? 'justify-center px-0' : 'px-3',
              // a gold bar grows in from the left on the active page
              'before:absolute before:top-1/2 before:left-0 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-brand-gold-deep before:transition-[transform,opacity] before:duration-300 dark:before:bg-brand-gold',
              active ? 'bg-sidebar-accent text-sidebar-accent-foreground before:scale-y-100 before:opacity-100' : 'text-muted-foreground before:scale-y-0 before:opacity-0 hover:bg-sidebar-accent/60 hover:text-foreground active:bg-sidebar-accent motion-safe:hover:translate-x-0.5',
              // each item eases in a touch after the previous one when the sidebar mounts
              'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-2 motion-safe:fill-mode-backwards motion-safe:duration-300 motion-safe:[animation-delay:calc(var(--i)*35ms)]',
            )}
          >
            {/* The second CRM gets LinkedIn's blue so it stands out as a separate workspace; the active page gets the brand gold. */}
            <Icon
              className={cn(
                'size-4 shrink-0 transition-transform duration-300',
                EASE,
                'motion-safe:group-hover/nav:scale-110',
                accent && 'text-[#0a66c2] dark:text-sky-400',
                active && !accent && 'text-brand-gold-deep dark:text-brand-gold',
              )}
              aria-hidden="true"
            />
            <Foldable collapsed={collapsed}>{label}</Foldable>
          </Link>
        );
        return (
          <div key={href}>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            ) : (
              link
            )}
            {Children ? (
              // useSearchParams inside needs a Suspense boundary. The pinned views fold away with the labels.
              <div className={cn('grid transition-[grid-template-rows,opacity] duration-300', EASE, collapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100')} aria-hidden={collapsed || undefined}>
                <div className="min-h-0 overflow-hidden">
                  <Suspense fallback={null}>
                    <Children onNavigate={onNavigate} />
                  </Suspense>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

/** Famous Drive mark: the gold FD monogram and the wordmark in the site's serif, with "CRM" as an eyebrow. */
function Brand({ collapsed = false }) {
  return (
    <Link href="/" className={cn('flex items-center gap-2 rounded-md py-2 transition-[opacity,padding] duration-300 hover:opacity-80', EASE, collapsed ? 'px-0' : 'px-1')} aria-label="Famous Drive CRM home">
      <Image src="/images/fd-monogram.png" alt="" width={231} height={301} priority className="h-9 w-auto shrink-0" />
      <Foldable collapsed={collapsed} className="leading-tight">
        <span className="block font-display text-base font-semibold tracking-[0.1em] text-brand-gold-deep uppercase dark:text-brand-gold">Famous Drive</span>
        <span className="eyebrow block text-muted-foreground">CRM</span>
      </Foldable>
    </Link>
  );
}

export function AppShell({ children }) {
  const pathname = usePathname();
  const { status } = useAuth();
  // The drawer remembers the path it was opened on, so any route change (link, back/forward)
  // closes it without an effect.
  const [openPath, setOpenPath] = useState(null);
  const open = openPath === pathname;
  const setOpen = (v) => setOpenPath(v ? pathname : null);

  // Nothing but the sign-in screen renders until the session is confirmed, so no page fires API calls unauthenticated.
  if (status === 'anonymous' || status === 'error') return <LoginScreen />;
  if (status !== 'authenticated') {
    return (
      <LoadingScreen fullscreen label="Opening your CRM" hint="Checking your session…" />
    );
  }

  return (
    <div className="flex min-h-svh">
      {/* desktop rail: icons only, always (labels are tooltips). It sticks to the viewport so only the page content scrolls. */}
      <aside className="hidden w-16 shrink-0 flex-col items-center border-r bg-sidebar px-2 py-3 md:sticky md:top-0 md:flex md:h-svh md:self-start md:overflow-x-hidden md:overflow-y-auto" aria-label="Sidebar">
        <Brand collapsed />
        <div className="mt-4 w-full">
          <NavLinks collapsed />
        </div>
        <div className="mt-auto flex w-full flex-col items-center gap-1 border-t pt-3">
          <ThemeToggle side="right" />
          <ReminderBell />
          <UserMenu compact />
        </div>
      </aside>

      {/* the menu drawer (hamburger on desktop, header button on phones): overlay fades, panel slides in from the left and back out on close */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className={cn('w-64 gap-0 bg-sidebar p-3 data-[state=closed]:duration-200 data-[state=open]:duration-300', EASE)}
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Main navigation</SheetDescription>
          <div className="flex items-center justify-between">
            <Brand />
            {/* the theme toggle lives on the rail (and in the phone header), so the drawer header is just brand + close */}
            <SheetClose asChild>
              <Button variant="ghost" size="icon" aria-label="Close menu" className="shrink-0">
                <X />
              </Button>
            </SheetClose>
          </div>
          <div className="mt-4">
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
          <div className="mt-auto border-t pt-3">
            <UserMenu />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b px-4 md:hidden">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="-ml-2" onClick={() => setOpen(true)} aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Open menu</TooltipContent>
          </Tooltip>
          <Image src="/images/fd-monogram.png" alt="" width={231} height={301} className="h-7 w-auto" />
          <span className="font-display text-base font-semibold tracking-[0.12em] text-brand-gold-deep uppercase dark:text-brand-gold">Famous Drive</span>
          <ThemeToggle className="ml-auto" />
          <ReminderBell />
          <UserMenu compact />
        </header>
        <main className="flex-1 px-4 py-6 md:px-8">
          {/* Keyed by pathname so each route's content fades and lifts in as it mounts. */}
          <div key={pathname} className={cn('motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300', EASE)}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
