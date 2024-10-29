// Simply re-export both entrypoints so that it gets compiled into the Miniflare code base.
// This allows us to have it as a devDependency only.
export {
	WorkflowBinding,
	Engine,
} from "@cloudflare/workflows-shared/src/local-binding-worker";
