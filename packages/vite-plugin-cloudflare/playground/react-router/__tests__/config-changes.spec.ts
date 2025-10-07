import * as path from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
	getTextResponse,
	isBuild,
	mockFileChange,
	WAIT_FOR_OPTIONS,
} from "../../__test-utils__";

describe("react-router integration", () => {
	test.runIf(!isBuild)(
		"successfully updates when a var is updated in the Worker config",
		async () => {
			await vi.waitFor(
				async () =>
					expect(await getTextResponse()).toContain(
						"Message: Hello from Cloudflare"
					),
				WAIT_FOR_OPTIONS
			);

			mockFileChange(path.join(__dirname, "../wrangler.json"), (content) =>
				JSON.stringify({
					...JSON.parse(content),
					vars: {
						VALUE_FROM_CLOUDFLARE: "Server restarted",
					},
				})
			);

			await vi.waitFor(
				async () =>
					expect(await getTextResponse()).toContain(
						"Message: Server restarted"
					),
				WAIT_FOR_OPTIONS
			);
		}
	);
});
