'use client';

import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { STAGES, STAGE_STYLES } from '@/lib/constants';
import { CategorySelect } from '@/components/contacts/category-select';
import { cn } from '@/lib/utils';
import { Tip, Truncated } from '@/components/import/tips';
import { SKIP, columnsForField, fieldLabel, groupFields, isMultiField, mappedCount, sampleValues } from '@/components/import/plan';

const slug = (s) => String(s).replace(/[^a-z0-9]+/gi, '-').toLowerCase();

// The column-name cell stays put while the table scrolls sideways on narrow screens. It needs an opaque background,
// so the row's hover tint is painted by a ::before overlay (rows are `group`s); the hairline on the right marks the
// edge on screens where the table can actually overflow.
const STICKY =
  'sticky left-0 z-10 bg-card before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-muted/50 before:opacity-0 before:transition-opacity before:duration-200 group-hover:before:opacity-100 max-md:shadow-[1px_0_0_0_var(--color-border)]';
const ROW_IN = 'group motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300';

function MapsToSelect({ header, value, groups, disabled, onChange }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger size="sm" className="w-48" aria-label={`Field for column ${header}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SKIP}>Do not import</SelectItem>
        {groups.map((g) => (
          <SelectGroup key={g.key}>
            <SelectLabel>{g.label}</SelectLabel>
            {g.fields.map((f) => (
              <SelectItem key={f.key} value={f.key}>
                {f.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * One sheet's plan: include switch, default stage and the column -> field table.
 * Multi-column fields (meta `multi`) may be picked for several columns; those rows get a "joined" badge.
 * @param {{ sheet: object, plan: object, fields: object[], disabled?: boolean, onPlanChange: (patch: object) => void, onMappingChange: (header: string, key: string) => void }} props
 */
export function SheetMapping({ sheet, plan, fields, disabled, onPlanChange, onMappingChange }) {
  const groups = groupFields(fields);
  const id = `sheet-${slug(sheet.name)}`;
  const inactive = disabled || !plan.include;
  const mapped = mappedCount(plan);

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Switch id={`${id}-include`} checked={plan.include} onCheckedChange={(v) => onPlanChange({ include: v })} disabled={disabled} />
          <Label htmlFor={`${id}-include`}>Include this sheet</Label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={`${id}-stage`} className="font-normal text-muted-foreground">
            Default stage for rows without a status
          </Label>
          <Select value={plan.defaultStage} onValueChange={(v) => onPlanChange({ defaultStage: v })} disabled={inactive}>
            <SelectTrigger id={`${id}-stage`} size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGES.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  <span className={cn('size-2 rounded-full', STAGE_STYLES[s.key].dot)} />
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label htmlFor={`${id}-category`} className="font-normal text-muted-foreground">
            Contact type
          </Label>
          <CategorySelect id={`${id}-category`} value={plan.category || ''} onChange={(v) => onPlanChange({ category: v })} disabled={inactive} className="w-44" placeholder="Auto-detect" noneLabel="Auto-detect from list / title" />
        </div>
      </div>

      {!plan.include ? <p className="text-sm text-muted-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">This sheet will be skipped.</p> : null}

      <div className={cn('rounded-lg border transition-opacity duration-200', !plan.include && 'opacity-60')}>
        <Table>
          <TableHeader>
            <TableRow className="group">
              <TableHead className={STICKY}>Column</TableHead>
              <TableHead>Sample values</TableHead>
              <TableHead>Maps to</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sheet.headers.map((header) => {
              const value = plan.mapping[header] || SKIP;
              const suggested = sheet.suggestedMapping?.[header] || '';
              const samples = sampleValues(sheet, header);
              const joined = value !== SKIP && isMultiField(fields, value) && columnsForField(plan.mapping, value).length > 1;
              return (
                <TableRow key={header} className={ROW_IN}>
                  <TableCell className={cn('font-medium', STICKY)}>
                    <Truncated text={header} className="max-w-[10rem] sm:max-w-[14rem]" />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {samples.length ? (
                      <Truncated
                        text={samples.join(' · ')}
                        className="max-w-[12rem] sm:max-w-[16rem]"
                        tip={
                          <ul className="grid gap-0.5">
                            {samples.map((v, i) => (
                              <li key={`${i}-${v}`}>{v}</li>
                            ))}
                          </ul>
                        }
                      />
                    ) : (
                      <span className="italic">no values</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <MapsToSelect header={header} value={value} groups={groups} disabled={inactive} onChange={(key) => onMappingChange(header, key)} />
                      {suggested && value === suggested ? (
                        <Tip content="Suggested from the column name">
                          <Badge variant="secondary" tabIndex={0} className="px-1.5 text-[10px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
                            auto
                          </Badge>
                        </Tip>
                      ) : null}
                      {joined ? (
                        <Tip content={`Several columns feed ${fieldLabel(fields, value)}; their values are joined into one`}>
                          <Badge variant="outline" tabIndex={0} className="px-1.5 text-[10px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
                            joined
                          </Badge>
                        </Tip>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">
          {mapped} of {sheet.headers.length} columns mapped
        </span>{' '}
        - unmapped columns are kept under Other columns on each contact.
      </p>
    </div>
  );
}
