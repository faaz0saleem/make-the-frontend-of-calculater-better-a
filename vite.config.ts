import { defineConfig } from 'vite';

// Release stages are explicit build modes. A local "full" build does NOT confer
// CrazyGames Full Launch approval; it only enables code paths that an approved
// Full Launch build needs (ads wiring). See DECISIONS.md / README.md.
export default defineConfig(({ mode, command }) => {
  const stage = mode === 'full' ? 'full' : 'basic';
  const capture = mode === 'capture';
  return {
    base: './',
    define: {
      __RELEASE_STAGE__: JSON.stringify(stage),
      __CAPTURE_MODE__: JSON.stringify(capture),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
      __DEV_TOOLS__: JSON.stringify(command === 'serve' || capture),
    },
    build: {
      target: 'es2020',
      sourcemap: false,
      outDir: capture ? 'dist-capture' : 'dist',
      assetsDir: 'assets',
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 1200,
      reportCompressedSize: true,
    },
    server: { host: true, port: 5173 },
    preview: { host: true },
    test: {
      include: ['tests/unit/**/*.test.ts'],
      environment: 'node',
    },
  };
});
