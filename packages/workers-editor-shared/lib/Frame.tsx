import { createComponent } from "@cloudflare/style-container";
import type { ComponentPropsWithoutRef, ComponentType, Ref } from "react";

type FrameProps = ComponentPropsWithoutRef<"iframe"> & {
	innerRef?: Ref<HTMLIFrameElement>;
};

const Frame: ComponentType<FrameProps> = createComponent<"iframe">(
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
