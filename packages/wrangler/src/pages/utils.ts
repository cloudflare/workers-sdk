import type { BundleResult } from "../bundle";

export const RUNNING_BUILDERS: BundleResult[] = [];

export const CLEANUP_CALLBACKS: (() => void)[] = [];
export const CLEANUP = () => {
	CLEANUP_CALLBACKS.forEach((callback) => callback());
	RUNNING_BUILDERS.forEach((builder) => builder.stop?.());
};

export function isUrl(maybeUrl?: string): maybeUrl is string {
	if (!maybeUrl) return false;

	try {
		new URL(maybeUrl);
		return true;
	} catch (e) {
		return false;
	}
}
