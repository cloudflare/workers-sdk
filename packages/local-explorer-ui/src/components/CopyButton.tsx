import { Button } from "@base-ui/react/button";
import { useState } from "react";
import CheckIcon from "../assets/icons/check.svg?react";
import CopyIcon from "../assets/icons/copy.svg?react";

interface CopyButtonProps {
	text: string;
}

export function CopyButton({ text }: CopyButtonProps) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	return (
		<Button
			className={`copy-btn ${copied ? "copied" : ""}`}
			onClick={handleCopy}
			aria-label={copied ? "Copied" : "Copy to clipboard"}
		>
			{copied ? <CheckIcon /> : <CopyIcon />}
		</Button>
	);
}
