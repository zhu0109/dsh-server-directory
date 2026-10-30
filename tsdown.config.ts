/**
 * Build both halves of the plugin:
 * - lib/index.js: the Node host half (ESM), ssh2 and basic-ftp stay external.
 * - lib/client.js: the browser half, wrapped in the DSH client module-loader
 *   envelope. React is resolved from the shared runtime module table.
 */
import { defineConfig } from 'tsdown'

const CLIENT_EXTERNALS = ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client']

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    clean: true,
    external: ['ssh2', 'basic-ftp'],
    outExtensions: () => ({ js: '.js' }),
  },
  {
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: false,
    sourcemap: true,
    clean: false,
    external: [...CLIENT_EXTERNALS],
    inputOptions: {
      resolve: {
        conditionNames: ['browser', 'import', 'require', 'default'],
      },
    },
    noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({\n\tid: "dsh-server-directory",\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;`,
      footer: 'return module.exports;\n\t}\n});',
      codeSplitting: false,
    },
  },
])
