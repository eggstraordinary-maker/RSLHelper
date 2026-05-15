import onnxruntime as ort
import numpy as np
import json
import cv2
from models.constants import classes


class SignRecognizer:
    def __init__(self, model_path: str, labels_path: str):
        # Выбираем доступные провайдеры: GPU или CPU
        providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
        self.session = ort.InferenceSession(model_path, providers=providers)
        print(f"[INFO] ONNX Runtime initialized with provider: {self.session.get_providers()[0]}")
        self.input_name = self.session.get_inputs()[0].name
        print(f"[INFO] Model input name: {self.input_name}")

        # Загружаем метки жестов
        self.labels = [classes.get(i, "unknown") for i in range(max(classes.keys())+1)]
        input_shape = self.session.get_inputs()[0].shape
        print(f"Загружено {len(self.labels)} меток жестов.")
        print(f"Expected input shape: {input_shape}")
        print(f"Expected input rank: {len(input_shape)}")
        print(f"[INFO] Available providers: {self.session.get_providers()}")
        print(f"[INFO] Input name: {self.input_name}")
        print(f"[INFO] Input shape: {self.session.get_inputs()[0].shape}")
        # with open(labels_path, 'r', encoding='utf-8') as f:
        #     self.labels = json.load(f)  # список из 1000 строк

    def preprocess(self, frames):
        """
        Преобразует список из 32 кадров в формат для ONNX модели.
        Модель ожидает входной тензор формы: (1, 3, 32, 224, 224)
        где: 1 - batch, 3 - каналы (RGB), 32 - кадры, 224 - высота, 224 - ширина
        """
        processed = []
        for frame in frames:
            # Меняем цветовое пространство BGR -> RGB
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            # Изменяем размер кадра до 224x224
            frame_resized = cv2.resize(frame_rgb, (224, 224))
            # Нормализуем значения пикселей к диапазону [0, 1]
            frame_normalized = frame_resized.astype(np.float32) / 255.0
            processed.append(frame_normalized)

        # Меняем порядок осей (T, H, W, C) -> (C, T, H, W)
        input_tensor = np.stack(processed, axis=0)
        input_tensor = np.transpose(input_tensor, (3, 0, 1, 2))
        # Добавляем размерность батча: (C, T, H, W) -> (1, C, T, H, W)
        input_tensor = np.expand_dims(input_tensor, axis=0)
        input_tensor = np.expand_dims(input_tensor, axis=1)   # (1, 1, C, T, H, W)

        return input_tensor

    def predict(self, frames):
        """
        Возвращает предсказанный жест и его уверенность.
        """
        input_tensor = self.preprocess(frames)
        outputs = self.session.run(None, {self.input_name: input_tensor})

        # Предполагаем, что модель возвращает массив вероятностей для 1000 классов
        probs = outputs[0][0]
        best_idx = np.argmax(probs)
        confidence = probs[best_idx]
        # Получаем название жеста из нашего списка меток
        gesture = self.labels[best_idx] if best_idx < len(self.labels) else "unknown"

        return gesture, float(confidence)