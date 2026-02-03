import { Button } from "@base-ui/react/button";
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
		<form className="add-entry-form" onSubmit={handleSubmit}>
			<div className="kv-field">
				<label className="sr-only" htmlFor="add-key">
					Key
				</label>
				<input
					id="add-key"
					className={`kv-input kv-input--add${keyError ? " kv-input--invalid" : ""}`}
					placeholder="Key"
					value={key}
					onChange={handleKeyChange}
					disabled={saving}
				/>
				{keyError && <span className="field-error">{keyError}</span>}
			</div>
			<div className="kv-field">
				<label className="sr-only" htmlFor="add-value">
					Value
				</label>
				<textarea
					id="add-value"
					className="kv-input kv-input--add kv-input--textarea"
					placeholder="Value"
					value={value}
					onChange={(e) => setValue(e.target.value)}
					disabled={saving}
				/>
			</div>
			<Button
				type="submit"
				className="btn btn-primary"
				disabled={saving || isKeyInvalid}
				focusableWhenDisabled
			>
				{saving ? "Adding..." : "Add entry"}
			</Button>
		</form>
	);
}
