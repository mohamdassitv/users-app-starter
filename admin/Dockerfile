FROM node:20-alpine
WORKDIR /app
COPY ./src ./src
COPY ./seed ./seed
COPY ./token.txt ./token.txt
RUN npm init -y && npm install express
ENV PORT=8082
EXPOSE 8082
CMD ["node","src/server.js"]
