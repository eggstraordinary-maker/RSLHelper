import React, { useState } from 'react';
import LeftTOC from '../components/LeftTOC';
import VideoStub from '../components/VideoStub';
import CameraView from '../components/CameraView';

const SAMPLE_WORDS = ['Привет', 'Спасибо', 'Да', 'Нет'];

export default function Learning() {
  const [selected, setSelected] = useState<string>(SAMPLE_WORDS[0]);
  const [recognizeResult, setRecognizeResult] = useState<string>('—');

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[auto_1fr] gap-4 lg:gap-6">
      <LeftTOC items={SAMPLE_WORDS} active={selected} onSelect={setSelected} />

      <div className="space-y-4">
        <VideoStub title={`Видео: жест для «${selected}» (заглушка)`} />

        <div>
          <label className="block text-sm font-medium mb-1">Слово для распознавания</label>
          <input value={selected} onChange={(e) => setSelected(e.target.value)} readOnly className="w-full rounded-md border px-3 py-2 bg-gray-100 cursor-not-allowed" placeholder="Слово" />
        </div>

        <div>
          <CameraView />
        </div>

        <div className="bg-white border rounded-lg p-4">
          <h4 className="font-semibold mb-2">Результат распознаваний</h4>
          <div className="text-lg text-gray-700 min-h-[56px] flex items-center">{recognizeResult}</div>

          <div className="mt-3 flex gap-2">
            <button onClick={() => setRecognizeResult('Совпадение: жест распознан как «' + selected + '»')} className="px-3 py-2 rounded bg-indigo-600 text-white text-sm">
              Симулировать распознавание (OK)
            </button>
            <button onClick={() => setRecognizeResult('Не совпадает: попробуйте снова')} className="px-3 py-2 rounded border text-sm">
              Симулировать ошибку
            </button>
            <button onClick={() => setRecognizeResult('—')} className="px-3 py-2 rounded border text-sm">Сброс</button>
          </div>
        </div>
      </div>
    </div>
  );
}
