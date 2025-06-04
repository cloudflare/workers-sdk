import { type WorkflowEntrypoint } from "cloudflare:workers";
import { type Engine } from "../src/index";

declare module "cloudflare:test" {
	// Controls the type of `import("cloudflare:test").env`
	interface ProvidedEnv extends Env {
		ENGINE: DurableObjectNamespace<Engine>;
		USER_WORKFLOW: WorkflowEntrypoint;
	}
}
