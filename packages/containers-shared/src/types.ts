import {
	CreateApplicationRolloutRequest,
	InstanceType,
	SchedulingPolicy,
} from "./client";

export interface Logger {
	debug: (message: string) => void;
	log: (message: string) => void;
	info: (message: string) => void;
	warn: (message: string) => void;
	error: (error: Error) => void;
}

export type BuildArgs = {
	/** image tag in the format `name:tag`, where tag is optional */
	tag: string;
	pathToDockerfile: string;
	/** image_build_context or args.PATH. if not provided, defaults to the dockerfile directory */
	buildContext?: string;
	/** any env vars that should be passed in at build time */
	args?: Record<string, string>;
	/** platform to build for. defaults to linux/amd64 */
	platform?: string;
	/** sets --network=host at build time. only used by workers CI. */
	setNetworkToHost?: boolean;
};

export type ContainerNormalisedConfig = RegistryLinkConfig | DockerfileConfig;
export type DockerfileConfig = SharedContainerConfig & {
	/**  absolute path, resolved relative to the wrangler config file */
	dockerfile: string;
	/** absolute path, resolved relative to the wrangler config file. defaults to the directory of the dockerfile */
	image_build_context: string;
	image_vars?: Record<string, string>;
};
export type RegistryLinkConfig = SharedContainerConfig & {
	registry_link: string;
};

export type InstanceTypeOrLimits =
	| {
			/** if undefined in config, defaults to instance_type */
			disk_size?: number;
			vcpu?: number;
			memory_mib?: number;
	  }
	| {
			/** if undefined in config, defaults to "dev" */
			instance_type: InstanceType;
	  };

/** build/pull agnostic container options */
export type ContainerDevOptions = {
	/** may be dockerfile or registry link */
	image: string;
	/** formatted as cloudflare-dev/workername-DOclassname:build-id */
	imageTag: string;
	/** container's DO class name */
	class_name: string;
	imageBuildContext?: string;
	/** build time args */
	args?: Record<string, string>;
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
	/** if undefined in config, defaults to 25 */
	rollout_step_percentage: number;
	/** if undefined in config, defaults to "full_auto" */
	rollout_kind: "full_auto" | "full_manual" | "none";
	constraints?: {
		regions?: string[];
		cities?: string[];
		tier?: number;
	};
} & InstanceTypeOrLimits;
