import { InlineConfig } from 'vite'

export interface BuilderConfig {
    /**
     * Path to entry index.html
     * @default '<root>/index.html'
     */
    input?: string
    /**
     * Path to entry-server
     * @default '<root>/src/entry-server.ts'
     */
    entryServer?: string
    /**
     * Vite options applied only to the client build
     */
    clientOptions?: InlineConfig
    /**
     * Vite options applied only to the server build
     */
    serverOptions?: InlineConfig
    /**
     * Extra properties to include in the generated server package.json,
     * or 'false' to avoid generating it.
     */
    packageJson?: Record<string, unknown> | false
    /**
     * Remove the index.html generated in the client build
     * @default false
     */
    removeIndexHtml?: boolean
}
