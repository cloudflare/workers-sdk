import { Button, cn } from "@cloudflare/kumo";
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
			className={cn(
				"h-6 w-6 p-0 opacity-0 transition-[opacity,background-color,color] group-hover/cell:opacity-100",
				{
					"text-success opacity-100": copied,
				}
			)}
			onClick={handleCopy}
			aria-label={copied ? "Copied" : "Copy to clipboard"}
			variant="ghost"
			shape="square"
		>
			{copied ? <CheckIcon size={14} weight="bold" /> : <CopyIcon size={14} />}
		</Button>
	);
}
