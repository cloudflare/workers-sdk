/**
 * Route patterns to telemetry names mapping.
 * Order matters - more specific patterns must come first.
 */
const ROUTE_PATTERNS: [RegExp, string][] = [
	[/^\/storage\/kv\/namespaces\/[^/]+\/bulk\/get$/, "kv.bulk_get"],
	[/^\/storage\/kv\/namespaces\/[^/]+\/values\/[^/]+$/, "kv.value"],
	[/^\/storage\/kv\/namespaces\/[^/]+\/keys$/, "kv.keys"],
	[/^\/storage\/kv\/namespaces$/, "kv.namespaces"],
	[/^\/d1\/database\/[^/]+\/raw$/, "d1.query"],
	[/^\/d1\/database$/, "d1.databases"],
	[/^\/workers\/durable_objects\/namespaces\/[^/]+\/query$/, "do.query"],
	[/^\/workers\/durable_objects\/namespaces\/[^/]+\/objects$/, "do.objects"],
	[/^\/workers\/durable_objects\/namespaces$/, "do.namespaces"],
	[/^\/r2\/buckets\/[^/]+\/objects\/[^/]+$/, "r2.object"],
	[/^\/r2\/buckets\/[^/]+\/objects$/, "r2.objects"],
	[/^\/r2\/buckets\/[^/]+$/, "r2.bucket"],
	[/^\/r2\/buckets$/, "r2.buckets"],
	[
		/^\/workflows\/[^/]+\/instances\/[^/]+\/events\/[^/]+$/,
		"workflows.instance.event",
	],
	[
		/^\/workflows\/[^/]+\/instances\/[^/]+\/status$/,
		"workflows.instance.status",
	],
	[/^\/workflows\/[^/]+\/instances\/[^/]+$/, "workflows.instance"],
	[/^\/workflows\/[^/]+\/instances$/, "workflows.instances"],
	[/^\/workflows\/[^/]+$/, "workflows.details"],
	[/^\/workflows$/, "workflows.list"],
	[/^\/local\/workers$/, "local.workers"],
];

/**
 * Convert API path to sanitized route name.
 * Strips IDs and converts to dot notation.
 */
export function getRouteName(path: string): string {
	// Remove /cdn-cgi/explorer/api prefix
	const apiPath = path.replace(/^\/cdn-cgi\/explorer\/api/, "");

	for (const [pattern, name] of ROUTE_PATTERNS) {
		if (pattern.test(apiPath)) {
			return name;
		}
	}

	return "unknown";
}
