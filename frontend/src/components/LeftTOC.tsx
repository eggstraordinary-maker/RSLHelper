import React from 'react';

export default function LeftTOC({ items, active, onSelect }: { items: string[]; active?: string; onSelect: (s: string) => void }) {
  return (
    <aside className="w-full lg:w-72 border rounded-lg bg-white overflow-hidden">
      <div className="px-4 py-3 border-b text-sm font-medium">Оглавление</div>
      <ul className="max-h-[60vh] overflow-auto">
        {items.map((it) => (
          <li key={it}>
            <button onClick={() => onSelect(it)} className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition ${active === it ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-700'}`}>
              {it}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}