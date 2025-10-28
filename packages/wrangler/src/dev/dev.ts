import type { DevEnv, ProxyData } from "../api";
import type { AssetsOptions } from "../assets";
import type { Entry } from "../deployment-bundle/entry";
import type { StartDevOptions } from "../dev";
import type { EnablePagesAssetsServiceBindingOptions } from "../miniflare-cli/types";
import type { LegacyAssetPaths } from "../sites";
import type {
	CfModule,
	CfWorkerInit,
	Config,
	Route,
} from "@cloudflare/workers-utils";
import type { NodeJSCompatMode } from "miniflare";

export type DevProps = {
	name: string | undefined;
	noBundle: boolean;
	findAdditionalModules: boolean | undefined;
	entry: Entry;
	initialPort: number;
	initialIp: string;
	inspectorPort: number;
	runtimeInspectorPort: number;
	processEntrypoint: boolean;
	additionalModules: CfModule[];
	rules: Config["rules"];
	accountId: string | undefined;
	initialMode: "local" | "remote";
	jsxFactory: string | undefined;
	jsxFragment: string | undefined;
	tsconfig: string | undefined;
	upstreamProtocol: "https" | "http";
	localProtocol: "https" | "http";
	httpsKeyPath: string | undefined;
	httpsCertPath: string | undefined;
	localUpstream: string | undefined;
	localPersistencePath: string | null;
	liveReload: boolean;
	bindings: CfWorkerInit["bindings"];
	migrations: Config["migrations"] | undefined;
	define: Config["define"];
	alias: Config["alias"];
	crons: Config["triggers"]["crons"];
	queueConsumers: Config["queues"]["consumers"];
	isWorkersSite: boolean;
	legacyAssetPaths: LegacyAssetPaths | undefined;
	assets: AssetsOptions | undefined;
	compatibilityDate: string;
	compatibilityFlags: string[] | undefined;
	usageModel: "bundled" | "unbound" | undefined;
	minify: boolean | undefined;
	nodejsCompatMode: NodeJSCompatMode | undefined;
	build: Config["build"];
	env: string | undefined;
	/** Legacy env is wrangler environments, and not at all legacy. LegacyEnv = false is service environments, which is deprecated. */
	legacyEnv: boolean;
	host: string | undefined;
	routes: Route[] | undefined;
	inspect: boolean;
	onReady:
		| ((ip: string, port: number, proxyData: ProxyData) => void)
		| undefined;
	showInteractiveDevSession: boolean | undefined;
	forceLocal: boolean | undefined;
	enablePagesAssetsServiceBinding?: EnablePagesAssetsServiceBindingOptions;
	firstPartyWorker: boolean | undefined;
	sendMetrics: boolean | undefined;
	testScheduled: boolean | undefined;
	projectRoot: string | undefined;
	rawConfig: Config;
	rawArgs: StartDevOptions;
	devEnv: DevEnv;
};
