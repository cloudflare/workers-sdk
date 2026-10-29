import net from "node:net";
import { UserError } from "@cloudflare/workers-utils";

export function validateResolverIps(resolverIps: string): string[] {
	const ips = resolverIps.split(",").map((ip) => ip.trim());
	const nonEmpty = ips.filter((ip) => ip.length > 0);

	if (nonEmpty.length === 0) {
		throw new UserError(
			"--resolver-ips must not be empty. Provide at least one valid IPv4 or IPv6 address."
		);
	}

	const invalid = nonEmpty.filter((ip) => !net.isIPv4(ip) && !net.isIPv6(ip));
	if (invalid.length > 0) {
		throw new UserError(
			`Invalid resolver IP address(es): ${invalid.map((ip) => `'${ip}'`).join(", ")}. Provide valid IPv4 or IPv6 addresses.`
		);
	}

	return nonEmpty;
}
