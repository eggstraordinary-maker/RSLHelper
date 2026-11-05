import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

function MediaAttempt({ src, onRetry, focusOnMount }: {
  src: string;
  onRetry: () => void;
  focusOnMount: boolean;
}) {
  const { t } = useTranslation('dictionary');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (focusOnMount) video.current?.focus();
  }, [focusOnMount]);

  return (
    <section aria-label={t('mediaSection')} className="space-y-3 min-w-0">
      {status === 'loading' && <p role="status" className="text-gray-600">{t('loadingVideo')}</p>}
      {status === 'error' && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
          <p>{t('videoError')}</p>
          <button type="button" onClick={onRetry}
            className="mt-3 px-4 py-2 border rounded-md focus-visible:outline-2 focus-visible:outline-indigo-600">
            {t('retryVideo')}
          </button>
        </div>
      )}
      <video ref={video} src={src} controls preload="auto" tabIndex={0}
        aria-label={t('videoLabel')} aria-busy={status === 'loading'}
        className="w-full rounded-lg shadow-md focus-visible:outline-2 focus-visible:outline-indigo-600"
        onLoadedData={() => setStatus(previous => previous === 'loading' ? 'ready' : previous)}
        onError={() => setStatus('error')}
      />
    </section>
  );
}

// Each lesson and retry owns a separate media element and event state. Events
// queued for a discarded element cannot change the currently selected lesson.
export function LessonMedia({ src }: { src: string }) {
  const [attempt, setAttempt] = useState(0);
  return <MediaAttempt key={attempt} src={src} onRetry={() => setAttempt(value => value + 1)}
    focusOnMount={attempt > 0} />;
}
