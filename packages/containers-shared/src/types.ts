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
	buildContext: string;
	/** any env vars that should be passed in at build time */
	args?: Record<string, string>;
	/** platform to build for. defaults to linux/amd64 */
	platform?: string;
	/** sets --network=host at build time. only used by workers CI. */
	setNetworkToHost?: boolean;
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
