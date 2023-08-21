import { type fetch, type Request, type Response } from "miniflare";
import type { WorkerConfig } from "./events";
import type * as undici from "undici";

export interface DevWorker {
	ready: Promise<void>;
	config?: WorkerConfig;
	setOptions(options: StartDevWorkerOptions): void;
	updateOptions(options: StartDevWorkerOptions): void;
	fetch: typeof fetch;
	scheduled(cron?: string): Promise<void>;
	queue(queueName: string, ...messages: unknown[]): Promise<void>;
	dispose(): Promise<void>;
}

export interface StartDevWorkerOptions {
	name: WorkerName;
	script: File;
	config?: File & { env?: string };
	compatibilityDate?: string;
	compatibilityFlags?: string[];
	build?: {
		bundle?: boolean; // defaults to true
		moduleRules?: ModuleRule[];
		define: string[] | Record<string, string>; // either ['debug=true','version=1.0.0'] or { debug: 'true', version: '1.0.0' },
		minify: boolean;
		custom: CustomBuildOptions;
	};

	bindings?: Record<string, Binding>; // Type level constraint for bindings not sharing names
	triggers?: Trigger[];

	routes?: Route[]; // --route, workers_dev
	site?: {
		path: string;
		include?: string[];
		exclude?: string[];
	};

	cronSchedules?: string[]; // triggers
	usageModel?: "bundled" | "unbound"; // usage_model
	queue?: QueueOptions; // queues
	durableObject?: DurableObjectOptions; // durable_objects, migrations
	logpush?: boolean; // logpush

	// How the user connects to their dev worker
	server?: { hostname?: string; port?: number; secure?: boolean }; // hostname: --ip, port: --port, secure: --local-protocol
	// What the requests look like when they arrive in the worker
	urlOverrides?: { hostname?: string; secure?: boolean }; // hostname: --host (remote)/--local-upstream (local), port: doesn't make sense in remote/=== server.port in local, secure: --upstream-protocol
	inspector?: { hostname?: string; port?: number; secure?: boolean };
	remote?: boolean | { auth?: Hook<string> }; // --local, account_id
	persist?: boolean | { path: string }; // --persist, --persist-to
	logLevel?: LogLevel; // --log-level
	watch?: boolean | { liveReload?: boolean }; // watch

	serviceBindings?: Record<string, ServiceDesignator | ServiceFetch>; // Allow arbitrary Node function for service bindings in dev
	outboundService: ServiceFetch;
	mockFetch: undici.MockAgent;
}

export type Hook<T, Arg = undefined> =
	| T
	| Promise<T>
	| ((arg: Arg) => T | Promise<T>);

export type WorkerName = string;

export type LogLevel = "debug" | "info" | "log" | "warn" | "error" | "none";

export type File<Contents = string> =
	| { path: string } // `path` resolved relative to cwd
	| { contents: Contents; path?: string }; // `contents` used instead, `path` can be specified if needed e.g. for module resolution
export type BinaryFile = File<Uint8Array>; // Note: Node's `Buffer`s are instances of `Uint8Array`

export interface Location {
	hostname?: string;
	port?: number;
	secure?: boolean; // Usually `https`, but could be `wss` for inspector
}

export type PatternRoute = {
	pattern: string;
} & (
	| { pattern: string; customDomain: true }
	| { pattern: string; zoneId: string; customDomain?: true; zoneName?: never }
	| { pattern: string; zoneName: string; customDomain?: true; zoneId?: never }
);
export type WorkersDevRoute = { workersDev: true };
export type Route = PatternRoute | WorkersDevRoute;

export interface CustomBuildOptions {
	command: string;
	workingDirectory?: string;
	watch?: string | string[];
}

export interface ModuleRule {
	type: "ESModule" | "CommonJS" | "CompiledWasm" | "Text" | "Data";
	include?: string[];
	fallthrough?: boolean;
}

export type Trigger =
	| { type: "route"; pattern: string; customDomain: true }
	| {
			type: "route";
			pattern: string;
			zoneId: string;
			customDomain?: true;
			zoneName?: never;
	  }
	| {
			type: "route";
			pattern: string;
			zoneName: string;
			customDomain?: true;
			zoneId?: never;
	  }
	| { type: "workers.dev" }
	| { type: "schedule"; schedule: string };

export type Binding =
	| { type: "kv"; id: string; previewId: string }
	| { type: "r2" }
	| { type: "d1" }
	| { type: "durable-object" }
	| { type: "service"; target: WorkerName | ServiceFetch };

export interface IdDesignator {
	id: string;
	previewId?: string;
}
export interface NamedDesignator {
	name: string;
	previewName?: string;
}
export interface ServiceDesignator extends NamedDesignator {
	env?: string;
}
export type ServiceFetch = (request: Request) => Promise<Response>;

export interface QueueConsumerDesignator {
	name: string;
	maxBatchSize?: number;
	maxBatchTimeout?: number;
	maxRetires?: string;
	deadLetterQueue?: string;
}
export interface QueueOptions {
	consumers?: QueueConsumerDesignator[];
	producerBindings?: Record<string, NamedDesignator>;
}

export interface DurableObjectDesignator {
	className: string;
	service?: ServiceDesignator;
}

export interface DurableObjectMigration {
	tag: string;
	newClasses?: string[];
	renamedClasses?: { from: string; to: string }[];
	deletedClasses?: string[];
}
export interface DurableObjectOptions {
	migrations?: DurableObjectMigration[];
	bindings?: Record<string, DurableObjectDesignator>;
}
