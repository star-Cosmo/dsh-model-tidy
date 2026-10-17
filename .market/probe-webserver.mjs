import fs from 'node:fs'

// `ctx.inject(['webServer'], child => ...)` is how this plugin registers a
// route lazily. Confirm an installed plugin does the same, rather than assuming
// the service name and the callback shape.
const file = 'E:/AI agent/DeepseekHarness/dsh-data/.dsh/profiles/desktop/node_modules/dsh-workbuddy-connect/lib/index.js'
const s = fs.readFileSync(file, 'utf8')

for (const kw of ['registerWorkBuddyStatusRoute(', "inject(['webServer']", 'webServer:']) {
  let at = -1
  let n = 0
  while ((at = s.indexOf(kw, at + 1)) !== -1 && n < 3) {
    console.log(`=== ${JSON.stringify(kw)} @${at} ===`)
    console.log(s.slice(Math.max(0, at - 400), at + 500))
    console.log('')
    n += 1
  }
}
