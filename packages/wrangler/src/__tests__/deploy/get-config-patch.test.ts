import { describe, test } from "vitest";
import { getConfigPatch } from "../../deploy/config-diffs";

// Note: __old (as well as *__deleted) is the value in the remote config, __new is the value in the local one, so we do want the
//       __old one to override the __new

describe("getConfigPatch", () => {
	test("top level config updated", ({ expect }) => {
		expect(
			getConfigPatch({
				preview_urls: {
					__old: false,
					__new: true,
				},
			})
		).toEqual({
			preview_urls: false,
		});
	});

	test("env var present remotely but deleted locally", ({ expect }) => {
		expect(
			getConfigPatch({
				vars: {
					MY_VAR__deleted: "ABC",
				},
			})
		).toEqual({
			vars: {
				MY_VAR: "ABC",
			},
		});
	});

	test("updated value of env var", ({ expect }) => {
		expect(
			getConfigPatch({
				vars: {
					MY_VAR: {
						__old: "ABC",
						__new: "123",
					},
				},
			})
		).toEqual({
			vars: {
				MY_VAR: "ABC",
			},
		});
	});

	test("env var renamed", ({ expect }) => {
		expect(
			getConfigPatch({
				vars: {
					MY_VAR__deleted: "ABC",
					VAR__added: "ABC",
				},
			})
		).toEqual({
			vars: {
				MY_VAR: "ABC",
			},
		});
	});

	test("deleted version metadata binding", ({ expect }) => {
		expect(
			getConfigPatch({
				version_metadata: {
					__old: {
						binding: "VERSION_METADATA",
					},
					__new: undefined,
				},
			})
		).toEqual({
			version_metadata: {
				binding: "VERSION_METADATA",
			},
		});
	});

	test("deleted KV binding (only one KV)", ({ expect }) => {
		expect(
			getConfigPatch({
				kv_namespaces: [
					[
						"-",
						{
							id: "<kv-id>",
							binding: "MY_KV",
						},
					],
				],
			})
		).toEqual({
			kv_namespaces: [
				{
					id: "<kv-id>",
					binding: "MY_KV",
				},
			],
		});
	});

	test("deleted second KV binding in the kv_namespaces array", ({ expect }) => {
		expect(
			getConfigPatch({
				kv_namespaces: [
					[" "],
					[
						"-",
						{
							id: "<my-kv-a>",
							binding: "MY_KV_A",
						},
					],
				],
			})
		).toEqual({
			kv_namespaces: [
				{
					/* unmodified kv */
				},
				{
					id: "<my-kv-a>",
					binding: "MY_KV_A",
				},
			],
		});
	});

	test("modified KV binding", ({ expect }) => {
		expect(
			getConfigPatch({
				kv_namespaces: [
					[
						"~",
						{
							id: {
								__old: "<old-kv-id>",
								__new: "<new-kv-id>",
							},
						},
					],
				],
			})
		).toEqual({
			kv_namespaces: [
				{
					id: "<old-kv-id>",
				},
			],
		});
	});

	test("deleted second KV binding in the kv_namespaces array and modified first one", ({
		expect,
	}) => {
		expect(
			getConfigPatch({
				kv_namespaces: [
					[" "],
					[
						"-",
						{
							id: "<my-kv-a>",
							binding: "MY_KV_A",
						},
					],
				],
			})
		).toEqual({
			kv_namespaces: [
				{
					/* unmodified kv */
				},
				{
					id: "<my-kv-a>",
					binding: "MY_KV_A",
				},
			],
		});
	});

	test("deleted KV binding from the middle of the kv_namespaces array", ({
		expect,
	}) => {
		expect(
			getConfigPatch({
				kv_namespaces: [
					[" "],
					[
						"-",
						{
							id: "<my-kv-a>",
							binding: "MY_KV_A",
						},
					],
					[" "],
				],
			})
		).toEqual({
			kv_namespaces: [
				{
					/* unmodified kv */
				},
				{
					/* unmodified kv */
				},
				{
					/* deleted kv put back */
					id: "<my-kv-a>",
					binding: "MY_KV_A",
				},
			],
		});
	});

	test("flipped observability.logs.invocation_logs off (nested field)", ({
		expect,
	}) => {
		expect(
			getConfigPatch({
				observability: {
					logs: {
						invocation_logs: {
							__old: true,
							__new: false,
						},
					},
				},
			})
		).toEqual({
			observability: {
				logs: {
					invocation_logs: true,
				},
			},
		});
	});

	test("renamed version metadata binding", ({ expect }) => {
		expect(
			getConfigPatch({
				version_metadata: {
					binding: {
						__old: "VERSION_METADATA",
						__new: "VERSION_META",
					},
				},
			})
		).toEqual({
			version_metadata: {
				binding: "VERSION_METADATA",
			},
		});
	});

	test("configs get added/set to a target environment", ({ expect }) => {
		/*
			Note: in the remote configuration we don't know if a value is actually there because
			      inherited from the top level or not, so to be safe we just add it to the target
				  environment, this applies to all configurations besides the ones that are only
				  allowed at the top level
			*/
		expect(
			getConfigPatch(
				{
					preview_urls: {
						__old: false,
						__new: true,
					},
					kv_namespaces: [
						[
							"-",
							{
								id: "<my-kv>",
								binding: "MY_KV",
							},
						],
						[
							"-",
							{
								id: "<my-kv-a>",
								binding: "MY_KV_A",
							},
						],
					],
				},
				"staging"
			)
		).toEqual({
			env: {
				staging: {
					kv_namespaces: [
						{
							binding: "MY_KV",
							id: "<my-kv>",
						},
						{
							binding: "MY_KV_A",
							id: "<my-kv-a>",
						},
					],
					preview_urls: false,
				},
			},
		});
	});
});
