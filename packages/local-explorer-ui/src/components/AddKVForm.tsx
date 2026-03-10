import { Button } from "@base-ui/react/button";
import { cn } from "@cloudflare/kumo";
import { useEffect, useState } from "react";
import { validateKey } from "../utils/kv-validation";

interface AddKVFormProps {
	onAdd: (key: string, value: string) => Promise<boolean>;
	clearSignal?: number;
}

export function AddKVForm({ onAdd, clearSignal = 0 }: AddKVFormProps) {
	const [key, setKey] = useState("");
	const [value, setValue] = useState("");
	const [saving, setSaving] = useState(false);
	const [keyError, setKeyError] = useState<string | null>(null);

	useEffect(() => {
		if (clearSignal > 0) {
			setKey("");
			setValue("");
			setKeyError(null);
		}
	}, [clearSignal]);

	const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newValue = e.target.value;
		setKey(newValue);
		setKeyError(newValue.trim() ? validateKey(newValue) : null);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		const validationError = validateKey(key);
		if (validationError) {
			setKeyError(validationError);
			return;
		}

		try {
			setSaving(true);
			const completed = await onAdd(key, value);
			if (completed) {
				setKey("");
				setValue("");
				setKeyError(null);
			}
		} finally {
			setSaving(false);
		}
	};

	const isKeyInvalid = !!validateKey(key);

	return (
		<form
			className="mb-4 flex flex-col items-start gap-2 lg:flex-row"
			onSubmit={handleSubmit}
		>
			<div className="flex w-full shrink-0 flex-col lg:w-2xs">
				<label className="sr-only" htmlFor="add-key">
					Key
				</label>
				<input
					id="add-key"
					className={cn(
						"w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-text placeholder:text-text! focus:border-primary focus:shadow-focus-primary focus:outline-none disabled:bg-bg-secondary disabled:text-text-secondary",
						{
							"border-danger focus:shadow-focus-danger": keyError,
						}
					)}
					placeholder="Key"
					value={key}
					onChange={handleKeyChange}
					disabled={saving}
				/>
				{keyError && (
					<span className="mt-1 text-xs text-danger">{keyError}</span>
				)}
			</div>
			<div className="flex w-full flex-1 flex-col lg:min-w-2xs">
				<label className="sr-only" htmlFor="add-value">
					Value
				</label>
				<textarea
					id="add-value"
					className="max-h-32 w-full resize-none overflow-y-auto rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-text placeholder:text-text! focus:border-primary focus:shadow-focus-primary focus:outline-none disabled:bg-bg-secondary disabled:text-text-secondary lg:field-sizing-content"
					placeholder="Value"
					value={value}
					onChange={(e) => setValue(e.target.value)}
					disabled={saving}
				/>
			</div>
			<Button
				type="submit"
				className="inline-flex w-full shrink-0 cursor-pointer items-center justify-center rounded-md border-none bg-primary px-4 py-2 text-sm font-medium text-white transition-[background-color,color,transform] hover:bg-primary-hover focus:border-primary focus:shadow-focus-primary focus:outline-none active:translate-y-px data-disabled:cursor-not-allowed data-disabled:bg-primary/50 data-disabled:text-white/70 data-disabled:active:translate-y-0 lg:w-auto"
				disabled={saving || isKeyInvalid}
				focusableWhenDisabled
			>
				{saving ? "Adding..." : "Add entry"}
			</Button>
		</form>
	);
}
