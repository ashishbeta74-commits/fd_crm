'use client';

import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ExternalLink, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { pluralize } from '@/lib/format';
import { SheetMapping } from '@/components/import/sheet-mapping';
import { DisabledHint, Truncated } from '@/components/import/tips';
import { LIST_NAME_MAX, applyMapping, fieldLabel, isListNameTaken, validatePlans } from '@/components/import/plan';

const STRATEGIES = [
  { key: 'skip', label: 'Skip existing contacts' },
  { key: 'update', label: 'Update existing contacts' },
];
// ['imports'] is the prefix the wizard invalidates after a commit, so this refreshes with the history
const LIST_NAMES_KEY = ['imports', 'list-names'];
const FADE_IN = 'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200';

/** List name (how contacts are grouped in the CRM) + "skip rows without a phone". */
function ImportOptions({ options, onChange, disabled }) {
  const names = useQuery({ queryKey: LIST_NAMES_KEY, queryFn: api.imports.listNames, staleTime: 60_000 });
  const listName = options.listName || '';
  const taken = isListNameTaken(listName, names.data?.items || []);

  return (
    <section className="grid gap-4 rounded-lg border bg-muted/30 p-4" aria-labelledby="import-options-title">
      <h3 id="import-options-title" className="text-sm font-semibold">
        Import options
      </h3>
      <div className="grid gap-1.5">
        <Label htmlFor="opt-list-name">List name</Label>
        <Input
          id="opt-list-name"
          value={listName}
          maxLength={LIST_NAME_MAX}
          autoComplete="off"
          placeholder="e.g. Travel Advisors"
          className="max-w-md"
          onChange={(e) => onChange({ listName: e.target.value })}
          disabled={disabled}
          aria-describedby={taken ? 'opt-list-name-help opt-list-name-taken' : 'opt-list-name-help'}
        />
        <p id="opt-list-name-help" className="text-xs text-muted-foreground">
          Contacts are grouped by this name in the CRM (filter: All sheets / list name). If the name is already used, a number is added automatically (e.g.
          Travel Advisors 2).
        </p>
        {taken ? (
          <p id="opt-list-name-taken" className={`text-xs text-muted-foreground ${FADE_IN}`}>
            Already used - a number will be appended (saved as &quot;{listName.trim()} 2&quot;, &quot;{listName.trim()} 3&quot;…).
          </p>
        ) : null}
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-center gap-2">
          <Switch id="opt-require-phone" checked={options.requirePhone !== false} onCheckedChange={(v) => onChange({ requirePhone: v })} disabled={disabled} />
          <Label htmlFor="opt-require-phone">Skip rows without a contact phone</Label>
        </div>
        <p className="text-xs text-muted-foreground">Rows with no Contact Phone 1 are not imported.</p>
      </div>
    </section>
  );
}

function DuplicateOptions({ options, onChange, disabled }) {
  return (
    <section className="grid gap-3 rounded-lg border bg-muted/30 p-4" aria-labelledby="dup-title">
      <div>
        <h3 id="dup-title" className="text-sm font-semibold">
          Existing contacts
        </h3>
        <p className="text-sm text-muted-foreground">Duplicates are matched by email, otherwise by name + company.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Duplicate handling">
        {STRATEGIES.map((s) => {
          const active = options.duplicateStrategy === s.key;
          return (
            <Button key={s.key} type="button" size="sm" variant={active ? 'default' : 'outline'} aria-pressed={active} onClick={() => onChange({ duplicateStrategy: s.key })} disabled={disabled}>
              {s.label}
            </Button>
          );
        })}
      </div>
      {options.duplicateStrategy === 'update' ? (
        <div className={`flex items-center gap-2 ${FADE_IN}`}>
          <Switch id="opt-update-stage" checked={options.updateStage} onCheckedChange={(v) => onChange({ updateStage: v })} disabled={disabled} />
          <Label htmlFor="opt-update-stage">Also update the stage from the sheet</Label>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {options.duplicateStrategy === 'update'
          ? 'Non-empty sheet values overwrite the existing contact; empty cells leave it unchanged.'
          : 'Rows that match an existing contact are counted as skipped and leave it untouched.'}
      </p>
    </section>
  );
}

/** Small banner for previews loaded from a Google Sheet link: title (opens the sheet) + which tab is on. */
function SheetSourceBanner({ source, linkedSheet }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
      <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 max-w-full items-center gap-1.5 font-medium underline-offset-4 hover:underline">
        <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <Truncated text={source.title || 'Google Sheet'} />
        <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-label="opens in a new tab" />
      </a>
      <span className="text-muted-foreground">
        {linkedSheet ? `Tab '${linkedSheet}' is selected; other tabs are off by default.` : 'All tabs are selected; switch off the ones you do not need.'}
      </span>
    </div>
  );
}

/**
 * Step 2: per-sheet column mapping plus the global import options (list name, phone requirement) and duplicate options.
 * State (plans, options) lives in the wizard; this component only edits it. `source` is the wizard's
 * { type: 'file' | 'google-sheet', ... } (falls back to preview.source).
 */
export function MappingStep({ preview, source, plans, setPlans, fields, options, setOptions, busy, onSubmit, onChooseAnother }) {
  const src = source || preview.source || { type: 'file' };
  const isSheet = src.type === 'google-sheet';
  const updatePlan = (name, patch) => setPlans((ps) => ps.map((p) => (p.name === name ? { ...p, ...patch } : p)));

  const changeMapping = (name, header, key) => {
    const plan = plans.find((p) => p.name === name);
    const { mapping, movedFrom } = applyMapping(plan.mapping, header, key, fields);
    updatePlan(name, { mapping });
    if (movedFrom) toast.info(`Moved ${fieldLabel(fields, key)} to this column`, { description: `"${movedFrom}" is no longer imported.` });
  };

  const reason = validatePlans(plans) || (!options.listName?.trim() ? 'Enter a list name' : null);
  const includedNames = new Set(plans.filter((p) => p.include).map((p) => p.name));
  const rows = preview.sheets.filter((s) => includedNames.has(s.name)).reduce((n, s) => n + (s.rowCount || 0), 0);
  const submitLabel = `Import ${pluralize(rows, 'row')} from ${pluralize(includedNames.size, 'sheet')}`;
  // open the linked tab first for sheet links; the first sheet otherwise
  const firstTab = preview.sheets.some((s) => s.name === preview.linkedSheet) ? preview.linkedSheet : preview.sheets[0].name;

  return (
    <div className="grid grid-cols-1 gap-6" aria-busy={busy}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Truncated text={preview.fileName} className="font-medium" />
          <p className="text-sm text-muted-foreground">
            {pluralize(preview.sheets.length, 'sheet')} found. {isSheet ? 'The loaded sheet expires after 60 minutes.' : 'Uploaded files expire after 60 minutes.'}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="self-start sm:self-auto" onClick={onChooseAnother} disabled={busy}>
          <ArrowLeft /> {isSheet ? 'Choose another source' : 'Choose another file'}
        </Button>
      </div>

      {isSheet ? <SheetSourceBanner source={src} linkedSheet={preview.linkedSheet} /> : null}

      <Tabs defaultValue={firstTab}>
        <div className="overflow-x-auto">
          <TabsList>
            {preview.sheets.map((sheet) => (
              <TabsTrigger key={sheet.name} value={sheet.name}>
                {sheet.name} ({pluralize(sheet.rowCount || 0, 'row')})
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {preview.sheets.map((sheet) => (
          <TabsContent key={sheet.name} value={sheet.name} className="mt-2">
            <SheetMapping
              sheet={sheet}
              plan={plans.find((p) => p.name === sheet.name)}
              fields={fields}
              disabled={busy}
              onPlanChange={(patch) => updatePlan(sheet.name, patch)}
              onMappingChange={(header, key) => changeMapping(sheet.name, header, key)}
            />
          </TabsContent>
        ))}
      </Tabs>

      <ImportOptions options={options} onChange={(patch) => setOptions((o) => ({ ...o, ...patch }))} disabled={busy} />

      <DuplicateOptions options={options} onChange={(patch) => setOptions((o) => ({ ...o, ...patch }))} disabled={busy} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p id="import-submit-hint" className="text-sm text-muted-foreground" aria-live="polite">
          {busy ? `Importing ${pluralize(rows, 'row')}… this can take a moment.` : reason || 'Ready to import.'}
        </p>
        {/* the hint text says why the import is blocked; the tooltip repeats it on the (unfocusable) disabled button */}
        <DisabledHint reason={busy ? '' : reason} className="w-full sm:w-auto">
          <Button type="button" className="w-full sm:w-auto" onClick={onSubmit} disabled={busy || Boolean(reason)} aria-describedby="import-submit-hint">
            {busy ? <Loader2 className="animate-spin" /> : <Upload />}
            {busy ? 'Importing…' : submitLabel}
          </Button>
        </DisabledHint>
      </div>
    </div>
  );
}
