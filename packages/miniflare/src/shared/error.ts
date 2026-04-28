export const USER_ERROR_CODES = new Set([
	"ERR_ADDRESS_IN_USE", // Runtime failed to start because the address was in use
	"ERR_DISPOSED", // Attempted to use Miniflare instance after calling dispose()
	"ERR_MODULE_PARSE", // SyntaxError when attempting to parse/locate modules
	"ERR_MODULE_STRING_SCRIPT", // Attempt to resolve module within string script
	"ERR_MODULE_DYNAMIC_SPEC", // Attempted to import/require a module without a literal spec
	"ERR_MODULE_RULE", // No matching module rule for file
	"ERR_PERSIST_UNSUPPORTED", // Unsupported storage persistence protocol
	"ERR_FUTURE_COMPATIBILITY_DATE", // Compatibility date in the future
	"ERR_NO_WORKERS", // No workers defined
	"ERR_VALIDATION", // Options failed to parse
	"ERR_DUPLICATE_NAME", // Multiple workers defined with same name
	"ERR_DIFFERENT_STORAGE_BACKEND", // Multiple Durable Object bindings declared for same class with different storage backends
	"ERR_DIFFERENT_UNIQUE_KEYS", // Multiple Durable Object bindings declared for same class with different unsafe unique keys
	"ERR_DIFFERENT_PREVENT_EVICTION", // Multiple Durable Object bindings declared for same class with different unsafe prevent eviction values
	"ERR_MULTIPLE_OUTBOUNDS", // Both `outboundService` and `fetchMock` specified
	"ERR_INVALID_WRAPPED", // Worker not allowed to be used as wrapped binding
	"ERR_MISSING_INSPECTOR_PROXY_PORT", // An inspector proxy has been requested but no inspector port to use has been specified
	"ERR_MISSING_EXPLORER_UI", // Local Explorer enabled but assets not found at expected path
] as const);

export const SYSTEM_ERROR_CODES = new Set([
	"ERR_RUNTIME_FAILURE", // Runtime failed to start
	"ERR_CYCLIC", // Generate cyclic workerd config
	"ERR_PLUGIN_LOADING_FAILED",
] as const);

export class MiniflareError<Code extends string = string> extends Error {
	constructor(
		readonly code: Code,
		message?: string,
		readonly cause?: Error
	) {
		super(message);
		// Restore prototype chain:
		// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html#support-for-newtarget
		Object.setPrototypeOf(this, new.target.prototype);
		this.name = `${new.target.name} [${code}]`;
	}

	// Is this caused by user error in using/configuring Miniflare...
	isUserError() {
		return USER_ERROR_CODES.has(this.code as KeyTypes<typeof USER_ERROR_CODES>);
	}

	// ...or has something unexpected gone wrong?
	isSystemError() {
		return SYSTEM_ERROR_CODES.has(
			this.code as KeyTypes<typeof SYSTEM_ERROR_CODES>
		);
	}
}

export type KeyTypes<T> = T extends Set<infer Keys> ? Keys : never;

export type MiniflareCoreErrorCode =
	| KeyTypes<typeof USER_ERROR_CODES>
	| KeyTypes<typeof SYSTEM_ERROR_CODES>;

export class MiniflareCoreError extends MiniflareError<MiniflareCoreErrorCode> {}

export const isFileNotFoundError = (e: unknown): boolean => {
	return (
		typeof e === "object" && e !== null && "code" in e && e.code === "ENOENT"
	);
};
