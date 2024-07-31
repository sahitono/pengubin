FROM sitespeedio/node:ubuntu-22-04-nodejs-20.15.1 AS base
WORKDIR /app

RUN apt-get -qq update && apt-get install -y --no-install-recommends \
    libuv1  \
    libopengl0  \
    libpng16-16 \
    libcurl4  \
    libjpeg-turbo8  \
    libglfw3  \
    libicu70  \
    libwebp7 \
    xvfb \
    && rm -rf /var/lib/apt/lists/*


FROM base AS build-stage

RUN corepack enable
RUN corepack prepare pnpm@9.4.0 --activate

COPY .npmrc package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile

COPY . .
RUN mkdir -p dist && pnpm build

FROM base AS install-prod-stage
ENV NODE_ENV=production

RUN corepack enable
RUN corepack prepare pnpm@9.4.0 --activate

COPY .npmrc package.json pnpm-lock.yaml ./
COPY --from=build-stage /app/dist .
RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile


FROM install-prod-stage AS prod-stage
COPY docker-entrypoint.sh .
ENTRYPOINT ["/app/docker-entrypoint.sh"]
