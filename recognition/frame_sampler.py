import numpy as np
from collections import deque

class FrameSampler:
    def __init__(self, clip_len=32, frame_interval=2, buffer_size=128):
        self.clip_len = clip_len               # 32 кадра на вход модели
        self.frame_interval = frame_interval   # Шаг выборки кадров для захвата движения
        self.buffer = deque(maxlen=buffer_size) # Кольцевой буфер для хранения кадров
        print("Frame Sampler __init__")

    def add_frame(self, frame):
        """Добавляет новый кадр в буфер."""
        self.buffer.append(frame)
        print("Frame Sampler append")

    def get_clip(self):
        """
        Извлекает из буфера подготовленный фрагмент из clip_len кадров.
        Возвращает список кадров или None, если кадров недостаточно.
        """
        if len(self.buffer) < self.clip_len * self.frame_interval:
            return None  # Ещё не накопилось достаточно кадров

        # Выбираем кадры с шагом frame_interval из конца буфера
        indices = range(-self.clip_len * self.frame_interval, 0, self.frame_interval)
        clip = [self.buffer[i] for i in indices]
        print(f"Clip length: {len(clip)}")  # должно быть 32
        # Проверяем, что в итоге получилось ровно clip_len кадров
        if len(clip) == self.clip_len:
            print("return clip")
            return clip
        return None