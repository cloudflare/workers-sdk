---
"@cloudflare/local-explorer-ui": patch
---

fix: Preserve expanded workflow steps across polling and improve instance page UX

Expanded steps no longer collapse when new steps arrive via polling. Expansion state is lifted into the parent component and tracked by stable step keys, and polling skips state updates when data hasn't changed.

Also: navigate to instance page after triggering, distinct refresh/restart icons, toolbar layout below stats strip, always-visible stats, unified status colors, and visual-only stripping of internal step name suffixes.
