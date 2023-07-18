import path from "path";
import { FIXTURES_PATH } from "./shared";
import suite from "./suite";

// Pre-wrangler 3.3, D1 bindings needed a local compilation step, so use
// the output version of the fixture, and the appropriately prefixed binding name
suite("__D1_BETA__DB", path.join(FIXTURES_PATH, "d1", "worker.dist.mjs"));
