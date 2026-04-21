import { z } from 'zod';

const LayerRoleSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  description: z.string(),
  isLeaf: z.boolean().optional(),
});

const ArchitectureLayerSchema = z.object({
  name: z.string(),
  path: z.string(),
  level: z.number().int().min(0),
  hasBarrel: z.boolean().default(true),
  description: z.string().optional(),
  role: LayerRoleSchema.optional(),
});

export const GoodbotConfigSchema = z.object({
  version: z.literal(1),
  project: z.object({
    name: z.string(),
    framework: z.enum([
      'react', 'react-native', 'next', 'angular', 'node', 'express', 'nest',
      'python', 'django', 'flask', 'fastapi', 'go', 'other',
    ]),
    language: z.enum(['typescript', 'javascript', 'python', 'go', 'other']),
    description: z.string().optional(),
  }),
  architecture: z.object({
    layers: z.array(ArchitectureLayerSchema).default([]),
    dependencyDirection: z.enum(['downward', 'none']).default('downward'),
    barrelImportRule: z.enum(['always', 'recommended', 'none']).default('recommended'),
    interfaceContracts: z.boolean().default(false),
    systemType: z.enum(['api', 'ui', 'mixed', 'library']).default('library'),
  }).default({}),
  businessLogic: z.object({
    allowedIn: z.array(z.string()).default([]),
    forbiddenIn: z.array(z.string()).default([]),
    redFlags: z.array(z.string()).default([]),
  }).default({}),
  verification: z.object({
    typecheck: z.string().nullable().default(null),
    lint: z.string().nullable().default(null),
    test: z.string().nullable().default(null),
    format: z.string().nullable().default(null),
    build: z.string().nullable().default(null),
  }).default({}),
  agentFiles: z.object({
    claudeMd: z.boolean().default(true),
    cursorrules: z.boolean().default(true),
    windsurfrules: z.boolean().default(true),
    agentsMd: z.boolean().default(true),
    cursorignore: z.boolean().default(true),
    codingGuidelines: z.boolean().default(true),
    existingFileStrategy: z.enum(['merge', 'overwrite', 'skip']).default('merge'),
  }).default({}),
  conventions: z.object({
    mainBranch: z.string().default('main'),
    importStyle: z.enum(['barrel', 'direct', 'mixed']).default('direct'),
    customRules: z.array(z.string()).default([]),
  }).default({}),
  analysis: z.object({
    solid: z.boolean().default(true),
    thresholds: z.object({
      maxFileLines: z.number().default(300),
      maxBarrelExports: z.number().default(15),
      maxModuleCoupling: z.number().default(8),
    }).default({}),
    budget: z.object({
      circular: z.number().int().min(0).optional(),
      layer: z.number().int().min(0).optional(),
      barrel: z.number().int().min(0).optional(),
      srp: z.number().int().min(0).optional(),
      complexity: z.number().int().min(0).optional(),
      duplication: z.number().int().min(0).optional(),
      deadExports: z.number().int().min(0).optional(),
      custom: z.number().int().min(0).optional(),
    }).default({}),
  }).default({}),
  customRulesConfig: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    pattern: z.string(),
    forbiddenIn: z.array(z.string()).optional(),
    requiredIn: z.array(z.string()).optional(),
    maxImports: z.number().optional(),
    severity: z.enum(['info', 'warning', 'error']).optional(),
  })).default([]),
  team: z.object({
    syncUrl: z.string().optional(),
    name: z.string().optional(),
  }).default({}),
  ignore: z.object({
    paths: z.array(z.string()).default([
      'node_modules', 'dist', 'build', '.next', 'coverage', '*.lock',
    ]),
    sensitiveFiles: z.array(z.string()).default([
      '.env', '.env.*', 'credentials.json', '*.pem', '*.key',
    ]),
  }).default({}),
});

export type GoodbotConfig = z.infer<typeof GoodbotConfigSchema>;
export type ArchitectureLayer = z.infer<typeof ArchitectureLayerSchema>;
