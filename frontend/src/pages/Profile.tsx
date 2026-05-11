import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface UserProfile {
  id?: number;
  username: string;
  email: string;
}

const Profile: React.FC = () => {
  const { user, updateProfile, changePassword, deleteAccount, logout, getProgressStats, completeLesson } = useAuth();
  const navigate = useNavigate();
  // Состояния для редактирования профиля
  const [editMode, setEditMode] = useState(false);
  const [profileForm, setProfileForm] = useState<UserProfile>({
    username: '',
    email: '',
  });
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Состояния для смены пароля
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Состояние для удаления аккаунта
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [passwordForDelete, setPasswordForDelete] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Загрузка данных пользователя при монтировании
  useEffect(() => {
    if (user) {
      setProfileForm({
        username: user.username || '',
        email: user.email || '',
      });
    }
  }, [user]);

  // Состояния для прогресса
  const [progress, setProgress] = useState<{
    total_lessons: number;
    completed_lessons: number;
    completed_percentage: number;
    recent_lessons: string[];
  } | null>(null);

  // Загрузка прогресса при монтировании
  useEffect(() => {
    if (user) {
      loadProgress();
    }
  }, [user]);

  const loadProgress = async () => {
    try {
      const stats = await getProgressStats();
      setProgress(stats);
    } catch (err) {
      console.error('Ошибка загрузки прогресса', err);
    }
  };

  // Обработчики для редактирования профиля
  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProfileForm(prev => ({ ...prev, [name]: value }));
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMessage(null);
    try {
      await updateProfile(profileForm);
      setProfileMessage({ type: 'success', text: 'Профиль успешно обновлён' });
      setEditMode(false);
    } catch (err: any) {
      setProfileMessage({ type: 'error', text: err.response?.data?.detail || 'Ошибка обновления профиля' });
    }
  };

  // Обработчики для смены пароля
  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({ ...prev, [name]: value }));
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);
    if (passwordData.new_password !== passwordData.confirm_password) {
      setPasswordMessage({ type: 'error', text: 'Новый пароль и подтверждение не совпадают' });
      return;
    }
    try {
      await changePassword(passwordData.current_password, passwordData.new_password);
      setPasswordMessage({ type: 'success', text: 'Пароль успешно изменён' });
      setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
      setShowPasswordForm(false);
    } catch (err: any) {
      setPasswordMessage({ type: 'error', text: err.response?.data?.detail || 'Ошибка смены пароля' });
    }
  };

  // Обработчик удаления аккаунта
  const handleDeleteAccount = async () => {
    alert('handleDeleteAccount вызван!');   
    console.log('handleDeleteAccount called')
    setDeleteError(null);
    if (!passwordForDelete) {
      setDeleteError('Введите пароль для подтверждения удаления');
      return;
    }
    try {
      console.log('deleteAccount called')
      await deleteAccount(passwordForDelete);
      console.log('after deleteAccount called')
      // Успешно удалили на сервере → выходим из системы и уходим на главную
      logout();
      // navigate('/', { replace: true });
      window.location.href = '/';
    } catch (err: any) {
      setDeleteError(err.response?.data?.detail || 'Ошибка удаления аккаунта. Проверьте пароль.');
    }
  };

  if (!user) {
    return <div className="text-center py-8">Загрузка...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Кнопки навигации: Назад и Выйти */}
      <div className="flex justify-between items-center mb-6">
        <button
          // onClick={() => navigate(-1)}
          onClick={() => window.history.back()}
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors flex items-center gap-2"
        >
          ← Назад
        </button>
        <button
          // onClick={() => { logout(); navigate('/', { replace: true }); }}>
          onClick={() => { logout(); window.location.href = '/'; }}>
          Выйти из аккаунта
        </button>
      </div>

      <h1 className="text-2xl font-bold mb-6">Личный кабинет</h1>

       {/* Блок прогресса */}
      {progress && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Прогресс обучения</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Пройдено уроков:</span>
              <span className="font-bold text-lg">
                {progress.completed_lessons} / {progress.total_lessons}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progress.completed_percentage}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-500">
              Общий прогресс: {Math.round(progress.completed_percentage)}%
            </p>
            {progress.recent_lessons.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium text-gray-700">Недавно изученные жесты:</p>
                <ul className="list-disc list-inside text-sm text-gray-600">
                  {progress.recent_lessons.map((word, idx) => (
                    <li key={idx}>{word}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Блок профиля */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Профиль</h2>
          {!editMode && (
            <button
              onClick={() => setEditMode(true)}
              className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
            >
              Редактировать
            </button>
          )}
        </div>

        {profileMessage && (
          <div className={`mb-4 p-3 rounded ${profileMessage.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {profileMessage.text}
          </div>
        )}

        {editMode ? (
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Имя пользователя</label>
              <input
                type="text"
                name="username"
                value={profileForm.username}
                onChange={handleProfileChange}
                className="w-full p-2 border rounded-md"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                name="email"
                value={profileForm.email}
                onChange={handleProfileChange}
                className="w-full p-2 border rounded-md"
                required
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
                Сохранить
              </button>
              <button type="button" onClick={() => setEditMode(false)} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">
                Отмена
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-2">
            <p><span className="font-medium">Имя пользователя:</span> {user.username}</p>
            <p><span className="font-medium">Email:</span> {user.email}</p>
          </div>
        )}
      </div>

      {/* Блок смены пароля */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <button
          onClick={() => setShowPasswordForm(!showPasswordForm)}
          className="text-indigo-600 hover:text-indigo-800 font-medium"
        >
          {showPasswordForm ? 'Скрыть форму смены пароля' : 'Сменить пароль'}
        </button>

        {showPasswordForm && (
          <form onSubmit={handlePasswordSubmit} className="mt-4 space-y-4">
            {passwordMessage && (
              <div className={`p-3 rounded ${passwordMessage.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {passwordMessage.text}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">Текущий пароль</label>
              <input
                type="password"
                name="current_password"
                value={passwordData.current_password}
                onChange={handlePasswordChange}
                className="w-full p-2 border rounded-md"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Новый пароль</label>
              <input
                type="password"
                name="new_password"
                value={passwordData.new_password}
                onChange={handlePasswordChange}
                className="w-full p-2 border rounded-md"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Подтверждение нового пароля</label>
              <input
                type="password"
                name="confirm_password"
                value={passwordData.confirm_password}
                onChange={handlePasswordChange}
                className="w-full p-2 border rounded-md"
                required
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
                Изменить пароль
              </button>
              <button type="button" onClick={() => setShowPasswordForm(false)} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">
                Отмена
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Блок удаления аккаунта */}
      <div className="bg-white rounded-lg shadow p-6 border border-red-200">
        <p className="text-sm text-gray-600 mb-4">Удаление аккаунта приведёт к безвозвратной потере всех данных.</p>
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Удалить аккаунт
          </button>
        ) : (
          <div className="space-y-3">
            {deleteError && (
              <div className="p-2 rounded bg-red-100 text-red-700 text-sm">{deleteError}</div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">Введите ваш пароль для подтверждения</label>
              <input
                type="password"
                value={passwordForDelete}
                onChange={(e) => setPasswordForDelete(e.target.value)}
                className="w-full p-2 border border-red-300 rounded-md"
                placeholder="Пароль"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleDeleteAccount} className="px-4 py-2 bg-red-700 text-white rounded-md hover:bg-red-800">
                Подтвердить удаление
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setPasswordForDelete('');
                  setDeleteError(null);
                }}
                className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;