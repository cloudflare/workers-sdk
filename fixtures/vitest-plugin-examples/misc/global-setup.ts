// Regression test for #9957: In v3, `provide` data was sent via HTTP headers
// (~8 KB limit). Large payloads caused silent failures. v4 sends provide data
// through WebSocket messages (32 MiB limit).
import type { TestProject } from "vitest/node";

export default function ({ provide }: TestProject) {
	// No ProvidedContext declaration for this key, so cast is needed
	(provide as (key: string, value: unknown) => void)(
		"largePayload",
		"x".repeat(50_000)
	);
}
