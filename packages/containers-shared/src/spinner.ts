import { spinner } from "@cloudflare/cli-shared-helpers/interactive";

export async function promiseSpinner<T>(
	promise: Promise<T>,
	{
		message,
	}: {
		message: string;
	} = {
		message: "Loading",
	}
): Promise<T> {
	if (process.env.CI || !process.stdin.isTTY) {
		return promise;
	}
	const { start, stop } = spinner();
	start(message);
	const t = await promise.catch((err) => {
		stop();
		throw err;
	});
	stop();
	return t;
}
