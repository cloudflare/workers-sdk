import assert from "node:assert";
import { z } from "zod";
import { ProxyNodeBinding } from "../shared";
import type { Worker_Binding } from "../../runtime";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

export const HYPERDRIVE_PLUGIN_NAME = "hyperdrive";

function hasPostgresProtocol(url: URL) {
	return url.protocol === "postgresql:" || url.protocol === "postgres:";
}

function hasMysqlProtocol(url: URL) {
	return url.protocol === "mysql:";
}

function getPort(url: URL) {
	if (url.port !== "") return url.port;
	if (hasPostgresProtocol(url)) return "5432";
	if (hasMysqlProtocol(url)) return "3306";
	// Validated in `HyperdriveSchema`
	assert.fail(`Expected known protocol, got ${url.protocol}`);
}

export const HyperdriveSchema = z
	.union([z.url(), z.instanceof(URL)])
	.transform((url, ctx) => {
		if (typeof url === "string") url = new URL(url);
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

// A Hyperdrive entry is either the legacy plain connection string (local dev),
// or an object that additionally carries a `remoteProxyConnectionString`, opting
// the binding into remote-bindings mode: `connect()` traffic is tunnelled through
// the shared remote-proxy-client service to the edge Hyperdrive binding.
const HyperdriveEntrySchema = z.union([
	HyperdriveSchema,
	z.object({
		localConnectionString: HyperdriveSchema.optional(),
		remoteProxyConnectionString: z
			.custom<RemoteProxyConnectionString>()
			.optional(),
	}),
]);

// Placeholder connection string used to synthesise the local Hyperdrive binding
// when a remote binding has no local connection string. workerd still needs a
// scheme/database/user/password to build the magic `connectionString` it exposes
// to the Worker; the real origin lives at the edge. In normal `wrangler dev`
// usage the caller seeds `localConnectionString` with the edge session's
// credentials before this runs (so a database client authenticates through the
// proxy), and this placeholder is only reached when no seeding has occurred.
const REMOTE_PLACEHOLDER_URL = new URL(
	"mysql://user:password@hyperdrive.local:3306/database"
);

type NormalizedHyperdrive = {
	url: URL;
	remoteProxyConnectionString?: RemoteProxyConnectionString;
};

function normalizeHyperdriveEntry(
	value: z.infer<typeof HyperdriveEntrySchema>
): NormalizedHyperdrive {
	if (value instanceof URL) {
		return { url: value };
	}
	return {
		url: value.localConnectionString ?? REMOTE_PLACEHOLDER_URL,
		remoteProxyConnectionString: value.remoteProxyConnectionString,
	};
}

export const HyperdriveInputOptionsSchema = z.object({
	hyperdrives: z.record(z.string(), HyperdriveEntrySchema).optional(),
});

export const HYPERDRIVE_PLUGIN: Plugin<typeof HyperdriveInputOptionsSchema> = {
	options: HyperdriveInputOptionsSchema,
	bindingTypeDescription: "Hyperdrive",
	getBindings(options) {
		return Object.entries(options.hyperdrives ?? {}).map<Worker_Binding>(
			([name, entry]) => {
				const { url } = normalizeHyperdriveEntry(entry);
				const database = url.pathname.replace("/", "");
				const scheme = url.protocol.replace(":", "");
				// Both local and remote bindings use the per-binding
				// `hyperdrive:<name>` external.tcp designator. For remote bindings
				// that service points at the local TCP bridge (see `getServices`),
				// which relays to the edge. workerd is unmodified either way —
				// pointing a Hyperdrive designator at a Worker service SIGSEGVs.
				const designator = { name: `${HYPERDRIVE_PLUGIN_NAME}:${name}` };
				return {
					name,
					hyperdrive: {
						designator,
						database: decodeURIComponent(database),
						user: decodeURIComponent(url.username),
						password: decodeURIComponent(url.password),
						scheme,
					},
				};
			}
		);
	},
	getNodeBindings(options) {
		return Object.fromEntries(
			Object.entries(options.hyperdrives ?? {}).map(([name, entry]) => {
				const { url } = normalizeHyperdriveEntry(entry);
				const connectionOverrides: Record<string | symbol, string | number> = {
					connectionString: `${url}`,
					port: Number.parseInt(url.port),
					host: url.hostname,
				};
				const proxyNodeBinding = new ProxyNodeBinding({
					get(target, prop) {
						return prop in connectionOverrides
							? connectionOverrides[prop]
							: target[prop];
					},
				});
				return [name, proxyNodeBinding];
			})
		);
	},
	async getServices({ options, hyperdriveProxyController }) {
		const services = [];
		for (const [name, entry] of Object.entries(options.hyperdrives ?? {})) {
			const { url, remoteProxyConnectionString } =
				normalizeHyperdriveEntry(entry);

			// Remote bindings: stand up a local TCP bridge that relays `connect()`
			// bytes to the edge Hyperdrive binding over a WebSocket, and point the
			// `hyperdrive:<name>` external.tcp designator at it. This keeps workerd
			// unmodified (the Worker-service designator path SIGSEGVs).
			if (remoteProxyConnectionString) {
				const bridgePort =
					await hyperdriveProxyController.createRemoteTcpBridge({
						name,
						remoteProxyConnectionString,
					});
				services.push({
					name: `${HYPERDRIVE_PLUGIN_NAME}:${name}`,
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
					name,
					targetHost: url.hostname,
					targetPort,
					scheme,
					sslmode,
					sslrootcert: parseSslRootCert(url),
				});
				address = `127.0.0.1:${proxyPort}`;
			}

			services.push({
				name: `${HYPERDRIVE_PLUGIN_NAME}:${name}`,
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
