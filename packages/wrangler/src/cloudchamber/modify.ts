import { cancel, startSection } from "@cloudflare/cli";
import { processArgument } from "@cloudflare/cli/args";
import { inputPrompt, spinner } from "@cloudflare/cli/interactive";
import { DeploymentsService } from "@cloudflare/containers-shared";
import { createCommand } from "../core/create-command";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import { pollSSHKeysUntilCondition, waitForPlacement } from "./cli";
import { pickDeployment } from "./cli/deployments";
import { getLocation } from "./cli/locations";
import {
	cloudchamberScope,
	collectEnvironmentVariables,
	collectLabels,
	fillOpenAPIConfiguration,
	parseImageName,
	promptForEnvironmentVariables,
	promptForLabels,
	renderDeploymentConfiguration,
	renderDeploymentMutationError,
	resolveMemory,
} from "./common";
import { wrap } from "./helpers/wrap";
import {
	checkInstanceType,
	promptForInstanceType,
} from "./instance-type/instance-type";
import { loadAccount } from "./locations";
import { sshPrompts } from "./ssh/ssh";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type {
	DeploymentV2,
	ModifyDeploymentV2RequestBody,
	SSHPublicKeyID,
} from "@cloudflare/containers-shared";
import type { Config } from "@cloudflare/workers-utils";

export function modifyCommandOptionalYargs(yargs: CommonYargsArgv) {
	return yargs
		.positional("deploymentId", {
			type: "string",
			demandOption: false,
			describe: "The deployment you want to modify",
		})
		.option("var", {
			requiresArg: true,
			type: "array",
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
		.option("ssh-public-key-id", {
			requiresArg: true,
			type: "string",
			array: true,
			demandOption: false,
			describe:
				"Public SSH key IDs to include in this container. You can add one to your account with `wrangler cloudchamber ssh create",
		})
		.option("image", {
			requiresArg: true,
			type: "string",
			demandOption: false,
			describe: "The new image that the deployment will have from now on",
		})
		.option("location", {
			requiresArg: true,
			type: "string",
			demandOption: false,
			describe: "The new location that the deployment will have from now on",
		})
		.option("instance-type", {
			requiresArg: true,
			choices: ["dev", "basic", "standard"] as const,
			demandOption: false,
			describe:
				"The new instance type that the deployment will have from now on",
		})
		.option("vcpu", {
			requiresArg: true,
			type: "number",
			demandOption: false,
			describe: "The new vcpu that the deployment will have from now on",
		})
		.option("memory", {
			requiresArg: true,
			type: "string",
			demandOption: false,
			describe: "The new memory that the deployment will have from now on",
		});
}

export async function modifyCommand(
	modifyArgs: StrictYargsOptionsToInterface<typeof modifyCommandOptionalYargs>,
	config: Config
) {
	if (isNonInteractiveOrCI()) {
		if (!modifyArgs.deploymentId) {
			throw new Error(
				"there needs to be a deploymentId when you can't interact with the wrangler cli"
			);
		}

		const environmentVariables = collectEnvironmentVariables(
			[],
			config,
			modifyArgs.var
		);
		const labels = collectLabels(modifyArgs.label);

		const memoryMib = resolveMemory(modifyArgs, config.cloudchamber);
		const vcpu = modifyArgs.vcpu ?? config.cloudchamber.vcpu;
		const instanceType = checkInstanceType(modifyArgs, config.cloudchamber);

		const modifyRequest: ModifyDeploymentV2RequestBody = {
			image: modifyArgs.image ?? config.cloudchamber.image,
			location: modifyArgs.location ?? config.cloudchamber.location,
			environment_variables: environmentVariables,
			labels: labels,
			ssh_public_key_ids: modifyArgs.sshPublicKeyId,
			instance_type: instanceType,
			vcpu: undefined,
			memory_mib: undefined,
		};
		if (instanceType === undefined) {
			modifyRequest.vcpu = vcpu;
			modifyRequest.memory_mib = memoryMib;
		}
		const deployment = await DeploymentsService.modifyDeploymentV2(
			modifyArgs.deploymentId,
			modifyRequest
		);
		logger.json(deployment);
		return;
	}

	await handleModifyCommand(modifyArgs, config);
}

async function handleSSH(
	args: StrictYargsOptionsToInterface<typeof modifyCommandOptionalYargs>,
	config: Config,
	deployment: DeploymentV2
): Promise<SSHPublicKeyID[] | undefined> {
	if (args.sshPublicKeyId !== undefined) {
		return args.sshPublicKeyId;
	}

	await sshPrompts(args);
	const keys = await pollSSHKeysUntilCondition(() => true);
	let keysToAdd = [...(deployment.ssh_public_key_ids ?? [])];
	const yes = await inputPrompt<boolean>({
		type: "confirm",
		question: "Do you want to modify existing ssh keys from the deployment?",
		label: "",
		defaultValue: false,
	});
	if (!yes) {
		return undefined;
	}

	if ((deployment.ssh_public_key_ids?.length || 0) > 0) {
		const keysSelected = await inputPrompt<string[]>({
			type: "multiselect",
			question: "Select the keys you want to remove from the deployment",
			helpText: "You can select pressing 'space'. Submit with 'enter'",
			options: keys
				.filter((k) => deployment.ssh_public_key_ids?.includes(k.id))
				.map((key) => ({ label: key.name, value: key.id })),
			label: "removing",
		});
		keysToAdd = keys
			.filter((key) => deployment.ssh_public_key_ids?.includes(key.id))
			.filter((key) => !keysSelected.includes(key.id))
			.map((k) => k.id);
	}

	const addKeysOptions = keys
		.filter((k) => !deployment.ssh_public_key_ids?.includes(k.id))
		.map((key) => ({ label: key.name, value: key.id }));
	if (addKeysOptions.length > 0) {
		const newKeys = await inputPrompt<string[]>({
			type: "multiselect",
			question: "Select the keys you want to add to the deployment",
			options: addKeysOptions,
			label: "adding",
			defaultValue: [],
		});

		keysToAdd = [...newKeys, ...keysToAdd];
	}

	return keysToAdd;
}

async function handleModifyCommand(
	args: StrictYargsOptionsToInterface<typeof modifyCommandOptionalYargs>,
	config: Config
) {
	startSection("Modify deployment");

	const deployment = await pickDeployment(args.deploymentId);

	const keys = await handleSSH(args, config, deployment);
	const givenImage = args.image ?? config.cloudchamber.image;
	const image = await processArgument<string>({ image: givenImage }, "image", {
		question: modifyImageQuestion,
		label: "",
		validate: (value) => {
			if (typeof value !== "string") {
				return "Unknown error";
			}

			const { err } = parseImageName(value);
			return err;
		},
		defaultValue: givenImage ?? deployment.image,
		initialValue: givenImage ?? deployment.image,
		helpText: "press Return to leave unchanged",
		type: "text",
	});

	const locationPick = await getLocation(
		{ location: args.location ?? config.cloudchamber.location },
		{ skipLocation: true }
	);
	const location = locationPick === "Skip" ? undefined : locationPick;

	const environmentVariables = collectEnvironmentVariables(
		deployment.environment_variables,
		config,
		args.var
	);
	const selectedEnvironmentVariables = await promptForEnvironmentVariables(
		environmentVariables,
		(deployment.environment_variables ?? []).map((v) => v.name),
		true
	);

	const labels = collectLabels(args.label);
	const selectedLabels = await promptForLabels(
		labels,
		(deployment.labels ?? []).map((v) => v.name),
		true
	);

	const memoryMib = resolveMemory(args, config.cloudchamber);
	const instanceType = await promptForInstanceType(true);

	renderDeploymentConfiguration("modify", {
		image,
		location: location ?? deployment.location.name,
		instanceType: instanceType,
		vcpu: args.vcpu ?? config.cloudchamber.vcpu ?? deployment.vcpu,
		memoryMib: memoryMib ?? deployment.memory_mib,
		env: args.env,
		environmentVariables:
			selectedEnvironmentVariables !== undefined
				? selectedEnvironmentVariables
				: deployment.environment_variables, // show the existing environment variables if any
		labels: selectedLabels !== undefined ? selectedLabels : deployment.labels, // show the existing labels if any
	});

	const yesOrNo = await inputPrompt({
		question: "Modify the deployment?",
		label: "",
		type: "confirm",
	});
	if (!yesOrNo) {
		cancel("Not modifying the deployment");
		return;
	}

	const { start, stop } = spinner();
	start(
		"Modifying your container",
		"shortly your container will be modified to a new version"
	);
	const modifyRequest: ModifyDeploymentV2RequestBody = {
		image,
		location,
		ssh_public_key_ids: keys,
		environment_variables: selectedEnvironmentVariables,
		labels: selectedLabels,
		instance_type: instanceType,
	};
	if (instanceType === undefined) {
		modifyRequest.vcpu = args.vcpu ?? config.cloudchamber.vcpu;
		modifyRequest.memory_mib = memoryMib;
	}
	const [newDeployment, err] = await wrap(
		DeploymentsService.modifyDeploymentV2(deployment.id, modifyRequest)
	);
	stop();
	if (err) {
		renderDeploymentMutationError(await loadAccount(), err);
		return;
	}

	await waitForPlacement(newDeployment);
}

const modifyImageQuestion = "URL of the image to use in your deployment";

export const cloudchamberModifyCommand = createCommand({
	metadata: {
		description: "Modify an existing deployment",
		status: "alpha",
		owner: "Product: Cloudchamber",
		hidden: false,
	},
	behaviour: {
		printBanner: () => !isNonInteractiveOrCI(),
	},
	args: {
		deploymentId: {
			type: "string",
			demandOption: false,
			describe: "The deployment you want to modify",
		},
		var: {
			requiresArg: true,
			type: "array",
			demandOption: false,
			describe: "Container environment variables",
			coerce: (arg: unknown[]) => arg.map((a) => a?.toString() ?? ""),
		},
		label: {
			requiresArg: true,
			type: "array",
			demandOption: false,
			describe: "Deployment labels",
			coerce: (arg: unknown[]) => arg.map((a) => a?.toString() ?? ""),
		},
		"ssh-public-key-id": {
			requiresArg: true,
			type: "string",
			array: true,
			demandOption: false,
			describe:
				"Public SSH key IDs to include in this container. You can add one to your account with `wrangler cloudchamber ssh create",
		},
		image: {
			requiresArg: true,
			type: "string",
			demandOption: false,
			describe: "The new image that the deployment will have from now on",
		},
		location: {
			requiresArg: true,
			type: "string",
			demandOption: false,
			describe: "The new location that the deployment will have from now on",
		},
		"instance-type": {
			requiresArg: true,
			choices: ["dev", "basic", "standard"] as const,
			demandOption: false,
			describe:
				"The new instance type that the deployment will have from now on",
		},
		vcpu: {
			requiresArg: true,
			type: "number",
			demandOption: false,
			describe: "The new vcpu that the deployment will have from now on",
		},
		memory: {
			requiresArg: true,
			type: "string",
			demandOption: false,
			describe: "The new memory that the deployment will have from now on",
		},
	},
	positionalArgs: ["deploymentId"],
	async handler(args, { config }) {
		await fillOpenAPIConfiguration(config, cloudchamberScope);
		await modifyCommand(args, config);
	},
});
