import React, { useState } from "react";

interface Props {
  onBack: () => void;
}

const PasswordReset: React.FC<Props> = ({ onBack }) => {
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Password reset requested for:", email);
    alert("Запрос на сброс пароля отправлен (демо)");
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 rounded-xl shadow-lg bg-white">
      <h2 className="text-2xl font-semibold mb-4">Восстановление пароля</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block mb-1">Email</label>
          <input
            className="w-full p-2 border rounded-md"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Введите email"
          />
        </div>

        <button
          type="submit"
          className="w-full py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
        >
          Отправить письмо для восстановления
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