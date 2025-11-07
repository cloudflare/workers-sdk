import test from "ava";

import { workerTestMacro } from "../../test-shared";

test(
	"parseHttpResponse: parses HTTP response messages",
	workerTestMacro,
	"cache",
	"parse-http.ts"
);
