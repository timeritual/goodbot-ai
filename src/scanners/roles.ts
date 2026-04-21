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
    case 'vue':
      return 'ui';
    case 'next':
    case 'nuxt':
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
 * Angular-specific ordering — Angular has its own cross-cutting concepts
 * (pipes, directives, guards, interceptors) and NgModule composition.
 */
const ANGULAR_ROLES: LayerRole[] = [
  {
    id: 'types',
    displayName: 'Types/Models',
    description: 'Interfaces, models, enums, shared type definitions',
    level: 0,
    dirPatterns: ['types', 'typings', 'models', 'interfaces', 'enums', 'constants'],
  },
  {
    id: 'config',
    displayName: 'Config',
    description: 'Environment, tokens, feature flags',
    level: 1,
    dirPatterns: ['config', 'configuration', 'environments', 'tokens'],
  },
  {
    id: 'utils',
    displayName: 'Utilities',
    description: 'Pure helpers, validators, formatters',
    level: 2,
    dirPatterns: ['utils', 'helpers', 'lib', 'shared'],
  },
  {
    id: 'services',
    displayName: 'Services',
    description: 'HTTP clients, business logic, data access (Injectable)',
    level: 3,
    dirPatterns: ['services', 'api', 'data', 'repositories'],
    filePatterns: ['*.service.*'],
  },
  {
    id: 'state',
    displayName: 'State management',
    description: 'NgRx stores, signals, effects, selectors',
    level: 4,
    dirPatterns: ['store', 'stores', 'state', 'ngrx', 'signals'],
  },
  {
    id: 'pipes',
    displayName: 'Pipes',
    description: 'Template data transformation',
    level: 5,
    dirPatterns: ['pipes'],
    filePatterns: ['*.pipe.*'],
  },
  {
    id: 'directives',
    displayName: 'Directives',
    description: 'Reusable DOM behavior',
    level: 5,
    dirPatterns: ['directives'],
    filePatterns: ['*.directive.*'],
  },
  {
    id: 'interceptors',
    displayName: 'HTTP Interceptors',
    description: 'Cross-cutting HTTP concerns (auth headers, logging, retries)',
    level: 6,
    dirPatterns: ['interceptors'],
    filePatterns: ['*.interceptor.*'],
  },
  {
    id: 'guards',
    displayName: 'Route Guards',
    description: 'CanActivate, CanDeactivate, CanLoad — route access control',
    level: 6,
    dirPatterns: ['guards'],
    filePatterns: ['*.guard.*'],
  },
  {
    id: 'components',
    displayName: 'Components',
    description: 'Reusable UI building blocks',
    level: 7,
    dirPatterns: ['components', 'ui', 'widgets', 'elements'],
  },
  {
    id: 'modules',
    displayName: 'NgModules',
    description: 'Feature composition, declarations, imports, providers',
    level: 8,
    dirPatterns: ['modules', 'features'],
    filePatterns: ['*.module.*'],
  },
  {
    id: 'pages',
    displayName: 'Pages/Routes',
    description: 'Route-level containers, app shell',
    level: 9,
    dirPatterns: ['pages', 'views', 'routes', 'app'],
    isLeaf: true,
  },
];

/**
 * Vue-specific ordering — Vue uses composables, plugins, layouts, and pages.
 */
const VUE_ROLES: LayerRole[] = [
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
    dirPatterns: ['config', 'configuration', 'theme'],
  },
  {
    id: 'utils',
    displayName: 'Utilities',
    description: 'Pure helpers, formatters, validators',
    level: 2,
    dirPatterns: ['utils', 'helpers', 'lib'],
  },
  {
    id: 'api-client',
    displayName: 'API Clients',
    description: 'HTTP clients, data fetching',
    level: 3,
    dirPatterns: ['api', 'clients', 'network', 'queries'],
  },
  {
    id: 'services',
    displayName: 'Services',
    description: 'Business logic, data transformation',
    level: 4,
    dirPatterns: ['services', 'repositories', 'domain'],
    filePatterns: ['*.service.*'],
  },
  {
    id: 'state',
    displayName: 'State management',
    description: 'Pinia stores, Vuex stores, global state',
    level: 5,
    dirPatterns: ['stores', 'store', 'state', 'pinia', 'vuex'],
  },
  {
    id: 'composables',
    displayName: 'Composables',
    description: 'Reusable reactive state and logic (use* functions)',
    level: 6,
    dirPatterns: ['composables', 'hooks'],
  },
  {
    id: 'directives',
    displayName: 'Directives',
    description: 'Custom directives for DOM behavior',
    level: 6,
    dirPatterns: ['directives'],
  },
  {
    id: 'plugins',
    displayName: 'Plugins',
    description: 'App-level plugins (i18n, analytics, HTTP clients)',
    level: 6,
    dirPatterns: ['plugins'],
  },
  {
    id: 'components',
    displayName: 'Components',
    description: 'Reusable UI building blocks',
    level: 7,
    dirPatterns: ['components', 'ui', 'widgets'],
  },
  {
    id: 'layouts',
    displayName: 'Layouts',
    description: 'Page layouts and shell components',
    level: 8,
    dirPatterns: ['layouts'],
  },
  {
    id: 'pages',
    displayName: 'Pages/Views',
    description: 'Route-level views',
    level: 9,
    dirPatterns: ['pages', 'views', 'screens'],
    isLeaf: true,
  },
  {
    id: 'router',
    displayName: 'Router',
    description: 'Vue Router configuration',
    level: 10,
    dirPatterns: ['router', 'routes'],
    isLeaf: true,
  },
];

/**
 * Nuxt (full-stack Vue meta-framework) — has server/ for API routes alongside
 * Vue-style UI layers. Directories typically live at project root.
 */
const NUXT_ROLES: LayerRole[] = [
  { id: 'types', displayName: 'Types/Constants', description: 'Shared type definitions and constants', level: 0, dirPatterns: ['types', 'typings', 'constants'] },
  { id: 'config', displayName: 'Config', description: 'App config, runtime config', level: 1, dirPatterns: ['config'] },
  { id: 'utils', displayName: 'Utilities', description: 'Pure helpers auto-imported by Nuxt', level: 2, dirPatterns: ['utils', 'helpers'] },
  { id: 'server', displayName: 'Server', description: 'Server-only code — API routes, server middleware, server utils', level: 3, dirPatterns: ['server'] },
  { id: 'services', displayName: 'Services', description: 'Shared business logic (usable client and server)', level: 4, dirPatterns: ['services', 'repositories'] },
  { id: 'state', displayName: 'State management', description: 'Pinia stores, global state', level: 5, dirPatterns: ['stores', 'store'] },
  { id: 'composables', displayName: 'Composables', description: 'Auto-imported composables (useFetch wrappers, shared reactive logic)', level: 6, dirPatterns: ['composables'] },
  { id: 'plugins', displayName: 'Plugins', description: 'Nuxt plugins (client / server / both)', level: 6, dirPatterns: ['plugins'] },
  { id: 'middleware', displayName: 'Route Middleware', description: 'Route guards and navigation middleware', level: 7, dirPatterns: ['middleware'] },
  { id: 'components', displayName: 'Components', description: 'Auto-imported UI components', level: 8, dirPatterns: ['components', 'ui'] },
  { id: 'layouts', displayName: 'Layouts', description: 'Shared page shells', level: 9, dirPatterns: ['layouts'] },
  { id: 'pages', displayName: 'Pages', description: 'File-based routes', level: 10, dirPatterns: ['pages'], isLeaf: true },
  { id: 'app', displayName: 'App Shell', description: 'app.vue, error.vue — top-level entry', level: 11, dirPatterns: ['app'], isLeaf: true },
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

/**
 * Frameworks with their own canonical role set — these override the generic
 * system-type ordering because they have framework-specific conventions
 * (Angular's NgModules/pipes/directives, Vue's composables/plugins/layouts).
 */
const ROLES_BY_FRAMEWORK: Partial<Record<Framework, LayerRole[]>> = {
  angular: ANGULAR_ROLES,
  vue: VUE_ROLES,
  nuxt: NUXT_ROLES,
};

export function getRolesForSystemType(
  systemType: SystemType,
  framework?: Framework,
): LayerRole[] {
  if (framework && ROLES_BY_FRAMEWORK[framework]) {
    return ROLES_BY_FRAMEWORK[framework]!;
  }
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
  framework?: Framework,
): LayerRole | null {
  const roles = getRolesForSystemType(systemType, framework);
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
