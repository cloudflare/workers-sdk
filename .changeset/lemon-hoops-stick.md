---
"wrangler": patch
---

Recognize Hydrogen as a known unsupported framework in autoconfig

Previously, Hydrogen projects were incorrectly identified as React Router (since Hydrogen uses React Router under the hood), leading to a confusing autoconfig experience. Hydrogen is now recognized as a distinct unsupported framework, so users see a clear message that Hydrogen is not yet supported instead of being guided through React Router configuration.
