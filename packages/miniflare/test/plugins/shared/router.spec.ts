import test from "ava";

import { workerTestMacro } from "../../test-shared";

test("Router: routes requests", workerTestMacro, "shared", "router.ts");
