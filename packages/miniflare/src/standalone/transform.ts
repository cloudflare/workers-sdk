import {
	LOCAL_EXPLORER_DISK,
	SERVICE_ENTRY,
	SERVICE_LOCAL_EXPLORER,
} from "../plugins/core/constants";
import { SERVICE_LOOPBACK } from "../plugins/shared/constants";
import type {
	Config,
	Extension,
	Extension_Module,
	Service,
	ServiceDesignator,
	Socket,
	Worker,
	Worker_Binding,
} from "../runtime/config";

const ASSETS_ROUTER_PREFIX = "assets:router:";
const USER_SERVICE_PREFIX = "core:user:";
const ASSETS_SERVICE_PREFIX = "assets:";

export interface StandaloneTransformOptions {
	/** Name of the generated entry socket. Defaults to `"http"`. */
	socketName?: string;
	/** Listen address for the entry socket. Defaults to `"*:8080"`. */
	address?: string;
	/**
	 * Override which service the entry socket routes to. Defaults to the assets
	 * router (if present) or the first user worker.
	 */
	entryServiceName?: string;
	/** Bundle-relative directory under which `disk` service contents are copied. */
	diskDir?: string;
	/**
	 * Drop extension modules not referenced by any kept worker (or transitively
	 * by another referenced extension module). Defaults to `true`.
	 */
	pruneExtensions?: boolean;
}

export interface StandaloneDiskCopy {
	serviceName: string;
	/** Absolute source path taken from the assembled config. */
	from: string;
	/** Bundle-relative destination path. */
	to: string;
}

export interface StandaloneTransformResult {
	config: Config;
	diskCopies: StandaloneDiskCopy[];
	keptServices: string[];
	droppedServices: string[];
	/** Names of extension modules pruned because nothing referenced them. */
	droppedExtensionModules: string[];
	entryService: string;
	warnings: string[];
}

/**
 * Services that only exist to support Miniflare's local development experience.
 * They depend on the Node.js loopback server, the dev inspector, or local-only
 * scaffolding and must never appear in a standalone `workerd serve` bundle.
 */
function isDevOnlyService(name: string): boolean {
	return (
		name === SERVICE_LOOPBACK ||
		name === SERVICE_ENTRY ||
		name === SERVICE_LOCAL_EXPLORER ||
		name === LOCAL_EXPLORER_DISK ||
		name.startsWith("core:local-explorer") ||
		name.startsWith("strip-cf-connecting-ip:") ||
		name === "cache" ||
		name.startsWith("cache:") ||
		name === "email" ||
		name.startsWith("email:") ||
		name.includes(":rpc-proxy") ||
		name.includes("dev-registry")
	);
}

function sanitize(name: string): string {
	return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function* bindingServiceRefs(binding: Worker_Binding): Iterable<string> {
	const designatorArms = [
		"service",
		"kvNamespace",
		"r2Bucket",
		"r2Admin",
		"queue",
		"analyticsEngine",
	] as const;
	for (const arm of designatorArms) {
		if (arm in binding) {
			const designator = (
				binding as Record<string, ServiceDesignator | undefined>
			)[arm];
			if (designator?.name !== undefined) {
				yield designator.name;
			}
		}
	}
	if (
		"hyperdrive" in binding &&
		binding.hyperdrive?.designator?.name !== undefined
	) {
		yield binding.hyperdrive.designator.name;
	}
	if (
		"durableObjectNamespace" in binding &&
		binding.durableObjectNamespace?.serviceName !== undefined
	) {
		yield binding.durableObjectNamespace.serviceName;
	}
	if ("wrapped" in binding && binding.wrapped?.innerBindings !== undefined) {
		for (const inner of binding.wrapped.innerBindings) {
			yield* bindingServiceRefs(inner);
		}
	}
}

function* workerServiceRefs(worker: Worker): Iterable<string> {
	for (const binding of worker.bindings ?? []) {
		yield* bindingServiceRefs(binding);
	}
	for (const tail of worker.tails ?? []) {
		if (tail.name !== undefined) {
			yield tail.name;
		}
	}
	for (const tail of worker.streamingTails ?? []) {
		if (tail.name !== undefined) {
			yield tail.name;
		}
	}
}

function resolveEntryService(
	services: Service[],
	override: string | undefined
): string {
	if (override !== undefined) {
		return override;
	}
	const router = services.find((service) =>
		(service.name ?? "").startsWith(ASSETS_ROUTER_PREFIX)
	);
	if (router?.name !== undefined) {
		return router.name;
	}
	const user = services.find((service) =>
		(service.name ?? "").startsWith(USER_SERVICE_PREFIX)
	);
	if (user?.name !== undefined) {
		return user.name;
	}
	throw new Error(
		"Could not determine an entry service for the standalone bundle. " +
			"Pass `entryServiceName` explicitly."
	);
}

/** Collects every module source string from the workers in `services`. */
function collectWorkerSources(services: Service[]): string[] {
	const sources: string[] = [];
	for (const service of services) {
		if (!("worker" in service) || service.worker === undefined) {
			continue;
		}
		const worker = service.worker;
		if ("modules" in worker && worker.modules !== undefined) {
			for (const module of worker.modules) {
				for (const key of [
					"esModule",
					"commonJsModule",
					"text",
					"json",
				] as const) {
					const value = (module as Record<string, unknown>)[key];
					if (typeof value === "string") {
						sources.push(value);
					}
				}
			}
		}
		if (
			"serviceWorkerScript" in worker &&
			typeof worker.serviceWorkerScript === "string"
		) {
			sources.push(worker.serviceWorkerScript);
		}
	}
	return sources;
}

/** Collects every `wrapped` binding module name referenced by `services`. */
function collectWrappedModuleNames(services: Service[]): Set<string> {
	const names = new Set<string>();
	const visitBinding = (binding: Worker_Binding): void => {
		if ("wrapped" in binding && binding.wrapped !== undefined) {
			if (binding.wrapped.moduleName !== undefined) {
				names.add(binding.wrapped.moduleName);
			}
			for (const inner of binding.wrapped.innerBindings ?? []) {
				visitBinding(inner);
			}
		}
	};
	for (const service of services) {
		if ("worker" in service && service.worker?.bindings !== undefined) {
			for (const binding of service.worker.bindings) {
				visitBinding(binding);
			}
		}
	}
	return names;
}

/**
 * Drops extension modules that nothing references. Miniflare registers extension
 * modules (rate-limit, workflows, email, analytics-engine, dispatch, …) for every
 * enabled plugin, but a stateless+assets bundle only imports a few. An extension
 * module is kept if a kept worker imports it (its name appears in a worker source
 * or `wrapped` binding) or if a kept extension module imports it (transitive
 * closure). The running `workerd serve` e2e guards against over-pruning.
 */
function pruneUnusedExtensions(
	extensions: Extension[],
	keptServices: Service[]
): { extensions: Extension[]; droppedExtensionModules: string[] } {
	const moduleByName = new Map<string, Extension_Module>();
	for (const extension of extensions) {
		for (const module of extension.modules ?? []) {
			if (module.name !== undefined) {
				moduleByName.set(module.name, module);
			}
		}
	}

	const live = collectWrappedModuleNames(keptServices);
	const workerSources = collectWorkerSources(keptServices);
	for (const name of moduleByName.keys()) {
		if (workerSources.some((source) => source.includes(name))) {
			live.add(name);
		}
	}

	// Transitively keep extension modules imported by already-live ones.
	let changed = true;
	while (changed) {
		changed = false;
		for (const name of [...live]) {
			const source = moduleByName.get(name)?.esModule;
			if (source === undefined) {
				continue;
			}
			for (const candidate of moduleByName.keys()) {
				if (!live.has(candidate) && source.includes(candidate)) {
					live.add(candidate);
					changed = true;
				}
			}
		}
	}

	const droppedExtensionModules: string[] = [];
	const prunedExtensions: Extension[] = [];
	for (const extension of extensions) {
		const keptModules = (extension.modules ?? []).filter(
			(module) => module.name !== undefined && live.has(module.name)
		);
		for (const module of extension.modules ?? []) {
			if (module.name !== undefined && !live.has(module.name)) {
				droppedExtensionModules.push(module.name);
			}
		}
		if (keptModules.length > 0) {
			prunedExtensions.push({ ...extension, modules: keptModules });
		}
	}
	return { extensions: prunedExtensions, droppedExtensionModules };
}

/**
 * Transforms a Miniflare-assembled {@link Config} into a self-contained,
 * loopback-free configuration suitable for `workerd serve` outside of Miniflare:
 *
 * - Drops development-only services (the Node loopback, dev entry/router
 *   scaffolding, inspector explorer, cache/email simulators) by keeping only the
 *   services reachable from the entry worker.
 * - Repoints `globalOutbound` away from the dev `strip-cf-connecting-ip` service
 *   to the `internet` network service.
 * - Drops `cacheApiOutbound`/`moduleFallback` that reference dev-only services.
 * - Replaces all sockets with a single HTTP socket pointing at the entry service.
 * - Relativizes `disk` service paths so their contents can be copied into the
 *   bundle (reported via {@link StandaloneTransformResult.diskCopies}).
 *
 * The input config is not mutated.
 */
export function toStandaloneConfig(
	config: Config,
	options: StandaloneTransformOptions = {}
): StandaloneTransformResult {
	const services = config.services ?? [];
	const byName = new Map<string, Service>();
	for (const service of services) {
		if (service.name !== undefined) {
			byName.set(service.name, service);
		}
	}

	const entryService = resolveEntryService(services, options.entryServiceName);
	const warnings: string[] = [];
	const keep = new Set<string>();
	const repointGlobalOutbound = new Set<string>();
	const dropCacheOutbound = new Set<string>();

	const visit = (name: string): void => {
		if (keep.has(name)) {
			return;
		}
		const service = byName.get(name);
		if (service === undefined) {
			warnings.push(`Service "${name}" is referenced but was not found.`);
			return;
		}
		keep.add(name);
		if (!("worker" in service) || service.worker === undefined) {
			return;
		}
		const worker = service.worker;
		for (const ref of workerServiceRefs(worker)) {
			if (isDevOnlyService(ref)) {
				warnings.push(
					`Service "${name}" references development-only service "${ref}", which is not included in the standalone bundle.`
				);
			} else {
				visit(ref);
			}
		}
		if (worker.globalOutbound?.name !== undefined) {
			if (isDevOnlyService(worker.globalOutbound.name)) {
				repointGlobalOutbound.add(name);
			} else {
				visit(worker.globalOutbound.name);
			}
		}
		if (worker.cacheApiOutbound?.name !== undefined) {
			if (isDevOnlyService(worker.cacheApiOutbound.name)) {
				dropCacheOutbound.add(name);
			} else {
				visit(worker.cacheApiOutbound.name);
			}
		}
	};

	visit(entryService);

	// Keep the `internet` network service if anything needs to be repointed to it.
	if (repointGlobalOutbound.size > 0 && byName.has("internet")) {
		keep.add("internet");
	}

	const diskCopies: StandaloneDiskCopy[] = [];
	const diskDir = options.diskDir ?? "disk";
	const newServices: Service[] = [];
	for (const service of services) {
		const name = service.name ?? "";
		if (!keep.has(name)) {
			continue;
		}
		if ("worker" in service && service.worker !== undefined) {
			const worker = { ...service.worker } as Worker & Record<string, unknown>;
			// `moduleFallback` points at the dev-only Node loopback server.
			delete worker.moduleFallback;
			if (dropCacheOutbound.has(name)) {
				delete worker.cacheApiOutbound;
			}
			if (repointGlobalOutbound.has(name)) {
				worker.globalOutbound = { name: "internet" };
			}
			newServices.push({ ...service, worker: worker as Worker });
			continue;
		}
		if ("disk" in service && service.disk !== undefined) {
			const from = service.disk.path;
			if (from === undefined) {
				warnings.push(`Disk service "${name}" has no path; skipping copy.`);
				newServices.push(service);
				continue;
			}
			const to = `${diskDir}/${sanitize(name)}`;
			diskCopies.push({ serviceName: name, from, to });
			// Static assets are served read-only in a standalone bundle; only
			// Miniflare's dev simulator needs write access to the assets dir.
			const disk = { ...service.disk, path: to };
			if (name.startsWith(ASSETS_SERVICE_PREFIX)) {
				disk.writable = false;
			}
			newServices.push({ ...service, disk });
			continue;
		}
		newServices.push(service);
	}

	const socket: Socket = {
		name: options.socketName ?? "http",
		address: options.address ?? "*:8080",
		service: { name: entryService },
		http: {},
	};

	const droppedServices = services
		.map((service) => service.name ?? "")
		.filter((name) => !keep.has(name));

	let droppedExtensionModules: string[] = [];
	let extensions = config.extensions;
	if (
		(options.pruneExtensions ?? true) &&
		extensions !== undefined &&
		extensions.length > 0
	) {
		const pruned = pruneUnusedExtensions(extensions, newServices);
		extensions = pruned.extensions.length > 0 ? pruned.extensions : undefined;
		droppedExtensionModules = pruned.droppedExtensionModules;
	}

	const standaloneConfig: Config = {
		...config,
		services: newServices,
		sockets: [socket],
		...(extensions !== undefined ? { extensions } : {}),
	};
	if (extensions === undefined) {
		delete standaloneConfig.extensions;
	}

	return {
		config: standaloneConfig,
		diskCopies,
		keptServices: [...keep],
		droppedServices,
		droppedExtensionModules,
		entryService,
		warnings,
	};
}
