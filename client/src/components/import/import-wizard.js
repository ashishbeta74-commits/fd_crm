'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { pluralize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useMeta } from '@/hooks/use-meta';
import { UploadStep } from '@/components/import/upload-step';
import { MappingStep } from '@/components/import/mapping-step';
import { ResultStep } from '@/components/import/result-step';
import { ErrorState } from '@/components/import/status-blocks';
import { buildPlans, defaultListName, toCommitSheets } from '@/components/import/plan';
import { useInvalidateAfterImport } from '@/components/import/use-import-mutations';

const STEPS = [
  { key: 'upload', label: 'Upload or link' },
  { key: 'map', label: 'Map columns' },
  { key: 'result', label: 'Result' },
];
const EXPIRED_MESSAGE = 'This upload has expired - please upload the file or load the sheet link again.';
// listName is filled in from the preview (sheet title / file name) once it loads
const DEFAULT_OPTIONS = { duplicateStrategy: 'skip', updateStage: false, listName: '', requirePhone: true };
const FILE_SOURCE = { type: 'file' };

function StepIndicator({ current }) {
  const idx = STEPS.findIndex((s) => s.key === current);
  return (
    <ol className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" aria-label="Import steps">
      {STEPS.map((s, i) => (
        <li
          key={s.key}
          className={cn('flex items-center gap-2 transition-colors duration-200', i === idx ? 'font-medium' : 'text-muted-foreground')}
          aria-current={i === idx ? 'step' : undefined}
        >
          <span
            className={cn(
              'flex size-5 items-center justify-center rounded-full border text-xs tabular-nums transition-colors duration-200',
              i < idx && 'border-primary bg-primary text-primary-foreground',
              i === idx && 'border-primary',
            )}
          >
            {i < idx ? <Check className="size-3 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200" aria-label="done" /> : i + 1}
          </span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function MappingSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading field definitions">
      <Skeleton className="h-9 w-64 max-w-full" />
      <Skeleton className="h-8 w-48 max-w-full" />
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

/** Upload (or Google Sheet link) -> map columns -> result. All wizard state lives here; the steps are presentational. */
export function ImportWizard() {
  const meta = useMeta();
  const invalidate = useInvalidateAfterImport();
  const [preview, setPreview] = useState(null); // { uploadId, fileName, sheets, source, linkedSheet? }
  const [source, setSource] = useState(null); // { type: 'file' } | { type: 'google-sheet', url, spreadsheetId, gid, title }
  const [plans, setPlans] = useState([]);
  const [options, setOptions] = useState(DEFAULT_OPTIONS); // { duplicateStrategy, updateStage, listName, requirePhone }
  const [result, setResult] = useState(null); // ImportBatch
  const [expired, setExpired] = useState(false);
  const step = result ? 'result' : preview ? 'map' : 'upload';

  // both preview flavours (file upload, sheet link) land in the same mapping step
  const loadPreview = (data) => {
    setPreview(data);
    setSource(data.source || FILE_SOURCE);
    setPlans(buildPlans(data.sheets));
    setOptions((o) => ({ ...o, listName: defaultListName(data) }));
  };

  const previewMut = useMutation({
    mutationFn: (file) => api.imports.preview(file),
    onSuccess: loadPreview,
    onError: (err) => toast.error(err?.message || 'Could not read the file'),
  });

  const linkMut = useMutation({
    mutationFn: (url) => api.imports.previewLink(url),
    onSuccess: loadPreview,
    onError: (err) => toast.error(err?.message || 'Could not load the Google Sheet'),
  });

  const dropPreview = () => {
    setPreview(null);
    setSource(null);
    setPlans([]);
  };

  const commitMut = useMutation({
    mutationFn: (body) => api.imports.commit(body),
    onSuccess: (batch) => {
      setResult(batch);
      const t = batch.totals || {};
      const title = `Import finished - ${pluralize(t.created ?? 0, 'contact')} created`;
      const rest = [t.updated ? `${t.updated} updated` : '', t.skipped ? `${t.skipped} skipped` : '', t.noPhone ? `${t.noPhone} without a phone` : '']
        .filter(Boolean)
        .join(', ');
      // one toast per import: a warning (not success) when some rows failed, the result step lists them
      if (t.errorCount) toast.warning(`${title}, ${pluralize(t.errorCount, 'row error')}`, { description: rest || undefined });
      else toast.success(title, { description: rest || undefined });
    },
    onError: (err) => {
      if (err?.status === 410) {
        // the server dropped the upload; the mapping is useless without it
        dropPreview();
        setExpired(true);
        toast.error(EXPIRED_MESSAGE);
      } else {
        toast.error(err?.message || 'Import failed');
      }
    },
    // a failed run can still have written some contacts, so refresh either way
    onSettled: () => invalidate(),
  });

  const reset = () => {
    dropPreview();
    setOptions(DEFAULT_OPTIONS);
    setResult(null);
    setExpired(false);
    previewMut.reset();
    linkMut.reset();
    commitMut.reset();
  };

  const pickFile = (file) => {
    setExpired(false);
    previewMut.mutate(file);
  };

  const loadLink = (url) => {
    setExpired(false);
    linkMut.mutate(url);
  };

  const commit = () =>
    commitMut.mutate({
      uploadId: preview.uploadId,
      duplicateStrategy: options.duplicateStrategy,
      updateStage: options.duplicateStrategy === 'update' && options.updateStage,
      // the API only falls back to the sheet title (file uploads would become "Imported list"), so
      // a cleared field is re-seeded from the preview here; the mapping step also blocks a blank name
      listName: options.listName.trim() || defaultListName(preview),
      requirePhone: options.requirePhone,
      sheets: toCommitSheets(plans),
    });

  // remounting the body on a step change (or when the mapping's skeleton turns into content) replays the enter animation
  const bodyKey = step === 'map' ? `map-${meta.status}` : step;
  let body;
  if (step === 'upload') {
    body = (
      <UploadStep
        onFile={pickFile}
        onLink={loadLink}
        pending={previewMut.isPending}
        linkPending={linkMut.isPending}
        error={expired ? EXPIRED_MESSAGE : previewMut.error?.message}
        linkError={linkMut.error?.message}
      />
    );
  } else if (step === 'map') {
    if (meta.isPending) body = <MappingSkeleton />;
    else if (meta.isError) body = <ErrorState message={meta.error.message} onRetry={() => meta.refetch()} />;
    else
      body = (
        <MappingStep
          preview={preview}
          source={source}
          plans={plans}
          setPlans={setPlans}
          fields={meta.data?.fields || []}
          options={options}
          setOptions={setOptions}
          busy={commitMut.isPending}
          onSubmit={commit}
          onChooseAnother={reset}
        />
      );
  } else {
    body = <ResultStep batch={result} onReset={reset} onBatchChange={setResult} />;
  }

  return (
    <section className="grid grid-cols-1 gap-5 rounded-xl border bg-card p-4 text-card-foreground shadow-sm sm:p-6" aria-label="Import wizard">
      <StepIndicator current={step} />
      <div key={bodyKey} className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
        {body}
      </div>
    </section>
  );
}
