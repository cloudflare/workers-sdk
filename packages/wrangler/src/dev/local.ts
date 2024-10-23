import assert from "node:assert";
import { registerWorker } from "../dev-registry";
import { logger } from "../logger";
import type { ProxyData } from "../api";
import type { AssetsOptions } from "../assets";
import type { Config } from "../config";
import type {
	CfDurableObject,
	CfScriptFormat,
	CfWorkerInit,
} from "../deployment-bundle/worker";
import type {
	WorkerEntrypointsDefinition,
	WorkerRegistry,
} from "../dev-registry";
import type { EnablePagesAssetsServiceBindingOptions } from "../miniflare-cli/types";
import type { LegacyAssetPaths } from "../sites";
import type { ConfigBundle } from "./miniflare";
import type { EsbuildBundle } from "./use-esbuild";

export interface LocalProps {
	name: string | undefined;
	bundle: EsbuildBundle | undefined;
	format: CfScriptFormat | undefined;
	compatibilityDate: string;
	compatibilityFlags: string[] | undefined;
	usageModel: "bundled" | "unbound" | undefined;
	bindings: CfWorkerInit["bindings"];
	migrations: Config["migrations"] | undefined;
	workerDefinitions: WorkerRegistry | undefined;
	legacyAssetPaths: LegacyAssetPaths | undefined;
	assets: AssetsOptions | undefined;
	initialPort: number | undefined;
	initialIp: string;
	rules: Config["rules"];
	inspectorPort: number;
	runtimeInspectorPort: number;
	localPersistencePath: string | null;
	liveReload: boolean;
	crons: Config["triggers"]["crons"];
	queueConsumers: Config["queues"]["consumers"];
	localProtocol: "http" | "https";
	upstreamProtocol: "http" | "https";
	httpsKeyPath: string | undefined;
	httpsCertPath: string | undefined;
	localUpstream: string | undefined;
	inspect: boolean;
	onReady:
		| ((ip: string, port: number, proxyData: ProxyData) => void)
		| undefined;
	enablePagesAssetsServiceBinding?: EnablePagesAssetsServiceBindingOptions;
	testScheduled?: boolean;
	sourceMapPath: string | undefined;
	services: Config["services"] | undefined;
}

// TODO(soon): we should be able to remove this function when we fully migrate
//  to the new proposed Wrangler architecture. The `Bundler` component should
//  emit events containing a `ConfigBundle` we can feed into the dev server
//  components.
export async function localPropsToConfigBundle(
	props: LocalProps
): Promise<ConfigBundle> {
	assert(props.bundle !== undefined);
	const serviceBindings: ConfigBundle["serviceBindings"] = {};
	if (props.enablePagesAssetsServiceBinding !== undefined) {
		// `../miniflare-cli/assets` dynamically imports`@cloudflare/pages-shared/environment-polyfills`.
		// `@cloudflare/pages-shared/environment-polyfills/types.ts` defines `global`
		// augmentations that pollute the `import`-site's typing environment.
		//
		// We `require` instead of `import`ing here to avoid polluting the main
		// `wrangler` TypeScript project with the `global` augmentations. This
		// relies on the fact that `require` is untyped.
		//
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const generateASSETSBinding = require("../miniflare-cli/assets").default;
		serviceBindings.ASSETS = await generateASSETSBinding({
			log: logger,
			...props.enablePagesAssetsServiceBinding,
		});
	}
	return {
		name: props.name,
		bundle: props.bundle,
		format: props.format,
		compatibilityDate: props.compatibilityDate,
		compatibilityFlags: props.compatibilityFlags,
		inspectorPort: props.runtimeInspectorPort,
		bindings: props.bindings,
		migrations: props.migrations,
		workerDefinitions: props.workerDefinitions,
		legacyAssetPaths: props.legacyAssetPaths,
		assets: props.assets,
		initialPort: props.initialPort,
		initialIp: props.initialIp,
		rules: props.rules,
		localPersistencePath: props.localPersistencePath,
		liveReload: props.liveReload,
		crons: props.crons,
		queueConsumers: props.queueConsumers,
		localProtocol: props.localProtocol,
		httpsKeyPath: props.httpsKeyPath,
		httpsCertPath: props.httpsCertPath,
		localUpstream: props.localUpstream,
		upstreamProtocol: props.upstreamProtocol,
		inspect: props.inspect,
		services: props.services,
		serviceBindings,
	};
}

export function maybeRegisterLocalWorker(
	url: URL,
	name: string | undefined,
	internalDurableObjects: CfDurableObject[] | undefined,
	entrypointAddresses: WorkerEntrypointsDefinition | undefined
) {
	if (name === undefined) {
		return;
	}

	let protocol = url.protocol;
	protocol = protocol.substring(0, url.protocol.length - 1);
	if (protocol !== "http" && protocol !== "https") {
		return;
	}

	const port = parseInt(url.port);
	return registerWorker(name, {
		protocol,
		mode: "local",
		port,
		host: url.hostname,
		durableObjects: (internalDurableObjects ?? []).map((binding) => ({
			name: binding.name,
			className: binding.class_name,
		})),
		durableObjectsHost: url.hostname,
		durableObjectsPort: port,
		entrypointAddresses: entrypointAddresses,
	});
}
