FROM node:25-alpine

WORKDIR /api

# Copie les fichiers de dépendances depuis la racine
COPY package*.json ./

RUN npm ci --omit=dev

# Copie tout le reste du projet (le dossier src, public, db.json, etc.)
COPY . .

# Lance le serveur depuis son nouvel emplacement
CMD ["node", "src/server.js"]