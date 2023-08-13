import type { BundleResult } from "../deployment-bundle/bundle";

export const RUNNING_BUILDERS: BundleResult[] = [];

export const CLEANUP_CALLBACKS: (() => void)[] = [];
export const CLEANUP = () => {
	CLEANUP_CALLBACKS.forEach((callback) => callback());
	RUNNING_BUILDERS.forEach((builder) => builder.stop?.());
};

<<<<<<< HEAD:packages/triangle/src/pages/utils.ts
export const pagesBetaWarning =
	"🚧 'triangle pages <command>' is a beta command. Please report any issues to https://github.com/khulnasoft/workers-sdk/issues/new/choose";

=======
>>>>>>> da9ba3c855317c6071eb892def4965706f2fb97f:packages/wrangler/src/pages/utils.ts
export function isUrl(maybeUrl?: string): maybeUrl is string {
	if (!maybeUrl) return false;

	try {
		new URL(maybeUrl);
		return true;
	} catch (e) {
		return false;
	}
}
