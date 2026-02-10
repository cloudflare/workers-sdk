import { PassThrough } from "node:stream";
import { vi } from "vitest";

vi.mock("log-update");

vi.mock("@cloudflare/cli/streams", () => {
	return {
		__esModule: true,
		stdout: new PassThrough(),
		stderr: new PassThrough(),
	};
});
