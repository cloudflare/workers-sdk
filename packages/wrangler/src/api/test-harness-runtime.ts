import { UserError } from "@cloudflare/workers-utils";

// A working dispatcher delivers the ProxyWorker control request in milliseconds.
// Five seconds leaves ample startup headroom while turning Bun's ignored
// `dispatcher` option into an actionable error instead of an indefinite hang.
const BUN_PROXY_MESSAGE_TIMEOUT_MS = 5_000;

function createBunProxyMessageError(): UserError {
	return new UserError(
		"`createTestHarness()` cannot dispatch requests to your Worker under Bun, because Bun's `fetch()` ignores the undici `dispatcher` that Miniflare routes them through (https://github.com/oven-sh/bun/issues/39247). Without it, a request can reach the network instead of your Worker. `server.getWorker().getEnv()` and `getExport()` still work under Bun; run `fetch()`, `email()` and `scheduled()` dispatches using Node.js.",
		{ telemetryMessage: "test harness bun proxy request failed" }
	);
}

/**
 * Waits for Bun to deliver the control message that unlocks the test harness
 * proxy, before the harness dispatches a request through Miniflare. The message
 * travels through the same undici `dispatcher` as every dispatch, so its
 * delivery doubles as the capability check. Current Bun releases ignore that
 * option and do not deliver it. A future compatible release resolves normally;
 * until then, this throws before any request leaves the process.
 *
 * @param waitForProxyMessages Callback that reports whether the latest proxy
 * control message was delivered.
 * @param timeoutMs Maximum time to wait when running under Bun.
 * @returns A promise that resolves after the proxy control message is delivered.
 * @throws {UserError} If Bun does not deliver the proxy control message.
 */
export async function waitForBunProxyMessages(
	waitForProxyMessages: () => Promise<boolean>,
	timeoutMs = BUN_PROXY_MESSAGE_TIMEOUT_MS
): Promise<void> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	try {
		const delivered = await Promise.race([
			waitForProxyMessages(),
			new Promise<never>((_resolve, reject) => {
				timeoutId = setTimeout(() => {
					reject(createBunProxyMessageError());
				}, timeoutMs);
			}),
		]);
		if (!delivered) {
			throw createBunProxyMessageError();
		}
	} finally {
		clearTimeout(timeoutId);
	}
}
