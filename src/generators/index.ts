import type { GoodbotConfig } from '../config/index.js';
import type { FullAnalysis, GitHistoryAnalysis, TemporalCoupling } from '../analyzers/index.js';
import { buildContext } from './context-builder.js';
import { renderTemplate } from './template-engine.js';
import type { GeneratedFile } from './types.js';

export type { AnalysisInsights } from './types.js';
export { buildContext } from './context-builder.js';
export { generateArchitectureMd } from './mermaid.js';

const FILE_MAP: Array<{
  configKey: keyof GoodbotConfig['agentFiles'];
  templateName: string;
  outputPath: string;
  displayName: string;
}> = [
  { configKey: 'codingGuidelines', templateName: 'CODING_GUIDELINES.md.hbs', outputPath: 'CODING_GUIDELINES.md', displayName: 'CODING_GUIDELINES.md' },
  { configKey: 'claudeMd', templateName: 'CLAUDE.md.hbs', outputPath: 'CLAUDE.md', displayName: 'CLAUDE.md' },
  { configKey: 'cursorrules', templateName: 'cursorrules.hbs', outputPath: '.cursorrules', displayName: '.cursorrules' },
  { configKey: 'windsurfrules', templateName: 'windsurfrules.hbs', outputPath: '.windsurfrules', displayName: '.windsurfrules' },
  { configKey: 'agentsMd', templateName: 'AGENTS.md.hbs', outputPath: 'AGENTS.md', displayName: 'AGENTS.md' },
  { configKey: 'cursorignore', templateName: 'cursorignore.hbs', outputPath: '.cursorignore', displayName: '.cursorignore' },
];

export { FILE_MAP };

export async function generateAll(
  config: GoodbotConfig,
  fullAnalysis?: FullAnalysis,
  gitHistory?: GitHistoryAnalysis,
  temporalCouplings?: TemporalCoupling[],
): Promise<GeneratedFile[]> {
  const context = buildContext(config, undefined, fullAnalysis, gitHistory, temporalCouplings);
  const files: GeneratedFile[] = [];

  for (const entry of FILE_MAP) {
    if (!config.agentFiles[entry.configKey]) continue;

    const content = await renderTemplate(entry.templateName, context);
    files.push({
      fileName: entry.displayName,
      relativePath: entry.outputPath,
      content,
    });
  }

  return files;
}
