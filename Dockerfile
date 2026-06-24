FROM node:18-slim

# 安装 Sharp 所需系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips-dev \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# 复制所有代码和字体文件
COPY . .

# 注册自带字体（思源黑体/宋体）到系统字体缓存，供 librsvg/Sharp 使用
RUN mkdir -p /usr/local/share/fonts/source-han && \
    cp /app/fonts/*.otf /usr/local/share/fonts/source-han/ && \
    fc-cache -fv

EXPOSE 3000

CMD ["node", "server.js"]
