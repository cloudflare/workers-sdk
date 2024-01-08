import { $ as $colors } from "kleur/colors";

const originalEnabled = $colors.enabled;

// `kleur` is marked as a dev dependency, so will get bundled. We'd still like
// to be able to control whether it's enabled in tests though. Therefore, export
// a function that toggles the enabled state of our bundled version.
export function _forceColour(enabled = originalEnabled) {
	$colors.enabled = enabled;
}
