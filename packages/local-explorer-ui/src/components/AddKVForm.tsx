import { Button } from "@base-ui/react/button";
import { Field } from "@base-ui/react/field";
import { Input } from "@base-ui/react/input";
import { useState } from "react";

interface AddKVFormProps {
	onAdd: (key: string, value: string) => Promise<void>;
}

// KV key size limit per Cloudflare docs
const MAX_KEY_BYTES = 512;

function validateKey(key: string): string | null {
	if (!key.trim()) {
		return "Key is required";
	}
	const byteLength = new TextEncoder().encode(key).length;
	if (byteLength > MAX_KEY_BYTES) {
		return `Key must be ${MAX_KEY_BYTES} bytes or less (currently ${byteLength} bytes)`;
	}
	return null;
}

export function AddKVForm({ onAdd }: AddKVFormProps) {
	const [key, setKey] = useState("");
	const [value, setValue] = useState("");
	// Tracks whether we're currently saving to disable form during submission
	const [saving, setSaving] = useState(false);
	// API error from the onAdd callback (e.g. network failure)
	const [error, setError] = useState<string | null>(null);
	// Client-side validation error for the key field
	const [keyError, setKeyError] = useState<string | null>(null);

	const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newKey = e.target.value;
		setKey(newKey);
		setError(null);
		// Only validate non-empty keys to avoid showing "required" error while typing
		setKeyError(newKey.trim() ? validateKey(newKey) : null);
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
			setError(null);
			await onAdd(key, value);
			setKey("");
			setValue("");
			setKeyError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to add entry");
		} finally {
			setSaving(false);
		}
	};

	return (
		<form className="add-entry-form" onSubmit={handleSubmit}>
			<Field.Root invalid={!!keyError} className="add-entry-field">
				<Field.Label className="sr-only">Key</Field.Label>
				<Input
					className="form-input key-input"
					placeholder="Key"
					value={key}
					onChange={handleKeyChange}
					disabled={saving}
				/>
				{keyError && (
					<Field.Error className="field-error">{keyError}</Field.Error>
				)}
			</Field.Root>
			<Field.Root className="add-entry-field add-entry-field-value">
				<Field.Label className="sr-only">Value</Field.Label>
				<Input
					className="form-input value-input"
					placeholder="Value"
					value={value}
					onChange={(e) => setValue(e.target.value)}
					disabled={saving}
				/>
			</Field.Root>
			<Button
				type="submit"
				className="btn btn-primary"
				disabled={saving || !!keyError}
				focusableWhenDisabled
			>
				{saving ? "Adding..." : "Add entry"}
			</Button>
			{error && <span className="add-entry-error">{error}</span>}
		</form>
	);
}
