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

function construct(input: string) {
	return constructHeaders({ headers: parseHeaders(input), logger: noopLogger });
}

test("constructHeaders should keep the headers of every block for a path that appears more than once", ({
	expect,
}) => {
	const input = `/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff

/*
  Cache-Control: public, max-age=3600
`;

	expect(construct(input).headers?.rules["/*"]).toEqual({
		set: {
			"x-frame-options": "DENY",
			"x-content-type-options": "nosniff",
			"cache-control": "public, max-age=3600",
		},
	});
});

test("constructHeaders should let a later block for a path unset a header an earlier block set", ({
	expect,
}) => {
	const input = `/*
  X-Test: first

/*
  ! X-Test
`;

	// The runtime applies a rule's unsets before its sets, so the merged rule
	// must not carry the value the later block removed.
	expect(construct(input).headers?.rules["/*"]).toEqual({
		unset: ["X-Test"],
	});
});

test("constructHeaders should let a later block for a path unset and then set a header an earlier block set", ({
	expect,
}) => {
	const input = `/*
  Content-Disposition: attachment

/*
  ! Content-Disposition
  Content-Disposition: inline
`;

	expect(construct(input).headers?.rules["/*"]).toEqual({
		set: { "content-disposition": "inline" },
		unset: ["Content-Disposition"],
	});
});

test("constructHeaders should keep an unset from cancelling headers of blocks before an intervening one", ({
	expect,
}) => {
	const input = `/*
  X-Test: first

/*
  Cache-Control: no-store

/*
  ! X-Test
`;

	expect(construct(input).headers?.rules["/*"]).toEqual({
		set: { "cache-control": "no-store" },
		unset: ["X-Test"],
	});
});

test("constructHeaders should combine a header name repeated across blocks for the same path", ({
	expect,
}) => {
	const input = `/*
  X-Test: first

/*
  x-test: second
`;

	expect(construct(input).headers?.rules["/*"]).toEqual({
		set: { "x-test": "first, second" },
	});
});
