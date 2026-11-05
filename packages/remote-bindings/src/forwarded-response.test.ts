import { Miniflare } from "miniflare";
import { test } from "vitest";
import remoteBindingsWorkerSource from "worker:remoteBindings/ProxyServerWorker";

// This exercises the retained server template. Access detection and marker
// stripping belong to the published Miniflare client, not this workspace.
test.for([200, 302, 403])(
	"marks a binding's %s response without changing its contents",
	async (status, { expect, onTestFinished }) => {
		const miniflare = new Miniflare({
			workers: [
				{
					config: {
						name: "forwarded-response-proxy",
						compatibilityDate: "2026-11-03",
						manifest: {
							mainModule: "index.mjs",
							modules: {
								"proxy.mjs": {
									type: "esm",
									contents: remoteBindingsWorkerSource,
								},
								"index.mjs": {
									type: "esm",
									contents: `
import proxy from "./proxy.mjs";
export default {
  fetch(request, env, ctx) {
    return proxy.fetch(request, {
      SERVICE: { fetch() {
        return new Response("Cloudflare Access from the binding", {
          status: ${status},
          headers: {
            "Location": "https://team.cloudflareaccess.com/cdn-cgi/access/login/worker",
            "MF-Forwarded-Response": "binding-supplied-value",
            "X-Binding": "preserved"
          }
        });
      } }
    }, ctx);
  }
};`,
								},
							},
						},
						env: {},
					},
				},
			],
		});
		onTestFinished(() => miniflare.dispose());
		const response = await miniflare.dispatchFetch("http://localhost", {
			headers: { "MF-Binding": "SERVICE" },
			redirect: "manual",
		});
		expect(response.status).toBe(status);
		expect(response.headers.get("MF-Forwarded-Response")).toBe("true");
		expect(response.headers.get("X-Binding")).toBe("preserved");
		expect(response.headers.get("Location")).toBe(
			"https://team.cloudflareaccess.com/cdn-cgi/access/login/worker"
		);
		expect(await response.text()).toBe("Cloudflare Access from the binding");
	}
);
