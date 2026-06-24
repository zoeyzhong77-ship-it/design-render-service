FROM node:18-slim

# 安装 Sharp 依赖 + 中文字体
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips-dev \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    fontconfig \
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
