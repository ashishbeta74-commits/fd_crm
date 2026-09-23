'use client';

import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, qk } from '@/lib/api';

// A pointer resting this long on a link counts as intent; sweeping across the table fetches nothing.
const INTENT_MS = 120;

/**
 * Props for a link to a contact page that start loading the contact while the pointer rests on it
 * (or it gets keyboard focus), so the page usually opens with its data already there.
 */
export function usePrefetchContact() {
  const qc = useQueryClient();
  const timer = useRef(null);
  return useCallback(
    (id) => {
      const prefetch = () => qc.prefetchQuery({ queryKey: qk.contact(id), queryFn: () => api.contacts.get(id), staleTime: 30_000 });
      return {
        onPointerEnter: () => {
          clearTimeout(timer.current);
          timer.current = setTimeout(prefetch, INTENT_MS);
        },
        onPointerLeave: () => clearTimeout(timer.current),
        onFocus: prefetch,
      };
    },
    [qc],
  );
}
