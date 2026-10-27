// Standalone (Node >=22.6):
// node --experimental-strip-types --test test/ws-chunk.node-test.mjs
// Kept outside Vitest's *.test.ts glob to avoid the fixture registry global setup.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	createChunkReassembler,
	MAX_WS_FRAME_BYTES,
	sendChunked,
} from "../src/shared/ws-chunk.ts";

test("small messages retain their exact wire format, including at the byte limit", () => {
	for (const serialized of [
		'[{"t":"q"}]',
		"x".repeat(MAX_WS_FRAME_BYTES),
	]) {
		const frames = [];
		const completed = [];
		sendChunked((raw) => frames.push(raw), serialized);
		assert.deepEqual(frames, [serialized]);
		frames.forEach(createChunkReassembler((raw) => completed.push(raw)));
		assert.deepEqual(completed, [serialized]);
	}
});

test("warm snapshots above workerd's 32 MiB limit roundtrip in bounded frames", () => {
	const serialized = JSON.stringify([
		{
			t: "s",
			i: "warm-modules",
			r: { "/shared.ts": { code: "x".repeat(34 * 1024 * 1024) } },
		},
	]);
	const completed = [];
	const receive = createChunkReassembler((raw) => completed.push(raw));
	let frames = 0;
	sendChunked((raw) => {
		assert.ok(Buffer.byteLength(raw) <= MAX_WS_FRAME_BYTES);
		assert.equal(completed.length, 0);
		frames++;
		receive(raw);
	}, serialized);
	assert.ok(frames > 1);
	assert.deepEqual(completed, [serialized]);
});

test("Unicode, split surrogate pairs and JSON escaping stay within the byte budget", () => {
	for (const serialized of [
		"x" + "😀".repeat(MAX_WS_FRAME_BYTES / 4 + 1),
		'\u0000"\\\ud800'.repeat(MAX_WS_FRAME_BYTES / 5),
	]) {
		let completed;
		const receive = createChunkReassembler((raw) => {
			completed = raw;
		});
		sendChunked((raw) => {
			assert.ok(Buffer.byteLength(raw) <= MAX_WS_FRAME_BYTES);
			receive(raw);
		}, serialized);
		assert.equal(completed, serialized);
	}
});

test("interleaved messages have distinct IDs and release state on completion", () => {
	const frames = [[], []];
	for (const [index, value] of ["a", "b"].entries()) {
		sendChunked(
			(raw) => frames[index].push(raw),
			value.repeat(MAX_WS_FRAME_BYTES + 1)
		);
	}
	assert.notEqual(JSON.parse(frames[0][0]).id, JSON.parse(frames[1][0]).id);
	const completed = [];
	const receive = createChunkReassembler((raw) => completed.push(raw));
	for (let index = 0; index < frames[0].length; index++) {
		receive(frames[0][index]);
		receive(frames[1][index]);
	}
	assert.deepEqual(completed, [
		"a".repeat(MAX_WS_FRAME_BYTES + 1),
		"b".repeat(MAX_WS_FRAME_BYTES + 1),
	]);
	// Replaying a completed sequence must start fresh rather than retain chunks.
	frames[0].forEach(receive);
	assert.equal(completed.length, 3);
});

test("malformed, missing or duplicate chunks fail with actionable diagnostics", () => {
	for (const chunk of [
		{ index: 1, total: 2, data: "x" },
		{ index: 0, total: 0, data: "x" },
		{ index: 0, total: 2, data: 123 },
	]) {
		const receive = createChunkReassembler(() =>
			assert.fail("unexpected completion")
		);
		assert.throws(
			() => receive(JSON.stringify({ __vpwWsChunk: 1, id: "test", ...chunk })),
			/32 MiB.*#16515/
		);
	}
	const receive = createChunkReassembler(() =>
		assert.fail("unexpected completion")
	);
	const first = JSON.stringify({
		__vpwWsChunk: 1,
		id: "test",
		index: 0,
		total: 2,
		data: "x",
	});
	receive(first);
	assert.throws(() => receive(first), /32 MiB.*#16515/);
});
