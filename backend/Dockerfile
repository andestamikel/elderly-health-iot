FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY src ./src
COPY sql ./sql

EXPOSE 4000
CMD ["npm", "start"]
