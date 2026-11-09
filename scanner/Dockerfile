FROM mcr.microsoft.com/playwright:v1.64.1-noble@sha256:2f05f8a734509a7b3f26a912639488ee08f58a7b292d14d62271bcff9038768f AS patched
USER root
# Bootstrap package repairs over authenticated HTTPS, including the APT repair itself.
RUN sed -i 's|http://|https://|g' /etc/apt/sources.list.d/ubuntu.sources \
    && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

FROM patched AS codec-builder
# Rebuild only the affected library from Ubuntu's authenticated, patched source.
# Build tools and development headers stay in this disposable stage.
RUN sed -i 's/^Types: deb$/Types: deb deb-src/' /etc/apt/sources.list.d/ubuntu.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends build-essential meson ninja-build pkg-config \
        libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev curl ca-certificates patch
WORKDIR /build
RUN apt-get source gst-plugins-bad1.0=1.24.2-1ubuntu4
RUN curl --fail --location --proto '=https' --tlsv1.2 \
        https://github.com/GStreamer/gstreamer/commit/e4351ef03f1331410b0c1216a6178d885f37e495.patch -o prerequisite.patch \
    && echo '67657bfba83291e4be2b7acbe0f481858270f26570a45fea7a2de78aaf432164  prerequisite.patch' | sha256sum -c -
RUN curl --fail --location --proto '=https' --tlsv1.2 \
        https://github.com/GStreamer/gstreamer/commit/ed4c2ce380f7168bd4a3423f4398eb341cb931c7.patch -o fix.patch \
    && echo '1893a2d4dfdb1f57915616cd759415d5f403b62545ee2f79377813684b7bf7f7  fix.patch' | sha256sum -c - \
    && cd gst-plugins-bad1.0-1.24.2 \
    && sed -i '/^      } else if (sps->num_short_term_ref_pic_sets > 1) {$/a\        /*  7.4.7.1 short_term_ref_pic_set_idx */' gst-libs/gst/codecparsers/gsth265parser.c \
    && patch --batch --fuzz=0 -p3 < ../prerequisite.patch \
    && patch --batch --fuzz=0 -p3 < ../fix.patch
RUN --network=none cd gst-plugins-bad1.0-1.24.2 \
    && meson setup build --prefix=/usr --buildtype=release -Db_lto=true \
        -Dc_args="-fstack-protector-strong -Wformat -Werror=format-security -D_FORTIFY_SOURCE=3" \
        -Dc_link_args="-Wl,-z,relro,-z,now" -Dauto_features=auto -Dtests=auto --wrap-mode=nodownload \
        -Dexamples=disabled -Dintrospection=disabled -Ddoc=disabled \
    && ninja -C build gst-libs/gst/codecparsers/libgstcodecparsers-1.0.so.0.2402.0 \
    && ninja -C build tests/check/libs_h265parser tests/check/libs_h265bitwriter \
    && meson test -C build --no-rebuild libs_h265parser libs_h265bitwriter --print-errorlogs

COPY codec/h265-regression.c /build/h265-regression.c
RUN --network=none cd gst-plugins-bad1.0-1.24.2 \
    && cc -O2 -fstack-protector-strong -D_FORTIFY_SOURCE=3 -Wl,-z,relro,-z,now \
        -I gst-libs /build/h265-regression.c -o /build/h265-regression \
        $(pkg-config --cflags --libs gstreamer-1.0) -L build/gst-libs/gst/codecparsers -lgstcodecparsers-1.0 \
    && /build/h265-regression --original \
    && LD_LIBRARY_PATH=build/gst-libs/gst/codecparsers /build/h265-regression

FROM patched AS worker
COPY --from=codec-builder /build/gst-plugins-bad1.0-1.24.2/build/gst-libs/gst/codecparsers/libgstcodecparsers-1.0.so.0.2402.0 /tmp/patched-codec.so
RUN install -m 0644 /tmp/patched-codec.so "$(find /usr/lib -name libgstcodecparsers-1.0.so.0.2402.0 -type f)" && rm /tmp/patched-codec.so
WORKDIR /opt/kindpath-worker
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force \
    && rm -rf /usr/lib/node_modules/npm /usr/bin/npm /usr/bin/npx /root/.npm
COPY worker.mjs preview.mjs public-worker.mjs public-report.mjs public-report.test.mjs ./
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
