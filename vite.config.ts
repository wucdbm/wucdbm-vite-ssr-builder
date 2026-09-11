import { defineConfig } from 'vite'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'
import { name } from './package.json'

export default defineConfig({
    plugins: [
        dts({
            rollupTypes: true,
            include: ['lib'],
            exclude: ['lib/cli'],
        }),
    ],
    build: {
        minify: false,
        copyPublicDir: false,
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                // Node Builtins
                'node:path',
                'node:http',
                'node:fs',
            ],
            output: {
                assetFileNames: 'assets/[name][extname]',
                entryFileNames: '[name].js',
            },
        },
    },
    resolve: {
        alias: {
            '@': resolve('lib/'),
        },
    },
    define: {
        PLUGIN_NAME: JSON.stringify(name),
    },
})
