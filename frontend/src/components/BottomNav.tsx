// src/components/BottomNav.tsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export type Tab = 'dictionary' | 'translator' | 'learning' | 'admin';

const Icon = {
  dictionary: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M3 5h4l2 2h8v12H3V5z" />
    </svg>
  ),
  translator: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M12 4v16M4 8h16M4 16h9" />
    </svg>
  ),
  learning: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M12 6l8 4-8 4-8-4 8-4zM4 10v6a2 2 0 002 2h12" />
    </svg>
  ),
  admin: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

const TabLabels = {
  dictionary: 'dictionary',
  translator: 'translator',
  learning: 'learning',
  admin: 'admin_panel',
};

interface BottomNavProps { availableTabs: Tab[] }

export default function BottomNav({ availableTabs }: BottomNavProps) {
  const { t } = useTranslation();
  return <nav aria-label={t('navigation')} className="bg-white/95 backdrop-blur border rounded-3xl shadow-lg flex p-1">
    {availableTabs.map(tab => <NavLink key={tab} to={`/${tab}`}
      className={({ isActive }) => `flex-1 py-2 px-2 flex flex-col items-center justify-center rounded-2xl focus-visible:outline-2 focus-visible:outline-indigo-600 ${isActive ? 'text-indigo-600' : 'text-gray-600 hover:text-indigo-500'}`}>
      <span className="mb-1">{Icon[tab]}</span>
      <span className="text-xs font-medium">{t(TabLabels[tab])}</span>
    </NavLink>)}
  </nav>;
}
