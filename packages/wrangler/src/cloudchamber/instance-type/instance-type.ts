import { inputPrompt } from "@cloudflare/cli-shared-helpers/interactive";
import {
	cleanForInstanceType as cleanForInstanceTypeFromShared,
	getInstanceTypeUsage as getInstanceTypeUsageFromShared,
	inferInstanceType as inferInstanceTypeFromShared,
	InstanceType,
} from "@cloudflare/containers-shared";
import { UserError } from "@cloudflare/workers-utils";
import type { CloudchamberConfig } from "@cloudflare/workers-utils";

export {
	cleanForInstanceTypeFromShared as cleanForInstanceType,
	getInstanceTypeUsageFromShared as getInstanceTypeUsage,
	inferInstanceTypeFromShared as inferInstanceType,
};

const instanceTypeNames: string[] = Object.values(InstanceType);
const promptInstanceTypes = [
	InstanceType.LITE,
	InstanceType.BASIC,
	InstanceType.STANDARD_1,
	InstanceType.STANDARD_2,
	InstanceType.STANDARD_3,
	InstanceType.STANDARD_4,
] as const;

type InstanceTypeOption = {
	label: string;
	value: string;
};

function formatVcpu(vcpu: number): string {
	if (vcpu === 0.0625) {
		return "1/16";
	}
	if (vcpu === 0.25) {
		return "1/4";
	}
	if (vcpu === 0.5) {
		return "1/2";
	}
	return `${vcpu}`;
}

function formatMemory(memoryMib: number): string {
	if (memoryMib < 1024) {
		return `${memoryMib} MiB`;
	}
	return `${memoryMib / 1024} GiB`;
}

function formatDisk(diskMb: number): string {
	return `${diskMb / 1000} GB`;
}

// prompts for instance type
export async function promptForInstanceType(
	allowSkipping: boolean
): Promise<InstanceType | undefined> {
	let options: InstanceTypeOption[] = promptInstanceTypes.map(
		(instanceType) => {
			const usage = getInstanceTypeUsageFromShared(instanceType);
			return {
				label: `${instanceType}: ${formatVcpu(usage.vcpu)} vCPU, ${formatMemory(usage.memory_mib)} memory, ${formatDisk(usage.disk_mb)} disk`,
				value: instanceType,
			};
		}
	);
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
			`Field "instance_type" is mutually exclusive with "memory" and "vcpu". These fields cannot be set together.`,
			{
				telemetryMessage:
					"cloudchamber instance type conflicting configuration",
			}
		);
	}

	if (instanceTypeNames.includes(instance_type)) {
		return instance_type as InstanceType;
	} else {
		throw new UserError(
			`"instance_type" field value is expected to be one of 'lite', 'basic', 'standard-1', 'standard-2', 'standard-3', 'standard-4', but got "${instance_type}"`,
			{ telemetryMessage: "cloudchamber instance type invalid value" }
		);
	}
}
