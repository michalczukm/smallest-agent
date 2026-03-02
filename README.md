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

If you'd like to run it, like I do, use f.e. docker sandbox micro-vm or something like that to sandbox the agent.

https://docs.docker.com/ai/sandboxes/#why-use-docker-sandboxes

```sh
docker sandbox run shell ./the-workspace-that-will-be-mounted-into-the-sandbox
```

then inside the sandbox, run:

```sh
git clone https://github.com/michalczukm/smallest-agent.git && cd smallest-agent
npm ci
ANTHROPIC_API_KEY=your-api-key-pls-limit-it npm run start
```

### Network policies

The sandbox proxy's default allowlist only includes Anthropic endpoints. If you use a different provider, add it before starting — e.g. for Mistral:

```sh
# run this on the HOST, not inside the sandbox
docker sandbox network proxy <your-sandbox-name> --allow-host api.mistral.ai
```

Find your sandbox name with `docker sandbox ls`. The policy persists across restarts.
