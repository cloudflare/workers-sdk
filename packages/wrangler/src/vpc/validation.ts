import net from "node:net";
import { UserError } from "@cloudflare/workers-utils";
import { ServiceType } from "./index";
import type {
	CertVerificationMode,
	ConnectivityServiceRequest,
	ServiceHost,
} from "./index";

export interface ServiceArgs {
	name: string;
	type: ServiceType;
	tcpPort?: number;
	appProtocol?: string;
	httpPort?: number;
	httpsPort?: number;
	ipv4?: string;
	ipv6?: string;
	hostname?: string;
	tunnelId: string;
	resolverIps?: string;
	certVerificationMode?: string;
}

export function validateHostname(hostname: string): void {
	const trimmed = hostname.trim();

	if (trimmed.length === 0) {
		throw new UserError("Hostname cannot be empty.");
	}

	const errors: string[] = [];

	if (trimmed.length > 253) {
		errors.push("Hostname is too long. Maximum length is 253 characters.");
	}

	const hasScheme = trimmed.includes("://");
	if (hasScheme) {
		errors.push(
			"Hostname must not include a URL scheme (e.g., remove 'https://')."
		);
	}

	const afterScheme = hasScheme
		? trimmed.slice(trimmed.indexOf("://") + 3)
		: trimmed;
	if (afterScheme.includes("/")) {
		errors.push(
			"Hostname must not include a path. Provide only the hostname (e.g., 'api.example.com')."
		);
	}

	// Check for bare IP addresses using Node.js built-in validation
	const bareValue = trimmed.replace(/^\[|\]$/g, "");
	const isIpAddress = net.isIPv4(trimmed) || net.isIPv6(bareValue);
	if (isIpAddress) {
		errors.push(
			"Hostname must not be an IP address. Use --ipv4 or --ipv6 instead."
		);
	}

	// Only check for port numbers when the colon isn't already explained by
	// an IPv6 address or a URL scheme, to avoid misleading error messages.
	if (!isIpAddress && !hasScheme && trimmed.includes(":")) {
		errors.push(
			"Hostname must not include a port number. Provide only the hostname and use --http-port or --https-port for ports."
		);
	}

	if (/\s/.test(trimmed)) {
		errors.push("Hostname must not contain whitespace.");
	}

	if (errors.length > 0) {
		throw new UserError(
			`Invalid hostname '${trimmed}':\n${errors.map((e) => `  - ${e}`).join("\n")}`
		);
	}
}

/**
 * For TCP services, extract a port number from a "host:port" hostname if present.
 * Uses the URL class to reliably parse the host and port, which correctly
 * handles IPv6 addresses, bracketed notation, and edge cases.
 *
 * Returns the hostname with the port stripped and the extracted port number,
 * or the original hostname and undefined if no port suffix was found.
 */
export function extractPortFromHostname(hostname: string): {
	hostname: string;
	port: number | undefined;
} {
	try {
		// Use a dummy scheme so the URL constructor can parse "host:port"
		const url = new URL(`tcp://${hostname}`);
		if (url.port === "") {
			return { hostname, port: undefined };
		}
		const port = parseInt(url.port, 10);
		if (port < 1) {
			return { hostname, port: undefined };
		}
		return { hostname: url.hostname, port };
	} catch {
		return { hostname, port: undefined };
	}
}

/**
 * Convert yargs-style command args into ServiceArgs, applying
 * hostname:port resolution for TCP services so that
 * `--hostname db.internal:5432` is equivalent to
 * `--hostname db.internal --tcp-port 5432`.
 */
export function toServiceArgs(args: {
	name: string;
	type: string;
	tcpPort?: number;
	appProtocol?: string;
	httpPort?: number;
	httpsPort?: number;
	ipv4?: string;
	ipv6?: string;
	hostname?: string;
	tunnelId: string;
	resolverIps?: string;
	certVerificationMode?: string;
}): ServiceArgs {
	const type = args.type as ServiceType;
	let { hostname } = args;
	let tcpPort = args.tcpPort;

	if (type === ServiceType.Tcp && hostname) {
		const extracted = extractPortFromHostname(hostname);
		if (extracted.port !== undefined) {
			if (tcpPort && tcpPort !== extracted.port) {
				throw new UserError(
					`Conflicting TCP port: --hostname includes port ${extracted.port} but --tcp-port is ${tcpPort}. Provide the port in one place only.`
				);
			}
			hostname = extracted.hostname;
			tcpPort = extracted.port;
		}
	}

	return {
		name: args.name,
		type,
		tcpPort,
		appProtocol: args.appProtocol,
		httpPort: args.httpPort,
		httpsPort: args.httpsPort,
		ipv4: args.ipv4,
		ipv6: args.ipv6,
		hostname,
		tunnelId: args.tunnelId,
		resolverIps: args.resolverIps,
		certVerificationMode: args.certVerificationMode,
	};
}

export function validateRequest(args: ServiceArgs) {
	// Validate host configuration - must have either IP addresses or hostname, not both
	const hasIpAddresses = Boolean(args.ipv4 || args.ipv6);
	const hasHostname = Boolean(args.hostname);

	if (!hasIpAddresses && !hasHostname) {
		throw new UserError(
			"Must specify either IP addresses (--ipv4/--ipv6) or hostname (--hostname)"
		);
	}

	if (args.ipv4 && !net.isIPv4(args.ipv4)) {
		throw new UserError(
			`Invalid IPv4 address: '${args.ipv4}'. Provide a valid IPv4 address (e.g., '192.168.1.1').`
		);
	}

	if (args.ipv6 && !net.isIPv6(args.ipv6)) {
		throw new UserError(
			`Invalid IPv6 address: '${args.ipv6}'. Provide a valid IPv6 address (e.g., '2001:db8::1').`
		);
	}

	if (hasHostname && args.hostname) {
		validateHostname(args.hostname);
	}

	if (args.resolverIps) {
		const ips = args.resolverIps.split(",").map((ip) => ip.trim());
		const invalidIps = ips.filter(
			(ip) => ip.length > 0 && !net.isIPv4(ip) && !net.isIPv6(ip)
		);
		if (invalidIps.length > 0) {
			throw new UserError(
				`Invalid resolver IP address(es): ${invalidIps.map((ip) => `'${ip}'`).join(", ")}. Provide valid IPv4 or IPv6 addresses.`
			);
		}
	}

	// Validate TCP services require a port
	if (args.type === ServiceType.Tcp && !args.tcpPort) {
		throw new UserError("TCP services require a --tcp-port to be specified");
	}
}

export function buildRequest(args: ServiceArgs): ConnectivityServiceRequest {
	// Parse resolver IPs if provided
	let resolverIpsList: string[] | undefined = undefined;
	if (args.resolverIps) {
		resolverIpsList = args.resolverIps
			.split(",")
			.map((ip) => ip.trim())
			.filter((ip) => ip.length > 0);
	}

	// Build the host configuration
	const host: ServiceHost = {
		ipv4: args.ipv4,
		ipv6: args.ipv6,
		hostname: args.hostname,
	};

	if (args.hostname) {
		host.resolver_network = {
			tunnel_id: args.tunnelId,
			...(resolverIpsList && { resolver_ips: resolverIpsList }),
		};
	} else {
		host.network = {
			tunnel_id: args.tunnelId,
		};
	}

	// Build the complete request
	const request: ConnectivityServiceRequest = {
		name: args.name,
		type: args.type,
		host,
	};

	// Add service-specific fields
	if (args.type === ServiceType.Tcp) {
		request.tcp_port = args.tcpPort;
		if (args.appProtocol) {
			request.app_protocol = args.appProtocol;
		}
	} else if (args.type === ServiceType.Http) {
		request.http_port = args.httpPort;
		request.https_port = args.httpsPort;
	}

	// Add TLS settings if specified
	if (args.certVerificationMode) {
		request.tls_settings = {
			cert_verification_mode: args.certVerificationMode as CertVerificationMode,
		};
	}

	return request;
}
