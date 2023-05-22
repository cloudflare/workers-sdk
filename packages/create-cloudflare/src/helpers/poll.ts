import { Resolver } from "node:dns/promises";
import { request } from "undici";
import { blue, brandColor, dim } from "./colors";
import { spinner } from "./interactive";

const TIMEOUT = 1000 * 60 * 5;
const POLL_INTERVAL = 1000;

export const poll = async (url: string): Promise<boolean> => {
	const start = Date.now();
	const domain = new URL(url).host;
	const s = spinner();

	s.start("Waiting for DNS to propagate");
	while (Date.now() - start < TIMEOUT) {
		s.update(`Waiting for DNS to propagate (${secondsSince(start)}s)`);
		if (await dnsLookup(domain)) {
			s.stop(`${brandColor("DNS propagation")} ${dim("complete")}.`);
			break;
		}
		await sleep(POLL_INTERVAL);
	}

	s.start("Waiting for deployment to become available");
	while (Date.now() - start < TIMEOUT) {
		s.update(
			`Waiting for deployment to become available (${secondsSince(start)}s)`
		);
		try {
			const { statusCode } = await request(url, {
				reset: true,
				headers: { "Cache-Control": "no-cache" },
			});
			if (statusCode === 200) {
				s.stop(
					`${brandColor("deployment")} ${dim("is ready at:")} ${blue(url)}`
				);
				return true;
			}
		} catch (e) {
			// Re-throw if the error is not ENOTFOUND
			if ((e as { code: string }).code !== "ENOTFOUND") {
				throw e;
			}
		}
		await sleep(POLL_INTERVAL);
	}

	s.stop(
		`${brandColor(
			"timed out"
		)} while waiting for ${url} - try accessing it in a few minutes.`
	);
	return false;
};

async function dnsLookup(domain: string): Promise<boolean> {
	try {
		const resolver = new Resolver({ timeout: TIMEOUT, tries: 1 });
		resolver.setServers([
			"1.1.1.1",
			"1.0.0.1",
			"2606:4700:4700::1111",
			"2606:4700:4700::1001",
		]);
		return (await resolver.resolve4(domain)).length > 0;
	} catch (e) {
		return false;
	}
}

async function sleep(ms: number) {
	return new Promise((res) => setTimeout(res, ms));
}

function secondsSince(start: number): number {
	return Math.round((Date.now() - start) / 1000);
}
