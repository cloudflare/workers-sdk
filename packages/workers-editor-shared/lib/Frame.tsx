import { createComponent } from "@cloudflare/style-container";
import type React from "react";

type FrameProps = React.IframeHTMLAttributes<HTMLIFrameElement> & {
	innerRef?: React.Ref<HTMLIFrameElement>;
};

const StyledFrame = createComponent<"iframe">(
	() => ({
		position: "absolute",
		top: 0,
		left: 0,
		width: "100%",
		height: "100%",
		border: 0,
	}),
	"iframe"
) as React.ComponentType<FrameProps>;

const Frame = (props: FrameProps) => <StyledFrame {...props} />;

export default Frame;
