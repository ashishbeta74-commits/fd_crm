'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CONTACT_FIELD_GROUPS, STAGES } from '@/lib/constants';
import { formatDateTime, isoDate, weekdayName } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PrioritySelect } from '@/components/contacts/priority-select';
import { CategorySelect } from '@/components/contacts/category-select';
import { LeadQualitySelect } from '@/components/contacts/lead-quality-select';
import { TagsInput } from '@/components/contacts/tags-input';

// Inputs ease their border/ring in on focus (shadcn inputs transition color + box-shadow; this widens it to the border).
const FIELD = 'transition-[color,box-shadow,border-color] duration-200';

/** Contact document -> flat form state. */
export function contactToForm(c = {}) {
  const f = {};
  for (const g of CONTACT_FIELD_GROUPS) for (const fld of g.fields) f[fld.key] = c[fld.key] || '';
  f.status = c.status || '';
  f.leadQuality = c.leadQuality || '';
  f.stage = c.stage || 'new';
  f.followUp = isoDate(c.followUp);
  f.followUpNote = c.followUpNote || '';
  f.bookingDate = isoDate(c.booking?.date);
  f.bookingTime = c.booking?.time || '';
  f.bookingNote = c.booking?.note || '';
  f.notes = c.notes || '';
  f.priority = c.priority || '';
  f.category = c.category || '';
  f.tags = Array.isArray(c.tags) ? [...c.tags] : [];
  return f;
}

/** Flat form state -> API payload (POST/PATCH /contacts). */
export function formToPayload(f) {
  const p = {};
  for (const g of CONTACT_FIELD_GROUPS) for (const fld of g.fields) p[fld.key] = (f[fld.key] || '').trim();
  p.status = (f.status || '').trim();
  p.leadQuality = (f.leadQuality || '').trim();
  p.stage = f.stage;
  p.followUp = f.followUp || null;
  p.followUpNote = (f.followUpNote || '').trim();
  p.booking = { date: f.bookingDate || null, time: (f.bookingTime || '').trim(), note: (f.bookingNote || '').trim() };
  p.notes = f.notes || '';
  p.priority = f.priority || '';
  p.category = f.category || '';
  p.tags = f.tags || [];
  return p;
}

function Field({ id, label, children, className }) {
  return (
    <div className={cn('grid min-w-0 gap-1.5', className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

/**
 * Full contact form (create + edit). Owns its state; calls onSubmit(payload).
 * @param {{ initial?: object, onSubmit: (payload: object) => void, onCancel?: () => void, submitting?: boolean, submitLabel?: string, error?: string }} props
 */
export function ContactForm({ initial, onSubmit, onCancel, submitting = false, submitLabel = 'Save', error }) {
  const [form, setForm] = useState(() => contactToForm(initial));
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }));
  const isBooking = form.stage === 'future_booking';

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formToPayload(form));
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-6">
      {CONTACT_FIELD_GROUPS.map((group) => (
        <section key={group.title} className="grid gap-3">
          <h3 className="text-sm font-semibold">{group.title}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {group.fields.map((fld) => (
              <Field key={fld.key} id={`cf-${fld.key}`} label={fld.label} className={fld.type === 'textarea' ? 'sm:col-span-2' : ''}>
                {fld.type === 'textarea' ? (
                  <Textarea id={`cf-${fld.key}`} value={form[fld.key]} onChange={set(fld.key)} rows={2} className={FIELD} />
                ) : (
                  <Input id={`cf-${fld.key}`} type={fld.type === 'url' ? 'text' : fld.type} value={form[fld.key]} onChange={set(fld.key)} autoComplete="off" className={FIELD} />
                )}
              </Field>
            ))}
          </div>
        </section>
      ))}

      <section className="grid gap-3">
        <h3 className="text-sm font-semibold">Pipeline</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field id="cf-stage" label="Stage">
            <Select value={form.stage} onValueChange={set('stage')}>
              <SelectTrigger id="cf-stage" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="cf-priority" label="Priority">
            <PrioritySelect id="cf-priority" size="default" className="w-full" value={form.priority} onChange={set('priority')} placeholder="No priority" />
          </Field>
          <Field id="cf-category" label="Type">
            <CategorySelect id="cf-category" size="default" className="w-full" value={form.category} onChange={set('category')} placeholder="Not set" />
          </Field>
          <Field id="cf-tags" label="Tags">
            <TagsInput id="cf-tags" value={form.tags} onChange={set('tags')} />
          </Field>
          <Field id="cf-leadQuality" label="Lead quality">
            <LeadQualitySelect id="cf-leadQuality" size="default" className="w-full" value={form.leadQuality} onChange={set('leadQuality')} placeholder="Not set" />
          </Field>
          <Field id="cf-status" label="Status (free text)">
            <Input id="cf-status" value={form.status} onChange={set('status')} className={FIELD} />
          </Field>
          <Field id="cf-followUp" label="Follow-up date">
            <Input id="cf-followUp" type="date" value={form.followUp} onChange={set('followUp')} className={FIELD} />
          </Field>
          <Field id="cf-followUpNote" label="Follow-up note" className="sm:col-span-2">
            <Input id="cf-followUpNote" value={form.followUpNote} onChange={set('followUpNote')} className={FIELD} />
          </Field>
        </div>
      </section>

      {/* The booking box eases into its pink "required" look when the stage becomes Future Booking. */}
      <section
        className={cn(
          'grid gap-3 rounded-lg border p-3 transition-colors duration-300',
          isBooking ? 'border-pink-300 bg-pink-50/50 dark:border-pink-900 dark:bg-pink-950/20' : '',
        )}
      >
        <h3 className="text-sm font-semibold">Booking {isBooking ? '' : <span className="font-normal text-muted-foreground">(optional)</span>}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field id="cf-bookingDate" label="Date of booking">
            <Input id="cf-bookingDate" type="date" value={form.bookingDate} onChange={set('bookingDate')} className={FIELD} />
            <p className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
              {form.bookingDate ? `Day: ${weekdayName(form.bookingDate)}` : ''}
            </p>
          </Field>
          <Field id="cf-bookingTime" label="Time">
            <Input id="cf-bookingTime" type="time" value={form.bookingTime} onChange={set('bookingTime')} className={FIELD} />
            <p className="min-h-4 text-xs text-muted-foreground">{initial?.booking?.bookedAt ? `Booked on ${formatDateTime(initial.booking.bookedAt)}` : ''}</p>
          </Field>
          <Field id="cf-bookingNote" label="Booking note" className="sm:col-span-2">
            <Input id="cf-bookingNote" value={form.bookingNote} onChange={set('bookingNote')} className={FIELD} />
          </Field>
        </div>
      </section>

      <Field id="cf-notes" label="Notes">
        <Textarea id="cf-notes" value={form.notes} onChange={set('notes')} rows={4} className={FIELD} />
      </Field>

      {error ? (
        <p role="alert" className="text-sm text-destructive motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={submitting} aria-busy={submitting || undefined}>
          {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {submitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
