import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		poolOptions:
			// for some reason the prisma tests this seems to be problematic on windows
			// when running the various playground tests in parallel, so under windows
			// run the tests in a single fork to avoid to avoid them running in parallel.
			process.platform === "win32"
				? { forks: { singleFork: true } }
				: undefined,
		include: ["./**/__tests__/**/*.spec.[tj]s"],
		setupFiles: ["./vitest-setup.ts"],
		globalSetup: ["./vitest-global-setup.ts"],
		reporters: "dot",
		onConsoleLog: () => false,
		testTimeout: 10000,
	},
	publicDir: false,
});
