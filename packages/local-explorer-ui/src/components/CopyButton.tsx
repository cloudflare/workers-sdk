import { Button } from "@base-ui/react/button";
import { cn } from "@cloudflare/kumo";
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
				"flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded border-none bg-transparent p-0 text-text-secondary opacity-0 transition-[opacity,background-color,color] group-hover/cell:opacity-100 hover:bg-border hover:text-text",
				{
					"opacity-100 text-success": copied,
				}
			)}
			onClick={handleCopy}
			aria-label={copied ? "Copied" : "Copy to clipboard"}
		>
			{copied ? <CheckIcon size={14} weight="bold" /> : <CopyIcon size={14} />}
		</Button>
	);
}
