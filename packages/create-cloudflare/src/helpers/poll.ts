import { request } from "undici";

const TIMEOUT = 1000 * 60 * 5;
const POLL_INTERVAL = 2000;

export const poll = async (url: string, elapsed = 0): Promise<boolean> => {
	if (elapsed > TIMEOUT) return false;

	const start = new Date();

	try {
		const { statusCode } = await request(url);
		if (statusCode === 200) {
			return true;
		}
	} catch (err) {
		// 'Error: getaddrinfo ENOTFOUND' happens when zone isn't provisioned yet
		// handle surpressing the error and continuing to poll
	}

	await sleep(POLL_INTERVAL);

	const end = new Date();
	const dt = Number(end) - Number(start);

	return await poll(url, elapsed + dt);
};

export const sleep = async (ms: number) => {
	return new Promise((res) => setTimeout(res, ms));
};
