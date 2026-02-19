// This module is special. Rather than being externalised and returned by the
// module fallback service, it gets resolved and loaded by the
// `@cloudflare/vitest-pool-workers:config` Vite plugin. This allows us to
// inject a side-effect-only `import` for the configured `main` entrypoint.
// This registers a dependency on `main`, ensuring integration tests using
// `SELF` re-run when `main` changes.
export {
	env,
	SELF,
	runInDurableObject,
	runDurableObjectAlarm,
	listDurableObjectIds,
	createExecutionContext,
	waitOnExecutionContext,
	createScheduledController,
	createMessageBatch,
	getQueueResult,
	applyD1Migrations,
	createPagesEventContext,
	introspectWorkflowInstance,
	introspectWorkflow,
} from "cloudflare:test-internal";
