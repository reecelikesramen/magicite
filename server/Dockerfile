# One small image for both servers:
#   docker build -f server/Dockerfile -t shardfall-server .
#   docker run -p 7777:7777 shardfall-server                      # signaling relay (default)
#   docker run -p 8787:8787 -e MODE=dedicated shardfall-server    # dedicated game server
FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile --ignore-scripts
COPY src ./src
COPY server ./server
ENV MODE=relay
EXPOSE 7777 8787
USER bun
CMD ["sh", "-c", "if [ \"$MODE\" = dedicated ]; then exec bun server/dedicated.ts; else exec bun server/relay.ts; fi"]
