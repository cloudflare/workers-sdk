import { DropdownMenu } from "@cloudflare/kumo";
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import type { JSX } from "react";

type ObservabilityView = "traces" | "events";

const LABELS: Record<ObservabilityView, string> = {
	traces: "Traces",
	events: "Events",
};

const ROUTES: Record<ObservabilityView, string> = {
	traces: "/observability",
	events: "/observability/events",
};

/**
 * Title dropdown that switches between the Observability views (Traces and
 * Events), both backed by the read-only `/query` endpoint. Provided alongside
 * the sidebar entries so the current view is switchable from the header too.
 */
export function ObservabilityViewSwitcher({
	current,
}: {
	current: ObservabilityView;
}): JSX.Element {
	const router = useRouter();

	const go = (view: ObservabilityView): void => {
		// Preserve the current search (e.g. the selected `worker`) when switching.
		void router.navigate({ to: ROUTES[view], search: (prev) => prev });
	};

	return (
		<DropdownMenu>
			<DropdownMenu.Trigger
				render={
					<button
						type="button"
						className="-ml-1 inline-flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-sm leading-tight font-semibold text-kumo-default hover:bg-kumo-tint data-[popup-open]:bg-kumo-tint"
					/>
				}
			>
				<span>{LABELS[current]}</span>
				<CaretDownIcon className="h-3.5 w-3.5 shrink-0 text-kumo-subtle" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content style={{ zIndex: 50 }}>
				{(Object.keys(LABELS) as ObservabilityView[]).map((view) => (
					<DropdownMenu.Item
						key={view}
						icon={current === view ? CheckIcon : undefined}
						onClick={() => go(view)}
					>
						{LABELS[view]}
					</DropdownMenu.Item>
				))}
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}
