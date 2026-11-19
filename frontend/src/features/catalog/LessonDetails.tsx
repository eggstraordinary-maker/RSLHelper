import React from 'react';
import { useTranslation } from 'react-i18next';
import type { VideoInfo } from '../../types/api';

export function lessonLabel(lesson: VideoInfo): string {
  return lesson.title?.trim() || lesson.description?.trim().replace(/\s+/g, ' ') || lesson.filename;
}

export function LessonDetails({ lesson }: { lesson: VideoInfo }) {
  const { t } = useTranslation('dictionary');
  return <div className="flex flex-wrap gap-2 text-sm [overflow-wrap:anywhere]">
    {lesson.category && <p className="rounded-md border px-2 py-1">{t('lessonCategory', { category: lesson.category })}</p>}
    {lesson.is_learning_material && <p className="rounded-md bg-indigo-50 px-2 py-1 text-indigo-800">{t('learningMaterial')}</p>}
  </div>;
}
