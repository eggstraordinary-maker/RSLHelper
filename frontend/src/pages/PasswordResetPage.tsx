import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

interface PasswordResetPageProps {
  token?: string;
  onBack: () => void;
}

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

const PasswordResetPage: React.FC<PasswordResetPageProps> = ({ token, onBack }) => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");

    if (!token) {
      setMessage("Ссылка для сброса пароля недействительна.");
      setIsError(true);
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage("Пароли не совпадают.");
      setIsError(true);
      return;
    }

    setIsSubmitting(true);
    try {
      await axios.post(`${API_URL}/auth/reset-password`, {
        token,
        new_password: newPassword,
      });
      setMessage("Пароль изменён. Теперь можно войти с новым паролем.");
      setIsError(false);
      window.setTimeout(() => navigate("/"), 2000);
    } catch {
      setMessage("Не удалось изменить пароль. Запросите новую ссылку и попробуйте ещё раз.");
      setIsError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h2 className="text-2xl font-semibold mb-6 text-center">Сброс пароля</h2>

        {message && (
          <div
            role="status"
            className={`mb-4 p-3 rounded ${isError ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}
          >
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="new-password" className="block mb-1 text-sm font-medium">
              Новый пароль
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              className="w-full p-2 border border-gray-300 rounded-md"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              minLength={8}
              maxLength={128}
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="block mb-1 text-sm font-medium">
              Повторите новый пароль
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              className="w-full p-2 border border-gray-300 rounded-md"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={8}
              maxLength={128}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition font-medium disabled:opacity-60"
          >
            {isSubmitting ? "Сохранение…" : "Изменить пароль"}
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
