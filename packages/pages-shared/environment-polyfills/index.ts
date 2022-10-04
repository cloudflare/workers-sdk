import type { PolyfilledRuntimeEnvironment } from "./types";

export const polyfill = (
	environment: Record<keyof PolyfilledRuntimeEnvironment, unknown>
) => {
	Object.entries(environment).map(([name, value]) => {
		Object.defineProperty(globalThis, name, {
			value,
			configurable: true,
			enumerable: true,
			writable: true,
		});
	});
};
