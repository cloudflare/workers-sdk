import { http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { stripHeader } from "../../../api/startDevWorker/utils";
import { msw } from "../../helpers/msw";

describe("utils - stripHeader", () => {
	it("should remove the specified header from the request", async () => {
		const mockFetch = vi.fn(async (_) => {
			return new Response("mock response", {
				headers: { "some-other-header": "value" },
				status: 200,
			});
		});

		msw.use(http.get("*", mockFetch));

		const headers = new Headers();
		headers.set("cf-connecting-ip", "test-value");
		const request = new Request("http://localhost", { headers });

		const strip = stripHeader("cf-connecting-ip");
		const response = await strip(request);

		expect(mockFetch).toHaveBeenCalledTimes(1);

		expect(
			mockFetch.mock.calls[0][0].request.headers.has("cf-connecting-ip")
		).toBe(false);

		console.log(mockFetch.mock.calls[0][0].request.headers.entries());
		expect(await response.text()).toBe("mock response");
		expect(response.headers.get("some-other-header")).toBe("value");
		expect(response.status).toBe(200);
	});
});
