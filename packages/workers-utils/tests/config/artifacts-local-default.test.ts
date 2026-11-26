import { describe, it, vi } from "vitest";
import { createArtifactsLocalDefaultWarner } from "../../src/config/artifacts-local-default";

const REPOS = { name: "REPOS", remote: undefined };

describe("createArtifactsLocalDefaultWarner", () => {
	it("warns about an omitted remote in a Wrangler config", ({ expect }) => {
		const warn = vi.fn();
		createArtifactsLocalDefaultWarner("wrangler")(
			{ id: "wrangler.jsonc", bindings: [REPOS] },
			warn
		);
		expect(warn).toHaveBeenCalledExactlyOnceWith(
			"Artifacts binding REPOS uses the local simulator by default. Set `remote: true` to use deployed repos, or `remote: false` to silence this warning."
		);
	});

	it("names `dev: { remote }` for cloudflare.config.ts bindings", ({
		expect,
	}) => {
		const warn = vi.fn();
		createArtifactsLocalDefaultWarner("cloudflare-config")(
			{ id: "/project", bindings: [REPOS] },
			warn
		);
		expect(warn).toHaveBeenCalledExactlyOnceWith(
			"Artifacts binding REPOS uses the local simulator by default. Set `dev: { remote: true }` to use deployed repos, or `dev: { remote: false }` to silence this warning."
		);
	});

	it("does not warn for an explicit setting", ({ expect }) => {
		const warn = vi.fn();
		createArtifactsLocalDefaultWarner("wrangler")(
			{
				id: "wrangler.jsonc",
				bindings: [
					{ name: "LOCAL", remote: false },
					{ name: "REMOTE", remote: true },
				],
			},
			warn
		);
		expect(warn).not.toHaveBeenCalled();
	});

	it("warns once per binding across config reloads", ({ expect }) => {
		const warn = vi.fn();
		const warnForDefault = createArtifactsLocalDefaultWarner("wrangler");
		warnForDefault({ id: "wrangler.jsonc", bindings: [REPOS] }, warn);
		warnForDefault(
			{
				id: "wrangler.jsonc",
				bindings: [REPOS, { name: "MORE", remote: undefined }],
			},
			warn
		);
		expect(warn.mock.calls.map(([message]) => message.split(" ")[2])).toEqual([
			"REPOS",
			"MORE",
		]);
	});

	it("warns separately for each project in one process", ({ expect }) => {
		const warn = vi.fn();
		const warnForDefault = createArtifactsLocalDefaultWarner("wrangler");
		warnForDefault({ id: "a/wrangler.jsonc", bindings: [REPOS] }, warn);
		warnForDefault({ id: "b/wrangler.jsonc", bindings: [REPOS] }, warn);
		expect(warn).toHaveBeenCalledTimes(2);
	});

	it("names the Worker, and warns for each Worker declaring the binding", ({
		expect,
	}) => {
		const warn = vi.fn();
		createArtifactsLocalDefaultWarner("cloudflare-config")(
			{
				id: "/project",
				bindings: [
					{ ...REPOS, worker: "api" },
					{ ...REPOS, worker: "jobs" },
				],
			},
			warn
		);
		expect(warn.mock.calls.map(([message]) => message)).toEqual([
			expect.stringMatching(/^Artifacts binding REPOS in Worker api uses /),
			expect.stringMatching(/^Artifacts binding REPOS in Worker jobs uses /),
		]);
	});
});
