FROM node:24-alpine

WORKDIR /api

# Copie les fichiers de dépendances depuis la racine
COPY package*.json ./

RUN npm ci --omit=dev

# Copie tout le reste du projet (le dossier src, public, db.json, etc.)
COPY . .

# Docker considère le conteneur en échec si l'API ne répond plus
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
