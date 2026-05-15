# Используем минимальный официальный образ NVIDIA с CUDA 12.6 и cuDNN 9
FROM nvidia/cuda:12.6.0-cudnn-runtime-ubuntu22.04

# Устанавливаем Python и необходимые системные пакеты
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3-pip \
    python3.11-dev \
    libgl1 \
    libglib2.0-0 \
    # Очищаем кэш apt, чтобы уменьшить размер образа
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    # Создаем символическую ссылку для удобства
    && ln -s /usr/bin/python3.11 /usr/bin/python

WORKDIR /app

# Копируем и устанавливаем зависимости Python
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Копируем исходный код сервиса
COPY app.py model.py frame_sampler.py ./
COPY models ./models

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]