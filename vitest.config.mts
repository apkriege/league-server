import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      CLIENT_URL: 'http://localhost:5173',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/league_night_unit_test',
      SESSION_SECRET: 'unit-test-session-secret',
    },
    include: ['src/**/*.spec.ts'],
    exclude: ['dist/**', 'node_modules/**', 'src/**/*.integration.spec.ts'],
  },
});
