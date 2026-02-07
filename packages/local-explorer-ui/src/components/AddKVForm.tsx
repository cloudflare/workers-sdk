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
		<form className="flex gap-2 mb-4 items-start" onSubmit={handleSubmit}>
			<div className="flex flex-col w-[200px] shrink-0">
				<label className="sr-only" htmlFor="add-key">
					Key
				</label>
				<input
					id="add-key"
					className={cn(
						"w-full font-mono bg-bg text-text placeholder:text-text! py-2 px-3 text-sm border border-border rounded-md focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(255,72,1,0.15)] disabled:bg-bg-secondary disabled:text-text-secondary",
						{
							"border-danger focus:shadow-[0_0_0_3px_rgba(251,44,54,0.15)]":
								keyError,
						}
					)}
					placeholder="Key"
					value={key}
					onChange={handleKeyChange}
					disabled={saving}
				/>
				{keyError && (
					<span className="text-danger text-xs mt-1">{keyError}</span>
				)}
			</div>
			<div className="flex flex-col flex-1 min-w-[200px]">
				<label className="sr-only" htmlFor="add-value">
					Value
				</label>
				<textarea
					id="add-value"
					className="w-full font-mono bg-bg text-text placeholder:text-text! py-2 px-3 text-sm border border-border rounded-md focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(255,72,1,0.15)] disabled:bg-bg-secondary disabled:text-text-secondary max-h-[200px] resize-none overflow-y-auto [field-sizing:content]"
					placeholder="Value"
					value={value}
					onChange={(e) => setValue(e.target.value)}
					disabled={saving}
				/>
			</div>
			<Button
				type="submit"
				className="shrink-0 inline-flex items-center justify-center py-2 px-4 text-sm font-medium border-none rounded-md cursor-pointer transition-[background-color,color,transform] active:translate-y-px bg-primary text-white hover:bg-primary-hover data-[disabled]:bg-primary/50 data-[disabled]:text-white/70 data-[disabled]:cursor-not-allowed data-[disabled]:active:translate-y-0"
				disabled={saving || isKeyInvalid}
				focusableWhenDisabled
			>
				{saving ? "Adding..." : "Add entry"}
			</Button>
		</form>
	);
}
