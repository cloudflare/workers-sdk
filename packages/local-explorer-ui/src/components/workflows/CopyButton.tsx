import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useState } from "react";

export function CopyButton({
	text,
	label = "Copy",
}: {
	text: string;
	label?: string;
}): JSX.Element {
	const [copied, setCopied] = useState(false);

	function handleCopy(): void {
		void navigator.clipboard.writeText(text).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}

	return (
		<button
			className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-border/60"
			onClick={handleCopy}
			title={label}
		>
			{copied ? (
				<CheckIcon size={14} className="text-[#00c950]" />
			) : (
				<CopyIcon size={14} />
			)}
		</button>
	);
}
