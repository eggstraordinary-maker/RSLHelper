// src/i18n/config.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Импорты переводов
import ruCommon from '../locales/ru/common.json';
import ruAuth from '../locales/ru/auth.json';
import ruDictionary from '../locales/ru/dictionary.json';
import ruLearning from '../locales/ru/learning.json';

import enCommon from '../locales/en/common.json';
import enAuth from '../locales/en/auth.json';
import enDictionary from '../locales/en/dictionary.json';
import enLearning from '../locales/en/learning.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ru: {
        common: ruCommon,
        auth: ruAuth,
        dictionary: ruDictionary,
        learning: ruLearning,
      },
      en: {
        common: enCommon,
        auth: enAuth,
        dictionary: enDictionary,
        learning: enLearning,
      },
    },
    fallbackLng: 'ru',
    debug: process.env.NODE_ENV === 'development',
    
    ns: ['common', 'auth', 'dictionary', 'learning'],
    defaultNS: 'common',
    
    interpolation: {
      escapeValue: false,
    },
    
    detection: {
      order: ['cookie', 'localStorage', 'navigator'],
      lookupCookie: 'lang',
      lookupLocalStorage: 'lang',
      caches: ['cookie', 'localStorage'],
    },
  });

export default i18n;