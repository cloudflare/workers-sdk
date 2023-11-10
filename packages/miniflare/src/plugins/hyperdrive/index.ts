import { z } from "zod";
import { Service, Worker_Binding } from "../../runtime";
import { Plugin } from "../shared";

export const HYPERDRIVE_PLUGIN_NAME = "hyperdrive";

export const HyperdriveSchema = z
	.string()
	.url()
	.transform((urlString, ctx) => {
		const url = new URL(urlString);
		if (url.protocol === "") {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "You must specify the database protocol - e.g. 'postgresql'.",
			});
		} else if (
			url.protocol !== "postgresql:" &&
			url.protocol !== "postgres:" &&
			url.protocol !== ""
		) {
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
		let port: string | undefined;
		if (
			url.port === "" &&
			(url.protocol === "postgresql:" || url.protocol == "postgres:")
		) {
			port = "5432";
		} else if (url.port !== "") {
			port = url.port;
		} else {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"You must provide a port number - e.g. 'user:password@database.example.com:port/databasename",
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
		return {
			database: url.pathname.replace("/", ""),
			user: url.username,
			password: decodeIfURLEncoded(url.password),
			scheme: url.protocol.replace(":", ""),
			host: url.hostname,
			port: port,
		};
	});

function decodeIfURLEncoded(str: string): string {
	try {
		return decodeURIComponent(str);
	} catch (e) {
		return str;
	}
}

export const HyperdriveInputOptionsSchema = z.object({
	hyperdrives: z.record(z.string(), HyperdriveSchema).optional(),
});

export const HYPERDRIVE_PLUGIN: Plugin<typeof HyperdriveInputOptionsSchema> = {
	options: HyperdriveInputOptionsSchema,
	getBindings(options) {
		return Object.entries(options.hyperdrives ?? {}).map<Worker_Binding>(
			([name, config]) => ({
				name,
				hyperdrive: {
					designator: {
						name: `${HYPERDRIVE_PLUGIN_NAME}:${name}`,
					},
					database: config.database,
					user: config.user,
					password: config.password,
					scheme: config.scheme,
				},
			})
		);
	},
	getNodeBindings() {
		return {};
	},
	async getServices({ options }) {
		return Object.entries(options.hyperdrives ?? {}).map<Service>(
			([name, config]) => ({
				name: `${HYPERDRIVE_PLUGIN_NAME}:${name}`,
				external: {
					address: `${config.host}:${config.port}`,
					tcp: {},
				},
			})
		);
	},
};
