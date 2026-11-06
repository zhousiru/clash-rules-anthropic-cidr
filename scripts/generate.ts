import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { dirname } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const SOURCE_FILE = new URL('../source.json', import.meta.url)
const MAX_FETCH_ATTEMPTS = 5
const RETRY_BASE_DELAY_MS = 5_000

async function fetchText(url: string) {
  for (let attempt = 1; ; attempt++) {
    let failure: unknown
    let retryable = true

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (res.ok) {
        return await res.text()
      }
      failure = new Error(`${url}: HTTP ${res.status}`)
      retryable = res.status === 429 || res.status >= 500
    } catch (error) {
      failure = error
    }

    if (!retryable || attempt === MAX_FETCH_ATTEMPTS) {
      throw failure
    }

    const delayMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)
    console.warn(`Retrying in ${delayMs}ms: ${failure}`)
    await sleep(delayMs)
  }
}

function isCidr(value: string) {
  const [ip, prefix] = value.split('/')
  const version = isIP(ip)
  return version !== 0 && Number(prefix) <= (version === 4 ? 32 : 128)
}

// Only the inbound section holds addresses a client connects to. Outbound
// ranges are the source addresses of Anthropic's own requests.
function parseInboundCidrs(markdown: string) {
  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex((line) => /^##\s+inbound\b/i.test(line))
  if (start === -1) {
    throw new Error('Inbound section not found')
  }

  const cidrs = new Set<string>()
  let skipping = false

  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) {
      break
    }
    if (/^###\s/.test(line)) {
      skipping = /phased|deprecat|retired|former|no longer/i.test(line)
    }
    if (skipping) {
      continue
    }
    for (const [candidate] of line.matchAll(/[0-9a-f:.]+\/\d{1,3}/gi)) {
      if (isCidr(candidate)) {
        cidrs.add(candidate)
      }
    }
  }

  // A partial parse must fail the run so the last good rule set stays live.
  if (![...cidrs].some((cidr) => cidr.includes('.'))) {
    throw new Error('No inbound IPv4 CIDR found')
  }

  return [...cidrs]
}

const source: { url: string } = JSON.parse(readFileSync(SOURCE_FILE, 'utf8'))
const cidrs = parseInboundCidrs(await fetchText(source.url))

let ruleSetFile = 'payload:\n'

for (const cidr of cidrs) {
  ruleSetFile += `  - '${cidr}'\n`
}

const outputPath = process.argv[2] ?? './dist/anthropic-cidr.yml'

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, ruleSetFile)

export {}
