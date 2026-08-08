# Immagine Playwright con Chromium già dentro (versione allineata a playwright 1.47.0)
FROM mcr.microsoft.com/playwright:v1.62.1-jammy

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
