import React, { useEffect, useState } from 'react';
import { recognitionApi } from '../services/api';
import { getRecognitionConfig } from '../services/recognitionConfig';

export default function RecognitionAvailability() {
  const [state, setState] = useState<'checking' | 'unavailable' | 'disconnected'>('checking');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState('checking');
    void recognitionApi.status().then(status => {
      if (cancelled) return;
      const config = getRecognitionConfig();
      // A status endpoint/configured URL alone cannot enable an absent adapter.
      setState(status.reason === 'provider_unavailable' || (config.valid && !status.available)
        ? 'disconnected' : 'unavailable');
    }).catch(() => { if (!cancelled) setState('disconnected'); });
    return () => { cancelled = true; };
  }, [retry]);

  return <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
    {state === 'checking' ? 'Проверка доступности распознавания…' : <>
      <p className="font-medium">Автоматическое распознавание сейчас недоступно.</p>
      <p>{state === 'disconnected' ? 'Соединение с сервисом распознавания не установлено.' : 'Сервис распознавания ещё не подключён.'} Можно использовать камеру для самопроверки.</p>
      <button className="mt-2 underline" onClick={() => setRetry(value => value + 1)}>Проверить доступность снова</button>
    </>}
  </div>;
}
