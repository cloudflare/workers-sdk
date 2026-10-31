import { Miniflare, Response, convertV4MiniflareOptions } from "miniflare";
import { test, vi } from "vitest";
import { singleModuleManifest, useDispose } from "../../test-shared";

const script = `export default {
  async fetch(request, env) {
    const errors = [];
    for (const call of [
      () => env.IDENTITY.getToken(),
      () => env.IDENTITY.getIdentity(),
      () => env.IDENTITY.getIdentity("customer_x"),
      () => env.IDENTITY.getAuthorizationGrant({authorizationServer: "https://auth.example"}),
      () => env.IDENTITY.fetch("https://api.example", { method: "POST", body: "private" }),

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
						identities: { IDENTITY: identity },
						outboundService: outbound,
					})
				: {
						workers: [
							{
								config: {
									name: "test",
									compatibilityDate: "2026-01-01",
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
		expect(errors).toHaveLength(5);
		expect(errors[4]).toContain("Use getIdentity().fetch()");
		for (const error of errors) {
			expect(error).toContain(
				"Identity issuance is unavailable in local development"
			);
			expect(error).toContain("deployed Preview");
		}
		expect(outbound).not.toHaveBeenCalled();
	});
}

// This contract needs the companion runtime until its published release lands.
// No local polyfill may turn decoding or a mocked claim into verified identity.
test.skipIf(!process.env.MINIFLARE_WORKERD_PATH)(
	"runtime caller needs no binding and distinguishes missing from unavailable",
	async ({ expect }) => {
		const outbound = vi.fn(() => new Response("unexpected outbound request"));
		const mf = new Miniflare({
			workers: [
				{
					config: {
						name: "receiver",
						compatibilityDate: "2026-10-31",
						manifest:
							singleModuleManifest(`export default { async fetch(request, env, ctx) {
				try { const caller = await ctx.identity.caller(); return Response.json({caller}); }
				catch (error) { return Response.json({name:error.name}); }
			}}`),
					},
					dev: { outboundService: { type: "fetcher", handler: outbound } },
				},
			],
		});
		useDispose(mf);
		expect(await (await mf.dispatchFetch("http://localhost/")).json()).toEqual({
			caller: null,
		});
		expect(
			await (
				await mf.dispatchFetch("http://localhost/", {
					headers: { authorization: "Bearer credential" },
				})
			).json()
		).toEqual({ name: "WorkloadIdentityUnavailableError" });
		expect(outbound).not.toHaveBeenCalled();
	}
);
