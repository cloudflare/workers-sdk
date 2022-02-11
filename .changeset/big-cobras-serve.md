---
"wrangler": patch
---

feat: use `CLOUDFLARE_...` environment variables deprecating `CF_...`

Now one should use `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_BASE_URL` rather than `CF_API_TOKEN`, `CF_ACCOUNT_ID` and `CF_API_BASE_URL`, which have been deprecated.

If you use the deprecated variables they will still work but you will see a warning message.

Within the Cloudflare tooling ecosystem, we have a mix of `CF_` and `CLOUDFLARE_`
for prefixing environment variables. Until recently, many of the tools
were fine with `CF_` however, there started to be conflicts with
external tools (such as Cloudfoundary CLI), which also uses `CF_` as a
prefix, and would potentially be reading and writing the same value the
Cloudflare tooling.

The Go SDK[1], Terraform[2] and cf-terraforming[3] have made the jump to
the `CLOUDFLARE_` prefix for environment variable prefix.

In future, all SDKs will use this prefix for consistency and to allow all the tooling to reuse the same environment variables in the scenario where they are present.

[1]: https://github.com/cloudflare/cloudflare-go
[2]: https://github.com/cloudflare/terraform-provider-cloudflare
[3]: https://github.com/cloudflare/cf-terraforming
