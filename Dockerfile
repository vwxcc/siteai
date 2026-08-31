FROM node:22

WORKDIR /app

COPY backend/package*.json ./backend/

WORKDIR /app/backend

RUN npm install --build-from-source better-sqlite3

COPY backend ./

EXPOSE 3051

CMD ["npm", "start"]
