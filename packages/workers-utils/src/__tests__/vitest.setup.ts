import { afterEach, vi } from "vitest";

afterEach(() => {
	// It is important that we clear mocks between tests to avoid leakage.
	vi.clearAllMocks();
});
