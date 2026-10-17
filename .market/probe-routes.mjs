import fs from 'node:fs'

// How does an installed third-party plugin register an HTTP route on the host?
// `dsh-workbuddy-connect` does exactly that for its status/probe routes, so it
// is the reference for the shape. This probe is read-only.
const file = 'E:/AI agent/DeepseekHarness/dsh-data/.dsh/profiles/desktop/node_modules/dsh-workbuddy-connect/lib/index.js'
const s = fs.readFileSync(file, 'utf8')

for (const kw of ['webServer', 'registerRoute', 'inject = [', 'const inject', 'ctx.effect(() => ctx.webServer']) {
  const at = s.indexOf(kw)
  console.log(`=== ${JSON.stringify(kw)} @${at} ===`)
  if (at !== -1) console.log(s.slice(Math.max(0, at - 350), at + 650))
  console.log('')
}
