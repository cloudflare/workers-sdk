#!/usr/bin/env node
// A fake workerd that exits immediately without writing any control messages.
// Used to test that Miniflare detects early workerd exits instead of hanging.

import { arrayBuffer } from "stream/consumers";

// Consume stdin (config passed via stdin) to avoid EPIPE
await arrayBuffer(process.stdin);

// Write an error to stderr to simulate a startup failure
process.stderr.write("error: bind(::1, 0): Address not available\n");

// Exit with non-zero code without writing any listen events to FD3
process.exit(1);
