import type { ModuleNode, ModuleEdge, StabilityMetrics, StabilityViolation } from './types.js';

export function calculateStability(modules: ModuleNode[]): StabilityMetrics[] {
  return modules
    .filter((m) => m.name !== '_root')
    .map((m) => {
      const ca = m.dependedOnBy.size;
      const ce = m.dependsOn.size;
      const total = ca + ce;
      const instability = total === 0 ? 0.5 : ce / total;

      return {
        moduleName: m.name,
        afferentCoupling: ca,
        efferentCoupling: ce,
        instability: Math.round(instability * 100) / 100,
      };
    })
    .sort((a, b) => a.instability - b.instability);
}

export function findStabilityViolations(
  metrics: StabilityMetrics[],
  edges: ModuleEdge[],
): StabilityViolation[] {
  const metricsByName = new Map(metrics.map((m) => [m.moduleName, m]));
  const violations: StabilityViolation[] = [];

  for (const edge of edges) {
    const fromMetrics = metricsByName.get(edge.from);
    const toMetrics = metricsByName.get(edge.to);
    if (!fromMetrics || !toMetrics) continue;

    // SDP violation: a more stable module depends on a less stable module
    // Only flag when the difference is meaningful (>= 0.1)
    if (fromMetrics.instability < toMetrics.instability &&
        toMetrics.instability - fromMetrics.instability >= 0.1) {
      violations.push({
        from: edge.from,
        to: edge.to,
        fromInstability: fromMetrics.instability,
        toInstability: toMetrics.instability,
        files: edge.files,
      });
    }
  }

  return violations.sort(
    (a, b) => (b.toInstability - b.fromInstability) - (a.toInstability - a.fromInstability),
  );
}
