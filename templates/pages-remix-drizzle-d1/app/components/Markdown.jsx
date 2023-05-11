import * as React from "react";
import { renderers } from "@markdoc/markdoc";

export function Markdown({ content }) {
	return (
		<>
			{renderers.react(content, React, {
				components: {},
			})}
		</>
	);
}
