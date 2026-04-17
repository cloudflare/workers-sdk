import {
	listMTlsCertificates,
	uploadMTlsCertificateFromFs,
} from "../../api/mtls-certificate";
import { prompt } from "../../dialogs";
import { logger } from "../../logger";
import { ProvisionResourceHandler } from "./index";
import type { Binding } from "../../api/startDevWorker/types";
import type {
	NormalisedResourceInfo,
	ProvisionableBinding,
	Settings,
} from "./index";
import type { Config } from "@cloudflare/workers-utils";

type MtlsCertificateBinding = Extract<Binding, { type: "mtls_certificate" }>;

export class MtlsCertificateHandler extends ProvisionResourceHandler<
	"mtls_certificate",
	MtlsCertificateBinding
> {
	static readonly bindingType = "mtls_certificate";
	static readonly friendlyName = "mTLS Certificate";

	static async load(
		config: Config,
		accountId: string
	): Promise<NormalisedResourceInfo[]> {
		const preExisting = await listMTlsCertificates(config, accountId, {});
		return preExisting.map((c) => ({ title: c.name ?? c.id, value: c.id }));
	}

	static create(
		bindingName: string,
		binding: ProvisionableBinding,
		config: Config,
		accountId: string
	) {
		return new MtlsCertificateHandler(
			bindingName,
			binding as MtlsCertificateBinding,
			config,
			accountId
		);
	}

	private certPath?: string;
	private keyPath?: string;

	get name(): string | undefined {
		return undefined;
	}
	async create(name: string) {
		if (!this.certPath || !this.keyPath) {
			throw new Error(
				"Cannot upload mTLS certificate without cert and key file paths. Use interactive mode."
			);
		}
		const result = await uploadMTlsCertificateFromFs(
			this.config,
			this.accountId,
			{
				certificateChainFilename: this.certPath,
				privateKeyFilename: this.keyPath,
				name,
			}
		);
		return result.id;
	}
	constructor(
		bindingName: string,
		binding: MtlsCertificateBinding,
		config: Config,
		accountId: string
	) {
		super(
			"mtls_certificate",
			bindingName,
			binding,
			"certificate_id",
			config,
			accountId
		);
	}

	canInherit(settings: Settings | undefined): boolean {
		return !!settings?.bindings.find(
			(existing) =>
				existing.type === this.type && existing.name === this.bindingName
		);
	}

	isFullySpecified(): boolean {
		return !!this.binding.certificate_id;
	}

	get ciSafe(): boolean {
		return false;
	}
	get provisioningHint(): string {
		return "Run `wrangler mtls-certificate upload --cert <path> --key <path>` and set certificate_id in your config. Or set certificate_id to an existing certificate.";
	}

	override async interactiveCreate(name: string): Promise<void> {
		this.certPath = await prompt(
			"Enter path to the certificate chain (.pem) file:",
			{}
		);
		this.keyPath = await prompt("Enter path to the private key file:", {});

		logger.log(`🌀 Uploading mTLS certificate "${name}"...`);
		await this.provision(name);
	}
}
