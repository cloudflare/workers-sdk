import { Button } from "@cloudflare/kumo";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useState } from "react";

interface SearchFormProps {
	disabled?: boolean;
	initialValue?: string;
	onSearch: (prefix: string) => void;
}

export function SearchForm({
	disabled = false,
	initialValue = "",
	onSearch,
}: SearchFormProps) {
	const [prefix, setPrefix] = useState<string>(initialValue);

	const handleSubmit = (e: React.SyntheticEvent) => {
		e.preventDefault();
		onSearch(prefix);
	};

	return (
		<form className="flex items-center gap-2" onSubmit={handleSubmit}>
			<label className="sr-only" htmlFor="search-prefix">
				Search keys by prefix
			</label>

			<div className="relative">
				<MagnifyingGlassIcon className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted" />
				<input
					className="h-9 w-56 rounded-md border border-border bg-card-bg py-2 pr-3 pl-8 font-mono text-sm text-text placeholder:text-muted focus:border-primary focus:shadow-focus-primary focus:outline-none disabled:bg-surface-secondary disabled:text-text-secondary"
					disabled={disabled}
					id="search-prefix"
					onChange={(e) => setPrefix(e.target.value)}
					placeholder="Search by prefix..."
					value={prefix}
				/>
			</div>

			<Button disabled={disabled} type="submit" variant="secondary">
				Search
			</Button>
		</form>
	);
}
