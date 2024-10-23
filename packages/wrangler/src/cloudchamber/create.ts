import {
	cancel,
	endSection,
	log,
	startSection,
	status,
	updateStatus,
} from "@cloudflare/cli";
import { processArgument } from "@cloudflare/cli/args";
import { inputPrompt, spinner } from "@cloudflare/cli/interactive";
import { pollSSHKeysUntilCondition, waitForPlacement } from "./cli";
import { getLocation } from "./cli/locations";
import { AssignIPv4, DeploymentsService } from "./client";
import {
	checkEverythingIsSet,
	collectEnvironmentVariables,
	collectLabels,
	interactWithUser,
	loadAccountSpinner,
	promptForEnvironmentVariables,
	promptForLabels,
	renderDeploymentConfiguration,
	renderDeploymentMutationError,
} from "./common";
import { wrap } from "./helpers/wrap";
import { loadAccount } from "./locations";
import { getNetworkInput } from "./network/network";
import { sshPrompts as promptForSSHKeyAndGetAddedSSHKey } from "./ssh/ssh";
import type { Config } from "../config";
import type {
	CommonYargsArgvJSON,
	StrictYargsOptionsToInterfaceJSON,
} from "../yargs-types";
import type { EnvironmentVariable, Label, SSHPublicKeyID } from "./client";
import type { Arg } from "@cloudflare/cli/interactive";

export function createCommandOptionalYargs(yargs: CommonYargsArgvJSON) {
	return yargs
		.option("image", {
			requiresArg: true,
			type: "string",
			demandOption: false,
			describe: "Image to use for your deployment",
		})
		.option("location", {
			requiresArg: true,
			type: "string",
			demandOption: false,
			describe:
				"Location on Cloudflare's network where your deployment will run",
		})
		.option("var", {
			requiresArg: true,
			type: "string",
			array: true,
			demandOption: false,
			describe: "Container environment variables",
			coerce: (arg: unknown[]) => arg.map((a) => a?.toString() ?? ""),
		})
		.option("label", {
			requiresArg: true,
			type: "array",
			demandOption: false,
			describe: "Deployment labels",
			coerce: (arg: unknown[]) => arg.map((a) => a?.toString() ?? ""),
		})
		.option("all-ssh-keys", {
			requiresArg: false,
			type: "boolean",
			demandOption: false,
			describe:
				"To add all SSH keys configured on your account to be added to this deployment, set this option to true",
		})
		.option("ssh-key-id", {
			requiresArg: false,
			type: "string",
			array: true,
			demandOption: false,
			describe: "ID of the SSH key to add to the deployment",
		})
		.option("vcpu", {
			requiresArg: true,
			type: "number",
			demandOption: false,
			describe: "Number of vCPUs to allocate to this deployment.",
		})
		.option("memory", {
			requiresArg: true,
			type: "string",
			demandOption: false,
			describe:
				"Amount of memory (GB, MB...) to allocate to this deployment. Ex: 4GB.",
		})
		.option("ipv4", {
			requiresArg: false,
			type: "boolean",
			demandOption: false,
			describe: "Include an IPv4 in the deployment",
		});
}

export async function createCommand(
	args: StrictYargsOptionsToInterfaceJSON<typeof createCommandOptionalYargs>,
	config: Config
) {
	await loadAccountSpinner(args);

	const environmentVariables = collectEnvironmentVariables(
		[],
		config,
		args.var
	);
	const labels = collectLabels(args.label);
	if (!interactWithUser(args)) {
		if (config.cloudchamber.image != undefined && args.image == undefined) {
			args.image = config.cloudchamber.image;
		}
		if (
			config.cloudchamber.location != undefined &&
			args.location == undefined
		) {
			args.location = config.cloudchamber.location;
		}

		const body = checkEverythingIsSet(args, ["image", "location"]);
		const keysToAdd = args.allSshKeys
			? (await pollSSHKeysUntilCondition(() => true)).map((key) => key.id)
			: [];
		const useIpv4 = args.ipv4 ?? config.cloudchamber.ipv4;
		const network =
			useIpv4 === true ? { assign_ipv4: AssignIPv4.PREDEFINED } : undefined;
		const deployment = await DeploymentsService.createDeploymentV2({
			image: body.image,
			location: body.location,
			ssh_public_key_ids: keysToAdd,
			environment_variables: environmentVariables,
			labels: labels,
			vcpu: args.vcpu ?? config.cloudchamber.vcpu,
			memory: args.memory ?? config.cloudchamber.memory,
			network: network,
		});
		console.log(JSON.stringify(deployment, null, 4));
		return;
	}

	await handleCreateCommand(args, config, environmentVariables, labels);
}

async function askWhichSSHKeysDoTheyWantToAdd(
	args: StrictYargsOptionsToInterfaceJSON<typeof createCommandOptionalYargs>,
	key: SSHPublicKeyID | undefined
): Promise<SSHPublicKeyID[]> {
	const keyItems = await pollSSHKeysUntilCondition(() => true);
	const keys = keyItems.map((keyItem) => keyItem.id);
	if (args.allSshKeys === true) {
		return keys;
	}

	if (args.sshKeyId && args.sshKeyId.length) {
		return key ? [...args.sshKeyId, key] : args.sshKeyId;
	}

	if (keys.length === 1) {
		const yes = await inputPrompt({
			question: `Do you want to add the ssh key ${keyItems[0].name}?`,
			type: "confirm",
			helpText: "You need this to ssh into the VM",
			defaultValue: false,
			label: "",
		});
		if (yes) {
			return keys;
		}

		return [];
	}

	if (keys.length <= 1) {
		return [];
	}

	const res = await inputPrompt({
		question:
			"You have multiple ssh keys in your account, what do you want to do for this new deployment?",
		label: "",
		defaultValue: false,
		helpText: "",
		type: "select",
		options: [
			{ label: "Add all of them", value: "all" },
			{ label: "Select the keys", value: "select" },
			{ label: "Don't add any ssh keys", value: "none" },
		],
	});
	if (res === "all") {
		return keys;
	}

	if (res === "select") {
		const resKeys = await inputPrompt<string[]>({
			question: "Select the keys you want to add",
			label: "",
			defaultValue: [],
			helpText: "Select one key with the 'space' key. Submit with 'enter'",
			type: "multiselect",
			options: keyItems.map((keyOpt) => ({
				label: keyOpt.name,
				value: keyOpt.id,
			})),
			validate: (values: Arg) => {
				if (!Array.isArray(values)) {
					return "unknown error";
				}
				if (values.length === 0) {
					return "Select atleast one ssh key!";
				}

				return;
			},
		});

		return resKeys;
	}

	return [];
}

async function handleCreateCommand(
	args: StrictYargsOptionsToInterfaceJSON<typeof createCommandOptionalYargs>,
	config: Config,
	environmentVariables: EnvironmentVariable[] | undefined,
	labels: Label[] | undefined
) {
	startSection("Create a Cloudflare container", "Step 1 of 2");
	const sshKeyID = await promptForSSHKeyAndGetAddedSSHKey(args);
	const givenImage = args.image ?? config.cloudchamber.image;
	const image = await processArgument<string>({ image: givenImage }, "image", {
		question: whichImageQuestion,
		label: "image",
		validate: (value) => {
			if (typeof value !== "string") {
				return "unknown error";
			}
			if (value.length === 0) {
				return "you should fill this input";
			}
			if (value.endsWith(":latest")) {
				return "we don't allow :latest tags";
			}
		},
		defaultValue: givenImage ?? "",
		initialValue: givenImage ?? "",
		helpText: 'i.e. "docker.io/org/app:1.2", :latest tags are not allowed!',
		type: "text",
	});

	const location = await getLocation({
		location: args.location ?? config.cloudchamber.location,
	});
	const keys = await askWhichSSHKeysDoTheyWantToAdd(args, sshKeyID);
	const network = await getNetworkInput({
		ipv4: args.ipv4 ?? config.cloudchamber.ipv4,
	});

	const selectedEnvironmentVariables = await promptForEnvironmentVariables(
		environmentVariables,
		[],
		false
	);
	const selectedLabels = await promptForLabels(labels, [], false);

	const account = await loadAccount();
	renderDeploymentConfiguration("create", {
		image,
		location,
		network,
		vcpu: args.vcpu ?? config.cloudchamber.vcpu ?? account.defaults.vcpus,
		memory:
			args.memory ?? config.cloudchamber.memory ?? account.defaults.memory,
		environmentVariables: selectedEnvironmentVariables,
		labels: selectedLabels,
		env: args.env,
	});

	const yes = await inputPrompt({
		type: "confirm",
		question: "Do you want to go ahead and create your container?",
		label: "",
	});
	if (!yes) {
		cancel("Not creating the container");
		return;
	}

	const { start, stop } = spinner();
	start("Creating your container", "shortly your container will be created");
	const [deployment, err] = await wrap(
		DeploymentsService.createDeploymentV2({
			image,
			location: location,
			ssh_public_key_ids: keys,
			environment_variables: environmentVariables,
			labels: labels,
			vcpu: args.vcpu ?? config.cloudchamber.vcpu,
			memory: args.memory ?? config.cloudchamber.memory,
			network,
		})
	);
	if (err) {
		stop();
		renderDeploymentMutationError(account, err);
		return;
	}

	stop();
	updateStatus(`${status.success} Created deployment!`);
	if (deployment.network?.ipv4) {
		log(`${deployment.id}\nIP: ${deployment.network.ipv4}`);
	}

	endSection("Creating a placement for your container");
	startSection("Create a Cloudflare container", "Step 2 of 2");
	await waitForPlacement(deployment);
}

const whichImageQuestion = "Which image url should we use for your container?";
