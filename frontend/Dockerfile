FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
ENV API_URL=http://backend:3001
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
