FROM node:22.23.3-bookworm-slim@sha256:3ed98443660ff48413b5af19ecefce3b9d50845a901a43420d47cc63a9fddbe9 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@10.30.3
COPY . .
RUN --mount=type=cache,id=labticker-pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --store-dir /pnpm/store
ARG CATALOG_GIT_SHA
ENV CATALOG_GIT_SHA=$CATALOG_GIT_SHA
ARG ANALYTICS_PROVIDER=noop
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
# Next.js embeds these public project settings at build time. Defaults remain no-op.
ENV ANALYTICS_PROVIDER=$ANALYTICS_PROVIDER NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST
RUN pnpm build

FROM build AS runtime
ENV NODE_ENV=production
ENV PORT=8080
ENV EMAIL_DELIVERY_MODE=mock PUBLIC_EMAIL_ENABLED=false ADS_ENABLED=false EMAIL_SPONSORS_ENABLED=false WEB_AD_PROVIDER=none
RUN chown -R node:node /app/apps/web/.next
USER node
EXPOSE 8080
CMD ["pnpm","--filter","@labticker/web","start","--hostname","0.0.0.0","--port","8080"]
