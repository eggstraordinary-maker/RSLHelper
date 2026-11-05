import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

export function useAccountAction() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const run = async (action: () => Promise<unknown>, success: string, invalid = 'validationError', onFailure?: (error: unknown) => void) => {
    if (busy.current) return false;
    busy.current = true; setPending(true); setMessage('');
    try {
      await action();
      if (!active.current) return false;
      setMessage(success); setFailed(false);
      return true;
    } catch (error) {
      if (active.current) {
        onFailure?.(error);
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        setMessage(status === 422 ? 'validationError'
          : status === 400 || status === 401 || status === 404 ? invalid : 'networkError');
        setFailed(true);
      }
      return false;
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  };
  return { pending, message, failed, run };
}
