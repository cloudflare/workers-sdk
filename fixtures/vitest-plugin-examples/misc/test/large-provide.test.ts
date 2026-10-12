// Regression test for #9957: In v3, `provide` data was sent via HTTP headers
// (~8 KB limit). v4 sends provide data through WebSocket messages (32 MiB
// limit). This test injects a 50 KB string provided by global-setup.ts.
import { inject, it } from "vitest";

it("receives 50 KB of provided data without truncation", ({ expect }) => {
	const data = inject("largePayload" as never);
	expect(data).toBeDefined();
	expect(typeof data).toBe("string");
	expect((data as string).length).toBe(50_000);
	expect(data).toBe("x".repeat(50_000));
});
