import { UserError } from "@cloudflare/workers-utils";
import { prompt, select } from "../../dialogs";
import { createConfig, listConfigs } from "../../hyperdrive/client";
import { logger } from "../../logger";
import { ProvisionResourceHandler } from "./index";
import type { Binding } from "../../api/startDevWorker/types";
import type { OriginWithSecrets } from "../../hyperdrive/client";
import type {
	NormalisedResourceInfo,
	ProvisionableBinding,
	Settings,
} from "./index";
import type { Config } from "@cloudflare/workers-utils";

type HyperdriveBinding = Extract<Binding, { type: "hyperdrive" }>;

export class HyperdriveHandler extends ProvisionResourceHandler<
	"hyperdrive",
	HyperdriveBinding
> {
	static readonly bindingType = "hyperdrive";
	static readonly friendlyName = "Hyperdrive Config";

	static async load(
		config: Config,
		_accountId: string
	): Promise<NormalisedResourceInfo[]> {
		const preExisting = await listConfigs(config);
		return preExisting.map((hd) => ({ title: hd.name, value: hd.id }));
	}

	static create(
		bindingName: string,
		binding: ProvisionableBinding,
		config: Config,
		accountId: string
	) {
		return new HyperdriveHandler(
			bindingName,
			binding as HyperdriveBinding,
			config,
			accountId
		);
	}

	private origin?: OriginWithSecrets;

	get name(): string | undefined {
		return undefined;
	}
	async create(name: string) {
		if (!this.origin) {
			throw new UserError(
				"Cannot create Hyperdrive config without connection details. Use interactive mode."
			);
		}
		const config = await createConfig(this.config, {
			name,
			origin: this.origin,
		});
		return config.id;
	}
	constructor(
		bindingName: string,
		binding: HyperdriveBinding,
		config: Config,
		accountId: string
	) {
		super("hyperdrive", bindingName, binding, "id", config, accountId);
	}

	canInherit(settings: Settings | undefined): boolean {
		return !!settings?.bindings.find(
			(existing) =>
				existing.type === this.type && existing.name === this.bindingName
		);
	}

	isFullySpecified(): boolean {
		return !!this.binding.id;
	}

	get ciSafe(): boolean {
		return false;
	}
	get provisioningHint(): string {
		return "Run `wrangler hyperdrive create <name> --connection-string <postgres://user:password@host:port/db>` and set the returned id in your config. Or set id to an existing Hyperdrive config.";
	}

	override async interactiveCreate(name: string): Promise<void> {
		const connectionMethod = await select(
			`How does your database connect for Hyperdrive config "${name}"?`,
			{
				choices: [
					{
						title: "Connection string",
						value: "connection-string",
					},
					{
						title: "Host and port",
						value: "host-port",
					},
					{
						title: "Hyperdrive over Access",
						value: "access",
					},
					{
						title: "VPC Service",
						value: "vpc",
					},
				],
				defaultOption: 0,
			}
		);

		if (connectionMethod === "connection-string") {
			const connStr = await prompt(
				"Enter your database connection string (e.g. postgres://user:password@host:port/database):",
				{}
			);
			this.origin = parseConnectionString(connStr);
		} else if (connectionMethod === "host-port") {
			this.origin = await promptHostPort();
		} else if (connectionMethod === "access") {
			this.origin = await promptAccess();
		} else {
			this.origin = await promptVpc();
		}

		logger.log(`🌀 Creating Hyperdrive config "${name}"...`);
		await this.provision(name);
	}
}

function parseConnectionString(connStr: string): OriginWithSecrets {
	let url: URL;
	try {
		url = new URL(connStr);
	} catch {
		throw new UserError(
			`Invalid connection string: "${connStr}". Expected format: protocol://user:password@host:port/database`
		);
	}

	const protocol = url.protocol.toLowerCase();
	if (
		!protocol.startsWith("postgresql") &&
		!protocol.startsWith("postgres") &&
		!protocol.startsWith("mysql")
	) {
		throw new UserError(
			`Unsupported protocol "${protocol}". Must be postgresql, postgres, or mysql.`
		);
	}

	if (!url.hostname) {
		throw new UserError("Connection string must include a hostname.");
	}
	if (!url.username) {
		throw new UserError("Connection string must include a username.");
	}
	if (!url.password) {
		throw new UserError("Connection string must include a password.");
	}

	let port = url.port;
	if (!port) {
		if (protocol.startsWith("postgres")) {
			port = "5432";
		} else if (protocol.startsWith("mysql")) {
			port = "3306";
		}
	}

	if (!port) {
		throw new UserError("Connection string must include a port.");
	}

	const database = decodeURIComponent(url.pathname).replace(/^\//, "");
	if (!database) {
		throw new UserError("Connection string must include a database name.");
	}

	return {
		scheme: url.protocol.replace(/:$/, ""),
		host: url.hostname,
		port: parseInt(port, 10),
		database,
		user: decodeURIComponent(url.username),
		password: decodeURIComponent(url.password),
	};
}

async function promptHostPort(): Promise<OriginWithSecrets> {
	const scheme = await select("Select database protocol:", {
		choices: [
			{ title: "PostgreSQL", value: "postgresql" },
			{ title: "MySQL", value: "mysql" },
		],
		defaultOption: 0,
	});
	const host = await prompt("Enter database host:", {});
	const portStr = await prompt("Enter database port:", {
		defaultValue: scheme === "postgresql" ? "5432" : "3306",
	});
	const database = await prompt("Enter database name:", {});
	const user = await prompt("Enter database user:", {});
	const password = await prompt("Enter database password:", {
		isSecret: true,
	});

	return {
		scheme,
		host,
		port: parseInt(portStr, 10),
		database,
		user,
		password,
	};
}

async function promptAccess(): Promise<OriginWithSecrets> {
	const scheme = await select("Select database protocol:", {
		choices: [
			{ title: "PostgreSQL", value: "postgresql" },
			{ title: "MySQL", value: "mysql" },
		],
		defaultOption: 0,
	});
	const host = await prompt("Enter database host:", {});
	const accessClientId = await prompt("Enter Access Client ID:", {});
	const accessClientSecret = await prompt("Enter Access Client Secret:", {
		isSecret: true,
	});
	const database = await prompt("Enter database name:", {});
	const user = await prompt("Enter database user:", {});
	const password = await prompt("Enter database password:", {
		isSecret: true,
	});

	return {
		scheme,
		host,
		access_client_id: accessClientId,
		access_client_secret: accessClientSecret,
		database,
		user,
		password,
	};
}

async function promptVpc(): Promise<OriginWithSecrets> {
	const scheme = await select("Select database protocol:", {
		choices: [
			{ title: "PostgreSQL", value: "postgresql" },
			{ title: "MySQL", value: "mysql" },
		],
		defaultOption: 0,
	});
	const serviceId = await prompt("Enter VPC Service ID:", {});
	const database = await prompt("Enter database name:", {});
	const user = await prompt("Enter database user:", {});
	const password = await prompt("Enter database password:", {
		isSecret: true,
	});

	return {
		scheme,
		service_id: serviceId,
		database,
		user,
		password,
	};
}
