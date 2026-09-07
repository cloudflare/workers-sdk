import { describe, it } from "vitest";
import { exports as exportConfig } from "../exports";
import {
	BindingSchema,
	InputContainerSchema,
	InputSettingsSchema,
	InputWorkerSchema,
	OutputContainerSchema,
	OutputSettingsSchema,
	OutputWorkerSchema,
} from "../schema";
import type { ParsedInputWorkerConfig } from "../schema";

const baseConfig = {
	type: "worker",
	name: "my-worker",
	compatibilityDate: "2026-06-01",
} as const;

const baseContainer = {
	type: "container",
	name: "my-container",
	compatibilityDate: "2026-06-24",
	image: { dockerfile: "./Dockerfile" },
} as const;

describe("InputWorkerSchema", () => {
	describe("env singleton bindings", () => {
		it("accepts undefined env", ({ expect }) => {
			const result = InputWorkerSchema.safeParse({ ...baseConfig });

			expect(result.success).toBe(true);
		});

		it("accepts empty env", ({ expect }) => {
			const result = InputWorkerSchema.safeParse({ ...baseConfig, env: {} });

			expect(result.success).toBe(true);
		});

		it("accepts a single singleton binding of each type", ({ expect }) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				env: {
					MY_AI: { type: "ai" },
					MY_ASSETS: { type: "assets" },
					MY_BROWSER: { type: "browser" },
					MY_IMAGES: { type: "images" },
					MY_MEDIA: { type: "media" },
					MY_STREAM: { type: "stream" },
					MY_VERSION_METADATA: { type: "version-metadata" },
					MY_WEB_SEARCH: { type: "web-search" },
				},
			});

			expect(result.success).toBe(true);
		});

		it("accepts multiple non-singleton bindings of the same type", ({
			expect,
		}) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				env: {
					KV_1: { type: "kv" },
					KV_2: { type: "kv" },
					KV_3: { type: "kv" },
				},
			});

			expect(result.success).toBe(true);
		});

		it("accepts multiple agent-memory bindings", ({ expect }) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				env: {
					MEM_1: { type: "agent-memory", namespace: "ns-1" },
					MEM_2: { type: "agent-memory", namespace: "ns-2" },
				},
			});

			expect(result.success).toBe(true);
		});

		it("accepts binding options nested under dev", ({ expect }) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				env: {
					KV: { type: "kv", dev: { remote: true } },
					HYPERDRIVE: {
						type: "hyperdrive",
						id: "hyperdrive-id",
						dev: { connectionString: "postgres://localhost/database" },
					},
					R2: {
						type: "r2",
						dev: {
							remote: false,
							experimentalS3Credentials: {
								accessKeyId: "access-key",
								secretAccessKey: "secret-key",
							},
						},
					},
				},
			});

			expect(result.success).toBe(true);
		});

		it("rejects remote at the binding root", ({ expect }) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				env: { KV: { type: "kv", remote: true } },
			});

			expect(result.success).toBe(false);
		});

		it.for([
			["ai"],
			["assets"],
			["browser"],
			["images"],
			["media"],
			["stream"],
			["version-metadata"],
			["web-search"],
		] as const)("rejects two %s bindings", ([type], { expect }) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				env: {
					BINDING_1: { type },
					BINDING_2: { type },
				},
			});

			expect(result.success).toBe(false);

			if (!result.success) {
				expect(result.error.issues[0]?.message).toBe(
					`${type} bindings can only be defined once`
				);
			}
		});

		it("rejects multiple duplicate singleton types with 'and' message", ({
			expect,
		}) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				env: {
					AI_1: { type: "ai" },
					AI_2: { type: "ai" },
					ASSETS_1: { type: "assets" },
					ASSETS_2: { type: "assets" },
				},
			});

			expect(result.success).toBe(false);

			if (!result.success) {
				expect(result.error.issues[0]?.message).toBe(
					"ai and assets bindings can only be defined once"
				);
			}
		});

		it("rejects three duplicate singleton types with oxford comma", ({
			expect,
		}) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				env: {
					AI_1: { type: "ai" },
					AI_2: { type: "ai" },
					ASSETS_1: { type: "assets" },
					ASSETS_2: { type: "assets" },
					BROWSER_1: { type: "browser" },
					BROWSER_2: { type: "browser" },
				},
			});

			expect(result.success).toBe(false);

			if (!result.success) {
				expect(result.error.issues[0]?.message).toBe(
					"ai, assets, and browser bindings can only be defined once"
				);
			}
		});

		it("lists duplicates alphabetically regardless of input order", ({
			expect,
		}) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				env: {
					STREAM_1: { type: "stream" },
					STREAM_2: { type: "stream" },
					AI_1: { type: "ai" },
					AI_2: { type: "ai" },
				},
			});

			expect(result.success).toBe(false);

			if (!result.success) {
				expect(result.error.issues[0]?.message).toBe(
					"ai and stream bindings can only be defined once"
				);
			}
		});

		it("ignores non-singleton duplicates when reporting", ({ expect }) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				env: {
					AI_1: { type: "ai" },
					AI_2: { type: "ai" },
					KV_1: { type: "kv" },
					KV_2: { type: "kv" },
				},
			});

			expect(result.success).toBe(false);

			if (!result.success) {
				expect(result.error.issues[0]?.message).toBe(
					"ai bindings can only be defined once"
				);
			}
		});
	});

	describe("send-email bindings", () => {
		it.for([
			["no address restrictions", { type: "send-email" }],
			[
				"a destination address",
				{
					type: "send-email",
					destinationAddress: "destination@example.com",
				},
			],
			[
				"allowed destination addresses",
				{
					type: "send-email",
					allowedDestinationAddresses: ["destination@example.com"],
				},
			],
			[
				"sender restrictions without destination restrictions",
				{
					type: "send-email",
					allowedSenderAddresses: ["sender@example.com"],
				},
			],
			[
				"a destination address and sender restrictions",
				{
					type: "send-email",
					destinationAddress: "destination@example.com",
					allowedSenderAddresses: ["sender@example.com"],
				},
			],
			[
				"allowed destination addresses and sender restrictions",
				{
					type: "send-email",
					allowedDestinationAddresses: ["destination@example.com"],
					allowedSenderAddresses: ["sender@example.com"],
				},
			],
		] as const)("accepts %s", ([, binding], { expect }) => {
			expect(BindingSchema.safeParse(binding).success).toBe(true);
		});

		it("rejects both destination restriction forms", ({ expect }) => {
			const result = BindingSchema.safeParse({
				type: "send-email",
				destinationAddress: "destination@example.com",
				allowedDestinationAddresses: ["destination@example.com"],
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0]?.message).toBe(
					'"send-email" bindings cannot specify both "destinationAddress" and "allowedDestinationAddresses"'
				);
			}
		});
	});

	describe("entrypoint", () => {
		it("accepts a string entrypoint and passes it through unchanged", ({
			expect,
		}) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				entrypoint: "./src/index.ts",
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.entrypoint).toBe("./src/index.ts");
			}
		});

		it("accepts a namespace-like object and collapses it to the default export string", ({
			expect,
		}) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				entrypoint: { default: "./src/index.ts" },
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.entrypoint).toBe("./src/index.ts");
			}
		});

		it("rejects a namespace object whose default is not a string", ({
			expect,
		}) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				entrypoint: { default: 123 },
			});

			expect(result.success).toBe(false);
		});

		it("rejects a namespace object missing a default export", ({ expect }) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				entrypoint: { other: "value" },
			});

			expect(result.success).toBe(false);
		});

		it("accepts an undefined entrypoint", ({ expect }) => {
			const result = InputWorkerSchema.safeParse({ ...baseConfig });

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.entrypoint).toBeUndefined();
			}
		});
	});

	describe("unknown property rejection", () => {
		it("rejects unknown top-level keys (typo)", ({ expect }) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				// Typo: should be `compatibilityDate`
				compatibilityDates: "2025-01-01",
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const issue = result.error.issues.find(
					(i) => i.code === "unrecognized_keys"
				);
				expect(issue).toBeDefined();
				expect(issue?.path).toEqual([]);
				expect((issue as { keys?: string[] } | undefined)?.keys).toContain(
					"compatibilityDates"
				);
			}
		});

		it("rejects a top-level `manifest` field (included in output schema only)", ({
			expect,
		}) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				manifest: {
					type: "complete",
					mainModule: "index.js",
					modules: { "index.js": { type: "esm" } },
				},
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const issue = result.error.issues.find(
					(i) => i.code === "unrecognized_keys"
				);
				expect(issue).toBeDefined();
				expect(issue?.path).toEqual([]);
				expect((issue as { keys?: string[] } | undefined)?.keys).toContain(
					"manifest"
				);
			}
		});

		it("rejects unknown keys inside `assets`", ({ expect }) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				assets: {
					// Typo: should be `htmlHandling`
					htmlHnadling: "none",
				},
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const issue = result.error.issues.find(
					(i) => i.code === "unrecognized_keys"
				);
				expect(issue).toBeDefined();
				expect(issue?.path).toEqual(["assets"]);
				expect((issue as { keys?: string[] } | undefined)?.keys).toContain(
					"htmlHnadling"
				);
			}
		});

		it("rejects unknown keys inside a binding", ({ expect }) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				env: {
					MY_KV: {
						type: "kv",
						// Typo: should be `id`
						idd: "abc123",
					},
				},
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const issue = result.error.issues.find(
					(i) => i.code === "unrecognized_keys"
				);
				expect(issue).toBeDefined();
				expect(issue?.path).toEqual(["env", "MY_KV"]);
				expect((issue as { keys?: string[] } | undefined)?.keys).toContain(
					"idd"
				);
			}
		});

		it("rejects unknown keys inside `observability.logs`", ({ expect }) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				observability: {
					logs: {
						enabled: true,
						// Typo: should be `headSamplingRate`
						sampleRate: 0.5,
					},
				},
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const issue = result.error.issues.find(
					(i) => i.code === "unrecognized_keys"
				);
				expect(issue).toBeDefined();
				expect(issue?.path).toEqual(["observability", "logs"]);
				expect((issue as { keys?: string[] } | undefined)?.keys).toContain(
					"sampleRate"
				);
			}
		});

		it("accepts camelCase query string redaction configuration", ({
			expect,
		}) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				observability: {
					enabled: true,
					redactQueryString: true,
				},
			});

			expect(result.success).toBe(true);
		});

		it("rejects snake_case query string redaction configuration", ({
			expect,
		}) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				observability: {
					enabled: true,
					redact_query_string: true,
				},
			});

			expect(result.success).toBe(false);
		});

		it("rejects unknown keys inside a trigger", ({ expect }) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				triggers: [
					{
						type: "scheduled",
						schedule: "0 0 * * *",
						// Typo: not a real field
						cronz: "0 0 * * *",
					},
				],
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const issue = result.error.issues.find(
					(i) => i.code === "unrecognized_keys"
				);
				expect(issue).toBeDefined();
				expect(issue?.path).toEqual(["triggers", 0]);
				expect((issue as { keys?: string[] } | undefined)?.keys).toContain(
					"cronz"
				);
			}
		});

		it("accepts a connect trigger", ({ expect }) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				triggers: [
					{
						type: "connect",
						protocol: "tcp",
						port: 5432,
						address: "127.0.0.1",
					},
				],
			});

			expect(result.success).toBe(true);
		});

		it("rejects a connect trigger with an invalid protocol", ({ expect }) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				triggers: [{ type: "connect", protocol: "ftp", port: 5432 }],
			});

			expect(result.success).toBe(false);
		});

		it("rejects unknown keys inside a connect trigger", ({ expect }) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				triggers: [
					{
						type: "connect",
						protocol: "tcp",
						port: 5432,
						hostname: "127.0.0.1",
					},
				],
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const issue = result.error.issues.find(
					(i) => i.code === "unrecognized_keys"
				);
				expect(issue).toBeDefined();
				expect(issue?.path).toEqual(["triggers", 0]);
				expect((issue as { keys?: string[] } | undefined)?.keys).toContain(
					"hostname"
				);
			}
		});

		it("still accepts unknown keys on `unsafe:*` bindings (looseObject escape hatch)", ({
			expect,
		}) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				env: {
					MY_UNSAFE: {
						type: "unsafe:some-future-runtime-feature",
						unknownField: { nested: 123 },
						anotherUnknown: "ok",
					},
				},
			});

			expect(result.success).toBe(true);
		});

		it("passes the `unsafe:*` `type` through unchanged on parse", ({
			expect,
		}) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				env: {
					MY_UNSAFE: {
						type: "unsafe:ratelimit",
						namespace_id: "123",
					},
				},
			});

			expect(result.success).toBe(true);
			if (result.success) {
				const binding = result.data.env?.MY_UNSAFE as {
					type: string;
					namespace_id: string;
				};
				expect(binding.type).toBe("unsafe:ratelimit");
				expect(binding.namespace_id).toBe("123");
			}
		});

		it("rejects `unsafe:` (empty suffix)", ({ expect }) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				env: {
					MY_UNSAFE: { type: "unsafe:" },
				},
			});

			expect(result.success).toBe(false);
		});

		it("still accepts arbitrary binding names in `env` (record, not object)", ({
			expect,
		}) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				env: {
					MY_WEIRDLY_NAMED_BINDING_1234: { type: "kv" },
				},
			});

			expect(result.success).toBe(true);
		});
	});

	describe("vpc-network binding", () => {
		it("accepts a binding with `tunnelId`", ({ expect }) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				env: { V: { type: "vpc-network", tunnelId: "tun-1" } },
			});

			expect(result.success).toBe(true);
		});

		it("accepts a binding with `networkId`", ({ expect }) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				env: { V: { type: "vpc-network", networkId: "net-1" } },
			});

			expect(result.success).toBe(true);
		});

		it("rejects a binding with neither `tunnelId` nor `networkId`", ({
			expect,
		}) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				env: { V: { type: "vpc-network" } },
			});

			expect(result.success).toBe(false);
		});

		it("rejects a binding with both `tunnelId` and `networkId`", ({
			expect,
		}) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				env: {
					V: { type: "vpc-network", tunnelId: "tun-1", networkId: "net-1" },
				},
			});

			expect(result.success).toBe(false);
		});

		it("rejects unknown keys on a `vpc-network` binding", ({ expect }) => {
			const result = InputWorkerSchema.safeParse({
				...baseConfig,
				env: {
					V: { type: "vpc-network", tunnelId: "tun-1", unknownField: "x" },
				},
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const issue = result.error.issues.find(
					(i) => i.code === "unrecognized_keys"
				);
				expect(issue).toBeDefined();
				expect((issue as { keys?: string[] } | undefined)?.keys).toContain(
					"unknownField"
				);
			}
		});
	});
});

describe("InputContainerSchema", () => {
	it("accepts a Container with a Dockerfile", ({ expect }) => {
		const result = InputContainerSchema.safeParse(baseContainer);

		expect(result.success).toBe(true);
	});

	it("accepts a Container with an image reference", ({ expect }) => {
		const result = InputContainerSchema.safeParse({
			...baseContainer,
			image: { reference: "registry.example.com/my-image:latest" },
		});

		expect(result.success).toBe(true);
	});

	it("accepts all optional fields", ({ expect }) => {
		const result = InputContainerSchema.safeParse({
			...baseContainer,
			image: {
				dockerfile: "./container/Dockerfile",
				buildContext: "./container",
				buildVars: { NODE_VERSION: "24" },
			},
			maxInstances: 10,
			instanceType: { vcpu: 2, memoryMib: 4096, diskMb: 20_000 },
			schedulingPolicy: "regional",
			ssh: { enabled: true, port: 2222 },
			authorizedKeys: [{ name: "developer", publicKey: "ssh-ed25519 AAAA" }],
			trustedUserCaKeys: [{ publicKey: "ssh-ed25519 BBBB" }],
			constraints: {
				regions: ["ENAM", "WEUR", "APAC"],
				jurisdiction: "eu",
				cities: ["LHR"],
				tiers: [1, 2],
			},
			affinities: {
				colocation: "datacenter",
				hardwareGeneration: "highest-overall-performance",
			},
			rollout: {
				kind: "full-manual",
				stepPercentage: [10, 50, 100],
				activeGracePeriod: 300,
			},
			observability: {
				enabled: true,
				logs: { enabled: true },
				targetInstancePercentage: 25,
				targetInstanceCount: 2,
			},
			unsafe: { experimentalFeature: true },
		});

		expect(result.success).toBe(true);
	});

	it.for(["name", "compatibilityDate", "image"] as const)(
		"requires %s",
		(field, { expect }) => {
			const { [field]: _omitted, ...container } = baseContainer;
			const result = InputContainerSchema.safeParse(container);

			expect(result.success).toBe(false);
		}
	);

	it("rejects an empty name", ({ expect }) => {
		const result = InputContainerSchema.safeParse({
			...baseContainer,
			name: "",
		});

		expect(result.success).toBe(false);
	});

	it("requires type: 'container'", ({ expect }) => {
		const { type: _type, ...container } = baseContainer;

		expect(InputContainerSchema.safeParse(container).success).toBe(false);
	});

	it("rejects Docker build fields without a Dockerfile", ({ expect }) => {
		const result = InputContainerSchema.safeParse({
			...baseContainer,
			image: {
				reference: "registry.example.com/my-image:latest",
				buildContext: ".",
			},
		});

		expect(result.success).toBe(false);
	});

	it.for([
		{ description: "Dockerfile path", image: { dockerfile: "" } },
		{ description: "image reference", image: { reference: "" } },
	])("rejects an empty $description", ({ image }, { expect }) => {
		const result = InputContainerSchema.safeParse({
			...baseContainer,
			image,
		});

		expect(result.success).toBe(false);
	});

	it.for([-1, 1.5])(
		"rejects maxInstances of %s",
		(maxInstances, { expect }) => {
			const result = InputContainerSchema.safeParse({
				...baseContainer,
				maxInstances,
			});

			expect(result.success).toBe(false);
		}
	);

	it.for([
		["vcpu", 0.0624],
		["memoryMib", -1],
		["diskMb", -1],
	] as const)(
		"rejects an invalid custom instance type %s",
		([field, value], { expect }) => {
			const result = InputContainerSchema.safeParse({
				...baseContainer,
				instanceType: { [field]: value },
			});

			expect(result.success).toBe(false);
		}
	);

	it.for([-1, 0, 1.5, 65_536])(
		"rejects an SSH port of %s",
		(port, { expect }) => {
			const result = InputContainerSchema.safeParse({
				...baseContainer,
				ssh: { enabled: true, port },
			});

			expect(result.success).toBe(false);
		}
	);

	it("rejects an unsupported rollout step percentage", ({ expect }) => {
		const result = InputContainerSchema.safeParse({
			...baseContainer,
			rollout: { stepPercentage: 15 },
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.path).toEqual([
				"rollout",
				"stepPercentage",
			]);
		}
	});

	it.for([5, 10, 20, 25, 50, 100])(
		"accepts a rollout step percentage of %s",
		(stepPercentage, { expect }) => {
			const result = InputContainerSchema.safeParse({
				...baseContainer,
				rollout: { stepPercentage },
			});

			expect(result.success).toBe(true);
		}
	);

	it.for([
		{
			description: "empty",
			stepPercentage: [],
			path: ["rollout", "stepPercentage"],
		},
		{
			description: "out of range",
			stepPercentage: [5, 100],
			path: ["rollout", "stepPercentage", 0],
		},
		{
			description: "descending",
			stepPercentage: [50, 10, 100],
			path: ["rollout", "stepPercentage", 1],
		},
		{
			description: "not completed",
			stepPercentage: [10, 50],
			path: ["rollout", "stepPercentage", 1],
		},
	])(
		"rejects a $description rollout plan",
		({ stepPercentage, path }, { expect }) => {
			const result = InputContainerSchema.safeParse({
				...baseContainer,
				rollout: { stepPercentage },
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues.map((issue) => issue.path)).toContainEqual(
					path
				);
			}
		}
	);

	it("rejects more rollout steps than maximum instances", ({ expect }) => {
		const result = InputContainerSchema.safeParse({
			...baseContainer,
			maxInstances: 2,
			rollout: { stepPercentage: [10, 50, 100] },
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.path).toEqual([
				"rollout",
				"stepPercentage",
			]);
		}
	});

	it("rejects a negative rollout active grace period", ({ expect }) => {
		const result = InputContainerSchema.safeParse({
			...baseContainer,
			rollout: { activeGracePeriod: -1 },
		});

		expect(result.success).toBe(false);
	});

	it.for([
		{ targetInstancePercentage: -1 },
		{ targetInstancePercentage: 101 },
		{ targetInstanceCount: -1 },
		{ targetInstanceCount: 1.5 },
	])(
		"rejects an invalid observability target: %o",
		(observability, { expect }) => {
			const result = InputContainerSchema.safeParse({
				...baseContainer,
				observability,
			});

			expect(result.success).toBe(false);
		}
	);

	it("accepts observability target boundaries", ({ expect }) => {
		const result = InputContainerSchema.safeParse({
			...baseContainer,
			observability: {
				targetInstancePercentage: 100,
				targetInstanceCount: 0,
			},
		});

		expect(result.success).toBe(true);
	});

	it("rejects unsupported enum values", ({ expect }) => {
		const result = InputContainerSchema.safeParse({
			...baseContainer,
			instanceType: "standard",
			schedulingPolicy: "random",
		});

		expect(result.success).toBe(false);
	});
});

describe("OutputContainerSchema", () => {
	it("accepts a built image reference", ({ expect }) => {
		const result = OutputContainerSchema.safeParse({
			...baseContainer,
			image: { reference: "registry.example.com/my-image:digest" },
		});

		expect(result.success).toBe(true);
	});

	it("rejects a Dockerfile that has not been built", ({ expect }) => {
		const result = OutputContainerSchema.safeParse(baseContainer);

		expect(result.success).toBe(false);
	});

	it("rejects an empty image reference", ({ expect }) => {
		const result = OutputContainerSchema.safeParse({
			...baseContainer,
			image: { reference: "" },
		});

		expect(result.success).toBe(false);
	});

	it("validates rollout steps against maximum instances", ({ expect }) => {
		const result = OutputContainerSchema.safeParse({
			...baseContainer,
			image: { reference: "registry.example.com/my-image:digest" },
			maxInstances: 2,
			rollout: { stepPercentage: [10, 50, 100] },
		});

		expect(result.success).toBe(false);
	});

	it("rejects invalid custom instance resources", ({ expect }) => {
		const result = OutputContainerSchema.safeParse({
			...baseContainer,
			image: { reference: "registry.example.com/my-image:digest" },
			instanceType: { vcpu: 0, memoryMib: -1, diskMb: -1 },
		});

		expect(result.success).toBe(false);
	});

	it("rejects invalid observability targets", ({ expect }) => {
		const result = OutputContainerSchema.safeParse({
			...baseContainer,
			image: { reference: "registry.example.com/my-image:digest" },
			observability: { targetInstancePercentage: 101 },
		});

		expect(result.success).toBe(false);
	});
});

describe("OutputWorkerSchema", () => {
	it("accepts a config without manifest (assets-only mode)", ({ expect }) => {
		const result = OutputWorkerSchema.safeParse({ ...baseConfig });

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.manifest).toBeUndefined();
		}
	});

	it("accepts a config with a valid complete manifest", ({ expect }) => {
		const result = OutputWorkerSchema.safeParse({
			...baseConfig,
			manifest: {
				type: "complete",
				mainModule: "index.js",
				modules: {
					"index.js": { type: "esm" },
					"data.bin": { type: "data" },
				},
			},
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.manifest?.mainModule).toBe("index.js");
		}
	});

	it("accepts a partial manifest that omits its main module from modules.manifest", ({
		expect,
	}) => {
		const result = OutputWorkerSchema.safeParse({
			...baseConfig,
			manifest: {
				type: "partial",
				mainModule: "index.js",
				modules: { "other.js": { type: "cjs" } },
			},
		});

		expect(result.success).toBe(true);
	});

	it("rejects a partial manifest that includes its main module in modules.manifest", ({
		expect,
	}) => {
		const result = OutputWorkerSchema.safeParse({
			...baseConfig,
			manifest: {
				type: "partial",
				mainModule: "index.js",
				modules: { "index.js": { type: "esm" } },
			},
		});

		expect(result.success).toBe(false);
	});

	it("rejects an entrypoint field (included in input schema only)", ({
		expect,
	}) => {
		const result = OutputWorkerSchema.safeParse({
			...baseConfig,
			entrypoint: "./src/index.ts",
		});

		expect(result.success).toBe(false);
	});

	it("rejects a manifest with an unknown module type", ({ expect }) => {
		const result = OutputWorkerSchema.safeParse({
			...baseConfig,
			manifest: {
				type: "complete",
				mainModule: "index.js",
				modules: {
					"index.js": { type: "bogus-type" },
				},
			},
		});

		expect(result.success).toBe(false);
	});

	it("rejects a manifest without mainModule", ({ expect }) => {
		const result = OutputWorkerSchema.safeParse({
			...baseConfig,
			manifest: {
				type: "complete",
				modules: { "index.js": { type: "esm" } },
			},
		});

		expect(result.success).toBe(false);
	});

	it("rejects a complete manifest that does not include its main module", ({
		expect,
	}) => {
		const result = OutputWorkerSchema.safeParse({
			...baseConfig,
			manifest: {
				type: "complete",
				mainModule: "index.js",
				modules: {},
			},
		});

		expect(result.success).toBe(false);
	});

	it("rejects a manifest module entry with unknown keys", ({ expect }) => {
		const result = OutputWorkerSchema.safeParse({
			...baseConfig,
			manifest: {
				type: "complete",
				mainModule: "index.js",
				modules: {
					"index.js": { type: "esm", extra: "field" },
				},
			},
		});

		expect(result.success).toBe(false);
	});
});

describe("InputWorkerSchema type discriminant", () => {
	it("requires type: 'worker'", ({ expect }) => {
		const { type: _type, ...withoutType } = baseConfig;
		const result = InputWorkerSchema.safeParse(withoutType);

		expect(result.success).toBe(false);
	});
});

describe("InputSettingsSchema", () => {
	it("accepts a minimal settings config", ({ expect }) => {
		const result = InputSettingsSchema.safeParse({ type: "settings" });

		expect(result.success).toBe(true);
	});

	it("accepts accountId and complianceRegion", ({ expect }) => {
		const result = InputSettingsSchema.safeParse({
			type: "settings",
			accountId: "acc-123",
			complianceRegion: "fedramp-high",
		});

		expect(result.success).toBe(true);
	});

	it("rejects unknown fields", ({ expect }) => {
		const result = InputSettingsSchema.safeParse({
			type: "settings",
			name: "my-worker",
		});

		expect(result.success).toBe(false);
	});

	it("rejects `mode`, which is supplied at build time rather than declared", ({
		expect,
	}) => {
		const result = InputSettingsSchema.safeParse({
			type: "settings",
			mode: "staging",
		});

		expect(result.success).toBe(false);
	});
});

describe("OutputSettingsSchema", () => {
	it("accepts a mode alongside the settings fields", ({ expect }) => {
		const result = OutputSettingsSchema.safeParse({
			type: "settings",
			accountId: "acc-123",
			complianceRegion: "public",
			mode: "staging",
		});

		expect(result.success).toBe(true);
	});

	it("accepts a config without a mode", ({ expect }) => {
		const result = OutputSettingsSchema.safeParse({ type: "settings" });

		expect(result.success).toBe(true);
	});

	it("rejects a non-string mode", ({ expect }) => {
		const result = OutputSettingsSchema.safeParse({
			type: "settings",
			mode: 123,
		});

		expect(result.success).toBe(false);
	});

	it("rejects unknown fields", ({ expect }) => {
		const result = OutputSettingsSchema.safeParse({
			type: "settings",
			mode: "staging",
			name: "my-worker",
		});

		expect(result.success).toBe(false);
	});
});

describe("ExportSchema", () => {
	function parseExports(exports: unknown) {
		return InputWorkerSchema.safeParse({ ...baseConfig, exports });
	}

	it("accepts `container` on a live durable-object export", ({ expect }) => {
		const result = parseExports({
			MyDO: {
				type: "durable-object",
				storage: "sqlite",
				container: "my-container",
			},
		});

		expect(result.success).toBe(true);
	});

	it("accepts `container` on an expecting-transfer export", ({ expect }) => {
		const result = parseExports({
			Incoming: {
				type: "durable-object",
				state: "expecting-transfer",
				storage: "sqlite",
				transferFrom: "source-worker",
				container: "my-container",
			},
		});

		expect(result.success).toBe(true);
	});

	it("rejects `container` on a tombstone", ({ expect }) => {
		const result = parseExports({
			OldDO: {
				type: "durable-object",
				state: "deleted",
				container: "my-container",
			},
		});

		expect(result.success).toBe(false);
	});

	it("rejects a non-string `container`", ({ expect }) => {
		const result = parseExports({
			MyDO: { type: "durable-object", storage: "sqlite", container: 1 },
		});

		expect(result.success).toBe(false);
	});

	it("rejects `container` on a legacy-kv export", ({ expect }) => {
		const result = parseExports({
			MyDO: {
				type: "durable-object",
				storage: "legacy-kv",
				container: "my-container",
			},
		});

		expect(result.success).toBe(false);
	});

	it("rejects `container` on a legacy-kv expecting-transfer export", ({
		expect,
	}) => {
		const result = parseExports({
			Incoming: {
				type: "durable-object",
				state: "expecting-transfer",
				storage: "legacy-kv",
				transferFrom: "source-worker",
				container: "my-container",
			},
		});

		expect(result.success).toBe(false);
	});

	it("still accepts a legacy-kv export without a container", ({ expect }) => {
		const result = parseExports({
			MyDO: { type: "durable-object", storage: "legacy-kv" },
		});

		expect(result.success).toBe(true);
	});

	// Containers require the SQLite storage engine. The check below is the type
	// half of that rule: `tsc` checks this body (it is never called), so a missing
	// error fails `check:type` via the unused `@ts-expect-error` directives.
	it("forbids `container` on a legacy-kv export at the type level", ({
		expect,
	}) => {
		function typeAssertions() {
			exportConfig.durableObject({
				storage: "legacy-kv",
				// @ts-expect-error `container` requires `storage: "sqlite"`
				container: baseContainer,
			});

			exportConfig.durableObject({
				state: "expecting-transfer",
				storage: "legacy-kv",
				transferFrom: "source-worker",
				// @ts-expect-error `container` requires `storage: "sqlite"`
				container: baseContainer,
			});

			const _exports: NonNullable<ParsedInputWorkerConfig["exports"]> = {
				MyDO: {
					type: "durable-object",
					storage: "legacy-kv",
					// @ts-expect-error `container` requires `storage: "sqlite"`
					container: "my-container",
				},
			};

			// The permitted combinations must still compile.
			exportConfig.durableObject({
				storage: "sqlite",
				container: baseContainer,
			});
			exportConfig.durableObject({ storage: "legacy-kv" });
			exportConfig.durableObject({
				state: "expecting-transfer",
				storage: "sqlite",
				transferFrom: "source-worker",
				container: baseContainer,
			});
			exportConfig.durableObject({
				state: "expecting-transfer",
				storage: "legacy-kv",
				transferFrom: "source-worker",
			});

			return _exports;
		}

		expect(typeAssertions).toBeTypeOf("function");
	});
});
