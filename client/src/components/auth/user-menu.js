'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronsUpDown, Copy, KeyRound, Loader2, LogOut, ShieldCheck, Users } from 'lucide-react';
import { api, setToken } from '@/lib/api';
import { initials, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useAuth } from '@/components/auth/auth-provider';

function ChangePasswordDialog({ open, onOpenChange }) {
  const { setUser } = useAuth();
  const [form, setForm] = useState({ current: '', next: '', again: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const change = useMutation({
    mutationFn: () => api.auth.changePassword({ currentPassword: form.current, newPassword: form.next }),
    onSuccess: ({ token, user }) => {
      setUser(user);
      setToken(token); // the old token is now invalid (passwordChangedAt)
      toast.success('Password changed');
      onOpenChange(false);
    },
    onError: (err) => setError(err?.message || 'Could not change the password'),
  });
  const submit = (e) => {
    e.preventDefault();
    setError('');
    if (form.next.length < 8) return setError('Use at least 8 characters');
    if (form.next !== form.again) return setError('The new passwords do not match');
    change.mutate();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-sm">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>Other devices signed in with the old password will be signed out.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="cp-current">Current password</Label>
            <Input id="cp-current" type="password" value={form.current} onChange={set('current')} autoComplete="current-password" required autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cp-next">New password</Label>
            <Input id="cp-next" type="password" value={form.next} onChange={set('next')} autoComplete="new-password" required minLength={8} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cp-again">Repeat new password</Label>
            <Input id="cp-again" type="password" value={form.again} onChange={set('again')} autoComplete="new-password" required />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={change.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={change.isPending}>
              {change.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />}
              Change password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Super admin: the team, with password resets and access on/off. */
function UsersDialog({ open, onOpenChange }) {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const { data, isPending } = useQuery({ queryKey: ['auth', 'users'], queryFn: api.auth.users, enabled: open });
  const [reset, setReset] = useState(null); // { user } to confirm, then { user, password } to show
  const invalidate = () => qc.invalidateQueries({ queryKey: ['auth', 'users'] });
  const doReset = useMutation({
    mutationFn: (id) => api.auth.resetPassword(id),
    onSuccess: (r) => {
      invalidate();
      setReset({ user: r.user, password: r.password });
    },
    onError: (err) => toast.error(err?.message || 'Could not reset the password'),
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }) => api.auth.updateUser(id, { active }),
    onSuccess: (r) => {
      invalidate();
      toast.success(r.user.active ? `${r.user.displayName} can sign in again` : `${r.user.displayName} can no longer sign in`);
    },
    onError: (err) => toast.error(err?.message || 'Could not update the user'),
  });
  const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast.success('Copied'));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Team access</DialogTitle>
          <DialogDescription>Only these accounts can sign in. Reset a password to get a new one to hand out; switch access off to lock someone out.</DialogDescription>
        </DialogHeader>
        {reset?.password ? (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
            <p className="font-medium">New password for {reset.user.displayName}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2">
              <code className="rounded bg-background px-2 py-1 font-mono text-base">{reset.password}</code>
              <Button size="xs" variant="outline" onClick={() => copy(`${reset.user.username} / ${reset.password}`)}>
                <Copy /> Copy username + password
              </Button>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Shown once. They can change it after signing in.</p>
          </div>
        ) : null}
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead>Access</TableHead>
                <TableHead className="text-right">Password</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : (
                (data?.items || []).map((u) => {
                  const self = u._id === me?._id;
                  return (
                    <TableRow key={u._id} className={cn(!u.active && 'opacity-60')}>
                      <TableCell className="font-mono text-xs">{u.userId}</TableCell>
                      <TableCell className="font-medium">
                        {u.displayName}
                        {u.role === 'admin' ? (
                          <Badge variant="secondary" className="ml-2 font-normal">
                            super admin
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>{u.username}</TableCell>
                      <TableCell className="text-muted-foreground" suppressHydrationWarning>
                        {u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'never'}
                      </TableCell>
                      <TableCell>
                        <Switch size="sm" checked={u.active} disabled={self || toggle.isPending} onCheckedChange={(v) => toggle.mutate({ id: u._id, active: v })} aria-label={`Access for ${u.displayName}`} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="xs" variant="outline" onClick={() => setReset({ user: u })} disabled={doReset.isPending}>
                          <KeyRound /> Reset
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        <ConfirmDialog
          open={Boolean(reset && !reset.password)}
          onOpenChange={(v) => !v && setReset(null)}
          title={`Reset ${reset?.user?.displayName}'s password?`}
          description="A new password is generated and shown to you once. Their current sessions are signed out."
          confirmLabel="Reset password"
          pending={doReset.isPending}
          onConfirm={() => doReset.mutate(reset.user._id)}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Signed-in user block for the sidebar: name, staff ID, role, change password, team (admin), sign out. */
export function UserMenu({ compact = false, className }) {
  const { user, logout, isAdmin } = useAuth();
  const [dialog, setDialog] = useState(null); // 'password' | 'users'
  if (!user) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              compact && 'w-auto',
              className,
            )}
            aria-label="Account menu"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(user.displayName)}</span>
            {compact ? null : (
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{user.displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {user.userId} · {user.role === 'admin' ? 'Super admin' : 'Team'}
                </span>
              </span>
            )}
            {compact ? null : <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={compact ? 'end' : 'start'} className="w-56">
          <DropdownMenuLabel>
            <span className="block">{user.displayName}</span>
            <span className="block text-xs font-normal text-muted-foreground">
              @{user.username} · {user.userId}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialog('password')}>
            <KeyRound /> Change password
          </DropdownMenuItem>
          {isAdmin ? (
            <DropdownMenuItem onSelect={() => setDialog('users')}>
              <Users /> Team access
            </DropdownMenuItem>
          ) : null}
          {isAdmin ? (
            <DropdownMenuItem disabled>
              <ShieldCheck /> Super admin: manages email templates
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={logout}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog === 'password' ? <ChangePasswordDialog open onOpenChange={(v) => !v && setDialog(null)} /> : null}
      {dialog === 'users' ? <UsersDialog open onOpenChange={(v) => !v && setDialog(null)} /> : null}
    </>
  );
}
