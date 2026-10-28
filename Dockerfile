# Imagem única: compila o cliente e roda o servidor, que entrega o jogo e o multiplayer
# na mesma porta. Usada na Oracle (deploy/oracle) ou em qualquer host com Docker.
FROM node:22-slim
LABEL org.opencontainers.image.source="https://github.com/Wildora-Gaming/wildora_game"
LABEL org.opencontainers.image.description="Wildora: servidor do jogo + cliente compilado"

WORKDIR /app

# dependências primeiro (cache entre builds)
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --include=dev --no-audit --no-fund

COPY . .
RUN npm run build && mkdir -p server/data && chown node:node server/data

ENV PORT=2567
EXPOSE 2567
USER node
CMD ["node_modules/.bin/tsx", "server/src/index.ts"]
