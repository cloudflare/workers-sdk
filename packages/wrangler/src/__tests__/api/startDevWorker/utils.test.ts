import { assert, describe, it } from "vitest";
import {
	convertConfigBindingsToStartWorkerBindings,
	convertStartDevOptionsToBindings,
} from "../../../api/startDevWorker/binding-utils";
import {
	isSameUserWorkerOrigin,
	rewriteUrlInHeaderValue,
} from "../../../api/startDevWorker/utils";

describe("isSameUserWorkerOrigin", () => {
	const userWorker = { protocol: "http:", hostname: "localhost", port: "8787" };

	it("matches same-origin requests regardless of path or query", () => {
		// Regression guard for the ProxyWorker origin-vs-href fix: a request to a
		// non-root path (or with a query string) must still resolve to the same
		// UserWorker. An href comparison would fail all but "/" here, because
		// urlFromParts() yields an origin-only URL.
		assert(
			isSameUserWorkerOrigin(new URL("http://localhost:8787/"), userWorker)
		);
		assert(
			isSameUserWorkerOrigin(
				new URL("http://localhost:8787/users/1/accessible-locks"),
				userWorker
			)
		);
		assert(
			isSameUserWorkerOrigin(new URL("http://localhost:8787/x?a=1"), userWorker)
		);
	});

	it("does not match when the UserWorker origin changed (e.g. new port)", () => {
		assert(
			!isSameUserWorkerOrigin(new URL("http://localhost:8788/"), userWorker)
		);
		assert(
			!isSameUserWorkerOrigin(new URL("http://localhost:8787/some/path"), {
				protocol: "http:",
				hostname: "localhost",
				port: "8788",
			})
		);
	});

	it("does not match when there is no proxyData (UserWorker torn down)", () => {
		assert(
			!isSameUserWorkerOrigin(
				new URL("http://localhost:8787/some/path"),
				undefined
			)
		);
	});
});

describe("convertConfigBindingsToStartWorkerBindings", () => {
	it("converts config bindings into startWorker bindings", async ({
		expect,
	}) => {
		const result = convertConfigBindingsToStartWorkerBindings({
			kv_namespaces: [
				{
					id: "<kv_id>",
					binding: "MY_KV",
				},
			],
			ai: { binding: "AI" },
			browser: { binding: "BROWSER" },
			d1_databases: [
				{
					database_id: "<database_id>",
					database_name: "my-database",
					binding: "MY_DB",
				},
			],
			dispatch_namespaces: [
				{
					binding: "MY_DISPATCH_NAMESPACE",
					namespace: "namespace",
				},
			],
			durable_objects: {
				bindings: [
					{
						class_name: "MyDo",
						name: "MY_DO",
					},
				],
			},
			queues: {
				producers: [
					{
						binding: "MY_QUEUE_PRODUCER",
						queue: "my-queue",
					},
				],
				consumers: undefined,
			},
			r2_buckets: [
				{
					binding: "MY_R2",
					bucket_name: "my-bucket",
				},
			],
			services: [
				{
					binding: "MY_SERVICE",
					service: "my-service",
				},
			],
			stream: { binding: "MY_STREAM" },
			mtls_certificates: [
				{
					binding: "MTLS",
					certificate_id: "123",
				},
			],
			vectorize: [
				{
					binding: "MY_VECTORIZE",
					index_name: "idx",
				},
			],
			workflows: [
				{
					binding: "MY_WORKFLOW",
					name: "workflow",
					class_name: "MyWorkflow",
				},
			],
			vpc_services: [
				{
					binding: "MY_VPC_SERVICE",
					service_id: "0199295b-b3ac-7760-8246-bca40877b3e9",
				},
			],
			vpc_networks: [
				{
					binding: "MY_VPC_NETWORK",
					tunnel_id: "0399295b-b3ac-7760-8246-bca40877b3e1",
				},
				{
					binding: "MY_MESH_NETWORK",
					network_id: "some-network-id",
				},
			],
		});
		expect(result).toEqual({
			AI: {
				type: "ai",
			},
			BROWSER: {
				type: "browser",
			},
			MTLS: {
				certificate_id: "123",
				type: "mtls_certificate",
			},
			MY_DB: {
				database_id: "<database_id>",
				database_name: "my-database",
				type: "d1",
			},
			MY_DISPATCH_NAMESPACE: {
				namespace: "namespace",
				type: "dispatch_namespace",
			},
			MY_DO: {
				class_name: "MyDo",
				type: "durable_object_namespace",
			},
			MY_KV: {
				id: "<kv_id>",
				type: "kv_namespace",
			},
			MY_QUEUE_PRODUCER: {
				queue: "my-queue",
				queue_name: "my-queue",
				type: "queue",
			},
			MY_R2: {
				bucket_name: "my-bucket",
				type: "r2_bucket",
			},
			MY_SERVICE: {
				service: "my-service",
				type: "service",
			},
			MY_STREAM: {
				type: "stream",
			},
			MY_VECTORIZE: {
				index_name: "idx",
				type: "vectorize",
			},
			MY_WORKFLOW: {
				class_name: "MyWorkflow",
				name: "workflow",
				type: "workflow",
			},
			MY_VPC_SERVICE: {
				service_id: "0199295b-b3ac-7760-8246-bca40877b3e9",
				type: "vpc_service",
			},
			MY_VPC_NETWORK: {
				tunnel_id: "0399295b-b3ac-7760-8246-bca40877b3e1",
				type: "vpc_network",
			},
			MY_MESH_NETWORK: {
				network_id: "some-network-id",
				type: "vpc_network",
			},
		});
	});

	it("prioritizes preview values compared to their standard counterparts", async ({
		expect,
	}) => {
		const result = convertConfigBindingsToStartWorkerBindings({
			ai: undefined,
			browser: undefined,
			vectorize: [],
			d1_databases: [
				{
					binding: "MY_DB",
					database_id: "production-db-id",
					preview_database_id: "staging-db-id",
				},
			],
			dispatch_namespaces: [],
			durable_objects: {
				bindings: [],
			},
			queues: {
				producers: undefined,
				consumers: undefined,
			},
			r2_buckets: [
				{
					binding: "MY_R2",
					bucket_name: "production-bucket-name",
					preview_bucket_name: "staging-bucket-name",
				},
			],
			services: undefined,
			kv_namespaces: [
				{
					binding: "MY_KV",
					id: "production-kv-id",
					preview_id: "staging-kv-id",
				},
			],
			mtls_certificates: [],
			workflows: [],
			vpc_services: [],
		});

		assert(result);
		assert(result.MY_KV.type === "kv_namespace");
		expect(result.MY_KV.id).toBe("staging-kv-id");

		assert(result);
		assert(result.MY_R2.type === "r2_bucket");
		expect(result.MY_R2.bucket_name).toBe("staging-bucket-name");

		assert(result);
		assert(result.MY_DB.type === "d1");
		expect(result.MY_DB.database_id).toBe("staging-db-id");
	});

	it("converts programmatic dev stream bindings", ({ expect }) => {
		const result = convertStartDevOptionsToBindings({
			stream: { binding: "MY_STREAM", remote: true },
		});

		expect(result).toEqual({
			MY_STREAM: {
				remote: true,
				type: "stream",
			},
		});
	});
});

describe("rewriteUrlInHeaderValue", () => {
	// Response path: map the proxied host (`example.com`, inferred from `routes`)
	// back to the local dev address, matching the scenario in issue #14577.
	const from = new URL("http://example.com");
	const to = new URL("http://127.0.0.1:8788");

	it("rewrites a URL whose host is exactly the proxied host", ({ expect }) => {
		expect(
			rewriteUrlInHeaderValue("https://example.com/somewhere", from, to)
		).toBe(
			// scheme is swapped too, so the value points at the plain-HTTP dev address
			"http://127.0.0.1:8788/somewhere"
		);
	});

	it("does not corrupt a subdomain of the proxied host", ({ expect }) => {
		expect(
			rewriteUrlInHeaderValue("https://books.example.com/read/ch01", from, to)
		).toBe("https://books.example.com/read/ch01");
	});

	it("does not corrupt a host that merely contains the proxied host as a substring", ({
		expect,
	}) => {
		expect(
			rewriteUrlInHeaderValue("https://myexample.com/path", from, to)
		).toBe("https://myexample.com/path");
	});

	it("leaves an unrelated host untouched", ({ expect }) => {
		expect(
			rewriteUrlInHeaderValue("https://unrelated-domain.org/path", from, to)
		).toBe("https://unrelated-domain.org/path");
	});

	it("does not append a trailing slash to a bare origin (e.g. an Origin header)", ({
		expect,
	}) => {
		expect(rewriteUrlInHeaderValue("https://example.com", from, to)).toBe(
			"http://127.0.0.1:8788"
		);
	});

	it("preserves host-like substrings inside the query string", ({ expect }) => {
		expect(
			rewriteUrlInHeaderValue(
				"https://example.com/oauth?redirect_uri=https://example.com/next",
				from,
				to
			)
		).toBe("http://127.0.0.1:8788/oauth?redirect_uri=https://example.com/next");
	});

	it("maps the local dev address back to the proxied host (request path)", ({
		expect,
	}) => {
		expect(rewriteUrlInHeaderValue("http://127.0.0.1:8788/cb", to, from)).toBe(
			"http://example.com/cb"
		);
	});
});
