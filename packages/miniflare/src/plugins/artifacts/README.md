# Artifacts in Miniflare

The Artifacts plugin implements the local Artifacts binding in workerd. This
first version requires Git 2.32 or newer installed globally on the host and
available on PATH. Miniflare checks the Git version at local startup and gives
installation or upgrade instructions if needed. A Node worker thread runs the
native Git backend. Set `dev.remote` to `false` explicitly to select local
storage; an omitted setting retains remote binding behavior in this stage.
We plan to open-source a JavaScript Git engine in the future; it is not
included in this version.

## Local startup

```mermaid
sequenceDiagram
    participant Dev as Developer tool
    participant MF as Miniflare
    participant Plugin as Artifacts plugin
    participant Controller as ArtifactsController
    participant Sidecar as Node Git sidecar
    participant Workerd as workerd

    Dev->>MF: Configure Artifacts binding
    MF->>Plugin: getBindings()
    Plugin->>Plugin: Select local and validate namespace
    Plugin-->>MF: Bind to local namespace entrypoint
    MF->>Plugin: getServices()
    Plugin->>Plugin: Verify host Git is available on PATH
    Plugin->>Controller: get(Git storage path)
    Controller->>Sidecar: Start worker thread and private HTTP listener
    Sidecar-->>Controller: Address and secret
    Controller-->>Plugin: Sidecar endpoint and Git socket port
    Plugin-->>MF: Binding Worker, DO storage, backend service, Git socket
    MF->>Workerd: Start configured services and socket
```

`getBindings()` routes each local binding to a namespace-scoped service.
`getServices()` creates the binding Worker, namespace Durable Object, persistent
metadata disk, internal Git backend service, and Git socket. The controller
reuses a sidecar per Git storage path and closes it when Miniflare is disposed.
The socket used by Git clients and the sidecar's private HTTP listener are
**different endpoints**.

## Local binding RPC

For example, `env.REPOS.create("demo")`:

```mermaid
sequenceDiagram
    participant App as User Worker
    participant Entry as Binding Worker
    participant DO as Namespace DO
    participant Backend as Backend service
    participant Sidecar as Node Git sidecar
    participant Disk as Local disk

    App->>Entry: env.REPOS.create("demo")
    Entry->>DO: RPC create("demo")
    DO->>DO: Validate and serialize mutation
    DO->>Backend: POST internal create request
    Backend->>Sidecar: Inject private backend header
    Sidecar->>Disk: git init --bare
    Sidecar-->>DO: Git state (via backend service)
    DO->>Disk: Persist metadata and token hash
    DO-->>Entry: Repository info and initial token
    Entry-->>App: Create result
```

The Durable Object stores repository metadata and token hashes on local disk;
the sidecar stores the bare Git repositories separately. `git-sidecar.ts`
handles HTTP routing and repository locks, while `git-client.ts` owns
repository-scoped Git commands and result parsing. Read operations such as
`readFile()` also use the binding Worker and native Git backend. Node callers
reach the same binding through Miniflare's Node binding proxy. Namespace and
repository names are hashed into short, namespace-scoped on-disk paths; this
leaves room for Git packfiles and workerd SQLite files on platforms with path
length limits. Older draft storage layouts are not migrated automatically:
startup rejects a detected old layout rather than silently creating empty
repositories. Back up any local repositories before resetting the Artifacts
persistence directory. Do not delete the persistence directory without first
checking whether it holds work you need.

## Git clone and push

```mermaid
sequenceDiagram
    participant Git as Git client
    participant Socket as Git socket
    participant Entry as Binding Worker
    participant DO as Namespace DO
    participant Backend as Backend service
    participant Sidecar as Node Git sidecar
    participant Native as Native Git

    Git->>Socket: Git smart HTTP at /git/:namespace/:repo.git
    Socket->>Entry: Route request
    Entry->>DO: fetch(request)
    DO->>DO: Check endpoint, repository, token, and scope
    DO->>Backend: Forward request without Authorization header
    Backend->>Sidecar: Inject private backend header
    Sidecar->>Native: Stream via git http-backend
    Native-->>Sidecar: Discovery or pack response
    Sidecar-->>DO: Git response (via backend service)
    opt Successful receive-pack push
        DO->>Backend: Read updated refs
        Backend->>Sidecar: Internal refs request
        Sidecar-->>DO: Refs (via backend service)
        DO->>DO: Persist updated push metadata
    end
    DO-->>Entry: Git response
    Entry-->>Socket: Git response
    Socket-->>Git: Git response
```

The binding Worker checks the supported Git endpoints and authenticates
repository tokens before forwarding. The internal service injects the sidecar
secret; the client's `Authorization` header is removed before that hop. For a
successful push, the Durable Object refreshes repository metadata before
returning the response. The sidecar uses native `git http-backend` for Git smart
HTTP rather than reproducing Git's pack protocol.

## Explicit remote binding

When `dev.remote` is `true`, this binding uses the remote-bindings proxy instead
of creating local Artifacts storage or a local Git sidecar for that namespace.

```mermaid
sequenceDiagram
    participant App as User Worker
    participant MF as Miniflare
    participant Plugin as Artifacts plugin
    participant Proxy as Remote-bindings proxy
    participant CF as Cloudflare Artifacts

    MF->>Plugin: getBindings() with remote: true
    Plugin-->>MF: Bind to remote proxy service
    MF->>Proxy: Start remote proxy Worker
    App->>Proxy: env.REPOS method call
    Proxy->>CF: Remote binding request
    CF-->>Proxy: Result
    Proxy-->>App: Result
```

A local binding does not automatically synchronize with production Artifacts.
An explicit repository import may contact its specified HTTPS Git remote; that
is distinct from enabling a remote Artifacts binding.
