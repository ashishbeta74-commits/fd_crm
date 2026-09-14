'use client';

import { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CircleAlert, Copy, Loader2, Mail, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { api, qk } from '@/lib/api';
import { pluralize, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useAuth } from '@/components/auth/auth-provider';

export const CATEGORIES = [
  { key: 'outreach', label: 'Outreach' },
  { key: 'follow-up', label: 'Follow-up' },
  { key: 'booking', label: 'Booking' },
  { key: 'other', label: 'Other' },
];
const categoryLabel = (k) => CATEGORIES.find((c) => c.key === k)?.label || k;

// A stand-in contact so the editor can preview a template without picking a real one.
const SAMPLE = {
  firstName: 'Jane',
  name: 'Jane Doe',
  company: 'Acme Travel',
  title: 'Travel Advisor',
  email: 'jane@acmetravel.com',
  phone: '(212) 555-0100',
  location: 'New York, NY',
  followUpDate: 'Monday, September 15, 2026',
  bookingDate: 'Friday, September 19, 2026',
  bookingTime: '10:30 AM',
  bookingNote: 'JFK pickup, 2 passengers',
  today: 'Today',
};

function preview(text, sender) {
  const values = { ...SAMPLE, senderName: sender?.name || 'Your name', senderPhone: sender?.phone || 'Your phone', companyName: sender?.company || 'Your company' };
  return String(text || '').replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (m, k) => {
    const hit = Object.keys(values).find((v) => v.toLowerCase() === k.toLowerCase());
    return hit ? values[hit] : m;
  });
}

export function TemplatesViewFallback() {
  return (
    <div className="grid gap-3" aria-busy>
      <Skeleton className="h-9 w-80" />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}

function useTemplateMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.templates });
  const onError = (err) => toast.error(err?.message || 'Could not save the template');
  return {
    create: useMutation({ mutationFn: (b) => api.templates.create(b), onSuccess: invalidate, onError: (e) => e?.status !== 409 && onError(e) }),
    update: useMutation({ mutationFn: ({ id, data }) => api.templates.update(id, data), onSuccess: invalidate, onError: (e) => e?.status !== 409 && onError(e) }),
    remove: useMutation({ mutationFn: (id) => api.templates.remove(id), onSuccess: invalidate, onError }),
    restore: useMutation({ mutationFn: () => api.templates.restore(), onSuccess: invalidate, onError }),
  };
}

/** Create / edit dialog with merge-field chips (inserted at the cursor) and a live sample preview. */
function TemplateDialog({ open, onOpenChange, template, mergeFields, sender }) {
  const { create, update } = useTemplateMutations();
  const editing = Boolean(template?._id);
  const [form, setForm] = useState({ name: template?.name || '', category: template?.category || 'follow-up', subject: template?.subject || '', body: template?.body || '' });
  const [error, setError] = useState('');
  const bodyRef = useRef(null);
  const subjectRef = useRef(null);
  const [focus, setFocus] = useState('body'); // where the next merge field goes
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const pending = create.isPending || update.isPending;

  const insert = (key) => {
    const ref = focus === 'subject' ? subjectRef : bodyRef;
    const field = focus === 'subject' ? 'subject' : 'body';
    const el = ref.current;
    const token = `{{${key}}}`;
    const value = form[field];
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${token}${value.slice(end)}`;
    setForm((f) => ({ ...f, [field]: next }));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const data = { name: form.name.trim(), category: form.category, subject: form.subject.trim(), body: form.body };
    try {
      if (editing) await update.mutateAsync({ id: template._id, data });
      else await create.mutateAsync(data);
      toast.success(editing ? 'Template saved' : 'Template created');
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || 'Could not save');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-4xl">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit template' : 'New template'}</DialogTitle>
            <DialogDescription>Click a merge field to insert it where the cursor is. The preview on the right uses sample details.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
                <div className="grid gap-1.5">
                  <Label htmlFor="tp-name">Name</Label>
                  <Input id="tp-name" value={form.name} onChange={set('name')} placeholder="After voicemail" maxLength={80} required autoFocus={!editing} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="tp-category">Category</Label>
                  <Select value={form.category} onValueChange={set('category')}>
                    <SelectTrigger id="tp-category" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.key} value={c.key}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tp-subject">Subject</Label>
                <Input id="tp-subject" ref={subjectRef} value={form.subject} onChange={set('subject')} onFocus={() => setFocus('subject')} placeholder="Following up on my call" maxLength={200} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tp-body">Message</Label>
                <Textarea id="tp-body" ref={bodyRef} value={form.body} onChange={set('body')} onFocus={() => setFocus('body')} rows={14} className="font-mono text-[13px]" placeholder={'Hi {{firstName}},\n\n…'} />
              </div>
              <div className="grid gap-1.5">
                <span className="text-xs text-muted-foreground">Merge fields (insert into the {focus})</span>
                <div className="flex flex-wrap gap-1">
                  {mergeFields.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => insert(f.key)}
                      title={f.label}
                      className="rounded-full border bg-muted/60 px-2 py-0.5 font-mono text-[11px] transition-colors hover:bg-accent"
                    >
                      {`{{${f.key}}}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid content-start gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground">Preview (sample contact)</p>
              <p className="font-medium wrap-break-word">{preview(form.subject, sender) || <span className="text-muted-foreground">(no subject)</span>}</p>
              <pre className="font-sans text-sm whitespace-pre-wrap wrap-break-word text-foreground/90">{preview(form.body, sender) || 'Nothing yet.'}</pre>
              {!sender?.name ? (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                  Set SENDER_NAME, SENDER_PHONE and COMPANY_NAME in server/.env so the signature fills in.
                </p>
              ) : null}
            </div>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !form.name.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {editing ? 'Save template' : 'Create template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TemplateRow({ t, sender, onEdit, onDuplicate, onDelete, canEdit }) {
  return (
    <li className="grid min-w-0 grid-cols-1 gap-2 rounded-lg border bg-card p-4 transition-shadow hover:shadow-md sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium">{t.name}</h3>
          <Badge variant="outline" className="font-normal">
            {categoryLabel(t.category)}
          </Badge>
          {t.builtIn ? (
            <Badge variant="secondary" className="font-normal">
              built-in
            </Badge>
          ) : null}
          {t.usedCount ? (
            <span className="text-xs text-muted-foreground" suppressHydrationWarning>
              used {pluralize(t.usedCount, 'time')}{t.lastUsedAt ? ` · last ${timeAgo(t.lastUsedAt)}` : ''}
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-sm" title={t.subject}>
          <span className="text-muted-foreground">Subject: </span>
          {preview(t.subject, sender) || <span className="text-muted-foreground">(none)</span>}
        </p>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground whitespace-pre-line">{preview(t.body, sender)}</p>
      </div>
      {!canEdit ? null : (
      <div className="flex flex-wrap gap-1.5 sm:justify-end">
        <Button size="sm" variant="outline" onClick={() => onEdit(t)}>
          <Pencil /> Edit
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onDuplicate(t)} aria-label={`Duplicate ${t.name}`} title="Duplicate">
          <Copy />
        </Button>
        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => onDelete(t)} aria-label={`Delete ${t.name}`} title="Delete">
          <Trash2 />
        </Button>
      </div>
      )}
    </li>
  );
}

export function TemplatesView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: qk.templates, queryFn: api.templates.list });
  const { remove, restore, create } = useTemplateMutations();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('all');
  const [dialog, setDialog] = useState(() => (searchParams.get('new') && isAdmin ? { kind: 'edit', template: null } : null)); // { kind: 'edit' | 'delete', template }
  const close = () => {
    setDialog(null);
    if (searchParams.get('new')) router.replace('/templates', { scroll: false });
  };
  const items = data?.items || [];
  const shown = tab === 'all' ? items : items.filter((t) => t.category === tab);
  const missingBuiltIns = data ? Math.max(0, (data.builtInCount || 0) - items.filter((t) => t.builtIn).length) : 0;

  const duplicate = (t) =>
    create.mutate({ name: `${t.name} (copy)`, category: t.category, subject: t.subject, body: t.body }, { onSuccess: () => toast.success('Template duplicated'), onError: (e) => toast.error(e?.message || 'Could not duplicate') });

  return (
    <div className="grid grid-cols-1 gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={setTab} className="w-full min-w-0 overflow-x-auto pb-1 sm:w-auto">
          <TabsList className="w-max">
            <TabsTrigger value="all">All ({items.length})</TabsTrigger>
            {CATEGORIES.map((c) => (
              <TabsTrigger key={c.key} value={c.key}>
                {c.label} ({items.filter((t) => t.category === c.key).length})
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {!isAdmin ? (
          <p className="text-sm text-muted-foreground sm:ml-auto">Templates are managed by the super admin. You can use them from any Email button.</p>
        ) : (
        <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          {missingBuiltIns ? (
            <Button variant="outline" onClick={() => restore.mutate(undefined, { onSuccess: (r) => toast.success(`${pluralize(r.added, 'built-in template')} restored`) })} disabled={restore.isPending}>
              {restore.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              Restore built-ins ({missingBuiltIns})
            </Button>
          ) : null}
          <Button onClick={() => setDialog({ kind: 'edit', template: null })}>
            <Plus /> New template
          </Button>
        </div>
        )}
      </div>

      {isError ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Could not load templates</AlertTitle>
          <AlertDescription>
            <p>{error.message}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : isPending ? (
        <TemplatesViewFallback />
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Mail className="size-6 text-muted-foreground" aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-semibold">No templates {tab === 'all' ? 'yet' : 'in this category'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Create one, or restore the built-in set.</p>
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3">
          {shown.map((t) => (
            <TemplateRow key={t._id} t={t} sender={data.sender} canEdit={isAdmin} onEdit={(x) => setDialog({ kind: 'edit', template: x })} onDuplicate={duplicate} onDelete={(x) => setDialog({ kind: 'delete', template: x })} />
          ))}
        </ul>
      )}

      {dialog?.kind === 'edit' ? (
        <TemplateDialog key={dialog.template?._id || 'new'} open onOpenChange={(v) => !v && close()} template={dialog.template} mergeFields={data?.mergeFields || []} sender={data?.sender} />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onOpenChange={(v) => !v && close()}
        title="Delete this template?"
        description={dialog?.template ? `"${dialog.template.name}" will be removed.${dialog.template.builtIn ? ' Built-in templates can be restored later.' : ''}` : ''}
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(dialog.template._id, {
            onSuccess: () => {
              toast.success('Template deleted');
              close();
            },
          })
        }
      />
    </div>
  );
}
