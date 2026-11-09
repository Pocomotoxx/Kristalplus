# @colony/plugin-agent-federation

[![npm version](https://img.shields.io/npm/v/@colony/plugin-agent-federation.svg)](https://www.npmjs.com/package/@colony/plugin-agent-federation)
[![npm downloads](https://img.shields.io/npm/dm/@colony/plugin-agent-federation.svg)](https://www.npmjs.com/package/@colony/plugin-agent-federation)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Cross-installation agent federation with zero-trust security, PII-gated data flow, and compliance-grade audit trails.

## Install + run

```bash
npx -y -p @colony/plugin-agent-federation@latest colony-federation --help
```

## Subcommands

| Command | Description |
|---|---|
| `colony-federation init` | Initialize federation on this node (generates keypair) |
| `colony-federation join <peer-url>` | Join a federation by connecting to a peer |
| `colony-federation leave` | Leave the current federation |
| `colony-federation peers` | List known peers and their trust levels |
| `colony-federation peers add <node-id>` | Add a peer to the federation |
| `colony-federation peers remove <node-id>` | Remove a peer |
| `colony-federation status` | Show federation health, sessions, trust levels |
| `colony-federation audit` | Query compliance-grade audit logs |
| `colony-federation trust` | Manage trust scores and tiers |
| `colony-federation config` | Show/update federation config |

## Configuration via `.env`

```bash
FEDERATION_NODE_NAME=my-node           # default: hostname
FEDERATION_BIND_HOST=127.0.0.1         # default: 127.0.0.1 (0.0.0.0 accepts other hosts)
FEDERATION_BIND_PORT=8443              # default: 8443
FEDERATION_TRUST_LEVEL=untrusted       # default: untrusted
```

## Tests

325 unit tests covering audit, routing, discovery, plugin lifecycle.

```bash
npm test
```

## License

MIT — Colony Team.
