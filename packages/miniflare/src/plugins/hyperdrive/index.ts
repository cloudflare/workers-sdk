import assert from "node:assert";
import * as z from "zod/v4";
import { Worker_Binding } from "../../runtime";
import { Plugin, ProxyNodeBinding } from "../shared";

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
	.union([z.string().url(), z.instanceof(URL)])
	.transform((url, ctx) => {
		if (typeof url === "string") url = new URL(url);
		if (url.protocol === "") {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"You must specify the database protocol - e.g. 'postgresql'/'mysql'.",
			});
		} else if (!hasPostgresProtocol(url) && !hasMysqlProtocol(url)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"Only PostgreSQL-compatible or MySQL-compatible databases are currently supported.",
			});
		}
		if (url.host === "") {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"You must provide a hostname or IP address in your connection string - e.g. 'user:password@database-hostname.example.com:5432/databasename",
			});
		}
		if (url.pathname === "") {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"You must provide a database name as the path component - e.g. /postgres",
			});
		}
		if (url.username === "") {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"You must provide a username - e.g. 'user:password@database.example.com:port/databasename'",
			});
		}
		if (url.password === "") {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"You must provide a password - e.g. 'user:password@database.example.com:port/databasename' ",
			});
		}

		return url;
	});

export const HyperdriveInputOptionsSchema = z.object({
	hyperdrives: z.record(z.string(), HyperdriveSchema).optional(),
});

export const HYPERDRIVE_PLUGIN: Plugin<typeof HyperdriveInputOptionsSchema> = {
	options: HyperdriveInputOptionsSchema,
	getBindings(options) {
		return Object.entries(options.hyperdrives ?? {}).map<Worker_Binding>(
			([name, url]) => {
				const database = url.pathname.replace("/", "");
				const scheme = url.protocol.replace(":", "");
				return {
					name,
					hyperdrive: {
						designator: {
							name: `${HYPERDRIVE_PLUGIN_NAME}:${name}`,
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
	getNodeBindings(options) {
		return Object.fromEntries(
			Object.entries(options.hyperdrives ?? {}).map(([name, url]) => {
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
		for (const [name, url] of Object.entries(options.hyperdrives ?? {})) {
			const scheme = url.protocol.replace(":", "");

			const proxyPort = await hyperdriveProxyController.createProxyServer({
				name,
				targetHost: url.hostname,
				targetPort: getPort(url),
				scheme,
				sslmode: parseSslMode(url, scheme),
			});
			services.push({
				name: `${HYPERDRIVE_PLUGIN_NAME}:${name}`,
				external: {
					address: `127.0.0.1:${proxyPort}`,
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

		// Normalize to postgres values
		switch (sslmode) {
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

export type {
	HyperdriveProxyController,
	HyperdriveProxyConfig,
	POSTGRES_SSL_REQUEST_PACKET,
} from "./hyperdrive-proxy";
