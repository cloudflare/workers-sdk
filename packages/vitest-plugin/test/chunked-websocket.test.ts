import { test } from "vitest";
import {
	createChunkedWebSocketMessageHandler,
	sendChunkedWebSocketMessage,
} from "../src/shared/chunked-websocket";

test("sends small messages unchanged", ({ expect }) => {
	const frames: string[] = [];
	sendChunkedWebSocketMessage(
		(frame) => frames.push(frame),
		"small RPC message"
	);
	expect(frames).toEqual(["small RPC message"]);
});

test("reassembles large messages from bounded frames", ({ expect }) => {
	const message = JSON.stringify({
		text: `${'quotes: ", slashes: \\\\, newline:\n, unicode: 😀漢字'.repeat(20_000)}`,
	});
	const frames: string[] = [];
	sendChunkedWebSocketMessage((frame) => frames.push(frame), message);

	expect(frames.length).toBeGreaterThan(1);
	for (const frame of frames) {
		expect(new TextEncoder().encode(frame).length).toBeLessThan(1024 * 1024);
	}

	const received: string[] = [];
	const handleMessage = createChunkedWebSocketMessageHandler((value) => {
		received.push(value);
	});
	for (const frame of frames.reverse()) {
		handleMessage(frame);
	}
	expect(received).toEqual([message]);
});
