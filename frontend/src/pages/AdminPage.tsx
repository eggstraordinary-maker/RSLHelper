import React from 'react';
import { UserAdministration } from '../features/admin';
import { useTranslation } from 'react-i18next';

const AdminPage: React.FC = () => {
  const { t } = useTranslation('admin');
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">{t('title')}</h1>
      <UserAdministration />
    </div>
  );
};

export default AdminPage;
