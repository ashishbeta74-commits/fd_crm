'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CircleAlert, Copy, ExternalLink, Loader2, Send } from 'lucide-react';
import { api, qk } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useInvalidateContacts } from '@/hooks/use-contact-mutations';

const NONE = '__none__';
const CATEGORY_LABEL = { outreach: 'Outreach', 'follow-up': 'Follow-up', booking: 'Booking', other: 'Other' };
const FIELD_LABEL = {
  firstName: 'first name',
  name: 'name',
  company: 'company',
  title: 'title',
  email: 'email',
  phone: 'phone',
  location: 'location',
  followUpDate: 'follow-up date',
  bookingDate: 'booking date',
  bookingTime: 'booking time',
  bookingNote: 'booking note',
  senderName: 'your name (SENDER_NAME in server/.env)',
  senderPhone: 'your phone (SENDER_PHONE)',
  companyName: 'your company (COMPANY_NAME)',
};

const mailtoHref = (to, subject, body) => `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

/**
 * Pick a template, see it filled in with the contact's details, adjust, then either open it in the
 * mail app (always works) or send it straight away (when SMTP / Gmail is configured). Both are
 * logged on the contact's timeline.
 */
export function SendEmailDialog({ contact, open, onOpenChange, defaultTemplateId = '' }) {
  const invalidate = useInvalidateContacts();
  const { data: tpl } = useQuery({ queryKey: qk.templates, queryFn: api.templates.list, enabled: open });
  const { data: status } = useQuery({ queryKey: qk.emailStatus, queryFn: api.email.status, enabled: open, staleTime: 5 * 60_000 });
  const templates = tpl?.items || [];
  const addresses = [...new Set([contact?.email, contact?.primaryEmail, contact?.secondaryEmail].map((e) => String(e || '').trim().toLowerCase()).filter((e) => e.includes('@')))];

  const [templateId, setTemplateId] = useState(defaultTemplateId);
  const [to, setTo] = useState(addresses[0] || '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [missing, setMissing] = useState([]);

  const render = useMutation({
    mutationFn: (id) => api.templates.render({ templateId: id, contactId: contact._id }),
    onSuccess: (r) => {
      setSubject(r.subject);
      setBody(r.body);
      setMissing(r.missing || []);
    },
    onError: (err) => toast.error(err?.message || 'Could not fill in the template'),
  });
  const send = useMutation({
    mutationFn: (payload) => api.email.send(payload),
    onSuccess: () => {
      invalidate(contact._id);
      toast.success(`Email sent to ${to}`);
      onOpenChange(false);
    },
    onError: (err) => toast.error(err?.message || 'Could not send the email'),
  });
  const log = useMutation({
    mutationFn: (payload) => api.email.log(payload),
    onSuccess: () => invalidate(contact._id),
  });

  // Fill in the template the moment one is chosen (including a default passed in).
  const pick = (id) => {
    setTemplateId(id === NONE ? '' : id);
    if (id && id !== NONE) render.mutate(id);
  };
  useEffect(() => {
    if (open && defaultTemplateId) render.mutate(defaultTemplateId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultTemplateId]);

  const payload = { contactId: contact._id, templateId: templateId || undefined, to: to.trim(), subject: subject.trim(), body };
  const ready = /@/.test(to) && subject.trim();

  const openMailApp = () => {
    if (!ready) return;
    window.open(mailtoHref(to.trim(), subject.trim(), body), '_self');
    log.mutate(payload, { onSuccess: () => toast.success('Opened in your mail app and logged on the contact') });
    onOpenChange(false);
  };
  const copyAll = () => navigator.clipboard?.writeText(`Subject: ${subject}\n\n${body}`).then(() => toast.success('Subject and body copied'));

  const byCategory = Object.entries(CATEGORY_LABEL).map(([key, label]) => ({ key, label, items: templates.filter((t) => t.category === key) })).filter((g) => g.items.length);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Email {contact?.name || contact?.email || 'contact'}</DialogTitle>
          <DialogDescription>
            Choose a template - it is filled in with this contact&apos;s details - then edit anything before {status?.configured ? 'sending' : 'opening it in your mail app'}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="em-template">Template</Label>
              <Select value={templateId || NONE} onValueChange={pick}>
                <SelectTrigger id="em-template" className="w-full">
                  {render.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                  <SelectValue placeholder="Choose a template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Blank email</SelectItem>
                  {byCategory.map((g) => (
                    <SelectGroup key={g.key}>
                      <SelectLabel>{g.label}</SelectLabel>
                      {g.items.map((t) => (
                        <SelectItem key={t._id} value={t._id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {!templates.length && tpl ? (
                <p className="text-xs text-muted-foreground">
                  No templates yet -{' '}
                  <Link href="/templates" className="underline underline-offset-4">
                    create one
                  </Link>
                  .
                </p>
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="em-to">To</Label>
              {addresses.length > 1 ? (
                <Select value={addresses.includes(to) ? to : '__custom__'} onValueChange={(v) => v !== '__custom__' && setTo(v)}>
                  <SelectTrigger id="em-to" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {addresses.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                    <SelectItem value="__custom__">Other address…</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
              <Input id={addresses.length > 1 ? 'em-to-custom' : 'em-to'} type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@company.com" required />
            </div>
          </div>

          {!addresses.length ? (
            <p className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
              <CircleAlert className="size-3.5" aria-hidden /> This contact has no email address on file - type one above.
            </p>
          ) : null}

          <div className="grid gap-1.5">
            <Label htmlFor="em-subject">Subject</Label>
            <Input id="em-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="em-body">Message</Label>
            <Textarea id="em-body" value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="font-mono text-[13px]" placeholder="Pick a template or write your message" />
          </div>

          {missing.length ? (
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs dark:border-amber-900 dark:bg-amber-950/30">
              <CircleAlert className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <span>Left blank (not on file):</span>
              {missing.map((m) => (
                <span key={m} className="rounded-full border bg-background px-1.5 py-px">
                  {FIELD_LABEL[m] || m}
                </span>
              ))}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={copyAll} disabled={!subject && !body}>
              <Copy /> Copy
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/templates">Manage templates</Link>
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={status?.configured ? 'outline' : 'default'} onClick={openMailApp} disabled={!ready || send.isPending}>
              <ExternalLink /> Open in mail app
            </Button>
            {status?.configured ? (
              <Button type="button" onClick={() => send.mutate(payload)} disabled={!ready || send.isPending} title={`Sends from ${status.from}`}>
                {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                {send.isPending ? 'Sending…' : 'Send now'}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
