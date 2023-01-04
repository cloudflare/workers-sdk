/**
 * Client Config
 */
export interface ClientConfig {
	/** Database hostname */
	hostname?: string;
	/** Database UNIX domain socket path. When used, `hostname` and `port` are ignored. */
	socketPath?: string;
	/** Database username */
	username?: string;
	/** Database password */
	password?: string;
	/** Database port */
	port?: number;
	/** Database name */
	db?: string;
	/** Whether to display packet debugging information */
	debug?: boolean;
	/** Connection read timeout (default: 30 seconds) */
	timeout?: number;
	/** Connection pool size (default: 1) */
	poolSize?: number;
	/** Connection pool idle timeout in microseconds (default: 4 hours) */
	idleTimeout?: number;
	/** charset */
	charset?: string;
}

export class Client {
	connect(config: ClientConfig): Promise<Client>;

	query(sql: string, params?: any[]): Promise<any>;
	execute(sql: string, params?: any[]): Promise<ExecuteResult>;

	// @ts-ignore
	useConnection<T>(fn: (conn: Connection) => Promise<T>);

	transaction<T = any>(processor: TransactionProcessor<T>): Promise<T>;
}

/**
 * Result for execute sql
 */
export type ExecuteResult = {
	affectedRows?: number;
	lastInsertId?: number;
	fields?: FieldInfo[];
	rows?: any[];
	iterator?: any;
};

/** @ignore */
export interface FieldInfo {
	catalog: string;
	schema: string;
	table: string;
	originTable: string;
	name: string;
	originName: string;
	encoding: number;
	fieldLen: number;
	fieldType: number;
	fieldFlag: number;
	decimals: number;
	defaultVal: string;
}

export class Connection {}

export interface TransactionProcessor<T> {
	(connection: Connection): Promise<T>;
}
