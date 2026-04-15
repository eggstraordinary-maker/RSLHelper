import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const LanguageSwitcher: React.FC = () => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [currentLang, setCurrentLang] = useState(i18n.language);

  const languages = {
    ru: { code: 'ru', name: 'Русский', flag: '🇷🇺' },
    en: { code: 'en', name: 'English', flag: '🇬🇧' }
  };

  const changeLanguage = async (lng: string) => {
    await i18n.changeLanguage(lng);
    setCurrentLang(lng);
    setIsOpen(false);
    
    // Сохраняем в localStorage для клиента
    localStorage.setItem('lang', lng);
    
    // Отправляем на сервер для сохранения в cookie
    try {
      await fetch('http://localhost:8000/api/set-language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ lang: lng })
      });
    } catch (error) {
      console.error('Error saving language preference:', error);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span>{languages[currentLang as keyof typeof languages]?.flag || '🌐'}</span>
        <span className="hidden sm:inline">
          {languages[currentLang as keyof typeof languages]?.name || currentLang}
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-1 z-20 border border-gray-200">
            {Object.values(languages).map((lang) => (
              <button
                key={lang.code}
                onClick={() => changeLanguage(lang.code)}
                className={`flex items-center w-full px-4 py-2 text-sm text-left hover:bg-gray-100 transition-colors ${
                  currentLang === lang.code ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700'
                }`}
              >
                <span className="mr-3 text-lg">{lang.flag}</span>
                <span>{lang.name}</span>
                {currentLang === lang.code && (
                  <svg className="ml-auto w-4 h-4 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default LanguageSwitcher;