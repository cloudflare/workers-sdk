import dns2 from "dns2";
import { request } from "undici";
import { blue, brandColor, dim } from "./colors";
import { spinner } from "./interactive";
import type { DnsAnswer, DnsResponse } from "types";

const TIMEOUT = 1000 * 60 * 5;
const POLL_INTERVAL = 1000;

export const poll = async (url: string): Promise<boolean> => {
	const start = Date.now();
	const domain = new URL(url).host;
	const s = spinner();

	s.start("Waiting for DNS to propagate");
	await sleep(10 * 1000);

	while (Date.now() - start < TIMEOUT) {
		s.update(`Waiting for DNS to propagate (${secondsSince(start)}s)`);
		if (await isDomainAvailable(domain)) {
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

export const isDomainAvailable = async (domain: string) => {
	try {
		const nameServers = await lookupAuthoritativeServers(domain);
		if (nameServers.length === 0) return false;

		const dns = new dns2({ nameServers });
		const res = await dns.resolve(domain, "A");
		return res.answers.length > 0;
	} catch (error) {
		return false;
	}
};

// Looks up the nameservers that are responsible for this particular domain
export const lookupAuthoritativeServers = async (domain: string) => {
	const nameServers = await lookupRootNameservers(domain);
	const dns = new dns2({ nameServers });
	const res = (await dns.resolve(domain, "NS")) as DnsResponse;

	return (
		res.authorities
			// Filter out non-authoritative authorities (ones that don't have an 'ns' property)
			.filter((r) => Boolean(r.ns))
			// Return only the hostnames of the authoritative servers
			.map((r) => r.ns)
	);
};

// Looks up the nameservers responsible for handling `pages.dev` domains
export const lookupRootNameservers = async (domain: string) => {
	// `pages.dev` or `workers.dev`
	const baseDomain = domain.split(".").slice(-2).join(".");

	const dns = new dns2({});
	const nameservers = await dns.resolve(baseDomain, "NS");
	return (nameservers.answers as DnsAnswer[]).map((n) => n.ns);
};

async function sleep(ms: number) {
	return new Promise((res) => setTimeout(res, ms));
}

function secondsSince(start: number): number {
	return Math.round((Date.now() - start) / 1000);
}
