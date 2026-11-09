# swarm-monitor

Real-time swarm monitoring.

## Usage
```bash
npx colony swarm monitor [options]
```

## Options
- `--interval <ms>` - Update interval
- `--metrics` - Show detailed metrics
- `--export` - Export monitoring data

## Examples
```bash
# Start monitoring
npx colony swarm monitor

# Custom interval
npx colony swarm monitor --interval 5000

# With metrics
npx colony swarm monitor --metrics
```
