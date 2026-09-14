import {
    build,
    mergeConfig,
    resolveConfig,
    ResolvedConfig,
    Plugin,
    InlineConfig,
} from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import type {
    OutputAsset,
    OutputOptions,
    RolldownOutput,
    RolldownWatcher,
    RolldownWatcherEvent,
} from 'rolldown'
import { BuilderConfig } from './config.ts'
import { extractCoreDependencies } from './dependencies.ts'

export interface CliConfig {
    mode?: string
    build: {
        watch?: boolean
    }
}

export async function buildClientAndServer(
    config: CliConfig,
    onBuildStart?: () => void,
    onBuildEnd?: () => void,
): Promise<void> {
    return new Promise((resolve, reject) => {
        doBuildClientAndServer(config, resolve, onBuildStart, onBuildEnd).catch(
            reject,
        )
    })
}

export function getPluginOptions(viteConfig: ResolvedConfig): BuilderConfig {
    const config: Plugin<{ asd: string }> | undefined = viteConfig.plugins.find(
        (plugin) => plugin.name === PLUGIN_NAME,
    )

    if (!config) {
        return {}
    }

    // @ts-expect-error No index signature with a parameter of type string was found on type Plugin<any>
    return config[PLUGIN_NAME] as unknown as BuilderConfig
}

export async function resolveViteConfig(
    mode?: string,
): Promise<ResolvedConfig> {
    return resolveConfig(
        {},
        'build',
        mode || process.env.MODE || process.env.NODE_ENV,
    )
}

export async function resolveEntryServerAbsolute(
    config: ResolvedConfig,
    options: BuilderConfig,
): Promise<string> {
    const entryServer = options.entryServer || '/src/entry-server.ts'

    return resolveEntryAbsolute(config, entryServer)
}

export function resolveEntryAbsolute(
    config: ResolvedConfig,
    entryFile: string,
): string {
    return path.join(config.root, entryFile)
}

async function doBuildClientAndServer(
    cliConfig: CliConfig,
    onFirstBuild: () => void,
    onBuildStart?: () => void,
    onBuildEnd?: () => void,
): Promise<void> {
    const viteConfig = await resolveViteConfig()
    const pluginConfig = getPluginOptions(viteConfig)
    const clientBuildOptions = await resolveClientOptions(
        viteConfig,
        pluginConfig,
        cliConfig,
    )
    const serverBuildOptions = await resolveServerOptions(
        viteConfig,
        pluginConfig,
        cliConfig,
    )

    const asd: InlineConfig = cliConfig.build.watch
        ? {
              build: {
                  watch: pluginConfig.watch,
              },
          }
        : {}

    const clientResult = await build(mergeConfig(clientBuildOptions, asd))

    if (!isWatching(clientResult)) {
        // This is a normal one-off build
        const rollupOutputs = Array.isArray(clientResult)
            ? clientResult
            : [clientResult as RolldownOutput]
        const clientOutputs = rollupOutputs.flatMap((result) => result.output)

        // Get the index.html from the resulting bundle.
        const indexHtmlTemplate = (
            clientOutputs.find((file) => {
                return file.type === 'asset' && file.fileName === 'index.html'
            }) as OutputAsset
        )?.source as string

        await generateServerBundle(indexHtmlTemplate)

        return onFirstBuild()
    }

    async function generateServerBundle(
        indexHtmlTemplate: string,
    ): Promise<void> {
        const viteCoreDependencies = extractCoreDependencies(indexHtmlTemplate)

        const serverResult = await build(serverBuildOptions)

        if (isWatching(serverResult)) {
            throw new Error('For some reason server result is a watch result')
        }

        const clientOurDir = resolveClientDir(viteConfig, pluginConfig)

        if (pluginConfig?.removeIndexHtml) {
            fs.unlinkSync(path.join(clientOurDir, 'index.html'))
        }

        await generatePackageJson(
            viteConfig,
            clientBuildOptions,
            serverBuildOptions,
            pluginConfig?.packageJson,
        )

        const serverDistDir = resolveServerDir(viteConfig, pluginConfig)

        generateCoreDependencies(serverDistDir, viteCoreDependencies)
    }

    let isDoneFirst = false

    clientResult.on('event', async (event: RolldownWatcherEvent) => {
        const code = event.code

        if ('START' !== code) {
            return
        }

        if (!isDoneFirst) {
            return
        }

        onBuildStart?.()
    })

    clientResult.on('event', async (event: RolldownWatcherEvent) => {
        const code = event.code

        if ('BUNDLE_END' !== code) {
            return
        }

        const result = event.result

        // This piece runs everytime there is
        // an updated frontend bundle.
        await result.close()
    })

    clientResult.on('event', async (event: RolldownWatcherEvent) => {
        const code = event.code

        if ('END' !== code) {
            return
        }

        // // Re-read the index.html in case it changed.
        // // This content is not included in the virtual bundle.
        const distDir = resolveClientDir(viteConfig, pluginConfig)
        const indexHtmlTemplate = fs.readFileSync(
            distDir + '/index.html',
            'utf-8',
        )

        await generateServerBundle(indexHtmlTemplate)

        if (isDoneFirst) {
            onBuildEnd?.()
        } else {
            onFirstBuild()
            isDoneFirst = true
        }
    })
}

function resolveDistDir(
    pluginOptions: InlineConfig | undefined,
    viteOptions: ResolvedConfig,
    dir: 'client' | 'server',
): string {
    if (pluginOptions?.build?.outDir) {
        return pluginOptions?.build.outDir
    }

    if (viteOptions.build?.outDir) {
        return path.resolve(viteOptions.build.outDir, dir)
    }

    return path.resolve(process.cwd(), 'dist', dir)
}

function resolveClientDir(
    viteConfig: ResolvedConfig,
    pluginConfig: BuilderConfig,
): string {
    return resolveDistDir(pluginConfig.clientOptions, viteConfig, 'client')
}

function resolveServerDir(
    viteConfig: ResolvedConfig,
    pluginConfig: BuilderConfig,
): string {
    return resolveDistDir(pluginConfig.serverOptions, viteConfig, 'server')
}

async function resolveClientOptions(
    viteConfig: ResolvedConfig,
    pluginConfig: BuilderConfig,
    cliConfig: CliConfig,
): Promise<InlineConfig> {
    const distDir = resolveClientDir(viteConfig, pluginConfig)

    const inputFilePath = pluginConfig.input || ''
    const defaultFilePath = path.resolve(viteConfig.root, 'index.html')
    const inputFileName = inputFilePath.split('/').pop() || 'index.html'

    const defaultConfig: InlineConfig = {
        mode: viteConfig.mode,
        build: {
            outDir: distDir,
            // todo restore this once vite's plugin is fixed
            // ssrManifest: true,
            emptyOutDir: true,

            // Custom input path
            rolldownOptions:
                inputFilePath && inputFilePath !== defaultFilePath
                    ? {
                          input: inputFilePath,
                          plugins: [
                              inputFileName !== 'index.html'
                                  ? {
                                        name: `${PLUGIN_NAME}-name-resolver`,
                                        generateBundle(_options, bundle) {
                                            // Rename custom name to index.html
                                            const htmlAsset =
                                                bundle[inputFileName]
                                            delete bundle[inputFileName]
                                            htmlAsset.fileName = 'index.html'
                                            bundle['index.html'] = htmlAsset
                                        },
                                    }
                                  : undefined,
                          ],
                      }
                    : {},
        },
    }

    return mergeConfig(
        defaultConfig,
        mergeConfig(pluginConfig?.clientOptions || {}, cliConfig),
    )
}

async function resolveServerOptions(
    viteConfig: ResolvedConfig,
    pluginConfig: BuilderConfig,
    cliConfig: CliConfig,
): Promise<InlineConfig> {
    const distDir = resolveServerDir(viteConfig, pluginConfig)

    const defaultConfig: InlineConfig = {
        mode: viteConfig.mode,
        // No need to copy public files to SSR directory
        publicDir: false,
        build: {
            outDir: distDir,
            // The plugin is already changing the vite-ssr alias to point to the server-entry.
            // Therefore, here we can just use the same entry point as in the index.html
            ssr: await resolveEntryServerAbsolute(viteConfig, pluginConfig),
            // ssr: await getEntryPointAbsolute(viteConfig),
            emptyOutDir: true,
        },
    }

    const setWatchToFalse: CliConfig = {
        build: {
            watch: false,
        },
    }

    return mergeConfig(
        defaultConfig,
        mergeConfig(
            pluginConfig?.serverOptions || {},
            mergeConfig(cliConfig, setWatchToFalse),
        ),
    )
}

function generateCoreDependencies(
    serverOutDir: string,
    viteCoreDependencies: string[],
): void {
    const filePath = path.resolve(
        serverOutDir,
        './.vite/core-dependencies.json',
    )

    const fileContent = Buffer.from(
        JSON.stringify(viteCoreDependencies),
        'utf-8',
    )
    ensureDirectoryExists(filePath)
    fs.writeFileSync(filePath, fileContent, { flag: 'w' })
    console.log(`Generate File to ${filePath}`)
}

export function ensureDirectoryExists(filePath: string): void {
    const dirname = path.dirname(filePath)

    if (fs.existsSync(dirname)) {
        return
    }

    fs.mkdirSync(dirname, {
        recursive: true,
    })
}

function isWatching(
    result: RolldownOutput | RolldownOutput[] | RolldownWatcher,
): result is RolldownWatcher {
    return Object.prototype.hasOwnProperty.call(result, 'listeners')
}

async function generatePackageJson(
    viteConfig: ResolvedConfig,
    clientConfig: InlineConfig,
    serverConfig: InlineConfig,
    packageJson: Record<string, unknown> | false | undefined,
) {
    if (packageJson === false) {
        return
    }

    const outputFile = (
        serverConfig.build?.rolldownOptions?.output as OutputOptions
    )?.file

    const ssrOutput = path.parse(
        outputFile ||
            ((viteConfig.build?.ssr || serverConfig.build?.ssr) as string),
    )

    const packageJsonContents = {
        main: outputFile ? ssrOutput.base : ssrOutput.name + '.js',
        type: 'module',
        ssr: {
            // This can be used later to serve static assets
            assets: fs
                .readdirSync(clientConfig.build?.outDir as string)
                .filter((file) => !/(index\.html|manifest\.json)$/i.test(file)),
        },
        ...(packageJson || {}),
    }

    fs.writeFileSync(
        path.join(serverConfig.build?.outDir as string, 'package.json'),
        JSON.stringify(packageJsonContents, null, 2),
        'utf-8',
    )
}
