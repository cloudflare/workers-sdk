import os from "node:os";
import dedent from "ts-dedent";
import { afterAll, vi } from "vitest";
import { test } from "./helpers";

const config = dedent`
    import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

    export default defineWorkersConfig({
        test: {
            poolOptions: {
                workers: {
                    isolatedStorage: true,
                    singleWorker: false,
                    miniflare: {
                        compatibilityDate: "2024-01-01",
                        compatibilityFlags: ["nodejs_compat"],
                    },
                },
            },
        }
    });
`;

const delayedTest = dedent`
    let activeTests = 0;
    const poolSize = 2;

    export const delayedTest = async () => {
        if (activeTests >= poolSize) {
            throw new Error("Too many active tests: ");
        }
        activeTests++;
        return new Promise<void>((resolve) => {
            setTimeout(() => {
            activeTests--;
            resolve();
            }, 300);
        });
    };
`;
const testLog = dedent`
    export let testLog: string[] = [];
`;

const test1 = dedent`
    import { expect, it } from "vitest";
    import { delayedTest } from './delayed-test.ts';
    import { testLog } from './test-log.ts';

    it("does something 1", async () => {
        // testLog.push("start 1");
        console.log("start 1");
        await new Promise(resolve => setTimeout(resolve, 500)); // Add delay
        // testLog.push("end 1");
        console.log("end 1");
    });
`;

const test2 = dedent`
    import { expect, it } from "vitest";
    import { delayedTest } from './delayed-test.ts';
    import { testLog } from './test-log.ts';

    it("does something 2", async () => {
        // testLog.push("start 2");
        console.log("start 2");
        await new Promise(resolve => setTimeout(resolve, 500)); // Add delay
        // testLog.push("end 2");
        console.log("end 2");
    });
`;

const test3 = dedent`
    import { expect, it } from "vitest";
    import { delayedTest } from './delayed-test.ts';
    import { testLog } from './test-log.ts';

    it("does something 3", async () => {
        // testLog.push("start 3");
        console.log("start 3");
        await new Promise(resolve => setTimeout(resolve, 500)); // Add delay
        // testLog.push("end 3");
        console.log("end 3");
    });
`;

const indexTest = dedent`
    import os from "node:os";
    import { afterAll, beforeAll, expect, vi } from "vitest";
    import { testLog } from './test-log.ts';
    import "./test1.test.ts";
    import "./test2.test.ts";
    import "./test3.test.ts";
`;

vi.mock("os", () => {
	return {
		availableParallelism: () => 2,
		cpus: () => [{}, {}], // Mocking 2 CPUs
	};
});

afterAll(async () => {
	vi.restoreAllMocks();
});

test("should limit concurrent tests available parallelism and CPU count", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.ts": config,
		"test-log.ts": testLog,
		"delayed-test.ts": delayedTest,
		"index.test.ts": indexTest,
		"test1.test.ts": test1,
		"test2.test.ts": test2,
		"test3.test.ts": test3,
	});

	const finalResult = await vitestRun();

	console.log(finalResult.stdout);
	expect(await finalResult.exitCode).toBe(0);
}, 700000);
