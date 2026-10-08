ARG BASE=current-app:latest
FROM ${BASE}
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
