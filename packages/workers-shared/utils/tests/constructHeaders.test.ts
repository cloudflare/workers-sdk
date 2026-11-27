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

function constructRules(input: string) {
	return constructHeaders({ headers: parseHeaders(input), logger }).headers
		?.rules;
}

test("constructHeaders merges blocks that repeat a path", ({ expect }) => {
	const rules = constructRules(`/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff

/*
  Cache-Control: public, max-age=3600
`);

	expect(rules).toEqual({
		"/*": {
			set: {
				"x-frame-options": "DENY",
				"x-content-type-options": "nosniff",
				"cache-control": "public, max-age=3600",
			},
		},
	});
});

test("constructHeaders combines a header name set by more than one block for a path", ({
	expect,
}) => {
	const rules = constructRules(`/*
  Link: </a.css>; rel=preload

/*
  Link: </b.css>; rel=preload
`);

	expect(rules).toEqual({
		"/*": {
			set: { link: "</a.css>; rel=preload, </b.css>; rel=preload" },
		},
	});
});

test("constructHeaders lets a later block for a path unset a header an earlier block set", ({
	expect,
}) => {
	const rules = constructRules(`/report.pdf
  Content-Disposition: attachment
  X-Robots-Tag: noindex

/report.pdf
  ! Content-Disposition
`);

	expect(rules).toEqual({
		"/report.pdf": {
			set: { "x-robots-tag": "noindex" },
			unset: ["Content-Disposition"],
		},
	});
});

test("constructHeaders lets a later block for a path unset and replace a header an earlier block set", ({
	expect,
}) => {
	const rules = constructRules(`/report.pdf
  Content-Disposition: attachment

/report.pdf
  ! content-disposition
  Content-Disposition: inline
`);

	expect(rules).toEqual({
		"/report.pdf": {
			set: { "content-disposition": "inline" },
			unset: ["content-disposition"],
		},
	});
});

test("constructHeaders keeps a header a later block for a path sets after an earlier block unset it", ({
	expect,
}) => {
	const rules = constructRules(`/*
  ! X-Powered-By

/*
  X-Powered-By: me
`);

	expect(rules).toEqual({
		"/*": {
			set: { "x-powered-by": "me" },
			unset: ["X-Powered-By"],
		},
	});
});
