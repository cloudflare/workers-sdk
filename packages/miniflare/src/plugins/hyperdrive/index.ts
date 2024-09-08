import assert from "node:assert";
import { z } from "zod";
import { Service, Worker_Binding } from "../../runtime";
import { Plugin, ProxyNodeBinding } from "../shared";

export const HYPERDRIVE_PLUGIN_NAME = "hyperdrive";

function hasPostgresProtocol(url: URL) {
	return url.protocol === "postgresql:" || url.protocol === "postgres:";
}

function getPort(url: URL) {
	if (url.port !== "") return url.port;
	if (hasPostgresProtocol(url)) return "5432";
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
				message: "You must specify the database protocol - e.g. 'postgresql'.",
			});
		} else if (!hasPostgresProtocol(url)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"Only PostgreSQL or PostgreSQL compatible databases are currently supported.",
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
	async getServices({ options }) {
		return Object.entries(options.hyperdrives ?? {}).map<Service>(
			([name, url]) => ({
				name: `${HYPERDRIVE_PLUGIN_NAME}:${name}`,
				external: {
					address: `${url.hostname}:${getPort(url)}`,
					tcp: {},
				},
			})
		);
	},
};
