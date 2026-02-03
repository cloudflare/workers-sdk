import {
	createExecutionContext,
	env,
	waitOnExecutionContext,
} from "cloudflare:test";
import { afterEach, it, vi } from "vitest";
import worker from "../src/index";

// This will improve in the next major version of `@cloudflare/workers-types`,
// but for now you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

afterEach(() => {
	vi.restoreAllMocks();
});

it("produces message to pipeline", async ({ expect }) => {
	const mockPipeline = {
		send: vi.fn().mockResolvedValue(undefined),
	};

	const testEnv = {
		...env,
		PIPELINE: mockPipeline,
	};

	// Send data to pipeline
	const request = new IncomingRequest("https://example.com/ingest", {
		method: "POST",
		body: "value",
	});
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, testEnv, ctx);
	await waitOnExecutionContext(ctx);

	expect(response.status).toBe(202);
	expect(await response.text()).toBe("Accepted");

	// Check `PIPELINE.send()` was called
	expect(mockPipeline.send).toBeCalledTimes(1);
	expect(mockPipeline.send).toBeCalledWith([
		{ method: "POST", url: "https://example.com/ingest" },
	]);
});
