import { randomUUID } from "node:crypto";
import { Controller } from "../internal/dev-env/BaseController";
import type { ControllerBus } from "../internal/dev-env/BaseController";
import type { DevRegistryUpdateEvent } from "../internal/dev-env/events";
import type {
	StartDevWorkerInput,
	StartDevWorkerOptions,
} from "../internal/dev-env/types";
import type { AsyncHook, CfAccount } from "@cloudflare/workers-utils";

export class RemoteConfigController extends Controller {
	latestInput?: StartDevWorkerInput;
	latestConfig?: StartDevWorkerOptions;

	constructor(
		bus: ControllerBus,
		private readonly accountId?: string
	) {
		super(bus);
	}

	async set(input: StartDevWorkerInput): Promise<StartDevWorkerOptions> {
		this.latestInput = input;
		const entrypoint = input.entrypoint ?? "ProxyServerWorker.mjs";
		const inputAuth = input.dev?.auth;
		const auth: AsyncHook<CfAccount> | undefined =
			typeof inputAuth === "function"
				? async () => await inputAuth({ account_id: this.accountId })
				: inputAuth;
		const config: StartDevWorkerOptions = {
			config: typeof input.config === "string" ? input.config : undefined,
			name: input.name ?? this.latestConfig?.name ?? randomUUID(),
			entrypoint,
			projectRoot: process.cwd(),
			compatibilityDate: input.compatibilityDate,
			compatibilityFlags: input.compatibilityFlags,
			complianceRegion: input.complianceRegion,
			bindings: input.bindings ?? {},
			build: {
				...input.build,
				bundle: false,
				additionalModules: [],
				processEntrypoint: false,
				moduleRoot: process.cwd(),
				moduleRules: [],
				define: {},
				format: "modules",
				nodejsCompatMode: null,
				exports: [],
			},
			legacy: {},
			dev: {
				...input.dev,
				auth,
				remote: "minimal",
				persist: false,
				server: { port: 0, ...input.dev?.server },
				inspector: false,
			},
		};
		this.latestConfig = config;
		this.bus.dispatch({ type: "configUpdate", config });
		return config;
	}

	patch(input: Partial<StartDevWorkerInput>) {
		return this.set({ ...this.latestInput, ...input });
	}

	onDevRegistryUpdate(_event: DevRegistryUpdateEvent): void {}
}
