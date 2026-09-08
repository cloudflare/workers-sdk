/**
 * Prevent a disconnected output consumer from terminating the CLI.
 *
 * Long-running commands such as `wrangler dev` can outlive tools that capture
 * their output. Node emits `EPIPE` on the corresponding output stream when the
 * consumer closes its pipe; without a listener, that error terminates Wrangler.
 */
export function registerOutputStreamErrorHandler(
	stream: NodeJS.WritableStream
): void {
	stream.on("error", (error: NodeJS.ErrnoException) => {
		if (error.code !== "EPIPE") {
			throw error;
		}
	});
}
