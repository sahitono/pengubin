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

COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile

RUN mkdir -p dist && pnpm build
RUN pnpm deploy --filter=pengubin --prod /prod/pengubin/

FROM base AS prod-stage
ENV NODE_ENV=PRODUCTION

COPY --from=build-stage /prod/pengubin .
COPY docker-entrypoint.sh .

ENTRYPOINT ["/app/docker-entrypoint.sh"]
