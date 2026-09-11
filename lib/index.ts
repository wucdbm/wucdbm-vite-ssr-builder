import type { PluginOption } from 'vite'
import type { BuilderConfig } from './config'

export function WucdbmViteSSRBuilder(
    options: BuilderConfig = {},
): PluginOption {
    return {
        name: PLUGIN_NAME,
        [PLUGIN_NAME]: options,
    }
}
