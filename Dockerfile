FROM node:20-alpine
WORKDIR /app
COPY package.json ./
# 零依赖，无需 npm install；若后续加依赖可取消下一行注释
# RUN npm install --omit=dev
COPY server.js ./
COPY public ./public
RUN mkdir -p /app/data
VOLUME ["/app/data"]
ENV PORT=3000
ENV ACCESS_KEY=change-me-please
EXPOSE 3000
CMD ["node", "server.js"]
