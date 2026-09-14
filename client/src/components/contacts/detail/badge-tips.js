'use client';

import { StageBadge } from '@/components/badges';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { STAGE_MAP } from '@/lib/constants';

// The badges are plain spans, so the tooltip trigger is a focusable wrapper (keyboard reachable).
const TRIGGER = 'inline-flex rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** Stage badge that explains the stage (STAGES[].description) in a tooltip. */
export function StageBadgeTip({ stage, className }) {
  const description = STAGE_MAP[stage]?.description;
  if (!description) return <StageBadge stage={stage} className={className} />;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={TRIGGER}>
          <StageBadge stage={stage} className={className} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{description}</TooltipContent>
    </Tooltip>
  );
}

