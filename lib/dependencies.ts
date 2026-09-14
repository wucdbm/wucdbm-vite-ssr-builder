import { JSDOM } from 'jsdom'

export function extractCoreDependencies(indexHtmlTemplate: string): string[] {
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

    return viteCoreDependencies
}
