import { describe, it, expect } from 'vitest';
import {
  detectSystemType,
  matchRole,
  getRolesForSystemType,
  genericFeatureRole,
  type SystemType,
} from './roles.js';
import type { Framework } from './types.js';

// ─── detectSystemType ────────────────────────────────────

describe('detectSystemType', () => {
  const cases: Array<{ framework: Framework; expected: SystemType }> = [
    { framework: 'nest', expected: 'api' },
    { framework: 'express', expected: 'api' },
    { framework: 'node', expected: 'api' },
    { framework: 'fastapi', expected: 'api' },
    { framework: 'flask', expected: 'api' },
    { framework: 'django', expected: 'api' },
    { framework: 'python', expected: 'api' },
    { framework: 'go', expected: 'api' },
    { framework: 'react', expected: 'ui' },
    { framework: 'react-native', expected: 'ui' },
    { framework: 'angular', expected: 'ui' },
    { framework: 'vue', expected: 'ui' },
    { framework: 'next', expected: 'mixed' },
    { framework: 'nuxt', expected: 'mixed' },
    { framework: 'other', expected: 'library' },
  ];

  for (const { framework, expected } of cases) {
    it(`classifies ${framework} as ${expected}`, () => {
      expect(detectSystemType(framework)).toBe(expected);
    });
  }
});

// ─── matchRole — directory name matching ─────────────────

describe('matchRole — API system', () => {
  it('matches "controllers" directory to controllers role', () => {
    const role = matchRole('controllers', [], 'api');
    expect(role?.id).toBe('controllers');
    expect(role?.displayName).toBe('Controllers/Transport');
    expect(role?.isLeaf).toBe(true);
  });

  it('matches "entities" directory to domain role', () => {
    const role = matchRole('entities', [], 'api');
    expect(role?.id).toBe('domain');
    expect(role?.level).toBe(0);
  });

  it('matches "repositories" to repositories role', () => {
    const role = matchRole('repositories', [], 'api');
    expect(role?.id).toBe('repositories');
    expect(role?.level).toBe(2);
  });

  it('matches cross-cutting directory names', () => {
    expect(matchRole('guards', [], 'api')?.id).toBe('cross-cutting');
    expect(matchRole('interceptors', [], 'api')?.id).toBe('cross-cutting');
    expect(matchRole('pipes', [], 'api')?.id).toBe('cross-cutting');
    expect(matchRole('middleware', [], 'api')?.id).toBe('cross-cutting');
  });

  it('matches is case-insensitive', () => {
    expect(matchRole('Controllers', [], 'api')?.id).toBe('controllers');
    expect(matchRole('SERVICES', [], 'api')?.id).toBe('services');
  });

  it('returns null for unknown directory', () => {
    expect(matchRole('random-feature', [], 'api')).toBeNull();
  });
});

describe('matchRole — UI system', () => {
  it('matches UI-specific directories', () => {
    expect(matchRole('components', [], 'ui')?.id).toBe('components');
    expect(matchRole('screens', [], 'ui')?.id).toBe('screens');
    expect(matchRole('hooks', [], 'ui')?.id).toBe('hooks');
    expect(matchRole('stores', [], 'ui')?.id).toBe('state');
    expect(matchRole('navigation', [], 'ui')?.id).toBe('navigation');
  });

  it('does not match API-specific directories as UI roles', () => {
    // "controllers" is not a standard UI role
    expect(matchRole('controllers', [], 'ui')).toBeNull();
    // "entities" is not a standard UI role
    expect(matchRole('entities', [], 'ui')).toBeNull();
  });
});

// ─── matchRole — file pattern matching ───────────────────

describe('matchRole — file patterns', () => {
  it('matches *.entity.ts to domain role', () => {
    const role = matchRole('users', ['user.entity.ts', 'index.ts'], 'api');
    expect(role?.id).toBe('domain');
  });

  it('matches *.controller.ts to controllers role', () => {
    const role = matchRole('users', ['user.controller.ts'], 'api');
    expect(role?.id).toBe('controllers');
  });

  it('matches *.repository.ts to repositories role', () => {
    const role = matchRole('users', ['user.repository.ts'], 'api');
    expect(role?.id).toBe('repositories');
  });

  it('matches *.module.ts to modules role', () => {
    const role = matchRole('users', ['user.module.ts'], 'api');
    expect(role?.id).toBe('modules');
  });

  it('matches *.guard.ts to cross-cutting role', () => {
    const role = matchRole('auth', ['role.guard.ts'], 'api');
    expect(role?.id).toBe('cross-cutting');
  });

  it('prioritizes directory name match over file patterns', () => {
    // Dir named "services" with a .controller.ts file should still be services
    const role = matchRole('services', ['foo.controller.ts'], 'api');
    expect(role?.id).toBe('services');
  });
});

// ─── matchRole — framework-specific overrides ────────────

describe('matchRole — framework overrides', () => {
  it('uses Angular roles when framework=angular', () => {
    // "pipes" maps to Angular pipes (data transforms), not API cross-cutting
    const role = matchRole('pipes', [], 'ui', 'angular');
    expect(role?.id).toBe('pipes');
    expect(role?.displayName).toBe('Pipes');
  });

  it('maps Angular guards to route guards role (not NestJS authorization)', () => {
    const role = matchRole('guards', [], 'ui', 'angular');
    expect(role?.id).toBe('guards');
    expect(role?.displayName).toBe('Route Guards');
  });

  it('maps Angular modules to NgModules role', () => {
    const role = matchRole('modules', [], 'ui', 'angular');
    expect(role?.id).toBe('modules');
    expect(role?.displayName).toBe('NgModules');
  });

  it('uses Vue roles when framework=vue', () => {
    const role = matchRole('composables', [], 'ui', 'vue');
    expect(role?.id).toBe('composables');

    const layouts = matchRole('layouts', [], 'ui', 'vue');
    expect(layouts?.id).toBe('layouts');
  });

  it('uses Nuxt roles when framework=nuxt', () => {
    const server = matchRole('server', [], 'mixed', 'nuxt');
    expect(server?.id).toBe('server');

    const middleware = matchRole('middleware', [], 'mixed', 'nuxt');
    expect(middleware?.id).toBe('middleware');
    expect(middleware?.displayName).toBe('Route Middleware');
  });

  it('falls back to generic system-type roles when framework has no override', () => {
    // react has no framework-specific role set; should use UI_ROLES
    const role = matchRole('components', [], 'ui', 'react');
    expect(role?.id).toBe('components');
  });
});

// ─── getRolesForSystemType ───────────────────────────────

describe('getRolesForSystemType', () => {
  it('returns API roles by default for api system type', () => {
    const roles = getRolesForSystemType('api');
    const ids = roles.map(r => r.id);
    expect(ids).toContain('domain');
    expect(ids).toContain('controllers');
    expect(ids).toContain('cross-cutting');
  });

  it('returns UI roles for ui system type', () => {
    const roles = getRolesForSystemType('ui');
    const ids = roles.map(r => r.id);
    expect(ids).toContain('components');
    expect(ids).toContain('screens');
    expect(ids).toContain('hooks');
  });

  it('returns framework-specific roles when framework provided', () => {
    const angularRoles = getRolesForSystemType('ui', 'angular');
    const ids = angularRoles.map(r => r.id);
    expect(ids).toContain('pipes');
    expect(ids).toContain('interceptors');
    expect(ids).toContain('modules'); // NgModules
  });

  it('returns Nuxt roles when framework=nuxt', () => {
    const nuxtRoles = getRolesForSystemType('mixed', 'nuxt');
    const ids = nuxtRoles.map(r => r.id);
    expect(ids).toContain('server');
    expect(ids).toContain('composables');
    expect(ids).toContain('middleware');
  });

  it('returns library roles for library system type', () => {
    const roles = getRolesForSystemType('library');
    const ids = roles.map(r => r.id);
    expect(ids).toContain('types');
    expect(ids).toContain('core');
  });
});

// ─── genericFeatureRole ──────────────────────────────────

describe('genericFeatureRole', () => {
  it('returns a mid-level feature role for api', () => {
    const role = genericFeatureRole('api');
    expect(role.id).toBe('feature');
    expect(role.level).toBe(4);
  });

  it('returns a mid-level feature role for ui', () => {
    const role = genericFeatureRole('ui');
    expect(role.level).toBe(5);
  });

  it('returns a mid-level feature role for mixed', () => {
    const role = genericFeatureRole('mixed');
    expect(role.level).toBe(6);
  });
});

// ─── Stability ordering invariants ───────────────────────

describe('stability ordering invariants', () => {
  it('API roles: domain (most stable) has level 0, controllers (least stable) has highest level', () => {
    const roles = getRolesForSystemType('api');
    const domain = roles.find(r => r.id === 'domain');
    const controllers = roles.find(r => r.id === 'controllers');

    expect(domain?.level).toBe(0);
    expect(controllers).toBeDefined();
    expect(controllers!.level).toBeGreaterThan(domain!.level);

    // Controllers should be the highest (least stable) level
    const maxLevel = Math.max(...roles.map(r => r.level));
    expect(controllers!.level).toBe(maxLevel);
  });

  it('UI roles: types (most stable) at 0, navigation/pages at top', () => {
    const roles = getRolesForSystemType('ui');
    const types = roles.find(r => r.id === 'types');
    const navigation = roles.find(r => r.id === 'navigation');

    expect(types?.level).toBe(0);
    expect(navigation!.level).toBeGreaterThan(types!.level);
  });

  it('Angular roles: services is stable, pages is least stable', () => {
    const roles = getRolesForSystemType('ui', 'angular');
    const services = roles.find(r => r.id === 'services');
    const pages = roles.find(r => r.id === 'pages');

    expect(services!.level).toBeLessThan(pages!.level);
  });

  it('each role set has a leaf role at the top', () => {
    const systems: SystemType[] = ['api', 'ui', 'mixed', 'library'];
    for (const system of systems) {
      const roles = getRolesForSystemType(system);
      const hasLeaf = roles.some(r => r.isLeaf);
      expect(hasLeaf, `${system} should have at least one leaf role`).toBe(true);
    }
  });
});
