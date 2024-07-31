---
"wrangler": minor
---

feature: Integrate the Cloudflare Pipelines product into wrangler.

Cloudflare Pipelines is a product that handles the ingest of event streams 
into R2.  This feature integrates various forms of managing pipelines.

Usage:
  wrangler pipelines create <pipeline>  Create a new pipeline
  wrangler pipelines list               List current pipelines
  wrangler pipelines show <pipeline>    Show a pipeline configuration
  wrangler pipelines update <pipeline>  Update a pipeline
  wrangler pipelines delete <pipeline>  Delete a pipeline

Examples:
  wrangler pipelines create my-pipeline --r2 MY_BUCKET --access-key-id "my-key" --secret-access-key "my-secret"
  wrangler pipelines show my-pipeline
  wrangler pipelines delete my-pipline
