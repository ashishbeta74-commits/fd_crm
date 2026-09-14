'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/components/auth/auth-provider';
import { ThemeToggle } from '@/components/theme-toggle';

/** Full-page sign-in. Shown instead of the app until a valid session exists. */
export function LoginScreen() {
  const { login, status, error: sessionError, refresh } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err?.message || 'Could not sign in');
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-svh items-center justify-center bg-gradient-to-br from-brand-espresso via-brand-saddle to-brand-camel px-4 py-10">
      <div className="absolute top-3 right-3">
        <ThemeToggle className="text-brand-champagne hover:bg-white/10 hover:text-brand-champagne" />
      </div>
      <div className="w-full max-w-sm rounded-xl border border-brand-gold/30 bg-card p-6 shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
        <div className="mb-6 flex items-center gap-3">
          <Image src="/images/fd-monogram.png" alt="" width={231} height={301} priority className="h-12 w-auto" />
          <div>
            <p className="eyebrow text-brand-gold-deep dark:text-brand-gold">Famous Drive</p>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Team CRM</h1>
            <p className="text-sm text-muted-foreground">Sign in with your team username</p>
          </div>
        </div>

        {status === 'error' ? (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p className="text-destructive">{sessionError || 'Cannot reach the API.'}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => refresh()}>
              Retry
            </Button>
          </div>
        ) : null}

        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="login-user">Username</Label>
            <Input id="login-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" autoFocus required placeholder="e.g. haroon" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="login-pass">Password</Label>
            <div className="relative">
              <Input id="login-pass" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className="pr-10" />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive motion-safe:animate-in motion-safe:fade-in">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy || !username.trim() || !password} aria-busy={busy || undefined}>
            {busy ? <Loader2 className="animate-spin" /> : <LogIn />}
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">Forgot your password? Ask the super admin to reset it.</p>
      </div>
    </div>
  );
}
