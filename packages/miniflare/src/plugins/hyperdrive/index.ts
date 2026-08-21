import assert from "node:assert";
import { z } from "zod";
import {
	getEnvBindingsOfType,
	getRemoteProxyConnectionString,
	ProxyNodeBinding,
} from "../shared";
import type { ParsedDevConfig } from "../../config/schema";
import type { Worker_Binding } from "../../runtime";
import type { ParsedMiniflareWorkerConfig } from "../shared";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

export const HYPERDRIVE_PLUGIN_NAME = "hyperdrive";

/**
 * Service (and proxy/bridge) name for a Hyperdrive binding.
 *
 * Namespaced by worker as well as binding name: in a multi-worker setup it is
 * common for several workers to bind Hyperdrive under the same name (`DB`), and
 * an unqualified name would make them collide on one service and one bridge.
 */
export function getHyperdriveServiceName(
	workerIndex: number,
	bindingName: string
) {
	return `${HYPERDRIVE_PLUGIN_NAME}:${workerIndex}:${bindingName}`;
}

// Placeholder connection string used to synthesise the local Hyperdrive binding
// when a remote binding has no local connection string. workerd still needs a
// scheme/database/user/password to build the magic `connectionString` it exposes
// to the Worker; the real origin lives at the edge. In normal `wrangler dev`
// usage the caller seeds `dev.connectionString` with the edge session's
// credentials before this runs (so a database client authenticates through the
// proxy), and this placeholder is only reached when no seeding has occurred.
const REMOTE_PLACEHOLDER_URL = new URL(
	"mysql://user:password@hyperdrive.local:3306/database"
);

/**
 * Resolves `hyperdrive` env bindings, parsing each connection string.
 *
 * A binding with `dev.remote: true` (and a remote proxy session) is reached
 * through a local TCP bridge relaying to the edge, so it may omit
 * `dev.connectionString` — the placeholder above stands in when it does.
 */
function getHyperdrives(
	config: ParsedMiniflareWorkerConfig,
	dev: ParsedDevConfig | undefined
): [
	name: string,
	url: URL,
	remoteProxyConnectionString: RemoteProxyConnectionString | undefined,
][] {
	return getEnvBindingsOfType(config, "hyperdrive").map(([name, binding]) => {
		const remoteProxyConnectionString = getRemoteProxyConnectionString(
			binding,
			dev
		);
		const url =
			remoteProxyConnectionString && binding.dev.connectionString === undefined
				? REMOTE_PLACEHOLDER_URL
				: HyperdriveSchema.parse(binding.dev.connectionString);
		return [name, url, remoteProxyConnectionString];
	});
}

function hasPostgresProtocol(url: URL) {
	return url.protocol === "postgresql:" || url.protocol === "postgres:";
}

function hasMysqlProtocol(url: URL) {
	return url.protocol === "mysql:";
}

function getPort(url: URL) {
	if (url.port !== "") {
		return url.port;
	}
	if (hasPostgresProtocol(url)) {
		return "5432";
	}
	if (hasMysqlProtocol(url)) {
		return "3306";
	}
	// Validated in `HyperdriveSchema`
	assert.fail(`Expected known protocol, got ${url.protocol}`);
}

// TODO: upstream this to cloudflare/config
export const HyperdriveSchema = z
	.union([z.url(), z.instanceof(URL)])
	.transform((url, ctx) => {
		if (typeof url === "string") {
			url = new URL(url);
		}
		if (url.protocol === "") {
			ctx.addIssue({
				code: "custom",
				message:
					"You must specify the database protocol - e.g. 'postgresql'/'mysql'.",
			});
		} else if (!hasPostgresProtocol(url) && !hasMysqlProtocol(url)) {
			ctx.addIssue({
				code: "custom",
				message:
					"Only PostgreSQL-compatible or MySQL-compatible databases are currently supported.",
			});
		}
		if (url.host === "") {
			ctx.addIssue({
				code: "custom",
				message:
					"You must provide a hostname or IP address in your connection string - e.g. 'user:password@database-hostname.example.com:5432/databasename",
			});
		}
		if (url.pathname === "") {
			ctx.addIssue({
				code: "custom",
				message:
					"You must provide a database name as the path component - e.g. /postgres",
			});
		}
		if (url.username === "") {
			ctx.addIssue({
				code: "custom",
				message:
					"You must provide a username - e.g. 'user:password@database.example.com:port/databasename'",
			});
		}
		if (url.password === "") {
			ctx.addIssue({
				code: "custom",
				message:
					"You must provide a password - e.g. 'user:password@database.example.com:port/databasename' ",
			});
		}

		return url;
	});

export const HYPERDRIVE_PLUGIN: Plugin = {
	bindingTypeDescription: "Hyperdrive",
	getBindings(options, _sharedOptions, workerIndex) {
		return getHyperdrives(options.config, options.dev).map<Worker_Binding>(
			([name, url]) => {
				const database = url.pathname.replace("/", "");
				const scheme = url.protocol.replace(":", "");
				return {
					name,
					hyperdrive: {
						// Both local and remote bindings use the per-binding
						// `hyperdrive:<name>` external.tcp designator. For remote bindings
						// that service points at the local TCP bridge (see `getServices`),
						// which relays to the edge. workerd is unmodified either way —
						// pointing a Hyperdrive designator at a Worker service SIGSEGVs.
						designator: {
							name: getHyperdriveServiceName(workerIndex, name),
						},
						database: decodeURIComponent(database),
						user: decodeURIComponent(url.username),
						password: decodeURIComponent(url.password),
						scheme,
					},
				};
			}
		);
	},
	getNodeBindings(options, { hyperdriveProxyController, workerIndex }) {
		return Object.fromEntries(
			getHyperdrives(options.config, options.dev).map(
				([name, url, remoteProxyConnectionString]) => {
					// A remote binding's connection string points at a
					// `*.hyperdrive.local` host, which only resolves inside workerd via
					// the binding's designator. Node has no such resolver, so hand it the
					// local TCP bridge instead — same credentials, an address it can dial.
					const bridgePort = remoteProxyConnectionString
						? hyperdriveProxyController.getRemoteBridgePort(
								getHyperdriveServiceName(workerIndex, name)
							)
						: undefined;
					const nodeUrl = new URL(url);
					if (bridgePort !== undefined) {
						nodeUrl.hostname = "127.0.0.1";
						nodeUrl.port = String(bridgePort);
					}
					const connectionOverrides: Record<string | symbol, string | number> =
						{
							connectionString: `${nodeUrl}`,
							port: Number.parseInt(nodeUrl.port),
							host: nodeUrl.hostname,
						};
					const proxyNodeBinding = new ProxyNodeBinding({
						get(target, prop) {
							return prop in connectionOverrides
								? connectionOverrides[prop]
								: target[prop];
						},
					});
					return [name, proxyNodeBinding];
				}
			)
		);
	},
	async getServices({ options, workerIndex, hyperdriveProxyController }) {
		const services = [];
		for (const [name, url, remoteProxyConnectionString] of getHyperdrives(
			options.config,
			options.dev
		)) {
			// Remote bindings: stand up a local TCP bridge that relays `connect()`
			// bytes to the edge Hyperdrive binding over a WebSocket, and point the
			// `hyperdrive:<name>` external.tcp designator at it. This keeps workerd
			// unmodified (the Worker-service designator path SIGSEGVs).
			if (remoteProxyConnectionString) {
				const bridgePort =
					await hyperdriveProxyController.createRemoteTcpBridge({
						name: getHyperdriveServiceName(workerIndex, name),
						bindingName: name,
						remoteProxyConnectionString,
					});
				services.push({
					name: getHyperdriveServiceName(workerIndex, name),
					external: {
						address: `127.0.0.1:${bridgePort}`,
						tcp: {},
					},
				});
				continue;
			}

			const scheme = url.protocol.replace(":", "");
			const sslmode = parseSslMode(url, scheme);
			const targetPort = getPort(url);

			let address: string;
			if (sslmode === "disable") {
				// No SSL requested (either explicitly disabled or not specified):
				// connect directly to the database without a proxy server, avoiding
				// potential issues with local proxy port binding or firewall rules
				address = `${url.hostname}:${targetPort}`;
			} else {
				// SSL modes (require, prefer) need the proxy to handle
				// TLS negotiation with the target database
				const proxyPort = await hyperdriveProxyController.createProxyServer({
					name: getHyperdriveServiceName(workerIndex, name),
					targetHost: url.hostname,
					targetPort,
					scheme,
					sslmode,
					sslrootcert: parseSslRootCert(url),
				});
				address = `127.0.0.1:${proxyPort}`;
			}

			services.push({
				name: getHyperdriveServiceName(workerIndex, name),
				external: {
					address,
					tcp: {},
				},
			});
		}
		return services;
	},
};

// Postgres sslmode docs: https://www.postgresql.org/docs/current/libpq-ssl.html
// MySQL ssl-mode docs: https://dev.mysql.com/doc/refman/8.4/en/using-encrypted-connections.html
function parseSslMode(url: URL, scheme: string): string {
	// Normalize keys/values to lowercase
	const params = Object.fromEntries(
		Array.from(url.searchParams.entries()).map(([k, v]) => [
			k.toLowerCase(),
			v.toLowerCase(),
		])
	);

	if (scheme === "postgres" || scheme === "postgresql") {
		return params["sslmode"] || "disable"; // disable is default
	} else if (scheme === "mysql") {
		// Parse different variations for mysql sslmode
		const sslmode = params["ssl-mode"] || params["ssl"] || params["sslmode"];

		// Normalize to postgres-equivalent values
		switch (sslmode) {
			case "verify_identity":
				return "verify-full";
			case "verify_ca":
				return "verify-ca";
			case "required":
			case "true":
			case "1":
				return "require";
			case "preferred":
				return "prefer";
			case "disabled":
			case "false":
			case "0":
				return "disable";
		}
	}

	// default to disable
	return "disable";
}

function parseSslRootCert(url: URL): string | undefined {
	const params = Object.fromEntries(
		Array.from(url.searchParams.entries()).map(([k, v]) => [k.toLowerCase(), v])
	);
	return params["sslrootcert"] || undefined;
}

export type {
	HyperdriveProxyController,
	HyperdriveProxyConfig,
	POSTGRES_SSL_REQUEST_PACKET,
} from "./hyperdrive-proxy";
