// This file is named `vitest.workers.config.ts` so it doesn't get included
// in the monorepo's `vitest.workspace.ts`.
// TODO(now): we could probably just include `test/*` in the monorepo's
//  workspace, if we upgraded the root `vitest` version to support custom pools

import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {},
});
