import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { FilesystemWorkerRegistry } from "../dev-registry/FilesystemWorkerRegistry";
import type { WorkerDefinition } from "../dev-registry";
import type { Logger } from "../logger";

vi.mock("node:fs", async (importOriginal) => {
	const actual = (await importOriginal()) as object;
	return {
		...actual,
		utimesSync: vi.fn(),
	};
});

describe("FilesystemWorkerRegistry", () => {
	let tempDir: string;
	let registry: FilesystemWorkerRegistry;
	let logger: Logger;

	beforeEach(() => {
		logger = {
			debug: vi.fn(),
			error: vi.fn(),
		} as unknown as Logger;
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dev-registry-test-"));
		registry = new FilesystemWorkerRegistry(tempDir, logger);
		vi.useFakeTimers();
	});

	afterEach(async () => {
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch (e) {}
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("should initialize an empty registry", async () => {
		// Get the registered workers immediately after initialization
		const registeredWorkers = await registry.getRegisteredWorkers();

		// Assert that the registry is empty
		expect(registeredWorkers).toBeDefined();
		expect(Object.keys(registeredWorkers || {})).toHaveLength(0);

		// Verify that the registry directory is empty
		const registryDirPath = tempDir;
		const files = fs.readdirSync(registryDirPath);
		expect(files).toHaveLength(0);
	});

	it("should register a worker", async () => {
		const workerName = "test-worker";
		const workerDefinition: WorkerDefinition = {
			port: 8787,
			protocol: "http",
			host: "localhost",
			mode: "local",
			durableObjects: [],
		};

		// Register the worker
		await registry.registerWorker(workerName, workerDefinition);

		// Get the registered workers
		const registeredWorkers = await registry.getRegisteredWorkers();

		// Assert that the worker was registered
		expect(registeredWorkers).toBeDefined();
		expect(registeredWorkers?.[workerName]).toBeDefined();
		expect(registeredWorkers?.[workerName]).toEqual(
			expect.objectContaining(workerDefinition)
		);

		// Verify that the worker file was created
		const workerFilePath = path.join(tempDir, workerName);
		expect(fs.existsSync(workerFilePath)).toBe(true);

		// Read the file content and parse it
		const fileContent = fs.readFileSync(workerFilePath, "utf-8");
		const parsedContent = JSON.parse(fileContent);

		// Assert that the file content matches the worker definition
		expect(parsedContent).toEqual(expect.objectContaining(workerDefinition));
		expect(parsedContent.wranglerVersion).toBeDefined(); // Check that wranglerVersion is included
	});

	describe("should unregister a worker", () => {
		it("checking first to see that it is registered", async () => {
			const workerName = "test-worker";
			const workerDefinition: WorkerDefinition = {
				port: 8787,
				protocol: "http",
				host: "localhost",
				mode: "local",
				durableObjects: [],
			};

			// Register the worker
			await registry.registerWorker(workerName, workerDefinition);

			// Verify the worker is registered
			let registeredWorkers = await registry.getRegisteredWorkers();
			expect(registeredWorkers?.[workerName]).toBeDefined();

			// Unregister the worker
			await registry.unregisterWorker(workerName);

			// Verify the worker is no longer registered
			registeredWorkers = await registry.getRegisteredWorkers();
			expect(registeredWorkers?.[workerName]).toBeUndefined();

			// Verify that the worker file was removed
			const workerFilePath = path.join(tempDir, workerName);
			expect(fs.existsSync(workerFilePath)).toBe(false);
		});

		it("without waiting for confirmation that it is registered first", async () => {
			const workerName = "test-worker";
			const workerDefinition: WorkerDefinition = {
				port: 8787,
				protocol: "http",
				host: "localhost",
				mode: "local",
				durableObjects: [],
			};

			// Register the worker
			await registry.registerWorker(workerName, workerDefinition);

			// Unregister the worker
			await registry.unregisterWorker(workerName);

			// Verify the worker is no longer registered
			const registeredWorkers = await registry.getRegisteredWorkers();
			expect(registeredWorkers?.[workerName]).toBeUndefined();

			// Verify that the worker file was removed
			const workerFilePath = path.join(tempDir, workerName);
			expect(fs.existsSync(workerFilePath)).toBe(false);
		});
	});

	it("should handle registering multiple workers", async () => {
		const workers = [
			{
				name: "worker1",
				definition: {
					port: 8787,
					protocol: "http",
					host: "localhost",
					mode: "local",
					durableObjects: [],
				},
			},
			{
				name: "worker2",
				definition: {
					port: 8788,
					protocol: "https",
					host: "127.0.0.1",
					mode: "remote",
					durableObjects: [{ name: "DO1", className: "DurableObjectClass" }],
				},
			},
			{
				name: "worker3",
				definition: {
					port: 8789,
					protocol: "http",
					host: "0.0.0.0",
					mode: "local",
					durableObjects: [],
					headers: { "X-Custom-Header": "Value" },
				},
			},
		] as { name: string; definition: WorkerDefinition }[];

		// Register all workers
		for (const worker of workers) {
			await registry.registerWorker(worker.name, worker.definition);
		}

		// Get the registered workers
		const registeredWorkers = await registry.getRegisteredWorkers();

		// Verify all workers are registered correctly
		for (const worker of workers) {
			expect(registeredWorkers?.[worker.name]).toBeDefined();
			expect(registeredWorkers?.[worker.name]).toEqual(
				expect.objectContaining(worker.definition)
			);

			// Verify that each worker file was created
			const workerFilePath = path.join(tempDir, worker.name);
			expect(fs.existsSync(workerFilePath)).toBe(true);

			// Read the file content and parse it
			const fileContent = fs.readFileSync(workerFilePath, "utf-8");
			const parsedContent = JSON.parse(fileContent);

			// Assert that the file content matches the worker definition
			expect(parsedContent).toEqual(expect.objectContaining(worker.definition));
			expect(parsedContent.wranglerVersion).toBeDefined();
		}

		// Verify that the total number of registered workers is correct
		expect(Object.keys(registeredWorkers || {})).toHaveLength(workers.length);
	});

	it("should handle unregistering non-existent worker", async () => {
		const nonExistentWorkerName = "non-existent-worker";

		// Attempt to unregister a non-existent worker
		await registry.unregisterWorker(nonExistentWorkerName);

		// Verify that the registry state hasn't changed
		const registeredWorkers = await registry.getRegisteredWorkers();
		expect(Object.keys(registeredWorkers || {})).toHaveLength(0);

		// Verify that no file was created or modified for the non-existent worker
		const workerFilePath = path.join(tempDir, nonExistentWorkerName);
		expect(fs.existsSync(workerFilePath)).toBe(false);
	});

	it("should update an existing worker registration", async () => {
		const workerName = "test-worker";
		const initialDefinition: WorkerDefinition = {
			port: 8787,
			protocol: "http",
			host: "localhost",
			mode: "local",
			durableObjects: [],
		};

		const updatedDefinition: WorkerDefinition = {
			...initialDefinition,
			port: 8788,
			protocol: "https",
			headers: { "X-Custom-Header": "UpdatedValue" },
		};

		// Register the worker with initial definition
		await registry.registerWorker(workerName, initialDefinition);

		// Verify initial registration
		let registeredWorkers = await registry.getRegisteredWorkers();
		expect(registeredWorkers?.[workerName]).toEqual(
			expect.objectContaining(initialDefinition)
		);

		// Update the worker registration
		await registry.registerWorker(workerName, updatedDefinition);

		// Verify the updated registration
		registeredWorkers = await registry.getRegisteredWorkers();
		expect(registeredWorkers?.[workerName]).toEqual(
			expect.objectContaining(updatedDefinition)
		);

		// Verify that the worker file was updated
		const workerFilePath = path.join(tempDir, workerName);
		const fileContent = fs.readFileSync(workerFilePath, "utf-8");
		const parsedContent = JSON.parse(fileContent);
		expect(parsedContent).toEqual(expect.objectContaining(updatedDefinition));

		// Verify that the wranglerVersion is still present and unchanged
		expect(parsedContent.wranglerVersion).toBeDefined();

		// Verify that no error was logged during the update process
		expect(logger.error).not.toHaveBeenCalled();
	});

	it("should handle concurrent worker registrations", async () => {
		const workerCount = 10;
		const workers = Array.from({ length: workerCount }, (_, index) => ({
			name: `worker-${index}`,
			definition: {
				port: 8787 + index,
				protocol: index % 2 === 0 ? "http" : "https",
				host: "localhost",
				mode: "local",
				durableObjects: [],
			} as WorkerDefinition,
		}));

		// Simulate concurrent registrations
		const registrationPromises = workers.map((worker) =>
			registry.registerWorker(worker.name, worker.definition)
		);

		// Wait for all registrations to complete
		await Promise.all(registrationPromises);

		// Verify all workers are registered
		const registeredWorkers = await registry.getRegisteredWorkers();
		expect(Object.keys(registeredWorkers || {})).toHaveLength(workerCount);

		// Verify each worker's registration
		for (const worker of workers) {
			expect(registeredWorkers?.[worker.name]).toEqual(
				expect.objectContaining(worker.definition)
			);

			// Verify worker file exists and contains correct data
			const workerFilePath = path.join(tempDir, worker.name);
			expect(fs.existsSync(workerFilePath)).toBe(true);

			const fileContent = fs.readFileSync(workerFilePath, "utf-8");
			const parsedContent = JSON.parse(fileContent);
			expect(parsedContent).toEqual(expect.objectContaining(worker.definition));
			expect(parsedContent.wranglerVersion).toBeDefined();
		}

		// Verify that no errors were logged during the process
		expect(logger.error).not.toHaveBeenCalled();
	});

	it("should handle concurrent worker unregistrations", async () => {
		const workerCount = 10;
		const workers = Array.from({ length: workerCount }, (_, index) => ({
			name: `worker-${index}`,
			definition: {
				port: 8787 + index,
				protocol: index % 2 === 0 ? "http" : "https",
				host: "localhost",
				mode: "local",
				durableObjects: [],
			} as WorkerDefinition,
		}));

		// Register all workers first
		for (const worker of workers) {
			await registry.registerWorker(worker.name, worker.definition);
		}

		// Verify all workers are initially registered
		let registeredWorkers = await registry.getRegisteredWorkers();
		expect(Object.keys(registeredWorkers || {})).toHaveLength(workerCount);

		// Simulate concurrent unregistrations
		const unregistrationPromises = workers.map((worker) =>
			registry.unregisterWorker(worker.name)
		);

		// Wait for all unregistrations to complete
		await Promise.all(unregistrationPromises);

		// Verify all workers are unregistered
		registeredWorkers = await registry.getRegisteredWorkers();
		expect(Object.keys(registeredWorkers || {})).toHaveLength(0);

		// Verify each worker's file is removed
		for (const worker of workers) {
			const workerFilePath = path.join(tempDir, worker.name);
			expect(fs.existsSync(workerFilePath)).toBe(false);
		}

		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.debug).not.toHaveBeenCalled();
	});

	it("should only create one watcher for multiple devRegistry instances", async () => {
		registry = new FilesystemWorkerRegistry(tempDir);

		// Create two devRegistry instances
		const cb = vi.fn();
		const cleanup1 = await registry.devRegistry(cb);
		const cleanup2 = await registry.devRegistry(cb);

		const workerName = "test-worker";
		const workerDefinition: WorkerDefinition = {
			port: 8787,
			protocol: "http",
			host: "localhost",
			mode: "local",
			durableObjects: [],
		};

		// Register the worker
		await registry.registerWorker(workerName, workerDefinition);

		// Clean up
		await cleanup1("test-worker");
		await cleanup2("test-worker");

		// Verify that the callback was only called once
		expect(cb).toHaveBeenCalledTimes(1);
	});

	it("should correctly bind registered workers with various combinations of services and durable objects", async () => {
		// Define some worker definitions
		const workerDefs: Record<string, WorkerDefinition> = {
			worker1: {
				port: 8787,
				protocol: "http",
				host: "localhost",
				mode: "local",
				durableObjects: [],
			},
			worker2: {
				port: 8788,
				protocol: "https",
				host: "localhost",
				mode: "local",
				durableObjects: [],
			},
			worker3: {
				port: 8789,
				protocol: "http",
				host: "localhost",
				mode: "local",
				durableObjects: [],
			},
			worker4: {
				port: 8790,
				protocol: "https",
				host: "localhost",
				mode: "local",
				durableObjects: [],
			},
		};

		// Register the workers
		for (const [name, def] of Object.entries(workerDefs)) {
			await registry.registerWorker(name, def);
		}

		// Test case 1: No services or durable objects
		let boundWorkers = await registry.getBoundRegisteredWorkers({
			name: "test-worker",
			services: undefined,
			durableObjects: undefined,
		});
		expect(Object.keys(boundWorkers || {})).toHaveLength(0);

		// Test case 2: With services, no durable objects
		boundWorkers = await registry.getBoundRegisteredWorkers({
			name: "test-worker",
			services: [
				{ service: "worker1", type: "service" },
				{ service: "worker2", type: "service" },
			],
			durableObjects: undefined,
		});
		expect(Object.keys(boundWorkers || {})).toHaveLength(2);
		expect(boundWorkers?.worker1).toBeDefined();
		expect(boundWorkers?.worker2).toBeDefined();

		// Test case 3: No services, with durable objects
		boundWorkers = await registry.getBoundRegisteredWorkers({
			name: "test-worker",
			services: undefined,
			durableObjects: {
				bindings: [
					{
						name: "DO1",
						class_name: "DurableObjectClass",
						script_name: "worker3",
					},
				],
			},
		});
		expect(Object.keys(boundWorkers || {})).toHaveLength(1);
		expect(boundWorkers?.worker3).toBeDefined();

		// Test case 4: With both services and durable objects
		boundWorkers = await registry.getBoundRegisteredWorkers({
			name: "test-worker",
			services: [
				{ service: "worker1", type: "service" },
				{ service: "worker4", type: "service" },
			],
			durableObjects: {
				bindings: [
					{
						name: "DO1",
						class_name: "DurableObjectClass",
						script_name: "worker3",
					},
				],
			},
		});
		expect(Object.keys(boundWorkers || {})).toHaveLength(3);
		expect(boundWorkers?.worker1).toBeDefined();
		expect(boundWorkers?.worker3).toBeDefined();
		expect(boundWorkers?.worker4).toBeDefined();

		// Test case 5: With non-existent workers
		boundWorkers = await registry.getBoundRegisteredWorkers({
			name: "test-worker",
			services: [{ service: "non-existent-worker", type: "service" }],
			durableObjects: {
				bindings: [
					{
						name: "DO1",
						class_name: "DurableObjectClass",
						script_name: "another-non-existent-worker",
					},
				],
			},
		});
		expect(Object.keys(boundWorkers || {})).toHaveLength(0);

		// Test case 6: Ensure the current worker is not included in the results
		boundWorkers = await registry.getBoundRegisteredWorkers({
			name: "worker1",
			services: [
				{ service: "worker1", type: "service" },
				{ service: "worker2", type: "service" },
			],
			durableObjects: {
				bindings: [
					{
						name: "DO1",
						class_name: "DurableObjectClass",
						script_name: "worker3",
					},
				],
			},
		});
		expect(Object.keys(boundWorkers || {})).toHaveLength(2);
		expect(boundWorkers?.worker1).toBeUndefined();
		expect(boundWorkers?.worker2).toBeDefined();
		expect(boundWorkers?.worker3).toBeDefined();

		// Verify that no errors were logged during the process
		expect(logger.error).not.toHaveBeenCalled();
	});

	it("should handle missing or undefined services and durable objects in getBoundRegisteredWorkers", async () => {
		// Register some workers for testing
		const workerDefs: Record<string, WorkerDefinition> = {
			worker1: {
				port: 8787,
				protocol: "http",
				host: "localhost",
				mode: "local",
				durableObjects: [],
			},
			worker2: {
				port: 8788,
				protocol: "https",
				host: "localhost",
				mode: "local",
				durableObjects: [],
			},
		};

		for (const [name, def] of Object.entries(workerDefs)) {
			await registry.registerWorker(name, def);
		}

		// Test case 1: Both services and durableObjects are undefined
		let boundWorkers = await registry.getBoundRegisteredWorkers({
			name: "test-worker",
			services: undefined,
			durableObjects: undefined,
		});
		expect(Object.keys(boundWorkers || {})).toHaveLength(0);

		// Test case 2: Services is an empty array, durableObjects is undefined
		boundWorkers = await registry.getBoundRegisteredWorkers({
			name: "test-worker",
			services: [],
			durableObjects: undefined,
		});
		expect(Object.keys(boundWorkers || {})).toHaveLength(0);

		// Test case 3: Services is undefined, durableObjects is an empty object
		boundWorkers = await registry.getBoundRegisteredWorkers({
			name: "test-worker",
			services: undefined,
			durableObjects: { bindings: [] },
		});
		expect(Object.keys(boundWorkers || {})).toHaveLength(0);

		// Test case 4: Services is an empty array, durableObjects is an empty object
		boundWorkers = await registry.getBoundRegisteredWorkers({
			name: "test-worker",
			services: [],
			durableObjects: { bindings: [] },
		});
		expect(Object.keys(boundWorkers || {})).toHaveLength(0);

		// Test case 5: Services is null, durableObjects is null
		boundWorkers = await registry.getBoundRegisteredWorkers({
			name: "test-worker",
			// @ts-expect-error services should be of type Config['services']
			services: null,
			// @ts-expect-error durableObjects should be of type Config['durable_objects']
			durableObjects: null,
		});
		expect(Object.keys(boundWorkers || {})).toHaveLength(0);

		// Test case 6: Services is defined but empty, durableObjects is undefined
		boundWorkers = await registry.getBoundRegisteredWorkers({
			name: "test-worker",
			services: [],
			durableObjects: undefined,
		});
		expect(Object.keys(boundWorkers || {})).toHaveLength(0);

		// Test case 7: Services is undefined, durableObjects is defined but empty
		boundWorkers = await registry.getBoundRegisteredWorkers({
			name: "test-worker",
			services: undefined,
			durableObjects: { bindings: [] },
		});
		expect(Object.keys(boundWorkers || {})).toHaveLength(0);

		// Verify that no errors were logged during the process
		expect(logger.error).not.toHaveBeenCalled();
	});

	it("should correctly start and stop the worker registry", async () => {
		// Create a Promise that resolves when the callback is called
		let resolveCallback: (value: unknown) => void;
		const callbackPromise = new Promise((resolve) => {
			resolveCallback = resolve;
		});

		// Create a mock function that resolves the Promise when called
		const mockCallback = vi.fn(() => {
			resolveCallback(true);
		});

		// Start the worker registry
		await registry.startRegistryWatcher(mockCallback);

		const workerName = "test-worker";
		const workerDefinition: WorkerDefinition = {
			port: 8787,
			protocol: "http",
			host: "localhost",
			mode: "local",
			durableObjects: [],
		};

		// Register the worker
		await registry.registerWorker(workerName, workerDefinition);

		// Wait for the callback to be called
		await callbackPromise;

		await registry.stopRegistryWatcher();

		// Verify that the watcher was created and called once
		expect(mockCallback).toHaveBeenCalledTimes(1);
	});

	it("should maintain consistency with concurrent read/writes", async () => {
		const workerCount = 25;
		const workers = Array.from({ length: workerCount }, (_, index) => ({
			name: `worker-${index}`,
			definition: {
				port: 8787 + index,
				protocol: index % 2 === 0 ? "http" : "https",
				host: "localhost",
				mode: "local",
				durableObjects: [],
			} as WorkerDefinition,
		}));

		// Function to perform a batch of operations
		const operations = workers.flatMap((worker) => [
			registry.registerWorker(worker.name, worker.definition),
			registry.getRegisteredWorkers(),
		]);

		await Promise.all(operations);

		// Verify the final state
		const registeredWorkers = await registry.getRegisteredWorkers();

		// Check if all workers are registered (this might fail due to conflicts)
		expect(Object.keys(registeredWorkers || {})).toHaveLength(workerCount);

		// Check each worker's registration (this might reveal inconsistencies)
		for (const worker of workers) {
			const registeredWorker = registeredWorkers?.[worker.name];
			if (registeredWorker) {
				expect(registeredWorker).toEqual(
					expect.objectContaining(worker.definition)
				);
			} else {
				console.warn(`Worker ${worker.name} is missing from the registry`);
			}

			// Check file existence and content (this might reveal file-level inconsistencies)
			const workerFilePath = path.join(tempDir, worker.name);
			if (fs.existsSync(workerFilePath)) {
				const fileContent = fs.readFileSync(workerFilePath, "utf-8");
				const parsedContent = JSON.parse(fileContent);
				expect(parsedContent).toEqual(
					expect.objectContaining(worker.definition)
				);
				expect(parsedContent.wranglerVersion).toBeDefined();
			} else {
				console.warn(`File for worker ${worker.name} is missing`);
			}
		}
	});

	it("should ensure there is no race condition between file watcher setup and stopRegisterWatcher", async () => {
		const cb = vi.fn();
		// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-vars
		void registry.startRegistryWatcher(cb);
		// This could be another process stopping the registry watcher
		await registry.stopRegistryWatcher();

		const workerName = "test-worker";
		const workerDefinition: WorkerDefinition = {
			port: 8787,
			protocol: "http",
			host: "localhost",
			mode: "local",
			durableObjects: [],
		};

		// Register the worker
		await registry.registerWorker(workerName, workerDefinition);

		// Verify that the watcher was stopped correctly
		expect(cb).toHaveBeenCalledTimes(0);
	});

	// TODO: the test fails because we have not awaited the completion of the registration
	it.skip("should maintain consistency with concurrent unregister and register operations", async () => {
		const workerName = "test-worker";
		const workerDefinition: WorkerDefinition = {
			port: 8787,
			protocol: "http",
			host: "localhost",
			mode: "local",
			durableObjects: [],
		};

		await Promise.all([
			registry.registerWorker(workerName, workerDefinition),
			registry.unregisterWorker(workerName),
		]);

		// Verify the worker is no longer registered
		const registeredWorkers = await registry.getRegisteredWorkers();
		expect(registeredWorkers?.[workerName]).toBeUndefined();

		// Verify that the worker file was removed
		const workerFilePath = path.join(tempDir, workerName);
		expect(fs.existsSync(workerFilePath)).toBe(false);
	});

	// TODO: We could keep track of workers registered by the current instance and unregister them on shutdown.
	//       To maintain a single source of truth, the worker definitions could store a FilesystemWorkerRegistry "id".
	it.skip("should ensure that there are no registered workers left if the registry shut down correctly", async () => {
		const cb = vi.fn();
		const cleanup = await registry.devRegistry(cb);

		const workerName = "test-worker";
		const workerDefinition: WorkerDefinition = {
			port: 8787,
			protocol: "http",
			host: "localhost",
			mode: "local",
			durableObjects: [],
		};

		// Register the worker
		await registry.registerWorker(workerName, workerDefinition);

		// Shutdown the registry without providing the name of the worker
		await cleanup();

		// Verify the worker is no longer registered
		const registeredWorkers = await registry.getRegisteredWorkers();
		expect(registeredWorkers?.[workerName]).toBeUndefined();
	});

	// This is a difficult problem, but could potentially be solved by maintaining a registry that is
	// out-of-process of all wrangler instances. It could then guarantee (e.g. by using a mutex) that
	// there will be no read/write conflicts.
	describe.concurrent("Concurrent read/write operations", () => {
		it.skip("should register a worker", async () => {
			const workerName = "test-worker";

			// Register the worker
			await registry.registerWorker("test-worker", {} as WorkerDefinition);

			// Verify the worker is registered
			const registeredWorkers = await registry.getRegisteredWorkers();
			expect(registeredWorkers?.[workerName]).not.toBeUndefined();
		});

		it.skip("should unregister a worker", async () => {
			const workerName = "test-worker";

			// Unregister a worker
			await registry.unregisterWorker(workerName);

			// Verify the worker is no longer registered
			const registeredWorkers = await registry.getRegisteredWorkers();
			expect(registeredWorkers?.[workerName]).toBeUndefined();
		});
	});
});
