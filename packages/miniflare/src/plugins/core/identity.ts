import {
	createHash,
	createPrivateKey,
	createPublicKey,
	generateKeyPair,
	randomBytes,
	randomUUID,
} from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
	isConnectionBinding,
	isIdentityBinding,
} from "@cloudflare/workers-utils/oidc";
import SCRIPT_ROUTER from "worker:core/identity-router";
import { withPersistRootStartupLock } from "../../shared/persist-root-lock";
import { getEnvBindingsOfType, getUserBindingServiceName } from "../shared";
import { IDENTITY_SERVICE_BUNDLES } from "./identity-services.generated";
import type {
	ParsedInstanceOptions,
	ParsedWorkerOptions,
} from "../../config/schema";
import type { Service, ServiceDesignator, Worker_Binding } from "../../runtime";

export const LOCAL_IDENTITY_ROUTER = "core:identity:router";
export const LOCAL_IDENTITY_ENTRY_BINDING = "MINIFLARE_LOCAL_IDENTITY";
const serviceName = (name: string) => `core:identity:${name}`;
function privateSignerName(worker: string, binding: string): string {
	return `signer:${createHash("sha256")
		.update(JSON.stringify([worker, binding]))
		.digest("hex")}`;
}

export function usesLocalIdentity(options: ParsedWorkerOptions): boolean {
	return (
		options.config.callerIdentity !== undefined ||
		getEnvBindingsOfType(options.config, "identity").length > 0 ||
		(options.config.compatibilityFlags?.includes(
			"enable_workload_identity_context"
		) ??
			false)
	);
}
export async function getLocalIdentityVerifier(
	options: ParsedWorkerOptions,
	shared: ParsedInstanceOptions
): Promise<ServiceDesignator | undefined> {
	if (
		options.config.callerIdentity === undefined &&
		!options.config.compatibilityFlags?.includes(
			"enable_workload_identity_context"
		)
	) {
		return undefined;
	}
	if (
		options.config.compatibilityFlags?.includes("legacy_error_serialization") ||
		(options.config.compatibilityDate < "2026-04-21" &&
			!options.config.compatibilityFlags?.includes(
				"enhanced_error_serialization"
			))
	) {
		throw new Error(
			"Identity bindings require enhanced_error_serialization; remove legacy_error_serialization."
		);
	}
	const local = await authority(shared);
	return {
		name: serviceName("verifier"),
		entrypoint: "WorkloadVerifier",
		props: {
			json: JSON.stringify({
				receiverAccountId: local.accountId,
				...(options.config.callerIdentity === undefined
					? {}
					: { callerIdentity: options.config.callerIdentity }),
				receiverWorkerId: createHash("sha256")
					.update(options.config.name)
					.digest("hex")
					.slice(0, 32),
			}),
		},
	};
}
interface Authority {
	version: 2;
	realm: string;
	accountId: string;
	oidc: { privateKey: string; publicKey: string };
	wag: { privateKey: string; publicKey: string };
	wba: [string, string];
	client: [string, string];
	credential: string;
}
const authorities = new WeakMap<ParsedInstanceOptions, Promise<Authority>>();
const authorityDirectories = new WeakMap<ParsedInstanceOptions, string>();
export function getLocalIdentityAuthority(
	options: ParsedInstanceOptions,
	directory: string
): Promise<Authority> {
	authorityDirectories.set(options, directory);
	return authority(options);
}
function validAuthority(raw: unknown): raw is Authority {
	if (!raw || typeof raw !== "object") {
		return false;
	}
	const value = raw as Partial<Authority>;
	const key = (v: unknown, encoding: BufferEncoding) =>
		typeof v === "string" &&
		Buffer.from(v, encoding).length === 32 &&
		Buffer.from(v, encoding).toString(encoding) === v;
	if (
		value.version !== 2 ||
		typeof value.realm !== "string" ||
		!/^[a-f0-9]{32}$/.test(value.realm) ||
		typeof value.accountId !== "string" ||
		!/^[a-f0-9]{32}$/.test(value.accountId) ||
		!key(value.credential, "base64") ||
		![value.wba, value.client].every(
			(v) =>
				Array.isArray(v) &&
				v.length === 2 &&
				v.every((k) => key(k, "base64url"))
		)
	) {
		return false;
	}
	try {
		return (
			[value.oidc, value.wag].every((pair) => {
				if (
					!pair ||
					typeof pair.privateKey !== "string" ||
					typeof pair.publicKey !== "string"
				) {
					return false;
				}
				const privateKey = createPrivateKey(pair.privateKey);
				return (
					privateKey.asymmetricKeyType === "rsa" &&
					(privateKey.asymmetricKeyDetails?.modulusLength ?? 0) >= 3072 &&
					createPublicKey(privateKey).export({
						type: "spki",
						format: "pem",
					}) === pair.publicKey
				);
			}) && value.oidc?.publicKey !== value.wag?.publicKey
		);
	} catch {
		return false;
	}
}
function keyPair(): Promise<Authority["oidc"]> {
	return new Promise((resolve, reject) =>
		generateKeyPair(
			"rsa",
			{
				modulusLength: 3072,
				publicKeyEncoding: { type: "spki", format: "pem" },
				privateKeyEncoding: { type: "pkcs8", format: "pem" },
			},
			(error, publicKey, privateKey) =>
				error ? reject(error) : resolve({ publicKey, privateKey })
		)
	);
}
function authority(options: ParsedInstanceOptions): Promise<Authority> {
	let result = authorities.get(options);
	if (!result) {
		result = (async () => {
			const directory =
				authorityDirectories.get(options) ??
				(options.isolatedResourcePersistencePath
					? path.resolve(options.isolatedResourcePersistencePath, "identity")
					: undefined);
			return withPersistRootStartupLock(directory, async () => {
				const file = directory && path.join(directory, "authority.json");
				if (file) {
					try {
						if ((await fs.stat(file)).size > 32768) {
							throw new Error(
								"Local identity authority exceeds its size limit."
							);
						}
						const raw: unknown = JSON.parse(await fs.readFile(file, "utf8"));
						if (!validAuthority(raw)) {
							throw new Error(
								"Unsupported local identity authority. Reset the identity directory to start a new isolated realm."
							);
						}
						await fs.chmod(file, 0o600);
						return raw;
					} catch (error) {
						if (
							!(error instanceof Error) ||
							!("code" in error) ||
							error.code !== "ENOENT"
						) {
							throw error;
						}
					}
				}
				const [oidc, wag] = await Promise.all([keyPair(), keyPair()]);
				const fresh: Authority = {
					version: 2,
					realm: randomBytes(16).toString("hex"),
					accountId: randomBytes(16).toString("hex"),
					oidc,
					wag,
					wba: [
						randomBytes(32).toString("base64url"),
						randomBytes(32).toString("base64url"),
					],
					client: [
						randomBytes(32).toString("base64url"),
						randomBytes(32).toString("base64url"),
					],
					credential: randomBytes(32).toString("base64"),
				};
				if (file) {
					const temporary = `${file}.${randomUUID()}.tmp`;
					const handle = await fs.open(temporary, "wx", 0o600);
					try {
						await handle.writeFile(JSON.stringify(fresh));
						await handle.sync();
					} finally {
						await handle.close();
					}
					await fs.rename(temporary, file);
					// Windows cannot fsync directory handles. The file itself is flushed
					// before the atomic rename on every platform.
					if (process.platform !== "win32") {
						const parent = await fs.open(path.dirname(file), "r");
						try {
							await parent.sync();
						} finally {
							await parent.close();
						}
					}
				}
				return fresh;
			});
		})();
		authorities.set(options, result);
	}
	return result;
}
function uuid(value: string) {
	const hex = createHash("sha256").update(value).digest("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
const json = (name: string, value: unknown): Worker_Binding => ({
	name,
	json: JSON.stringify(value),
});
const text = (name: string, value: string): Worker_Binding => ({
	name,
	text: value,
});
const service = (
	name: string,
	target: string,
	entrypoint?: string
): Worker_Binding => ({
	name,
	service: { name: serviceName(target), entrypoint },
});
export async function getLocalIdentityBindings(
	options: ParsedWorkerOptions,
	shared: ParsedInstanceOptions
): Promise<Worker_Binding[]> {
	const bindings = getEnvBindingsOfType(options.config, "identity");
	if (!bindings.length) {
		return [];
	}
	if (
		options.config.compatibilityFlags?.includes("legacy_error_serialization") ||
		(options.config.compatibilityDate < "2026-04-21" &&
			!options.config.compatibilityFlags?.includes(
				"enhanced_error_serialization"
			))
	) {
		throw new Error(
			"Identity bindings require enhanced_error_serialization; remove legacy_error_serialization."
		);
	}
	const local = await authority(shared);
	return Promise.all(
		bindings.map(async ([name, binding]) => {
			const { type: _type, ...limits } = binding;
			const input = { ...limits, binding: name };
			if (!isIdentityBinding(input)) {
				throw new Error(`Invalid identity binding ${name}.`);
			}
			const origin = {
				accountId: local.accountId,
				workerId: createHash("sha256")
					.update(options.config.name)
					.digest("hex")
					.slice(0, 32),
				versionId: uuid(JSON.stringify(options.config)),
				execution: "deployed",
			};
			const connection = isConnectionBinding(input);
			const secret =
				input.oauth && "authentication" in input.oauth
					? input.oauth.authentication
					: undefined;
			const props = connection
				? {
						compiled: {
							...origin,
							schemaVersion: 7,
							selection: input.selection ?? "app",
							connectorId: input.connector_id ?? uuid(`placeholder:${name}`),
							connectorRevision: input.connector_revision ?? 1,
							connectionManagement: input.connection_management ?? false,
							permissions: {
								scopes: input.scope,
								resources: input.resources,
								inspectionResources: input.inspection_resources ?? [],
								returnUrls: input.return_urls ?? [],
							},
						},
						operationId: uuid(
							`connector:${name}:${localIdentityCallback(shared)}`
						),
						existingId: input.connector_id !== undefined,
						explicitRevision: input.connector_revision !== undefined,
						...(input.oauth ? { oauth: input.oauth } : {}),
					}
				: {
						...origin,
						...limits,
						binding: undefined,
						schemaVersion:
							input.oauth &&
							"authentication" in input.oauth &&
							input.oauth.authentication
								? 9
								: 8,
						...(input.oauth ? { oauth: input.oauth } : {}),
						subject: input.subject ?? "worker",
						namespaceId: input.namespace_id,
						namespace_id: undefined,
					};
			// Omit undefined members before strict managed-service validation.
			return {
				name,
				service: {
					name: serviceName(
						connection
							? "broker"
							: secret
								? privateSignerName(options.config.name, name)
								: "signer"
					),
					entrypoint: connection
						? "LocalConnectionBroker"
						: (secret || input.oauth?.token_endpoint === undefined) &&
							  input.oauth
							? "LocalIdentityBinding"
							: "IdentityBinding",
					props: { json: JSON.stringify(props) },
				},
			};
		})
	);
}

function localIdentityCallback(shared: ParsedInstanceOptions): string {
	const callbackURL = new URL(
		process.env.MINIFLARE_IDENTITY_CALLBACK_URL ??
			shared.publicUrl ??
			`http://127.0.0.1:${shared.port || 8787}`
	);
	if (!process.env.MINIFLARE_IDENTITY_CALLBACK_URL) {
		callbackURL.hostname = "127.0.0.1";
		callbackURL.pathname = "/cdn-cgi/local/identity/oauth/callback";
		callbackURL.search = "";
		callbackURL.hash = "";
	}
	if (
		callbackURL.hostname !== "127.0.0.1" ||
		!["http:", "https:"].includes(callbackURL.protocol) ||
		callbackURL.username ||
		callbackURL.password ||
		callbackURL.search ||
		callbackURL.hash ||
		callbackURL.pathname !== "/cdn-cgi/local/identity/oauth/callback"
	) {
		throw new Error(
			"MINIFLARE_IDENTITY_CALLBACK_URL must name the local /cdn-cgi/local/identity/oauth/callback route."
		);
	}
	return callbackURL.href;
}
export async function getLocalIdentityServices(
	options: ParsedWorkerOptions,
	shared: ParsedInstanceOptions,
	tmpPath: string
): Promise<Service[]> {
	if (!usesLocalIdentity(options)) {
		return [];
	}
	if (
		options.config.compatibilityFlags?.includes("legacy_error_serialization") ||
		(options.config.compatibilityDate < "2026-04-21" &&
			!options.config.compatibilityFlags?.includes(
				"enhanced_error_serialization"
			))
	) {
		throw new Error(
			"Identity bindings require enhanced_error_serialization; remove legacy_error_serialization."
		);
	}
	const local = await authority(shared);
	const issuer = `https://oidc.${local.realm}.test`;
	const directory = `wba.${local.realm}.test`;
	const storage = path.join(
		authorityDirectories.get(shared) ?? path.join(tmpPath, "identity"),
		"storage"
	);
	await fs.mkdir(storage, { recursive: true, mode: 0o700 });
	const callback = localIdentityCallback(shared);
	const common = [
		text("ISSUER_ORIGIN", issuer),
		text("WBA_DIRECTORY_DOMAIN", directory),
	];
	const worker = (
		name: keyof typeof IDENTITY_SERVICE_BUNDLES,
		bindings: Worker_Binding[],
		classes: string[] = []
	): Service => ({
		name: serviceName(name),
		worker: {
			modules: [{ name: "main.js", esModule: IDENTITY_SERVICE_BUNDLES[name] }],
			compatibilityDate: "2026-10-30",
			bindings,
			globalOutbound: { name: LOCAL_IDENTITY_ROUTER },
			...(classes.length
				? {
						durableObjectNamespaces: classes.map((className) => ({
							className,
							// Keep existing Unix realm paths; Windows forbids colons.
							uniqueKey: `${local.realm}${process.platform === "win32" ? "-" : ":"}${className}`,
							enableSql: true,
						})),
						durableObjectStorage: { localDisk: serviceName("storage") },
					}
				: {}),
		},
	});
	const services: Service[] = [
		{ name: serviceName("storage"), disk: { path: storage, writable: true } },
		worker(
			"signer",
			[
				...common,
				text("OIDC_ACTIVE_KEY", "A"),
				text("WAG_ACTIVE_KEY", "A"),
				text("OIDC_SIGNING_KEY_A", local.oidc.privateKey),
				text("WAG_SIGNING_KEY_A", local.wag.privateKey),
				text("WBA_ROOT_A", local.wba[0]),
				text("WBA_ROOT_B", local.wba[1]),
				text("WBA_ROOT_EPOCH_A", "1"),
				text("WBA_ROOT_EPOCH_B", "2"),
				text("WBA_ACTIVE_ROOT", "A"),
				text("OAUTH_ENABLED", "true"),
				text("OAUTH_CLIENT_ROOT_A", local.client[0]),
				text("OAUTH_CLIENT_ROOT_B", local.client[1]),
				text("OAUTH_CLIENT_ROOT_EPOCH_A", "1"),
				text("OAUTH_CLIENT_ROOT_EPOCH_B", "2"),
				text("OAUTH_CLIENT_ACTIVE_ROOT", "A"),
				service("WORKLOAD_LIMITER", "router", "Limiter"),
				{
					name: "LOCAL_OAUTH_SETUP",
					durableObjectNamespace: { className: "LocalOAuthSetup" },
				},
			],
			["LocalOAuthSetup"]
		),
		worker("discovery", [
			...common,
			text("OIDC_PUBLIC_KEY_A", local.oidc.publicKey),
			text("WAG_PUBLIC_KEY_A", local.wag.publicKey),
			text("WBA_ROOT_EPOCH_A", "1"),
			text("WBA_ROOT_EPOCH_B", "2"),
			service("WBA_DIRECTORY_SIGNER", "signer", "WbaDirectory"),
			service("WBA_DIRECTORY_LIMITER", "router", "Limiter"),
		]),
		worker(
			"fixture",
			[
				{
					name: "VERIFIER",
					service: {
						name: serviceName("verifier"),
						entrypoint: "WorkloadVerifier",
						props: {
							json: JSON.stringify({
								receiverAccountId: local.accountId,
								receiverWorkerId: createHash("sha256")
									.update("standards-fixture")
									.digest("hex")
									.slice(0, 32),
							}),
						},
					},
				},
				text("CALLBACK_URL", callback),
				{ name: "FIXTURE", durableObjectNamespace: { className: "Fixture" } },
			],
			["Fixture"]
		),
		worker(
			"verifier",
			[
				...common,
				service("DISCOVERY_LIMITER", "router", "Limiter"),
				{
					name: "REPLAY",
					durableObjectNamespace: { className: "WorkloadReplay" },
				},
			],
			["WorkloadReplay"]
		),
		worker(
			"broker",
			[
				...common,
				text("AUTHORITY_ENVIRONMENT", `local:${local.realm}`),
				text("CALLBACK_URL", callback),
				text(
					"CREDENTIAL_KEYS",
					JSON.stringify({ active: "local", keys: { local: local.credential } })
				),
				...[
					["CUSTOMERS", "CustomerConnections"],
					["CONNECTORS", "AccountConnectors"],
					["REGISTRATION_CREDENTIALS", "RegistrationCredentials"],
					["LOCAL_SETUP", "LocalConnectorSetup"],
				].map(([name, className]) => ({
					name,
					durableObjectNamespace: { className },
				})),
				service("CALLBACK_LIMITER", "router", "Limiter"),
			],
			[
				"CustomerConnections",
				"AccountConnectors",
				"RegistrationCredentials",
				"LocalConnectorSetup",
			]
		),
		{
			name: LOCAL_IDENTITY_ROUTER,
			worker: {
				modules: [{ name: "main.js", esModule: SCRIPT_ROUTER() }],
				compatibilityDate: "2026-10-30",
				bindings: [
					...common,
					text("CALLBACK_URL", callback),
					json(
						"LIVE_PROVIDER",
						process.env.MINIFLARE_IDENTITY_LIVE_PROVIDER === "1"
					),
					service("DISCOVERY", "discovery"),
					service("BROKER", "broker"),
					service("FIXTURE", "fixture"),
				],
			},
		},
	];
	const signer = services.find((s) => s.name === serviceName("signer"));
	if (!signer || !("worker" in signer) || !signer.worker) {
		throw new Error("Missing private identity signer.");
	}
	for (const [name, binding] of getEnvBindingsOfType(
		options.config,
		"identity"
	)) {
		const auth =
			binding.oauth && "authentication" in binding.oauth
				? binding.oauth.authentication
				: undefined;
		if (!auth) {
			continue;
		}
		services.push({
			name: serviceName(privateSignerName(options.config.name, name)),
			worker: {
				...signer.worker,
				bindings: [
					...(signer.worker.bindings ?? []),
					{
						name: "PRIVATE_OAUTH_SECRET",
						service: {
							name: getUserBindingServiceName(
								"secrets-store",
								`${auth.secret_reference.store_id}:${auth.secret_reference.secret_name}`
							),
							entrypoint: "SecretsStoreSecret",
						},
					},
				],
			},
		});
	}
	return services;
}
