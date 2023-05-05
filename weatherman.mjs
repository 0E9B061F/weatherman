import fetch from "node-fetch"
import blessed from "blessed"
import dayjs from "dayjs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

const XDG = process.env.XDG_CONFIG_HOME || join(process.env.HOME, ".config")
const RCROOT = join(XDG, "weatherman")
const RCFILE = join(RCROOT, "weatherman.json")

const defaults = {
  interval: 300,
  locations: [
    ["Pripyat Ukraine", "Pripyat"],
  ],
}

const mkconf = async ()=> {
  try {
    const raw = await readFile(RCFILE)
    const rc = JSON.parse(raw)
    return { ...defaults, ...rc }
  } catch {
    return { ...defaults }
  }
}

const CONF = await mkconf()

const mktxt =(txt)=> {
  return `{center}${txt}{/center}`
}
const mkinfo =()=> {
  const dt = dayjs().format("YY-M-D h:mma")
  return ` WEATHER REPORT{|}for ${dt} `
}

async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 5000 } = options

  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)

  const response = await fetch(resource, {
    ...options,
    signal: controller.signal
  })
  clearTimeout(id)

  return response
}

const report = async (loc, short=null)=> {
  if (!short) short = loc
  loc = loc.replace(/\s+/g, "+")
  let res
  try {
    res = await fetchWithTimeout(`https://wttr.in/~${loc}?0n`)
  } catch (e) {
    return false
  }
  if (res.ok) {
    var txt = await res.text()
    if (!txt.trim()) return false
    txt = txt.split("\n").slice(2)
    txt.unshift(`${short}`)
    return txt.join("\n")
  } else {
    return false
  }
}

// Create a screen object.
var screen = blessed.screen({
  smartCSR: true
})

screen.title = "weatherman"

// Create a weatherBox perfectly centered horizontally and vertically.
var weatherBox = blessed.box({
  top: "center",
  left: "center",
  width: "shrink",
  height: "shrink",
  content: mktxt("WEATHER REPORT HERE"),
  tags: true,
})

const infoBox = blessed.box({
  top: 0,
  left: 0,
  width: "100%",
  height: 1,
  content: mktxt("WEATHER REPORT"),
  tags: true,
})

const statusBox = blessed.box({
  bottom: 0,
  left: 0,
  width: "100%",
  height: 1,
  content: mktxt("BOOTING UP"),
  tags: true,
})

// Append our weatherBox to the screen.
screen.append(infoBox)
screen.append(weatherBox)
screen.append(statusBox)


const update = async ()=> {
  var data = []
  let failures = 0
  for (let x = 0; x < CONF.locations.length; x++) {
    const loc = CONF.locations[x]
    statusBox.setContent(mktxt(`UPDATING ${loc[1]}`))
    screen.render()
    const rep = await report(loc[0], loc[1])
    if (rep) {
      data.push(`\n${rep}`)
    } else {
      failures += 1
    }
  }
  data = data.join("")
  weatherBox.setContent(data)
  if (failures) {
    statusBox.setContent(`Failed to update ${failures} locations`)
  } else {
    statusBox.setContent("")
  }
  infoBox.setContent(mkinfo())
  screen.render()
}

const loop = async ()=> {
  await update()
  setTimeout(loop, CONF.interval * 1000)
}

// If weatherBox is focused, handle `enter`/`return` and give us some more content.
weatherBox.key("enter", function (ch, key) {
  update()
})

// Quit on Escape, q, or Control-C.
screen.key(["escape", "q", "C-c"], function (ch, key) {
  return process.exit(0)
})

// Focus our element.
weatherBox.focus()
screen.render()

await loop()
