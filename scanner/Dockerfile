FROM mcr.microsoft.com/playwright:v1.64.1-noble@sha256:2f05f8a734509a7b3f26a912639488ee08f58a7b292d14d62271bcff9038768f
WORKDIR /opt/kindpath-worker
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY worker.mjs public-worker.mjs public-report.mjs public-report.test.mjs ./
COPY gateway/ ./gateway/
COPY fixtures/ ./fixtures/
USER pwuser
ENV HOME=/tmp/kindpath-home
ENTRYPOINT ["node", "worker.mjs"]
