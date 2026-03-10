FROM node:18-alpine

WORKDIR /app

COPY apex-bot-v5.js .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "apex-bot-v5.js"]
