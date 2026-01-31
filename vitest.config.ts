import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // Use Node environment for testing
    server: {},
  },

  server: {
    port: 3005, // Set the port for the server
  },
});
