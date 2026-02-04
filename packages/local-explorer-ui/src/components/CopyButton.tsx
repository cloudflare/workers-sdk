import { Button } from "@base-ui/react/button";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useState } from "react";

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
			{copied ? <CheckIcon size={14} weight="bold" /> : <CopyIcon size={14} />}
		</Button>
	);
}
