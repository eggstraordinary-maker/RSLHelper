import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

interface PasswordResetPageProps {
  token?: string;
  onBack: () => void;
}

const PasswordResetPage: React.FC<PasswordResetPageProps> = ({ token, onBack }) => {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const navigate = useNavigate();

  // Если есть токен - показываем форму сброса пароля
  // Если нет токена - показываем форму запроса сброса
  const hasToken = Boolean(token);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (hasToken) {
      // Сброс пароля с токеном
      if (newPassword !== confirmPassword) {
        setMessage("Пароли не совпадают");
        setIsError(true);
        return;
      }
      
      try {
        // Здесь будет запрос к API
        console.log("Resetting password with token:", token, "new password:", newPassword);
        setMessage("Пароль успешно изменен! Теперь вы можете войти.");
        setIsError(false);
        setTimeout(() => navigate('/'), 3000);
      } catch (error) {
        setMessage("Ошибка при сбросе пароля");
        setIsError(true);
      }
    } else {
      // Запрос на сброс пароля
      try {
        console.log("Requesting password reset for:", email);
        setMessage("Если email существует, на него будет отправлена ссылка для сброса пароля.");
        setIsError(false);
      } catch (error) {
        setMessage("Ошибка при отправке запроса");
        setIsError(true);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h2 className="text-2xl font-semibold mb-6 text-center">
          {hasToken ? "Сброс пароля" : "Восстановление пароля"}
        </h2>

        {message && (
          <div className={`mb-4 p-3 rounded ${isError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!hasToken ? (
            // Форма запроса сброса пароля
            <div>
              <label className="block mb-1 text-sm font-medium">Email</label>
              <input
                type="email"
                className="w-full p-2 border border-gray-300 rounded-md"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Введите ваш email"
                required
              />
            </div>
          ) : (
            // Форма сброса пароля с токеном
            <>
              <div>
                <label className="block mb-1 text-sm font-medium">Новый пароль</label>
                <input
                  type="password"
                  className="w-full p-2 border border-gray-300 rounded-md"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Введите новый пароль"
                  required
                  minLength={8}
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">Подтвердите пароль</label>
                <input
                  type="password"
                  className="w-full p-2 border border-gray-300 rounded-md"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Повторите новый пароль"
                  required
                />
              </div>
            </>
          )}

          <button
            type="submit"
            className="w-full py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition font-medium"
          >
            {hasToken ? "Сменить пароль" : "Отправить ссылку"}
          </button>

          <button
            type="button"
            onClick={onBack}
            className="w-full py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition"
          >
            Назад
          </button>
        </form>
      </div>
    </div>
  );
};

export default PasswordResetPage;