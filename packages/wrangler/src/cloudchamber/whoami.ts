import { endSection, log, startSection, updateStatus } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { Config } from "../config";
import { logger } from "../logger";
import {
	CommonYargsArgvJSON,
	StrictYargsOptionsToInterfaceJSON,
} from "../yargs-types";
import {
	CompleteAccountCustomer,
	CustomerImageRegistry,
	ImageRegistriesService,
	ListSSHPublicKeys,
	SshPublicKeysService,
} from "./client";
import { promiseSpinner } from "./common";
import { loadAccount } from "./locations";

export function whoamiYargs(args: CommonYargsArgvJSON) {
	return args;
}

type AggregatedWhoamiResults =
	| PromiseFulfilledResult<CompleteAccountCustomer>
	| PromiseFulfilledResult<CustomerImageRegistry[]>
	| PromiseFulfilledResult<ListSSHPublicKeys>;

type TupleWhoamiResults = [
	PromiseFulfilledResult<CompleteAccountCustomer>,
	PromiseFulfilledResult<CustomerImageRegistry[]>,
	PromiseFulfilledResult<ListSSHPublicKeys>
];

export async function whoamiCommand(
	whoamiArgs: StrictYargsOptionsToInterfaceJSON<typeof whoamiYargs>,
	_config: Config
) {
	if (!whoamiArgs.json) startSection("Cloudchamber account");
	const results = await promiseSpinner(
		Promise.allSettled([
			loadAccount(),
			ImageRegistriesService.listImageRegistries(),
			SshPublicKeysService.listSshPublicKeys(),
		]),
		{
			json: whoamiArgs.json,
			message: "Aggregating all account related information",
		}
	);

	const settled = results.filter(
		(result): result is AggregatedWhoamiResults => result.status === "fulfilled"
	);
	if (settled.length !== results.length) {
		for (const result of results) {
			if (result.status === "rejected") {
				throw result.reason;
			}
		}
	}

	const checkedResult: TupleWhoamiResults = settled as TupleWhoamiResults;
	const information = {
		account: checkedResult[0].value,
		registries: checkedResult[1].value,
		ssh: checkedResult[2].value,
	};
	if (whoamiArgs.json) {
		logger.log(JSON.stringify(information));
		return;
	}

	const defaultConfiguration = [
		["VCPUs", information.account.defaults.vcpus],
		["Memory", information.account.defaults.memory],
	] as const;
	updateStatus(
		`${brandColor("Default configuration")}\n${defaultConfiguration
			.map(([key, value]) => `  ${key} ${dim(value.toString())}`)
			.join("\n")}`
	);

	const accountLimits = [
		[
			"Max VCPUs per deployment",
			information.account.limits.vcpu_per_deployment,
		],
		["Max VCPUs in account", information.account.limits.total_vcpu],
		[
			"Max memory per deployment",
			information.account.limits.memory_per_deployment,
		],
		["Max memory in account", information.account.limits.total_memory],
	] as const;
	updateStatus(
		`${brandColor("Account limits")}\n${accountLimits
			.map(([key, value]) => `  ${key} ${dim(value.toString())}`)
			.join("\n")}`
	);

	updateStatus(
		`${brandColor("Available locations")}\n${information.account.locations
			.map((location) => `  ${location.name}, ${location.location}`)
			.join("\n")}`
	);

	updateStatus(
		`${brandColor("Image Registries")}\n${
			information.registries.length === 0
				? `  No registries added to Cloudchamber ${dim(
						`hint: ${brandColor("wrangler cloudchamber registries configure")}`
				  )}`
				: information.registries
						.map((registry) => `  ${registry.domain}`)
						.join("\n")
		}`
	);

	updateStatus(
		`${brandColor("SSH Public Keys")}\n  ${
			information.ssh.length === 0
				? "  No ssh keys added to Cloudchamber"
				: information.ssh.map((key) => `${key.name}`).join(", ")
		}`,
		false
	);

	endSection("");
}
