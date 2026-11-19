import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import type { CatalogConflict } from '../../../types/api';

export type CatalogError = { key: string; missing?: string[] };
type Request<T> = (signal: AbortSignal) => Promise<T>;

const policyErrors = ['stale_version', 'gesture_exists', 'gesture_archived', 'incomplete_revision',
  'review_required', 'video_unavailable', 'already_published', 'not_published', 'not_archived', 'no_withdrawable_video'];
const fields = ['video', 'category', 'source', 'consent_reference'];

function describeError(error: unknown): CatalogError {
  if (axios.isAxiosError<CatalogConflict>(error)) {
    const status = error.response?.status;
    const detail = error.response?.data?.detail;
    if (status === 409 && detail && policyErrors.includes(detail.code)) {
      return { key: detail.code, missing: Array.isArray(detail.missing) ? detail.missing.filter(field => fields.includes(field)) : [] };
    }
    if (status === 401 || status === 403) return { key: 'forbidden' };
    if (status === 404) return { key: 'notFound' };
    if (status === 413) return { key: 'tooLarge' };
    if (status === 415) return { key: 'invalidVideo' };
    if (status === 422) return { key: 'invalidFields' };
  }
  return { key: 'unavailable' };
}

export function useCatalogRead<T>(request: Request<T>) {
  const [result, setResult] = useState<{ request: Request<T>; data: T }>();
  const [error, setError] = useState<CatalogError>();
  const [pending, setPending] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setPending(true);
    setError(undefined);
    void request(controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ request, data });
    }, failure => {
      if (controller.signal.aborted) return;
      const reason = describeError(failure);
      if (reason.key === 'forbidden' || reason.key === 'notFound') setResult(undefined);
      setError(reason);
    }).finally(() => { if (!controller.signal.aborted) setPending(false); });
    return () => controller.abort();
  }, [request, attempt]);
  return { data: result?.request === request ? result.data : undefined, error, pending, reload: () => setAttempt(value => value + 1) };
}

export function useCatalogWrite() {
  const inFlight = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<CatalogError>();
  useEffect(() => () => inFlight.current?.abort(), []);

  async function run<T>(request: Request<T>, accept: (result: T) => void) {
    if (inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setPending(true);
    setError(undefined);
    try {
      const result = await request(controller.signal);
      if (!controller.signal.aborted) accept(result);
    } catch (failure) {
      if (!controller.signal.aborted) setError(describeError(failure));
    } finally {
      inFlight.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return { pending, error, run };
}
