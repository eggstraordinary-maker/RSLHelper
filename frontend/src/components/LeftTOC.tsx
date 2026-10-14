import React from 'react';

export default function LeftTOC({ items, active, onSelect }: {
  items: Array<{ id: string; label: string }>;
  active?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="w-full lg:w-72 border rounded-lg bg-white overflow-hidden">
      <div className="px-4 py-3 border-b text-sm font-medium">Оглавление</div>
      <ul className="max-h-[60vh] overflow-auto">
        {items.map((it) => (
          <li key={it.id}>
            <button aria-current={active === it.id ? 'true' : undefined} onClick={() => onSelect(it.id)} className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition ${active === it.id ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-700'}`}>
              {it.label}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
