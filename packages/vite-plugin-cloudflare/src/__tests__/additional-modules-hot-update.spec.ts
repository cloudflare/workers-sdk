import { describe, test, vi } from "vitest";
import { additionalModulesPlugin } from "../plugins/additional-modules";

// Issue #15525: the root `index.html`, resolved by Vite as a default entry
// (`isEntry`/`scan`) in a Worker environment, must not trigger a server restart.
describe("additional-modules hotUpdate", () => {
	async function setup(resolveOptions: Record<string, unknown>, file: string) {
		const plugin = additionalModulesPlugin({} as never) as any;
		const resolveContext = {
			resolve: async (source: string) => ({ id: file, source }),
		};
		await plugin.resolveId.handler.call(
			resolveContext,
			"index.html",
			undefined,
			resolveOptions
		);
		const restart = vi.fn().mockResolvedValue(undefined);
		plugin.hotUpdate({ file, server: { restart } });
		return restart;
	}

	test("restarts for a Worker-imported html file", async ({ expect }) => {
		const restart = await setup({ isEntry: false }, "/root/template.html");
		expect(restart).toHaveBeenCalled();
	});

	test("does not restart for the client's root index.html entry", async ({
		expect,
	}) => {
		const restart = await setup(
			{ isEntry: true, scan: true },
			"/root/index.html"
		);
		expect(restart).not.toHaveBeenCalled();
	});
});
