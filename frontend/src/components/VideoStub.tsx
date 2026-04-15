import React from 'react';

export default function VideoStub({ title = 'Видео (заглушка)' }: { title?: string }) {
  return (
    <div className="bg-black/5 border rounded-lg overflow-hidden">
      <div className="w-full aspect-video bg-gray-200 flex items-center justify-center text-sm text-gray-500">{title}</div>
    </div>
  );
}
