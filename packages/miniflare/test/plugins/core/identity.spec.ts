import { Miniflare, Response, convertV4MiniflareOptions } from "miniflare";
import { test, vi } from "vitest";
import { singleModuleManifest, useDispose } from "../../test-shared";

const script = `export default {
  async fetch(request, env) {
    const errors = [];
    for (const call of [
      () => env.IDENTITY.getToken(),
      () => env.IDENTITY.getAuthorizationGrant({authorizationServer: "https://auth.example"}),
      () => env.IDENTITY.fetch("https://api.example", {method: "POST", body: "private"}),
    ]) {
      try { await call(); errors.push("unexpected success"); }
      catch (error) { errors.push(error.message); }
    }
    return Response.json(errors);
  }
};`;

for (const legacy of [false, true]) {
	test(`identity calls fail without outbound requests (${legacy ? "legacy" : "config"})`, async ({
		expect,
	}) => {
		const outbound = vi.fn(() => new Response("unexpected outbound request"));
		const identity = { audience: "urn:inventory" };
		const mf = new Miniflare(
			legacy
				? convertV4MiniflareOptions({
						modules: true,
						script,
						compatibilityDate: "2026-01-01",
						compatibilityFlags: ["workers_oidc"],
						identities: { IDENTITY: identity },
						outboundService: outbound,
					})
				: {
						workers: [
							{
								config: {
									name: "test",
									compatibilityDate: "2026-01-01",
									compatibilityFlags: ["workers_oidc"],
									env: { IDENTITY: { type: "identity", ...identity } },
									manifest: singleModuleManifest(script),
								},
								dev: {
									outboundService: { type: "fetcher", handler: outbound },
								},
							},
						],
					}
		);
		useDispose(mf);
		const response = await mf.dispatchFetch("http://localhost/");
		const errors = (await response.json()) as string[];
		expect(errors).toHaveLength(3);
		for (const error of errors) {
			expect(error).toContain(
				"Identity issuance is unavailable in local development"
			);
			expect(error).toContain("deployed Preview");
		}
		expect(outbound).not.toHaveBeenCalled();
	});
}
