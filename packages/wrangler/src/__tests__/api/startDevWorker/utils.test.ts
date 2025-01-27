import { describe, expect, it, vi } from "vitest";
import { stripHeader } from "../../../api/startDevWorker/utils";

describe("utils - stripHeader", () => {
	it("should remove the specified header from the request", async () => {
		const mockFetch = vi.fn(async (_: Request) => {
			return new Response("mock response", {
				headers: { "some-other-header": "value" },
				status: 200,
			});
		});

		global.fetch = mockFetch as typeof global.fetch;

		const headers = new Headers();
		headers.set("cf-connecting-ip", "test-value");
		const request = new Request("http://localhost", { headers });

		const strip = stripHeader("cf-connecting-ip");
		const response = await strip(request);

		expect(mockFetch).toHaveBeenCalledTimes(1);

		const fetchCallArguments = mockFetch.mock.calls[0] || [];
		const strippedRequest = fetchCallArguments[0] as Request;

		expect(strippedRequest.headers.has("cf-connecting-ip")).toBe(false);

		expect(await response.text()).toBe("mock response");
		expect(response.headers.get("some-other-header")).toBe("value");
		expect(response.status).toBe(200);
	});
});
