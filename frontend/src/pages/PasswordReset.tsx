import React, { useState } from "react";
import axios from "axios";

interface Props {
  onBack: () => void;
}

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

const PasswordReset: React.FC<Props> = ({ onBack }) => {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);
    try {
      const response = await axios.post(`${API_URL}/auth/forgot-password`, { email });
      setMessage(response.data.message);
      setIsError(false);
    } catch {
      setMessage("Не удалось отправить запрос. Попробуйте позже.");
      setIsError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 rounded-xl shadow-lg bg-white">
      <h2 className="text-2xl font-semibold mb-4">Восстановление пароля</h2>

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
          <label htmlFor="reset-email" className="block mb-1">Email</label>
          <input
            id="reset-email"
            type="email"
            autoComplete="email"
            className="w-full p-2 border rounded-md"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition disabled:opacity-60"
        >
          {isSubmitting ? "Отправка…" : "Отправить ссылку для восстановления"}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="w-full py-2 bg-gray-200 text-black rounded-md hover:bg-gray-300 transition"
        >
          Назад
        </button>
      </form>
    </div>
  );
};

export default PasswordReset;
