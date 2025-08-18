# Add `wrangler prompt` - AI Assistant powered by opencode

## Summary

Adds `wrangler prompt` command that launches [opencode](https://opencode.ai) AI assistant with Cloudflare Workers-specific system prompt and Cloudflare docs MCP server.

In the future, this can be expanded with additional system prompts, MCP prompts, and potentially more advanced behavior using [opencode plugins](https://opencode.ai/docs/plugins/).

## What This Does

- `wrangler prompt` - Launch AI assistant with Cloudflare context
- `wrangler prompt "question"` - Launch with initial prompt
- `wrangler prompt --auth login/logout/list` - Manage authentication
- Auto-installs opencode if not present
- Pre-configures access to Cloudflare docs via MCP server

## Architecture

```mermaid
graph LR
    A[wrangler prompt] --> B{opencode installed?}
    B -->|No| C[Auto-install via npm]
    B -->|Yes| D[Generate config]
    C --> D
    D --> E[Launch opencode with Cloudflare profile]
    E --> F["AI assistant (opencode)<br>with Cloudflare docs MCP"]

    %% Assign classes to nodes
    class A wrangler;
    class B decision;
    class C install;
    class D config;
    class E launch;
    class F ai;

    %% Define styles for dark mode
    classDef wrangler fill:#243748,stroke:#63c7f7,stroke-width:2px,color:#eaf6fb;
    classDef decision fill:#31224b,stroke:#ef6fff,stroke-width:2px,color:#fff;
    classDef install fill:#233a24,stroke:#6bf757,stroke-width:2px,color:#e0ffea;
    classDef config fill:#233a30,stroke:#1faeb7,stroke-width:2px,color:#cafbff;
    classDef launch fill:#342a25,stroke:#ffb86b,stroke-width:2px,color:#fff6e0;
    classDef ai fill:#17313f,stroke:#f87663,stroke-width:2px,color:#ffe8e5;
```

## Implementation

**File Structure:**

```
packages/wrangler/src/prompt/
├── index.ts              # Command definition and handler
├── opencode-manager.ts   # Detection and auto-installation
├── config-generator.ts   # opencode config generation
└── types.ts              # opencode config schema
```

**Generated Configuration:**

- Cloudflare-specialized agent (see: https://opencode.ai/docs/agents/)
- System prompt includes detected wrangler config file path
- Pre-configured MCP server for Cloudflare docs (`https://docs.mcp.cloudflare.com/mcp`)
- Temporary opencode config stored in `.wrangler/tmp/`

## Example Usage

```bash
# Basic usage
npx wrangler prompt

# With initial prompt
npx wrangler prompt "add a queue named my-queue to my worker"

# Authentication
npx wrangler prompt --auth login
```

## Testing

Currently no dedicated tests (experimental feature). Manual testing completed on macOS with npm.

# Diagrams

```mermaid
graph TB

    %% --- Dark Mode Styles ---
    classDef ui fill:#3e2f5b,stroke:#a883ff,stroke-width:2px,color:#fff;
    classDef core fill:#202a44,stroke:#5b9bff,stroke-width:2px,color:#fff;
    classDef assets fill:#22422e,stroke:#53d39d,stroke-width:2px,color:#fff;
    classDef external fill:#1a373f,stroke:#46d6fd,stroke-width:2px,color:#fff;
    classDef special_cli fill:#7c3aed,stroke:#ffe86c,stroke-width:2.5px,color:#fff;
    classDef special_opencode fill:#1668d4,stroke:#a4e7ff,stroke-width:2.5px,color:#fff;
    classDef special_cfg fill:#13bb82,stroke:#e6ffe6,stroke-width:2.5px,color:#fff;
    %% Highlight one core node to show connections
    classDef special_core fill:#2b4177,stroke:#ffc46c,stroke-width:2.5px,color:#fff;

    %% --- Nodes & Subgraphs ---
    subgraph "User Interface"
        CLI[wrangler prompt]
        AUTH[wrangler prompt --auth]
        PROMPT[<p>wrangler prompt 'question'</p>]
    end

    subgraph "Wrangler Core"
        CMD[prompt command]
        DETECT[opencode detector]
        INSTALL[package installer]
        CONFIG[config generator]
    end

    subgraph "Generated Assets"
        CFG[Cloudflare config]
        PROMPT_SYS[System prompt]
        MCP[Docs MCP server]
    end

    subgraph "External"
        OPENCODE[opencode process]
        NPM[npm registry]
        DOCS[Cloudflare docs]
    end

    %% --- Edges/Process Flow ---
    CLI --> CMD
    AUTH --> CMD
    PROMPT --> CMD
    CMD --> DETECT
    DETECT -->|missing| INSTALL
    DETECT -->|found| CONFIG
    INSTALL --> NPM
    INSTALL -->|success| CONFIG
    CONFIG --> CFG
    CONFIG --> PROMPT_SYS
    CONFIG --> MCP
    CMD -->|launch| OPENCODE
    OPENCODE -->|queries| DOCS

    %% --- Styling by Class ---
    class CLI ui,special_cli;
    class AUTH,PROMPT ui;
    class CMD,special_core core;
    class DETECT,INSTALL,CONFIG core;
    class CFG assets,special_cfg;
    class PROMPT_SYS,MCP assets;
    class OPENCODE external,special_opencode;
    class NPM,DOCS external;
```

```mermaid
sequenceDiagram
    participant User
    participant Wrangler
    participant NPM
    participant Opencode
    participant CloudflareDocs

    User->>Wrangler: wrangler prompt
    Wrangler->>Wrangler: Check if opencode installed

    alt opencode not found
        Wrangler->>User: "opencode not found. Installing..."
        Wrangler->>NPM: npm install -g opencode-ai
        NPM-->>Wrangler: Installation output (streamed)
        Wrangler->>User: "✨ Successfully installed opencode"
    end

    Wrangler->>Wrangler: Generate config with project context
    Wrangler->>Wrangler: Set OPENCODE_CONFIG env var
    Wrangler->>Opencode: Launch with --agent cloudflare

    loop User Interaction
        User->>Opencode: Ask questions about Workers
        Opencode->>CloudflareDocs: Query documentation via MCP
        CloudflareDocs-->>Opencode: Return relevant docs
        Opencode->>User: Provide contextual answers
    end

    User->>Opencode: Exit (Ctrl+C)
    Opencode->>Wrangler: Process exit
    Wrangler->>User: Return to shell
```
