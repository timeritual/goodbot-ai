import type { ModuleNode, ModuleEdge, CircularDependency } from './types.js';

/**
 * Find circular dependencies using Tarjan's strongly connected components algorithm.
 * Any SCC with more than one node is a cycle.
 */
export function findCircularDependencies(
  modules: ModuleNode[],
  edges: ModuleEdge[],
): CircularDependency[] {
  const edgeMap = new Map<string, ModuleEdge>();
  for (const edge of edges) {
    edgeMap.set(`${edge.from}::${edge.to}`, edge);
  }

  // Tarjan's SCC
  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const sccs: string[][] = [];

  function strongconnect(name: string): void {
    indices.set(name, index);
    lowlinks.set(name, index);
    index++;
    stack.push(name);
    onStack.add(name);

    const node = modules.find((m) => m.name === name);
    if (node) {
      for (const dep of node.dependsOn) {
        if (!indices.has(dep)) {
          strongconnect(dep);
          lowlinks.set(name, Math.min(lowlinks.get(name)!, lowlinks.get(dep)!));
        } else if (onStack.has(dep)) {
          lowlinks.set(name, Math.min(lowlinks.get(name)!, indices.get(dep)!));
        }
      }
    }

    // If this is a root node, pop the SCC
    if (lowlinks.get(name) === indices.get(name)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== name);

      if (scc.length > 1) {
        sccs.push(scc);
      }
    }
  }

  for (const module of modules) {
    if (!indices.has(module.name)) {
      strongconnect(module.name);
    }
  }

  // Convert SCCs to CircularDependency results
  return sccs.map((scc) => {
    // Build the cycle path
    const cycle = [...scc, scc[0]];

    // Collect files from edges within this SCC
    const files: CircularDependency['files'] = [];
    for (let i = 0; i < scc.length; i++) {
      for (let j = 0; j < scc.length; j++) {
        if (i === j) continue;
        const edge = edgeMap.get(`${scc[i]}::${scc[j]}`);
        if (edge) {
          files.push(...edge.files.slice(0, 2)); // Limit to 2 representative files per edge
        }
      }
    }

    return { cycle, files };
  });
}
