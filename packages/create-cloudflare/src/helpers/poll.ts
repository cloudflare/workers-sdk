import { blue, brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import dns2 from "dns2";
import { request } from "undici";
import { sleep } from "./common";
import type { DnsAnswer, DnsResponse } from "dns2";

const TIMEOUT = 1000 * 60 * 5;
const POLL_INTERVAL = 1000;

/*
  A helper to wait until the newly deployed domain is available.

  We do this by first polling DNS until the new domain is resolvable, and then polling
  via HTTP until we get a successful response.

  Note that when polling DNS we make queries against specific nameservers to avoid negative
  caching. Similarly, we poll via HTTP using the 'no-cache' header for the same reason.
*/
export const poll = async (url: string): Promise<boolean> => {
	const start = Date.now();
	const domain = new URL(url).host;
	const s = spinner();

	s.start("Waiting for DNS to propagate");

	// Start out by sleeping for 10 seconds since it's unlikely DNS changes will
	// have propogated before then
	await sleep(10 * 1000);

	await pollDns(domain, start, s);
	if (await pollHttp(url, start, s)) return true;

	s.stop(
		`${brandColor(
			"timed out"
		)} while waiting for ${url} - try accessing it in a few minutes.`
	);
	return false;
};

const pollDns = async (
	domain: string,
	start: number,
	s: ReturnType<typeof spinner>
) => {
	while (Date.now() - start < TIMEOUT) {
		s.update(`Waiting for DNS to propagate (${secondsSince(start)}s)`);
		if (await isDomainResolvable(domain)) {
			s.stop(`${brandColor("DNS propagation")} ${dim("complete")}.`);
			return;
		}
		await sleep(POLL_INTERVAL);
	}
};

const pollHttp = async (
	url: string,
	start: number,
	s: ReturnType<typeof spinner>
) => {
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
};

// Determines if the domain is resolvable via DNS. Until this condition is true,
// any HTTP requests will result in an NXDOMAIN error.
export const isDomainResolvable = async (domain: string) => {
	try {
		const nameServers = await lookupSubdomainNameservers(domain);

		// If the subdomain nameservers aren't resolvable yet, keep polling
		if (nameServers.length === 0) return false;

		// Once they are resolvable, query these nameservers for the domain's 'A' record
		const dns = new dns2({ nameServers });
		const res = await dns.resolve(domain, "A");
		return res.answers.length > 0;
	} catch (error) {
		return false;
	}
};

// Looks up the nameservers that are responsible for this particular domain
export const lookupSubdomainNameservers = async (domain: string) => {
	const nameServers = await lookupDomainLevelNameservers(domain);
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

// Looks up the nameservers responsible for handling `pages.dev` or `workers.dev` domains
export const lookupDomainLevelNameservers = async (domain: string) => {
	// Get the last 2 parts of the domain (ie. `pages.dev` or `workers.dev`)
	const baseDomain = domain.split(".").slice(-2).join(".");

	const dns = new dns2({});
	const nameservers = await dns.resolve(baseDomain, "NS");
	return (nameservers.answers as DnsAnswer[]).map((n) => n.ns);
};

function secondsSince(start: number): number {
	return Math.round((Date.now() - start) / 1000);
}
