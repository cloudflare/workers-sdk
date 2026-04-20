import { defineConfig } from "vitest/config";

// This default gets pulled in by all the Vitest runs in the monorepo.
export default defineConfig({
	test: {
		// These timeouts are very large because the Windows CI jobs regularly take up ot 42 secs.
		// Ideally we should not have such high defaults across all tests, but instead be able to
		// increase timeouts for certain sets of tests.
		// But this might need some vitest/turborepo magical incantations and bumping the values
		// here is a simpler short term fix.
		// Note that this will not cause tests to pass that should fail. It just means that hanging
		// tests will take longer to fail than they would before.
		testTimeout: 50_000,
		hookTimeout: 50_000,
		teardownTimeout: 50_000,
		restoreMocks: true,
		// The old network-based dev registry caused widespread flakiness, but it was
		// replaced with a file-based registry in late 2024. Keep one retry as a safety
		// net for general CI flakiness (resource pressure, timing, etc.).
		retry: 1,
	},
});
