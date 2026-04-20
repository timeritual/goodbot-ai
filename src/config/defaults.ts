import type { Framework } from '../scanners/index.js';

export interface LayerDescription {
  should: string;
  shouldNot: string;
}

interface FrameworkDefaults {
  redFlags: string[];
  businessLogicIn: string[];
  businessLogicForbidden: string[];
  layerDescriptions: Record<string, LayerDescription>;
  ignorePaths: string[];
  srpExample: string;
  dipExample: string;
  ocpExample: string;
}

const BASE_IGNORE = ['node_modules', 'dist', 'build', 'coverage', '*.lock'];

// ─── Reusable layer descriptions ─────────────────────────

const SERVICES_DESC: LayerDescription = {
  should: 'Business rules, data transformation, orchestration',
  shouldNot: 'HTTP/request handling, response formatting',
};

const CONTROLLER_DESC: LayerDescription = {
  should: 'Request/response handling, delegation to services',
  shouldNot: 'Direct database access, business rules',
};

const COMPONENT_DESC: LayerDescription = {
  should: 'UI rendering, user interaction',
  shouldNot: 'Direct API calls, data transformation',
};

// ─── Framework defaults ──────────────────────────────────

export const frameworkDefaults: Record<Framework, FrameworkDefaults> = {
  react: {
    redFlags: [
      'Direct fetch/axios calls in components',
      'Business logic in useEffect',
      'State management in UI components',
    ],
    businessLogicIn: ['services', 'hooks'],
    businessLogicForbidden: ['components', 'pages'],
    layerDescriptions: {
      services: SERVICES_DESC,
      hooks: { should: 'Data fetching, state logic, side effects', shouldNot: 'UI rendering, direct DOM manipulation' },
      components: COMPONENT_DESC,
      pages: COMPONENT_DESC,
    },
    ignorePaths: [...BASE_IGNORE, '.env', '.env.*'],
    srpExample: 'A function that fetches data should not also format it for display.',
    dipExample: 'High-level modules (pages, components) should not know about low-level implementation details (API clients, storage).',
    ocpExample: 'Use callback patterns, strategy functions, and configuration objects instead of modifying existing code.',
  },
  'react-native': {
    redFlags: [
      'Direct fetch/axios calls in screens or components',
      'AsyncStorage for business data in components',
      'Complex error classification outside services',
      'Data mapping in hooks',
    ],
    businessLogicIn: ['services'],
    businessLogicForbidden: ['hooks', 'screens', 'components'],
    layerDescriptions: {
      services: SERVICES_DESC,
      hooks: { should: 'State wiring, side effects', shouldNot: 'Business logic, direct API calls' },
      screens: { should: 'Screen layout, navigation, user interaction', shouldNot: 'Direct API calls, data transformation' },
      components: COMPONENT_DESC,
    },
    ignorePaths: [...BASE_IGNORE, 'ios/Pods', 'android/.gradle', '.env', '.env.*'],
    srpExample: 'A function that fetches data should not also format it for display.',
    dipExample: 'High-level modules (screens, components) should not know about low-level implementation details (API clients, storage).',
    ocpExample: 'Use callback patterns, strategy functions, and configuration objects instead of modifying existing code.',
  },
  next: {
    redFlags: [
      'Direct database calls in client components',
      'Secrets exposed in client-side code',
      'Heavy computation in server components without caching',
    ],
    businessLogicIn: ['services', 'lib'],
    businessLogicForbidden: ['components', 'app'],
    layerDescriptions: {
      services: SERVICES_DESC,
      lib: { should: 'Shared utilities, data access, business rules', shouldNot: 'UI rendering, React hooks' },
      components: COMPONENT_DESC,
      app: { should: 'Page routing, layouts, data fetching via server components', shouldNot: 'Direct database queries, complex business rules' },
    },
    ignorePaths: [...BASE_IGNORE, '.next', '.vercel', '.env', '.env.*'],
    srpExample: 'A server component that fetches data should not also contain client-side interactivity.',
    dipExample: 'Page components should not know about low-level implementation details (database drivers, ORM queries).',
    ocpExample: 'Use middleware, configuration objects, and composition instead of modifying existing code.',
  },
  node: {
    redFlags: [
      'Business logic in route handlers',
      'Direct database calls in controllers',
      'Missing error handling in async operations',
    ],
    businessLogicIn: ['services'],
    businessLogicForbidden: ['routes', 'controllers'],
    layerDescriptions: {
      services: SERVICES_DESC,
      routes: CONTROLLER_DESC,
      controllers: CONTROLLER_DESC,
    },
    ignorePaths: [...BASE_IGNORE, '.env', '.env.*'],
    srpExample: 'A function that queries data should not also transform or serialize it for the response.',
    dipExample: 'High-level modules (routes, controllers) should not know about low-level implementation details (database drivers, ORMs).',
    ocpExample: 'Use middleware, strategy patterns, and configuration objects instead of modifying existing code.',
  },
  express: {
    redFlags: [
      'Business logic in route handlers',
      'Direct database calls in middleware',
      'Missing input validation',
    ],
    businessLogicIn: ['services'],
    businessLogicForbidden: ['routes', 'middleware'],
    layerDescriptions: {
      services: SERVICES_DESC,
      routes: CONTROLLER_DESC,
      middleware: { should: 'Request preprocessing (auth, logging, CORS)', shouldNot: 'Business logic, database access' },
    },
    ignorePaths: [...BASE_IGNORE, '.env', '.env.*'],
    srpExample: 'A function that queries data should not also transform or serialize it for the response.',
    dipExample: 'Route handlers should not know about low-level implementation details (database drivers, ORMs).',
    ocpExample: 'Use middleware, strategy patterns, and configuration objects instead of modifying existing code.',
  },
  angular: {
    redFlags: [
      'Business logic in components — move to services',
      'Direct HTTP calls in components — use services with HttpClient',
      'State management without services or NgRx',
      'Missing dependency injection — use constructor injection',
      'DOM manipulation outside directives',
    ],
    businessLogicIn: ['services'],
    businessLogicForbidden: ['components', 'pipes', 'directives'],
    layerDescriptions: {
      services: SERVICES_DESC,
      components: COMPONENT_DESC,
      pipes: { should: 'Data formatting and transformation for templates', shouldNot: 'Business logic, API calls' },
      directives: { should: 'DOM behavior and manipulation', shouldNot: 'Business logic, API calls' },
    },
    ignorePaths: [...BASE_IGNORE, '.angular', '.env', '.env.*'],
    srpExample: 'A component that renders UI should not also fetch and transform data.',
    dipExample: 'Components should depend on injected services, not concrete implementations.',
    ocpExample: 'Use dependency injection and configuration objects instead of modifying existing code.',
  },
  nest: {
    redFlags: [
      'Business logic in controllers — controllers should only handle HTTP and delegate to services',
      'Direct repository/ORM access in controllers — always go through services',
      'Missing DTOs for request validation — use class-validator DTOs',
      'Injecting services across module boundaries without exporting — use module exports',
    ],
    businessLogicIn: ['services'],
    businessLogicForbidden: ['controllers', 'guards', 'interceptors'],
    layerDescriptions: {
      services: SERVICES_DESC,
      controllers: CONTROLLER_DESC,
      guards: { should: 'Authorization, access control, role checks', shouldNot: 'Business logic, database access' },
      interceptors: { should: 'Cross-cutting concerns (logging, caching, response transforms)', shouldNot: 'Business logic, database access' },
    },
    ignorePaths: [...BASE_IGNORE, '.env', '.env.*'],
    srpExample: 'A function that queries data should not also transform or serialize it for the response.',
    dipExample: 'Controllers should not know about low-level implementation details (database drivers, ORMs). Use dependency injection.',
    ocpExample: 'Use interceptors, guards, strategy patterns, and configuration objects instead of modifying existing code.',
  },
  python: {
    redFlags: [
      'Business logic in views/routes',
      'Direct SQL in view functions',
      'Missing type hints',
    ],
    businessLogicIn: ['services'],
    businessLogicForbidden: ['views', 'routes'],
    layerDescriptions: {
      services: SERVICES_DESC,
      views: CONTROLLER_DESC,
      routes: CONTROLLER_DESC,
    },
    ignorePaths: ['__pycache__', '*.pyc', '.venv', 'venv', '.env', 'dist', '*.egg-info'],
    srpExample: 'A function that queries data should not also format it for the response.',
    dipExample: 'View functions should not know about low-level implementation details (raw SQL, ORM internals).',
    ocpExample: 'Use decorators, middleware, and configuration objects instead of modifying existing code.',
  },
  django: {
    redFlags: [
      'Business logic in views',
      'Complex querysets in templates',
      'Direct model manipulation in views',
    ],
    businessLogicIn: ['services'],
    businessLogicForbidden: ['views', 'templates', 'urls'],
    layerDescriptions: {
      services: SERVICES_DESC,
      views: CONTROLLER_DESC,
      templates: { should: 'Presentation and layout', shouldNot: 'Business logic, complex querysets' },
      urls: { should: 'URL routing configuration', shouldNot: 'Business logic, data access' },
    },
    ignorePaths: ['__pycache__', '*.pyc', '.venv', 'venv', '.env', 'staticfiles', 'media'],
    srpExample: 'A view that handles a request should not also contain complex queryset logic.',
    dipExample: 'Views should depend on service abstractions, not concrete model methods.',
    ocpExample: 'Use mixins, decorators, and configuration objects instead of modifying existing code.',
  },
  flask: {
    redFlags: [
      'Business logic in route handlers',
      'Direct database queries in routes',
      'Missing input validation',
    ],
    businessLogicIn: ['services'],
    businessLogicForbidden: ['routes', 'blueprints'],
    layerDescriptions: {
      services: SERVICES_DESC,
      routes: CONTROLLER_DESC,
      blueprints: { should: 'Route grouping and registration', shouldNot: 'Business logic, database access' },
    },
    ignorePaths: ['__pycache__', '*.pyc', '.venv', 'venv', '.env', 'instance'],
    srpExample: 'A function that queries data should not also format it for the response.',
    dipExample: 'Route handlers should not know about low-level implementation details (raw SQL, ORM internals).',
    ocpExample: 'Use decorators, middleware, and configuration objects instead of modifying existing code.',
  },
  fastapi: {
    redFlags: [
      'Business logic in endpoint functions',
      'Direct database access in routers',
      'Missing Pydantic models for request/response',
    ],
    businessLogicIn: ['services'],
    businessLogicForbidden: ['routers', 'endpoints'],
    layerDescriptions: {
      services: SERVICES_DESC,
      routers: CONTROLLER_DESC,
      endpoints: CONTROLLER_DESC,
    },
    ignorePaths: ['__pycache__', '*.pyc', '.venv', 'venv', '.env'],
    srpExample: 'A function that queries data should not also serialize it for the response.',
    dipExample: 'Endpoint functions should depend on injected services, not concrete implementations.',
    ocpExample: 'Use dependency injection, middleware, and configuration objects instead of modifying existing code.',
  },
  go: {
    redFlags: [
      'Business logic in HTTP handlers',
      'Direct database calls in handlers',
      'Missing error wrapping',
    ],
    businessLogicIn: ['services', 'internal'],
    businessLogicForbidden: ['handlers', 'cmd'],
    layerDescriptions: {
      services: SERVICES_DESC,
      internal: { should: 'Internal packages, business rules', shouldNot: 'HTTP handling, CLI logic' },
      handlers: CONTROLLER_DESC,
      cmd: { should: 'CLI entry points, configuration wiring', shouldNot: 'Business logic, data access' },
    },
    ignorePaths: ['vendor', 'bin', '.env'],
    srpExample: 'A function that queries data should not also serialize it for the response.',
    dipExample: 'Handlers should depend on interfaces, not concrete service implementations.',
    ocpExample: 'Use interfaces, middleware, and configuration objects instead of modifying existing code.',
  },
  other: {
    redFlags: [],
    businessLogicIn: ['services'],
    businessLogicForbidden: [],
    layerDescriptions: {
      services: SERVICES_DESC,
    },
    ignorePaths: BASE_IGNORE,
    srpExample: 'A function that fetches data should not also format it for output.',
    dipExample: 'High-level modules should not know about low-level implementation details.',
    ocpExample: 'Use composition, strategy patterns, and configuration objects instead of modifying existing code.',
  },
};
