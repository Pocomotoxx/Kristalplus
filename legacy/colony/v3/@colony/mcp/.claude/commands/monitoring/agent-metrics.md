# agent-metrics

View agent performance metrics.

## Usage
```bash
npx colony agent metrics [options]
```

## Options
- `--agent-id <id>` - Specific agent
- `--period <time>` - Time period
- `--format <type>` - Output format

## Examples
```bash
# All agents metrics
npx colony agent metrics

# Specific agent
npx colony agent metrics --agent-id agent-001

# Last hour
npx colony agent metrics --period 1h
```
