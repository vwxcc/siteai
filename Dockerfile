FROM node:22-alpine

WORKDIR /app

COPY backend/package*.json ./backend/

WORKDIR /app/backend

RUN npm install

COPY backend ./

EXPOSE 3051

CMD ["npm", "start"]
