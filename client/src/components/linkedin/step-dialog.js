'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { LI_STEPS, liStageLabel } from '@/lib/linkedin';
import { todayIso } from '@/lib/format';
import { useLinkedinMeta, useLogLinkedinStep } from '@/components/linkedin/use-linkedin';

const CUSTOM = '__custom__';

/**
 * "Log a step" for one contact: the date it happened, the extra detail some steps need
 * (need / use case, monthly value) and whether to set the playbook's suggested next action.
 */
export function StepDialog({ contact, step: stepKey, open, onOpenChange, onDone }) {
  const step = LI_STEPS.find((s) => s.key === stepKey) || LI_STEPS[0];
  const { data: meta } = useLinkedinMeta();
  const log = useLogLinkedinStep();
  const li = contact?.linkedin || {};
  const [date, setDate] = useState(todayIso());
  const [need, setNeed] = useState(li.need || '');
  const [customNeed, setCustomNeed] = useState('');
  const [value, setValue] = useState(li.monthlyValue ? String(li.monthlyValue) : '');
  const [note, setNote] = useState('');
  const [suggestNext, setSuggestNext] = useState(true);
  const needs = meta?.needs || [];
  const needValue = need === CUSTOM ? customNeed.trim() : need;

  const submit = async (e) => {
    e.preventDefault();
    const data = { step: step.key, date, note: note.trim() || undefined, suggestNext };
    if (step.requires === 'need') data.need = needValue;
    if (step.requires === 'monthlyValue') data.monthlyValue = Number(value) || 0;
    try {
      const doc = await log.mutateAsync({ id: contact._id, data });
      toast.success(`${step.label} - now ${liStageLabel(doc.linkedin?.stage)}`);
      onOpenChange(false);
      onDone?.(doc);
    } catch {
      /* toasted */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{step.label}</DialogTitle>
            <DialogDescription className="wrap-break-word">
              {contact?.name || 'This contact'} moves to <strong>{liStageLabel(step.stage)}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="st-date">{step.askDate || 'When'}</Label>
              <Input id="st-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            {step.requires === 'need' ? (
              <div className="grid gap-1.5">
                <Label htmlFor="st-need">Need / use case</Label>
                <Select value={need || undefined} onValueChange={setNeed}>
                  <SelectTrigger id="st-need" className="w-full">
                    <SelectValue placeholder="What do they actually buy?" />
                  </SelectTrigger>
                  <SelectContent>
                    {needs.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM}>Something else…</SelectItem>
                  </SelectContent>
                </Select>
                {need === CUSTOM ? <Input value={customNeed} onChange={(e) => setCustomNeed(e.target.value)} placeholder="Describe the need" autoFocus /> : null}
              </div>
            ) : null}
            {step.requires === 'monthlyValue' ? (
              <div className="grid gap-1.5">
                <Label htmlFor="st-value">Estimated monthly value ($)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {(meta?.valueBands || []).map((b) => (
                    <Button key={b} type="button" size="xs" variant={String(b) === value ? 'default' : 'outline'} onClick={() => setValue(String(b))}>
                      ${b.toLocaleString('en-US')}
                    </Button>
                  ))}
                </div>
                <Input id="st-value" type="number" min="0" step="100" value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 2500" required />
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor="st-note">Note (optional)</Label>
              <Input id="st-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What they said, which post you commented on…" maxLength={2000} />
            </div>
            <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
              <span>
                Set the playbook&apos;s next action and due date
                <span className="block text-xs text-muted-foreground">You can change it afterwards on the contact.</span>
              </span>
              <Switch checked={suggestNext} onCheckedChange={setSuggestNext} />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={log.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={log.isPending || (step.requires === 'need' && !needValue) || (step.requires === 'monthlyValue' && !value)}>
              {log.isPending ? <Loader2 className="animate-spin" /> : null}
              Log it
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
