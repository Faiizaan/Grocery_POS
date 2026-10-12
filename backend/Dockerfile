FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

# System deps (openssl for Prisma)
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# Install deps
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Generate Prisma client inside the image
RUN npx prisma generate

EXPOSE 4000
CMD ["npx", "tsx", "src/index.ts"]