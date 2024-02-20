import test from "ava";
import { mergeWorkerOptions } from "miniflare";

test("merges options", (t) => {
	// Check options in `a` but not `b`
	// Check options in `b` but not `a`
	const a = { compatibilityDate: "2024-01-01" };
	let result = mergeWorkerOptions(a, { compatibilityFlags: ["nodejs_compat"] });
	t.deepEqual(result, {
		compatibilityDate: "2024-01-01",
		compatibilityFlags: ["nodejs_compat"],
	});
	t.is(result, a); // Check modifies `a`

	// Check array-valued option in both `a` and `b`
	result = mergeWorkerOptions(
		{ kvNamespaces: ["NAMESPACE_1"] },
		{ kvNamespaces: ["NAMESPACE_2"] }
	);
	t.deepEqual(result, {
		kvNamespaces: ["NAMESPACE_1", "NAMESPACE_2"],
	});
	result = mergeWorkerOptions(
		{ kvNamespaces: ["NAMESPACE_1"] },
		{ kvNamespaces: ["NAMESPACE_1", "NAMESPACE_2"] }
	);
	t.deepEqual(result, {
		kvNamespaces: ["NAMESPACE_1", "NAMESPACE_2"], // Primitives de-duped
	});
	result = mergeWorkerOptions(
		{ compatibilityFlags: ["global_navigator", "nodejs_compat"] },
		{ compatibilityFlags: ["nodejs_compat", "export_commonjs_default"] }
	);
	t.deepEqual(result, {
		compatibilityFlags: [
			"global_navigator",
			"nodejs_compat",
			"export_commonjs_default",
		], // Primitives de-duped
	});

	// Check object-valued option in both `a` and `b`
	result = mergeWorkerOptions(
		{ d1Databases: { DATABASE_1: "database-1" } },
		{ d1Databases: { DATABASE_2: "database-2" } }
	);
	t.deepEqual(result, {
		d1Databases: { DATABASE_1: "database-1", DATABASE_2: "database-2" },
	});
	result = mergeWorkerOptions(
		{ d1Databases: { DATABASE_1: "database-1" } },
		{ d1Databases: { DATABASE_1: "database-one", DATABASE_2: "database-two" } }
	);
	t.deepEqual(result, {
		d1Databases: { DATABASE_1: "database-one", DATABASE_2: "database-two" },
	});

	// Check array-valued option in `a` but object-valued option in `b`
	// Check object-valued option in `b` but array-valued option in `a`
	result = mergeWorkerOptions(
		{
			r2Buckets: ["BUCKET_1"],
			queueConsumers: { "queue-1": { maxBatchTimeout: 0 } },
		},
		{
			r2Buckets: { BUCKET_2: "bucket-2" },
			queueConsumers: ["queue-2"],
		}
	);
	t.deepEqual(result, {
		r2Buckets: { BUCKET_1: "BUCKET_1", BUCKET_2: "bucket-2" },
		queueConsumers: { "queue-1": { maxBatchTimeout: 0 }, "queue-2": {} },
	});

	// Check primitives in `a` and `b`
	result = mergeWorkerOptions(
		{ compatibilityDate: "2024-01-01" },
		{ compatibilityDate: "2024-02-02" }
	);
	t.deepEqual(result, { compatibilityDate: "2024-02-02" });

	// Check nested-objects not merged (e.g. service bindings, queue consumers, Durable Objects)
	result = mergeWorkerOptions(
		{
			serviceBindings: {
				DISK_SERVICE: { disk: { path: "/path/to/a", writable: true } },
				OTHER_SERVICE: "worker",
			},
			queueConsumers: {
				queue: { maxBatchTimeout: 0 },
			},
			durableObjects: {
				OBJECT_1: "Object1",
				OBJECT_2: {
					className: "Object2",
					scriptName: "worker2",
				},
			},
		},
		{
			serviceBindings: {
				DISK_SERVICE: { disk: { path: "/path/to/b" } },
			},
			queueConsumers: {
				queue: { maxBatchSize: 1 },
			},
			durableObjects: {
				OBJECT_1: {
					className: "Object1",
					scriptName: "worker1",
				},
				OBJECT_2: "Object2",
			},
		}
	);
	t.deepEqual(result, {
		serviceBindings: {
			DISK_SERVICE: { disk: { path: "/path/to/b" } },
			OTHER_SERVICE: "worker",
		},
		queueConsumers: {
			queue: { maxBatchSize: 1 },
		},
		durableObjects: {
			OBJECT_1: {
				className: "Object1",
				scriptName: "worker1",
			},
			OBJECT_2: "Object2",
		},
	});
});
