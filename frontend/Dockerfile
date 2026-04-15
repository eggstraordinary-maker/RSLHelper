FROM node:20-alpine

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci

# Копируем остальной код
COPY . .

# Открываем порт Vite (по умолчанию 5173)
EXPOSE 5173

# Запускаем dev-сервер с хостом 0.0.0.0 для доступа извне контейнера
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]