# Issue Triager

Issue Triager is an internal tool that helps triage GitHub issues for this repository. It fetches untriaged issues from [the `workers-sdk` project](https://github.com/orgs/cloudflare/projects/1), uses AI to classify them based on similarity to previous issues, and provides an interactive CLI for reviewing and taking actions on the issues.

## Features

- Fetches untriaged issues from the `cloudflare/workers-sdk` repository
- Generates vector embeddings for issues and stores them in a vector database
- Uses AI to find similar issues and classify new issues based on the similarity
- Provides an interactive CLI for reviewing issues, viewing the AI classification, and taking actions like opening the issue on GitHub

## Architecture

The tool consists of the following components:

- Cloudflare Worker: Handles API requests for generating and storing issue embeddings, and finding similar issues
- CLI: Provides the user interface for fetching, classifying, and reviewing issues
- GitHub GraphQL API: Used to fetch issues and their comments from the repository

## Setup

Create a `.env` file with the following variables:

```
CLOUDFLARE_ACCOUNT_ID=[cloudflare account id]
CLOUDFLARE_API_KEY=[cloudflare api key]
GITHUB_API_TOKEN=[github api token]
WORKER_BASE_URL=http://localhost:8787
ISSUE_TRIAGER_API_KEY=[key for authenticating requests to the worker]
```

Create a `.dev.vars` file with the following variables:

```
ISSUE_TRIAGER_API_KEY=[key for authenticating requests to the worker]
```

## Usage

Run the CLI:

```bash
cd packages/issue-triager
pnpm triage
```

1. The CLI will fetch untriaged issues from the repository and display them in a list.
2. Select an issue to classify using the arrow keys and press Enter.
3. The AI will find similar issues and generate a classification for the selected issue. The classification includes:
   - Duplicate issue (if found)
   - Whether the issue can be closed and the reason
   - Whether the issue should be added to the backlog
   - Whether more information or reproduction steps are needed from the user
   - Severity of the issue (Major, Minor, Trivial)
4. Review the classification and decide on the next action:
   - Open the issue on GitHub to add comments or labels
   - Classify another issue
   - Exit the CLI
