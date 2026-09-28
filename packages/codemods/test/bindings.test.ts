import { describe, it } from "vitest";
import { convertBindings } from "../src/codemods/wrangler-to-cf/bindings";
import type { MigrationFollowUp } from "../src/codemods/wrangler-to-cf/types";

describe("Wrangler binding conversion", () => {
	it("converts supported bindings and reports manual work", ({ expect }) => {
		const imports = new Set<string>();
		const followUps: MigrationFollowUp[] = [];
		const bindings = convertBindings(
			{
				ai: { binding: "AI", remote: true },
				assets: { binding: "ASSETS" },
				d1_databases: [
					{
						binding: "DB",
						database_id: "database-id",
						database_name: "database",
						preview_database_id: "preview-id",
						remote: true,
					},
				],
				dispatch_namespaces: [
					{
						binding: "DISPATCH",
						namespace: "namespace",
						outbound: {
							environment: "staging",
							service: "outbound",
						},
					},
				],
				durable_objects: {
					bindings: [{ class_name: "Counter", name: "COUNTER" }],
				},
				kv_namespaces: [{ binding: "CACHE", id: "namespace-id" }],
				name: "worker",
				queues: {
					producers: [
						{
							binding: "QUEUE",
							delivery_delay: 5,
							queue: "jobs",
						},
					],
				},
				secrets: { required: ["API_TOKEN"] },
				send_email: [
					{
						allowed_destination_addresses: [],
						name: "EMAIL",
					},
				],
				services: [
					{
						binding: "SERVICE",
						environment: "staging",
						service: "backend",
					},
				],
				unsafe: {
					bindings: [{ name: "UNSAFE", type: "example", value: true }],
				},
				vars: { JSON: { enabled: true }, TEXT: "value" },
				version_metadata: { binding: "VERSION" },
				workflows: [{ binding: "WORKFLOW", name: "workflow" }],
			},
			"",
			imports,
			(followUp) => followUps.push(followUp)
		);

		expect({
			bindings,
			followUps,
			imports: [...imports],
		}).toMatchSnapshot();
	});

	it("reports invalid and duplicate binding names", ({ expect }) => {
		const followUps: MigrationFollowUp[] = [];
		convertBindings(
			{
				kv_namespaces: [
					{ binding: "", id: "invalid" },
					{ binding: "DUPLICATE", id: "first" },
				],
				vars: { DUPLICATE: "second" },
			},
			"",
			new Set(),
			(followUp) => followUps.push(followUp)
		);

		expect(followUps.map(({ code }) => code)).toEqual([
			"invalid-binding",
			"binding-name-collision",
		]);
	});

	it("converts a Hyperdrive local connection string", ({ expect }) => {
		const followUps: MigrationFollowUp[] = [];
		const bindings = convertBindings(
			{
				hyperdrive: [
					{
						binding: "DATABASE",
						id: "hyperdrive-id",
						localConnectionString: "postgres://localhost/database",
					},
				],
			},
			"",
			new Set(),
			(followUp) => followUps.push(followUp)
		);

		expect(bindings).toEqual({
			kind: "object",
			properties: [
				{
					key: "DATABASE",
					value: {
						args: [
							{
								kind: "object",
								properties: [
									{ key: "id", value: "hyperdrive-id" },
									{
										key: "dev",
										value: {
											kind: "object",
											properties: [
												{
													key: "connectionString",
													value: "postgres://localhost/database",
												},
											],
										},
									},
								],
							},
						],
						callee: "bindings.hyperdrive",
						kind: "call",
					},
				},
			],
		});
		expect(followUps).toEqual([]);
	});

	it("converts R2 local S3 credentials with remote development", ({
		expect,
	}) => {
		const followUps: MigrationFollowUp[] = [];
		const bindings = convertBindings(
			{
				r2_buckets: [
					{
						binding: "BUCKET",
						bucket_name: "bucket-name",
						local_dev: {
							experimental_s3_credentials: {
								accessKeyId: "access-key-id",
								secretAccessKey: "secret-access-key",
							},
						},
						remote: true,
					},
				],
			},
			"",
			new Set(),
			(followUp) => followUps.push(followUp)
		);

		expect(bindings).toEqual({
			kind: "object",
			properties: [
				{
					key: "BUCKET",
					value: {
						args: [
							{
								kind: "object",
								properties: [
									{ key: "name", value: "bucket-name" },
									{
										key: "dev",
										value: {
											kind: "object",
											properties: [
												{ key: "remote", value: true },
												{
													key: "experimentalS3Credentials",
													value: {
														kind: "object",
														properties: [
															{
																key: "accessKeyId",
																value: "access-key-id",
															},
															{
																key: "secretAccessKey",
																value: "secret-access-key",
															},
														],
													},
												},
											],
										},
									},
								],
							},
						],
						callee: "bindings.r2",
						kind: "call",
					},
				},
			],
		});
		expect(followUps).toEqual([]);
	});
});
