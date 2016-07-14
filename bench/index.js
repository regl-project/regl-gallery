// TODO: verify that headless actually correctly executes the examples with `regl.read`
var CASES = require('./list')
var extend = require('../lib/util/extend')
var createREGL = require('../../regl')
var present = require('present')

const WIDTH = 384
const HEIGHT = 240
var regl
var isHeadless = typeof document === 'undefined'
var canvas
var gl

if (isHeadless) {
  gl = require('gl')(WIDTH, HEIGHT)
} else {
  canvas = document.createElement('canvas')
  gl = canvas.getContext('webgl', {
    antialias: false,
    stencil: true,
    preserveDrawingBuffer: true
  })
  canvas.style.position = 'fixed'
  canvas.style.top = '0'
  canvas.style.right = '0'

  canvas.style.width = WIDTH + 'px'
  canvas.style.height = HEIGHT + 'px'
  canvas.width = WIDTH
  canvas.height = HEIGHT

  document.body.appendChild(canvas)
}

regl = createREGL(gl)

function analyze (samples, fmt) {
  // Moments
  var m0 = samples.length
  var m1 = 0.0
  var m2 = 0.0
  for (var i = 0; i < m0; ++i) {
    var x = samples[i]
    m1 += x
    m2 += Math.pow(x, 2)
  }

  // Descriptive stats
  var mean = m1 / m0
  var stddev = Math.sqrt(m2 / m0 - Math.pow(mean, 2))

  // Order stats
  var sorted = samples.slice().sort(function (a, b) {
    return a - b
  })

  return {
    mean: mean,
    stddev: stddev
  }
  /*
  return [

//    'μ=', fmt(mean), '∓', fmt(stddev),
  ].join('')*/
}

function sigfigs (x) {
  var xr = Math.round(x * 100)
  return (xr / 100)
}

function formatTime (x) {
  if (x > 1000) {
    return sigfigs(x / 1000.0) + 's'
  }
  if (x > 1) {
    return sigfigs(x) + 'ms'
  }
  return sigfigs(x * 1e3) + 'μs'
}

function formatMemory (x) {
  if (x > (1 << 20)) {
    return sigfigs(x / (1 << 20)) + 'Mb'
  }
  if (x > (1 << 10)) {
    return sigfigs(x / (1 << 10)) + 'kb'
  }
  return x + 'b'
}

function benchmark (caseName, testCase) {

  var procedure
  if (caseName === 'cube-webgl') {
    procedure = testCase.proc(gl, WIDTH, HEIGHT)
  } else {
    procedure = testCase.proc(regl)
  }
  var samples = testCase.samples
  var warmupSamples = testCase.warmupSamples

  var timeSamples = []
  var heapSamples = []

  function sample (tick) {
    regl.clear({
      color: [ 0, 0, 0, 0 ],
      depth: 1,
      stencil: 0
    })
    var start = present()
    procedure({tick: tick})
    timeSamples.push(present() - start)

    // dont have this in headless.
    if(!isHeadless)
      heapSamples.push(performance.memory.usedJSHeapSize)
  }

  return function run () {
    var i
    for (i = 0; i < warmupSamples; ++i) {
      regl.clear({
        color: [ 0, 0, 0, 0 ],
        depth: 1,
        stencil: 0
      })
      regl.updateTimer()

      procedure({tick: i})
    }

    timeSamples.length = 0
    heapSamples.length = 0

    for (i = 0; i < samples; i++) {
      regl.updateTimer()

      sample(i)
    }

    //    console.log("samples: ", timeSamples)
    var ret = {
      n: timeSamples.length,
      time: analyze(timeSamples, formatTime)
    }

    if(!isHeadless)
      ret.space = analyze(heapSamples, formatMemory)

    return ret
  }
}

function button (text, onClick) {
  var result = document.createElement('a')
  result.text = text
  result.href = '#' + text
  result.addEventListener('click', onClick)

  var statNode = document.createElement('h5')
  statNode.innerText = 'n:0, t:(---), m:(---)'
  extend(statNode.style, {
    'margin': '4px',
    'display': 'inline'
  })

  var buttonContainer = document.createElement('div')
  buttonContainer.appendChild(result)
  buttonContainer.appendChild(statNode)
  document.body.appendChild(buttonContainer)

  return {
    link: result,
    text: statNode,
    container: buttonContainer
  }
}

var json = {}

Object.keys(CASES).map(function (caseName) {

  var sample = benchmark(caseName, CASES[caseName])

  if (isHeadless) {
    var bench = sample()
    json[caseName] = bench
//    console.log(caseName + ' : ' + 'n:' + bench.n + ', t:(' + bench.time + '),')
  } else {
    var result
    result = button(caseName, function () {
      var bench = sample()

      var time = ['μ=', formatTime(bench.time.mean), '∓', formatTime(bench.time.stddev)].join('')
      var memory = ['μ=', formatMemory(bench.space.mean), '∓', formatMemory(bench.space.stddev)].join('')

      result.text.innerText = 'n:' + bench.n + ', t:(' + time + '), ' + 'm:(' + memory + '),'
      return result
    })
  }
})

// if headless, we output info through stdout.

if(isHeadless)
  console.log(json)
