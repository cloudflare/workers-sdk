import { test } from "vitest";
import { constructHeaders } from "../configuration/constructConfiguration";
import { parseHeaders } from "../configuration/parseHeaders";
import type { Logger } from "../configuration/types";

const noopLogger: Logger = {
	debug: () => {},
	log: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
};

test("constructHeaders should keep the headers of every block for a path that appears more than once", ({
	expect,
}) => {
	const input = `/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff

/*
  Cache-Control: public, max-age=3600
`;

	const result = constructHeaders({
		headers: parseHeaders(input),
		headersFile: "/project/public/_headers",
		logger: noopLogger,
	});

	expect(result.headers?.rules["/*"]).toEqual({
		set: {
			"x-frame-options": "DENY",
			"x-content-type-options": "nosniff",
			"cache-control": "public, max-age=3600",
		},
	});
});
