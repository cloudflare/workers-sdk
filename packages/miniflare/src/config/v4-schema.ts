import {
	AssetConfigSchema,
	RouterConfigSchema,
} from "@cloudflare/workers-shared";
import { z } from "zod";
import {
	HttpOptions_Style,
	TlsOptions_Version,
} from "../runtime/config/workerd";
import { Log } from "../shared";
import { kCurrentWorker } from "./current-worker";
import type { Request, Response } from "../http";
import type { Miniflare } from "../index";
import type { RemoteProxyConnectionString } from "../plugins/shared";
import type { Json } from "../shared";
import type { WorkerRegistry } from "../shared/dev-registry-types";
import type { Awaitable } from "../workers";
import type { AssetConfig, RouterConfig } from "@cloudflare/workers-shared";
import type * as http from "node:http";

const kUnsafeEphemeralUniqueKey = Symbol.for(
	"miniflare.kUnsafeEphemeralUniqueKey"
);

export interface V4WorkerdStructuredLog {
	timestamp: number;
	level: string;
	message: string;
}

export type V4FetchHandler = (
	request: Request,
	miniflare: Miniflare
) => Awaitable<Response>;
export type V4NodeHandler = (
	req: http.IncomingMessage,
	res: http.ServerResponse,
	miniflare: Miniflare
) => Awaitable<void>;

const JsonLiteralSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
]);
const JsonSchema: z.ZodType<Json> = z.lazy(() =>
	z.union([
		JsonLiteralSchema,
		z.array(JsonSchema),
		z.record(z.string(), JsonSchema),
	])
);

const RemoteProxyConnectionStringSchema =
	z.custom<RemoteProxyConnectionString>();

const V4AssetConfigSchema = AssetConfigSchema.omit({
	compatibility_date: true,
	compatibility_flags: true,
});

const V4ModuleRuleTypeSchema = z.enum([
	"ESModule",
	"CommonJS",
	"Text",
	"Data",
	"CompiledWasm",
	"PythonModule",
	"PythonRequirement",
]);

const V4ModuleRuleSchema = z.object({
	type: V4ModuleRuleTypeSchema,
	include: z.array(z.string()),
	fallthrough: z.boolean().optional(),
});

const V4ModuleDefinitionSchema = z.object({
	type: V4ModuleRuleTypeSchema,
	/** Module file path; relative to `modulesRoot` if not absolute. */
	path: z.string(),
	contents: z.union([z.string(), z.instanceof(Uint8Array)]).optional(),
});

const V4SourceOptionsSchema = z.union([
	z.object({
		modules: z.array(V4ModuleDefinitionSchema),
		/** Source directory for module paths; relative to `rootPath` if not absolute. */
		modulesRoot: z.string().optional(),
	}),
	z.object({
		script: z.string(),
		/** Worker script source path; relative to `rootPath` if not absolute. */
		scriptPath: z.string().optional(),
		modules: z.boolean().optional(),
		modulesRules: z.array(V4ModuleRuleSchema).optional(),
		/** Source directory for module paths; relative to `rootPath` if not absolute. */
		modulesRoot: z.string().optional(),
	}),
	z.object({
		/** Worker script source path; relative to `rootPath` if not absolute. */
		scriptPath: z.string(),
		modules: z.boolean().optional(),
		modulesRules: z.array(V4ModuleRuleSchema).optional(),
		/** Source directory for module paths; relative to `rootPath` if not absolute. */
		modulesRoot: z.string().optional(),
	}),
]);

const V4HttpOptionsHeaderSchema = z.object({
	name: z.string(),
	value: z.string().optional(),
});

const V4HttpOptionsSchema = z.object({
	style: z.enum(HttpOptions_Style).optional(),
	forwardedProtoHeader: z.string().optional(),
	cfBlobHeader: z.string().optional(),
	injectRequestHeaders: z.array(V4HttpOptionsHeaderSchema).optional(),
	injectResponseHeaders: z.array(V4HttpOptionsHeaderSchema).optional(),
});

const V4TlsOptionsSchema = z.object({
	keypair: z
		.object({
			privateKey: z.string().optional(),
			certificateChain: z.string().optional(),
		})
		.optional(),
	requireClientCerts: z.boolean().optional(),
	trustBrowserCas: z.boolean().optional(),
	trustedCertificates: z.array(z.string()).optional(),
	minVersion: z.enum(TlsOptions_Version).optional(),
	cipherList: z.string().optional(),
});

const V4NetworkSchema = z.object({
	allow: z.array(z.string()).optional(),
	deny: z.array(z.string()).optional(),
	tlsOptions: V4TlsOptionsSchema.optional(),
});

const V4ExternalServerSchema = z
	.object({
		address: z.string(),
		http: V4HttpOptionsSchema.optional(),
		https: z
			.object({
				options: V4HttpOptionsSchema.optional(),
				tlsOptions: V4TlsOptionsSchema.optional(),
				certificateHost: z.string().optional(),
			})
			.optional(),
	})
	.refine((value) => value.http === undefined || value.https === undefined, {
		message: "Cannot specify both 'http' and 'https'",
	});

const V4DiskDirectorySchema = z.object({
	/** Directory served by the workerd disk service; passed through as-is. */
	path: z.string(),
	writable: z.boolean().optional(),
});

const V4CustomNodeServiceSchema = z.custom<V4NodeHandler>(
	(value) => typeof value === "function"
);
const V4CustomFetchServiceSchema = z.custom<V4FetchHandler>(
	(value) => typeof value === "function"
);

const V4ServiceDesignatorSchema = z.union([
	z.string(),
	z.custom<typeof kCurrentWorker>((value) => value === kCurrentWorker),
	z.object({
		name: z.union([
			z.string(),
			z.custom<typeof kCurrentWorker>((value) => value === kCurrentWorker),
		]),
		entrypoint: z.string().optional(),
		props: z.record(z.string(), z.unknown()).optional(),
		remoteProxyConnectionString: RemoteProxyConnectionStringSchema.optional(),
	}),
	z.object({ network: V4NetworkSchema }),
	z.object({ external: V4ExternalServerSchema }),
	z.object({ disk: V4DiskDirectorySchema }),
	z.object({ node: V4CustomNodeServiceSchema }),
	V4CustomFetchServiceSchema,
]);

const V4UnsafeDirectSocketSchema = z.object({
	host: z.string().optional(),
	port: z.number().optional(),
	serviceName: z.string().optional(),
	entrypoint: z.string().optional(),
	proxy: z.boolean().optional(),
});

const V4ConnectHandlerSchema = z.object({
	protocol: z.enum(["tcp"]),
	port: z.number(),
	address: z.string().optional(),
});

const V4IdEntrySchema = z.object({
	id: z.string(),
	remoteProxyConnectionString: RemoteProxyConnectionStringSchema.optional(),
});

const V4NamespaceSchema = z.union([
	z.record(z.string(), z.union([z.string(), V4IdEntrySchema])),
	z.array(z.string()),
]);

const V4R2S3CredentialsSchema = z.object({
	accessKeyId: z.string(),
	secretAccessKey: z.string(),
});

const V4R2BucketsSchema = z.union([
	z.record(
		z.string(),
		z.union([
			z.string(),
			V4IdEntrySchema.extend({
				s3Credentials: V4R2S3CredentialsSchema.optional(),
			}),
		])
	),
	z.array(z.string()),
]);

const V4DurableObjectSchema = z.object({
	className: z.string(),
	scriptName: z.string().optional(),
	useSQLite: z.boolean().optional(),
	unsafeUniqueKey: z
		.union([
			z.string(),
			z.custom<typeof kUnsafeEphemeralUniqueKey>(
				(value) => value === kUnsafeEphemeralUniqueKey
			),
		])
		.optional(),
	unsafePreventEviction: z.boolean().optional(),
	remoteProxyConnectionString: RemoteProxyConnectionStringSchema.optional(),
	container: z.object({ imageName: z.string() }).optional(),
});

const V4QueueMessageDelaySchema = z.number().int().min(0).max(86400).optional();
const V4QueueProducerOptionsSchema = z.object({
	queueName: z.string(),
	deliveryDelay: V4QueueMessageDelaySchema,
	remoteProxyConnectionString: RemoteProxyConnectionStringSchema.optional(),
});
const V4QueueConsumerOptionsSchema = z.object({
	maxBatchSize: z.number().min(0).max(100).optional(),
	maxBatchTimeout: z.number().min(0).max(60).optional(),
	maxRetries: z.number().min(0).max(100).optional(),
	deadLetterQueue: z.string().optional(),
	retryDelay: V4QueueMessageDelaySchema,
});

const V4HyperdriveSchema = z
	.union([z.url(), z.instanceof(URL)])
	.superRefine((value, ctx) => {
		const url = typeof value === "string" ? new URL(value) : value;
		const isPostgres =
			url.protocol === "postgresql:" || url.protocol === "postgres:";
		const isMysql = url.protocol === "mysql:";

		if (!isPostgres && !isMysql) {
			ctx.addIssue({
				code: "custom",
				message:
					"Only PostgreSQL-compatible or MySQL-compatible databases are currently supported.",
			});
		}
		if (url.host === "") {
			ctx.addIssue({
				code: "custom",
				message:
					"You must provide a hostname or IP address in your connection string - e.g. 'user:password@database-hostname.example.com:5432/databasename",
			});
		}
		if (url.pathname === "") {
			ctx.addIssue({
				code: "custom",
				message:
					"You must provide a database name as the path component - e.g. /postgres",
			});
		}
		if (url.username === "") {
			ctx.addIssue({
				code: "custom",
				message:
					"You must provide a username - e.g. 'user:password@database.example.com:port/databasename'",
			});
		}
		if (url.password === "") {
			ctx.addIssue({
				code: "custom",
				message:
					"You must provide a password - e.g. 'user:password@database.example.com:port/databasename' ",
			});
		}
	});

const V4PipelineSchema = z.union([
	z.string(),
	z.object({
		stream: z.string(),
		remoteProxyConnectionString: RemoteProxyConnectionStringSchema.optional(),
	}),
	z.object({
		pipeline: z.string(),
		remoteProxyConnectionString: RemoteProxyConnectionStringSchema.optional(),
	}),
]);

const V4EmailBindingOptionsSchema = z
	.object({
		name: z.string(),
		remoteProxyConnectionString: RemoteProxyConnectionStringSchema.optional(),
		allowed_sender_addresses: z.array(z.string()).optional(),
	})
	.and(
		z.union([
			z.object({
				destination_address: z.string().optional(),
				allowed_destination_addresses: z.never().optional(),
			}),
			z.object({
				allowed_destination_addresses: z.array(z.string()).optional(),
				destination_address: z.never().optional(),
			}),
		])
	);

const V4RemoteBindingSchema = z.object({
	remoteProxyConnectionString: RemoteProxyConnectionStringSchema.optional(),
});

const V4RemoteBindingWithNameSchema = z.object({
	binding: z.string(),
	remoteProxyConnectionString: RemoteProxyConnectionStringSchema.optional(),
});

const V4WorkerOptionsShapeSchema = z.object({
	name: z.string().optional(),
	/** Base directory for relative worker path options; may itself be relative to cwd. */
	rootPath: z.string().optional(),
	compatibilityDate: z.string().optional(),
	compatibilityFlags: z.array(z.string()).optional(),
	unsafeInspectorProxy: z.boolean().optional(),
	routes: z.array(z.string()).optional(),
	bindings: z.record(z.string(), JsonSchema).optional(),
	/** WASM binding file paths; string values are relative to `rootPath` if not absolute. */
	wasmBindings: z
		.record(z.string(), z.union([z.string(), z.instanceof(Uint8Array)]))
		.optional(),
	/** Text blob binding file paths; values are relative to `rootPath` if not absolute. */
	textBlobBindings: z.record(z.string(), z.string()).optional(),
	/** Data blob binding file paths; string values are relative to `rootPath` if not absolute. */
	dataBlobBindings: z
		.record(z.string(), z.union([z.string(), z.instanceof(Uint8Array)]))
		.optional(),
	serviceBindings: z.record(z.string(), V4ServiceDesignatorSchema).optional(),
	outboundService: V4ServiceDesignatorSchema.optional(),
	unsafeEphemeralDurableObjects: z.boolean().optional(),
	unsafeDirectSockets: z.array(V4UnsafeDirectSocketSchema).optional(),
	connectHandlers: z.array(V4ConnectHandlerSchema).optional(),
	unsafeOverrideFetchWorker: z.string().optional(),
	unsafeEvalBinding: z.string().optional(),
	unsafeUseModuleFallbackService: z.boolean().optional(),
	unsafeRegisterWorker: z.boolean().optional(),
	tails: z.array(V4ServiceDesignatorSchema).optional(),
	streamingTails: z.array(V4ServiceDesignatorSchema).optional(),
	stripCfConnectingIp: z.boolean().default(true),
	zone: z.string().optional(),
	/** Cloudflare Access authentication metadata exposed as `ctx.access` */
	access: z
		.object({
			aud: z.string(),
			identity: z.record(z.string(), z.unknown()).optional(),
		})
		.optional(),
	unsafeBindings: z
		.array(
			z.object({
				name: z.string(),
				type: z.string(),
				plugin: z.object({ package: z.string(), name: z.string() }),
				options: z.record(z.string(), JsonSchema),
			})
		)
		.optional(),

	cacheAPI: z.boolean().optional(),
	d1Databases: V4NamespaceSchema.optional(),
	durableObjects: z
		.record(z.string(), z.union([z.string(), V4DurableObjectSchema]))
		.optional(),
	additionalUnboundDurableObjects: z.array(V4DurableObjectSchema).optional(),
	kvNamespaces: V4NamespaceSchema.optional(),
	/** Workers Sites asset directory; relative to `rootPath` if not absolute. */
	sitePath: z.string().optional(),
	siteInclude: z.array(z.string()).optional(),
	siteExclude: z.array(z.string()).optional(),
	queueProducers: z
		.union([
			z.record(z.string(), V4QueueProducerOptionsSchema),
			z.array(z.string()),
			z.record(z.string(), z.string()),
		])
		.optional(),
	queueConsumers: z
		.union([
			z.record(z.string(), V4QueueConsumerOptionsSchema),
			z.array(z.string()),
		])
		.optional(),
	r2Buckets: V4R2BucketsSchema.optional(),
	hyperdrives: z.record(z.string(), V4HyperdriveSchema).optional(),
	ratelimits: z
		.record(
			z.string(),
			z.object({
				namespace_id: z.string(),
				simple: z.object({
					limit: z.number().gt(0),
					period: z
						.union([z.literal(10), z.literal(60)])
						.optional()
						.default(60),
				}),
			})
		)
		.optional(),
	assets: z
		.object({
			workerName: z.string().optional(),
			/** Assets directory to serve; relative to `rootPath` if not absolute. */
			directory: z.string(),
			binding: z.string().optional(),
			run_worker_first: z.union([z.boolean(), z.array(z.string())]).optional(),
			routerConfig: RouterConfigSchema.optional(),
			assetConfig: V4AssetConfigSchema.optional(),
		})
		.optional(),
	workflows: z
		.record(
			z.string(),
			z.object({
				name: z.string(),
				className: z.string(),
				scriptName: z.string().optional(),
				external: z.boolean().optional(),
				stepLimit: z.number().int().min(1).optional(),
			})
		)
		.optional(),
	pipelines: z
		.union([z.record(z.string(), V4PipelineSchema), z.array(z.string())])
		.optional(),
	secretsStoreSecrets: z
		.record(
			z.string(),
			z.object({ store_id: z.string(), secret_name: z.string() })
		)
		.optional(),
	email: z
		.object({ send_email: z.array(V4EmailBindingOptionsSchema).optional() })
		.optional(),
	analyticsEngineDatasets: z
		.record(z.string(), z.object({ dataset: z.string() }))
		.optional(),
	ai: V4RemoteBindingWithNameSchema.optional(),
	agentMemory: z
		.record(
			z.string(),
			z.object({
				namespace: z.string(),
				remoteProxyConnectionString:
					RemoteProxyConnectionStringSchema.optional(),
			})
		)
		.optional(),
	aiSearchNamespaces: z
		.record(
			z.string(),
			z.object({
				namespace: z.string().optional(),
				instance_name: z.string().optional(),
				remoteProxyConnectionString:
					RemoteProxyConnectionStringSchema.optional(),
			})
		)
		.optional(),
	aiSearchInstances: z
		.record(
			z.string(),
			z.object({
				namespace: z.string().optional(),
				instance_name: z.string().optional(),
				remoteProxyConnectionString:
					RemoteProxyConnectionStringSchema.optional(),
			})
		)
		.optional(),
	websearch: z.record(z.string(), V4RemoteBindingSchema).optional(),
	browserRendering: z
		.object({
			binding: z.string(),
			remoteProxyConnectionString: RemoteProxyConnectionStringSchema.optional(),
			headful: z.boolean().optional(),
		})
		.optional(),
	dispatchNamespaces: z
		.record(
			z.string(),
			z.object({
				namespace: z.string(),
				remoteProxyConnectionString:
					RemoteProxyConnectionStringSchema.optional(),
			})
		)
		.optional(),
	images: V4RemoteBindingWithNameSchema.optional(),
	stream: V4RemoteBindingWithNameSchema.optional(),
	vectorize: z
		.record(
			z.string(),
			z.object({
				index_name: z.string(),
				remoteProxyConnectionString:
					RemoteProxyConnectionStringSchema.optional(),
			})
		)
		.optional(),
	vpcNetworks: z
		.record(
			z.string(),
			z.union([
				z.object({
					tunnel_id: z.string(),
					remoteProxyConnectionString:
						RemoteProxyConnectionStringSchema.optional(),
				}),
				z.object({
					network_id: z.string(),
					remoteProxyConnectionString:
						RemoteProxyConnectionStringSchema.optional(),
				}),
			])
		)
		.optional(),
	vpcServices: z
		.record(
			z.string(),
			z.object({
				service_id: z.string(),
				remoteProxyConnectionString:
					RemoteProxyConnectionStringSchema.optional(),
			})
		)
		.optional(),
	mtlsCertificates: z
		.record(
			z.string(),
			z.object({
				certificate_id: z.string(),
				remoteProxyConnectionString:
					RemoteProxyConnectionStringSchema.optional(),
			})
		)
		.optional(),
	helloWorld: z
		.record(z.string(), z.object({ enable_timer: z.boolean().optional() }))
		.optional(),
	flagship: z
		.record(
			z.string(),
			z.object({
				app_id: z.string(),
				remoteProxyConnectionString:
					RemoteProxyConnectionStringSchema.optional(),
			})
		)
		.optional(),
	artifacts: z
		.record(
			z.string(),
			z.object({
				namespace: z.string(),
				remoteProxyConnectionString:
					RemoteProxyConnectionStringSchema.optional(),
			})
		)
		.optional(),
	workerLoaders: z.record(z.string(), z.object({})).optional(),
	media: V4RemoteBindingWithNameSchema.optional(),
	versionMetadata: z.string().optional(),
});

export const V4WorkerOptionsSchema = V4SourceOptionsSchema.and(
	V4WorkerOptionsShapeSchema
);

export const V4SharedOptionsSchema = z.object({
	/** Base directory for relative worker path options; may itself be relative to cwd. */
	rootPath: z.string().optional(),
	host: z.string().optional(),
	port: z.number().optional(),
	https: z.boolean().optional(),
	httpsKey: z.string().optional(),
	httpsCert: z.string().optional(),
	inspectorPort: z.number().optional(),
	inspectorHost: z.string().optional(),
	verbose: z.boolean().optional(),
	log: z.instanceof(Log).optional(),
	handleStructuredLogs: z
		.custom<(log: V4WorkerdStructuredLog) => void>(
			(value) => typeof value === "function"
		)
		.optional(),
	unsafeHandleRuntimeRestart: z
		.custom<() => Awaitable<void>>((value) => typeof value === "function")
		.optional(),
	handleUncaughtError: z
		.custom<(error: Error) => void>((value) => typeof value === "function")
		.optional(),
	upstream: z.string().optional(),
	cf: z
		.union([z.boolean(), z.string(), z.record(z.string(), z.unknown())])
		.optional(),
	/** Dev registry filesystem path; relative to cwd if not absolute. */
	unsafeDevRegistryPath: z.string().optional(),
	unsafeHandleDevRegistryUpdate: z
		.custom<(registry: WorkerRegistry) => void>(
			(value) => typeof value === "function"
		)
		.optional(),
	unsafeProxySharedSecret: z.string().optional(),
	unsafeModuleFallbackService: V4CustomFetchServiceSchema.optional(),
	unsafeTriggerHandlers: z.boolean().optional(),
	unsafeRuntimeEnv: z.record(z.string(), z.string()).optional(),
	unsafeLocalExplorer: z.boolean().optional(),
	unsafeObservability: z.boolean().optional(),
	unsafeInspectDurableObjects: z.boolean().optional(),
	logRequests: z.boolean().default(true),
	/** Root directory for persisted local resource state; relative to cwd if not absolute. */
	resourcePersistencePath: z.string().optional(),
	/** Per-instance root for resources that cannot participate in shared storage. */
	isolatedResourcePersistencePath: z.string().optional(),
	/** Project temp directory for plugin files; relative to cwd if not absolute. */
	resourceTmpPath: z.string().optional(),
	stripDisablePrettyError: z.boolean().default(true),
	telemetry: z
		.object({
			enabled: z.boolean().default(false),
			deviceId: z.string().optional(),
		})
		.default({ enabled: false }),
	publicUrl: z.url().optional(),
	containerEngine: z
		.union([
			z.object({
				localDocker: z.object({
					/** Docker socket path; passed through as-is. */
					socketPath: z.string(),
					containerEgressInterceptorImage: z.string().optional(),
				}),
			}),
			z.string(),
		])
		.optional(),
});

export const V4MiniflareOptionsSchema = V4SharedOptionsSchema.and(
	z.union([
		z.object({ workers: z.array(V4WorkerOptionsSchema) }),
		V4WorkerOptionsSchema,
	])
);

export type V4ModuleRuleType =
	| "ESModule"
	| "CommonJS"
	| "Text"
	| "Data"
	| "CompiledWasm"
	| "PythonModule"
	| "PythonRequirement";
export type V4ModuleRule = {
	type: V4ModuleRuleType;
	include: string[];
	fallthrough?: boolean;
};
export type V4ModuleDefinition = {
	type: V4ModuleRuleType;
	path: string;
	contents?: string | Uint8Array;
};
export type V4SourceOptions =
	| { modules: V4ModuleDefinition[]; modulesRoot?: string }
	| {
			script: string;
			scriptPath?: string;
			modules?: boolean;
			modulesRules?: V4ModuleRule[];
			modulesRoot?: string;
	  }
	| {
			scriptPath: string;
			modules?: boolean;
			modulesRules?: V4ModuleRule[];
			modulesRoot?: string;
	  };
export type V4ServiceDesignator =
	| string
	| symbol
	| {
			name: string | symbol;
			entrypoint?: string;
			props?: Record<string, unknown>;
			remoteProxyConnectionString?: RemoteProxyConnectionString;
	  }
	| { network: { allow?: string[]; deny?: string[]; tlsOptions?: unknown } }
	| { external: { address: string; http?: unknown; https?: unknown } }
	| { disk: { path: string; writable?: boolean } }
	| { node: V4NodeHandler }
	| V4FetchHandler;
export type V4IdEntry = {
	id: string;
	remoteProxyConnectionString?: RemoteProxyConnectionString;
};
export type V4Namespace = Record<string, string | V4IdEntry> | string[];
export type V4DurableObject = {
	className: string;
	scriptName?: string;
	useSQLite?: boolean;
	unsafeUniqueKey?: string | symbol;
	unsafePreventEviction?: boolean;
	remoteProxyConnectionString?: RemoteProxyConnectionString;
	container?: { imageName: string };
};
export type V4QueueProducerOptions = {
	queueName: string;
	deliveryDelay?: number;
	remoteProxyConnectionString?: RemoteProxyConnectionString;
};
export type V4QueueConsumerOptions = {
	maxBatchSize?: number;
	maxBatchTimeout?: number;
	maxRetries?: number;
	deadLetterQueue?: string;
	retryDelay?: number;
};
export type V4RemoteBinding = {
	remoteProxyConnectionString?: RemoteProxyConnectionString;
};
export type V4RemoteBindingWithName = V4RemoteBinding & { binding: string };
export type V4WorkerOptionsShape = {
	[key: string]: unknown;
	name?: string;
	rootPath?: string;
	compatibilityDate?: string;
	compatibilityFlags?: string[];
	unsafeInspectorProxy?: boolean;
	routes?: string[];
	bindings?: Record<string, Json>;
	wasmBindings?: Record<string, string | Uint8Array>;
	textBlobBindings?: Record<string, string>;
	dataBlobBindings?: Record<string, string | Uint8Array>;
	serviceBindings?: Record<string, V4ServiceDesignator>;
	outboundService?: V4ServiceDesignator;
	unsafeEphemeralDurableObjects?: boolean;
	unsafeDirectSockets?: Array<{
		host?: string;
		port?: number;
		serviceName?: string;
		entrypoint?: string;
		proxy?: boolean;
	}>;
	connectHandlers?: Array<{
		protocol: "tcp";
		port: number;
		address?: string;
	}>;
	unsafeOverrideFetchWorker?: string;
	unsafeEvalBinding?: string;
	unsafeUseModuleFallbackService?: boolean;
	unsafeRegisterWorker?: boolean;
	tails?: V4ServiceDesignator[];
	streamingTails?: V4ServiceDesignator[];
	stripCfConnectingIp?: boolean;
	zone?: string;
	access?: { aud: string; identity?: Record<string, unknown> };
	unsafeBindings?: Array<{
		name: string;
		type: string;
		plugin: { package: string; name: string };
		options: Record<string, Json>;
	}>;
	cacheAPI?: boolean;
	d1Databases?: V4Namespace;
	durableObjects?: Record<string, string | V4DurableObject>;
	additionalUnboundDurableObjects?: V4DurableObject[];
	kvNamespaces?: V4Namespace;
	sitePath?: string;
	siteInclude?: string[];
	siteExclude?: string[];
	queueProducers?:
		| Record<string, V4QueueProducerOptions>
		| string[]
		| Record<string, string>;
	queueConsumers?: Record<string, V4QueueConsumerOptions> | string[];
	r2Buckets?:
		| Record<
				string,
				| string
				| (V4IdEntry & {
						s3Credentials?: { accessKeyId: string; secretAccessKey: string };
				  })
		  >
		| string[];
	hyperdrives?: Record<string, string | URL>;
	ratelimits?: Record<
		string,
		{ namespace_id: string; simple: { limit: number; period?: 10 | 60 } }
	>;
	assets?: {
		workerName?: string;
		directory: string;
		binding?: string;
		run_worker_first?: boolean | string[];
		routerConfig?: RouterConfig;
		assetConfig?: Omit<
			AssetConfig,
			"compatibility_date" | "compatibility_flags"
		>;
	};
	workflows?: Record<
		string,
		{
			name: string;
			className: string;
			scriptName?: string;
			external?: boolean;
			stepLimit?: number;
		}
	>;
	pipelines?:
		| Record<
				string,
				| string
				| ({ stream: string } & V4RemoteBinding)
				| ({ pipeline: string } & V4RemoteBinding)
		  >
		| string[];
	secretsStoreSecrets?: Record<
		string,
		{ store_id: string; secret_name: string }
	>;
	email?: {
		send_email?: Array<
			{
				name: string;
				remoteProxyConnectionString?: RemoteProxyConnectionString;
				allowed_sender_addresses?: string[];
			} & (
				| {
						destination_address?: string;
						allowed_destination_addresses?: never;
				  }
				| {
						allowed_destination_addresses?: string[];
						destination_address?: never;
				  }
			)
		>;
	};
	analyticsEngineDatasets?: Record<string, { dataset: string }>;
	ai?: V4RemoteBindingWithName;
	agentMemory?: Record<string, { namespace: string } & V4RemoteBinding>;
	aiSearchNamespaces?: Record<
		string,
		{ namespace?: string; instance_name?: string } & V4RemoteBinding
	>;
	aiSearchInstances?: Record<
		string,
		{ namespace?: string; instance_name?: string } & V4RemoteBinding
	>;
	websearch?: Record<string, V4RemoteBinding>;
	browserRendering?: V4RemoteBindingWithName & { headful?: boolean };
	dispatchNamespaces?: Record<string, { namespace: string } & V4RemoteBinding>;
	images?: V4RemoteBindingWithName;
	stream?: V4RemoteBindingWithName;
	vectorize?: Record<string, { index_name: string } & V4RemoteBinding>;
	vpcNetworks?: Record<
		string,
		({ tunnel_id: string } | { network_id: string }) & V4RemoteBinding
	>;
	vpcServices?: Record<string, { service_id: string } & V4RemoteBinding>;
	mtlsCertificates?: Record<
		string,
		{ certificate_id: string } & V4RemoteBinding
	>;
	helloWorld?: Record<string, { enable_timer?: boolean }>;
	flagship?: Record<string, { app_id: string } & V4RemoteBinding>;
	artifacts?: Record<string, { namespace: string } & V4RemoteBinding>;
	workerLoaders?: Record<string, Record<string, never>>;
	media?: V4RemoteBindingWithName;
	versionMetadata?: string;
};
export type V4WorkerOptions = V4SourceOptions & V4WorkerOptionsShape;
export type ParsedV4WorkerOptions = z.output<typeof V4WorkerOptionsSchema>;
export type V4SharedOptions = {
	[key: string]: unknown;
	rootPath?: string;
	host?: string;
	port?: number;
	https?: boolean;
	httpsKey?: string;
	httpsCert?: string;
	inspectorPort?: number;
	inspectorHost?: string;
	verbose?: boolean;
	log?: Log;
	handleStructuredLogs?: (log: V4WorkerdStructuredLog) => void;
	unsafeHandleRuntimeRestart?: () => Awaitable<void>;
	handleUncaughtError?: (error: Error) => void;
	upstream?: string;
	cf?: boolean | string | Record<string, unknown>;
	unsafeDevRegistryPath?: string;
	unsafeHandleDevRegistryUpdate?: (registry: WorkerRegistry) => void;
	unsafeProxySharedSecret?: string;
	unsafeModuleFallbackService?: V4FetchHandler;
	unsafeTriggerHandlers?: boolean;
	unsafeRuntimeEnv?: Record<string, string>;
	unsafeLocalExplorer?: boolean;
	unsafeObservability?: boolean;
	unsafeInspectDurableObjects?: boolean;
	logRequests?: boolean;
	resourcePersistencePath?: string;
	isolatedResourcePersistencePath?: string;
	resourceTmpPath?: string;
	stripDisablePrettyError?: boolean;
	telemetry?: { enabled?: boolean; deviceId?: string };
	publicUrl?: string;
	containerEngine?:
		| {
				localDocker: {
					socketPath: string;
					containerEgressInterceptorImage?: string;
				};
		  }
		| string;
};
export type ParsedV4SharedOptions = z.output<typeof V4SharedOptionsSchema>;
export type V4MiniflareOptions = V4SharedOptions &
	(V4WorkerOptions | { workers: V4WorkerOptions[] });
export type ParsedV4MiniflareOptions = z.output<
	typeof V4MiniflareOptionsSchema
>;
