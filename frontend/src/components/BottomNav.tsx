// src/components/BottomNav.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';

type Tab = 'dictionary' | 'translator' | 'learning';

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
};

const TabLabels = {
  dictionary: 'dictionary',
  translator: 'translator',
  learning: 'learning',
};

interface BottomNavProps {
  active: Tab;
  availableTabs: Tab[];
  onChange: (t: Tab) => void;
}

export default function BottomNav({ active, availableTabs, onChange }: BottomNavProps) {
  const { t } = useTranslation();

  const button = (tab: Tab, labelKey: string) => {
    const isAvailable = availableTabs.includes(tab);
    const isActive = active === tab;

    return (
      <button
        aria-current={isActive ? 'true' : undefined}
        onClick={() => {
          if (!isAvailable) {
            // Если вкладка недоступна, ничего не делаем
            // (в App.tsx уже есть обработка показа модального окна)
            return;
          }
          onChange(tab);
        }}
        className={`flex-1 py-2 px-2 flex flex-col items-center justify-center focus:outline-none transition-all ${
          isActive
            ? 'text-indigo-600'
            : isAvailable
            ? 'text-gray-600 hover:text-indigo-500'
            : 'text-gray-300 cursor-not-allowed'
        }`}
        disabled={!isAvailable}
        title={!isAvailable ? t('requires_authentication') : ''}
      >
        <div className="mb-1 relative">
          {Icon[tab]}
          {!isAvailable && (
            <div className="absolute -top-1 -right-1">
              <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </div>
        <div className="text-xs font-medium">{t(labelKey)}</div>
      </button>
    );
  };

  return (
    <nav className="bg-white/95 backdrop-blur border rounded-3xl shadow-lg flex p-1">
      {button('dictionary', TabLabels.dictionary)}
      {button('translator', TabLabels.translator)}
      {button('learning', TabLabels.learning)}
    </nav>
  );
}
