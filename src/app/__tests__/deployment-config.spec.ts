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

  it('keeps an initial baseline followed by valid incremental migrations', () => {
    const migrationsRoot = path.join(serverRoot, 'prisma', 'migrations');
    const migrationDirectories = fs
      .readdirSync(migrationsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(migrationDirectories[0]).toMatch(/^\d+_init$/);
    expect(migrationDirectories).toEqual([...migrationDirectories].sort());
    for (const migrationDirectory of migrationDirectories) {
      expect(
        fs.existsSync(path.join(migrationsRoot, migrationDirectory, 'migration.sql')),
      ).toBe(true);
    }
  });
});
