import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LeftTOC from '../components/LeftTOC';
import CameraView from '../components/CameraView';
import { useAuth } from '../contexts/AuthContext';
import { progressApi, videosApi } from '../services/api';
import { getSessionRevision } from '../services/apiClient';
import { acknowledgePracticeAttempt, beginPracticeAttempt, useLearningSections } from '../features/learning';
import { LessonDetails, LessonMedia, lessonLabel } from '../features/catalog';
import type { LearningSection, UserProgress, VideoInfo } from '../types/api';

const sectionIds = ['alphabet', 'basic'] as const;
const studyLabel = (lesson: VideoInfo) => {
  const label = lessonLabel(lesson);
  return lesson.alphabet_letter && lesson.alphabet_letter !== label ? `${lesson.alphabet_letter} · ${label}` : label;
};

export default function Learning() {
  const { user } = useAuth();
  return <LearningSession key={user?.public_id ?? 'no-principal'} />;
}

function LearningSession() {
  const { t } = useTranslation('learning');
  const { completeLesson, user } = useAuth();
  const [params, setParams] = useSearchParams();
  const section: LearningSection = params.get('section') === 'alphabet' ? 'alphabet' : 'basic';
  const { data, status, reload } = useLearningSections();
  const lessons = data?.[section] ?? [];
  const selected = lessons.find(lesson => lesson.lesson_id === params.get('lesson')) ?? lessons[0];
  const selectedId = selected?.lesson_id;
  const selectLesson = (lesson: string) => setParams({ section, lesson });
  const [progressRetry, setProgressRetry] = useState(0);
  const [progressLoading, setProgressLoading] = useState(true);
  const [progressError, setProgressError] = useState(false);
  const [progress, setProgress] = useState<Record<string, UserProgress>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ lessonId: string; key: string; error: boolean } | null>(null);
  const mounted = useRef(false);
  const saveInFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setProgressLoading(true);
    setProgressError(false);
    void progressApi.list().then(data => {
      if (!cancelled) setProgress(Object.fromEntries(data.map(row => [row.lesson_id, row])));
    }).catch(() => {
      if (!cancelled) setProgressError(true);
    }).finally(() => { if (!cancelled) setProgressLoading(false); });
    return () => { cancelled = true; };
  }, [progressRetry]);

  const lessonProgress = selectedId ? progress[selectedId] : undefined;

  const savePractice = async (complete: boolean) => {
    if (!selected || !user || saveInFlight.current || progressLoading || progressError) return;
    const lessonId = selected.lesson_id;
    const principal = user.public_id;
    const sessionRevision = getSessionRevision();
    saveInFlight.current = true;
    setSaving(true);
    setNotice(null);
    try {
      const attemptId = complete ? undefined : beginPracticeAttempt(principal, lessonId);
      const saved = complete ? await completeLesson(lessonId) : await progressApi.practice(lessonId, attemptId!);
      if (attemptId) acknowledgePracticeAttempt(principal, lessonId, attemptId);
      if (mounted.current && getSessionRevision() === sessionRevision) {
        // A replay is the original snapshot. Never lower a more recent local
        // count/completion if another acknowledged action already updated it.
        setProgress(previous => {
          const current = previous[lessonId];
          return { ...previous, [lessonId]: { ...saved,
            attempts: Math.max(current?.attempts ?? 0, saved.attempts),
            completed: !!current?.completed || saved.completed,
            completed_at: current?.completed_at ?? saved.completed_at,
          } };
        });
        setNotice({ lessonId, error: false, key: complete ? 'completionSaved' : 'practiceSaved' });
      }
    } catch {
      if (mounted.current && getSessionRevision() === sessionRevision) {
        setNotice({ lessonId, error: true, key: 'saveError' });
      }
    } finally {
      saveInFlight.current = false;
      if (mounted.current && getSessionRevision() === sessionRevision) setSaving(false);
    }
  };

  return <div className="space-y-4 min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav aria-label={t('sectionNavigation')} className="flex flex-wrap gap-2">
        {sectionIds.map(id => <Link key={id} to={`/learning?section=${id}`} aria-current={id === section ? 'page' : undefined}
          className={`rounded-md border px-3 py-2 focus-visible:outline-2 focus-visible:outline-indigo-600 ${id === section ? 'border-indigo-500 bg-indigo-50 font-medium text-indigo-800' : 'bg-white'}`}>
          {t(`sections.${id}`)}
        </Link>)}
      </nav>
      <button type="button" disabled={status === 'loading'} onClick={reload}
        className="rounded-md border bg-white px-3 py-2 disabled:opacity-50">
        {t(status === 'error' ? 'retryCatalog' : 'refreshCatalog')}
      </button>
    </div>
    {status === 'loading' && <p role="status">{t('loadingCatalog')}</p>}
    {status === 'error' && <p role="alert" className="rounded bg-red-50 p-4 text-red-800">{t('catalogError')}</p>}
    {status === 'ready' && !selected && <p role="status" className="py-8 text-center text-gray-600">{t('emptySection')}</p>}
    {selected && <div className="grid grid-cols-1 gap-4 xl:grid-cols-[auto_minmax(0,1fr)]">
      <LeftTOC title={t('contents')} items={lessons.map(lesson => ({ id: lesson.lesson_id, label: studyLabel(lesson) }))}
        active={selectedId} onSelect={selectLesson} />
      <div className="space-y-4 min-w-0">
        <div className="rounded-lg border bg-white p-4">
          <h2 className="text-lg font-semibold [overflow-wrap:anywhere]">{studyLabel(selected)}</h2>
          <LessonDetails lesson={selected} />
          {selected.title && selected.description && selected.title !== selected.description && (
            <p className="mt-2 whitespace-pre-line [overflow-wrap:anywhere]">{selected.description}</p>
          )}
          <p className="mt-2 text-sm text-gray-600">{t('practiceInstructions')}</p>
        </div>
        <LessonMedia key={`${selected.lesson_id}:${selected.version}:${selected.media_url}`} src={videosApi.streamUrl(selected.media_url)} />
        <CameraView />
        <section className="rounded-lg border bg-white p-4" aria-label={t('practiceTitle')}>
          <h3 className="font-semibold">{t('practiceTitle')}</h3>
          {progressLoading ? <p role="status">{t('loadingProgress')}</p> : <>
            <p className="mt-2">{t('attempts')} <strong>{lessonProgress?.attempts || 0}</strong></p>
            <p>{t(lessonProgress?.completed ? 'completed' : 'inProgress')}</p>
          </>}
          {progressError && <div role="alert" className="mt-2 text-red-700">{t('progressError')}
            <button className="ml-3 underline" onClick={() => setProgressRetry(value => value + 1)}>{t('retryProgress')}</button>
          </div>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => void savePractice(false)} disabled={saving || progressLoading || progressError}
              className="rounded bg-indigo-600 px-3 py-2 text-white disabled:opacity-50">{t('recordPractice')}</button>
            <button onClick={() => void savePractice(true)} disabled={saving || progressLoading || progressError || !lessonProgress?.attempts || lessonProgress.completed}
              className="rounded border px-3 py-2 disabled:opacity-50">{t('completeLesson')}</button>
          </div>
          {saving && <p role="status" className="mt-2">{t('saving')}</p>}
          {notice && notice.lessonId === selectedId && <p role={notice.error ? 'alert' : 'status'} className={`mt-2 ${notice.error ? 'text-red-700' : 'text-green-700'}`}>{t(notice.key)}</p>}
        </section>
      </div>
    </div>}
  </div>;
}
