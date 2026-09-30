import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { authApi } from "../services/api";

const EmailVerification: React.FC = () => {
  const { token: pathToken } = useParams<{ token: string }>();
  const [fragmentToken] = useState(() => window.location.hash.slice(1));
  const token = pathToken ?? fragmentToken;
  const navigate = useNavigate();
  const [message, setMessage] = useState("Проверка ссылки подтверждения…");
  const [isError, setIsError] = useState(false);
  const verificationStarted = useRef(false);

  useEffect(() => {
    if (fragmentToken) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, [fragmentToken]);

  useEffect(() => {
    if (verificationStarted.current) return;
    verificationStarted.current = true;

    const verifyEmail = async () => {
      if (!token) {
        setMessage("Ссылка для подтверждения недействительна или устарела.");
        setIsError(true);
        return;
      }

      try {
        await authApi.verifyEmail(token);
        setMessage("Email подтверждён. Теперь можно войти в систему.");
        setIsError(false);
        window.setTimeout(() => navigate("/"), 3000);
      } catch {
        setMessage("Ссылка для подтверждения недействительна или устарела.");
        setIsError(true);
      }
    };

    void verifyEmail();
  }, [token, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-lg">
        <h2 className="text-2xl font-semibold mb-4">Подтверждение email</h2>
        <div
          role="status"
          className={`p-3 rounded ${isError ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}
        >
          {message}
        </div>
        <button
          onClick={() => navigate("/")}
          className="mt-4 w-full py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          На главную
        </button>
      </div>
    </div>
  );
};

export default EmailVerification;
