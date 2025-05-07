FROM node:23

WORKDIR /server

COPY package.json package.json

RUN npm install

COPY dist/index.cjs server.cjs

# All other dependencies are bundled
RUN npm install -g  wrangler@4

RUN mkdir /app

EXPOSE 3125
ENTRYPOINT [ "node", "server.cjs" ]