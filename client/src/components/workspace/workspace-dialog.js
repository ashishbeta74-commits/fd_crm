'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { isoDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateRow, useUpdateRow } from '@/components/workspace/use-workspace';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/;
/** A stored value as text for an input: dates as YYYY-MM-DD, numbers as digits, anything else as is. */
export const valueText = (v) => (v == null ? '' : ISO_DATE.test(String(v)) ? isoDate(v) : String(v));
const NONE = '__none__';

/** Add a row / edit every field of one. Fields follow the workspace config. */
export function WorkspaceDialog({ workspace: ws, open, onOpenChange, item, options = {}, tabs = [] }) {
  const create = useCreateRow(ws.key);
  const update = useUpdateRow(ws.key);
  const editing = Boolean(item?._id);
  const [form, setForm] = useState(() => Object.fromEntries(ws.fields.map((f) => [f.key, valueText(item?.values?.[f.key])])));
  // A row that is not in the sheet yet (added here) can still be moved into a tab; a synced row stays where the sheet has it.
  const canPickTab = tabs.length > 0 && (!editing || item.source !== 'sheet');
  const [tab, setTab] = useState(editing ? item?.tab || '' : tabs[0] || '');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const pending = create.isPending || update.isPending;
  const identifying = [ws.keyField, ...ws.fields.filter((f) => f.search).map((f) => f.key)].filter(Boolean);
  // a workspace with an auto-generated id (enquiries) needs any other identifying field instead
  const canSave = identifying.some((k) => (form[k] || '').trim());
  const title = item?.values?.[ws.keyField] || item?.values?.clientName || ws.rowLabel;
  const Row = `${ws.rowLabel[0].toUpperCase()}${ws.rowLabel.slice(1)}`;

  const submit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, String(v ?? '').trim()]));
    try {
      if (editing) {
        const moving = canPickTab && tab && tab !== item.tab;
        const doc = await update.mutateAsync({ id: item._id, data: moving ? { ...data, tab } : data });
        const w = doc.sheetWrite;
        if (w?.ok) toast.success(`Saved and written to the "${w.tab}" tab of the sheet (row ${w.rowNumber})`);
        else if (w) toast.warning(`Saved under "${w.tab}", but not written to the sheet`, { description: w.error, duration: 8000 });
        else toast.success('Saved');
      } else {
        const doc = await create.mutateAsync(tab ? { ...data, tab } : data);
        const w = doc.sheetWrite;
        const id = ws.keyField && doc.values?.[ws.keyField] ? ` ${doc.values[ws.keyField]}` : '';
        if (w?.ok) toast.success(`${Row}${id} added and written to the "${w.tab}" tab of the sheet (row ${w.rowNumber})`);
        else if (w) toast.warning(`${Row}${id} added in the CRM under "${w.tab}", but not written to the sheet`, { description: w.error, duration: 8000 });
        else toast.success(`${Row}${id} added`);
      }
      onOpenChange(false);
    } catch {
      /* toasted by the mutation */
    }
  };

  // Enum choices: the config's options plus whatever the sheet already uses.
  const choices = (f) => [...new Set([...(f.options || []), ...(options[f.key] || []).map((o) => o.value).filter(Boolean), form[f.key]].filter(Boolean))];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-3xl">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${title}` : `New ${ws.rowLabel}`}</DialogTitle>
            <DialogDescription>{editing ? (item.tab ? `From the "${item.tab}" tab of the sheet. A change here stays until the same cell changes in the sheet.` : 'Added in the CRM (not in the sheet).') : 'Rows added here live in the CRM only; the sheet is not changed.'}</DialogDescription>
          </DialogHeader>
          {canPickTab ? (
            <div className="grid gap-1.5 rounded-md border bg-muted/40 p-3">
              <Label htmlFor={`ws-${ws.key}-tab`}>{editing ? 'Move to sheet tab' : 'Add to sheet tab'}</Label>
              <Select value={tab || NONE} onValueChange={(v) => setTab(v === NONE ? '' : v)}>
                <SelectTrigger id={`ws-${ws.key}-tab`} className="w-full bg-background">
                  <SelectValue placeholder="Choose a tab" />
                </SelectTrigger>
                <SelectContent>
                  {editing ? <SelectItem value={NONE}>Keep in the CRM only</SelectItem> : null}
                  {tabs.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {editing ? `This ${ws.rowLabel} is not in the Google Sheet yet. Pick a tab to file it there: it is appended to that tab (when the API can write to the sheet).` : `The ${ws.rowLabel} is filed under this tab here and appended to it in the Google Sheet (when the API can write to the sheet).`}
                {!editing && ws.keyField && ws.fields.find((f) => f.key === ws.keyField) ? ` Leave the ${ws.fields.find((f) => f.key === ws.keyField).label.toLowerCase()} empty to get the next one.` : ''}
              </p>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ws.fields.map((f) => {
              const id = `ws-${ws.key}-${f.key}`;
              const isDate = f.type === 'date' && (!form[f.key] || /^\d{4}-\d{2}-\d{2}$/.test(form[f.key]));
              return (
                <div key={f.key} className={f.type === 'long' ? 'grid gap-1.5 sm:col-span-2 lg:col-span-3' : 'grid gap-1.5'}>
                  <Label htmlFor={id}>{f.label}</Label>
                  {f.type === 'long' ? (
                    <Textarea id={id} value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} rows={3} maxLength={5000} />
                  ) : f.type === 'enum' ? (
                    <Select value={form[f.key] || NONE} onValueChange={(v) => set(f.key, v === NONE ? '' : v)}>
                      <SelectTrigger id={id} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>—</SelectItem>
                        {choices(f).map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input id={id} type={isDate ? 'date' : f.type === 'number' ? 'number' : f.type === 'email' ? 'email' : 'text'} step={f.type === 'number' ? 'any' : undefined} value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} maxLength={500} autoFocus={!editing && f.key === identifying[0]} />
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !canSave}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {editing ? 'Save' : `Add ${ws.rowLabel}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
