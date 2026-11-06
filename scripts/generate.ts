import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { dirname } from 'node:path'

const LLMS_INDEX_URL = 'https://platform.claude.com/llms.txt'
const SOURCE_FILE = new URL('../source.json', import.meta.url)

async function fetchText(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) {
    throw new Error(`${url}: HTTP ${res.status}`)
  }
  return res.text()
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

async function discoverCandidateUrls() {
  const index = await fetchText(LLMS_INDEX_URL)
  const links = index.matchAll(
    /\[([^\]]+)\]\((https:\/\/platform\.claude\.com\/[^)\s]+\.md)\)/g,
  )
  return [...links]
    .filter(([, title, url]) => /\bip\b/i.test(`${title} ${url}`))
    .map(([, , url]) => url)
}

async function loadCidrs() {
  const source: { url: string } = JSON.parse(readFileSync(SOURCE_FILE, 'utf8'))

  try {
    return parseInboundCidrs(await fetchText(source.url))
  } catch (error) {
    console.warn(`Source failed, checking ${LLMS_INDEX_URL}: ${error}`)
  }

  for (const url of await discoverCandidateUrls()) {
    try {
      const cidrs = parseInboundCidrs(await fetchText(url))
      if (url !== source.url) {
        writeFileSync(SOURCE_FILE, `${JSON.stringify({ url }, null, 2)}\n`)
        console.log(`Source URL updated: ${source.url} -> ${url}`)
      }
      return cidrs
    } catch (error) {
      console.warn(`Skipping candidate ${url}: ${error}`)
    }
  }

  throw new Error(`No usable IP addresses page found in ${LLMS_INDEX_URL}`)
}

const cidrs = await loadCidrs()

let ruleSetFile = 'payload:\n'

for (const cidr of cidrs) {
  ruleSetFile += `  - '${cidr}'\n`
}

const outputPath = process.argv[2] ?? './dist/anthropic-cidr.yml'

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, ruleSetFile)

export {}
