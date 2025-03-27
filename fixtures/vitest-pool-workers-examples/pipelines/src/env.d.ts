interface Env {
	PIPELINE: import("cloudflare:pipelines").Pipeline<
		import("cloudflare:pipelines").PipelineRecord
	>;
}
