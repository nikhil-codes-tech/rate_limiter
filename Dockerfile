FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy source code and Lua scripts
COPY . .

EXPOSE 3000

CMD ["node", "src/app.js"]
