import path from "path";
import { FIXTURES_PATH } from "./shared";
import suite from "./suite";

// Post-wrangler 3.3, D1 bindings work directly, so use the input file
// from the fixture, and no prefixc on the binding name
suite("DB", path.join(FIXTURES_PATH, "d1", "worker.mjs"));
