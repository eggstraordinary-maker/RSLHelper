import React from 'react';
import CameraView from '../components/CameraView';

export default function Translator() {
  return (
    <div className="space-y-4">
      <CameraView />

      <div className="bg-white border rounded-lg p-4">
        <h4 className="font-semibold mb-2">Распознанный текст (заглушка)</h4>
        <div className="min-h-[80px] text-lg text-gray-700 flex items-center">
          <span className="text-gray-400">[Здесь появится текст, распознанный с камеры]</span>
        </div>
      </div>
    </div>
  );
}
