import type {
  DependencyAnalysis,
  SolidAnalysis,
  HealthScore,
  HealthGrade,
} from './types.js';

/**
 * Compute a single health grade (A+ to F) from all analysis results.
 */
export function calculateHealthScore(
  dep: DependencyAnalysis,
  solid: SolidAnalysis,
): HealthScore {
  // Dependencies score: penalize circular deps heavily, layer violations moderately
  const depPenalty =
    dep.circularDependencies.length * 15 +
    dep.layerViolations.length * 5 +
    dep.barrelViolations.length * 2;
  const dependencies = Math.max(0, 100 - depPenalty);

  // Stability score: based on SDP violations and how well modules follow stability principles
  const stabPenalty = dep.stabilityViolations.length * 10;
  const stability = Math.max(0, 100 - stabPenalty);

  // SOLID score: from the solid analysis
  const solidScore = solid.scores.overall;

  // Architecture score: reward having layers, barrels, interfaces
  let architecture = 50; // base
  if (dep.modules.length > 0) architecture += 10;
  if (dep.modules.length >= 4) architecture += 10;
  // Penalize if modules are tightly coupled
  const avgCoupling = dep.edges.length / Math.max(dep.modules.length, 1);
  if (avgCoupling <= 3) architecture += 20;
  else if (avgCoupling <= 5) architecture += 10;
  // Cap at 100
  architecture = Math.min(100, architecture);
  // Penalize layer violations
  architecture = Math.max(0, architecture - dep.layerViolations.length * 10);

  const score = Math.round(
    dependencies * 0.30 +
    stability * 0.20 +
    solidScore * 0.25 +
    architecture * 0.25,
  );

  return {
    grade: scoreToGrade(score),
    score,
    breakdown: {
      dependencies,
      stability,
      solid: solidScore,
      architecture,
    },
  };
}

function scoreToGrade(score: number): HealthGrade {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 78) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 63) return 'C+';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}
