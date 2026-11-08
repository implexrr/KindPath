FROM mcr.microsoft.com/playwright:v1.64.1-noble@sha256:2f05f8a734509a7b3f26a912639488ee08f58a7b292d14d62271bcff9038768f AS patched
USER root
# Bootstrap package repairs over authenticated HTTPS, including the APT repair itself.
RUN sed -i 's|http://|https://|g' /etc/apt/sources.list.d/ubuntu.sources \
    && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

FROM patched AS worker
WORKDIR /opt/kindpath-worker
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force \
    && rm -rf /usr/lib/node_modules/npm /usr/bin/npm /usr/bin/npx /root/.npm
COPY worker.mjs public-worker.mjs public-report.mjs public-report.test.mjs ./
COPY gateway/ ./gateway/
COPY firewall/ ./firewall/
COPY fixtures/ ./fixtures/
USER pwuser
ENV HOME=/tmp/kindpath-home
ENTRYPOINT ["node", "worker.mjs"]

FROM ubuntu:24.04@sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852 AS firewall
# The pinned base lacks CA certificates; bootstrap HTTPS with the patched source image's trust store.
COPY --from=patched /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
RUN sed -i 's|http://|https://|g' /etc/apt/sources.list.d/ubuntu.sources \
    && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends nftables libatomic1 libstdc++6 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*
COPY --from=patched /usr/bin/node /usr/bin/node
WORKDIR /opt/kindpath-firewall
COPY firewall/ ./firewall/
USER 1000:1000
ENTRYPOINT ["node", "firewall/control.mjs"]
