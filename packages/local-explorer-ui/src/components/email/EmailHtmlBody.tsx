import { Button } from "@cloudflare/kumo";
import { useState } from "react";
import { EmailHtmlPreview } from "./EmailHtmlPreview";
import type { JSX } from "react";

interface EmailHtmlBodyProps {
	html: string;
	previewTitle: string;
}

/**
 * Renders an HTML email preview with an optional HTML-source view.
 *
 * @param html - Captured HTML email content
 * @param previewTitle - Accessible title for the HTML preview iframe
 * @returns The HTML body frame and its view controls
 */
export function EmailHtmlBody({
	html,
	previewTitle,
}: EmailHtmlBodyProps): JSX.Element {
	const [view, setView] = useState<"preview" | "source">("preview");

	return (
		<div>
			<div className="mb-2 flex items-center justify-between gap-3">
				<h2 className="text-base font-semibold text-kumo-default">HTML body</h2>
				<div aria-label="HTML body view" className="flex gap-1" role="group">
					<Button
						aria-pressed={view === "preview"}
						onClick={() => setView("preview")}
						variant={view === "preview" ? "secondary" : "ghost"}
					>
						Preview
					</Button>
					<Button
						aria-pressed={view === "source"}
						onClick={() => setView("source")}
						variant={view === "source" ? "secondary" : "ghost"}
					>
						HTML source
					</Button>
				</div>
			</div>
			{view === "preview" ? (
				<EmailHtmlPreview html={html} title={previewTitle} />
			) : (
				<pre className="h-96 w-full overflow-auto rounded-lg border border-kumo-fill bg-kumo-elevated px-4 py-3 font-mono text-sm whitespace-pre-wrap text-kumo-default">
					{html}
				</pre>
			)}
		</div>
	);
}
