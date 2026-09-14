'use client';

import { useQuery } from '@tanstack/react-query';
import { api, qk } from '@/lib/api';

/** Field definitions, stage list and known sheet names from the API. */
export function useMeta() {
  return useQuery({ queryKey: qk.meta, queryFn: api.meta, staleTime: 5 * 60_000 });
}
