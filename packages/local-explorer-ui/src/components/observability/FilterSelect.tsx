import { DropdownMenu } from "@cloudflare/kumo";
import { CaretUpDownIcon, CheckIcon } from "@phosphor-icons/react";

/** A Kumo DropdownMenu styled like the dashboard's filter dropdowns. */
export function FilterSelect({
	value,
	onChange,
	options,
}: {
	value: string;
	onChange: (v: string) => void;
	options: Array<[string, string]>;
}): JSX.Element {
	const current = options.find(([v]) => v === value);
	return (
		<DropdownMenu>
			<DropdownMenu.Trigger
				render={
					<button
						type="button"
						className="inline-flex max-w-[200px] cursor-pointer items-center gap-1 rounded-md border border-kumo-fill bg-kumo-base px-2.5 py-1.5 text-xs text-kumo-default transition-colors hover:bg-kumo-fill data-[popup-open]:bg-kumo-fill"
					/>
				}
			>
				<span className="truncate">{current?.[1] ?? "Select"}</span>
				<CaretUpDownIcon className="h-3.5 w-3.5 shrink-0 text-kumo-subtle" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content
				className="max-h-72 overflow-y-auto"
				style={{ zIndex: 50 }}
			>
				{options.map(([v, label]) => (
					<DropdownMenu.Item
						key={v}
						icon={value === v ? CheckIcon : undefined}
						onClick={() => onChange(v)}
					>
						{label}
					</DropdownMenu.Item>
				))}
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}
