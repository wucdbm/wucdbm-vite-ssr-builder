import { defineConfig } from 'vite'
import { resolve } from 'path'
import { name } from './package.json'

export default defineConfig({
    build: {
        outDir: './dist/cli',
        emptyOutDir: false,
        copyPublicDir: false,
        lib: {
            entry: resolve(__dirname, 'lib/cli/index.ts'),
            formats: ['es'],
        },
        rollupOptions: {
            output: {
                entryFileNames: '[name].js',
            },
        },
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, 'lib/'),
        },
    },
    define: {
        PLUGIN_NAME: JSON.stringify(name),
    },
})
