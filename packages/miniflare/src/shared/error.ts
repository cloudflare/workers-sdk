export class MiniflareError<
	Code extends string | number = string | number,
> extends Error {
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
}

export type MiniflareCoreErrorCode =
	| "ERR_RUNTIME_FAILURE" // Runtime failed to start
	| "ERR_ADDRESS_IN_USE" // Runtime failed to start because a specified address was already in use
	| "ERR_DISPOSED" // Attempted to use Miniflare instance after calling dispose()
	| "ERR_MODULE_PARSE" // SyntaxError when attempting to parse/locate modules
	| "ERR_MODULE_STRING_SCRIPT" // Attempt to resolve module within string script
	| "ERR_MODULE_DYNAMIC_SPEC" // Attempted to import/require a module without a literal spec
	| "ERR_MODULE_RULE" // No matching module rule for file
	| "ERR_PERSIST_UNSUPPORTED" // Unsupported storage persistence protocol
	| "ERR_PERSIST_REMOTE_UNAUTHENTICATED" // cloudflareFetch implementation not provided
	| "ERR_PERSIST_REMOTE_UNSUPPORTED" // Remote storage is not supported for this database
	| "ERR_FUTURE_COMPATIBILITY_DATE" // Compatibility date in the future
	| "ERR_NO_WORKERS" // No workers defined
	| "ERR_VALIDATION" // Options failed to parse
	| "ERR_DUPLICATE_NAME" // Multiple workers defined with same name
	| "ERR_DIFFERENT_UNIQUE_KEYS" // Multiple Durable Object bindings declared for same class with different unsafe unique keys
	| "ERR_DIFFERENT_PREVENT_EVICTION" // Multiple Durable Object bindings declared for same class with different unsafe prevent eviction values
	| "ERR_MULTIPLE_OUTBOUNDS" // Both `outboundService` and `fetchMock` specified
	| "ERR_INVALID_WRAPPED" // Worker not allowed to be used as wrapped binding
	| "ERR_CYCLIC"; // Generate cyclic workerd config
export class MiniflareCoreError extends MiniflareError<MiniflareCoreErrorCode> {}
