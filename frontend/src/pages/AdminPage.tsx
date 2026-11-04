import React from 'react';
import UserList from '../components/admin/UserList';

const AdminPage: React.FC = () => {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Панель администратора</h1>
      <UserList />
    </div>
  );
};

export default AdminPage;