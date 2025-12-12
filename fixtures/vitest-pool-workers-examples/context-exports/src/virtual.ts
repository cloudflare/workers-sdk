import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";

// This is wildcard re-exported in src/index.ts so it is not detected by the export guessing logic
export class ReexportedVirtualEntryPoint extends WorkerEntrypoint<Env> {
	greet() {
		return `Hello ${this.env.NAME} from ReexportedVirtualEntryPoint!`;
	}
}

// This is explictly re-exported in src/index.ts so it is detected by the export guessing logic
export class ExplicitVirtualEntryPoint extends WorkerEntrypoint<Env> {
	greet() {
		return `Hello ${this.env.NAME} from ExplicitVirtualEntryPoint!`;
	}
}

// Although this export cannot be inferred by esbuild, it is explicitly configured in the Wrangler config via `migrations`.
export class ConfiguredVirtualDurableObject extends DurableObject<Env> {
	greet() {
		return `Hello ${this.env.NAME} from ConfiguredVirtualDurableObject!`;
	}
}

// Although this export cannot be inferred by esbuild, it is explicitly configured in vitest-pool-workers config via `additionalExports`.
export class ConfiguredVirtualEntryPoint extends WorkerEntrypoint<Env> {
	greet() {
		return `Hello ${this.env.NAME} from ConfiguredVirtualEntryPoint!`;
	}
}
