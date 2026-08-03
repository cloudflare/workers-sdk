import { PassThrough } from "node:stream";
import { setImmediate as flush } from "node:timers/promises";
import { test } from "vitest";
// Imported from source rather than the package entry: this helper is internal
// to the runtime and deliberately not part of Miniflare's public API.
import { handleStructuredLogsFromStream } from "../../src/runtime/structured-logs";
import type { WorkerdStructuredLog } from "miniflare";

/** A line as workerd emits it when structured logging is enabled. */
function structured(level: string, message: string) {
	return `${JSON.stringify({ timestamp: 1700000000000, level, message })}\n`;
}

/**
 * kj's crash handlers write straight to stderr, so these lines are plain text
 * rather than structured logs.
 */
const CRASH_BANNER = "*** std::terminate() called with no exception\n";
const CRASH_STACK =
	"stack: 7ff6a1b2c3d4 7ff6a1b2c3d5 7ff6a1b2c3d6 7ff6a1b2c3d7\n";

/**
 * Feeds `chunks` through the stream handler, one `data` event each, and returns
 * the logs that made it to the handler. Writing one chunk at a time matters:
 * workerd's output arrives in arbitrary chunks, and a crash banner can land in
 * a different chunk from the stack trace that follows it.
 */
async function collect(chunks: string[]) {
	const collected: Pick<WorkerdStructuredLog, "level" | "message">[] = [];
	const stream = new PassThrough();
	handleStructuredLogsFromStream(stream, ({ level, message }) => {
		collected.push({ level, message });
	});

	for (const chunk of chunks) {
		stream.write(chunk);
		await flush();
	}
	stream.end();
	await flush();

	return collected;
}

test("a fatal crash banner is surfaced as an error along with its stack trace", async ({
	expect,
}) => {
	expect(await collect([CRASH_BANNER + CRASH_STACK])).toEqual([
		{
			level: "error",
			message: "*** std::terminate() called with no exception",
		},
		{
			level: "error",
			message: "stack: 7ff6a1b2c3d4 7ff6a1b2c3d5 7ff6a1b2c3d6 7ff6a1b2c3d7",
		},
	]);
});

test("a crash stack trace is surfaced even when it arrives in a later chunk", async ({
	expect,
}) => {
	expect(await collect([CRASH_BANNER, CRASH_STACK])).toEqual([
		{
			level: "error",
			message: "*** std::terminate() called with no exception",
		},
		{
			level: "error",
			message: "stack: 7ff6a1b2c3d4 7ff6a1b2c3d5 7ff6a1b2c3d6 7ff6a1b2c3d7",
		},
	]);
});

test("the missing-$LLVM_SYMBOLIZER notice is kept when it is part of a crash report", async ({
	expect,
}) => {
	const notice =
		"Not symbolizing stack traces because $LLVM_SYMBOLIZER is not set\n";

	expect(await collect([CRASH_BANNER, notice, CRASH_STACK])).toEqual([
		{
			level: "error",
			message: "*** std::terminate() called with no exception",
		},
		{
			level: "error",
			message:
				"Not symbolizing stack traces because $LLVM_SYMBOLIZER is not set",
		},
		{
			level: "error",
			message: "stack: 7ff6a1b2c3d4 7ff6a1b2c3d5 7ff6a1b2c3d6 7ff6a1b2c3d7",
		},
	]);
});

test("stack traces unrelated to a crash are still filtered out", async ({
	expect,
}) => {
	expect(await collect([CRASH_STACK, structured("log", "__LOG__")])).toEqual([
		{ level: "log", message: "__LOG__" },
	]);
});

test("filtering resumes once the crash report is over", async ({ expect }) => {
	const collected = await collect([
		CRASH_BANNER,
		CRASH_STACK,
		// An ordinary log line ends the crash report...
		structured("log", "__LOG__"),
		// ...so this unrelated stack trace is noise again.
		CRASH_STACK,
	]);

	expect(collected).toEqual([
		{
			level: "error",
			message: "*** std::terminate() called with no exception",
		},
		{
			level: "error",
			message: "stack: 7ff6a1b2c3d4 7ff6a1b2c3d5 7ff6a1b2c3d6 7ff6a1b2c3d7",
		},
		{ level: "log", message: "__LOG__" },
	]);
});

test("all of kj's fatal crash banners are recognised", async ({ expect }) => {
	const banners = [
		"*** std::terminate() called with no exception",
		"*** Fatal uncaught kj::Exception: kj/async-io.c++:123: disconnected",
		"*** Received signal #11: Segmentation fault",
		"*** Uncaught exception: something went wrong",
	];

	expect(await collect(banners.map((banner) => `${banner}\n`))).toEqual(
		banners.map((message) => ({ level: "error", message }))
	);
});

test("address-in-use errors are still swallowed, even during a crash report", async ({
	expect,
}) => {
	const addressInUse =
		"kj/async-io-unix.c++:1: failed: Address already in use; toString() = 127.0.0.1:8787; stack: 7ff6a1b2c3d4 7ff6a1b2c3d5 7ff6a1b2c3d6\n";

	// Miniflare turns this into a `MiniflareCoreError`, so showing the raw log
	// too would surface the same failure twice.
	expect(await collect([CRASH_BANNER, addressInUse])).toEqual([
		{
			level: "error",
			message: "*** std::terminate() called with no exception",
		},
	]);
});

test("access violations still get their Windows-specific explanation", async ({
	expect,
}) => {
	const accessViolation =
		"kj/exception.c++:1: failed: access violation; stack: 7ff6a1b2c3d4 7ff6a1b2c3d5 7ff6a1b2c3d6\n";

	const collected = await collect([CRASH_BANNER, accessViolation]);

	expect(collected).toHaveLength(2);
	expect(collected[1]?.level).toBe("error");
	expect(collected[1]?.message).toContain(
		"There was an access violation in the runtime."
	);
});
