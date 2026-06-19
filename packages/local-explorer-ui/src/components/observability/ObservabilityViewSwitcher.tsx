import { DropdownMenu } from "@cloudflare/kumo";
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";

/**
 * Title dropdown that switches between the two Observability views
 * (Traces and Events), preserving the selected worker in the URL.
 */
export function ObservabilityViewSwitcher({
	current,
	worker,
}: {
	current: "traces" | "events";
	worker?: string;
}): JSX.Element {
	const router = useRouter();
	const search = worker ? { worker } : {};

	const go = (view: "traces" | "events") => {
		if (view === "events") {
			void router.navigate({ to: "/events", search });
		} else {
			void router.navigate({ to: "/observability", search });
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenu.Trigger
				render={
					<button
						type="button"
						className="text-kumo-default hover:bg-kumo-tint data-[popup-open]:bg-kumo-tint -ml-1 inline-flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-sm font-semibold leading-tight transition-colors"
					/>
				}
			>
				<span>{current === "events" ? "Logs" : "Traces"}</span>
				<CaretDownIcon className="text-kumo-subtle h-3.5 w-3.5 shrink-0" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content style={{ zIndex: 50 }}>
				<DropdownMenu.Item
					icon={current === "traces" ? CheckIcon : undefined}
					onClick={() => go("traces")}
				>
					Traces
				</DropdownMenu.Item>
				<DropdownMenu.Item
					icon={current === "events" ? CheckIcon : undefined}
					onClick={() => go("events")}
				>
					Logs
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}
