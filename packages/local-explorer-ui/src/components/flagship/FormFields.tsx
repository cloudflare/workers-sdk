import { cn, inputVariants, Label } from "@cloudflare/kumo";
import type { JSX, KeyboardEvent, ReactNode } from "react";

type InputSize = "xs" | "sm" | "base" | "lg";

interface TextInputProps {
	ariaLabel?: string;
	className?: string;
	disabled?: boolean;
	id?: string;
	invalid?: boolean;
	maxLength?: number;
	mono?: boolean;
	numeric?: boolean;
	onEnter?: () => void;
	onValueChange: (value: string) => void;
	placeholder?: string;
	size?: InputSize;
	value: string;
}

export function TextInput({
	ariaLabel,
	className,
	disabled,
	id,
	invalid,
	maxLength,
	mono,
	numeric,
	onEnter,
	onValueChange,
	placeholder,
	size = "base",
	value,
}: TextInputProps): JSX.Element {
	function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
		if (event.key === "Enter" && onEnter !== undefined) {
			event.preventDefault();
			onEnter();
		}
	}

	return (
		<input
			aria-invalid={invalid === true ? true : undefined}
			aria-label={ariaLabel}
			autoComplete="off"
			className={cn(
				inputVariants({
					focusIndicator: true,
					size,
					variant: invalid === true ? "error" : "default",
				}),
				"w-full min-w-0 outline-none disabled:cursor-not-allowed",
				mono === true && "font-mono",
				className
			)}
			disabled={disabled}
			id={id}
			inputMode={numeric === true ? "decimal" : undefined}
			maxLength={maxLength}
			onChange={(event) => onValueChange(event.target.value)}
			onKeyDown={handleKeyDown}
			placeholder={placeholder}
			spellCheck={false}
			type="text"
			value={value}
		/>
	);
}

interface FieldProps {
	children: ReactNode;
	description?: string;
	error?: string;
	htmlFor?: string;
	label: string;
	optional?: boolean;
}

export function Field({
	children,
	description,
	error,
	htmlFor,
	label,
	optional,
}: FieldProps): JSX.Element {
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={htmlFor} showOptional={optional}>
				{label}
			</Label>
			{children}
			{error === undefined ? (
				description === undefined ? null : (
					<p className="text-xs text-kumo-subtle">{description}</p>
				)
			) : (
				<p className="text-xs text-kumo-danger" role="alert">
					{error}
				</p>
			)}
		</div>
	);
}
