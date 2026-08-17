# Immagine Playwright con Chromium già dentro (versione allineata a playwright 1.47.0)
FROM mcr.microsoft.com/playwright:v1.62.1-jammy

# ffmpeg serve all'endpoint /reel per montare le clip in MP4.
USER root
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
