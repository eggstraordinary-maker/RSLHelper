import { useEffect, useState } from 'react';
import { learningApi } from '../../services/api';
import type { LearningSections } from '../../types/api';

type SectionState = {
  data: LearningSections | null;
  status: 'loading' | 'ready' | 'error';
};

export function useLearningSections() {
  const [state, setState] = useState<SectionState>({ data: null, status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const request = new AbortController();
    void learningApi.sections(request.signal).then(data => {
      if (!request.signal.aborted) setState({ data, status: 'ready' });
    }, () => {
      if (!request.signal.aborted) setState(previous => ({ ...previous, status: 'error' }));
    });
    return () => request.abort();
  }, [attempt]);

  function reload() {
    setState(previous => ({ ...previous, status: 'loading' }));
    setAttempt(previous => previous + 1);
  }

  return { ...state, reload };
}
