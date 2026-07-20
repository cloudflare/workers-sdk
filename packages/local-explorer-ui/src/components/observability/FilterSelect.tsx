import { Select } from "@cloudflare/kumo";
import type { JSX } from "react";

/** A thin wrapper over the Kumo Select for the observability filter bar. */
export function FilterSelect({
	value,
	onChange,
	options,
	label,
}: {
	value: string;
	onChange: (v: string) => void;
	options: Array<[string, string]>;
	/** Accessible name for the control (no visible label in the filter bar). */
	label: string;
}): JSX.Element {
	return (
		<Select
			aria-label={label}
			value={value}
			onValueChange={(v) => onChange(String(v))}
		>
			{options.map(([v, l]) => (
				<Select.Option key={v} value={v}>
					{l}
				</Select.Option>
			))}
		</Select>
	);
}
