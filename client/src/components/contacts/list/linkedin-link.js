import { Linkedin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// `contactL1` is the contact's LinkedIn profile URL. Sheets often store it without a scheme
// ("linkedin.com/in/jane" or "www.linkedin.com/in/jane"), so links are normalised here.

/**
 * Absolute href for a LinkedIn profile value: adds https:// when the scheme is missing, takes the URL out of
 * Markdown links pasted from other tools ("[https://…](https://…)"), drops stray spaces inside a URL, and
 * gives '' for plain text that is not a link.
 */
export function linkedInHref(value) {
  let v = String(value || '').trim();
  v = v.match(/\]\((https?:\/\/[^)\s]+)\)/i)?.[1] || v;
  if (/^https?:\/\//i.test(v)) return v.replace(/\s+/g, '');
  return v && !/\s/.test(v) && v.includes('.') ? `https://${v}` : '';
}

/** Short display form: "linkedin.com/in/jane-doe" (drops the scheme, "www." and a trailing slash). */
export function linkedInLabel(value) {
  return (linkedInHref(value) || String(value || '').trim())
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '');
}

/** Small icon-only link to the contact's LinkedIn profile (with a tooltip). Renders nothing without a URL. */
export function LinkedInIconLink({ url, className, ...props }) {
  const href = linkedInHref(url);
  if (!href) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label="Open LinkedIn profile"
          className={cn(
            'inline-flex shrink-0 rounded-sm text-muted-foreground outline-none transition-colors duration-200 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
            className,
          )}
          {...props}
        >
          <Linkedin className="size-3.5" aria-hidden="true" />
        </a>
      </TooltipTrigger>
      <TooltipContent>Open LinkedIn profile</TooltipContent>
    </Tooltip>
  );
}
