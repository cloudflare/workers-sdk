import { describe } from "vitest";
import { satisfiesMinimumViteVersion } from "../../../__test-utils__";
import { runBaseTests } from "../base-tests";

// `experimental.bundledDev` is a Vite 8+ feature, so this variant is only
// exercised there. On older Vite versions the tests are skipped.
describe.runIf(satisfiesMinimumViteVersion("8.0.0"))(
	"client-bundled-dev",
	() => {
		runBaseTests();
	}
);
