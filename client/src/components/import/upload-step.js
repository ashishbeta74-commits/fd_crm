'use client';

import { useRef, useState } from 'react';
import { Download, FileSpreadsheet, Link2, Loader2, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { DisabledHint, Tip } from '@/components/import/tips';

const ACCEPT = '.xlsx,.xlsm,.csv';
const SHEET_URL = /^https:\/\/docs\.google\.com\/spreadsheets\//i;

/** True for a pasted Google Sheets link; the API validates the rest (id, gid, sharing). */
export const isSheetUrl = (s) => SHEET_URL.test(String(s || '').trim());

function OrDivider() {
  return (
    <div className="flex items-center gap-3 lg:flex-col" aria-hidden>
      <span className="h-px flex-1 bg-border lg:h-auto lg:w-px" />
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">or</span>
      <span className="h-px flex-1 bg-border lg:h-auto lg:w-px" />
    </div>
  );
}

/** Why "Load sheet" is disabled right now ('' when it is enabled or already loading). */
function loadReason({ url, valid, pending, disabled }) {
  if (pending) return '';
  if (disabled) return 'Wait for the file to finish loading';
  if (!url.trim()) return 'Paste a Google Sheets link first';
  if (!valid) return 'That is not a Google Sheets link (it starts with https://docs.google.com/spreadsheets/)';
  return '';
}

/** "Import from a Google Sheet link": URL input + Load sheet. onLink(url) fires on submit. */
function SheetLinkForm({ onLink, pending, disabled, error }) {
  const [url, setUrl] = useState('');
  const [submitted, setSubmitted] = useState('');
  const valid = isSheetUrl(url);
  // the inline error belongs to the URL that produced it; editing the field hides it until the next attempt
  const showError = Boolean(error) && url.trim() === submitted;
  const reason = loadReason({ url, valid, pending, disabled });

  const submit = (e) => {
    e.preventDefault();
    if (!valid || pending || disabled) return;
    const u = url.trim();
    setSubmitted(u);
    onLink(u);
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 rounded-xl border p-4" aria-labelledby="sheet-link-title" aria-busy={pending}>
      <h3 id="sheet-link-title" className="flex items-center gap-2 font-medium">
        <Link2 className="size-4 text-muted-foreground" aria-hidden />
        Import from a Google Sheet link
      </h3>
      <div className="grid gap-1.5">
        <Label htmlFor="sheet-link-url">Sheet URL</Label>
        <Input
          id="sheet-link-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://docs.google.com/spreadsheets/d/…/edit?gid=0"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={pending || disabled}
          aria-invalid={showError || undefined}
          aria-describedby={showError ? 'sheet-link-error sheet-link-help' : 'sheet-link-help'}
        />
        {showError ? (
          <p id="sheet-link-error" role="alert" className="text-sm text-destructive motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
            {error}
          </p>
        ) : null}
      </div>
      <DisabledHint reason={reason} className="self-start">
        <Button type="submit" size="sm" className="self-start" disabled={!valid || pending || disabled}>
          {pending ? <Loader2 className="animate-spin" /> : <Link2 />}
          {pending ? 'Loading sheet…' : 'Load sheet'}
        </Button>
      </DisabledHint>
      <p id="sheet-link-help" className="text-xs text-muted-foreground">
        {'The sheet must be shared as "Anyone with the link" (Viewer). The tab the link points to (its gid) is imported, and the sheet can be re-synced later.'}
      </p>
    </form>
  );
}

/**
 * Step 1: pick a workbook by drag & drop / file picker, or paste a Google Sheet link.
 * onFile(file) fires once per pick; onLink(url) once per Load sheet.
 */
export function UploadStep({ onFile, onLink, pending, linkPending, error, linkError }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const busy = pending || linkPending;

  const pick = (file) => {
    if (file && !busy) onFile(file);
  };

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-stretch">
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            disabled={busy}
            aria-busy={pending}
            className={cn(
              // children ignore the pointer so dragging over the icon/text does not fire dragleave on the zone itself
              'flex w-full flex-1 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-12 text-center transition-[color,background-color,border-color,box-shadow] duration-200 outline-none *:pointer-events-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              dragging ? 'border-primary bg-primary/5 ring-4 ring-primary/15' : 'border-border hover:border-primary/60 hover:bg-muted/40',
              pending && 'cursor-progress opacity-70',
            )}
          >
            <span key={pending ? 'busy' : 'idle'} className="flex flex-col items-center gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
              {pending ? (
                <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
              ) : (
                <UploadCloud
                  className={cn('size-8 text-muted-foreground transition-[color,transform] duration-200', dragging && 'text-primary motion-safe:-translate-y-0.5')}
                  aria-hidden
                />
              )}
              <span className="block font-medium" aria-live="polite">
                {pending ? 'Reading the workbook…' : dragging ? 'Drop it to upload' : 'Drop an Excel or CSV file here, or click to browse'}
              </span>
              <span className="block text-sm text-muted-foreground">.xlsx, .xlsm or .csv up to 30 MB. Each sheet in the workbook is imported separately.</span>
            </span>
          </button>
          {error ? (
            <p role="alert" className="text-sm text-destructive motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
              {error}
            </p>
          ) : null}
        </div>

        <OrDivider />

        <SheetLinkForm onLink={onLink} pending={linkPending} disabled={pending} error={linkError} />
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          pick(e.target.files?.[0]);
          // allow picking the same file again after an error
          e.target.value = '';
        }}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Tip content="Blank workbook with the expected column names">
          <Button asChild variant="outline" size="sm">
            <a href={api.imports.templateUrl} download>
              <Download /> Download template
            </a>
          </Button>
        </Tip>
        <p className="text-muted-foreground">
          <FileSpreadsheet className="mr-1 inline size-4 align-text-bottom" aria-hidden />
          A sample workbook is at <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">samples/sample-contacts.xlsx</code> in the repo.
        </p>
      </div>
    </div>
  );
}
