import { readFile } from "node:fs/promises";
import { afterEach, describe, test, vi } from "vitest";
import handleProxy from "../../templates/common/js/src/proxy";
import handleRedirect from "../../templates/common/js/src/redirect";

const TEMPLATE_LANGUAGES = ["js", "ts"] as const satisfies string[];

afterEach(() => {
	vi.restoreAllMocks();
});

describe("common template", () => {
	test("the proxy uses a fixed destination", async ({ expect }) => {
		const request = new Request(
			"https://worker.example/proxy?modify&proxyUrl=https://attacker.invalid/"
		);
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response("proxied"));

		const response = await handleProxy.fetch(request, undefined, undefined);

		expect(fetchMock).toHaveBeenCalledWith("https://example.com/", request);
		expect(response.headers.get("X-My-Header")).toBe("My Header Value");
	});

	test("the redirect uses a fixed destination", async ({ expect }) => {
		const request = new Request(
			"https://worker.example/redirect?redirectUrl=https://attacker.invalid/"
		);

		const response = await handleRedirect.fetch(request, undefined, undefined);

		expect(response.headers.get("Location")).toBe("https://example.com/");
	});

	for (const language of TEMPLATE_LANGUAGES) {
		test(`the ${language} proxy cannot use a request-controlled destination`, async ({
			expect,
		}) => {
			const source = await readFile(
				new URL(
					`../../templates/common/${language}/src/proxy.${language}`,
					import.meta.url
				),
				"utf8"
			);

			expect(source).toContain("const PROXY_URL = 'https://example.com/';");
			expect(source).toContain("fetch(PROXY_URL, request)");
			expect(source).not.toContain("searchParams.get('proxyUrl')");
		});

		test(`the ${language} redirect cannot use a request-controlled destination`, async ({
			expect,
		}) => {
			const source = await readFile(
				new URL(
					`../../templates/common/${language}/src/redirect.${language}`,
					import.meta.url
				),
				"utf8"
			);

			expect(source).toContain("const REDIRECT_URL = 'https://example.com/';");
			expect(source).toContain("Response.redirect(REDIRECT_URL)");
			expect(source).not.toContain("searchParams.get('redirectUrl')");
		});
	}
});
