# Verwende ein offizielles Node.js-Image als Basis
FROM node:18

# Installiere Bun
RUN curl -fsSL https://bun.sh/install | bash

# Setze die Umgebungsvariable, um Bun global verfügbar zu machen
ENV PATH="/root/.bun/bin:$PATH"

# Erstelle und setze das Arbeitsverzeichnis
WORKDIR /usr/src/app

# Kopiere die package.json und package-lock.json (falls vorhanden)
COPY package*.json ./

# Installiere die Abhängigkeiten
RUN npm install

# Kopiere den Rest des Projekts
COPY . .

# Exponiere den Port, auf dem dein Server läuft (in deinem Fall Port 3001)
EXPOSE 3001

# Starte den Server
CMD ["npm", "run", "start"]
