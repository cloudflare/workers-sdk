import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { afterEach, describe, onTestFinished, test, vi } from "vitest";
import {
	DevRegistry,
	getStorageCandidateName,
	getWorkerRegistry,
} from "../../src/shared/dev-registry";
import { TestLog, useTmp } from "../test-shared";
import type { WorkerDefinition } from "../../src/shared/dev-registry";

const definition: WorkerDefinition = {
	debugPortAddress: "127.0.0.1:1234",
	defaultEntrypointService: "core:user:worker",
	userWorkerService: "core:user:worker",
};

describe("dev registry file ownership", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		syncBuiltinESMExports();
	});

	test("keeps registration order stable across atomic replacements", async ({
		expect,
	}) => {
		const directory = await useTmp();
		const first = new DevRegistry(directory, undefined, new TestLog());
		const second = new DevRegistry(directory, undefined, new TestLog());
		onTestFinished(() => first.dispose());
		onTestFinished(() => second.dispose());
		const now = Date.now();
		const clock = vi.spyOn(Date, "now").mockReturnValue(now);
		const firstName = getStorageCandidateName(first.instanceId);
		const secondName = getStorageCandidateName(second.instanceId);
		first.register({ [firstName]: definition });
		clock.mockReturnValue(now + 1_000);
		second.register({ [secondName]: definition });
		clock.mockReturnValue(now + 2_000);
		first.register({
			[firstName]: { ...definition, debugPortAddress: "127.0.0.1:5678" },
		});
		const entries = getWorkerRegistry(directory);
		expect(entries[firstName].created).toBe(now);
		expect(entries[secondName].created).toBe(now + 1_000);
		expect(entries[firstName].debugPortAddress).toBe("127.0.0.1:5678");
		expect(
			JSON.parse(fs.readFileSync(path.join(directory, firstName), "utf8"))
				.created
		).toBe(now);
	});

	test("preserves the last complete entry until publication succeeds", async ({
		expect,
	}) => {
		const directory = await useTmp();
		const registry = new DevRegistry(directory, undefined, new TestLog());
		onTestFinished(() => registry.dispose());
		registry.register({ worker: definition });
		const destination = path.join(directory, "worker");
		const original = fs.readFileSync(destination, "utf8");
		const rename = fs.renameSync;
		vi.spyOn(fs, "renameSync").mockImplementation((source, target) => {
			if (target === destination) {
				expect(getWorkerRegistry(directory).worker.debugPortAddress).toBe(
					definition.debugPortAddress
				);
				throw new Error("publication failed");
			}
			rename(source, target);
		});
		syncBuiltinESMExports();
		expect(() =>
			registry.register({
				worker: { ...definition, debugPortAddress: "127.0.0.1:5678" },
			})
		).toThrow("publication failed");
		expect(fs.readFileSync(destination, "utf8")).toBe(original);
		expect(fs.readdirSync(directory)).toEqual(["worker"]);
	});

	test.for([undefined, "invalid", null])(
		"falls back to birthtime for legacy or invalid creation metadata: %s",
		async (created, { expect }) => {
			const directory = await useTmp();
			const destination = path.join(directory, "legacy");
			fs.writeFileSync(destination, JSON.stringify({ ...definition, created }));
			expect(getWorkerRegistry(directory).legacy.created).toBe(
				fs.statSync(destination).birthtimeMs
			);
		}
	);

	test("retains a legacy registration's age when its owner republishes it", async ({
		expect,
	}) => {
		const directory = await useTmp();
		const registry = new DevRegistry(directory, undefined, new TestLog());
		onTestFinished(() => registry.dispose());
		const destination = path.join(directory, "worker");
		fs.writeFileSync(
			destination,
			JSON.stringify({ ...definition, instanceId: registry.instanceId })
		);
		const created = fs.statSync(destination).birthtimeMs;
		registry.register({ worker: definition });
		expect(getWorkerRegistry(directory).worker.created).toBe(created);
	});
});
