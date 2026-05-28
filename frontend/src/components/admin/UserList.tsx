import React, { useEffect, useState } from 'react';
import { fetchAllUsers, deleteUserById } from '../../services/adminService';
import { User } from '../../types/api';
import { useAuth } from '../../contexts/AuthContext';

const UserList: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const { user: currentUser } = useAuth();

  const loadUsers = async () => {
    try {
      const data = await fetchAllUsers();
      setUsers(data);
    } catch (error) {
      console.error('Ошибка загрузки пользователей', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleDelete = async (user: User) => {
    if (user.id === currentUser?.id) {
      alert('Нельзя удалить самого себя');
      return;
    }
    if (!window.confirm(`Удалить пользователя ${user.email}?`)) return;
    try {
      await deleteUserById(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (error) {
      alert('Ошибка при удалении');
    }
  };

  if (loading) return <div className="p-4">Загрузка...</div>;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">Список пользователей</h2>
      {users.length === 0 ? (
        <p>Нет пользователей</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">ID</th>
              <th className="border p-2">Email</th>
              <th className="border p-2">Имя</th>
              <th className="border p-2">Роль</th>
              <th className="border p-2">Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="border p-2">{u.id}</td>
                <td className="border p-2">{u.email}</td>
                <td className="border p-2">{u.username}</td>
                <td className="border p-2">{u.role}</td>
                <td className="border p-2">
                  <button
                    onClick={() => handleDelete(u)}
                    disabled={u.id === currentUser?.id}
                    className="px-3 py-1 bg-red-500 text-white rounded disabled:opacity-50"
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default UserList;