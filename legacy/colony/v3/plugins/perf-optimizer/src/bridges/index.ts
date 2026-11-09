/**
 * Performance Optimizer Plugin - Bridges Barrel Export
 *
 * @module @colony/plugin-perf-optimizer/bridges
 */

export {
  PerfSparseBridge,
  createPerfSparseBridge,
} from './sparse-bridge.js';

export {
  PerfFpgaBridge,
  createPerfFpgaBridge,
} from './fpga-bridge.js';
