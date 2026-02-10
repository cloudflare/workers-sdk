import { SELF } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { it, vi } from "vitest";

it("can use context exports on the SELF worker", async ({ expect }) => {
	const response = await SELF.fetch("http://example.com");
	expect(await response.text()).toBe(
		"👋 Hello MainWorker from Main NamedEntryPoint!"
	);
});

it("can use context exports (parameterized with props) on the SELF worker", async ({
	expect,
}) => {
	const response = await SELF.fetch("http://example.com/props");
	expect(await response.text()).toBe(
		"👋 Hello MainWorker from Main NamedEntryPoint!\nAdditional props!!"
	);
});

it("will warn on missing context exports on the SELF worker", async ({
	expect,
}) => {
	const warnSpy = vi.spyOn(console, "warn");
	const response = await SELF.fetch("http://example.com/invalid-export");
	expect(await response.text()).toMatchInlineSnapshot(`"👋 undefined"`);
	expect(warnSpy).toHaveBeenCalledWith(
		"Attempted to access 'ctx.exports.InvalidExport', which was not defined for the main 'SELF' Worker.\n" +
			"Check that 'InvalidExport' is exported as an entry-point from the Worker.\n" +
			"The '@cloudflare/vitest-pool-workers' integration tries to infer these exports by analyzing the source code of the main Worker.\n"
	);
});

it("will warn on implicit re-exports that will exist in production but cannot not be guessed on the SELF worker", async ({
	expect,
}) => {
	// In this test, we are trying to access an entry-point that is wildcard (*) re-exported from a virtual module.
	// This virtual module is understood by Vitest and TypeScript but not the lightweight esbuild that we use to guess exports.
	const warnSpy = vi.spyOn(console, "warn");
	const response = await SELF.fetch("http://example.com/virtual-implicit");
	expect(await response.text()).toMatchInlineSnapshot(`"👋 undefined"`);
	expect(warnSpy).toHaveBeenCalledWith(
		"Attempted to access 'ctx.exports.ReexportedVirtualEntryPoint', which was not defined for the main 'SELF' Worker.\n" +
			"Check that 'ReexportedVirtualEntryPoint' is exported as an entry-point from the Worker.\n" +
			"The '@cloudflare/vitest-pool-workers' integration tries to infer these exports by analyzing the source code of the main Worker.\n"
	);
});

it("will still guess re-exports on the SELF worker that cannot be fully analyzed by esbuild", async ({
	expect,
}) => {
	// In this test, we are trying to access an entry-point that is explicitly re-exported from a virtual module.
	// Although esbuild cannot really analyze what is being re-exported, it can at least see that something is being re-exported with that name.
	const warnSpy = vi.spyOn(console, "warn");
	const response = await SELF.fetch("http://example.com/virtual-explicit");
	expect(await response.text()).toBe(
		"👋 Hello MainWorker from ExplicitVirtualEntryPoint!"
	);
});

it("can access configured virtual entry points on the SELF worker that cannot be fully analyzed by esbuild", async ({
	expect,
}) => {
	// In this test, we are trying to access an entry-point that is explicitly re-exported from a virtual module.
	// Although esbuild cannot really analyze what is being re-exported, it can at least see that something is being re-exported with that name.
	const warnSpy = vi.spyOn(console, "warn");
	const response = await SELF.fetch("http://example.com/virtual-configured");
	expect(await response.text()).toBe(
		"👋 Hello MainWorker from ConfiguredVirtualEntryPoint!"
	);
});

it("can access imported context exports for SELF worker", async ({
	expect,
}) => {
	const msg = await exports.NamedEntryPoint.greet();
	expect(msg).toMatchInlineSnapshot(
		`"Hello MainWorker from Main NamedEntryPoint!"`
	);
});
