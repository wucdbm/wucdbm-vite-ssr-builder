import { defineConfig } from 'vite'
import { resolve } from 'path'
import packageJson from './package.json' with { type: 'json' }
import depsExternal from 'rollup-plugin-node-externals'

export default defineConfig({
    plugins: [depsExternal()],
    build: {
        minify: false,
        outDir: './dist/cli',
        emptyOutDir: true,
        copyPublicDir: false,
        lib: {
            entry: resolve(import.meta.dirname, 'lib/cli/index.ts'),
            formats: ['es'],
        },
        rolldownOptions: {
            output: {
                entryFileNames: '[name].js',
            },
            external: [
                /node_modules/,
                ...Object.keys(packageJson.peerDependencies || {}),
                ...Object.keys(packageJson.devDependencies || {}),
            ],
        },
    },
    resolve: {
        alias: {
            '@': resolve(import.meta.dirname, 'lib/'),
        },
    },
    define: {
        PLUGIN_NAME: JSON.stringify(packageJson['name']),
    },
})
