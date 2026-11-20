import { vi } from "vitest";

vi.mock("@cloudflare/cli-shared-helpers/streams", async () => {
	const { PassThrough } = await import("node:stream");
	return { stdout: new PassThrough(), stderr: new PassThrough() };
});
