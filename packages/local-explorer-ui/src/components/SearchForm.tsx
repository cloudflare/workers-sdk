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
				className="h-9 max-w-100 flex-1 rounded-md border border-border bg-bg px-3 font-mono text-sm text-text focus:border-primary focus:shadow-focus-primary focus:outline-none disabled:bg-bg-secondary disabled:text-text-secondary"
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
