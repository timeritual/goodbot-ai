import { safeReadFile } from '../utils/index.js';
import type { FrameworkDetection } from './types.js';

export async function detectPythonFramework(
  manifestPath: string,
  manifestName: string,
): Promise<FrameworkDetection> {
  const content = await safeReadFile(manifestPath);
  if (!content) {
    return { framework: 'python', confidence: 'low', detectedFrom: manifestName };
  }

  const checks = [
    { pattern: /django/i, framework: 'django' as const },
    { pattern: /flask/i, framework: 'flask' as const },
    { pattern: /fastapi/i, framework: 'fastapi' as const },
  ];

  for (const { pattern, framework } of checks) {
    if (pattern.test(content)) {
      return { framework, confidence: 'high', detectedFrom: `${manifestName} → "${framework}"` };
    }
  }

  return { framework: 'python', confidence: 'medium', detectedFrom: manifestName };
}
