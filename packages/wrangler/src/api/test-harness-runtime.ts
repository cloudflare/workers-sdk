import { UserError } from "@cloudflare/workers-utils";

// A working dispatcher delivers the ProxyWorker control request in milliseconds.
// Five seconds leaves ample startup headroom while turning Bun's ignored
// `dispatcher` option into an actionable error instead of an indefinite hang.
const BUN_PROXY_MESSAGE_TIMEOUT_MS = 5_000;

function createBunProxyMessageError(): UserError {
	return new UserError(
		"`createTestHarness()` could not start because Bun does not support the custom `fetch()` dispatcher required to deliver Miniflare's proxy control request. Run your tests using Node.js instead.",
		{ telemetryMessage: "test harness bun proxy request failed" }
	);
}

/**
 * Waits for Bun to deliver the control message that unlocks the test harness
 * proxy. Current Bun releases are affected by an upstream dispatcher issue and
 * do not deliver this message. A possible future compatible release can resolve
 * normally; until then, the timeout prevents requests from hanging indefinitely.
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
