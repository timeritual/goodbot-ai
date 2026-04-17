import type { FileImports, ModuleNode, ModuleEdge } from './types.js';

export function buildDependencyGraph(
  fileImports: FileImports[],
): { modules: ModuleNode[]; edges: ModuleEdge[] } {
  // Build module nodes
  const moduleMap = new Map<string, ModuleNode>();
  const moduleFileCounts = new Map<string, number>();

  for (const fi of fileImports) {
    moduleFileCounts.set(fi.moduleName, (moduleFileCounts.get(fi.moduleName) ?? 0) + 1);
    if (!moduleMap.has(fi.moduleName)) {
      moduleMap.set(fi.moduleName, {
        name: fi.moduleName,
        path: fi.moduleName, // Will be enriched by caller if needed
        fileCount: 0,
        dependsOn: new Set(),
        dependedOnBy: new Set(),
      });
    }
  }

  // Set file counts
  for (const [name, count] of moduleFileCounts) {
    const node = moduleMap.get(name)!;
    node.fileCount = count;
  }

  // Build edges: aggregate file-level imports into module-level edges
  const edgeKey = (from: string, to: string) => `${from}::${to}`;
  const edgeMap = new Map<string, ModuleEdge>();

  for (const fi of fileImports) {
    for (const imp of fi.imports) {
      if (!imp.resolvedPath) continue;

      const targetModule = imp.targetModule;
      if (!targetModule) continue;

      // Skip intra-module imports
      if (fi.moduleName === targetModule) continue;

      // Ensure target module node exists
      if (!moduleMap.has(targetModule)) {
        moduleMap.set(targetModule, {
          name: targetModule,
          path: targetModule,
          fileCount: 0,
          dependsOn: new Set(),
          dependedOnBy: new Set(),
        });
      }

      // Update node relationships
      moduleMap.get(fi.moduleName)!.dependsOn.add(targetModule);
      moduleMap.get(targetModule)!.dependedOnBy.add(fi.moduleName);

      // Build/update edge
      const key = edgeKey(fi.moduleName, targetModule);
      if (!edgeMap.has(key)) {
        edgeMap.set(key, { from: fi.moduleName, to: targetModule, files: [] });
      }
      edgeMap.get(key)!.files.push({
        sourceFile: fi.filePath,
        targetFile: imp.resolvedPath,
        line: imp.line,
        specifier: imp.specifier,
      });
    }
  }

  return {
    modules: Array.from(moduleMap.values()),
    edges: Array.from(edgeMap.values()),
  };
}
