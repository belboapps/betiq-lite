# BetIQ Lite price watcher: a hidden browser that opens the BetIQ page on a schedule.
FROM node:22-slim
WORKDIR /app
RUN npm init -y > /dev/null && npm install --no-save playwright && npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*
COPY watcher.js ./
ENV BETIQ_DATA=/data
VOLUME /data
CMD ["node", "watcher.js"]
