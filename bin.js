#!/usr/bin/env node

var fs = require('fs')
var proc = require('child_process')

var confPath = process.env.HOME + '/.wifictl.json'
var conf

try {
  conf = require(confPath)
} catch (err) {
  conf = {}
}

if (!conf.interface) conf.interface = ifaceName()

var wifi = require('wpa_supplicant')(conf.interface)
var diff = require('diffy')()
var input = require('diffy/input')({style})

var networks = conf.networks || []
var networkByMap = {}
var once = false
var picked = null
var selected = null
var entering = false

networks.forEach(function (network) {
  networkByMap[network.ssid] = network
})

input.on('down', () => move(1))
input.on('up', () => move(-1))
input.on('enter', function () {
  var n = selected && (networkByMap[selected] || {ssid: selected, priority: 0})
  if (entering && n) {
    n.priority = highestPriority() + 1
    networkByMap[n.ssid] = n
    if (networks.indexOf(n) === -1) networks.push(n)
    once = false
    entering = false
    fs.writeFileSync(confPath, JSON.stringify(conf, null, 2) + '\n')
    return
  }
  entering = true
  if (n && n.psk) input.set(n.psk)
})
input.on('update', () => diff.render())

function move (inc) {
  entering = false

  var m = mappedNetworks()
  if (!m.length) return

  if (!selected) {
    selected = m[0].ssid
    return
  }

  var i = 0
  for (; i < m.length; i++) {
    if (m[i].ssid === selected) {
      i += inc
      break
    }
  }
  if (i >= m.length) i = m.length - 1
  if (i < 0) i = 0
  selected = m[i].ssid
}

wifi.on('update', function () {
  if (!picked) return
  wifi.networks.forEach(function (n) {
    var other = networkByMap[n.ssid]
    if (picked && other && other.priority > picked.priority) {
      picked = null
      once = false
    }
  })
})

wifi.on('update', function () {
  if (once) return

  var valid = wifi.networks.filter(function (n) {
    if (!networkByMap[n.ssid]) return false
    return true
  })

  if (!valid.length) return
  once = true

  var best = valid.reduce(pickBest)

  picked = networkByMap[best.ssid]
  best.connect(networkByMap[best.ssid].psk)
})

wifi.on('update', () => diff.render(render))

wifi.on('ready', function () {
  if (!entering) wifi.scan()
  setInterval(function () {
    if (!entering) wifi.scan()
  }, 5000)
})

function priority (n) {
  return networkByMap[n.ssid] ? networkByMap[n.ssid].priority : -1
}

function highestPriority () {
  var high = 0
  for (var i = 0; i < networks.length; i++) {
    high = Math.max(priority(networks[i]), high)
  }
  return high
}

function render () {
  var out = ''
  var c = wifi.currentNetwork
  var scanning = wifi.scanning ? ' (scanning)' : ''

  out += 'State: ' + wifi.state +
    ', Driver: ' + wifi.driver +
    ', Scanning: ' + (scanning ? 'yes' : 'no') + '\n'
  out += 'Current network: ' + (c ? renderNetwork(c) : '(none)') + '\n'
  out += '\n'

  var mapped = mappedNetworks()
  var found = false
  if (!selected && mapped.length) {
    selected = c ? c.ssid : mapped[0].ssid
  }

  for (var i = 0; i < mapped.length; i++) {
    var n = mapped[i]
    if (!n.ssid) continue
    var ch = selected === n.ssid ? '> ' : '  '

    out += ch + renderNetwork(n) + '\n'

    if (selected === n.ssid && entering) {
      out += '    Enter password: ' + input.line() + '\n'
      found = true
    }

    if (i > diff.height - 10) {
      out += '\n... and ' + (mapped.length - i) + ' more'
      break
    }
  }

  if (entering && !found) entering = false

  return out.trim() + '\n'
}

function mappedNetworks () {
  var grouped = []
  var all = []
  for (var i = 0; i < wifi.networks.length; i++) {
    var n = wifi.networks[i]
    if (!grouped.length) {
      grouped.push(n)
    } else {
      var last = grouped[grouped.length - 1]
      if (last.ssid === n.ssid) {
        grouped.push(n)
      } else {
        all.push(grouped.reduce(pickBest))
        grouped = [n]
      }
    }
  }
  if (grouped.length) all.push(grouped.reduce(pickBest))
  return all
}

function pickBest (a, b) {
  if (priority(a) > priority(b)) return a
  if (priority(b) > priority(a)) return b
  if (a.frequency > 5000 && b.frequency < 3000) return a
  if (b.frequency > 5000 && a.frequency < 3000) return b
  return a.signal > b.signal ? a : b
}

function renderNetwork (n) {
  return n.ssid + ', ' + n.frequency + ' mHz, ' + n.signal + ' dB' + (!n.rsn.keyManagement.length ? ' (open)' : '')
}

function style (start, cursor, end) {
  return start + '[' + (cursor || ' ') + ']' + end
}

function ifaceName () {
  var addr = proc.execSync('ip addr').toString().trim().match(/\d: [^:]+:/g) || []
  for (var i = 0; i < addr.length; i++) {
    var name = addr[i].split(': ')[1].trim().slice(0, -1)
    if (name[0] === 'w') return name
  }
  return 'wlan0'
}
