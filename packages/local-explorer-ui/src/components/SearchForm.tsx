import { Button } from "@base-ui/react/button";
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
				className="max-w-100 flex-1 rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-text focus:border-primary focus:shadow-focus-primary focus:outline-none disabled:bg-bg-secondary disabled:text-text-secondary"
				placeholder="Search keys by prefix..."
				value={prefix}
				onChange={(e) => setPrefix(e.target.value)}
				disabled={disabled}
			/>
			<Button
				type="submit"
				className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border border-border bg-bg-tertiary px-4 py-2 text-sm font-medium text-text transition-[background-color,transform] hover:bg-border active:translate-y-px"
				disabled={disabled}
				focusableWhenDisabled
			>
				Search
			</Button>
		</form>
	);
}
