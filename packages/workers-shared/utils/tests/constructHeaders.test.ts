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
  lInK: </b.css>; rel=preload
`);

	expect(rules).toEqual({
		"/*": {
			set: { link: "</a.css>; rel=preload, </b.css>; rel=preload" },
		},
	});
});

test("constructHeaders keeps an earlier assignment and a later unset for the same path", ({
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
			set: { "content-disposition": "attachment", "x-robots-tag": "noindex" },
			unset: ["Content-Disposition"],
		},
	});
});

test("constructHeaders combines assignments when a later block also unsets the header", ({
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
			set: { "content-disposition": "attachment, inline" },
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
