import { inputPrompt } from "@cloudflare/cli/interactive";
import { UserError } from "@cloudflare/workers-utils";
import type {
	CreateApplicationRequest,
	InstanceType,
	UserDeploymentConfiguration,
} from "@cloudflare/containers-shared";
import type {
	CloudchamberConfig,
	ContainerApp,
} from "@cloudflare/workers-utils";

const instanceTypes = {
	// lite is the default instance type when REQUIRE_INSTANCE_TYPE is set
	lite: {
		vcpu: 0.0625,
		memory_mib: 256,
		disk_mb: 2000,
	},
	dev: {
		vcpu: 0.0625,
		memory_mib: 256,
		disk_mb: 2000,
	},
	basic: {
		vcpu: 0.25,
		memory_mib: 1024,
		disk_mb: 4000,
	},
	standard: {
		vcpu: 0.5,
		memory_mib: 4096,
		disk_mb: 8000,
	},
	"standard-1": {
		vcpu: 0.5,
		memory_mib: 4096,
		disk_mb: 8000,
	},
	"standard-2": {
		vcpu: 1,
		memory_mib: 6144,
		disk_mb: 12000,
	},
	"standard-3": {
		vcpu: 2,
		memory_mib: 8192,
		disk_mb: 16000,
	},
	"standard-4": {
		vcpu: 4,
		memory_mib: 12_288,
		disk_mb: 20000,
	},
} as const;

const instanceTypeNames = Object.keys(instanceTypes);

// prompts for instance type
export async function promptForInstanceType(
	allowSkipping: boolean
): Promise<InstanceType | undefined> {
	let options = [
		{ label: "lite: 1/16 vCPU, 256 MiB memory, 2 GB disk", value: "lite" },
		{ label: "basic: 1/4 vCPU, 1 GiB memory, 4 GB disk", value: "basic" },
		{
			label: "standard-1: 1/2 vCPU, 4 GiB memory, 8 GB disk",
			value: "standard-1",
		},
		{
			label: "standard-2: 1/2 vCPU, 4 GiB memory, 12 GB disk",
			value: "standard-2",
		},
		{
			label: "standard-3: 1/2 vCPU, 4 GiB memory, 16 GB disk",
			value: "standard-3",
		},
		{
			label: "standard-4: 4 vCPU, 4 GiB memory, 20 GB disk",
			value: "standard-4",
		},
	];
	if (allowSkipping) {
		options = [{ label: "Do not set", value: "skip" }].concat(options);
	}
	const action = await inputPrompt({
		question: "Which instance type should we use for your container?",
		label: "",
		defaultValue: false,
		helpText: "",
		type: "select",
		options,
	});

	if (instanceTypeNames.includes(action)) {
		return action as InstanceType;
	}
	return undefined;
}

// Checks that instance type is one of allowed names and that it is not being set alongside memory or vcpu.
// Returns the instance type to use if correctly set.
export function checkInstanceType(
	args: {
		instanceType: string | undefined;
		memory: string | undefined;
		vcpu: number | undefined;
	},
	config: CloudchamberConfig
): InstanceType | undefined {
	const instance_type = args.instanceType ?? config.instance_type;
	if (instance_type === undefined) {
		return;
	}

	// If instance_type is specified as an argument, it will override any
	// memory or vcpu specified in the config
	if (args.memory !== undefined || args.vcpu !== undefined) {
		throw new UserError(
			`Field "instance_type" is mutually exclusive with "memory" and "vcpu". These fields cannot be set together.`
		);
	}

	if (instanceTypeNames.includes(instance_type)) {
		return instance_type as InstanceType;
	} else {
		throw new UserError(
			`"instance_type" field value is expected to be one of 'lite', 'basic', 'standard-1', 'standard-2', 'standard-3', 'standard-4', but got "${instance_type}"`
		);
	}
}

// get the usage for the provided instance type
export function getInstanceTypeUsage(instanceType: InstanceType): {
	vcpu: number;
	memory_mib: number;
	disk_mb: number;
} {
	return instanceTypes[instanceType];
}

// infers the instance type from a given configuration
export function inferInstanceType(
	config: UserDeploymentConfiguration
): InstanceType | undefined {
	for (const [instanceType, configuration] of Object.entries(instanceTypes)) {
		if (
			config.vcpu === configuration.vcpu &&
			config.memory_mib === configuration.memory_mib &&
			config.disk?.size_mb === configuration.disk_mb
		) {
			return instanceType as InstanceType;
		}
	}
}

/**
 * THIS IS ONLY USED FOR CLOUDCHAMBER APPLY
 * removes any disk, memory, or vcpu that have been set in an objects configuration. Used for rendering diffs.
 */
export function cleanForInstanceType(
	app: CreateApplicationRequest
): ContainerApp {
	if (!("configuration" in app)) {
		return app as ContainerApp;
	}

	const instance_type = inferInstanceType(app.configuration);
	if (instance_type !== undefined) {
		app.configuration.instance_type = instance_type;
	}

	delete app.configuration.disk;
	delete app.configuration.memory;
	delete app.configuration.memory_mib;
	delete app.configuration.vcpu;

	return app as ContainerApp;
}
