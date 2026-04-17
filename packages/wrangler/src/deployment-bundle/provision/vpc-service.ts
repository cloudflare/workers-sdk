import { prompt, select } from "../../dialogs";
import { logger } from "../../logger";
import { createService, listServices } from "../../vpc/client";
import { ServiceType } from "../../vpc/index";
import { ProvisionResourceHandler } from "./index";
import type { Binding } from "../../api/startDevWorker/types";
import type { ConnectivityServiceRequest } from "../../vpc/index";
import type {
	NormalisedResourceInfo,
	ProvisionableBinding,
	Settings,
} from "./index";
import type { Config } from "@cloudflare/workers-utils";

type VpcServiceBinding = Extract<Binding, { type: "vpc_service" }>;

export class VpcServiceHandler extends ProvisionResourceHandler<
	"vpc_service",
	VpcServiceBinding
> {
	static readonly bindingType = "vpc_service";
	static readonly friendlyName = "VPC Service";

	static async load(
		config: Config,
		_accountId: string
	): Promise<NormalisedResourceInfo[]> {
		const preExisting = await listServices(config);
		return preExisting.map((s) => ({ title: s.name, value: s.service_id }));
	}

	static create(
		bindingName: string,
		binding: ProvisionableBinding,
		config: Config,
		accountId: string
	) {
		return new VpcServiceHandler(
			bindingName,
			binding as VpcServiceBinding,
			config,
			accountId
		);
	}

	private serviceRequest?: ConnectivityServiceRequest;

	get name(): string | undefined {
		return undefined;
	}
	async create(name: string) {
		if (!this.serviceRequest) {
			throw new Error(
				"Cannot create VPC Service without configuration. Use interactive mode."
			);
		}
		const service = await createService(this.config, {
			...this.serviceRequest,
			name,
		});
		return service.service_id;
	}
	constructor(
		bindingName: string,
		binding: VpcServiceBinding,
		config: Config,
		accountId: string
	) {
		super("vpc_service", bindingName, binding, "service_id", config, accountId);
	}

	canInherit(settings: Settings | undefined): boolean {
		return !!settings?.bindings.find(
			(existing) =>
				existing.type === this.type && existing.name === this.bindingName
		);
	}

	isFullySpecified(): boolean {
		return !!this.binding.service_id;
	}

	get ciSafe(): boolean {
		return false;
	}
	get provisioningHint(): string {
		return "Run `wrangler vpc service create <name> --type <tcp|http> --tunnel-id <uuid> ...` and set service_id in your config. Or set service_id to an existing VPC service.";
	}

	override async interactiveCreate(name: string): Promise<void> {
		const serviceType: ServiceType = (await select(
			`Select the service type for VPC Service "${name}":`,
			{
				choices: [
					{ title: "TCP", value: ServiceType.Tcp },
					{ title: "HTTP", value: ServiceType.Http },
				],
				defaultOption: 0,
			}
		)) as ServiceType;

		const tunnelId = await prompt("Enter the Cloudflare Tunnel ID:", {});

		const hostType = await select("How is the origin identified?", {
			choices: [
				{ title: "Hostname", value: "hostname" },
				{ title: "IPv4 address", value: "ipv4" },
				{ title: "IPv6 address", value: "ipv6" },
			],
			defaultOption: 0,
		});

		let host: ConnectivityServiceRequest["host"];
		if (hostType === "hostname") {
			const hostname = await prompt("Enter the origin hostname:", {});
			host = {
				hostname,
				network: { tunnel_id: tunnelId },
			};
		} else if (hostType === "ipv4") {
			const ipv4 = await prompt("Enter the origin IPv4 address:", {});
			host = {
				ipv4,
				network: { tunnel_id: tunnelId },
			};
		} else {
			const ipv6 = await prompt("Enter the origin IPv6 address:", {});
			host = {
				ipv6,
				network: { tunnel_id: tunnelId },
			};
		}

		const request: ConnectivityServiceRequest = {
			name,
			type: serviceType,
			host,
		};

		if (serviceType === ServiceType.Tcp) {
			const portStr = await prompt("Enter the TCP port:", {});
			request.tcp_port = parseInt(portStr, 10);
		} else {
			const httpPortStr = await prompt(
				"Enter the HTTP port (leave empty for none):",
				{ defaultValue: "" }
			);
			if (httpPortStr) {
				request.http_port = parseInt(httpPortStr, 10);
			}
			const httpsPortStr = await prompt(
				"Enter the HTTPS port (leave empty for none):",
				{ defaultValue: "" }
			);
			if (httpsPortStr) {
				request.https_port = parseInt(httpsPortStr, 10);
			}
		}

		this.serviceRequest = request;
		logger.log(`🌀 Creating VPC Service "${name}"...`);
		await this.provision(name);
	}
}
