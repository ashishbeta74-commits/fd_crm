'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PrioritySelect } from '@/components/contacts/priority-select';
import { LI_CONNECTION_STATUSES, LI_STAGES } from '@/lib/linkedin';
import { isoDate } from '@/lib/format';
import { useLinkedinMeta, useUpdateLinkedin } from '@/components/linkedin/use-linkedin';

const NONE = '__none__';
const CUSTOM = '__custom__';

const DATES = [
  ['dateFollowed', 'Date followed'],
  ['dateEngaged', 'Date engaged'],
  ['requestSentAt', 'Connection request sent'],
  ['acceptedAt', 'Date accepted'],
  ['welcomeSentAt', 'Welcome message sent'],
  ['firstReplyAt', 'Date of first reply'],
  ['offerSentAt', 'Offer sent'],
  ['trialRideDate', 'Trial ride date'],
  ['convertedDate', 'Converted date'],
];

function ListOrCustom({ id, value, onChange, options, placeholder }) {
  const known = options.includes(value);
  const [custom, setCustom] = useState(value && !known);
  return (
    <div className="grid gap-1.5">
      <Select
        value={custom ? CUSTOM : value || NONE}
        onValueChange={(v) => {
          if (v === CUSTOM) {
            setCustom(true);
            return;
          }
          setCustom(false);
          onChange(v === NONE ? '' : v);
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— none —</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value={CUSTOM}>Something else…</SelectItem>
        </SelectContent>
      </Select>
      {custom ? <Input value={known ? '' : value} onChange={(e) => onChange(e.target.value)} placeholder="Type your own" /> : null}
    </div>
  );
}

/** Every LinkedIn field on one form (the workbook's Data-tab row for this contact). */
export function LinkedinDialog({ contact, open, onOpenChange, onSaved }) {
  const { data: meta } = useLinkedinMeta();
  const update = useUpdateLinkedin();
  const li = contact?.linkedin || {};
  const [form, setForm] = useState(() => ({
    contactL1: contact?.contactL1 || '',
    priority: contact?.priority || '',
    connectionStatus: li.connectionStatus || '',
    need: li.need || '',
    monthlyValue: li.monthlyValue ? String(li.monthlyValue) : '',
    outcomeOverride: li.outcomeOverride || '',
    nextAction: li.nextAction || '',
    nextActionDate: isoDate(li.nextActionDate),
    notes: li.notes || '',
    ...Object.fromEntries(DATES.map(([k]) => [k, isoDate(li[k])])),
  }));
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  const submit = async (e) => {
    e.preventDefault();
    const data = {
      contactL1: form.contactL1.trim(),
      priority: form.priority,
      connectionStatus: form.connectionStatus,
      need: form.need.trim(),
      monthlyValue: Number(form.monthlyValue) || 0,
      outcomeOverride: form.outcomeOverride,
      nextAction: form.nextAction.trim(),
      nextActionDate: form.nextActionDate || null,
      notes: form.notes,
      ...Object.fromEntries(DATES.map(([k]) => [k, form[k] || null])),
    };
    try {
      const doc = await update.mutateAsync({ id: contact._id, data });
      toast.success('LinkedIn details saved');
      onOpenChange(false);
      onSaved?.(doc);
    } catch {
      /* toasted */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-3xl">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>LinkedIn outreach - {contact?.name || 'contact'}</DialogTitle>
            <DialogDescription>The stage is worked out from the dates below. Use the outcome override to park or close the prospect.</DialogDescription>
          </DialogHeader>

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="li-url">LinkedIn profile URL</Label>
              <Input id="li-url" value={form.contactL1} onChange={set('contactL1')} placeholder="https://www.linkedin.com/in/…" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="li-priority">Priority</Label>
              <PrioritySelect id="li-priority" size="default" className="w-full" value={form.priority} onChange={set('priority')} placeholder="No priority" />
            </div>
          </section>

          <section className="grid gap-3">
            <h3 className="text-sm font-semibold">Dates logged</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {DATES.map(([k, label]) => (
                <div key={k} className="grid gap-1.5">
                  <Label htmlFor={`li-${k}`} className="text-xs text-muted-foreground">
                    {label}
                  </Label>
                  <Input id={`li-${k}`} type="date" value={form[k]} onChange={set(k)} />
                </div>
              ))}
              <div className="grid gap-1.5">
                <Label htmlFor="li-conn" className="text-xs text-muted-foreground">
                  Connection status
                </Label>
                <Select value={form.connectionStatus || NONE} onValueChange={(v) => set('connectionStatus')(v === NONE ? '' : v)}>
                  <SelectTrigger id="li-conn" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— none —</SelectItem>
                    {LI_CONNECTION_STATUSES.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="li-need">Need / use case</Label>
              <ListOrCustom id="li-need" value={form.need} onChange={set('need')} options={meta?.needs || []} placeholder="What do they buy?" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="li-value">Est. monthly value ($)</Label>
              <Input id="li-value" type="number" min="0" step="100" value={form.monthlyValue} onChange={set('monthlyValue')} placeholder="0" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="li-next">Next action</Label>
              <ListOrCustom id="li-next" value={form.nextAction} onChange={set('nextAction')} options={meta?.nextActions || []} placeholder="What happens next?" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="li-nextDate">Next action date</Label>
              <Input id="li-nextDate" type="date" value={form.nextActionDate} onChange={set('nextActionDate')} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="li-override">Outcome override (park / close)</Label>
              <Select value={form.outcomeOverride || NONE} onValueChange={(v) => set('outcomeOverride')(v === NONE ? '' : v)}>
                <SelectTrigger id="li-override" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— still in the funnel —</SelectItem>
                  {LI_STAGES.filter((s) => s.override).map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="li-notes">LinkedIn notes</Label>
              <Textarea id="li-notes" rows={3} value={form.notes} onChange={set('notes')} placeholder="Which post you commented on, what they said…" />
            </div>
          </section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? <Loader2 className="animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
