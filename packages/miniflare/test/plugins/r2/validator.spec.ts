import test from "ava";

import { workerTestMacro } from "../../test-shared";

test(
	"testR2Conditional: matches various conditions",
	workerTestMacro,
	"r2",
	"validator.ts"
);
