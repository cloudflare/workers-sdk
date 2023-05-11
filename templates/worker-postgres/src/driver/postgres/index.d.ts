export interface ConnectionOptions {
	/**
	 * By default, any client will only attempt to stablish
	 * connection with your database once. Setting this parameter
	 * will cause the client to attempt reconnection as many times
	 * as requested before erroring
	 *
	 * default: `1`
	 */
	attempts: number;
}

// Refactor enabled and enforce into one single option for 1.0
export interface TLSOptions {
	/**
	 * If TLS support is enabled or not. If the server requires TLS,
	 * the connection will fail.
	 */
	enabled: boolean;
	/**
	 * This will force the connection to run over TLS
	 * If the server doesn't support TLS, the connection will fail
	 *
	 * default: `false`
	 */
	enforce: boolean;
	/**
	 * A custom CA file to use for the TLS connection to the server.
	 */
	caFile?: string;
}

export interface ClientOptions {
	applicationName?: string;
	connection?: Partial<ConnectionOptions>;
	database?: string;
	hostname?: string;
	password?: string;
	port?: string | number;
	tls?: Partial<TLSOptions>;
	user?: string;
}

export type EncodedArg = null | string | Uint8Array;

export interface QueryConfig {
	args?: Array<unknown>;
	encoder?: (arg: unknown) => EncodedArg;
	name?: string;
	text: string;
}

export interface QueryObjectConfig extends QueryConfig {
	/**
	 * This parameter superseeds query column names
	 *
	 * When specified, this names will be asigned to the results
	 * of the query in the order they were provided
	 *
	 * Fields must be unique and be in the range of (a-zA-Z0-9_), otherwise the query will throw before execution
	 *
	 * A field can not start with a number, just like JavaScript variables
	 */
	fields?: string[];
}

export type QueryArguments = any[];

export class QueryResult {}

export class QueryObjectResult<T = Record<string, unknown>> extends QueryResult {}

export class QueryArrayResult<T extends Array<unknown> = Array<unknown>> extends QueryResult {}

export abstract class QueryClient {
	connect(): Promise<void>;

	queryObject<T>(query: string, ...args: QueryArguments): Promise<QueryObjectResult<T>>;

	queryObject<T>(config: QueryObjectConfig): Promise<QueryObjectResult<T>>;

	queryObject<T>(
		query: TemplateStringsArray,
		...args: QueryArguments
	): Promise<QueryObjectResult<T>>;

	queryObject<T = Record<string, unknown>>(
		query_template_or_config: string | QueryObjectConfig | TemplateStringsArray,
		...args: QueryArguments
	): Promise<QueryObjectResult<T>>;

	queryArray<T extends Array<unknown>>(
		query: string,
		...args: QueryArguments
	): Promise<QueryArrayResult<T>>;

	queryArray<T extends Array<unknown>>(config: QueryConfig): Promise<QueryArrayResult<T>>;

	queryArray<T extends Array<unknown>>(
		strings: TemplateStringsArray,
		...args: QueryArguments
	): Promise<QueryArrayResult<T>>;

	queryArray<T extends Array<unknown> = Array<unknown>>(
		query_template_or_config: TemplateStringsArray | string | QueryConfig,
		...args: QueryArguments
	): Promise<QueryArrayResult<T>>;
}

export type ConnectionString = string;

export class Client extends QueryClient {
	constructor(config?: ClientOptions | ConnectionString);
}

export class Pool {
	constructor(
		connection_params: ClientOptions | ConnectionString | undefined,
		size: number,
		lazy?: boolean
	);
}
