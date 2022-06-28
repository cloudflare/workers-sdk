import type { BuildResult } from "esbuild";

export const RUNNING_BUILDERS: BuildResult[] = [];

export const CLEANUP_CALLBACKS: (() => void)[] = [];
export const CLEANUP = () => {
	CLEANUP_CALLBACKS.forEach((callback) => callback());
	RUNNING_BUILDERS.forEach((builder) => builder.stop?.());
};

export const pagesBetaWarning =
	"🚧 'wrangler pages <command>' is a beta command. Please report any issues to https://github.com/cloudflare/wrangler2/issues/new/choose";
