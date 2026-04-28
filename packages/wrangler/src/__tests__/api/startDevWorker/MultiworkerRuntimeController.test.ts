import { describe, it, expect } from "vitest";

// Re-create the function here for testing since it's not exported
// Note: any changes to the function in MultiworkerRuntimeController.ts should be mirrored here
function namespaceLocalBindingIds(worker: {
	name?: string;
	d1Databases?: Record<
		string,
		string | { id?: string; remoteProxyConnectionString?: unknown }
	>;
	kvNamespaces?: Record<
		string,
		string | { id?: string; remoteProxyConnectionString?: unknown }
	>;
	r2Buckets?: Record<
		string,
		string | { id?: string; remoteProxyConnectionString?: unknown }
	>;
}) {
	const workerName = worker.name ?? "worker";
	const namespacedWorker = { ...worker };

	const namespaceBinding = (
		value: string | { id?: string; remoteProxyConnectionString?: unknown }
	): string | { id?: string; remoteProxyConnectionString?: unknown } => {
		if (
			typeof value === "object" &&
			value !== null &&
			"remoteProxyConnectionString" in value
		) {
			return value;
		}
		if (typeof value === "string") {
			return `${workerName}:${value}`;
		}
		if (typeof value === "object" && value !== null && "id" in value) {
			return { ...value, id: `${workerName}:${value.id}` };
		}
		return value;
	};

	if (namespacedWorker.d1Databases) {
		namespacedWorker.d1Databases = Object.fromEntries(
			Object.entries(namespacedWorker.d1Databases).map(([binding, value]) => [
				binding,
				namespaceBinding(value),
			])
		);
	}

	if (namespacedWorker.kvNamespaces) {
		namespacedWorker.kvNamespaces = Object.fromEntries(
			Object.entries(namespacedWorker.kvNamespaces).map(([binding, value]) => [
				binding,
				namespaceBinding(value),
			])
		);
	}

	if (namespacedWorker.r2Buckets) {
		namespacedWorker.r2Buckets = Object.fromEntries(
			Object.entries(namespacedWorker.r2Buckets).map(([binding, value]) => [
				binding,
				namespaceBinding(value),
			])
		);
	}

	return namespacedWorker;
}

describe("namespaceLocalBindingIds", () => {
	it("should namespace D1 databases with string IDs", ({ expect }) => {
		const worker = {
			name: "worker-a",
			d1Databases: {
				DB: "local-db",
			},
		};

		const result = namespaceLocalBindingIds(worker);

		expect(result.d1Databases).toEqual({
			DB: "worker-a:local-db",
		});
	});

	it("should namespace D1 databases with object IDs", ({ expect }) => {
		const worker = {
			name: "worker-a",
			d1Databases: {
				DB: { id: "local-db" },
			},
		};

		const result = namespaceLocalBindingIds(worker);

		expect(result.d1Databases).toEqual({
			DB: { id: "worker-a:local-db" },
		});
	});

	it("should NOT namespace remote D1 databases", ({ expect }) => {
		const worker = {
			name: "worker-a",
			d1Databases: {
				DB: {
					id: "remote-db",
					remoteProxyConnectionString: new URL("http://localhost:8080"),
				},
			},
		};

		const result = namespaceLocalBindingIds(worker);

		// Remote bindings should not be namespaced
		expect(result.d1Databases).toEqual({
			DB: {
				id: "remote-db",
				remoteProxyConnectionString: new URL("http://localhost:8080"),
			},
		});
	});

	it("should namespace KV namespaces with string IDs", ({ expect }) => {
		const worker = {
			name: "worker-b",
			kvNamespaces: {
				KV: "local-kv",
			},
		};

		const result = namespaceLocalBindingIds(worker);

		expect(result.kvNamespaces).toEqual({
			KV: "worker-b:local-kv",
		});
	});

	it("should namespace R2 buckets with string IDs", ({ expect }) => {
		const worker = {
			name: "worker-c",
			r2Buckets: {
				BUCKET: "local-bucket",
			},
		};

		const result = namespaceLocalBindingIds(worker);

		expect(result.r2Buckets).toEqual({
			BUCKET: "worker-c:local-bucket",
		});
	});

	it("should use 'worker' as default name if no name is provided", ({
		expect,
	}) => {
		const worker = {
			d1Databases: {
				DB: "local-db",
			},
		};

		const result = namespaceLocalBindingIds(worker);

		expect(result.d1Databases).toEqual({
			DB: "worker:local-db",
		});
	});

	it("should handle multiple bindings of different types", ({ expect }) => {
		const worker = {
			name: "my-worker",
			d1Databases: {
				DB1: "db1",
				DB2: "db2",
			},
			kvNamespaces: {
				KV1: "kv1",
			},
			r2Buckets: {
				BUCKET1: "bucket1",
				BUCKET2: "bucket2",
			},
		};

		const result = namespaceLocalBindingIds(worker);

		expect(result.d1Databases).toEqual({
			DB1: "my-worker:db1",
			DB2: "my-worker:db2",
		});
		expect(result.kvNamespaces).toEqual({
			KV1: "my-worker:kv1",
		});
		expect(result.r2Buckets).toEqual({
			BUCKET1: "my-worker:bucket1",
			BUCKET2: "my-worker:bucket2",
		});
	});

	it("should not modify worker without bindings", ({ expect }) => {
		const worker = {
			name: "empty-worker",
		};

		const result = namespaceLocalBindingIds(worker);

		expect(result).toEqual({
			name: "empty-worker",
		});
	});

	it("should demonstrate the problem being solved - two workers with same binding names", ({
		expect,
	}) => {
		// Worker A has a D1 database named "DB" with local ID "local"
		const workerA = {
			name: "worker-a",
			d1Databases: {
				DB: "local",
			},
		};

		// Worker B has a D1 database named "DB" with local ID "local"
		const workerB = {
			name: "worker-b",
			d1Databases: {
				DB: "local",
			},
		};

		// Before namespacing, both would have the same local ID "local"
		// After namespacing, they should have different IDs
		const namespacedA = namespaceLocalBindingIds(workerA);
		const namespacedB = namespaceLocalBindingIds(workerB);

		// The binding names should stay the same (what the worker code uses)
		expect(Object.keys(namespacedA.d1Databases!)).toEqual(["DB"]);
		expect(Object.keys(namespacedB.d1Databases!)).toEqual(["DB"]);

		// But the internal IDs should be different
		expect(namespacedA.d1Databases!.DB).toBe("worker-a:local");
		expect(namespacedB.d1Databases!.DB).toBe("worker-b:local");
		expect(namespacedA.d1Databases!.DB).not.toBe(namespacedB.d1Databases!.DB);
	});
});
