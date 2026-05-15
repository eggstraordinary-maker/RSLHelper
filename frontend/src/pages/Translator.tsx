import React, { useState } from 'react';
import CameraView from '../components/CameraView';

export default function Translator() {
  const [recognizedText, setRecognizedText] = useState<string>('');

  const handleGesture = (gesture: string) => {
    setRecognizedText(gesture);
  };

  return (
    <div className="space-y-4">
      <CameraView onGesture={handleGesture} />

      <div className="bg-white border rounded-lg p-4">
        <h4 className="font-semibold mb-2">Распознанный текст</h4>
        <div className="min-h-[80px] text-lg text-gray-700 flex items-center">
          {recognizedText ? (
            <span>{recognizedText}</span>
          ) : (
            <span className="text-gray-400">[Ожидание жеста...]</span>
          )}
        </div>
      </div>
    </div>
  );
}