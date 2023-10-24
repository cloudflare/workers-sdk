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
		if (url.port === "") {
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
			password: url.password,
			scheme: url.protocol.replace(":", ""),
			host: url.host,
			port: url.port,
		};
	});

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
