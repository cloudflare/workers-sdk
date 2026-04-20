import { Button } from "@cloudflare/kumo";
import { useState } from "react";

interface SearchFormProps {
	onSearch: (prefix: string) => void;
	disabled?: boolean;
}

export function SearchForm({ onSearch, disabled = false }: SearchFormProps) {
	const [prefix, setPrefix] = useState("");

	const handleSubmit = (e: React.SyntheticEvent) => {
		e.preventDefault();
		onSearch(prefix);
	};

	return (
		<form className="flex items-center gap-2" onSubmit={handleSubmit}>
			<label className="sr-only" htmlFor="search-prefix">
				Search keys by prefix
			</label>
			<input
				id="search-prefix"
				className="focus-visible:ring-kumo-ring h-9 max-w-100 flex-1 rounded-md border border-kumo-fill bg-kumo-base px-3 font-mono text-sm text-kumo-default focus:border-kumo-brand focus:outline-none focus-visible:ring-2 disabled:bg-kumo-elevated disabled:text-kumo-subtle"
				placeholder="Search keys by prefix..."
				value={prefix}
				onChange={(e) => setPrefix(e.target.value)}
				disabled={disabled}
			/>
			<Button type="submit" variant="secondary" disabled={disabled}>
				Search
			</Button>
		</form>
	);
}
