FROM node:24-alpine AS build
WORKDIR /app
COPY backend-atlas-single-candidate.html ./
COPY client ./client
COPY scripts/build.mjs ./scripts/build.mjs
RUN node scripts/build.mjs

FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_FILE=/data/workspace.json
WORKDIR /app
COPY --from=build /app/public ./public
COPY server ./server
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
