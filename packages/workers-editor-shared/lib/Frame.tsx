import type React from "react";
import { createComponent } from "@cloudflare/style-container";

const Frame: React.ComponentType<React.IframeHTMLAttributes<HTMLIFrameElement> & { innerRef?: React.RefObject<HTMLIFrameElement> }> =
	createComponent<"iframe">(
		() => ({
			position: "absolute",
			top: 0,
			left: 0,
			width: "100%",
			height: "100%",
			border: 0,
		}),
		"iframe"
	);

export default Frame;
