import React from 'react';

const AuthChoice: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-20 w-20 bg-gradient-to-br from-indigo-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-2xl">RЖЯ</div>
          <h1 className="mt-6 text-3xl font-extrabold text-gray-900">
            РЖЯ помощник
          </h1>
          <p className="mt-2 text-gray-600">
            Распознавание и изучение русского жестового языка
          </p>
        </div>
        
        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
          <h2 className="text-xl font-semibold text-center">Добро пожаловать!</h2>
          
          <div className="space-y-4">
            <button
              onClick={() => {
                // Эта логика теперь обрабатывается в родительском компоненте App.tsx
              }}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              Войти в аккаунт
            </button>
            
            <button
              onClick={() => {
                window.location.href = '/register';
              }}
              className="w-full flex justify-center py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              Создать новый аккаунт
            </button>
          </div>
          
          <div className="text-center text-sm text-gray-500">
            <p>Или продолжите как гость с ограниченным доступом</p>
            <button
              onClick={() => {
                // Эта логика теперь обрабатывается в родительском компоненте App.tsx
              }}
              className="mt-2 text-indigo-600 hover:text-indigo-500 font-medium"
            >
              Продолжить без регистрации →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthChoice;