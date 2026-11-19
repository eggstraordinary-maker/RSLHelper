import React from 'react';
import { NavLink } from 'react-router-dom';
import { CatalogAdministration, UserAdministration } from '../features/admin';
import { useTranslation } from 'react-i18next';

const sectionLink = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 focus-visible:outline-2 focus-visible:outline-indigo-600 ${isActive ? 'bg-indigo-100 text-indigo-900 font-semibold' : 'text-indigo-700 hover:bg-indigo-50'}`;

const AdminPage: React.FC<{ catalog?: boolean }> = ({ catalog = false }) => {
  const { t } = useTranslation('admin');
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">{t('title')}</h1>
      <nav aria-label={t('navigation')} className="mb-5 flex flex-wrap gap-2">
        <NavLink className={sectionLink} to="/admin" end>{t('usersTab')}</NavLink>
        <NavLink className={sectionLink} to="/admin/catalog">{t('catalogTab')}</NavLink>
      </nav>
      {catalog ? <CatalogAdministration /> : <UserAdministration />}
    </div>
  );
};

export default AdminPage;
