import type { InstanceType, SchedulingPolicy } from "./client";

export interface Logger {
	debug: (...args: unknown[]) => void;
	debugWithSanitization: (label: string, ...args: unknown[]) => void;
	log: (...args: unknown[]) => void;
	info: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
}

export type BuildArgs = {
	/** image tag in the format `name:tag`, where tag is optional */
	tag: string;
	pathToDockerfile: string;
	/** image_build_context or args.PATH. if not provided, defaults to the dockerfile directory */
	buildContext: string;
	/** any env vars that should be passed in at build time */
	args?: Record<string, string>;
	/** platform to build for. defaults to linux/amd64 */
	platform?: string;
	/** sets --network=host at build time. only used by workers CI. */
	setNetworkToHost?: boolean;
};

export type ContainerNormalizedConfig = SharedContainerConfig &
	(ImageURIConfig | DockerfileConfig);
export type DockerfileConfig = {
	/** absolute path, resolved relative to the wrangler config file */
	dockerfile: string;
	/** absolute path, resolved relative to the wrangler config file. defaults to the directory of the dockerfile */
	image_build_context: string;
	image_vars?: Record<string, string>;
};
export type ImageURIConfig = {
	image_uri: string;
};

export type InstanceTypeOrLimits =
	| {
			/** if undefined in config, defaults to instance_type */
			/** disk size is defined in config in mb but normalised here to bytes */
			disk_bytes: number;
			vcpu: number;
			memory_mib: number;
	  }
	| {
			/** if undefined in config, defaults to "dev" */
			instance_type: InstanceType;
	  };

/**
 * Shared container config that is used regardless of whether the image is from a dockerfile or a registry link.
 */
export type SharedContainerConfig = {
	/** if undefined in config, defaults to worker_name[-envName]-class_name. */
	name: string;
	/** container's DO class name */
	class_name: string;
	/** if undefined in config, defaults to 0 */
	max_instances: number;
	/** if undefined in config, defaults to "default" */
	scheduling_policy: SchedulingPolicy;
	/** if undefined in config, defaults to [90, 10] */
	rollout_step_percentage: number | number[];
	/** if undefined in config, defaults to "full_auto" */
	rollout_kind: "full_auto" | "full_manual" | "none";
	rollout_active_grace_period: number;
	constraints: {
		regions?: string[];
		cities?: string[];
		tier: number | undefined;
	};
	observability: { logs_enabled: boolean };
} & InstanceTypeOrLimits;

/** build/pull agnostic container options */
export type ContainerDevOptions = {
	/** formatted as cloudflare-dev/workername-DOclassname:build-id */
	image_tag: string;
	/** container's DO class name */
	class_name: string;
} & (DockerfileConfig | ImageURIConfig);
