import { test } from "vitest";
import { constructHeaders } from "../configuration/constructConfiguration";
import { parseHeaders } from "../configuration/parseHeaders";
import type { Logger } from "../configuration/types";

const logger: Logger = {
	debug: () => {},
	log: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
};

test("constructHeaders should keep the headers of every block for the same path", ({
	expect,
}) => {
	const headers = parseHeaders(`/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff

/*
  Cache-Control: public, max-age=3600
`);
	const result = constructHeaders({ headers, logger });
	expect(result.headers).toEqual({
		version: 2,
		rules: {
			"/*": {
				set: {
					"x-frame-options": "DENY",
					"x-content-type-options": "nosniff",
					"cache-control": "public, max-age=3600",
				},
			},
		},
	});
});

test("constructHeaders should keep the unset headers of every block for the same path", ({
	expect,
}) => {
	const headers = parseHeaders(`/*
  X-Frame-Options: DENY

/*
  ! X-Powered-By
`);
	const result = constructHeaders({ headers, logger });
	expect(result.headers).toEqual({
		version: 2,
		rules: {
			"/*": {
				set: { "x-frame-options": "DENY" },
				unset: ["X-Powered-By"],
			},
		},
	});
});
