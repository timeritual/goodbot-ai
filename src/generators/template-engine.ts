import Handlebars from 'handlebars';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { safeReadFile } from '../utils/index.js';
import { fileURLToPath } from 'node:url';
import type { GeneratorContext } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getTemplatesDir(): string {
  // In dev (tsx): src/generators -> src/templates
  // In prod (dist): dist/generators -> dist/templates
  return path.resolve(__dirname, '..', 'templates');
}

let engineReady = false;

async function ensureEngine(): Promise<void> {
  if (engineReady) return;

  // Register helpers
  Handlebars.registerHelper('ifEquals', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
    return a === b ? options.fn(this) : options.inverse(this);
  });

  Handlebars.registerHelper('ifIncludes', function (this: unknown, arr: unknown[], val: unknown, options: Handlebars.HelperOptions) {
    return Array.isArray(arr) && arr.includes(val) ? options.fn(this) : options.inverse(this);
  });

  Handlebars.registerHelper('bulletList', (items: string[]) => {
    if (!Array.isArray(items)) return '';
    return items.map((i) => `- ${i}`).join('\n');
  });

  Handlebars.registerHelper('add', (a: number, b: number) => a + b);

  // Register partials
  const partialsDir = path.join(getTemplatesDir(), 'partials');
  try {
    const files = await readdir(partialsDir);
    for (const file of files) {
      if (file.endsWith('.hbs')) {
        const partialName = file.replace('.hbs', '');
        const content = await safeReadFile(path.join(partialsDir, file));
        if (content) {
          Handlebars.registerPartial(partialName, content);
        }
      }
    }
  } catch {
    // No partials directory — that's fine
  }

  engineReady = true;
}

export async function renderTemplate(
  templateName: string,
  context: GeneratorContext,
): Promise<string> {
  await ensureEngine();
  const templatePath = path.join(getTemplatesDir(), templateName);
  const source = await safeReadFile(templatePath);
  if (!source) {
    throw new Error(`Template not found: ${templatePath}`);
  }
  const template = Handlebars.compile(source, { noEscape: true });
  return template(context).trim() + '\n';
}
