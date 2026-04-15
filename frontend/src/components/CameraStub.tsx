import React from 'react';

export default function CameraStub({ label = 'Камера (заглушка)' }: { label?: string }) {
  return (
    <div className="border rounded-lg p-3 bg-white">
      <div className="w-full aspect-[4/3] bg-gray-100 flex items-center justify-center text-gray-500">{label}</div>
      <div className="mt-2 text-xs text-gray-500">Интерактивный виджет камеры — заглушка для демонстрации</div>
    </div>
  );
}
