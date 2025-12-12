---
"wrangler": patch
---

Add helpful warning when SSL certificate errors occur due to corporate proxies or VPNs intercepting HTTPS traffic. When errors like "self-signed certificate in certificate chain" are detected, wrangler now displays guidance about installing missing system roots from your corporate proxy vendor.
