import { LayerCard } from "@cloudflare/kumo";
import { Accordion } from "@cloudflare/kumo/primitives/accordion";
import { CaretDownIcon } from "@phosphor-icons/react";
import type { JSX } from "react";

interface ReceivedEmailHeadersProps {
	headers?: [string, string][];
}

const STRUCTURED_HEADER_NAMES = new Set([
	"from",
	"message-id",
	"subject",
	"to",
]);

export function ReceivedEmailHeaders({
	headers,
}: ReceivedEmailHeadersProps): JSX.Element {
	const headerEntries = (headers ?? []).filter(
		([name]) => !STRUCTURED_HEADER_NAMES.has(name.toLowerCase())
	);
	const headerCount = headerEntries.length;

	return (
		<Accordion.Root>
			<Accordion.Item value="email-headers">
				<LayerCard>
					<LayerCard.Secondary className="p-0">
						<Accordion.Header className="w-full">
							<Accordion.Trigger className="group focus-visible:ring-kumo-ring flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset">
								<span>Email headers</span>
								<span className="flex items-center gap-2 text-sm font-normal text-kumo-subtle">
									{headerCount} {headerCount === 1 ? "header" : "headers"}
									<CaretDownIcon
										className="transition-transform group-data-[panel-open]:rotate-180"
										size={16}
									/>
								</span>
							</Accordion.Trigger>
						</Accordion.Header>
					</LayerCard.Secondary>
					<Accordion.Panel data-testid="received-email-headers-panel">
						<LayerCard.Primary>
							{headerEntries.length > 0 ? (
								<dl className="divide-y divide-kumo-line text-sm">
									{headerEntries.map(([name, value], index) => (
										<div
											className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-4"
											key={`${name}-${index}`}
										>
											<dt className="font-medium break-words text-kumo-default">
												{name}
											</dt>
											<dd className="break-words whitespace-pre-wrap text-kumo-subtle">
												{value}
											</dd>
										</div>
									))}
								</dl>
							) : (
								<p className="text-sm text-kumo-subtle">
									No additional email headers were captured.
								</p>
							)}
						</LayerCard.Primary>
					</Accordion.Panel>
				</LayerCard>
			</Accordion.Item>
		</Accordion.Root>
	);
}
