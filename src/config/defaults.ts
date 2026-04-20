import type { Framework } from '../scanners/index.js';

interface FrameworkDefaults {
  redFlags: string[];
  businessLogicIn: string[];
  businessLogicForbidden: string[];
  ignorePaths: string[];
}

const BASE_IGNORE = ['node_modules', 'dist', 'build', 'coverage', '*.lock'];

export const frameworkDefaults: Record<Framework, FrameworkDefaults> = {
  react: {
    redFlags: [
      'Direct fetch/axios calls in components',
      'Business logic in useEffect',
      'State management in UI components',
    ],
    businessLogicIn: ['services', 'hooks'],
    businessLogicForbidden: ['components', 'pages'],
    ignorePaths: [...BASE_IGNORE, '.env', '.env.*'],
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
    ignorePaths: [...BASE_IGNORE, 'ios/Pods', 'android/.gradle', '.env', '.env.*'],
  },
  next: {
    redFlags: [
      'Direct database calls in client components',
      'Secrets exposed in client-side code',
      'Heavy computation in server components without caching',
    ],
    businessLogicIn: ['services', 'lib'],
    businessLogicForbidden: ['components', 'app'],
    ignorePaths: [...BASE_IGNORE, '.next', '.vercel', '.env', '.env.*'],
  },
  node: {
    redFlags: [
      'Business logic in route handlers',
      'Direct database calls in controllers',
      'Missing error handling in async operations',
    ],
    businessLogicIn: ['services'],
    businessLogicForbidden: ['routes', 'controllers'],
    ignorePaths: [...BASE_IGNORE, '.env', '.env.*'],
  },
  express: {
    redFlags: [
      'Business logic in route handlers',
      'Direct database calls in middleware',
      'Missing input validation',
    ],
    businessLogicIn: ['services'],
    businessLogicForbidden: ['routes', 'middleware'],
    ignorePaths: [...BASE_IGNORE, '.env', '.env.*'],
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
    ignorePaths: [...BASE_IGNORE, '.angular', '.env', '.env.*'],
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
    ignorePaths: [...BASE_IGNORE, '.env', '.env.*'],
  },
  python: {
    redFlags: [
      'Business logic in views/routes',
      'Direct SQL in view functions',
      'Missing type hints',
    ],
    businessLogicIn: ['services'],
    businessLogicForbidden: ['views', 'routes'],
    ignorePaths: ['__pycache__', '*.pyc', '.venv', 'venv', '.env', 'dist', '*.egg-info'],
  },
  django: {
    redFlags: [
      'Business logic in views',
      'Complex querysets in templates',
      'Direct model manipulation in views',
    ],
    businessLogicIn: ['services'],
    businessLogicForbidden: ['views', 'templates', 'urls'],
    ignorePaths: ['__pycache__', '*.pyc', '.venv', 'venv', '.env', 'staticfiles', 'media'],
  },
  flask: {
    redFlags: [
      'Business logic in route handlers',
      'Direct database queries in routes',
      'Missing input validation',
    ],
    businessLogicIn: ['services'],
    businessLogicForbidden: ['routes', 'blueprints'],
    ignorePaths: ['__pycache__', '*.pyc', '.venv', 'venv', '.env', 'instance'],
  },
  fastapi: {
    redFlags: [
      'Business logic in endpoint functions',
      'Direct database access in routers',
      'Missing Pydantic models for request/response',
    ],
    businessLogicIn: ['services'],
    businessLogicForbidden: ['routers', 'endpoints'],
    ignorePaths: ['__pycache__', '*.pyc', '.venv', 'venv', '.env'],
  },
  go: {
    redFlags: [
      'Business logic in HTTP handlers',
      'Direct database calls in handlers',
      'Missing error wrapping',
    ],
    businessLogicIn: ['services', 'internal'],
    businessLogicForbidden: ['handlers', 'cmd'],
    ignorePaths: ['vendor', 'bin', '.env'],
  },
  other: {
    redFlags: [],
    businessLogicIn: ['services'],
    businessLogicForbidden: [],
    ignorePaths: BASE_IGNORE,
  },
};
