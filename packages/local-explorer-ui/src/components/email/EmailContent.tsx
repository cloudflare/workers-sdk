import { LayerCard } from "@cloudflare/kumo";
import { Accordion } from "@cloudflare/kumo/primitives/accordion";
import { CaretDownIcon } from "@phosphor-icons/react";
import { EmailHtmlBody } from "./EmailHtmlBody";
import { EmailTruncationWarning } from "./EmailTruncationWarning";
import type { JSX } from "react";

interface EmailContentProps {
	html?: string;
	kind: "received" | "sent";
	previewTitle: string;
	raw?: string;
	rawBase64?: string;
	text?: string;
	truncated: boolean;
}

function decodeRawMime(raw?: string, rawBase64?: string): string | undefined {
	if (raw !== undefined) {
		return raw;
	}
	if (rawBase64 === undefined) {
		return undefined;
	}
	try {
		const binary = atob(rawBase64);
		const bytes = Uint8Array.from(binary, (character) =>
			character.charCodeAt(0)
		);
		return new TextDecoder().decode(bytes);
	} catch {
		return undefined;
	}
}

function ContentHeading({ children }: { children: string }): JSX.Element {
	return (
		<h2 className="mb-2 text-base font-semibold text-kumo-default">
			{children}
		</h2>
	);
}

/** Renders captured email bodies and raw MIME in a shared accordion. */
export function EmailContent({
	html,
	kind,
	previewTitle,
	raw,
	rawBase64,
	text,
	truncated,
}: EmailContentProps): JSX.Element {
	const rawMime = decodeRawMime(raw, rawBase64);

	return (
		<Accordion.Root>
			<Accordion.Item value="email-content">
				<LayerCard>
					<LayerCard.Secondary className="p-0">
						<Accordion.Header className="w-full">
							<Accordion.Trigger className="group focus-visible:ring-kumo-ring flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset">
								<span>Content</span>
								<span className="flex items-center gap-2 text-sm font-normal text-kumo-subtle">
									<CaretDownIcon
										className="transition-transform group-data-[panel-open]:rotate-180"
										size={16}
									/>
								</span>
							</Accordion.Trigger>
						</Accordion.Header>
					</LayerCard.Secondary>
					<Accordion.Panel data-testid={`${kind}-email-content-panel`}>
						<LayerCard.Primary>
							<div className="space-y-6">
								{truncated ? <EmailTruncationWarning kind={kind} /> : null}

								{!truncated && text ? (
									<section>
										<ContentHeading>Text body</ContentHeading>
										<pre className="max-h-96 overflow-x-hidden overflow-y-auto rounded-lg border border-kumo-fill bg-kumo-elevated px-4 py-3 text-sm break-words whitespace-pre-wrap text-kumo-default">
											{text}
										</pre>
									</section>
								) : null}

								{!truncated && html ? (
									<section>
										<EmailHtmlBody html={html} previewTitle={previewTitle} />
									</section>
								) : null}

								{!truncated && !text && !html ? (
									<p className="text-center text-sm text-kumo-subtle">
										This email has no captured text or HTML body.
									</p>
								) : null}

								{rawMime === undefined ? null : (
									<section>
										<ContentHeading>Raw MIME</ContentHeading>
										<pre className="max-h-96 overflow-auto rounded-lg border border-kumo-fill bg-kumo-elevated px-4 py-3 font-mono text-sm whitespace-pre-wrap text-kumo-default">
											{rawMime}
										</pre>
									</section>
								)}
							</div>
						</LayerCard.Primary>
					</Accordion.Panel>
				</LayerCard>
			</Accordion.Item>
		</Accordion.Root>
	);
}
