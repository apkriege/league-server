import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const serverRoot = process.cwd();

describe('deployment configuration', () => {
  it('runs safe Prisma migrations before every Railway deployment', () => {
    const railway = JSON.parse(
      fs.readFileSync(path.join(serverRoot, 'railway.json'), 'utf8'),
    );

    expect(railway.build.buildCommand).toBe('npm run build');
    expect(railway.deploy.preDeployCommand).toEqual(['npm run db:migrate:deploy']);
    expect(railway.deploy.startCommand).toBe('npm start');
    expect(railway.deploy.preDeployCommand.join(' ')).not.toMatch(/reset|db push|seed/i);
  });

  it('keeps one clean initial migration baseline', () => {
    const migrationsRoot = path.join(serverRoot, 'prisma', 'migrations');
    const migrationDirectories = fs
      .readdirSync(migrationsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(migrationDirectories).toEqual(['20260809000000_init']);
    expect(
      fs.existsSync(path.join(migrationsRoot, migrationDirectories[0], 'migration.sql')),
    ).toBe(true);
  });

  it('pins Node 24 and runs repository-owned CI verification', () => {
    const nodeVersion = fs.readFileSync(path.join(serverRoot, '.nvmrc'), 'utf8').trim();
    const workflow = fs.readFileSync(
      path.join(serverRoot, '.github/workflows/verify.yml'),
      'utf8',
    );

    expect(nodeVersion).toMatch(/^24\./);
    expect(workflow).toContain('node-version-file: .nvmrc');
    expect(workflow).toContain('npm run verify');
    expect(workflow).toContain('npm run test:integration');
    expect(workflow).toContain('npm run audit:prod');
  });
});
