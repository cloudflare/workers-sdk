import type { __VITE_RUNNER_OBJECT__ } from "./module-runner";

/**
 * Env type that includes both user-defined properties and properties required for internal use
 */
export interface WrapperEnv {
	/** Durable Object binding for the Vite module runner */
	__VITE_RUNNER_OBJECT__: { get(id: "singleton"): __VITE_RUNNER_OBJECT__ };
	/** Service binding for fetching modules from the Vite dev server */
	__VITE_INVOKE_MODULE__: {
		fetch: (request: Request) => Promise<Response>;
	};
	/** Binding for evaluating code */
	__VITE_UNSAFE_EVAL__: {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
		eval: (code: string, filename: string) => Function;
	};
	/** User-defined env */
	[key: string]: unknown;
}

/**
 * Strips internal properties from the `env` object, returning only the user-defined properties.
 * @param internalEnv - The full wrapper env, including internal properties
 * @returns The user-defined env
 */
export function stripInternalEnv(internalEnv: WrapperEnv) {
	const {
		__VITE_RUNNER_OBJECT__,
		__VITE_INVOKE_MODULE__,
		__VITE_UNSAFE_EVAL__,
		...userEnv
	} = internalEnv;

	return userEnv;
}
