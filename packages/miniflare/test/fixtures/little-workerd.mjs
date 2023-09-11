#!/usr/bin/env node
import assert from "assert";
import fs from "fs";
import http from "http";
import { arrayBuffer } from "stream/consumers";

// Consume but otherwise ignore stdin (assuming config passed via stdin)
await arrayBuffer(process.stdin);

// Start server...
const server = http.createServer((req, res) => {
	res.end("When I grow up, I want to be a big workerd!");
});
server.listen(0, () => {
	// ...and report port to parent via control fd
	assert(process.argv.includes("--control-fd=3"));
	const stream = fs.createWriteStream(null, { fd: 3 });
	const port = server.address().port;
	const message = JSON.stringify({ event: "listen", socket: "entry", port });
	stream.write(`${message}\n`);
});
