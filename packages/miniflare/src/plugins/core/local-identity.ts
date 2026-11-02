import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import AUTHORITY from "worker:identity/authority";
import { z } from "zod";
import { getEnvBindingsOfType } from "../shared";
import { getUserServiceName } from "./constants";
import type { Service, Worker_Binding } from "../../runtime";
import type { ParsedInstanceOptions, ParsedWorkerOptions } from "../shared";

const AUTHORITY_SERVICE = "core:identity:authority";
export const LOCAL_IDENTITY_ROUTER = "core:identity:router";
const stateSchema = z
	.object({
		version: z.literal(1),
		realm: z.string().regex(/^[a-f0-9]{32}$/),
		accountId: z.string().regex(/^[a-f0-9]{32}$/),
		oidc: z.string().startsWith("-----BEGIN PRIVATE KEY-----"),
		wag: z.string().startsWith("-----BEGIN PRIVATE KEY-----"),
		wbaA: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
		wbaB: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
		clientA: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
		clientB: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
	})
	.strict();
type State = z.infer<typeof stateSchema>;

/** Public development metadata. It contains no credentials or private material. */
export interface LocalIdentityMetadata {
	issuer: string;
	jwksURL: string;
	grantJwksURL: string;
	directoryDomain: string;
	workers: Record<
		string,
		{
			subject: string;
			revision: string;
			origins: string[];
			identities: Record<string, { subject: string }>;
		}
	>;
}
export interface LocalIdentityGraph {
	directory: string;
	dispose(): Promise<void>;
	metadata: LocalIdentityMetadata;
	services: Service[];
	bindings(worker: ParsedWorkerOptions, script: string): Worker_Binding[];
	receiver(worker: string): {
		name: string;
		entrypoint: string;
		props: { json: string };
	};
}
function hash(value: string) {
	return createHash("sha256").update(value).digest("hex");
}
function rsa() {
	return generateKeyPairSync("rsa", {
		modulusLength: 3072,
		privateKeyEncoding: { type: "pkcs8", format: "pem" },
		publicKeyEncoding: { type: "spki", format: "pem" },
	}).privateKey;
}
/** Publish complete private state without exposing a partially written file. */
async function createPrivateFile(
	file: string,
	value: string
): Promise<boolean> {
	const temporary = `${file}.${randomBytes(8).toString("hex")}`;
	await fs.writeFile(temporary, value, { mode: 0o600, flag: "wx" });
	try {
		await fs.link(temporary, file);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
			throw error;
		}
		return false;
	} finally {
		await fs.unlink(temporary);
	}
}
async function loadState(directory: string): Promise<State> {
	await fs.mkdir(directory, { recursive: true, mode: 0o700 });
	const file = path.join(directory, "authority.json");
	try {
		return stateSchema.parse(JSON.parse(await fs.readFile(file, "utf8")));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw new Error(
				`Local identity state at ${file} is invalid. Restore it or remove the whole identity directory to reset keys and replay storage together.`
			);
		}
	}
	const value: State = {
		version: 1,
		realm: randomBytes(16).toString("hex"),
		accountId: randomBytes(16).toString("hex"),
		oidc: rsa(),
		wag: rsa(),
		wbaA: randomBytes(32).toString("base64url"),
		wbaB: randomBytes(32).toString("base64url"),
		clientA: randomBytes(32).toString("base64url"),
		clientB: randomBytes(32).toString("base64url"),
	};
	await createPrivateFile(file, JSON.stringify(value));
	return stateSchema.parse(JSON.parse(await fs.readFile(file, "utf8")));
}
/** One runtime owns a persisted realm; independent processes must use separate state. */
async function ownRealm(directory: string, owner: string) {
	const file = path.join(directory, "owner.json");
	const value = JSON.stringify({ pid: process.pid, owner });
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			if (await createPrivateFile(file, value)) {
				break;
			}
			const exists = new Error("Realm already exists") as NodeJS.ErrnoException;
			exists.code = "EEXIST";
			throw exists;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
				throw error;
			}
			const current = JSON.parse(await fs.readFile(file, "utf8")) as {
				pid: number;
				owner: string;
			};
			if (current.owner === owner) {
				break;
			}
			let alive = true;
			try {
				process.kill(current.pid, 0);
			} catch (error) {
				alive = (error as NodeJS.ErrnoException).code !== "ESRCH";
			}
			if (alive || attempt > 0) {
				throw new Error(
					`Another local runtime owns identity state at ${directory}. Stop that runtime or choose a separate persistence directory; shared identity realms across processes are unsupported.`
				);
			}
			await fs.unlink(file);
		}
	}
	return async () => {
		try {
			if ((await fs.readFile(file, "utf8")) === value) {
				await fs.unlink(file);
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				throw error;
			}
		}
	};
}
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
	service: { name: target, entrypoint, suppressNativeCaller: true },
});

/** Build one isolated authority for the cooperating Workers in this instance. */
export async function createLocalIdentityGraph(
	workers: ParsedWorkerOptions[],
	shared: ParsedInstanceOptions,
	tmpPath: string,
	routes: Map<string, string[]>
): Promise<LocalIdentityGraph | undefined> {
	const owningWorker = workers.find(
		(w) =>
			getEnvBindingsOfType(w.config, "identity").length ||
			w.config.compatibilityFlags?.includes("enable_workload_identity_context")
	);
	if (!owningWorker) {
		return;
	}
	const project = await fs.realpath(owningWorker.dev.rootPath);
	const directory = path.join(
		shared.isolatedResourcePersistencePath ?? tmpPath,
		"identity",
		hash(project).slice(0, 32)
	);
	const state = await loadState(directory);
	const issuerOrigin = `https://oidc.${state.realm}.test`;
	const directoryDomain = `wba.${state.realm}.test`;
	const issuer = `${issuerOrigin}/accounts/${state.accountId}`;
	const origins: Record<string, string> = {};
	const routerBindings: Worker_Binding[] = [];
	const metadata: LocalIdentityMetadata = {
		issuer,
		jwksURL: `${issuer}/.well-known/jwks.json`,
		grantJwksURL: `${issuer}/.well-known/wag-jwks.json`,
		directoryDomain,
		workers: {},
	};
	for (const [index, worker] of workers.entries()) {
		const name = worker.config.name;
		const workerOrigins = [`https://${name || "worker"}.local.test`];
		for (const pattern of routes.get(name) ?? []) {
			try {
				const url = new URL(
					pattern.includes("://") ? pattern : `https://${pattern}`
				);
				if (
					url.protocol === "https:" &&
					!url.hostname.includes("*") &&
					!url.username &&
					!url.password &&
					["/", "/*"].includes(url.pathname) &&
					!url.search &&
					!url.hash
				) {
					workerOrigins.push(url.origin);
				}
			} catch {
				/* Non-origin route patterns keep their ordinary inbound behavior. */
			}
		}
		for (const origin of new Set(workerOrigins)) {
			if (origins[origin] && origins[origin] !== `WORKER_${index}`) {
				throw new Error(
					`Local identity origin ${origin} belongs to more than one Worker. Give each local Worker a distinct HTTPS origin.`
				);
			}
			origins[origin] = `WORKER_${index}`;
		}
		routerBindings.push(service(`WORKER_${index}`, getUserServiceName(name)));
		metadata.workers[name] = {
			subject: `worker:${hash(`${state.realm}:worker:${name}`).slice(0, 32)}`,
			revision: hash(JSON.stringify(worker.config.manifest)),
			origins: [...new Set(workerOrigins)],
			identities: {},
		};
	}
	const { createPublicKey } = await import("node:crypto");
	const bindings: Worker_Binding[] = [
		text("ISSUER_ORIGIN", issuerOrigin),
		text("WBA_DIRECTORY_DOMAIN", directoryDomain),
		text("OIDC_ACTIVE_KEY", "A"),
		text("WAG_ACTIVE_KEY", "A"),
		text("OIDC_SIGNING_KEY_A", state.oidc),
		text("WAG_SIGNING_KEY_A", state.wag),
		text(
			"OIDC_PUBLIC_KEY_A",
			createPublicKey(state.oidc)
				.export({ type: "spki", format: "pem" })
				.toString()
		),
		text(
			"WAG_PUBLIC_KEY_A",
			createPublicKey(state.wag)
				.export({ type: "spki", format: "pem" })
				.toString()
		),
		text("WBA_ROOT_A", state.wbaA),
		text("WBA_ROOT_B", state.wbaB),
		text("WBA_ROOT_EPOCH_A", "1"),
		text("WBA_ROOT_EPOCH_B", "2"),
		text("WBA_ACTIVE_ROOT", "A"),
		text("OAUTH_ENABLED", "true"),
		text("OAUTH_CLIENT_ROOT_A", state.clientA),
		text("OAUTH_CLIENT_ROOT_B", state.clientB),
		text("OAUTH_CLIENT_ROOT_EPOCH_A", "1"),
		text("OAUTH_CLIENT_ROOT_EPOCH_B", "2"),
		text("OAUTH_CLIENT_ACTIVE_ROOT", "A"),
		service("WORKLOAD_LIMITER", AUTHORITY_SERVICE, "LocalLimiter"),
		service("DISCOVERY_LIMITER", AUTHORITY_SERVICE, "LocalLimiter"),
		service("WBA_DIRECTORY_LIMITER", AUTHORITY_SERVICE, "LocalLimiter"),
		service("WBA_DIRECTORY_SIGNER", AUTHORITY_SERVICE, "WbaDirectory"),
		{ name: "REPLAY", durableObjectNamespace: { className: "WorkloadReplay" } },
	];
	const replayPath = path.join(directory, state.realm, "replay");
	await fs.mkdir(replayPath, { recursive: true, mode: 0o700 });
	const dispose = await ownRealm(directory, tmpPath);
	return {
		directory,
		dispose,
		metadata,
		services: [
			{
				name: "core:identity:storage",
				disk: { path: replayPath, writable: true },
			},
			{
				name: AUTHORITY_SERVICE,
				worker: {
					modules: [{ name: "authority.js", esModule: AUTHORITY() }],
					compatibilityDate: "2026-07-01",
					compatibilityFlags: ["nodejs_compat"],
					bindings,
					globalOutbound: {
						name: LOCAL_IDENTITY_ROUTER,
						entrypoint: "LocalRouter",
						suppressNativeCaller: true,
					},
					durableObjectNamespaces: [
						{
							className: "WorkloadReplay",
							uniqueKey: `local-identity:${state.realm}`,
							enableSql: true,
						},
					],
					durableObjectStorage: { localDisk: "core:identity:storage" },
				},
			},
			{
				name: LOCAL_IDENTITY_ROUTER,
				worker: {
					modules: [{ name: "authority.js", esModule: AUTHORITY() }],
					compatibilityDate: "2026-07-01",
					compatibilityFlags: ["nodejs_compat"],
					bindings: [
						...routerBindings,
						service("DISCOVERY", AUTHORITY_SERVICE),
						text("ISSUER_ORIGIN", issuerOrigin),
						text("WBA_DIRECTORY_DOMAIN", directoryDomain),
						{ name: "ROUTES", json: JSON.stringify(origins) },
					],
				},
			},
		],
		bindings(worker, script) {
			const info = metadata.workers[worker.config.name];
			info.revision = hash(script);
			return getEnvBindingsOfType(worker.config, "identity").map(
				([name, binding]) => {
					const {
						type: _type,
						subject = "worker",
						namespace_id,
						...policy
					} = binding;
					const namespaceId =
						namespace_id === undefined
							? undefined
							: hash(`${state.realm}:namespace:${namespace_id}`).slice(0, 32);
					info.identities[name] = {
						subject:
							subject === "durable-object-namespace"
								? `durable-object-namespace:${namespaceId}`
								: info.subject,
					};
					return {
						name,
						service: {
							name: AUTHORITY_SERVICE,
							entrypoint: "LocalIdentityBinding",
							suppressNativeCaller: true,
							props: {
								json: JSON.stringify({
									...policy,
									schemaVersion: binding.oauth ? 4 : 1,
									accountId: state.accountId,
									workerId: info.subject.slice(7),
									versionId: info.revision,
									execution: "local",
									subject,
									...(namespaceId === undefined ? {} : { namespaceId }),
								}),
							},
						},
					};
				}
			);
		},
		receiver(worker) {
			return {
				name: AUTHORITY_SERVICE,
				entrypoint: "WorkloadVerifier",
				props: {
					json: JSON.stringify({
						receiverAccountId: state.accountId,
						receiverWorkerId: metadata.workers[worker].subject.slice(7),
					}),
				},
			};
		},
	};
}
