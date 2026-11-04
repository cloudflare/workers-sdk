import { createHash, randomBytes } from "node:crypto";
import { readFileSync, unlinkSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { getEnvBindingsOfType } from "../shared";
import { getUserServiceName } from "./constants";
import {
	getLocalIdentityBindings,
	getLocalIdentityServices,
	getLocalIdentityAuthority,
} from "./identity";
import type { Service, Worker_Binding } from "../../runtime";
import type { ParsedInstanceOptions, ParsedWorkerOptions } from "../shared";

export const LOCAL_IDENTITY_ROUTER = "core:identity:router";
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
	disposeSync(): void;
	metadata: LocalIdentityMetadata;
	services: Service[];
	bindings(
		worker: ParsedWorkerOptions,
		script: string
	): Promise<Worker_Binding[]>;
	receiver(worker: string): {
		name: string;
		entrypoint: string;
		props: { json: string };
	};
}
function hash(value: string) {
	return createHash("sha256").update(value).digest("hex");
}
function revisionId(hex: string) {
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
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
/** One runtime owns a persisted realm; independent processes must use separate state. */
async function ownRealm(directory: string, owner: string) {
	const file = path.join(directory, "owner.json");
	const value = JSON.stringify({ pid: process.pid, owner });
	if (!(await createPrivateFile(file, value))) {
		const current = JSON.parse(await fs.readFile(file, "utf8")) as {
			pid: number;
			owner: string;
		};
		if (current.owner !== owner) {
			// Do not reclaim stale locks automatically: two contenders could both
			// observe a dead owner and remove a newly acquired replacement lock.
			throw new Error(
				`Another local runtime owns identity state at ${directory} (process ${current.pid}). Stop that runtime or choose a separate persistence directory. If it exited without cleanup, confirm all runtimes using this state have stopped, then remove ${file}; keep authority.json and replay storage together.`
			);
		}
	}
	return () => {
		try {
			if (readFileSync(file, "utf8") === value) {
				unlinkSync(file);
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				throw error;
			}
		}
	};
}
/** One graph owns the shared source-built services and their persistence lifetime. */
export async function createLocalIdentityGraph(
	workers: ParsedWorkerOptions[],
	shared: ParsedInstanceOptions,
	tmpPath: string,
	routes: Map<string, string[]>
): Promise<LocalIdentityGraph | undefined> {
	const owningWorker = workers.find(
		(w) =>
			w.config.identityReceiver !== undefined ||
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
	try {
		await fs.access(path.join(path.dirname(directory), "authority.json"));
		throw new Error(
			`An earlier local identity layout exists at ${path.dirname(directory)}. Stop its runtime and retain that complete directory for recovery. Choose a new persistence directory for this schema; local grants are never moved or reset automatically.`
		);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw error;
		}
	}
	await fs.mkdir(directory, { recursive: true, mode: 0o700 });
	const release = await ownRealm(directory, tmpPath);
	try {
		const state = await getLocalIdentityAuthority(shared, directory);
		const issuer = `https://oidc.${state.realm}.test/accounts/${state.accountId}`;
		const directoryDomain = `wba.${state.realm}.test`;
		const metadata: LocalIdentityMetadata = {
			issuer,
			jwksURL: `${issuer}/.well-known/jwks.json`,
			grantJwksURL: `${issuer}/.well-known/wag-jwks.json`,
			directoryDomain,
			workers: {},
		};
		const origins: Record<string, string> = {};
		const routerBindings: Worker_Binding[] = [];
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
					/* Ordinary route patterns are not exact OAuth origins. */
				}
			}
			for (const origin of new Set(workerOrigins)) {
				if (origins[origin] && origins[origin] !== `WORKER_${index}`) {
					throw Error(
						`Local identity origin ${origin} belongs to more than one Worker.`
					);
				}
				origins[origin] = `WORKER_${index}`;
			}
			routerBindings.push({
				name: `WORKER_${index}`,
				service: { name: getUserServiceName(name), suppressNativeCaller: true },
			});
			metadata.workers[name] = {
				subject: `worker:${hash(`${state.realm}:worker:${name}`).slice(0, 32)}`,
				revision: revisionId(hash(JSON.stringify(worker.config.manifest))),
				origins: [...new Set(workerOrigins)],
				identities: {},
			};
		}
		const services = await getLocalIdentityServices(
			owningWorker,
			shared,
			tmpPath
		);
		const routerService = services.find(
			(s) => s.name === LOCAL_IDENTITY_ROUTER
		);
		const router =
			routerService && "worker" in routerService
				? routerService.worker
				: undefined;
		if (!router) {
			throw Error("Local identity router is missing.");
		}
		router.bindings?.push(...routerBindings, {
			name: "ROUTES",
			json: JSON.stringify(origins),
		});
		return {
			directory,
			dispose: async () => release(),
			disposeSync: release,
			metadata,
			services,
			async bindings(worker, script) {
				const info = metadata.workers[worker.config.name];
				info.revision = revisionId(hash(script));
				const result = await getLocalIdentityBindings(worker, shared);
				for (const binding of result) {
					if (
						!("service" in binding) ||
						!binding.name ||
						!binding.service?.props ||
						!("json" in binding.service.props)
					) {
						continue;
					}
					const props = JSON.parse(binding.service.props.json) as {
						compiled?: { workerId: string; versionId: string };
						workerId?: string;
						versionId?: string;
						namespaceId?: string;
					};
					if (props.compiled) {
						props.compiled.workerId = info.subject.slice(7);
						props.compiled.versionId = info.revision;
					} else {
						props.workerId = info.subject.slice(7);
						props.versionId = info.revision;
						if (props.namespaceId) {
							props.namespaceId = hash(
								`${state.realm}:namespace:${props.namespaceId}`
							).slice(0, 32);
						}
						info.identities[binding.name] = {
							subject: props.namespaceId
								? `durable-object-namespace:${props.namespaceId}`
								: info.subject,
						};
					}
					binding.service.props = { json: JSON.stringify(props) };
					binding.service.suppressNativeCaller = true;
				}
				return result;
			},
			receiver(worker) {
				const identityReceiver = workers.find(
					(options) => options.config.name === worker
				)?.config.identityReceiver;
				return {
					name: "core:identity:verifier",
					entrypoint: "WorkloadVerifier",
					props: {
						json: JSON.stringify({
							receiverAccountId: state.accountId,
							...(identityReceiver === undefined ? {} : { identityReceiver }),
							receiverWorkerId: metadata.workers[worker].subject.slice(7),
						}),
					},
				};
			},
		};
	} catch (error) {
		release();
		throw error;
	}
}
