import { PassThrough } from "node:stream";
import { setImmediate as flush } from "node:timers/promises";
import { test } from "vitest";
// Imported from source rather than the package entry: this helper is internal
// to the runtime and deliberately not part of Miniflare's public API.
import {
	handleStructuredLogsFromStream,
	parseAddressInUse,
} from "../../src/runtime/structured-logs";
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

test("the Rust server's address-in-use errors are swallowed", async ({
	expect,
}) => {
	const message =
		'Socket "entry": bind(): Address already in use (os error 48)';

	// Miniflare turns this into a `MiniflareCoreError` too. The line has no
	// stack, so it is not internal noise and must be recognised on its own.
	expect(await collect([structured("error", message), `${message}\n`])).toEqual(
		[]
	);
});

test("an address-in-use crash banner is swallowed", async ({ expect }) => {
	expect(
		await collect([
			"*** Fatal uncaught kj::Exception: rust/cxx/kj-rs-io/ffi.rs:209: failed: bind(): Address already in use (os error 48)\n",
		])
	).toEqual([]);
});

test("parseAddressInUse() finds the socket or address in use", ({ expect }) => {
	// workerd's Rust server, plain text, on macOS, Linux and Windows.
	expect(
		parseAddressInUse(
			'Socket "entry": bind(): Address already in use (os error 48)\n'
		)
	).toEqual({ socket: "entry" });
	expect(
		parseAddressInUse(
			'Socket "entry:local": bind(): Address already in use (os error 98)\n'
		)
	).toEqual({ socket: "entry:local" });
	expect(
		parseAddressInUse(
			'Socket "entry": bind(): Only one usage of each socket address (protocol/network address/port) is normally permitted. (os error 10048)\n'
		)
	).toEqual({ socket: "entry" });
	// The same, as the raw line of a structured log.
	expect(
		parseAddressInUse(
			structured(
				"error",
				'Socket "entry": bind(): Address already in use (os error 48)'
			)
		)
	).toEqual({ socket: "entry" });
	// workerd's C++ server over tokio-backed sockets: a fatal crash naming
	// neither.
	expect(
		parseAddressInUse(
			"*** Fatal uncaught kj::Exception: rust/cxx/kj-rs-io/ffi.rs:209: failed: bind(): Address already in use (os error 48)\n"
		)
	).toEqual({});
	// The same on Windows, when the port's holder has `SO_EXCLUSIVEADDRUSE`.
	expect(
		parseAddressInUse(
			"*** Fatal uncaught kj::Exception: rust/cxx/kj-rs-io\\ffi.rs:209: failed: bind(): An attempt was made to access a socket in a way forbidden by its access permissions. (os error 10013)\n"
		)
	).toEqual({});
	// workerd's C++ server over kj's sockets.
	expect(
		parseAddressInUse(
			"kj/async-io-unix.c++:1: failed: Address already in use; toString() = 127.0.0.1:8787; stack: 7ff6a1b2c3d4\n"
		)
	).toEqual({ address: "127.0.0.1:8787" });
	// Other bind failures are not address-in-use.
	expect(
		parseAddressInUse(
			'Socket "entry": bind(): Permission denied (os error 13)\n'
		)
	).toBeUndefined();
});

/**
 * What workerd logs when a Worker's `fetch()` fails its TLS handshake, such as
 * for a certificate a VPN or proxy re-signed. The Worker only sees
 * `internal error; reference = <wdErrId>`, so this log is the one place that
 * says why (https://github.com/cloudflare/workers-sdk/issues/9356).
 *
 * kj writes the exception's `stack:` as `<path>@<offset>` frames on Linux,
 * where workerd's executable is mapped high, and as raw hex addresses on macOS
 * (and on Windows, which has no `dladdr()`).
 */
function tlsHandshakeFailure(stack: string) {
	return structured(
		"error",
		`e = rust/worker/ffi.rs:110: failed: TLS handshake failed: invalid peer certificate: UnknownIssuer\nstack: ${stack}; sentryErrorContext = jsgInternalError; wdErrId = j1mkn3la492n92gkmm3q6mua`
	);
}

test.for([
	[
		"Linux",
		"/project/node_modules/@cloudflare/workerd-linux-64/bin/workerd@2ab2070 /project/node_modules/@cloudflare/workerd-linux-64/bin/workerd@3ed9780 /project/node_modules/@cloudflare/workerd-linux-64/bin/workerd@3a86610",
	],
	["macOS", "1048a2b3c 1048a5f10 104c1e2d8"],
	["Windows", "7ff6a1b2c3d4 7ff6a1b2c3d5 7ff6a1b2c3d6"],
])(
	"the cause of a Worker's internal error is surfaced with a %s stack trace",
	async ([, stack], { expect }) => {
		expect(await collect([tlsHandshakeFailure(stack)])).toContainEqual({
			level: "error",
			message: expect.stringContaining(
				"TLS handshake failed: invalid peer certificate: UnknownIssuer"
			),
		});
	}
);

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
