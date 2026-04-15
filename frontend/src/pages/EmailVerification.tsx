import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = 'http://localhost:8000';

const EmailVerification: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [message, setMessage] = useState('Проверка токена...');
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const verifyEmail = async () => {
      try {
        await axios.post(`${API_URL}/auth/verify-email/${token}`);
        setMessage('Email успешно подтвержден! Теперь вы можете войти в систему.');
        setIsError(false);
        setTimeout(() => navigate('/'), 3000);
      } catch (error: any) {
        setMessage(error.response?.data?.detail || 'Неверный или просроченный токен.');
        setIsError(true);
      }
    };

    verifyEmail();
  }, [token, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-lg">
        <h2 className="text-2xl font-semibold mb-4">Подтверждение email</h2>
        <div className={`p-3 rounded ${isError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message}
        </div>
        <button
          onClick={() => navigate('/')}
          className="mt-4 w-full py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          На главную
        </button>
      </div>
    </div>
  );
};

export default EmailVerification;