FROM node:22-alpine

WORKDIR /usr/src/app
RUN echo '{"name": "simple-node-app", "version": "1.0.0"}' > package.json
RUN npm install

RUN echo 'const { createServer } = require("http");\
\
const server = createServer(function (req, res) {\
	res.writeHead(200, { "Content-Type": "text/plain" });\
	res.write("Hello from Container B");\
	res.end();\
});\
\
server.listen(8080);\
' > app.js

EXPOSE 8080
