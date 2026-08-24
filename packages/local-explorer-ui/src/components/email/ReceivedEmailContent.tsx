import { LayerCard } from "@cloudflare/kumo";
import { EmailHtmlPreview } from "./EmailHtmlPreview";
import { EmailTruncationWarning } from "./EmailTruncationWarning";
import type { JSX } from "react";

interface ReceivedEmailContentProps {
	html?: string;
	text?: string;
	truncated: boolean;
}

export function ReceivedEmailContent({
	html,
	text,
	truncated,
}: ReceivedEmailContentProps): JSX.Element {
	return (
		<LayerCard>
			<LayerCard.Secondary>Content</LayerCard.Secondary>
			<LayerCard.Primary>
				<div className="space-y-6">
					{text ? (
						<section>
							<h2 className="mb-2 text-sm font-semibold text-kumo-default">
								Text body
							</h2>
							{truncated ? (
								<EmailTruncationWarning kind="received" />
							) : (
								<pre className="max-h-96 overflow-auto rounded-lg border border-kumo-fill bg-kumo-elevated p-4 text-sm whitespace-pre-wrap text-kumo-default">
									{text}
								</pre>
							)}
						</section>
					) : null}

					{html ? (
						<section>
							<h2 className="mb-2 text-sm font-semibold text-kumo-default">
								HTML body
							</h2>
							{truncated ? (
								<EmailTruncationWarning kind="received" />
							) : (
								<EmailHtmlPreview
									html={html}
									title="Rendered received HTML email body"
								/>
							)}
						</section>
					) : null}

					{truncated && !text && !html ? (
						<EmailTruncationWarning kind="received" />
					) : !text && !html ? (
						<p className="text-center text-sm text-kumo-subtle">
							This email has no captured text or HTML body.
						</p>
					) : null}
				</div>
			</LayerCard.Primary>
		</LayerCard>
	);
}
