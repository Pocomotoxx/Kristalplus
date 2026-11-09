# real-time-view

Real-time view of swarm activity.

## Usage
```bash
npx colony monitoring real-time-view [options]
```

## Options
- `--filter <type>` - Filter view
- `--highlight <pattern>` - Highlight pattern
- `--tail <n>` - Show last N events

## Examples
```bash
# Start real-time view
npx colony monitoring real-time-view

# Filter errors
npx colony monitoring real-time-view --filter errors

# Highlight pattern
npx colony monitoring real-time-view --highlight "API"
```
