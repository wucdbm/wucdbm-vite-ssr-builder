import type { PluginOption } from 'vite'
import type { BuilderConfig } from './config'
import { buildClientAndServer, CliConfig } from './cli/build.ts'

export function WucdbmViteSSRBuilder(
    options: BuilderConfig = {},
): PluginOption {
    return {
        name: PLUGIN_NAME,
        [PLUGIN_NAME]: options,
    }
}

export { buildClientAndServer }
export type { CliConfig }
