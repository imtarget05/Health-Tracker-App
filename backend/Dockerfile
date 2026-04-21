FROM node:22-alpine

WORKDIR /usr/src/app

# ✅ SECURITY: Create non-root user to run application
RUN addgroup -g 1000 appuser && \
    adduser -D -u 1000 -G appuser appuser

# install deps
COPY package.json package-lock.json ./
RUN npm ci --production

# copy source
COPY . ./

# ✅ SECURITY: Change ownership to non-root user
RUN chown -R appuser:appuser /usr/src/app

# Switch to non-root user
USER appuser

EXPOSE 5001

# default env will come from docker-compose or env file
CMD ["node", "src/index.js"]