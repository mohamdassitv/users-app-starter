FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY src ./src
COPY logs ./logs
COPY state ./state
ENV PORT=8081
EXPOSE 8081
CMD ["node","src/server.js"]
