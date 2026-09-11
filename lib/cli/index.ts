#!/usr/bin/env node

import { buildClientAndServer } from './build'
import type { CliConfig } from './build'

const [, , ...args] = process.argv

const options = {} as Record<string, any>

for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const nextArg = args[i + 1]
    if (arg.startsWith('--')) {
        options[arg.replace('--', '')] =
            !nextArg || nextArg.startsWith('--') ? true : nextArg
    }
}

const { mode, watch } = options

const config: CliConfig = {
    mode,
    build: {
        watch,
    },
}

;(async () => {
    buildClientAndServer(config)
        .then(() => !watch && process.exit(0))
        .catch((e: any) => {
            console.error(e)
            process.exit(1)
        })
})()
