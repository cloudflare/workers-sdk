import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";
import { StudioWindowTabMenu } from "../../../components/studio/WindowTab/MenuProps";

// https://github.com/cloudflare/workers-sdk/issues/16763
test("New Query button does not shrink or show tabs through it when the tab bar overflows", ({
	expect,
}) => {
	const html = renderToStaticMarkup(
		createElement(StudioWindowTabMenu, { onClick: () => {} })
	);
	const classes = [...html.matchAll(/class="([^"]*)"/g)].flatMap((m) =>
		(m[1] ?? "").split(/\s+/)
	);

	expect(classes).toContain("shrink-0");
	expect(classes).toContain("bg-kumo-elevated");
});
