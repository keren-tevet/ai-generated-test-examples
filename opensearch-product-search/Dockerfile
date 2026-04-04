FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npx tsc
RUN cp -r src/public dist/public
RUN npm prune --production
EXPOSE 3000
CMD ["node", "dist/index.js"]
