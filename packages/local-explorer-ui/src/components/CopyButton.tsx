import { Button } from "@base-ui-components/react/button";
import { Tooltip } from "@base-ui-components/react/tooltip";
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
		<Tooltip.Root>
			<Tooltip.Trigger
				render={
					<Button
						className={`copy-btn ${copied ? "copied" : ""}`}
						onClick={handleCopy}
					>
						{copied ? <CheckIcon /> : <CopyIcon />}
					</Button>
				}
			/>
			<Tooltip.Portal>
				<Tooltip.Positioner sideOffset={4}>
					<Tooltip.Popup className="tooltip">
						{copied ? "Copied!" : "Copy to clipboard"}
					</Tooltip.Popup>
				</Tooltip.Positioner>
			</Tooltip.Portal>
		</Tooltip.Root>
	);
}
