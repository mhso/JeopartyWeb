FROM node:26-alpine AS builder
WORKDIR /jeoparty

# Copy dependency files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install
RUN npm audit fix

# Copy code and build
COPY . ./
RUN npm run build

# Only the built files end up in the output. Flask serves them from
# jeoparty_web/dist (Config.FRONTEND_DIST_FOLDER), see run.sh
FROM scratch AS export
COPY --from=builder /jeoparty/dist /
