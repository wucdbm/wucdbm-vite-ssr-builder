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
import { JSDOM } from 'jsdom'
import type {
    OutputAsset,
    OutputOptions,
    RolldownOutput,
    RolldownWatcher,
    RolldownWatcherEvent,
} from 'rolldown'
import { BuilderConfig } from '../config'

export interface CliConfig {
    mode?: string
    build: {
        watch?: true
    }
}

export async function buildClientAndServer(config: CliConfig): Promise<void> {
    return new Promise((resolve, reject) => {
        doBuildClientAndServer(config, resolve).catch(reject)
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
): Promise<void> {
    const viteConfig = await resolveViteConfig()

    const distDir =
        viteConfig.build?.outDir ?? path.resolve(process.cwd(), 'dist')

    const pluginOptions = getPluginOptions(viteConfig)

    const clientBuildOptions = await resolveClientOptions(
        distDir,
        viteConfig,
        pluginOptions,
        cliConfig,
    )

    const clientResult = await build(clientBuildOptions)

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
        const viteCoreDependencies: string[] = []
        const { document } = new JSDOM(indexHtmlTemplate).window

        const scripts = document.querySelectorAll('script')
        scripts.forEach((script) => {
            const src = script.getAttribute('src')
            if (src) {
                viteCoreDependencies.push(src)
            }
        })

        const links = document.querySelectorAll('link')
        links.forEach((link) => {
            const href = link.getAttribute('href')
            if (href) {
                viteCoreDependencies.push(href)
            }
        })

        const serverBuildOptions = await resolveServerOptions(
            distDir,
            viteConfig,
            pluginOptions,
            cliConfig,
        )
        await build(serverBuildOptions)

        if (pluginOptions?.removeIndexHtml) {
            fs.unlinkSync(
                path.join(
                    clientBuildOptions.build?.outDir as string,
                    'index.html',
                ),
            )
        }

        await generatePackageJson(
            viteConfig,
            clientBuildOptions,
            serverBuildOptions,
            pluginOptions?.packageJson,
        )

        generateCoreDependencies(distDir, viteCoreDependencies)
    }

    // This is a build watcher
    let resolved = false

    clientResult.on('event', async (event: RolldownWatcherEvent) => {
        const code = event.code

        if ('BUNDLE_END' !== code) {
            return
        }

        const result = event.result

        // This piece runs everytime there is
        // an updated frontend bundle.
        await result.close()

        // // Re-read the index.html in case it changed.
        // // This content is not included in the virtual bundle.
        const indexHtmlTemplate = fs.readFileSync(
            (clientBuildOptions.build?.outDir as string) + '/index.html',
            'utf-8',
        )

        await generateServerBundle(indexHtmlTemplate)

        if (!resolved) {
            onFirstBuild()
            resolved = true
        }
    })
}

async function resolveClientOptions(
    distDir: string,
    viteConfig: ResolvedConfig,
    pluginConfig: BuilderConfig,
    cliConfig: CliConfig,
): Promise<InlineConfig> {
    const inputFilePath = pluginConfig.input || ''
    const defaultFilePath = path.resolve(viteConfig.root, 'index.html')
    const inputFileName = inputFilePath.split('/').pop() || 'index.html'

    const defaultConfig: InlineConfig = {
        mode: viteConfig.mode,
        build: {
            outDir: path.resolve(distDir, 'client'),
            ssrManifest: true,
            emptyOutDir: false,

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
    distDir: string,
    viteConfig: ResolvedConfig,
    pluginConfig: BuilderConfig,
    cliConfig: CliConfig,
): Promise<InlineConfig> {
    const defaultOptions: InlineConfig = {
        mode: viteConfig.mode,
        // No need to copy public files to SSR directory
        publicDir: false,
        build: {
            outDir: path.resolve(distDir, 'server'),
            // The plugin is already changing the vite-ssr alias to point to the server-entry.
            // Therefore, here we can just use the same entry point as in the index.html
            ssr: await resolveEntryServerAbsolute(viteConfig, pluginConfig),
            // ssr: await getEntryPointAbsolute(viteConfig),
            emptyOutDir: false,
        },
    }

    return mergeConfig(
        defaultOptions,
        mergeConfig(pluginConfig?.serverOptions || {}, cliConfig),
    )
}

function generateCoreDependencies(
    distDir: string,
    viteCoreDependencies: string[],
): void {
    const outDir = path.resolve(distDir, 'server')
    const filePath = path.resolve(outDir, './.vite/core-dependencies.json')

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
