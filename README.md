# Mini Agent

This is a minimal fork of minimal agent by @obra -> https://github.com/obra/smallest-agent

But more verbose, for the presentation purposes :blush:

## How to use

**JUST DON'T!**

> IT HAS UNRESTRICTED BASH ACCESS.
>
> IT CAN DO ANYTHING.
>
> IT MIGHT DECIDE TO ERASE ALL YOUR FILES AND INSTALL LINUX

If you'd like to run it, like I do, use [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/) to isolate the agent in a microVM.

### 1. Start the sandbox (on the host) and set the envs

Copy the `.env.template` to `.env` and fill in the API keys.

```sh
npm run sandbox:run
```

This starts (or resumes) a sandbox for this workspace. The sandbox name is derived from the directory name — e.g. `shell-smallest-agent`.

### 2. Allow outbound traffic to the provider (on the host, once)

The sandbox proxy's default allowlist only covers Anthropic endpoints. For Mistral, run once on the host while the sandbox is running:

```sh
npm run sandbox:network
```

To inspect what traffic is being allowed or blocked:

```sh
npm run sandbox:log
```

### 3. Run the agent (inside the sandbox)

```sh
# clone and install inside the sandbox
git clone https://github.com/michalczukm/smallest-agent.git && cd smallest-agent
npm ci

# Anthropic
npm run start:anthropic

# Mistral / Codestral
npm run start:mistral
```

### Network notes

- Node.js v20 native `fetch` does not respect `HTTP_PROXY`/`HTTPS_PROXY` env vars — the code uses `undici`'s `ProxyAgent` with `HTTPS_PROXY=http://host.docker.internal:3128` to route through the sandbox proxy.
