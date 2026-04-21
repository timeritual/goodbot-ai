import type { Framework } from './types.js';

export type SystemType = 'api' | 'ui' | 'mixed' | 'library';

export interface LayerRole {
  id: string;
  displayName: string;
  description: string;
  level: number;
  dirPatterns: string[];
  filePatterns?: string[];
  isLeaf?: boolean;
}

// ─── System type detection ───────────────────────────────

export function detectSystemType(framework: Framework): SystemType {
  switch (framework) {
    case 'nest':
    case 'express':
    case 'node':
    case 'fastapi':
    case 'flask':
    case 'django':
    case 'python':
    case 'go':
      return 'api';
    case 'react':
    case 'react-native':
    case 'angular':
      return 'ui';
    case 'next':
      return 'mixed';
    case 'other':
    default:
      return 'library';
  }
}

// ─── Canonical layer roles per system type ───────────────

/**
 * Server-side API stability ordering (from most stable to least stable).
 * Higher numbers depend on lower — never the reverse.
 */
const API_ROLES: LayerRole[] = [
  {
    id: 'domain',
    displayName: 'Domain/Entities',
    description: 'Core models, invariants, value objects',
    level: 0,
    dirPatterns: ['domain', 'entities', 'models', 'aggregates'],
    filePatterns: ['*.entity.*', '*.model.*'],
  },
  {
    id: 'types',
    displayName: 'Types/Constants',
    description: 'Shared type definitions and constants',
    level: 0,
    dirPatterns: ['types', 'typings', 'constants', 'enums'],
  },
  {
    id: 'config',
    displayName: 'Config/Bootstrap',
    description: 'Env, secrets, feature flags, bootstrap wiring',
    level: 1,
    dirPatterns: ['config', 'configuration', 'bootstrap', 'env', 'settings'],
  },
  {
    id: 'utils',
    displayName: 'Utilities',
    description: 'Pure helpers with no framework or domain coupling',
    level: 1,
    dirPatterns: ['utils', 'helpers', 'lib', 'shared'],
  },
  {
    id: 'repositories',
    displayName: 'Repositories/Data access',
    description: 'Persistence abstraction, query isolation',
    level: 2,
    dirPatterns: ['repositories', 'repos', 'persistence', 'dao'],
    filePatterns: ['*.repository.*', '*.repo.*'],
  },
  {
    id: 'infrastructure',
    displayName: 'Infrastructure/Integrations',
    description: 'Queues, cache, email, third-party APIs, external clients',
    level: 3,
    dirPatterns: ['infrastructure', 'infra', 'integrations', 'external', 'clients', 'adapters', 'gateways'],
  },
  {
    id: 'services',
    displayName: 'Services/Application logic',
    description: 'Orchestration, business rules, use cases',
    level: 4,
    dirPatterns: ['services', 'usecases', 'use-cases', 'application', 'business', 'domain-services'],
    filePatterns: ['*.service.*'],
  },
  {
    id: 'modules',
    displayName: 'Modules/Composition',
    description: 'Feature boundaries, DI wiring, exports',
    level: 5,
    dirPatterns: ['modules', 'features'],
    filePatterns: ['*.module.*'],
  },
  {
    id: 'cross-cutting',
    displayName: 'Cross-cutting',
    description: 'Guards, pipes, interceptors, middleware, auth, validation, logging, error filters',
    level: 6,
    dirPatterns: ['guards', 'interceptors', 'pipes', 'middleware', 'filters', 'decorators', 'common'],
    filePatterns: ['*.guard.*', '*.interceptor.*', '*.pipe.*', '*.middleware.*', '*.filter.*'],
  },
  {
    id: 'controllers',
    displayName: 'Controllers/Transport',
    description: 'HTTP routes, DTOs, GraphQL, WebSockets — the edge of the system',
    level: 7,
    dirPatterns: ['controllers', 'routes', 'api', 'transport', 'handlers', 'endpoints', 'routers', 'resolvers'],
    filePatterns: ['*.controller.*', '*.route.*', '*.handler.*', '*.resolver.*'],
    isLeaf: true,
  },
];

/**
 * UI / frontend stability ordering.
 */
const UI_ROLES: LayerRole[] = [
  {
    id: 'types',
    displayName: 'Types/Constants',
    description: 'Shared type definitions and constants',
    level: 0,
    dirPatterns: ['types', 'typings', 'constants', 'enums'],
  },
  {
    id: 'config',
    displayName: 'Config',
    description: 'App configuration, environment, theme',
    level: 1,
    dirPatterns: ['config', 'configuration', 'theme', 'settings'],
  },
  {
    id: 'utils',
    displayName: 'Utilities',
    description: 'Pure helpers, formatters, validators',
    level: 2,
    dirPatterns: ['utils', 'helpers', 'lib', 'formatters'],
  },
  {
    id: 'api-client',
    displayName: 'API Clients',
    description: 'HTTP clients, data fetching primitives',
    level: 3,
    dirPatterns: ['api', 'clients', 'network', 'queries', 'mutations'],
  },
  {
    id: 'services',
    displayName: 'Services',
    description: 'Business logic, data transformation, orchestration',
    level: 4,
    dirPatterns: ['services', 'repositories', 'domain'],
    filePatterns: ['*.service.*'],
  },
  {
    id: 'state',
    displayName: 'State management',
    description: 'Stores, reducers, contexts, global state',
    level: 5,
    dirPatterns: ['stores', 'store', 'state', 'redux', 'slices', 'contexts', 'providers'],
  },
  {
    id: 'hooks',
    displayName: 'Hooks/Composables',
    description: 'Reusable state and side-effect logic',
    level: 6,
    dirPatterns: ['hooks', 'composables'],
  },
  {
    id: 'components',
    displayName: 'Components',
    description: 'Reusable UI building blocks',
    level: 7,
    dirPatterns: ['components', 'ui', 'widgets', 'elements'],
  },
  {
    id: 'screens',
    displayName: 'Screens/Pages',
    description: 'Route-level views',
    level: 8,
    dirPatterns: ['screens', 'pages', 'views'],
    isLeaf: true,
  },
  {
    id: 'navigation',
    displayName: 'Navigation/Routes',
    description: 'App routing and navigation structure',
    level: 9,
    dirPatterns: ['navigation', 'routes', 'router', 'app'],
    isLeaf: true,
  },
];

/**
 * Mixed (full-stack, e.g. Next.js) combines UI and API ordering.
 * Server-side concerns stack below UI concerns in the same app.
 */
const MIXED_ROLES: LayerRole[] = [
  { ...API_ROLES.find(r => r.id === 'types')!, level: 0 },
  { ...API_ROLES.find(r => r.id === 'config')!, level: 1 },
  { ...UI_ROLES.find(r => r.id === 'utils')!, level: 2 },
  { ...API_ROLES.find(r => r.id === 'domain')!, level: 3 },
  { ...API_ROLES.find(r => r.id === 'repositories')!, level: 4 },
  { ...API_ROLES.find(r => r.id === 'infrastructure')!, level: 5 },
  { ...API_ROLES.find(r => r.id === 'services')!, level: 6 },
  { ...UI_ROLES.find(r => r.id === 'api-client')!, level: 7 },
  { ...UI_ROLES.find(r => r.id === 'state')!, level: 8 },
  { ...UI_ROLES.find(r => r.id === 'hooks')!, level: 9 },
  { ...UI_ROLES.find(r => r.id === 'components')!, level: 10 },
  {
    id: 'app-routes',
    displayName: 'App Routes / Pages',
    description: 'Next.js app directory — page routes, layouts, server components',
    level: 11,
    dirPatterns: ['app', 'pages', 'routes'],
    isLeaf: true,
  },
];

/**
 * Minimal role set for libraries (no framework).
 */
const LIBRARY_ROLES: LayerRole[] = [
  {
    id: 'types',
    displayName: 'Types/Constants',
    description: 'Public type definitions and constants',
    level: 0,
    dirPatterns: ['types', 'constants', 'enums'],
  },
  {
    id: 'utils',
    displayName: 'Utilities',
    description: 'Pure helpers with no external coupling',
    level: 1,
    dirPatterns: ['utils', 'helpers', 'lib', 'internal'],
  },
  {
    id: 'core',
    displayName: 'Core',
    description: 'Main implementation logic',
    level: 2,
    dirPatterns: ['core', 'src', 'implementation'],
  },
  {
    id: 'api',
    displayName: 'Public API',
    description: 'Entry points consumers import from',
    level: 3,
    dirPatterns: ['api', 'public'],
    isLeaf: true,
  },
];

const ROLES_BY_SYSTEM: Record<SystemType, LayerRole[]> = {
  api: API_ROLES,
  ui: UI_ROLES,
  mixed: MIXED_ROLES,
  library: LIBRARY_ROLES,
};

export function getRolesForSystemType(systemType: SystemType): LayerRole[] {
  return ROLES_BY_SYSTEM[systemType];
}

// ─── Role matching ────────────────────────────────────────

/**
 * Match a directory name (and optionally its file contents) to a canonical role.
 * Returns null if no role matches — caller should fall back to a generic "feature" role.
 */
export function matchRole(
  dirName: string,
  fileNames: string[],
  systemType: SystemType,
): LayerRole | null {
  const roles = getRolesForSystemType(systemType);
  const lowerDir = dirName.toLowerCase();

  // First pass: exact directory name match
  for (const role of roles) {
    if (role.dirPatterns.includes(lowerDir)) {
      return role;
    }
  }

  // Second pass: file pattern match (e.g. dir contains *.controller.ts files)
  for (const role of roles) {
    if (!role.filePatterns) continue;
    for (const pattern of role.filePatterns) {
      const regex = globToRegex(pattern);
      if (fileNames.some(f => regex.test(f))) {
        return role;
      }
    }
  }

  return null;
}

/**
 * Fallback role for unrecognized directories — treats them as feature modules
 * sitting in the middle of the stack.
 */
export function genericFeatureRole(systemType: SystemType): LayerRole {
  // Pick a mid-stack level appropriate to the system type
  const midLevel = systemType === 'ui' ? 5 : systemType === 'mixed' ? 6 : 4;
  return {
    id: 'feature',
    displayName: 'Feature',
    description: 'Domain-specific feature module',
    level: midLevel,
    dirPatterns: [],
  };
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}
