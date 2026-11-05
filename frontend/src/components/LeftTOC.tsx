import React from 'react';

export default function LeftTOC({ items, active, onSelect, title = 'Оглавление' }: {
  items: Array<{ id: string; label: string }>;
  active?: string;
  onSelect: (id: string) => void;
  title?: string;
}) {
  return (
    <aside aria-label={title} className="w-full xl:w-72 min-w-0 border rounded-lg bg-white overflow-hidden">
      <h2 className="px-4 py-3 border-b text-sm font-medium">{title}</h2>
      <ul className="max-h-[60vh] overflow-auto">
        {items.map((it) => (
          <li key={it.id}>
            <button type="button" aria-current={active === it.id ? 'true' : undefined} onClick={() => onSelect(it.id)} className={`w-full text-left px-4 py-3 [overflow-wrap:anywhere] hover:bg-gray-50 transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600 ${active === it.id ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-700'}`}>
              {it.label}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
