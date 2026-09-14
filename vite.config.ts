import { defineConfig } from 'vite'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'
import packageJson from './package.json' with { type: 'json' }
import depsExternal from 'rollup-plugin-node-externals'

export default defineConfig({
    plugins: [
        dts({
            rollupTypes: true,
            include: ['lib'],
            // exclude: ['lib/cli'],
        }),
        depsExternal(),
    ],
    build: {
        outDir: './dist/lib',
        emptyOutDir: true,
        minify: false,
        copyPublicDir: false,
        lib: {
            entry: resolve(import.meta.dirname, 'lib/index.ts'),
            formats: ['es'],
        },
        rolldownOptions: {
            external: [
                /node_modules/,
                ...Object.keys(packageJson.peerDependencies || {}),
                ...Object.keys(packageJson.devDependencies || {}),
            ],
            output: {
                // assetFileNames: 'assets/[name][extname]',
                entryFileNames: '[name].js',
            },
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
