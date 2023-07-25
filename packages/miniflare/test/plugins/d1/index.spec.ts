import { setupTest } from "./test";

// Post-wrangler 3.3, D1 bindings work directly, so use the input file
// from the fixture, and no prefix on the binding name
setupTest("DB", "worker.mjs", (mf) => mf.getD1Database("DB"));
require("./suite");
