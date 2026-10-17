import { defineConfig } from 'vitest/config';

// Exploratory tuning harnesses (not part of the CI suite): npx vitest run -c vitest.tools.config.ts <name>
export default defineConfig({
  define: { __RELEASE_STAGE__: '"basic"', __CAPTURE_MODE__: 'false', __BUILD_TIME__: '"tools"', __DEV_TOOLS__: 'false' },
  test: { include: ['tests/tools/**/*.tool.ts'], environment: 'node', testTimeout: 600000 },
});
