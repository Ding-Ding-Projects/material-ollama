#!/usr/bin/env node
// Manual regeneration tool for a Noto Sans HK subset. NOT wired into any build
// step, and no CJK .woff2 is committed to this repository. Read this whole
// comment before "fixing" that -- it is deliberate, not an oversight.
//
// Why Noto Sans HK is not bundled:
//   1. A usable Hong Kong / Traditional Chinese subset is multiple megabytes
//      even trimmed hard -- there is no small "HK-only" slice of CJK the way
//      there is for, say, a Latin-only Roboto Flex file. The character set
//      below (341 glyphs, hand-extracted from this app's own design copy) is
//      already the *smallest defensible* subset, and it still cannot be
//      shipped as "the" HK font, because:
//   2. This is a chat app. The one thing a static subset structurally cannot
//      do is cover arbitrary text a user or a model types into it. Ship a
//      341-glyph subset as the CJK face and the very first uncommon surname,
//      or the very first reply that isn't small talk, renders as tofu -- the
//      exact failure a bundled "safety net" font was supposed to prevent.
//   3. Windows already ships a full CJK-capable font (Microsoft JhengHei /
//      Yu Gothic / MS Gothic, depending on locale and installed language
//      packs), and the browser's own font-substitution chain reaches it
//      automatically once src/styles/fonts.css's registered families (which
//      only cover Latin) run out of glyphs for a given character. See the
//      comment at the top of fonts.css -- 'Noto Sans HK' is deliberately left
//      out of that file's @font-face rules for exactly this reason.
//
// So: no CDN fetch, no bundled binary, no build-time step. This script exists
// only so that if a future, narrower use case turns up -- a fixed set of
// short CJK UI labels that must render identically across every OS, say --
// regenerating a real subset is one command away instead of a research
// project. Run it by hand; commit whatever it produces only if a specific
// bounded need for it actually appears.
//
// Usage:
//   node scripts/subset-fonts.mjs <path-to-source-font> [output.woff2] [options]
//
//   <path-to-source-font>  A local Noto Sans HK file you have already
//                          obtained yourself (OTF/TTF/WOFF/WOFF2). This script
//                          does not download one -- get it from
//                          https://fonts.google.com/noto/specimen/Noto+Sans+HK
//                          or https://github.com/notofonts/noto-cjk/releases.
//   [output.woff2]         Defaults to ./noto-sans-hk-subset.woff2 in the
//                          current directory.
//
// Options:
//   --text "..."           Subset to exactly the characters in this string,
//                          INSTEAD of the built-in DEFAULT_CHARSET below.
//   --text-file <path>     Subset to exactly the characters found in this
//                          file (any encoding node can read as utf8),
//                          INSTEAD of DEFAULT_CHARSET.
//   --extra "..."          Add these characters ON TOP OF whichever charset
//                          above ends up in use (built-in, --text, or
//                          --text-file).
//   --weight <number>      Pin a variable source font to one weight via the
//                          wght axis (e.g. --weight 400). Ignored for a
//                          static/non-variable source font.
//
// Examples:
//   node scripts/subset-fonts.mjs ~/Downloads/NotoSansHK-Regular.otf
//   node scripts/subset-fonts.mjs ~/Downloads/NotoSansHK\[wght\].ttf out.woff2 --weight 400
//   node scripts/subset-fonts.mjs ~/Downloads/NotoSansHK-Regular.otf out.woff2 \
//     --text-file app/ui/app/src/i18n/yue.json --extra "、。！？"

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

// subset-font is a devDependency of app/ui/app, not of this repo's root (this
// repo has no root package.json). Node's ESM resolver walks up from THIS
// file's own directory looking for node_modules, and scripts/ has no ancestor
// that contains app/ui/app/node_modules -- so a plain `import 'subset-font'`
// cannot find it no matter the caller's cwd. Resolve it explicitly against
// app/ui/app instead, which is where `npm install` actually put it.
const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const appDir = path.join(repoRoot, 'app', 'ui', 'app')
const appRequire = createRequire(path.join(appDir, 'package.json'))
const subsetFont = appRequire('subset-font')

// The default character set: every CJK Unified Ideograph, CJK punctuation, and
// fullwidth-form character that appears anywhere in the Material Ollama design
// prototype's Cantonese copy (both languages of every [en, yue] pair, plus
// standalone Cantonese strings), as of the pass that wrote this script.
// Extracted with a one-line scan over Unicode code points in the ranges
// U+3000-U+303F (CJK punctuation), U+3400-U+4DBF (CJK Ext. A),
// U+4E00-U+9FFF (CJK Unified Ideographs), and U+FF00-U+FFEF (fullwidth forms)
// -- the same ranges this script itself scans for --text-file input, so
// regenerating this constant against updated source copy is the same code
// path as any other --text-file run.
const DEFAULT_CHARSET =
  '、。一上下串主乜事人今他代令以仲件佈位低住作你係保個偈做傾儲元先入內全其具冇再出切列別刪到前功加勁動包匯即原叉取句只可台史右各同名吓吖呀告呢味咗咩唔啦啱啲喎喜單喺嗰嘅嘢器嚟圓地型執外多大太夾套好始子字存完定室家密實寫寶尋對小尖層工帳帶幫平幾度廣式引彙影律徑得心息態慢或戶所打把拉拜括指掂排揀提換援搜搞搵撻擺支改放效整數文料新旁日明時晒更書最會有未本東案標模機檔檢次正歷每永活流消淨深淺清準照燒爆爪版狀理生用留發白百目真睇知硬確示禮私秘程種端笑筍算箱篩簡米粉精糕糯紀素組經網線編置翻者而聲能腸自舊舖般色英菜蔔藏蘿蛋蝦行街裝親觀角解言計訊記設詞試話誌語誤說諗講證警譯變資賣走起路載輯輸轉近返退送通運過遠遮遲選還邊部都配釘錄錯鎖長閂閉開關除隊隱雙雞離雲靜面音預題顏顯風飛餃驗驚鳳點！，：？'

const CJK_RANGES = [
  [0x3000, 0x303f], // CJK Symbols and Punctuation
  [0x3400, 0x4dbf], // CJK Unified Ideographs Extension A
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0xff00, 0xffef], // Halfwidth and Fullwidth Forms
]

function isCjk(codePoint) {
  return CJK_RANGES.some(([lo, hi]) => codePoint >= lo && codePoint <= hi)
}

function extractCjkCharset(text) {
  const set = new Set()
  for (const ch of text) {
    if (isCjk(ch.codePointAt(0))) set.add(ch)
  }
  return [...set].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join('')
}

function parseArgs(argv) {
  const positional = []
  const options = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--text' || arg === '--text-file' || arg === '--extra' || arg === '--weight') {
      options[arg.slice(2)] = argv[++i]
    } else {
      positional.push(arg)
    }
  }
  return { positional, options }
}

async function main() {
  const { positional, options } = parseArgs(process.argv.slice(2))
  const [sourcePath, outputPathArg] = positional

  if (!sourcePath) {
    console.error('subset-fonts: missing <path-to-source-font>')
    console.error('subset-fonts: usage: node scripts/subset-fonts.mjs <source-font> [output.woff2] [options]')
    console.error('subset-fonts: see the comment at the top of this file for why this is a manual tool')
    process.exit(2)
  }
  if (!existsSync(sourcePath)) {
    console.error(`subset-fonts: no such file: ${sourcePath}`)
    process.exit(2)
  }

  const outputPath = outputPathArg || 'noto-sans-hk-subset.woff2'

  let charset
  if (options['text-file']) {
    if (!existsSync(options['text-file'])) {
      console.error(`subset-fonts: --text-file not found: ${options['text-file']}`)
      process.exit(2)
    }
    charset = extractCjkCharset(readFileSync(options['text-file'], 'utf8'))
    console.log(`subset-fonts: using ${charset.length} CJK characters extracted from ${options['text-file']}`)
  } else if (options.text) {
    charset = extractCjkCharset(options.text)
    console.log(`subset-fonts: using ${charset.length} CJK characters extracted from --text`)
  } else {
    charset = DEFAULT_CHARSET
    console.log(`subset-fonts: using the built-in default charset (${charset.length} characters)`)
    console.log('subset-fonts: pass --text or --text-file to subset against real content instead')
  }

  if (options.extra) {
    const merged = new Set([...charset, ...options.extra])
    charset = [...merged].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join('')
    console.log(`subset-fonts: merged --extra in, now ${charset.length} characters total`)
  }

  const sourceBuffer = readFileSync(sourcePath)
  const subsetOptions = { targetFormat: 'woff2' }
  if (options.weight) {
    subsetOptions.variationAxes = { wght: Number(options.weight) }
  }

  console.log(`subset-fonts: subsetting ${sourcePath} -> ${outputPath}`)
  const subsetBuffer = await subsetFont(sourceBuffer, charset, subsetOptions)
  writeFileSync(outputPath, subsetBuffer)

  console.log(`subset-fonts: wrote ${subsetBuffer.length} bytes to ${outputPath}`)
  console.log('subset-fonts: this file is NOT committed or wired into the build automatically --')
  console.log('subset-fonts: read the header comment in this script before adding it to fonts.css.')
}

main().catch((err) => {
  console.error('subset-fonts: failed:', err.message)
  process.exit(1)
})
