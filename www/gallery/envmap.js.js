(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
const regl = require('../regl')()
const mat4 = require('gl-mat4')
const bunny = require('bunny')
const normals = require('angle-normals')

const setupEnvMap = regl({
  context: {
    view: ({count}) => {
      const t = 0.01 * count
      return mat4.lookAt([],
        [30 * Math.cos(t), 2.5, 30 * Math.sin(t)],
        [0, 2.5, 0],
        [0, 1, 0])
    }
  },
  frag: `
  precision mediump float;
  uniform samplerCube envmap;
  varying vec3 reflectDir;
  void main () {
    gl_FragColor = textureCube(envmap, reflectDir);
  }`,
  uniforms: {
    envmap: regl.cube(
      'assets/posx.jpg',
      'assets/negx.jpg',
      'assets/posy.jpg',
      'assets/negy.jpg',
      'assets/posz.jpg',
      'assets/negz.jpg'),
    view: regl.context('view'),
    projection: ({viewportWidth, viewportHeight}) =>
      mat4.perspective([],
        Math.PI / 4,
        viewportWidth / viewportHeight,
        0.01,
        1000),
    invView: ({view}) => mat4.invert([], view)
  }
})

const drawBackground = regl({
  vert: `
  precision mediump float;
  attribute vec2 position;
  uniform mat4 view;
  varying vec3 reflectDir;
  void main() {
    reflectDir = (view * vec4(position, 1, 0)).xyz;
    gl_Position = vec4(position, 0, 1);
  }`,
  attributes: {
    position: [
      -4, -4,
      -4, 4,
      8, 0]
  },
  depth: {
    mask: false,
    enable: false
  },
  count: 3
})

const drawBunny = regl({
  vert: `
  precision mediump float;
  attribute vec3 position, normal;
  uniform mat4 projection, view, invView;
  varying vec3 reflectDir;
  void main() {
    vec4 eye = invView * vec4(0, 0, 0, 1);
    reflectDir = reflect(
      normalize(position.xyz - eye.xyz / eye.w),
      normal);
    gl_Position = projection * view * vec4(position, 1);
  }`,
  attributes: {
    position: bunny.positions,
    normal: normals(bunny.cells, bunny.positions)
  },
  elements: bunny.cells
})

regl.frame(() => {
  setupEnvMap(() => {
    drawBackground()
    drawBunny()
  })
})

},{"../regl":60,"angle-normals":34,"bunny":35,"gl-mat4":45}],2:[function(require,module,exports){
var GL_FLOAT = 5126

function AttributeRecord () {
  this.state = 0

  this.x = 0.0
  this.y = 0.0
  this.z = 0.0
  this.w = 0.0

  this.buffer = null
  this.size = 0
  this.normalized = false
  this.type = GL_FLOAT
  this.offset = 0
  this.stride = 0
  this.divisor = 0
}

module.exports = function wrapAttributeState (
  gl,
  extensions,
  limits,
  bufferState,
  stringStore) {
  var NUM_ATTRIBUTES = limits.maxAttributes
  var attributeBindings = new Array(NUM_ATTRIBUTES)
  for (var i = 0; i < NUM_ATTRIBUTES; ++i) {
    attributeBindings[i] = new AttributeRecord()
  }

  return {
    Record: AttributeRecord,
    scope: {},
    state: attributeBindings
  }
}

},{}],3:[function(require,module,exports){

var isTypedArray = require('./util/is-typed-array')
var isNDArrayLike = require('./util/is-ndarray')
var values = require('./util/values')
var flatten = require('./util/flatten')
var transpose = require('./util/transpose')
var pool = require('./util/pool')

var arrayTypes = require('./constants/arraytypes.json')
var bufferTypes = require('./constants/dtypes.json')
var usageTypes = require('./constants/usage.json')

var GL_STATIC_DRAW = 0x88E4
var GL_STREAM_DRAW = 0x88E0

var GL_UNSIGNED_BYTE = 5121
var GL_FLOAT = 5126

function typedArrayCode (data) {
  return arrayTypes[Object.prototype.toString.call(data)] | 0
}

function copyArray (out, inp) {
  for (var i = 0; i < inp.length; ++i) {
    out[i] = inp[i]
  }
}

module.exports = function wrapBufferState (gl) {
  var bufferCount = 0
  var bufferSet = {}

  function REGLBuffer (type) {
    this.id = bufferCount++
    this.buffer = gl.createBuffer()
    this.type = type
    this.usage = GL_STATIC_DRAW
    this.byteLength = 0
    this.dimension = 1
    this.dtype = GL_UNSIGNED_BYTE
  }

  REGLBuffer.prototype.bind = function () {
    gl.bindBuffer(this.type, this.buffer)
  }

  var streamPool = []

  function createStream (type, data) {
    var buffer = streamPool.pop()
    if (!buffer) {
      buffer = new REGLBuffer(type)
      buffer.buffer = gl.createBuffer()
    }
    buffer.bind()
    initBufferFromData(buffer, data, GL_STREAM_DRAW, 0, 1)
    return buffer
  }

  function destroyStream (stream) {
    streamPool.push(stream)
  }

  function initBufferFromTypedArray (buffer, data, usage) {
    buffer.byteLength = data.byteLength
    gl.bufferData(buffer.type, data, usage)
  }

  function initBufferFromData (buffer, data, usage, dtype, dimension) {
    buffer.usage = usage
    if (Array.isArray(data)) {
      buffer.dtype = dtype || GL_FLOAT
      if (data.length > 0 && Array.isArray(data[0])) {
        buffer.dimension = data[0].length
        var flatData = pool.allocType(
          buffer.dtype,
          data.length * buffer.dimension)
        flatten(flatData, data, buffer.dimension)
        initBufferFromTypedArray(buffer, flatData, usage)
        pool.freeType(flatData)
      } else {
        buffer.dimension = dimension
        var typedData = pool.allocType(buffer.dtype, data.length)
        copyArray(typedData, data)
        initBufferFromTypedArray(buffer, typedData, usage)
        pool.freeType(typedData)
      }
    } else if (isTypedArray(data)) {
      buffer.dtype = dtype || typedArrayCode(data)
      buffer.dimension = dimension
      initBufferFromTypedArray(buffer, data, usage)
    } else if (isNDArrayLike(data)) {
      var shape = data.shape
      var stride = data.stride
      var offset = data.offset

      var shapeX = 0
      var shapeY = 0
      var strideX = 0
      var strideY = 0
      if (shape.length === 1) {
        shapeX = shape[0]
        shapeY = 1
        strideX = stride[0]
        strideY = 0
      } else if (shape.length === 2) {
        shapeX = shape[0]
        shapeY = shape[1]
        strideX = stride[0]
        strideY = stride[1]
      } else {
        
      }

      buffer.dtype = dtype || typedArrayCode(data.data) || GL_FLOAT
      buffer.dimension = shapeY

      var transposeData = pool.allocType(buffer.dtype, shapeX * shapeY)
      transpose(transposeData,
        data.data,
        shapeX, shapeY,
        strideX, strideY,
        offset)
      initBufferFromTypedArray(buffer, transposeData, usage)
      pool.freeType(transposeData)
    } else {
      
    }
  }

  function destroy (buffer) {
    var handle = buffer.buffer
    
    if (gl.isBuffer(handle)) {
      gl.deleteBuffer(handle)
    }
    buffer.buffer = null
    delete bufferSet[buffer.id]
  }

  function createBuffer (options, type, deferInit) {
    var buffer = new REGLBuffer(type)
    bufferSet[buffer.id] = buffer

    function reglBuffer (options) {
      var usage = GL_STATIC_DRAW
      var data = null
      var byteLength = 0
      var dtype = 0
      var dimension = 1
      if (Array.isArray(options) ||
          isTypedArray(options) ||
          isNDArrayLike(options)) {
        data = options
      } else if (typeof options === 'number') {
        byteLength = options | 0
      } else if (options) {
        

        if ('data' in options) {
          
          data = options.data
        }

        if ('usage' in options) {
          
          usage = usageTypes[options.usage]
        }

        if ('type' in options) {
          
          dtype = bufferTypes[options.type]
        }

        if ('dimension' in options) {
          
          dimension = options.dimension | 0
        }

        if ('length' in options) {
          
          byteLength = options.length | 0
        }
      }

      buffer.bind()
      if (!data) {
        gl.bufferData(buffer.type, byteLength, usage)
        buffer.dtype = dtype || GL_UNSIGNED_BYTE
        buffer.usage = usage
        buffer.dimension = dimension
        buffer.byteLength = byteLength
      } else {
        initBufferFromData(buffer, data, usage, dtype, dimension)
      }

      return reglBuffer
    }

    function setSubData (data, offset) {
      
      gl.bufferSubData(buffer.type, offset, data)
    }

    function subdata (data, offset_) {
      var offset = (offset_ || 0) | 0
      buffer.bind()
      if (Array.isArray(data)) {
        if (data.length > 0 && Array.isArray(data[0])) {
          var dimension = data[0].length
          var flatData = pool.allocType(buffer.dtype, data.length * dimension)
          flatten(flatData, data, dimension)
          setSubData(flatData, offset)
          pool.freeType(flatData)
        } else {
          var converted = pool.allocType(buffer.dtype, data.length)
          copyArray(converted, data)
          setSubData(converted, offset)
          pool.freeType(converted)
        }
      } else if (isTypedArray(data)) {
        setSubData(data, offset)
      } else if (isNDArrayLike(data)) {
        var shape = data.shape
        var stride = data.stride

        var shapeX = 0
        var shapeY = 0
        var strideX = 0
        var strideY = 0
        if (shape.length === 1) {
          shapeX = shape[0]
          shapeY = 1
          strideX = stride[0]
          strideY = 0
        } else if (shape.length === 2) {
          shapeX = shape[0]
          shapeY = shape[1]
          strideX = stride[0]
          strideY = stride[1]
        } else {
          
        }
        var dtype = Array.isArray(data.data)
          ? buffer.dtype
          : typedArrayCode(data.data)

        var transposeData = pool.allocType(dtype, shapeX * shapeY)
        transpose(transposeData,
          data.data,
          shapeX, shapeY,
          strideX, strideY,
          data.offset)
        setSubData(transposeData, offset)
        pool.freeType(transposeData)
      } else {
        
      }
      return reglBuffer
    }

    if (!deferInit) {
      reglBuffer(options)
    }

    reglBuffer._reglType = 'buffer'
    reglBuffer._buffer = buffer
    reglBuffer.subdata = subdata
    reglBuffer.destroy = function () { destroy(buffer) }

    return reglBuffer
  }

  return {
    create: createBuffer,

    createStream: createStream,
    destroyStream: destroyStream,

    clear: function () {
      values(bufferSet).forEach(destroy)
    },

    getBuffer: function (wrapper) {
      if (wrapper && wrapper._buffer instanceof REGLBuffer) {
        return wrapper._buffer
      }
      return null
    },

    _initBuffer: initBufferFromData
  }
}

},{"./constants/arraytypes.json":4,"./constants/dtypes.json":5,"./constants/usage.json":7,"./util/flatten":22,"./util/is-ndarray":23,"./util/is-typed-array":24,"./util/pool":28,"./util/transpose":31,"./util/values":32}],4:[function(require,module,exports){
module.exports={
  "[object Int8Array]": 5120
, "[object Int16Array]": 5122
, "[object Int32Array]": 5124
, "[object Uint8Array]": 5121
, "[object Uint8ClampedArray]": 5121
, "[object Uint16Array]": 5123
, "[object Uint32Array]": 5125
, "[object Float32Array]": 5126
, "[object Float64Array]": 5121
, "[object ArrayBuffer]": 5121
}

},{}],5:[function(require,module,exports){
module.exports={
  "int8": 5120
, "int16": 5122
, "int32": 5124
, "uint8": 5121
, "uint16": 5123
, "uint32": 5125
, "float": 5126
}

},{}],6:[function(require,module,exports){
module.exports={
  "points": 0,
  "point": 0,
  "lines": 1,
  "line": 1,
  "line loop": 2,
  "line strip": 3,
  "triangles": 4,
  "triangle": 4,
  "triangle strip": 5,
  "triangle fan": 6
}

},{}],7:[function(require,module,exports){
module.exports={
  "static": 35044,
  "dynamic": 35048,
  "stream": 35040
}

},{}],8:[function(require,module,exports){

var createEnvironment = require('./util/codegen')
var loop = require('./util/loop')
var isTypedArray = require('./util/is-typed-array')
var isNDArray = require('./util/is-ndarray')

var primTypes = require('./constants/primitives.json')
var glTypes = require('./constants/dtypes.json')

// "cute" names for vector components
var CUTE_COMPONENTS = 'xyzw'.split('')

var GL_UNSIGNED_BYTE = 5121

var ATTRIB_STATE_POINTER = 1
var ATTRIB_STATE_CONSTANT = 2

var DYN_FUNC = 0
var DYN_PROP = 1
var DYN_CONTEXT = 2
var DYN_STATE = 3

var S_DITHER = 'dither'
var S_BLEND_ENABLE = 'blend.enable'
var S_BLEND_COLOR = 'blend.color'
var S_BLEND_EQUATION = 'blend.equation'
var S_BLEND_FUNC = 'blend.func'
var S_DEPTH_ENABLE = 'depth.enable'
var S_DEPTH_FUNC = 'depth.func'
var S_DEPTH_RANGE = 'depth.range'
var S_DEPTH_MASK = 'depth.mask'
var S_COLOR_MASK = 'colorMask'
var S_CULL_ENABLE = 'cull.enable'
var S_CULL_FACE = 'cull.face'
var S_FRONT_FACE = 'frontFace'
var S_LINE_WIDTH = 'lineWidth'
var S_POLYGON_OFFSET_ENABLE = 'polygonOffset.enable'
var S_POLYGON_OFFSET_OFFSET = 'polygonOffset.offset'
var S_SAMPLE_ALPHA = 'sample.alpha'
var S_SAMPLE_ENABLE = 'sample.enable'
var S_SAMPLE_COVERAGE = 'sample.coverage'
var S_STENCIL_ENABLE = 'stencil.enable'
var S_STENCIL_MASK = 'stencil.mask'
var S_STENCIL_FUNC = 'stencil.func'
var S_STENCIL_OPFRONT = 'stencil.opFront'
var S_STENCIL_OPBACK = 'stencil.opBack'
var S_SCISSOR_ENABLE = 'scissor.enable'
var S_SCISSOR_BOX = 'scissor.box'
var S_VIEWPORT = 'viewport'

var S_FRAMEBUFFER = 'framebuffer'
var S_VERT = 'vert'
var S_FRAG = 'frag'
var S_ELEMENTS = 'elements'
var S_PRIMITIVE = 'primitive'
var S_COUNT = 'count'
var S_OFFSET = 'offset'
var S_INSTANCES = 'instances'

var SUFFIX_WIDTH = 'Width'
var SUFFIX_HEIGHT = 'Height'

var S_FRAMEBUFFER_WIDTH = S_FRAMEBUFFER + SUFFIX_WIDTH
var S_FRAMEBUFFER_HEIGHT = S_FRAMEBUFFER + SUFFIX_HEIGHT
var S_VIEWPORT_WIDTH = S_VIEWPORT + SUFFIX_WIDTH
var S_VIEWPORT_HEIGHT = S_VIEWPORT + SUFFIX_HEIGHT
var S_DRAWINGBUFFER = 'drawingBuffer'
var S_DRAWINGBUFFER_WIDTH = S_DRAWINGBUFFER + SUFFIX_WIDTH
var S_DRAWINGBUFFER_HEIGHT = S_DRAWINGBUFFER + SUFFIX_HEIGHT

var GL_ARRAY_BUFFER = 34962
var GL_ELEMENT_ARRAY_BUFFER = 34963

var GL_FRAGMENT_SHADER = 35632
var GL_VERTEX_SHADER = 35633

var GL_TEXTURE_2D = 0x0DE1
var GL_TEXTURE_CUBE_MAP = 0x8513

var GL_CULL_FACE = 0x0B44
var GL_BLEND = 0x0BE2
var GL_DITHER = 0x0BD0
var GL_STENCIL_TEST = 0x0B90
var GL_DEPTH_TEST = 0x0B71
var GL_SCISSOR_TEST = 0x0C11
var GL_POLYGON_OFFSET_FILL = 0x8037
var GL_SAMPLE_ALPHA_TO_COVERAGE = 0x809E
var GL_SAMPLE_COVERAGE = 0x80A0

var GL_FLOAT = 5126
var GL_FLOAT_VEC2 = 35664
var GL_FLOAT_VEC3 = 35665
var GL_FLOAT_VEC4 = 35666
var GL_INT = 5124
var GL_INT_VEC2 = 35667
var GL_INT_VEC3 = 35668
var GL_INT_VEC4 = 35669
var GL_BOOL = 35670
var GL_BOOL_VEC2 = 35671
var GL_BOOL_VEC3 = 35672
var GL_BOOL_VEC4 = 35673
var GL_FLOAT_MAT2 = 35674
var GL_FLOAT_MAT3 = 35675
var GL_FLOAT_MAT4 = 35676
var GL_SAMPLER_2D = 35678
var GL_SAMPLER_CUBE = 35680

var GL_TRIANGLES = 4

var GL_FRONT = 1028
var GL_BACK = 1029
var GL_CW = 0x0900
var GL_CCW = 0x0901
var GL_MIN_EXT = 0x8007
var GL_MAX_EXT = 0x8008
var GL_ALWAYS = 519
var GL_KEEP = 7680
var GL_ZERO = 0
var GL_ONE = 1
var GL_FUNC_ADD = 0x8006
var GL_LESS = 513

var GL_FRAMEBUFFER = 0x8D40
var GL_COLOR_ATTACHMENT0 = 0x8CE0

var blendFuncs = {
  '0': 0,
  '1': 1,
  'zero': 0,
  'one': 1,
  'src color': 768,
  'one minus src color': 769,
  'src alpha': 770,
  'one minus src alpha': 771,
  'dst color': 774,
  'one minus dst color': 775,
  'dst alpha': 772,
  'one minus dst alpha': 773,
  'constant color': 32769,
  'one minus constant color': 32770,
  'constant alpha': 32771,
  'one minus constant alpha': 32772,
  'src alpha saturate': 776
}

var compareFuncs = {
  'never': 512,
  'less': 513,
  '<': 513,
  'equal': 514,
  '=': 514,
  '==': 514,
  '===': 514,
  'lequal': 515,
  '<=': 515,
  'greater': 516,
  '>': 516,
  'notequal': 517,
  '!=': 517,
  '!==': 517,
  'gequal': 518,
  '>=': 518,
  'always': 519
}

var stencilOps = {
  '0': 0,
  'zero': 0,
  'keep': 7680,
  'replace': 7681,
  'increment': 7682,
  'decrement': 7683,
  'increment wrap': 34055,
  'decrement wrap': 34056,
  'invert': 5386
}

var shaderType = {
  'frag': GL_FRAGMENT_SHADER,
  'vert': GL_VERTEX_SHADER
}

var orientationType = {
  'cw': GL_CW,
  'ccw': GL_CCW
}

function isBufferArgs (x) {
  return Array.isArray(x) ||
    isTypedArray(x) ||
    isNDArray(x)
}

// Make sure viewport is processed first
function sortState (state) {
  return state.sort(function (a, b) {
    if (a === S_VIEWPORT) {
      return -1
    } else if (b === S_VIEWPORT) {
      return 1
    }
    return (a < b) ? -1 : 1
  })
}

function Declaration (thisDep, contextDep, propDep, append) {
  this.thisDep = thisDep
  this.contextDep = contextDep
  this.propDep = propDep
  this.append = append
}

function isStatic (decl) {
  return decl && !(decl.thisDep || decl.contextDep || decl.propDep)
}

function createStaticDecl (append) {
  return new Declaration(false, false, false, append)
}

function createDynamicDecl (dyn, append) {
  var type = dyn.type
  if (type === DYN_FUNC) {
    var numArgs = dyn.data.length
    return new Declaration(
      true,
      numArgs >= 1,
      numArgs >= 2,
      append)
  } else {
    return new Declaration(
      type === DYN_STATE,
      type === DYN_CONTEXT,
      type === DYN_PROP,
      append)
  }
}

var SCOPE_DECL = new Declaration(false, false, false, function () {})

module.exports = function reglCore (
  gl,
  stringStore,
  extensions,
  limits,
  bufferState,
  elementState,
  textureState,
  framebufferState,
  uniformState,
  attributeState,
  shaderState,
  drawState,
  contextState) {
  var AttributeRecord = attributeState.Record

  var blendEquations = {
    'add': 32774,
    'subtract': 32778,
    'reverse subtract': 32779
  }
  if (extensions.ext_blend_minmax) {
    blendEquations.min = GL_MIN_EXT
    blendEquations.max = GL_MAX_EXT
  }

  var extInstancing = extensions.angle_instanced_arrays
  var extDrawBuffers = extensions.webgl_draw_buffers

  // ===================================================
  // ===================================================
  // WEBGL STATE
  // ===================================================
  // ===================================================
  var currentState = {
    dirty: true
  }
  var nextState = {}
  var GL_STATE_NAMES = []
  var GL_FLAGS = {}
  var GL_VARIABLES = {}

  function propName (name) {
    return name.replace('.', '_')
  }

  function stateFlag (sname, cap, init) {
    var name = propName(sname)
    GL_STATE_NAMES.push(sname)
    nextState[name] = currentState[name] = !!init
    GL_FLAGS[name] = cap
  }

  function stateVariable (sname, func, init) {
    var name = propName(sname)
    GL_STATE_NAMES.push(sname)
    if (Array.isArray(init)) {
      currentState[name] = init.slice()
      nextState[name] = init.slice()
    } else {
      currentState[name] = nextState[name] = init
    }
    GL_VARIABLES[name] = func
  }

  // Dithering
  stateFlag(S_DITHER, GL_DITHER)

  // Blending
  stateFlag(S_BLEND_ENABLE, GL_BLEND)
  stateVariable(S_BLEND_COLOR, 'blendColor', [0, 0, 0, 0])
  stateVariable(S_BLEND_EQUATION, 'blendEquationSeparate',
    [GL_FUNC_ADD, GL_FUNC_ADD])
  stateVariable(S_BLEND_FUNC, 'blendFuncSeparate',
    [GL_ONE, GL_ZERO, GL_ONE, GL_ZERO])

  // Depth
  stateFlag(S_DEPTH_ENABLE, GL_DEPTH_TEST, true)
  stateVariable(S_DEPTH_FUNC, 'depthFunc', GL_LESS)
  stateVariable(S_DEPTH_RANGE, 'depthRange', [0, 1])
  stateVariable(S_DEPTH_MASK, 'depthMask', true)

  // Color mask
  stateVariable(S_COLOR_MASK, S_COLOR_MASK, [true, true, true, true])

  // Face culling
  stateFlag(S_CULL_ENABLE, GL_CULL_FACE)
  stateVariable(S_CULL_FACE, 'cullFace', GL_BACK)

  // Front face orientation
  stateVariable(S_FRONT_FACE, S_FRONT_FACE, GL_CCW)

  // Line width
  stateVariable(S_LINE_WIDTH, S_LINE_WIDTH, 1)

  // Polygon offset
  stateFlag(S_POLYGON_OFFSET_ENABLE, GL_POLYGON_OFFSET_FILL)
  stateVariable(S_POLYGON_OFFSET_OFFSET, 'polygonOffset', [0, 0])

  // Sample coverage
  stateFlag(S_SAMPLE_ALPHA, GL_SAMPLE_ALPHA_TO_COVERAGE)
  stateFlag(S_SAMPLE_ENABLE, GL_SAMPLE_COVERAGE)
  stateVariable(S_SAMPLE_COVERAGE, 'sampleCoverage', [1, false])

  // Stencil
  stateFlag(S_STENCIL_ENABLE, GL_STENCIL_TEST)
  stateVariable(S_STENCIL_MASK, 'stencilMask', -1)
  stateVariable(S_STENCIL_FUNC, 'stencilFunc', [GL_ALWAYS, 0, -1])
  stateVariable(S_STENCIL_OPFRONT, 'stencilOpSeparate',
    [GL_FRONT, GL_KEEP, GL_KEEP, GL_KEEP])
  stateVariable(S_STENCIL_OPBACK, 'stencilOpSeparate',
    [GL_BACK, GL_KEEP, GL_KEEP, GL_KEEP])

  // Scissor
  stateFlag(S_SCISSOR_ENABLE, GL_SCISSOR_TEST)
  stateVariable(S_SCISSOR_BOX, 'scissor',
    [0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight])

  // Viewport
  stateVariable(S_VIEWPORT, S_VIEWPORT,
    [0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight])

  // ===================================================
  // ===================================================
  // ENVIRONMENT
  // ===================================================
  // ===================================================
  var sharedState = {
    gl: gl,
    context: contextState,
    strings: stringStore,
    next: nextState,
    current: currentState,
    draw: drawState,
    elements: elementState,
    buffer: bufferState,
    shader: shaderState,
    attributes: attributeState.state,
    uniforms: uniformState,
    framebuffer: framebufferState,
    extensions: extensions,

    isBufferArgs: isBufferArgs
  }

  var sharedConstants = {
    primTypes: primTypes,
    compareFuncs: compareFuncs,
    blendFuncs: blendFuncs,
    blendEquations: blendEquations,
    stencilOps: stencilOps,
    glTypes: glTypes,
    orientationType: orientationType
  }

  if (extDrawBuffers) {
    sharedConstants.backBuffer = [GL_BACK]
    sharedConstants.drawBuffer = loop(limits.maxDrawbuffers, function (i) {
      return loop(i, function (j) {
        return GL_COLOR_ATTACHMENT0 + j
      })
    })
  }

  var drawCallCounter = 0
  function createREGLEnvironment () {
    var env = createEnvironment()
    var link = env.link
    var global = env.global
    env.id = drawCallCounter++

    env.batchId = '0'

    // link shared state
    var SHARED = link(sharedState)
    var shared = env.shared = {
      props: 'a0'
    }
    Object.keys(sharedState).forEach(function (prop) {
      shared[prop] = global.def(SHARED, '.', prop)
    })

    // Inject runtime assertion stuff for debug builds
    

    // Copy GL state variables over
    var nextVars = env.next = {}
    var currentVars = env.current = {}
    Object.keys(GL_VARIABLES).forEach(function (variable) {
      if (Array.isArray(currentState[variable])) {
        nextVars[variable] = global.def(shared.next, '.', variable)
        currentVars[variable] = global.def(shared.current, '.', variable)
      }
    })

    // Initialize shared constants
    var constants = env.constants = {}
    Object.keys(sharedConstants).forEach(function (name) {
      constants[name] = global.def(JSON.stringify(sharedConstants[name]))
    })

    // Helper function for calling a block
    env.invoke = function (block, x) {
      switch (x.type) {
        case DYN_FUNC:
          var argList = [
            'this',
            shared.context,
            shared.props,
            env.batchId
          ]
          return block.def(
            link(x.data), '.call(',
              argList.slice(0, Math.max(x.data.length + 1, 4)),
             ')')
        case DYN_PROP:
          return block.def(shared.props, x.data)
        case DYN_CONTEXT:
          return block.def(shared.context, x.data)
        case DYN_STATE:
          return block.def('this', x.data)
      }
    }

    env.attribCache = {}

    var scopeAttribs = {}
    env.scopeAttrib = function (name) {
      var id = stringStore.id(name)
      if (id in scopeAttribs) {
        return scopeAttribs[id]
      }
      var binding = attributeState.scope[id]
      if (!binding) {
        binding = attributeState.scope[id] = new AttributeRecord()
      }
      var result = scopeAttribs[id] = link(binding)
      return result
    }

    return env
  }

  // ===================================================
  // ===================================================
  // PARSING
  // ===================================================
  // ===================================================
  function parseFramebuffer (options) {
    var staticOptions = options.static
    var dynamicOptions = options.dynamic

    if (S_FRAMEBUFFER in staticOptions) {
      var framebuffer = staticOptions[S_FRAMEBUFFER]
      if (framebuffer) {
        framebuffer = framebufferState.getFramebuffer(framebuffer)
        
        return createStaticDecl(function (env, block) {
          var FRAMEBUFFER = env.link(framebuffer)
          var shared = env.shared
          block.set(
            shared.framebuffer,
            '.next',
            FRAMEBUFFER)
          var CONTEXT = shared.context
          block.set(
            CONTEXT,
            '.' + S_FRAMEBUFFER_WIDTH,
            FRAMEBUFFER + '.width')
          block.set(
            CONTEXT,
            '.' + S_FRAMEBUFFER_HEIGHT,
            FRAMEBUFFER + '.height')
          return FRAMEBUFFER
        })
      } else {
        return createStaticDecl(function (env, scope) {
          var shared = env.shared
          scope.set(
            shared.framebuffer,
            '.next',
            'null')
          var CONTEXT = shared.context
          scope.set(
            CONTEXT,
            '.' + S_FRAMEBUFFER_WIDTH,
            CONTEXT + '.' + S_DRAWINGBUFFER_WIDTH)
          scope.set(
            CONTEXT,
            '.' + S_FRAMEBUFFER_HEIGHT,
            CONTEXT + '.' + S_DRAWINGBUFFER_HEIGHT)
          return null
        })
      }
    } else if (S_FRAMEBUFFER in dynamicOptions) {
      var dyn = dynamicOptions[S_FRAMEBUFFER]
      return createDynamicDecl(dyn, function (env, scope) {
        var FRAMEBUFFER_FUNC = env.invoke(scope, dyn)
        var shared = env.shared
        var FRAMEBUFFER_STATE = shared.framebuffer
        var FRAMEBUFFER = scope.def(
          FRAMEBUFFER_STATE, '.getFramebuffer(', FRAMEBUFFER_FUNC, ')')

        

        scope.set(
          FRAMEBUFFER_STATE,
          '.next',
          FRAMEBUFFER)
        var CONTEXT = shared.context
        scope.set(
          CONTEXT,
          '.' + S_FRAMEBUFFER_WIDTH,
          FRAMEBUFFER + '?' + FRAMEBUFFER + '.width:' +
          CONTEXT + '.' + S_DRAWINGBUFFER_WIDTH)
        scope.set(
          CONTEXT,
          '.' + S_FRAMEBUFFER_HEIGHT,
          FRAMEBUFFER +
          '?' + FRAMEBUFFER + '.height:' +
          CONTEXT + '.' + S_DRAWINGBUFFER_HEIGHT)
        return FRAMEBUFFER
      })
    } else {
      return null
    }
  }

  function parseViewportScissor (options, framebuffer) {
    var staticOptions = options.static
    var dynamicOptions = options.dynamic

    function parseBox (param) {
      if (param in staticOptions) {
        var box = staticOptions[param]
        

        var isStatic = true
        var x = box.x | 0
        var y = box.y | 0
        var w, h
        if ('w' in box) {
          w = box.w | 0
          
        } else {
          isStatic = false
        }
        if ('h' in box) {
          h = box.h | 0
          
        } else {
          isStatic = false
        }

        return new Declaration(
          isStatic && framebuffer && framebuffer.thisDep,
          isStatic && framebuffer && framebuffer.contextDep,
          isStatic && framebuffer && framebuffer.propDep,
          function (env, scope) {
            var CONTEXT = env.shared.context
            var BOX_W = w
            if (!('w' in box)) {
              BOX_W = scope.def(CONTEXT, '.', S_FRAMEBUFFER_WIDTH, '-', x)
            }
            var BOX_H = h
            if (!('h' in box)) {
              BOX_H = scope.def(CONTEXT, '.', S_FRAMEBUFFER_HEIGHT, '-', y)
            }
            return [x, y, BOX_W, BOX_H]
          })
      } else if (param in dynamicOptions) {
        var dynBox = dynamicOptions[param]
        var result = createDynamicDecl(dynBox, function (env, scope) {
          var BOX = env.invoke(scope, dynBox)

          

          var CONTEXT = env.shared.context
          var BOX_X = scope.def(BOX, '.x|0')
          var BOX_Y = scope.def(BOX, '.y|0')
          var BOX_W = scope.def(
            '"w" in ', BOX, '?', BOX, '.w|0:',
            '(', CONTEXT, '.', S_FRAMEBUFFER_WIDTH, '-', BOX_X, ')')
          var BOX_H = scope.def(
            '"h" in ', BOX, '?', BOX, '.h|0:',
            '(', CONTEXT, '.', S_FRAMEBUFFER_HEIGHT, '-', BOX_Y, ')')

          

          return [BOX_X, BOX_Y, BOX_W, BOX_H]
        })
        if (framebuffer) {
          result.thisDep = result.thisDep || framebuffer.thisDep
          result.contextDep = result.contextDep || framebuffer.contextDep
          result.propDep = result.propDep || framebuffer.prpoDep
        }
        return result
      } else if (framebuffer) {
        return new Declaration(
          framebuffer.thisDep,
          framebuffer.contextDep,
          framebuffer.propDep,
          function (env, scope) {
            var CONTEXT = env.shared.context
            return [
              0, 0,
              scope.def(CONTEXT, '.', S_FRAMEBUFFER_WIDTH),
              scope.def(CONTEXT, '.', S_FRAMEBUFFER_HEIGHT)]
          })
      } else {
        return null
      }
    }

    var viewport = parseBox(S_VIEWPORT)

    if (viewport) {
      var prevViewport = viewport
      viewport = new Declaration(
        viewport.thisDep,
        viewport.contextDep,
        viewport.propDep,
        function (env, scope) {
          var VIEWPORT = prevViewport.append(env, scope)
          var CONTEXT = env.shared.context
          scope.set(
            CONTEXT,
            '.' + S_VIEWPORT_WIDTH,
            VIEWPORT[2])
          scope.set(
            CONTEXT,
            '.' + S_VIEWPORT_HEIGHT,
            VIEWPORT[3])
          return VIEWPORT
        })
    }

    return {
      viewport: viewport,
      scissor_box: parseBox(S_SCISSOR_BOX)
    }
  }

  function parseProgram (options) {
    var staticOptions = options.static
    var dynamicOptions = options.dynamic

    function parseShader (name) {
      if (name in staticOptions) {
        var id = stringStore.id(staticOptions[name])
        
        var result = createStaticDecl(function () {
          return id
        })
        result.id = id
        return result
      } else if (name in dynamicOptions) {
        var dyn = dynamicOptions[name]
        return createDynamicDecl(dyn, function (env, scope) {
          var str = env.invoke(scope, dyn)
          var id = scope.def(env.shared.strings, '.id(', str, ')')
          
          return id
        })
      }
      return null
    }

    var frag = parseShader(S_FRAG)
    var vert = parseShader(S_VERT)

    var program = null
    var progVar
    if (isStatic(frag) && isStatic(vert)) {
      program = shaderState.program(vert.id, frag.id)
      progVar = createStaticDecl(function (env, scope) {
        return env.link(program)
      })
    } else {
      progVar = new Declaration(
        (frag && frag.thisDep) || (vert && vert.thisDep),
        (frag && frag.contextDep) || (vert && vert.contextDep),
        (frag && frag.propDep) || (vert && vert.propDep),
        function (env, scope) {
          var SHADER_STATE = env.shared.shader
          var fragId
          if (frag) {
            fragId = frag.append(env, scope)
          } else {
            fragId = scope.def(SHADER_STATE, '.', S_FRAG)
          }
          var vertId
          if (vert) {
            vertId = vert.append(env, scope)
          } else {
            vertId = scope.def(SHADER_STATE, '.', S_VERT)
          }
          var progDef = SHADER_STATE + '.program(' + vertId + ',' + fragId
          
          return scope.def(progDef + ')')
        })
    }

    return {
      frag: frag,
      vert: vert,
      progVar: progVar,
      program: program
    }
  }

  function parseDraw (options) {
    var staticOptions = options.static
    var dynamicOptions = options.dynamic

    function parseElements () {
      if (S_ELEMENTS in staticOptions) {
        var elements = staticOptions[S_ELEMENTS]
        if (isBufferArgs(elements)) {
          elements = elementState.getElements(elementState.create(elements))
        } else if (elements) {
          elements = elementState.getElements(elements)
          
        }
        var result = createStaticDecl(function (env, scope) {
          if (elements) {
            var result = env.link(elements)
            env.ELEMENTS = result
            return result
          }
          env.ELEMENTS = null
          return null
        })
        result.value = elements
        return result
      } else if (S_ELEMENTS in dynamicOptions) {
        var dyn = dynamicOptions[S_ELEMENTS]
        return createDynamicDecl(dyn, function (env, scope) {
          var shared = env.shared

          var IS_BUFFER_ARGS = shared.isBufferArgs
          var ELEMENT_STATE = shared.elements

          var elementDefn = env.invoke(scope, dyn)
          var elements = scope.def('null')
          var elementStream = scope.def(IS_BUFFER_ARGS, '(', elementDefn, ')')

          var ifte = env.cond(elementStream)
            .then(elements, '=', ELEMENT_STATE, '.createStream(', elementDefn, ');')
            .else(elements, '=', ELEMENT_STATE, '.getElements(', elementDefn, ');')

          

          scope.entry(ifte)
          scope.exit(
            env.cond(elementStream)
              .then(ELEMENT_STATE, '.destroyStream(', elements, ');'))

          env.ELEMENTS = elements

          return elements
        })
      }

      return null
    }

    var elements = parseElements()

    function parsePrimitive () {
      if (S_PRIMITIVE in staticOptions) {
        var primitive = staticOptions[S_PRIMITIVE]
        
        return createStaticDecl(function (env, scope) {
          return primTypes[primitive]
        })
      } else if (S_PRIMITIVE in dynamicOptions) {
        var dynPrimitive = dynamicOptions[S_PRIMITIVE]
        return createDynamicDecl(dynPrimitive, function (env, scope) {
          var PRIM_TYPES = env.constants.primTypes
          var prim = env.invoke(scope, dynPrimitive)
          
          return scope.def(PRIM_TYPES, '[', prim, ']')
        })
      } else if (elements) {
        if (isStatic(elements)) {
          if (elements.value) {
            return createStaticDecl(function (env, scope) {
              return scope.def(env.ELEMENTS, '.primType')
            })
          } else {
            return createStaticDecl(function () {
              return GL_TRIANGLES
            })
          }
        } else {
          return new Declaration(
            elements.thisDep,
            elements.contextDep,
            elements.propDep,
            function (env, scope) {
              var elements = env.ELEMENTS
              return scope.def(elements, '?', elements, '.primType:', GL_TRIANGLES)
            })
        }
      }
      return null
    }

    function parseParam (param, isOffset) {
      if (param in staticOptions) {
        var value = staticOptions[param] | 0
        
        return createStaticDecl(function (env, scope) {
          if (isOffset) {
            env.OFFSET = value
          }
          return value
        })
      } else if (param in dynamicOptions) {
        var dynValue = dynamicOptions[param]
        return createDynamicDecl(dynValue, function (env, scope) {
          var result = env.invoke(scope, dynValue)
          if (isOffset) {
            env.OFFSET = result
            
          }
          return result
        })
      } else if (isOffset && elements) {
        return createStaticDecl(function (env, scope) {
          env.OFFSET = '0'
          return 0
        })
      }
      return null
    }

    var OFFSET = parseParam(S_OFFSET, true)

    function parseVertCount () {
      if (S_COUNT in staticOptions) {
        var count = staticOptions[S_COUNT] | 0
        
        return createStaticDecl(function () {
          return count
        })
      } else if (S_COUNT in dynamicOptions) {
        var dynCount = dynamicOptions[S_COUNT]
        return createDynamicDecl(dynCount, function (env, scope) {
          var result = env.invoke(scope, dynCount)
          
          return result
        })
      } else if (elements) {
        if (isStatic(elements)) {
          if (elements) {
            if (OFFSET) {
              return new Declaration(
                OFFSET.thisDep,
                OFFSET.contextDep,
                OFFSET.propDep,
                function (env, scope) {
                  var result = scope.def(
                    env.ELEMENTS, '.vertCount-', env.OFFSET)

                  

                  return result
                })
            } else {
              return createStaticDecl(function (env, scope) {
                return scope.def(env.ELEMENTS, '.vertCount')
              })
            }
          } else {
            var result = createStaticDecl(function () {
              return -1
            })
            
            return result
          }
        } else {
          var variable = new Declaration(
            elements.thisDep || OFFSET.thisDep,
            elements.contextDep || OFFSET.contextDep,
            elements.propDep || OFFSET.propDep,
            function (env, scope) {
              var elements = env.ELEMENTS
              if (env.OFFSET) {
                return scope.def(elements, '?', elements, '.vertCount-',
                  env.OFFSET, ':-1')
              }
              return scope.def(elements, '?', elements, '.vertCount:-1')
            })
          
          return variable
        }
      }
      return null
    }

    return {
      elements: elements,
      primitive: parsePrimitive(),
      count: parseVertCount(),
      instances: parseParam(S_INSTANCES, false),
      offset: OFFSET
    }
  }

  function parseGLState (options) {
    var staticOptions = options.static
    var dynamicOptions = options.dynamic

    var STATE = {}

    GL_STATE_NAMES.forEach(function (prop) {
      var param = propName(prop)

      function parseParam (parseStatic, parseDynamic) {
        if (prop in staticOptions) {
          var value = parseStatic(staticOptions[prop])
          STATE[param] = createStaticDecl(function () {
            return value
          })
        } else if (prop in dynamicOptions) {
          var dyn = dynamicOptions[prop]
          STATE[param] = createDynamicDecl(dyn, function (env, scope) {
            return parseDynamic(env, scope, env.invoke(scope, dyn))
          })
        }
      }

      switch (prop) {
        case S_CULL_ENABLE:
        case S_BLEND_ENABLE:
        case S_DITHER:
        case S_STENCIL_ENABLE:
        case S_DEPTH_ENABLE:
        case S_SCISSOR_ENABLE:
        case S_POLYGON_OFFSET_ENABLE:
        case S_SAMPLE_ALPHA:
        case S_SAMPLE_ENABLE:
        case S_DEPTH_MASK:
          return parseParam(
            function (value) {
              
              return value
            },
            function (env, scope, value) {
              
              return value
            })

        case S_DEPTH_FUNC:
          return parseParam(
            function (value) {
              
              return compareFuncs[value]
            },
            function (env, scope, value) {
              var COMPARE_FUNCS = env.constants.compareFuncs
              
              return scope.def(COMPARE_FUNCS, '[', value, ']')
            })

        case S_DEPTH_RANGE:
          return parseParam(
            function (value) {
              
              return value
            },
            function (env, scope, value) {
              

              var Z_NEAR = scope.def('+', value, '[0]')
              var Z_FAR = scope.def('+', value, '[1]')
              return [Z_NEAR, Z_FAR]
            })

        case S_BLEND_FUNC:
          return parseParam(
            function (value) {
              
              var srcRGB = ('srcRGB' in value ? value.srcRGB : value.src)
              var srcAlpha = ('srcAlpha' in value ? value.srcAlpha : value.src)
              var dstRGB = ('dstRGB' in value ? value.dstRGB : value.dst)
              var dstAlpha = ('dstAlpha' in value ? value.dstAlpha : value.dst)
              
              
              
              
              return [
                blendFuncs[srcRGB],
                blendFuncs[dstRGB],
                blendFuncs[srcAlpha],
                blendFuncs[dstAlpha]
              ]
            },
            function (env, scope, value) {
              var BLEND_FUNCS = env.constants.blendFuncs

              

              function read (prefix, suffix) {
                var func = scope.def(
                  '"', prefix, suffix, '" in ', value,
                  '?', value, '.', prefix, suffix,
                  ':', value, '.', prefix)

                

                return scope.def(BLEND_FUNCS, '[', func, ']')
              }

              var SRC_RGB = read('src', 'RGB')
              var SRC_ALPHA = read('src', 'Alpha')
              var DST_RGB = read('dst', 'RGB')
              var DST_ALPHA = read('dst', 'Alpha')

              return [SRC_RGB, DST_RGB, SRC_ALPHA, DST_ALPHA]
            })

        case S_BLEND_EQUATION:
          return parseParam(
            function (value) {
              if (typeof value === 'string') {
                
                return [
                  blendEquations[value],
                  blendEquations[value]
                ]
              } else if (typeof value === 'object') {
                
                
                return [
                  blendEquations[value.rgb],
                  blendEquations[value.alpha]
                ]
              } else {
                
              }
            },
            function (env, scope, value) {
              var BLEND_EQUATIONS = env.constants.blendEquations

              var RGB = scope.def()
              var ALPHA = scope.def()

              var ifte = env.cond('typeof ', value, '==="string"')

              

              ifte.then(
                RGB, '=', ALPHA, '=', BLEND_EQUATIONS, '[', value, '];')
              ifte.else(
                RGB, '=', BLEND_EQUATIONS, '[', value, '.rgb];',
                ALPHA, '=', BLEND_EQUATIONS, '[', value, '.alpha];')

              scope(ifte)

              return [RGB, ALPHA]
            })

        case S_BLEND_COLOR:
          return parseParam(
            function (value) {
              
              return loop(4, function (i) {
                return +value[i]
              })
            },
            function (env, scope, value) {
              
              return loop(4, function (i) {
                return scope.def('+', value, '[', i, ']')
              })
            })

        case S_STENCIL_MASK:
          return parseParam(
            function (value) {
              
              return value | 0
            },
            function (env, scope, value) {
              
              return scope.def(value, '|0')
            })

        case S_STENCIL_FUNC:
          return parseParam(
            function (value) {
              
              var cmp = value.cmp || 'keep'
              var ref = value.ref || 0
              var mask = 'mask' in value ? value.mask : -1
              
              
              
              return [
                compareFuncs[cmp],
                ref,
                mask
              ]
            },
            function (env, scope, value) {
              var COMPARE_FUNCS = env.constants.compareFuncs
              
              var cmp = scope.def(
                '"cmp" in ', value,
                '?', COMPARE_FUNCS, '[', value, '.cmp]',
                ':', GL_KEEP)
              var ref = scope.def(value, '.ref|0')
              var mask = scope.def(
                '"mask" in ', value,
                '?', value, '.mask|0:-1')
              return [cmp, ref, mask]
            })

        case S_STENCIL_OPFRONT:
        case S_STENCIL_OPBACK:
          return parseParam(
            function (value) {
              
              var fail = value.fail || 'keep'
              var zfail = value.zfail || 'keep'
              var pass = value.pass || 'keep'
              
              
              
              return [
                prop === S_STENCIL_OPBACK ? GL_BACK : GL_FRONT,
                stencilOps[fail],
                stencilOps[zfail],
                stencilOps[pass]
              ]
            },
            function (env, scope, value) {
              var STENCIL_OPS = env.constants.stencilOps

              

              function read (name) {
                

                return scope.def(
                  '"', name, '" in ', value,
                  '?', STENCIL_OPS, '[', value, '.', name, ']:',
                  GL_KEEP)
              }

              return [
                prop === S_STENCIL_OPBACK ? GL_BACK : GL_FRONT,
                read('fail'),
                read('zfail'),
                read('pass')
              ]
            })

        case S_POLYGON_OFFSET_OFFSET:
          return parseParam(
            function (value) {
              
              var factor = value.factor | 0
              var units = value.units | 0
              
              
              return [factor, units]
            },
            function (env, scope, value) {
              

              var FACTOR = scope.def(value, '.factor|0')
              var UNITS = scope.def(value, '.units|0')

              return [FACTOR, UNITS]
            })

        case S_CULL_FACE:
          return parseParam(
            function (value) {
              var face = 0
              if (value === 'front') {
                face = GL_FRONT
              } else if (value === 'back') {
                face = GL_BACK
              }
              
              return face
            },
            function (env, scope, value) {
              
              return scope.def(value, '==="front"?', GL_FRONT, ':', GL_BACK)
            })

        case S_LINE_WIDTH:
          return parseParam(
            function (value) {
              
              return value
            },
            function (env, scope, value) {
              

              return value
            })

        case S_FRONT_FACE:
          return parseParam(
            function (value) {
              
              return orientationType[value]
            },
            function (env, scope, value) {
              
              return scope.def(value + '==="cw"?' + GL_CW + ':' + GL_CCW)
            })

        case S_COLOR_MASK:
          return parseParam(
            function (value) {
              
              return value.map(function (v) { return !!v })
            },
            function (env, scope, value) {
              
              return loop(4, function (i) {
                return '!!' + value + '[' + i + ']'
              })
            })

        case S_SAMPLE_COVERAGE:
          return parseParam(
            function (value) {
              
              var sampleValue = 'value' in value ? value.value : 1
              var sampleInvert = !!value.invert
              
              return [sampleValue, sampleInvert]
            },
            function (env, scope, value) {
              
              var VALUE = scope.def(
                '"value" in ', value, '?+', value, '.value:1')
              var INVERT = scope.def('!!', value, '.invert')
              return [VALUE, INVERT]
            })
      }
    })

    return STATE
  }

  function parseOptions (options) {
    var staticOptions = options.static
    var dynamicOptions = options.dynamic

    

    var framebuffer = parseFramebuffer(options)
    var viewportAndScissor = parseViewportScissor(options, framebuffer)
    var draw = parseDraw(options)
    var state = parseGLState(options)
    var shader = parseProgram(options)

    function copyBox (name) {
      var defn = viewportAndScissor[name]
      if (defn) {
        state[name] = defn
      }
    }
    copyBox(S_VIEWPORT)
    copyBox(propName(S_SCISSOR_BOX))

    var dirty = Object.keys(state).length > 0

    return {
      framebuffer: framebuffer,
      draw: draw,
      shader: shader,
      state: state,
      dirty: dirty
    }
  }

  function parseUniforms (uniforms) {
    var staticUniforms = uniforms.static
    var dynamicUniforms = uniforms.dynamic

    var UNIFORMS = {}

    Object.keys(staticUniforms).forEach(function (name) {
      var value = staticUniforms[name]
      var result
      if (typeof value === 'number' ||
          typeof value === 'boolean') {
        result = createStaticDecl(function () {
          return value
        })
      } else if (
        typeof value === 'function' &&
        value._reglType === 'texture') {
        result = createStaticDecl(function (env) {
          return env.link(value)
        })
      } else if (Array.isArray(value) || isTypedArray(value)) {
        result = createStaticDecl(function (env) {
          var ITEM = env.global.def('[',
            loop(value.length, function (i) {
              
              return value[i]
            }), ']')
          return ITEM
        })
      } else {
        
      }
      result.value = value
      UNIFORMS[name] = result
    })

    Object.keys(dynamicUniforms).forEach(function (key) {
      var dyn = dynamicUniforms[key]
      UNIFORMS[key] = createDynamicDecl(dyn, function (env, scope) {
        return env.invoke(scope, dyn)
      })
    })

    return UNIFORMS
  }

  function parseAttributes (attributes) {
    var staticAttributes = attributes.static
    var dynamicAttributes = attributes.dynamic

    var attributeDefs = {}

    Object.keys(staticAttributes).forEach(function (attribute) {
      var value = staticAttributes[attribute]
      var id = stringStore.id(attribute)

      var record = new AttributeRecord()
      if (isBufferArgs(value)) {
        record.state = ATTRIB_STATE_POINTER
        record.buffer = bufferState.getBuffer(
          bufferState.create(value, GL_ARRAY_BUFFER, false))
        record.type = record.buffer.dtype
      } else {
        var buffer = bufferState.getBuffer(value)
        if (buffer) {
          record.state = ATTRIB_STATE_POINTER
          record.buffer = buffer
          record.type = buffer.dtype
        } else {
          
          if (value.constant) {
            var constant = value.constant
            record.state = ATTRIB_STATE_CONSTANT
            if (typeof constant === 'number') {
              record.x = constant
            } else {
              
              CUTE_COMPONENTS.forEach(function (c, i) {
                if (i < constant.length) {
                  record[c] = constant[i]
                }
              })
            }
          } else {
            buffer = bufferState.getBuffer(value.buffer)
            

            var offset = value.offset | 0
            

            var stride = value.stride | 0
            

            var size = value.size | 0
            

            var normalized = !!value.normalized

            var type = 0
            if ('type' in value) {
              
              type = glTypes[value.type]
            }

            var divisor = value.divisor | 0
            if ('divisor' in value) {
              
              
            }

            

            record.buffer = buffer
            record.state = ATTRIB_STATE_POINTER
            record.size = size
            record.normalized = normalized
            record.type = type || buffer.dtype
            record.offset = offset
            record.stride = stride
            record.divisor = divisor
          }
        }
      }

      attributeDefs[attribute] = createStaticDecl(function (env, scope) {
        var cache = env.attribCache
        if (id in cache) {
          return cache[id]
        }
        var result = {
          isStream: false
        }
        Object.keys(record).forEach(function (key) {
          result[key] = record[key]
        })
        if (record.buffer) {
          result.buffer = env.link(record.buffer)
        }
        cache[id] = result
        return result
      })
    })

    Object.keys(dynamicAttributes).forEach(function (attribute) {
      var dyn = dynamicAttributes[attribute]

      function appendAttributeCode (env, block) {
        var VALUE = env.invoke(block, dyn)

        var shared = env.shared

        var IS_BUFFER_ARGS = shared.isBufferArgs
        var BUFFER_STATE = shared.buffer

        // Perform validation on attribute
        

        // allocate names for result
        var result = {
          isStream: block.def(false)
        }
        var defaultRecord = new AttributeRecord()
        defaultRecord.state = ATTRIB_STATE_POINTER
        Object.keys(defaultRecord).forEach(function (key) {
          result[key] = block.def('' + defaultRecord[key])
        })

        var BUFFER = result.buffer
        var TYPE = result.type
        block(
          'if(', IS_BUFFER_ARGS, '(', VALUE, ')){',
          result.isStream, '=true;',
          BUFFER, '=', BUFFER_STATE, '.createStream(', GL_ARRAY_BUFFER, ',', VALUE, ');',
          TYPE, '=', BUFFER, '.dtype;',
          '}else{',
          BUFFER, '=', BUFFER_STATE, '.getBuffer(', VALUE, ');',
          'if(', BUFFER, '){',
          TYPE, '=', BUFFER, '.dtype;',
          '}else if(', VALUE, '.constant){',
          result.state, '=', ATTRIB_STATE_CONSTANT, ';',
          CUTE_COMPONENTS.map(function (name, i) {
            return (
              result[name] + '=' + VALUE + '.length>=' + i +
              '?' + VALUE + '[' + i + ']:0;'
            )
          }).join(''),
          '}else{',
          BUFFER, '=', BUFFER_STATE, '.getBuffer(', VALUE, '.buffer);',
          TYPE, '="type" in ', VALUE, '?',
          shared.glTypes, '[', VALUE, '.type]:', BUFFER, '.dtype;',
          result.normalized, '=!!', VALUE, '.normalized;')
        function emitReadRecord (name) {
          block(result[name], '=', VALUE, '.', name, '|0;')
        }
        emitReadRecord('size')
        emitReadRecord('offset')
        emitReadRecord('stride')
        emitReadRecord('divisor')

        block('}}')

        return result
      }

      attributeDefs[attribute] = createDynamicDecl(dyn, appendAttributeCode)
    })

    return attributeDefs
  }

  function parseContext (context) {
    var staticContext = context.static
    var dynamicContext = context.dynamic
    var result = {}

    Object.keys(staticContext).forEach(function (name) {
      var value = staticContext[name]
      result[name] = createStaticDecl(function (env, scope) {
        if (typeof value === 'number' || typeof value === 'boolean') {
          return '' + value
        } else {
          return env.link(value)
        }
      })
    })

    Object.keys(dynamicContext).forEach(function (name) {
      var dyn = dynamicContext[name]
      result[name] = createDynamicDecl(dyn, function (env, scope) {
        return env.invoke(scope, dyn)
      })
    })

    return result
  }

  function parseArguments (options, attributes, uniforms, context) {
    var result = parseOptions(options)
    result.uniforms = parseUniforms(uniforms)
    result.attributes = parseAttributes(attributes)
    result.context = parseContext(context)
    return result
  }

  // ===================================================
  // ===================================================
  // COMMON UPDATE FUNCTIONS
  // ===================================================
  // ===================================================
  function emitContext (env, scope, context) {
    var shared = env.shared
    var CONTEXT = shared.context

    var contextEnter = env.scope()

    Object.keys(context).forEach(function (name) {
      scope.save(CONTEXT, '.' + name)
      var defn = context[name]
      contextEnter(CONTEXT, '.', name, '=', defn.append(env, scope), ';')
    })

    scope(contextEnter)
  }

  // ===================================================
  // ===================================================
  // COMMON DRAWING FUNCTIONS
  // ===================================================
  // ===================================================
  function emitPollFramebuffer (env, scope, framebuffer) {
    var shared = env.shared

    var GL = shared.gl
    var FRAMEBUFFER_STATE = shared.framebuffer
    var EXT_DRAW_BUFFERS
    if (extDrawBuffers) {
      EXT_DRAW_BUFFERS = scope.def(shared.extensions, '.webgl_draw_buffers')
    }

    var constants = env.constants

    var DRAW_BUFFERS = constants.drawBuffers
    var BACK_BUFFER = constants.backBuffer

    var NEXT
    if (framebuffer) {
      NEXT = framebuffer.append(env, scope)
    } else {
      NEXT = scope.def(FRAMEBUFFER_STATE, '.next')
    }

    scope(
      'if(', FRAMEBUFFER_STATE, '.dirty||', NEXT, '!==', FRAMEBUFFER_STATE, '.cur){',
      'if(', NEXT, '){',
      GL, '.bindFramebuffer(', GL_FRAMEBUFFER, ',', NEXT, '.framebuffer);')
    if (extDrawBuffers) {
      scope(EXT_DRAW_BUFFERS, '.drawBuffersWEBGL(',
        DRAW_BUFFERS, '[', NEXT, '.colorAttachments.length]);')
    }
    scope('}else{',
      GL, '.bindFramebuffer(', GL_FRAMEBUFFER, ',null);')
    if (extDrawBuffers) {
      scope(EXT_DRAW_BUFFERS, '.drawBuffersWEBGL(', BACK_BUFFER, ');')
    }
    scope(
      '}',
      FRAMEBUFFER_STATE, '.cur=', NEXT, ';',
      FRAMEBUFFER_STATE, '.dirty=false;',
      '}')
  }

  function emitPollState (env, scope, args) {
    var shared = env.shared

    var GL = shared.gl

    var CURRENT_VARS = env.current
    var NEXT_VARS = env.next
    var CURRENT_STATE = shared.current
    var NEXT_STATE = shared.next

    var block = env.cond(CURRENT_STATE, '.dirty')

    GL_STATE_NAMES.forEach(function (prop) {
      var param = propName(prop)
      if (param in args.state) {
        return
      }

      var NEXT, CURRENT
      if (param in NEXT_VARS) {
        NEXT = NEXT_VARS[param]
        CURRENT = CURRENT_VARS[param]
        var parts = loop(currentState[param].length, function (i) {
          return block.def(NEXT, '[', i, ']')
        })
        block(env.cond(parts.map(function (p, i) {
          return p + '===' + CURRENT + '[' + i + ']'
        }).join('&&'))
          .then(
            GL, '.', GL_VARIABLES[param], '(', parts, ');',
            parts.map(function (p, i) {
              return CURRENT + '[' + i + ']=' + p
            }).join(';'), ';'))
      } else {
        NEXT = block.def(NEXT_STATE, '.', param)
        var ifte = env.cond(NEXT, '!==', CURRENT_STATE, '.', param)
        block(ifte)
        if (param in GL_FLAGS) {
          ifte(
            env.cond(NEXT)
                .then(GL, '.enable(', GL_FLAGS[param], ');')
                .else(GL, '.disable(', GL_FLAGS[param], ');'),
            CURRENT_STATE, '.', param, '=', NEXT, ';')
        } else {
          ifte(
            GL, '.', GL_VARIABLES[param], '(', NEXT, ');',
            CURRENT_STATE, '.', param, '=', NEXT, ';')
        }
      }
    })
    if (Object.keys(args.state).length === 0) {
      block(CURRENT_STATE, '.dirty=false;')
    }
    scope(block)
  }

  function emitSetOptions (env, scope, options, filter) {
    var shared = env.shared
    var CURRENT_VARS = env.current
    var CURRENT_STATE = shared.current
    var GL = shared.gl
    sortState(Object.keys(options)).forEach(function (param) {
      var defn = options[param]
      if (filter && !filter(defn)) {
        return
      }
      var variable = defn.append(env, scope)
      if (GL_FLAGS[param]) {
        var flag = GL_FLAGS[param]
        if (isStatic(defn)) {
          if (variable) {
            scope(GL, '.enable(', flag, ');')
          } else {
            scope(GL, '.disable(', flag, ');')
          }
        } else {
          scope(env.cond(variable)
            .then(GL, '.enable(', flag, ');')
            .else(GL, '.disable(', flag, ');'))
        }
        scope(CURRENT_STATE, '.', param, '=', variable, ';')
      } else if (Array.isArray(variable)) {
        var CURRENT = CURRENT_VARS[param]
        scope(
          GL, '.', GL_VARIABLES[param], '(', variable, ');',
          variable.map(function (v, i) {
            return CURRENT + '[' + i + ']=' + v
          }).join(';'), ';')
      } else {
        scope(
          GL, '.', GL_VARIABLES[param], '(', variable, ');',
          CURRENT_STATE, '.', param, '=', variable, ';')
      }
    })
  }

  function injectExtensions (env, scope) {
    if (extInstancing && !env.instancing) {
      env.instancing = scope.def(
        env.shared.extensions, '.angle_instanced_arrays')
    }
  }

  function emitAttributes (env, scope, args, attributes, filter) {
    var shared = env.shared

    function typeLength (x) {
      switch (x) {
        case GL_FLOAT_VEC2:
        case GL_INT_VEC2:
        case GL_BOOL_VEC2:
          return 2
        case GL_FLOAT_VEC3:
        case GL_INT_VEC3:
        case GL_BOOL_VEC3:
          return 3
        case GL_FLOAT_VEC4:
        case GL_INT_VEC4:
        case GL_BOOL_VEC4:
          return 4
        default:
          return 1
      }
    }

    function emitBindAttribute (ATTRIBUTE, size, record) {
      var GL = shared.gl

      var LOCATION = scope.def(ATTRIBUTE, '.location')
      var BINDING = scope.def(shared.attributes, '[', LOCATION, ']')

      var STATE = record.state
      var BUFFER = record.buffer
      var CONST_COMPONENTS = [
        record.x,
        record.y,
        record.z,
        record.w
      ]

      var COMMON_KEYS = [
        'buffer',
        'normalized',
        'offset',
        'stride'
      ]

      function emitBuffer () {
        scope(
          'if(!', BINDING, '.pointer){',
          GL, '.enableVertexAttribArray(', LOCATION, ');',
          BINDING, '.pointer=true;}')

        var TYPE = record.type
        var SIZE
        if (!record.size) {
          SIZE = size
        } else {
          SIZE = scope.def(record.size, '||', size)
        }

        scope('if(',
          BINDING, '.type!==', TYPE, '||',
          BINDING, '.size!==', SIZE, '||',
          COMMON_KEYS.map(function (key) {
            return BINDING + '.' + key + '!==' + record[key]
          }).join('||'),
          '){',
          GL, '.bindBuffer(', GL_ARRAY_BUFFER, ',', BUFFER, '.buffer);',
          GL, '.vertexAttribPointer(', [
            LOCATION,
            SIZE,
            TYPE,
            record.normalized,
            record.stride,
            record.offset
          ], ');',
          BINDING, '.type=', TYPE, ';',
          BINDING, '.size=', SIZE, ';',
          COMMON_KEYS.map(function (key) {
            return BINDING + '.' + key + '=' + record[key] + ';'
          }).join(''),
          '}')

        if (extInstancing) {
          var DIVISOR = record.divisor
          scope(
            'if(', BINDING, '.divisor!==', DIVISOR, '){',
            env.instancing, '.vertexAttribDivisorANGLE(', [LOCATION, DIVISOR], ');',
            BINDING, '.divisor=', DIVISOR, ';}')
        }
      }

      function emitConstant () {
        scope(
          'if(', BINDING, '.pointer){',
          GL, '.disableVertexAttribArray(', LOCATION, ');',
          BINDING, '.pointer=false;',
          '}if(', CUTE_COMPONENTS.map(function (c, i) {
            return BINDING + '.' + c + '!==' + CONST_COMPONENTS[i]
          }).join('||'), '){',
          GL, '.vertexAttrib4f(', LOCATION, ',', CONST_COMPONENTS, ');',
          CUTE_COMPONENTS.map(function (c, i) {
            return BINDING + '.' + c + '=' + CONST_COMPONENTS[i] + ';'
          }).join(''),
          '}')
      }

      if (STATE === ATTRIB_STATE_POINTER) {
        emitBuffer()
      } else if (STATE === ATTRIB_STATE_CONSTANT) {
        emitConstant()
      } else {
        scope('if(', STATE, '===', ATTRIB_STATE_POINTER, '){')
        emitBuffer()
        scope('}else{')
        emitConstant()
        scope('}')
      }
    }

    attributes.forEach(function (attribute) {
      var name = attribute.name
      var arg = args.attributes[name]
      var record
      if (arg) {
        if (!filter(arg)) {
          return
        }
        record = arg.append(env, scope)
      } else {
        if (!filter(SCOPE_DECL)) {
          return
        }
        var scopeAttrib = env.scopeAttrib(name)
        
        record = {}
        Object.keys(new AttributeRecord()).forEach(function (key) {
          record[key] = scope.def(scopeAttrib, '.', key)
        })
      }
      emitBindAttribute(
        env.link(attribute), typeLength(attribute.info.type), record)
    })
  }

  function emitUniforms (env, scope, args, uniforms, filter) {
    var shared = env.shared
    var GL = shared.gl

    var infix
    for (var i = 0; i < uniforms.length; ++i) {
      var uniform = uniforms[i]
      var name = uniform.name
      var type = uniform.info.type
      var arg = args.uniforms[name]
      var UNIFORM = env.link(uniform)
      var LOCATION = UNIFORM + '.location'

      var VALUE
      if (arg) {
        if (!filter(arg)) {
          continue
        }
        if (arg.static) {
          var value = arg.value
          if (type === GL_SAMPLER_2D || type === GL_SAMPLER_CUBE) {
            
            var TEX_VALUE = env.link(value._texture)
            scope(GL, '.uniform1i(', LOCATION, TEX_VALUE + '.bind());')
            scope.exit(TEX_VALUE, '.unbind()')
          } else if (
            type === GL_FLOAT_MAT2 ||
            type === GL_FLOAT_MAT3 ||
            type === GL_FLOAT_MAT4) {
            
            var MAT_VALUE = env.global.def('[' + value + ']')
            var dim = 2
            if (type === GL_FLOAT_MAT3) {
              dim = 3
            } else if (type === GL_FLOAT_MAT4) {
              dim = 4
            }
            scope(
              GL, '.uniformMatrix', dim, 'fv(',
              LOCATION, ',false,', MAT_VALUE, ');')
          } else {
            switch (type) {
              case GL_FLOAT:
                
                infix = '1f'
                break
              case GL_FLOAT_VEC2:
                
                infix = '2f'
                break
              case GL_FLOAT_VEC3:
                
                infix = '3f'
                break
              case GL_FLOAT_VEC4:
                
                infix = '4f'
                break
              case GL_BOOL:
                
                infix = '1i'
                break
              case GL_INT:
                
                infix = '1i'
                break
              case GL_BOOL_VEC2:
                
                infix = '2i'
                break
              case GL_INT_VEC2:
                
                infix = '2i'
                break
              case GL_BOOL_VEC3:
                
                infix = '3i'
                break
              case GL_INT_VEC3:
                
                infix = '3i'
                break
              case GL_BOOL_VEC4:
                
                infix = '4i'
                break
              case GL_INT_VEC4:
                
                infix = '4i'
                break
              default:
                
            }
            scope(GL, '.uniform', infix, '(', LOCATION, ',', value, ');')
          }
          continue
        } else {
          VALUE = arg.append(env, scope)
        }
      } else {
        if (!filter(SCOPE_DECL)) {
          continue
        }
        VALUE = scope.def(shared.uniforms, '[', stringStore.id(name), ']')
      }

      // perform type validation
      

      var separator = ','
      switch (type) {
        case GL_SAMPLER_2D:
        case GL_SAMPLER_CUBE:
          var TEX = scope.def(VALUE, '._texture')
          scope(GL, '.uniform1i(', LOCATION, ',', TEX, '.bind());')
          scope.exit(TEX, '.unbind();')
          continue

        case GL_INT:
        case GL_BOOL:
          infix = '1i'
          break

        case GL_INT_VEC2:
        case GL_BOOL_VEC2:
          infix = '2iv'
          break

        case GL_INT_VEC3:
        case GL_BOOL_VEC3:
          infix = '3iv'
          break

        case GL_INT_VEC4:
        case GL_BOOL_VEC4:
          infix = '4iv'
          break

        case GL_FLOAT:
          infix = '1f'
          break

        case GL_FLOAT_VEC2:
          infix = '2fv'
          break

        case GL_FLOAT_VEC3:
          infix = '3fv'
          break

        case GL_FLOAT_VEC4:
          infix = '4fv'
          break

        case GL_FLOAT_MAT2:
          infix = 'Matrix2fv'
          separator = ',false,'
          break

        case GL_FLOAT_MAT3:
          infix = 'Matrix3fv'
          separator = ',false,'
          break

        case GL_FLOAT_MAT4:
          infix = 'Matrix4fv'
          separator = ',false,'
          break
      }
      scope(GL, '.uniform', infix, '(', LOCATION, separator, VALUE, ');')
    }
  }

  function emitDraw (env, outer, inner, args) {
    var shared = env.shared
    var GL = shared.gl
    var DRAW_STATE = shared.draw

    var drawOptions = args.draw

    function emitElements () {
      var defn = drawOptions.elements
      var ELEMENTS
      var scope = outer
      if (defn) {
        if (!defn.batchStatic) {
          scope = inner
        }
        ELEMENTS = defn.append(env, scope)
      } else {
        ELEMENTS = scope.def(DRAW_STATE, '.', S_ELEMENTS)
      }
      if (ELEMENTS) {
        scope(
          'if(' + ELEMENTS + ')' +
          GL + '.bindBuffer(' + GL_ELEMENT_ARRAY_BUFFER + ',' + ELEMENTS + '.buffer.buffer);')
      }
      return ELEMENTS
    }

    function emitCount () {
      var defn = drawOptions.count
      var COUNT
      var scope = outer
      if (defn) {
        if (!defn.batchStatic) {
          scope = inner
        }
        COUNT = defn.append(env, scope)
        
      } else {
        COUNT = scope.def(DRAW_STATE, '.', S_COUNT)
      }
      return COUNT
    }

    var ELEMENTS = emitElements()
    function emitValue (name) {
      var defn = drawOptions[name]
      if (defn) {
        if (defn.batchStatic) {
          return defn.append(env, outer)
        } else {
          return defn.append(env, inner)
        }
      } else {
        return outer.def(DRAW_STATE, '.', name)
      }
    }

    var PRIMITIVE = emitValue(S_PRIMITIVE)
    var OFFSET = emitValue(S_OFFSET)

    var COUNT = emitCount()
    if (typeof COUNT === 'number') {
      if (COUNT === 0) {
        return
      }
    } else {
      inner('if(', COUNT, '){')
      inner.exit('}')
    }

    var INSTANCES, EXT_INSTANCING
    if (extInstancing) {
      INSTANCES = emitValue(S_INSTANCES)
      EXT_INSTANCING = env.instancing
    }

    var ELEMENT_TYPE = ELEMENTS + '.type'

    var elementsStatic = drawOptions.elements && isStatic(drawOptions.elements)

    function emitInstancing () {
      function drawElements () {
        inner(EXT_INSTANCING, '.drawElementsInstancedANGLE(', [
          PRIMITIVE,
          COUNT,
          ELEMENT_TYPE,
          OFFSET + '<<((' + ELEMENT_TYPE + '-' + GL_UNSIGNED_BYTE + ')>>1)',
          INSTANCES
        ], ');')
      }

      function drawArrays () {
        inner(EXT_INSTANCING, '.drawArraysInstancedANGLE(',
          [PRIMITIVE, OFFSET, COUNT, INSTANCES], ');')
      }

      if (ELEMENTS) {
        if (!elementsStatic) {
          inner('if(', ELEMENTS, '){')
          drawElements()
          inner('}else{')
          drawArrays()
          inner('}')
        } else {
          drawElements()
        }
      } else {
        drawArrays()
      }
    }

    function emitRegular () {
      function drawElements () {
        inner(GL + '.drawElements(' + [
          PRIMITIVE,
          COUNT,
          ELEMENT_TYPE,
          OFFSET + '<<((' + ELEMENT_TYPE + '-' + GL_UNSIGNED_BYTE + ')>>1)'
        ] + ');')
      }

      function drawArrays () {
        inner(GL + '.drawArrays(' + [PRIMITIVE, OFFSET, COUNT] + ');')
      }

      if (ELEMENTS) {
        if (!elementsStatic) {
          inner('if(', ELEMENTS, '){')
          drawElements()
          inner('}else{')
          drawArrays()
          inner('}')
        } else {
          drawElements()
        }
      } else {
        drawArrays()
      }
    }

    if (extInstancing && (typeof INSTANCES !== 'number' || INSTANCES >= 0)) {
      if (typeof INSTANCES === 'string') {
        inner('if(', INSTANCES, '>0){')
        emitInstancing()
        inner('}else if(', INSTANCES, '<0){')
        emitRegular()
        inner('}')
      } else {
        emitInstancing()
      }
    } else {
      emitRegular()
    }
  }

  function createBody (emitBody, parentEnv, args, program, count) {
    var env = createREGLEnvironment()
    var scope = env.proc('body', count)
    
    if (extInstancing) {
      env.instancing = scope.def(
        env.shared.extensions, '.angle_instanced_arrays')
    }
    emitBody(env, scope, args, program)
    return env.compile().body
  }

  // ===================================================
  // ===================================================
  // DRAW PROC
  // ===================================================
  // ===================================================
  function emitDrawBody (env, draw, args, program) {
    injectExtensions(env, draw)

    emitAttributes(env, draw, args, program.attributes, function () {
      return true
    })
    emitUniforms(env, draw, args, program.uniforms, function () {
      return true
    })
    emitDraw(env, draw, draw, args)
  }

  function emitDrawProc (env, args) {
    var draw = env.proc('draw', 1)

    injectExtensions(env, draw)

    emitContext(env, draw, args.context)
    emitPollFramebuffer(env, draw, args.framebuffer)
    emitPollState(env, draw, args)
    emitSetOptions(env, draw, args.state)

    var program = args.shader.progVar.append(env, draw)
    draw(env.shared.gl, '.useProgram(', program, '.program);')

    if (args.shader.program) {
      emitDrawBody(env, draw, args, args.shader.program)
    } else {
      var drawCache = env.global.def('{}')
      var PROG_ID = draw.def(program, '.id')
      var CACHED_PROC = draw.def(drawCache, '[', PROG_ID, ']')
      draw(
        env.cond(CACHED_PROC)
          .then(CACHED_PROC, '.call(this,a0);')
          .else(
            CACHED_PROC, '=', drawCache, '[', PROG_ID, ']=',
            env.link(function (program) {
              return createBody(emitDrawBody, env, args, program, 1)
            }), '(', program, ');',
            CACHED_PROC, '.call(this,a0);'))
    }

    if (Object.keys(args.state).length > 0) {
      draw(env.shared.current, '.dirty=true;')
    }
  }

  // ===================================================
  // ===================================================
  // BATCH PROC
  // ===================================================
  // ===================================================

  function emitBatchDynamicShaderBody (env, scope, args, program) {
    env.batchId = 'a1'

    injectExtensions(env, scope)

    function all () {
      return true
    }

    emitAttributes(env, scope, args, program.attributes, all)
    emitUniforms(env, scope, args, program.uniforms, all)
    emitDraw(env, scope, scope, args)
  }

  function emitBatchBody (env, scope, args, program) {
    injectExtensions(env, scope)

    var contextDynamic = args.contextDynamic

    var BATCH_ID = scope.def()
    var PROP_LIST = 'a0'
    var NUM_PROPS = 'a1'
    var PROPS = scope.def()
    env.shared.props = PROPS
    env.batchId = BATCH_ID

    var outer = env.scope()
    var inner = env.scope()

    scope(
      outer.entry,
      'for(', BATCH_ID, '=0;', BATCH_ID, '<', NUM_PROPS, ';++', BATCH_ID, '){',
      PROPS, '=', PROP_LIST, '[', BATCH_ID, '];',
      inner,
      '}',
      outer.exit)

    function isInnerDefn (defn) {
      return ((defn.contextDep && contextDynamic) || defn.propDep)
    }

    function isOuterDefn (defn) {
      return !isInnerDefn(defn)
    }

    if (args.needsContext) {
      emitContext(env, inner, args.context)
    }
    if (args.needsFramebuffer) {
      emitPollFramebuffer(env, inner, args.framebuffer)
    }
    emitSetOptions(env, inner, args.state, isInnerDefn)

    if (!program) {
      var progCache = env.global.def('{}')
      var PROGRAM = args.shader.progVar.append(env, inner)
      var PROG_ID = inner.def(PROGRAM, '.id')
      var CACHED_PROC = inner.def(progCache, '[', PROG_ID, ']')
      inner(
        env.shared.gl, '.useProgram(', PROGRAM, '.program);',
        'if(!', CACHED_PROC, '){',
        CACHED_PROC, '=', progCache, '[', PROG_ID, ']=',
        env.link(function (program) {
          return createBody(
            emitBatchDynamicShaderBody, env, args, program, 2)
        }), '(', PROGRAM, ');}',
        CACHED_PROC, '.call(this,a0[', BATCH_ID, '],', BATCH_ID, ');')
    } else {
      emitAttributes(env, outer, args, program.attributes, isOuterDefn)
      emitAttributes(env, inner, args, program.attributes, isInnerDefn)
      emitUniforms(env, outer, args, program.uniforms, isOuterDefn)
      emitUniforms(env, inner, args, program.uniforms, isInnerDefn)
      emitDraw(env, outer, inner, args)
    }
  }

  function emitBatchProc (env, args) {
    var batch = env.proc('batch', 2)
    env.batchId = '0'

    injectExtensions(env, batch)

    // Check if any context variables depend on props
    var contextDynamic = false
    var needsContext = true
    Object.keys(args.context).forEach(function (name) {
      contextDynamic = contextDynamic || args.context[name].propDep
    })
    if (!contextDynamic) {
      emitContext(env, batch, args.context)
      needsContext = false
    }

    // framebuffer state affects framebufferWidth/height context vars
    var framebuffer = args.framebuffer
    var needsFramebuffer = false
    if (framebuffer) {
      if (framebuffer.propDep) {
        contextDynamic = needsFramebuffer = true
      } else if (framebuffer.contextDep && contextDynamic) {
        needsFramebuffer = true
      }
      if (!needsFramebuffer) {
        emitPollFramebuffer(env, batch, framebuffer)
      }
    }

    // viewport is weird because it can affect context vars
    if (args.state.viewport && args.state.viewport.propDynamic) {
      contextDynamic = true
    }

    // set webgl options
    emitPollState(env, batch, args)
    emitSetOptions(env, batch, args.state, function (defn) {
      return !((defn.contextDep && contextDynamic) || defn.propDep)
    })

    // Save these values to args so that the batch body routine can use them
    args.contextDep = contextDynamic
    args.needsContext = needsContext
    args.needsFramebuffer = needsFramebuffer

    // determine if shader is dynamic
    var progDefn = args.shader.progVar
    if ((progDefn.contextDep && contextDynamic) || progDefn.propDep) {
      emitBatchBody(
        env,
        batch,
        args,
        null)
    } else {
      var PROGRAM = progDefn.append(env, batch)
      batch(env.shared.gl, '.useProgram(', PROGRAM, '.program);')
      if (args.shader.program) {
        emitBatchBody(
          env,
          batch,
          args,
          args.shader.program)
      } else {
        var batchCache = env.global.def('{}')
        var PROG_ID = batch.def(PROGRAM, '.id')
        var CACHED_PROC = batch.def(batchCache, '[', PROG_ID, ']')
        batch(
          env.cond(CACHED_PROC)
            .then(CACHED_PROC, '.call(this,a0,a1);')
            .else(
              CACHED_PROC, '=', batchCache, '[', PROG_ID, ']=',
              env.link(function (program) {
                return createBody(emitBatchBody, env, args, program, 2)
              }), '(', PROGRAM, ');',
              CACHED_PROC, '.call(this,a0,a1);'))
      }
    }

    if (Object.keys(args.state).length > 0) {
      batch(env.shared.current, '.dirty=true;')
    }
  }

  // ===================================================
  // ===================================================
  // SCOPE COMMAND
  // ===================================================
  // ===================================================
  function emitScopeProc (env, args) {
    var scope = env.proc('scope', 3)
    env.batchId = 'a2'

    var shared = env.shared
    var CURRENT_STATE = shared.current

    emitContext(env, scope, args.context)

    if (args.framebuffer) {
      args.framebuffer.append(env, scope)
    }

    sortState(Object.keys(args.state)).forEach(function (name) {
      var defn = args.state[name]
      var value = defn.append(env, scope)
      if (Array.isArray(value)) {
        value.forEach(function (v, i) {
          scope.set(env.next[name], '[' + i + ']', v)
        })
      } else {
        scope.set(shared.next, '.' + name, value)
      }
    })

    ;[S_ELEMENTS, S_OFFSET, S_COUNT, S_INSTANCES, S_PRIMITIVE].forEach(
      function (opt) {
        var variable = args.draw[opt]
        if (!variable) {
          return
        }
        scope.set(shared.draw, '.' + opt, '' + variable.append(env, scope))
      })

    Object.keys(args.uniforms).forEach(function (opt) {
      scope.set(
        shared.uniforms,
        '[' + stringStore.id(opt) + ']',
        args.uniforms[opt].append(env, scope))
    })

    Object.keys(args.attributes).forEach(function (name) {
      var record = args.attributes[name].append(env, scope)
      var scopeAttrib = env.scopeAttrib(name)
      Object.keys(new AttributeRecord()).forEach(function (prop) {
        scope.set(scopeAttrib, '.' + prop, record[prop])
      })
    })

    function saveShader (name) {
      var shader = args.shader[name]
      if (shader) {
        scope.set(shared.shader, '.' + name, shader.append(env, scope))
      }
    }
    saveShader(S_VERT)
    saveShader(S_FRAG)

    if (Object.keys(args.state).length > 0) {
      scope(CURRENT_STATE, '.dirty=true;')
      scope.exit(CURRENT_STATE, '.dirty=true;')
    }

    scope('a1(', env.shared.context, ',a0,0);')
  }

  // ===========================================================================
  // ===========================================================================
  // MAIN DRAW COMMAND
  // ===========================================================================
  // ===========================================================================
  function compileCommand (options, attributes, uniforms, context) {
    var env = createREGLEnvironment()
    var args = parseArguments(options, attributes, uniforms, context)

    emitDrawProc(env, args)
    emitScopeProc(env, args)
    emitBatchProc(env, args)

    return env.compile()
  }

  // ===========================================================================
  // ===========================================================================
  // POLL / REFRESH
  // ===========================================================================
  // ===========================================================================
  return {
    next: nextState,
    current: currentState,
    procs: (function () {
      var env = createREGLEnvironment()
      var poll = env.proc('poll')
      var refresh = env.proc('refresh')
      var common = env.block()
      poll(common)
      refresh(common)

      var shared = env.shared
      var GL = shared.gl
      var NEXT_STATE = shared.next
      var CURRENT_STATE = shared.current

      common(CURRENT_STATE, '.dirty=false;')

      emitPollFramebuffer(env, poll)

      refresh(shared.framebuffer, '.dirty=true;')
      emitPollFramebuffer(env, refresh)

      // FIXME: refresh should update vertex attribute pointers

      Object.keys(GL_FLAGS).forEach(function (flag) {
        var cap = GL_FLAGS[flag]
        var NEXT = common.def(NEXT_STATE, '.', flag)
        var block = env.block()
        block('if(', NEXT, '){',
          GL, '.enable(', cap, ')}else{',
          GL, '.disable(', cap, ')}',
          CURRENT_STATE, '.', flag, '=', NEXT, ';')
        refresh(block)
        poll(
          'if(', NEXT, '!==', CURRENT_STATE, '.', flag, '){',
          block,
          '}')
      })

      Object.keys(GL_VARIABLES).forEach(function (name) {
        var func = GL_VARIABLES[name]
        var init = currentState[name]
        var NEXT, CURRENT
        var block = env.block()
        block(GL, '.', func, '(')
        if (Array.isArray(init)) {
          var n = init.length
          NEXT = env.global.def(NEXT_STATE, '.', name)
          CURRENT = env.global.def(CURRENT_STATE, '.', name)
          block(
            loop(n, function (i) {
              return NEXT + '[' + i + ']'
            }), ');',
            loop(n, function (i) {
              return CURRENT + '[' + i + ']=' + NEXT + '[' + i + '];'
            }).join(''))
          poll(
            'if(', loop(n, function (i) {
              return NEXT + '[' + i + ']!==' + CURRENT + '[' + i + ']'
            }).join('||'), '){',
            block,
            '}')
        } else {
          NEXT = common.def(NEXT_STATE, '.', name)
          CURRENT = common.def(CURRENT_STATE, '.', name)
          block(
            NEXT, ');',
            CURRENT_STATE, '.', name, '=', NEXT, ';')
          poll(
            'if(', NEXT, '!==', CURRENT, '){',
            block,
            '}')
        }
        refresh(block)
      })

      return env.compile()
    })(),
    compile: compileCommand
  }
}

},{"./constants/dtypes.json":5,"./constants/primitives.json":6,"./util/codegen":20,"./util/is-ndarray":23,"./util/is-typed-array":24,"./util/loop":26}],9:[function(require,module,exports){


var VARIABLE_COUNTER = 0

var DYN_FUNC = 0
var DYN_PENDING_FLAG = 128

function DynamicVariable (type, data) {
  this.id = (VARIABLE_COUNTER++)
  this.type = type
  this.data = data
}

function escapeStr (str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function splitParts (str) {
  if (str.length === 0) {
    return []
  }

  var firstChar = str.charAt(0)
  var lastChar = str.charAt(str.length - 1)

  if (str.length > 1 &&
      firstChar === lastChar &&
      (firstChar === '"' || firstChar === "'")) {
    return ['"' + escapeStr(str.substr(1, str.length - 2)) + '"']
  }

  var parts = /\[(false|true|null|\d+|'[^']*'|"[^"]*")\]/.exec(str)
  if (parts) {
    return (
      splitParts(str.substr(0, parts.index))
      .concat(splitParts(parts[1]))
      .concat(splitParts(str.substr(parts.index + parts[0].length)))
    )
  }

  var subparts = str.split('.')
  if (subparts.length === 1) {
    return ['"' + escapeStr(str) + '"']
  }

  var result = []
  for (var i = 0; i < subparts.length; ++i) {
    result = result.concat(splitParts(subparts[i]))
  }
  return result
}

function toAccessorString (str) {
  return '[' + splitParts(str).join('][') + ']'
}

function defineDynamic (type, data) {
  switch (typeof data) {
    case 'boolean':
    case 'number':
    case 'string':
      return new DynamicVariable(type, toAccessorString(data + ''))

    case 'undefined':
      return new DynamicVariable(type | DYN_PENDING_FLAG, null)

    default:
      
  }
}

function isDynamic (x) {
  return (typeof x === 'function' && !x._reglType) ||
         x instanceof DynamicVariable
}

function unbox (x, path) {
  if (x instanceof DynamicVariable) {
    if (x.type & DYN_PENDING_FLAG) {
      return new DynamicVariable(
        x.type & ~DYN_PENDING_FLAG,
        toAccessorString(path))
    }
  } else if (typeof x === 'function') {
    return new DynamicVariable(DYN_FUNC, x)
  }
  return x
}

module.exports = {
  define: defineDynamic,
  isDynamic: isDynamic,
  unbox: unbox,
  accessor: toAccessorString
}

},{}],10:[function(require,module,exports){

var isTypedArray = require('./util/is-typed-array')
var isNDArrayLike = require('./util/is-ndarray')

var primTypes = require('./constants/primitives.json')
var usageTypes = require('./constants/usage.json')

var GL_POINTS = 0
var GL_LINES = 1
var GL_TRIANGLES = 4

var GL_BYTE = 5120
var GL_UNSIGNED_BYTE = 5121
var GL_SHORT = 5122
var GL_UNSIGNED_SHORT = 5123
var GL_INT = 5124
var GL_UNSIGNED_INT = 5125

var GL_ELEMENT_ARRAY_BUFFER = 34963

var GL_STREAM_DRAW = 0x88E0
var GL_STATIC_DRAW = 0x88E4

module.exports = function wrapElementsState (gl, extensions, bufferState) {
  var elementTypes = {
    'uint8': GL_UNSIGNED_BYTE,
    'uint16': GL_UNSIGNED_SHORT
  }

  if (extensions.oes_element_index_uint) {
    elementTypes.uint32 = GL_UNSIGNED_INT
  }

  function REGLElementBuffer (buffer) {
    this.buffer = buffer
    this.primType = GL_TRIANGLES
    this.vertCount = 0
    this.type = 0
  }

  REGLElementBuffer.prototype.bind = function () {
    this.buffer.bind()
  }

  var bufferPool = []

  function createElementStream (data) {
    var result = bufferPool.pop()
    if (!result) {
      result = new REGLElementBuffer(bufferState.create(
        null,
        GL_ELEMENT_ARRAY_BUFFER,
        true)._buffer)
    }
    initElements(result, data, GL_STREAM_DRAW, -1, -1, 0, 0)
    return result
  }

  function destroyElementStream (elements) {
    bufferPool.push(elements)
  }

  function initElements (
    elements,
    data,
    usage,
    prim,
    count,
    byteLength,
    type) {
    var predictedType = type
    if (!type && (
        !isTypedArray(data) ||
       (isNDArrayLike(data) && !isTypedArray(data.data)))) {
      predictedType = extensions.oes_element_index_uint
        ? GL_UNSIGNED_INT
        : GL_UNSIGNED_SHORT
    }
    elements.buffer.bind()
    bufferState._initBuffer(
      elements.buffer,
      data,
      usage,
      predictedType,
      3)

    var dtype = type
    if (!type) {
      switch (elements.buffer.dtype) {
        case GL_UNSIGNED_BYTE:
        case GL_BYTE:
          dtype = GL_UNSIGNED_BYTE
          break

        case GL_UNSIGNED_SHORT:
        case GL_SHORT:
          dtype = GL_UNSIGNED_SHORT
          break

        case GL_UNSIGNED_INT:
        case GL_INT:
          dtype = GL_UNSIGNED_INT
          break

        default:
          
      }
      elements.buffer.dtype = dtype
    }
    elements.type = dtype

    // Check oes_element_index_uint extension
    

    // try to guess default primitive type and arguments
    var vertCount = count
    if (vertCount < 0) {
      vertCount = elements.buffer.byteLength
      if (dtype === GL_UNSIGNED_SHORT) {
        vertCount >>= 1
      } else if (dtype === GL_UNSIGNED_INT) {
        vertCount >>= 2
      }
    }
    elements.vertCount = vertCount

    // try to guess primitive type from cell dimension
    var primType = prim
    if (prim < 0) {
      primType = GL_TRIANGLES
      var dimension = elements.buffer.dimension
      if (dimension === 1) primType = GL_POINTS
      if (dimension === 2) primType = GL_LINES
      if (dimension === 3) primType = GL_TRIANGLES
    }
    elements.primType = primType
  }

  function createElements (options) {
    var buffer = bufferState.create(null, GL_ELEMENT_ARRAY_BUFFER, true)
    var elements = new REGLElementBuffer(buffer._buffer)

    function reglElements (options) {
      if (!options) {
        buffer()
        elements.primType = GL_TRIANGLES
        elements.vertCount = 0
        elements.type = GL_UNSIGNED_BYTE
      } else if (typeof options === 'number') {
        buffer(options)
        elements.primType = GL_TRIANGLES
        elements.vertCount = options | 0
        elements.type = GL_UNSIGNED_BYTE
      } else {
        var data = null
        var usage = GL_STATIC_DRAW
        var primType = -1
        var vertCount = -1
        var byteLength = 0
        var dtype = 0
        if (Array.isArray(options) ||
            isTypedArray(options) ||
            isNDArrayLike(options)) {
          data = options
        } else {
          
          if ('data' in options) {
            data = options.data
            
          }
          if ('usage' in options) {
            
            usage = usageTypes[options.usage]
          }
          if ('primitive' in options) {
            
            primType = primTypes[options.primitive]
          }
          if ('count' in options) {
            
            vertCount = options.count | 0
          }
          if ('length' in options) {
            byteLength = options.length | 0
          }
          if ('type' in options) {
            
            dtype = elementTypes[options.type]
          }
        }
        if (data) {
          initElements(
            elements,
            data,
            usage,
            primType,
            vertCount,
            byteLength,
            dtype)
        } else {
          var _buffer = elements.buffer
          _buffer.bind()
          gl.bufferData(GL_ELEMENT_ARRAY_BUFFER, byteLength, usage)
          _buffer.dtype = dtype || GL_UNSIGNED_BYTE
          _buffer.usage = usage
          _buffer.dimension = 3
          _buffer.byteLength = byteLength
          elements.primType = primType < 0 ? GL_TRIANGLES : primType
          elements.vertCount = vertCount < 0 ? 0 : vertCount
          elements.type = _buffer.dtype
        }
      }

      return reglElements
    }

    reglElements(options)

    reglElements._reglType = 'elements'
    reglElements._elements = elements
    reglElements.subdata = function (data, offset) {
      buffer.subdata(data, offset)
      return reglElements
    }
    reglElements.destroy = function () {
      
      buffer.destroy()
      elements.buffer = null
    }

    return reglElements
  }

  return {
    create: createElements,
    createStream: createElementStream,
    destroyStream: destroyElementStream,
    getElements: function (elements) {
      if (typeof elements === 'function' &&
          elements._elements instanceof REGLElementBuffer) {
        return elements._elements
      }
      return null
    }
  }
}

},{"./constants/primitives.json":6,"./constants/usage.json":7,"./util/is-ndarray":23,"./util/is-typed-array":24}],11:[function(require,module,exports){
module.exports = function createExtensionCache (gl) {
  var extensions = {}

  function refreshExtensions () {
    [
      'oes_texture_float',
      'oes_texture_float_linear',
      'oes_texture_half_float',
      'oes_texture_half_float_linear',
      'oes_standard_derivatives',
      'oes_element_index_uint',
      'oes_fbo_render_mipmap',

      'webgl_depth_texture',
      'webgl_draw_buffers',
      'webgl_color_buffer_float',

      'ext_texture_filter_anisotropic',
      'ext_frag_depth',
      'ext_blend_minmax',
      'ext_shader_texture_lod',
      'ext_color_buffer_half_float',
      'ext_srgb',

      'angle_instanced_arrays',

      'webgl_compressed_texture_s3tc',
      'webgl_compressed_texture_atc',
      'webgl_compressed_texture_pvrtc',
      'webgl_compressed_texture_etc1'
    ].forEach(function (ext) {
      try {
        extensions[ext] = gl.getExtension(ext)
      } catch (e) {}
    })
  }

  refreshExtensions()

  return {
    extensions: extensions,
    refresh: refreshExtensions
  }
}

},{}],12:[function(require,module,exports){

var values = require('./util/values')
var extend = require('./util/extend')

// We store these constants so that the minifier can inline them
var GL_FRAMEBUFFER = 0x8D40
var GL_RENDERBUFFER = 0x8D41

var GL_TEXTURE_2D = 0x0DE1
var GL_TEXTURE_CUBE_MAP = 0x8513
var GL_TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515

var GL_COLOR_ATTACHMENT0 = 0x8CE0
var GL_DEPTH_ATTACHMENT = 0x8D00
var GL_STENCIL_ATTACHMENT = 0x8D20
var GL_DEPTH_STENCIL_ATTACHMENT = 0x821A

var GL_UNSIGNED_BYTE = 0x1401
var GL_FLOAT = 0x1406

var GL_HALF_FLOAT_OES = 0x8D61

var GL_RGBA = 0x1908

var GL_RGBA4 = 0x8056
var GL_RGB5_A1 = 0x8057
var GL_RGB565 = 0x8D62
var GL_DEPTH_COMPONENT16 = 0x81A5
var GL_STENCIL_INDEX8 = 0x8D48

var GL_DEPTH_COMPONENT = 0x1902
var GL_DEPTH_STENCIL = 0x84F9

var GL_SRGB8_ALPHA8_EXT = 0x8C43

var GL_RGBA32F_EXT = 0x8814

var GL_RGBA16F_EXT = 0x881A
var GL_RGB16F_EXT = 0x881B

var GL_FRAMEBUFFER_COMPLETE = 0x8CD5
var GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT = 0x8CD6
var GL_FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT = 0x8CD7
var GL_FRAMEBUFFER_INCOMPLETE_DIMENSIONS = 0x8CD9
var GL_FRAMEBUFFER_UNSUPPORTED = 0x8CDD

module.exports = function wrapFBOState (
  gl,
  extensions,
  limits,
  textureState,
  renderbufferState) {
  var framebufferState = {
    current: null,
    next: null,
    dirty: false
  }

  var statusCode = {}
  statusCode[GL_FRAMEBUFFER_COMPLETE] = 'complete'
  statusCode[GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT] = 'incomplete attachment'
  statusCode[GL_FRAMEBUFFER_INCOMPLETE_DIMENSIONS] = 'incomplete dimensions'
  statusCode[GL_FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT] = 'incomplete, missing attachment'
  statusCode[GL_FRAMEBUFFER_UNSUPPORTED] = 'unsupported'

  var colorTextureFormats = {
    'rgba': GL_RGBA
  }

  var colorRenderbufferFormats = {
    'rgba4': GL_RGBA4,
    'rgb565': GL_RGB565,
    'rgb5 a1': GL_RGB5_A1
  }

  if (extensions.ext_srgb) {
    colorRenderbufferFormats['srgba'] = GL_SRGB8_ALPHA8_EXT
  }

  if (extensions.ext_color_buffer_half_float) {
    colorRenderbufferFormats['rgba16f'] = GL_RGBA16F_EXT
    colorRenderbufferFormats['rgb16f'] = GL_RGB16F_EXT
  }

  if (extensions.webgl_color_buffer_float) {
    colorRenderbufferFormats['rgba32f'] = GL_RGBA32F_EXT
  }

  var depthRenderbufferFormatEnums = [GL_DEPTH_COMPONENT16]
  var stencilRenderbufferFormatEnums = [GL_STENCIL_INDEX8]
  var depthStencilRenderbufferFormatEnums = [GL_DEPTH_STENCIL]

  var depthTextureFormatEnums = []
  var stencilTextureFormatEnums = []
  var depthStencilTextureFormatEnums = []

  if (extensions.webgl_depth_texture) {
    depthTextureFormatEnums.push(GL_DEPTH_COMPONENT)
    depthStencilTextureFormatEnums.push(GL_DEPTH_STENCIL)
  }

  var colorFormats = extend(extend({},
    colorTextureFormats),
    colorRenderbufferFormats)

  var colorTextureFormatEnums = values(colorTextureFormats)
  var colorRenderbufferFormatEnums = values(colorRenderbufferFormats)

  var highestPrecision = GL_UNSIGNED_BYTE
  var colorTypes = {
    'uint8': GL_UNSIGNED_BYTE
  }
  if (extensions.oes_texture_half_float) {
    highestPrecision = colorTypes['half float'] = GL_HALF_FLOAT_OES
  }
  if (extensions.oes_texture_float) {
    highestPrecision = colorTypes.float = GL_FLOAT
  }
  colorTypes.best = highestPrecision

  var DRAW_BUFFERS = (function () {
    var result = new Array(limits.maxDrawbuffers)
    for (var i = 0; i <= limits.maxDrawbuffers; ++i) {
      var row = result[i] = new Array(i)
      for (var j = 0; j < i; ++j) {
        row[j] = GL_COLOR_ATTACHMENT0 + j
      }
    }
    return result
  })()

  function FramebufferAttachment (target, level, texture, renderbuffer) {
    this.target = target
    this.level = level
    this.texture = texture
    this.renderbuffer = renderbuffer
  }

  function decRef (attachment) {
    if (attachment) {
      if (attachment.texture) {
        attachment.texture._texture.decRef()
      }
      if (attachment.renderbuffer) {
        attachment.renderbuffer._renderbuffer.decRef()
      }
    }
  }

  function incRefAndCheckShape (attachment, framebuffer) {
    var width = framebuffer.width
    var height = framebuffer.height
    if (attachment.texture) {
      var texture = attachment.texture._texture
      var tw = Math.max(1, texture.params.width >> attachment.level)
      var th = Math.max(1, texture.params.height >> attachment.level)
      width = width || tw
      height = height || th
      
      
      texture.refCount += 1
    } else {
      var renderbuffer = attachment.renderbuffer._renderbuffer
      width = width || renderbuffer.width
      height = height || renderbuffer.height
      
      
      renderbuffer.refCount += 1
    }
    framebuffer.width = width
    framebuffer.height = height
  }

  function attach (location, attachment) {
    if (attachment) {
      if (attachment.texture) {
        gl.framebufferTexture2D(
          GL_FRAMEBUFFER,
          location,
          attachment.target,
          attachment.texture._texture.texture,
          attachment.level)
      } else {
        gl.framebufferRenderbuffer(
          GL_FRAMEBUFFER,
          location,
          GL_RENDERBUFFER,
          attachment.renderbuffer._renderbuffer.renderbuffer)
      }
    } else {
      gl.framebufferTexture2D(
        GL_FRAMEBUFFER,
        location,
        GL_TEXTURE_2D,
        null,
        0)
    }
  }

  function tryUpdateAttachment (
    attachment,
    isTexture,
    format,
    type,
    width,
    height) {
    if (attachment.texture) {
      var texture = attachment.texture
      if (isTexture) {
        texture({
          format: format,
          type: type,
          width: width,
          height: height
        })
        texture._texture.refCount += 1
        return true
      }
    } else {
      var renderbuffer = attachment.renderbuffer
      if (!isTexture) {
        renderbuffer({
          format: format,
          width: width,
          height: height
        })
        renderbuffer._renderbuffer.refCount += 1
        return true
      }
    }
    decRef(attachment)
    return false
  }

  function parseAttachment (attachment) {
    var target = GL_TEXTURE_2D
    var level = 0
    var texture = null
    var renderbuffer = null

    var data = attachment
    if (typeof attachment === 'object') {
      data = attachment.data
      if ('level' in attachment) {
        level = attachment.level | 0
      }
      if ('target' in attachment) {
        target = attachment.target | 0
      }
    }

    

    var type = attachment._reglType
    if (type === 'texture') {
      texture = attachment
      if (texture._texture.target === GL_TEXTURE_CUBE_MAP) {
        
      } else {
        
      }
      // TODO check miplevel is consistent
    } else if (type === 'renderbuffer') {
      renderbuffer = attachment
      target = GL_RENDERBUFFER
      level = 0
    } else {
      
    }

    return new FramebufferAttachment(target, level, texture, renderbuffer)
  }

  function unwrapAttachment (attachment) {
    return attachment && (attachment.texture || attachment.renderbuffer)
  }

  var framebufferCount = 0
  var framebufferSet = {}

  function REGLFramebuffer () {
    this.id = framebufferCount++
    framebufferSet[this.id] = this

    this.framebuffer = null
    this.width = 0
    this.height = 0

    this.colorAttachments = []
    this.depthAttachment = null
    this.stencilAttachment = null
    this.depthStencilAttachment = null

    this.ownsColor = false
    this.ownsDepthStencil = false
  }

  function refresh (framebuffer) {
    if (!gl.isFramebuffer(framebuffer.framebuffer)) {
      framebuffer.framebuffer = gl.createFramebuffer()
    }
    framebufferState.dirty = true
    gl.bindFramebuffer(GL_FRAMEBUFFER, framebuffer.framebuffer)

    var colorAttachments = framebuffer.colorAttachments
    for (var i = 0; i < colorAttachments.length; ++i) {
      attach(GL_COLOR_ATTACHMENT0 + i, colorAttachments[i])
    }
    for (i = colorAttachments.length; i < limits.maxColorAttachments; ++i) {
      attach(GL_COLOR_ATTACHMENT0 + i, null)
    }
    attach(GL_DEPTH_ATTACHMENT, framebuffer.depthAttachment)
    attach(GL_STENCIL_ATTACHMENT, framebuffer.stencilAttachment)
    attach(GL_DEPTH_STENCIL_ATTACHMENT, framebuffer.depthStencilAttachment)

    if (extensions.webgl_draw_buffers) {
      extensions.webgl_draw_buffers.drawBuffersWEBGL(
        DRAW_BUFFERS[colorAttachments.length])
    }

    // Check status code
    var status = gl.checkFramebufferStatus(GL_FRAMEBUFFER)
    if (status !== GL_FRAMEBUFFER_COMPLETE) {
      
    }
  }

  function decFBORefs (framebuffer) {
    framebuffer.colorAttachments.forEach(decRef)
    decRef(framebuffer.depthAttachment)
    decRef(framebuffer.stencilAttachment)
    decRef(framebuffer.depthStencilAttachment)
  }

  function destroy (framebuffer) {
    var handle = framebuffer.framebuffer
    
    if (gl.isFramebuffer(handle)) {
      gl.deleteFramebuffer(handle)
    }
  }

  function createFBO (options) {
    var framebuffer = new REGLFramebuffer()

    function reglFramebuffer (input) {
      var i
      var options = input || {}

      var extDrawBuffers = extensions.webgl_draw_buffers

      var width = 0
      var height = 0
      if ('shape' in options) {
        var shape = options.shape
        
        width = shape[0]
        height = shape[1]
      } else {
        if ('radius' in options) {
          width = height = options.radius
        }
        if ('width' in options) {
          width = options.width
        }
        if ('height' in options) {
          height = options.height
        }
      }

      // colorType, numColors
      var colorBuffers = null
      var ownsColor = false
      if ('colorBuffers' in options || 'colorBuffer' in options) {
        var colorInputs = options.colorBuffers || options.colorBuffer
        if (!Array.isArray(colorInputs)) {
          colorInputs = [colorInputs]
        }

        framebuffer.width = width
        framebuffer.height = height

        if (colorInputs.length > 1) {
          
        }
        

        // Wrap color attachments
        colorBuffers = colorInputs.map(parseAttachment)

        // Check head node
        for (i = 0; i < colorBuffers.length; ++i) {
          var colorAttachment = colorBuffers[i]
          
          incRefAndCheckShape(
            colorAttachment,
            framebuffer)
        }

        width = framebuffer.width
        height = framebuffer.height
      } else {
        var colorTexture = true
        var colorFormat = 'rgba'
        var colorType = 'uint8'
        var colorCount = 1
        ownsColor = true

        framebuffer.width = width = width || gl.drawingBufferWidth
        framebuffer.height = height = height || gl.drawingBufferHeight

        if ('format' in options) {
          colorFormat = options.format
          
          colorTexture = colorFormat in colorTextureFormats
        }

        if ('type' in options) {
          
          colorType = options.type
          
        }

        if ('colorCount' in options) {
          colorCount = options.colorCount | 0
          
        }

        // Reuse color buffer array if we own it
        if (framebuffer.ownsColor) {
          colorBuffers = framebuffer.colorAttachments
          while (colorBuffers.length > colorCount) {
            decRef(colorBuffers.pop())
          }
        } else {
          colorBuffers = []
        }

        // update buffers in place, remove incompatible buffers
        for (i = 0; i < colorBuffers.length; ++i) {
          if (!tryUpdateAttachment(
              colorBuffers[i],
              colorTexture,
              colorFormat,
              colorType,
              width,
              height)) {
            colorBuffers[i--] = colorBuffers[colorBuffers.length - 1]
            colorBuffers.pop()
          }
        }

        // Then append new buffers
        while (colorBuffers.length < colorCount) {
          if (colorTexture) {
            colorBuffers.push(new FramebufferAttachment(
              GL_TEXTURE_2D,
              0,
              textureState.create({
                format: colorFormat,
                type: colorType,
                width: width,
                height: height
              }, GL_TEXTURE_2D),
              null))
          } else {
            colorBuffers.push(new FramebufferAttachment(
              GL_RENDERBUFFER,
              0,
              null,
              renderbufferState.create({
                format: colorFormat,
                width: width,
                height: height
              })))
          }
        }
      }

      

      framebuffer.width = width
      framebuffer.height = height

      var depthBuffer = null
      var stencilBuffer = null
      var depthStencilBuffer = null
      var ownsDepthStencil = false
      var depthStencilCount = 0

      if ('depthBuffer' in options) {
        depthBuffer = parseAttachment(options.depthBuffer)
        
        depthStencilCount += 1
      }
      if ('stencilBuffer' in options) {
        stencilBuffer = parseAttachment(options.stencilBuffer)
        
        depthStencilCount += 1
      }
      if ('depthStencilBuffer' in options) {
        depthStencilBuffer = parseAttachment(options.depthStencilBuffer)
        
        depthStencilCount += 1
      }

      if (!(depthBuffer || stencilBuffer || depthStencilBuffer)) {
        var depth = true
        var stencil = false
        var useTexture = false

        if ('depth' in options) {
          depth = !!options.depth
        }
        if ('stencil' in options) {
          stencil = !!options.stencil
        }
        if ('depthTexture' in options) {
          useTexture = !!options.depthTexture
        }

        var curDepthStencil =
          framebuffer.depthAttachment ||
          framebuffer.stencilAttachment ||
          framebuffer.depthStencilAttachment
        var nextDepthStencil = null

        if (depth || stencil) {
          ownsDepthStencil = true

          if (useTexture) {
            
            var depthTextureFormat
            
            if (stencil) {
              depthTextureFormat = 'depth stencil'
            } else {
              depthTextureFormat = 'depth'
            }
            if (framebuffer.ownsDepthStencil && curDepthStencil.texture) {
              curDepthStencil.texture({
                format: depthTextureFormat,
                width: width,
                height: height
              })
              curDepthStencil.texture._texture.refCount += 1
              nextDepthStencil = curDepthStencil
            } else {
              nextDepthStencil = new FramebufferAttachment(
                GL_TEXTURE_2D,
                0,
                textureState.create({
                  format: depthTextureFormat,
                  width: width,
                  height: height
                }, GL_TEXTURE_2D),
                null)
            }
          } else {
            var depthRenderbufferFormat
            if (depth) {
              if (stencil) {
                depthRenderbufferFormat = 'depth stencil'
              } else {
                depthRenderbufferFormat = 'depth'
              }
            } else {
              depthRenderbufferFormat = 'stencil'
            }
            if (framebuffer.ownsDepthStencil && curDepthStencil.renderbuffer) {
              curDepthStencil.renderbuffer({
                format: depthRenderbufferFormat,
                width: width,
                height: height
              })
              curDepthStencil.renderbuffer._renderbuffer.refCount += 1
              nextDepthStencil = curDepthStencil
            } else {
              nextDepthStencil = new FramebufferAttachment(
                GL_RENDERBUFFER,
                0,
                null,
                renderbufferState.create({
                  format: depthRenderbufferFormat,
                  width: width,
                  height: height
                }))
            }
          }

          if (depth) {
            if (stencil) {
              depthStencilBuffer = nextDepthStencil
            } else {
              depthBuffer = nextDepthStencil
            }
          } else {
            stencilBuffer = nextDepthStencil
          }
        }
      } else {
        

        incRefAndCheckShape(
          depthBuffer ||
          stencilBuffer ||
          depthStencilBuffer,
          framebuffer)
      }

      decFBORefs(framebuffer)

      framebuffer.colorAttachments = colorBuffers
      framebuffer.depthAttachment = depthBuffer
      framebuffer.stencilAttachment = stencilBuffer
      framebuffer.depthStencilAttachment = depthStencilBuffer
      framebuffer.ownsColor = ownsColor
      framebuffer.ownsDepthStencil = ownsDepthStencil

      reglFramebuffer.color = colorBuffers.map(unwrapAttachment)
      reglFramebuffer.depth = unwrapAttachment(depthBuffer)
      reglFramebuffer.stencil = unwrapAttachment(stencilBuffer)
      reglFramebuffer.depthStencil = unwrapAttachment(depthStencilBuffer)

      refresh(framebuffer)

      reglFramebuffer.width = framebuffer.width
      reglFramebuffer.height = framebuffer.height

      return reglFramebuffer
    }

    reglFramebuffer(options)

    reglFramebuffer._reglType = 'framebuffer'
    reglFramebuffer._framebuffer = framebuffer
    reglFramebuffer._destroy = function () {
      destroy(framebuffer)
    }

    return reglFramebuffer
  }

  function refreshCache () {
    values(framebufferSet).forEach(refresh)
  }

  function clearCache () {
    values(framebufferSet).forEach(destroy)
  }

  return extend(framebufferState, {
    getFramebuffer: function (object) {
      if (typeof object === 'function' && object._reglType === 'framebuffer') {
        var fbo = object._framebuffer
        if (fbo instanceof REGLFramebuffer) {
          return fbo
        }
      }
      return null
    },
    create: createFBO,
    clear: clearCache,
    refresh: refreshCache
  })
}

},{"./util/extend":21,"./util/values":32}],13:[function(require,module,exports){
var GL_SUBPIXEL_BITS = 0x0D50
var GL_RED_BITS = 0x0D52
var GL_GREEN_BITS = 0x0D53
var GL_BLUE_BITS = 0x0D54
var GL_ALPHA_BITS = 0x0D55
var GL_DEPTH_BITS = 0x0D56
var GL_STENCIL_BITS = 0x0D57

var GL_ALIASED_POINT_SIZE_RANGE = 0x846D
var GL_ALIASED_LINE_WIDTH_RANGE = 0x846E

var GL_MAX_TEXTURE_SIZE = 0x0D33
var GL_MAX_VIEWPORT_DIMS = 0x0D3A
var GL_MAX_VERTEX_ATTRIBS = 0x8869
var GL_MAX_VERTEX_UNIFORM_VECTORS = 0x8DFB
var GL_MAX_VARYING_VECTORS = 0x8DFC
var GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS = 0x8B4D
var GL_MAX_VERTEX_TEXTURE_IMAGE_UNITS = 0x8B4C
var GL_MAX_TEXTURE_IMAGE_UNITS = 0x8872
var GL_MAX_FRAGMENT_UNIFORM_VECTORS = 0x8DFD
var GL_MAX_CUBE_MAP_TEXTURE_SIZE = 0x851C
var GL_MAX_RENDERBUFFER_SIZE = 0x84E8

var GL_VENDOR = 0x1F00
var GL_RENDERER = 0x1F01
var GL_VERSION = 0x1F02
var GL_SHADING_LANGUAGE_VERSION = 0x8B8C

var GL_MAX_TEXTURE_MAX_ANISOTROPY_EXT = 0x84FF

var GL_MAX_COLOR_ATTACHMENTS_WEBGL = 0x8CDF
var GL_MAX_DRAW_BUFFERS_WEBGL = 0x8824

module.exports = function (gl, extensions) {
  var maxAnisotropic = 1
  if (extensions.ext_texture_filter_anisotropic) {
    maxAnisotropic = gl.getParameter(GL_MAX_TEXTURE_MAX_ANISOTROPY_EXT)
  }

  var maxDrawbuffers = 1
  var maxColorAttachments = 1
  if (extensions.webgl_draw_buffers) {
    maxDrawbuffers = gl.getParameter(GL_MAX_DRAW_BUFFERS_WEBGL)
    maxColorAttachments = gl.getParameter(GL_MAX_COLOR_ATTACHMENTS_WEBGL)
  }

  return {
    // drawing buffer bit depth
    colorBits: [
      gl.getParameter(GL_RED_BITS),
      gl.getParameter(GL_GREEN_BITS),
      gl.getParameter(GL_BLUE_BITS),
      gl.getParameter(GL_ALPHA_BITS)
    ],
    depthBits: gl.getParameter(GL_DEPTH_BITS),
    stencilBits: gl.getParameter(GL_STENCIL_BITS),
    subpixelBits: gl.getParameter(GL_SUBPIXEL_BITS),

    // supported extensions
    extensions: Object.keys(extensions).filter(function (ext) {
      return !!extensions[ext]
    }),

    // max aniso samples
    maxAnisotropic: maxAnisotropic,

    // max draw buffers
    maxDrawbuffers: maxDrawbuffers,
    maxColorAttachments: maxColorAttachments,

    // point and line size ranges
    pointSizeDims: gl.getParameter(GL_ALIASED_POINT_SIZE_RANGE),
    lineWidthDims: gl.getParameter(GL_ALIASED_LINE_WIDTH_RANGE),
    maxViewportDims: gl.getParameter(GL_MAX_VIEWPORT_DIMS),
    maxCombinedTextureUnits: gl.getParameter(GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS),
    maxCubeMapSize: gl.getParameter(GL_MAX_CUBE_MAP_TEXTURE_SIZE),
    maxRenderbufferSize: gl.getParameter(GL_MAX_RENDERBUFFER_SIZE),
    maxTextureUnits: gl.getParameter(GL_MAX_TEXTURE_IMAGE_UNITS),
    maxTextureSize: gl.getParameter(GL_MAX_TEXTURE_SIZE),
    maxAttributes: gl.getParameter(GL_MAX_VERTEX_ATTRIBS),
    maxVertexUniforms: gl.getParameter(GL_MAX_VERTEX_UNIFORM_VECTORS),
    maxVertexTextureUnits: gl.getParameter(GL_MAX_VERTEX_TEXTURE_IMAGE_UNITS),
    maxVaryingVectors: gl.getParameter(GL_MAX_VARYING_VECTORS),
    maxFragmentUniforms: gl.getParameter(GL_MAX_FRAGMENT_UNIFORM_VECTORS),

    // vendor info
    glsl: gl.getParameter(GL_SHADING_LANGUAGE_VERSION),
    renderer: gl.getParameter(GL_RENDERER),
    vendor: gl.getParameter(GL_VENDOR),
    version: gl.getParameter(GL_VERSION)
  }
}

},{}],14:[function(require,module,exports){

var isTypedArray = require('./util/is-typed-array')

var GL_RGBA = 6408
var GL_UNSIGNED_BYTE = 5121
var GL_PACK_ALIGNMENT = 0x0D05

module.exports = function wrapReadPixels (gl, reglPoll, context) {
  function readPixels (input) {
    var options = input || {}
    if (isTypedArray(input)) {
      options = {
        data: options
      }
    } else if (arguments.length === 2) {
      options = {
        width: arguments[0] | 0,
        height: arguments[1] | 0
      }
    } else if (typeof input !== 'object') {
      options = {}
    }

    // Update WebGL state
    reglPoll()

    // Read viewport state
    var x = options.x || 0
    var y = options.y || 0
    var width = options.width || context.viewportWidth
    var height = options.height || context.viewportHeight

    // Compute size
    var size = width * height * 4

    // Allocate data
    var data = options.data || new Uint8Array(size)

    // Type check
    
    

    // Run read pixels
    gl.pixelStorei(GL_PACK_ALIGNMENT, 4)
    gl.readPixels(x, y, width, height, GL_RGBA, GL_UNSIGNED_BYTE, data)

    return data
  }

  return readPixels
}

},{"./util/is-typed-array":24}],15:[function(require,module,exports){

var values = require('./util/values')

var GL_RENDERBUFFER = 0x8D41

var GL_RGBA4 = 0x8056
var GL_RGB5_A1 = 0x8057
var GL_RGB565 = 0x8D62
var GL_DEPTH_COMPONENT16 = 0x81A5
var GL_STENCIL_INDEX8 = 0x8D48
var GL_DEPTH_STENCIL = 0x84F9

var GL_SRGB8_ALPHA8_EXT = 0x8C43

var GL_RGBA32F_EXT = 0x8814

var GL_RGBA16F_EXT = 0x881A
var GL_RGB16F_EXT = 0x881B

module.exports = function (gl, extensions, limits) {
  var formatTypes = {
    'rgba4': GL_RGBA4,
    'rgb565': GL_RGB565,
    'rgb5 a1': GL_RGB5_A1,
    'depth': GL_DEPTH_COMPONENT16,
    'stencil': GL_STENCIL_INDEX8,
    'depth stencil': GL_DEPTH_STENCIL
  }

  if (extensions.ext_srgb) {
    formatTypes['srgba'] = GL_SRGB8_ALPHA8_EXT
  }

  if (extensions.ext_color_buffer_half_float) {
    formatTypes['rgba16f'] = GL_RGBA16F_EXT
    formatTypes['rgb16f'] = GL_RGB16F_EXT
  }

  if (extensions.webgl_color_buffer_float) {
    formatTypes['rgba32f'] = GL_RGBA32F_EXT
  }

  var renderbufferCount = 0
  var renderbufferSet = {}

  function REGLRenderbuffer () {
    this.id = renderbufferCount++
    this.refCount = 1

    this.renderbuffer = null

    this.format = GL_RGBA4
    this.width = 0
    this.height = 0
  }

  REGLRenderbuffer.prototype.decRef = function () {
    if (--this.refCount === 0) {
      destroy(this)
    }
  }

  function refresh (rb) {
    if (!gl.isRenderbuffer(rb.renderbuffer)) {
      rb.renderbuffer = gl.createRenderbuffer()
    }
    gl.bindRenderbuffer(GL_RENDERBUFFER, rb.renderbuffer)
    gl.renderbufferStorage(
      GL_RENDERBUFFER,
      rb.format,
      rb.width,
      rb.height)
  }

  function destroy (rb) {
    var handle = rb.renderbuffer
    
    gl.bindRenderbuffer(GL_RENDERBUFFER, null)
    if (gl.isRenderbuffer(handle)) {
      gl.deleteRenderbuffer(handle)
    }
    rb.renderbuffer = null
    rb.refCount = 0
    delete renderbufferSet[rb.id]
  }

  function createRenderbuffer (input) {
    var renderbuffer = new REGLRenderbuffer()
    renderbufferSet[renderbuffer.id] = renderbuffer

    function reglRenderbuffer (input) {
      var options = input || {}

      var w = 0
      var h = 0
      if ('shape' in options) {
        var shape = options.shape
        
        w = shape[0] | 0
        h = shape[1] | 0
      } else {
        if ('radius' in options) {
          w = h = options.radius | 0
        }
        if ('width' in options) {
          w = options.width | 0
        }
        if ('height' in options) {
          h = options.height | 0
        }
      }
      var s = limits.maxRenderbufferSize
      
      reglRenderbuffer.width = renderbuffer.width = Math.max(w, 1)
      reglRenderbuffer.height = renderbuffer.height = Math.max(h, 1)

      renderbuffer.format = GL_RGBA4
      if ('format' in options) {
        var format = options.format
        
        renderbuffer.format = formatTypes[format]
      }

      refresh(renderbuffer)

      return reglRenderbuffer
    }

    reglRenderbuffer(input)

    reglRenderbuffer._reglType = 'renderbuffer'
    reglRenderbuffer._renderbuffer = renderbuffer
    reglRenderbuffer.destroy = function () {
      renderbuffer.decRef()
    }

    return reglRenderbuffer
  }

  function refreshRenderbuffers () {
    values(renderbufferSet).forEach(refresh)
  }

  function destroyRenderbuffers () {
    values(renderbufferSet).forEach(destroy)
  }

  return {
    create: createRenderbuffer,
    refresh: refreshRenderbuffers,
    clear: destroyRenderbuffers
  }
}

},{"./util/values":32}],16:[function(require,module,exports){

var values = require('./util/values')

var GL_FRAGMENT_SHADER = 35632
var GL_VERTEX_SHADER = 35633

var GL_ACTIVE_UNIFORMS = 0x8B86
var GL_ACTIVE_ATTRIBUTES = 0x8B89

module.exports = function wrapShaderState (gl, stringStore) {
  // ===================================================
  // glsl compilation and linking
  // ===================================================
  var fragShaders = {}
  var vertShaders = {}

  function ActiveInfo (name, id, location, info) {
    this.name = name
    this.id = id
    this.location = location
    this.info = info
  }

  function insertActiveInfo (list, info) {
    for (var i = 0; i < list.length; ++i) {
      if (list[i].id === info.id) {
        list[i].location = info.location
        return
      }
    }
    list.push(info)
  }

  function getShader (type, id, command) {
    var cache = type === GL_FRAGMENT_SHADER ? fragShaders : vertShaders
    var shader = cache[id]

    if (!shader) {
      var source = stringStore.str(id)
      shader = gl.createShader(type)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      
      cache[id] = shader
    }

    return shader
  }

  // ===================================================
  // program linking
  // ===================================================
  var programCache = {}
  var programList = []

  var PROGRAM_COUNTER = 0

  function REGLProgram (fragId, vertId) {
    this.id = PROGRAM_COUNTER++
    this.fragId = fragId
    this.vertId = vertId
    this.program = null
    this.uniforms = []
    this.attributes = []
  }

  function linkProgram (desc, command) {
    var i, info

    // -------------------------------
    // compile & link
    // -------------------------------
    var fragShader = getShader(GL_FRAGMENT_SHADER, desc.fragId)
    var vertShader = getShader(GL_VERTEX_SHADER, desc.vertId)

    var program = desc.program = gl.createProgram()
    gl.attachShader(program, fragShader)
    gl.attachShader(program, vertShader)
    gl.linkProgram(program)
    

    // -------------------------------
    // grab uniforms
    // -------------------------------
    var numUniforms = gl.getProgramParameter(program, GL_ACTIVE_UNIFORMS)
    var uniforms = desc.uniforms
    for (i = 0; i < numUniforms; ++i) {
      info = gl.getActiveUniform(program, i)
      if (info) {
        if (info.size > 1) {
          for (var j = 0; j < info.size; ++j) {
            var name = info.name.replace('[0]', '[' + j + ']')
            insertActiveInfo(uniforms, new ActiveInfo(
              name,
              stringStore.id(name),
              gl.getUniformLocation(program, name),
              info))
          }
        } else {
          insertActiveInfo(uniforms, new ActiveInfo(
            info.name,
            stringStore.id(info.name),
            gl.getUniformLocation(program, info.name),
            info))
        }
      }
    }

    // -------------------------------
    // grab attributes
    // -------------------------------
    var numAttributes = gl.getProgramParameter(program, GL_ACTIVE_ATTRIBUTES)
    var attributes = desc.attributes
    for (i = 0; i < numAttributes; ++i) {
      info = gl.getActiveAttrib(program, i)
      if (info) {
        insertActiveInfo(attributes, new ActiveInfo(
          info.name,
          stringStore.id(info.name),
          gl.getAttribLocation(program, info.name),
          info))
      }
    }
  }

  return {
    clear: function () {
      var deleteShader = gl.deleteShader.bind(gl)
      values(fragShaders).forEach(deleteShader)
      fragShaders = {}
      values(vertShaders).forEach(deleteShader)
      vertShaders = {}

      programList.forEach(function (desc) {
        gl.deleteProgram(desc.program)
      })
      programList.length = 0
      programCache = {}
    },

    refresh: function () {
      fragShaders = {}
      vertShaders = {}
      programList.forEach(linkProgram)
    },

    program: function (vertId, fragId, command) {
      
      

      var cache = programCache[fragId]
      if (!cache) {
        cache = programCache[fragId] = {}
      }
      var program = cache[vertId]
      if (!program) {
        program = new REGLProgram(fragId, vertId)
        linkProgram(program, command)
        cache[vertId] = program
        programList.push(program)
      }
      return program
    },

    shader: getShader,

    frag: null,
    vert: null
  }
}

},{"./util/values":32}],17:[function(require,module,exports){
module.exports = function createStringStore () {
  var stringIds = {'': 0}
  var stringValues = ['']
  return {
    id: function (str) {
      var result = stringIds[str]
      if (result) {
        return result
      }
      result = stringIds[str] = stringValues.length
      stringValues.push(str)
      return result
    },

    str: function (id) {
      return stringValues[id]
    }
  }
}

},{}],18:[function(require,module,exports){

var extend = require('./util/extend')
var values = require('./util/values')
var isTypedArray = require('./util/is-typed-array')
var isNDArrayLike = require('./util/is-ndarray')
var loadTexture = require('./util/load-texture')
var convertToHalfFloat = require('./util/to-half-float')
var parseDDS = require('./util/parse-dds')

var GL_COMPRESSED_TEXTURE_FORMATS = 0x86A3

var GL_TEXTURE_2D = 0x0DE1
var GL_TEXTURE_CUBE_MAP = 0x8513
var GL_TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515

var GL_RGBA = 0x1908
var GL_ALPHA = 0x1906
var GL_RGB = 0x1907
var GL_LUMINANCE = 0x1909
var GL_LUMINANCE_ALPHA = 0x190A

var GL_RGBA4 = 0x8056
var GL_RGB5_A1 = 0x8057
var GL_RGB565 = 0x8D62

var GL_UNSIGNED_SHORT_4_4_4_4 = 0x8033
var GL_UNSIGNED_SHORT_5_5_5_1 = 0x8034
var GL_UNSIGNED_SHORT_5_6_5 = 0x8363
var GL_UNSIGNED_INT_24_8_WEBGL = 0x84FA

var GL_DEPTH_COMPONENT = 0x1902
var GL_DEPTH_STENCIL = 0x84F9

var GL_SRGB_EXT = 0x8C40
var GL_SRGB_ALPHA_EXT = 0x8C42

var GL_HALF_FLOAT_OES = 0x8D61

var GL_COMPRESSED_RGB_S3TC_DXT1_EXT = 0x83F0
var GL_COMPRESSED_RGBA_S3TC_DXT1_EXT = 0x83F1
var GL_COMPRESSED_RGBA_S3TC_DXT3_EXT = 0x83F2
var GL_COMPRESSED_RGBA_S3TC_DXT5_EXT = 0x83F3

var GL_COMPRESSED_RGB_ATC_WEBGL = 0x8C92
var GL_COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL = 0x8C93
var GL_COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL = 0x87EE

var GL_COMPRESSED_RGB_PVRTC_4BPPV1_IMG = 0x8C00
var GL_COMPRESSED_RGB_PVRTC_2BPPV1_IMG = 0x8C01
var GL_COMPRESSED_RGBA_PVRTC_4BPPV1_IMG = 0x8C02
var GL_COMPRESSED_RGBA_PVRTC_2BPPV1_IMG = 0x8C03

var GL_COMPRESSED_RGB_ETC1_WEBGL = 0x8D64

var GL_UNSIGNED_BYTE = 0x1401
var GL_UNSIGNED_SHORT = 0x1403
var GL_UNSIGNED_INT = 0x1405
var GL_FLOAT = 0x1406

var GL_TEXTURE_WRAP_S = 0x2802
var GL_TEXTURE_WRAP_T = 0x2803

var GL_REPEAT = 0x2901
var GL_CLAMP_TO_EDGE = 0x812F
var GL_MIRRORED_REPEAT = 0x8370

var GL_TEXTURE_MAG_FILTER = 0x2800
var GL_TEXTURE_MIN_FILTER = 0x2801

var GL_NEAREST = 0x2600
var GL_LINEAR = 0x2601
var GL_NEAREST_MIPMAP_NEAREST = 0x2700
var GL_LINEAR_MIPMAP_NEAREST = 0x2701
var GL_NEAREST_MIPMAP_LINEAR = 0x2702
var GL_LINEAR_MIPMAP_LINEAR = 0x2703

var GL_GENERATE_MIPMAP_HINT = 0x8192
var GL_DONT_CARE = 0x1100
var GL_FASTEST = 0x1101
var GL_NICEST = 0x1102

var GL_TEXTURE_MAX_ANISOTROPY_EXT = 0x84FE

var GL_UNPACK_ALIGNMENT = 0x0CF5
var GL_UNPACK_FLIP_Y_WEBGL = 0x9240
var GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL = 0x9241
var GL_UNPACK_COLORSPACE_CONVERSION_WEBGL = 0x9243

var GL_BROWSER_DEFAULT_WEBGL = 0x9244

var GL_TEXTURE0 = 0x84C0

var MIPMAP_FILTERS = [
  GL_NEAREST_MIPMAP_NEAREST,
  GL_NEAREST_MIPMAP_LINEAR,
  GL_LINEAR_MIPMAP_NEAREST,
  GL_LINEAR_MIPMAP_LINEAR
]

function isPow2 (v) {
  return !(v & (v - 1)) && (!!v)
}

function isNumericArray (arr) {
  return (
    Array.isArray(arr) &&
    (arr.length === 0 ||
    typeof arr[0] === 'number'))
}

function isRectArray (arr) {
  if (!Array.isArray(arr)) {
    return false
  }

  var width = arr.length
  if (width === 0 || !Array.isArray(arr[0])) {
    return false
  }

  var height = arr[0].length
  for (var i = 1; i < width; ++i) {
    if (!Array.isArray(arr[i]) || arr[i].length !== height) {
      return false
    }
  }
  return true
}

function classString (x) {
  return Object.prototype.toString.call(x)
}

function isCanvasElement (object) {
  return classString(object) === '[object HTMLCanvasElement]'
}

function isContext2D (object) {
  return classString(object) === '[object CanvasRenderingContext2D]'
}

function isImageElement (object) {
  return classString(object) === '[object HTMLImageElement]'
}

function isVideoElement (object) {
  return classString(object) === '[object HTMLVideoElement]'
}

function isPendingXHR (object) {
  return classString(object) === '[object XMLHttpRequest]'
}

function isPixelData (object) {
  return (
    typeof object === 'string' ||
    (!!object && (
      isTypedArray(object) ||
      isNumericArray(object) ||
      isNDArrayLike(object) ||
      isCanvasElement(object) ||
      isContext2D(object) ||
      isImageElement(object) ||
      isVideoElement(object) ||
      isRectArray(object))))
}

// Transpose an array of pixels
function transposePixels (data, nx, ny, nc, sx, sy, sc, off) {
  var result = new data.constructor(nx * ny * nc)
  var ptr = 0
  for (var i = 0; i < ny; ++i) {
    for (var j = 0; j < nx; ++j) {
      for (var k = 0; k < nc; ++k) {
        result[ptr++] = data[sy * i + sx * j + sc * k + off]
      }
    }
  }
  return result
}

module.exports = function createTextureSet (gl, extensions, limits, reglPoll, contextState) {
  var mipmapHint = {
    "don't care": GL_DONT_CARE,
    'dont care': GL_DONT_CARE,
    'nice': GL_NICEST,
    'fast': GL_FASTEST
  }

  var wrapModes = {
    'repeat': GL_REPEAT,
    'clamp': GL_CLAMP_TO_EDGE,
    'mirror': GL_MIRRORED_REPEAT
  }

  var magFilters = {
    'nearest': GL_NEAREST,
    'linear': GL_LINEAR
  }

  var minFilters = extend({
    'nearest mipmap nearest': GL_NEAREST_MIPMAP_NEAREST,
    'linear mipmap nearest': GL_LINEAR_MIPMAP_NEAREST,
    'nearest mipmap linear': GL_NEAREST_MIPMAP_LINEAR,
    'linear mipmap linear': GL_LINEAR_MIPMAP_LINEAR,
    'mipmap': GL_LINEAR_MIPMAP_LINEAR
  }, magFilters)

  var colorSpace = {
    'none': 0,
    'browser': GL_BROWSER_DEFAULT_WEBGL
  }

  var textureTypes = {
    'uint8': GL_UNSIGNED_BYTE,
    'rgba4': GL_UNSIGNED_SHORT_4_4_4_4,
    'rgb565': GL_UNSIGNED_SHORT_5_6_5,
    'rgb5 a1': GL_UNSIGNED_SHORT_5_5_5_1
  }

  var textureFormats = {
    'alpha': GL_ALPHA,
    'luminance': GL_LUMINANCE,
    'luminance alpha': GL_LUMINANCE_ALPHA,
    'rgb': GL_RGB,
    'rgba': GL_RGBA,
    'rgba4': GL_RGBA4,
    'rgb5 a1': GL_RGB5_A1,
    'rgb565': GL_RGB565
  }

  var compressedTextureFormats = {}

  if (extensions.ext_srgb) {
    textureFormats.srgb = GL_SRGB_EXT
    textureFormats.srgba = GL_SRGB_ALPHA_EXT
  }

  if (extensions.oes_texture_float) {
    textureTypes.float = GL_FLOAT
  }

  if (extensions.oes_texture_half_float) {
    textureTypes['half float'] = GL_HALF_FLOAT_OES
  }

  if (extensions.webgl_depth_texture) {
    extend(textureFormats, {
      'depth': GL_DEPTH_COMPONENT,
      'depth stencil': GL_DEPTH_STENCIL
    })

    extend(textureTypes, {
      'uint16': GL_UNSIGNED_SHORT,
      'uint32': GL_UNSIGNED_INT,
      'depth stencil': GL_UNSIGNED_INT_24_8_WEBGL
    })
  }

  if (extensions.webgl_compressed_texture_s3tc) {
    extend(compressedTextureFormats, {
      'rgb s3tc dxt1': GL_COMPRESSED_RGB_S3TC_DXT1_EXT,
      'rgba s3tc dxt1': GL_COMPRESSED_RGBA_S3TC_DXT1_EXT,
      'rgba s3tc dxt3': GL_COMPRESSED_RGBA_S3TC_DXT3_EXT,
      'rgba s3tc dxt5': GL_COMPRESSED_RGBA_S3TC_DXT5_EXT
    })
  }

  if (extensions.webgl_compressed_texture_atc) {
    extend(compressedTextureFormats, {
      'rgb arc': GL_COMPRESSED_RGB_ATC_WEBGL,
      'rgba atc explicit alpha': GL_COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL,
      'rgba atc interpolated alpha': GL_COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL
    })
  }

  if (extensions.webgl_compressed_texture_pvrtc) {
    extend(compressedTextureFormats, {
      'rgb pvrtc 4bppv1': GL_COMPRESSED_RGB_PVRTC_4BPPV1_IMG,
      'rgb pvrtc 2bppv1': GL_COMPRESSED_RGB_PVRTC_2BPPV1_IMG,
      'rgba pvrtc 4bppv1': GL_COMPRESSED_RGBA_PVRTC_4BPPV1_IMG,
      'rgba pvrtc 2bppv1': GL_COMPRESSED_RGBA_PVRTC_2BPPV1_IMG
    })
  }

  if (extensions.webgl_compressed_texture_etc1) {
    compressedTextureFormats['rgb etc1'] = GL_COMPRESSED_RGB_ETC1_WEBGL
  }

  // Copy over all texture formats
  var supportedCompressedFormats = Array.prototype.slice.call(
    gl.getParameter(GL_COMPRESSED_TEXTURE_FORMATS))
  Object.keys(compressedTextureFormats).forEach(function (name) {
    var format = compressedTextureFormats[name]
    if (supportedCompressedFormats.indexOf(format) >= 0) {
      textureFormats[name] = format
    }
  })

  var supportedFormats = Object.keys(textureFormats)
  limits.textureFormats = supportedFormats

  var colorFormats = supportedFormats.reduce(function (color, key) {
    var glenum = textureFormats[key]
    if (glenum === GL_LUMINANCE ||
        glenum === GL_ALPHA ||
        glenum === GL_LUMINANCE ||
        glenum === GL_LUMINANCE_ALPHA ||
        glenum === GL_DEPTH_COMPONENT ||
        glenum === GL_DEPTH_STENCIL) {
      color[glenum] = glenum
    } else if (glenum === GL_RGB5_A1 || key.indexOf('rgba') >= 0) {
      color[glenum] = GL_RGBA
    } else {
      color[glenum] = GL_RGB
    }
    return color
  }, {})

  // Pixel storage parsing
  function PixelInfo (target) {
    // tex target
    this.target = target

    // pixelStorei info
    this.flipY = false
    this.premultiplyAlpha = false
    this.unpackAlignment = 1
    this.colorSpace = 0

    // shape
    this.width = 0
    this.height = 0
    this.channels = 0

    // format and type
    this.format = 0
    this.internalformat = 0
    this.type = 0
    this.compressed = false

    // mip level
    this.miplevel = 0

    // ndarray-like parameters
    this.strideX = 0
    this.strideY = 0
    this.strideC = 0
    this.offset = 0

    // copy pixels info
    this.x = 0
    this.y = 0
    this.copy = false

    // data sources
    this.data = null
    this.image = null
    this.video = null
    this.canvas = null
    this.xhr = null

    // CORS
    this.crossOrigin = null

    // horrible state flags
    this.needsPoll = false
    this.needsListeners = false
  }

  extend(PixelInfo.prototype, {
    parseFlags: function (options) {
      if (typeof options !== 'object' || !options) {
        return
      }

      if ('premultiplyAlpha' in options) {
        
        this.premultiplyAlpha = options.premultiplyAlpha
      }

      if ('flipY' in options) {
        
        this.flipY = options.flipY
      }

      if ('alignment' in options) {
        
        this.unpackAlignment = options.alignment
      }

      if ('colorSpace' in options) {
        
        this.colorSpace = colorSpace[options.colorSpace]
      }

      if ('format' in options) {
        var format = options.format
        
        this.internalformat = textureFormats[format]
        if (format in textureTypes) {
          this.type = textureTypes[format]
        }
        if (format in compressedTextureFormats) {
          this.compressed = true
        }
      }

      if ('type' in options) {
        var type = options.type
        
        this.type = textureTypes[type]
      }

      var w = this.width
      var h = this.height
      var c = this.channels
      if ('shape' in options) {
        
        w = options.shape[0]
        h = options.shape[1]
        if (options.shape.length === 3) {
          c = options.shape[2]
        }
      } else {
        if ('radius' in options) {
          w = h = options.radius
        }
        if ('width' in options) {
          w = options.width
        }
        if ('height' in options) {
          h = options.height
        }
        if ('channels' in options) {
          c = options.channels
        }
      }
      this.width = w | 0
      this.height = h | 0
      this.channels = c | 0

      if ('stride' in options) {
        var stride = options.stride
        
        this.strideX = stride[0]
        this.strideY = stride[1]
        if (stride.length === 3) {
          this.strideC = stride[2]
        } else {
          this.strideC = 1
        }
        this.needsTranspose = true
      } else {
        this.strideC = 1
        this.strideX = this.strideC * c
        this.strideY = this.strideX * w
      }

      if ('offset' in options) {
        this.offset = options.offset | 0
        this.needsTranspose = true
      }

      if ('crossOrigin' in options) {
        this.crossOrigin = options.crossOrigin
      }
    },
    parse: function (options, miplevel) {
      this.miplevel = miplevel
      this.width = this.width >> miplevel
      this.height = this.height >> miplevel

      var data = options
      switch (typeof options) {
        case 'string':
          break
        case 'object':
          if (!options) {
            return
          }
          this.parseFlags(options)
          if (isPixelData(options.data)) {
            data = options.data
          }
          break
        case 'undefined':
          return
        default:
          
      }

      if (typeof data === 'string') {
        data = loadTexture(data, this.crossOrigin)
      }

      var array = null
      var needsConvert = false

      if (this.compressed) {
        
      }

      if (data === null) {
        // TODO
      } else if (isTypedArray(data)) {
        this.data = data
      } else if (isNumericArray(data)) {
        array = data
        needsConvert = true
      } else if (isNDArrayLike(data)) {
        if (Array.isArray(data.data)) {
          array = data.data
          needsConvert = true
        } else {
          this.data = data.data
        }
        var shape = data.shape
        this.width = shape[0]
        this.height = shape[1]
        if (shape.length === 3) {
          this.channels = shape[2]
        } else {
          this.channels = 1
        }
        var stride = data.stride
        this.strideX = data.stride[0]
        this.strideY = data.stride[1]
        if (stride.length === 3) {
          this.strideC = data.stride[2]
        } else {
          this.strideC = 1
        }
        this.offset = data.offset
        this.needsTranspose = true
      } else if (isCanvasElement(data) || isContext2D(data)) {
        if (isCanvasElement(data)) {
          this.canvas = data
        } else {
          this.canvas = data.canvas
        }
        this.width = this.canvas.width
        this.height = this.canvas.height
        this.setDefaultFormat()
      } else if (isImageElement(data)) {
        this.image = data
        if (!data.complete) {
          this.width = this.width || data.naturalWidth
          this.height = this.height || data.naturalHeight
          this.needsListeners = true
        } else {
          this.width = data.naturalWidth
          this.height = data.naturalHeight
        }
        this.setDefaultFormat()
      } else if (isVideoElement(data)) {
        this.video = data
        if (data.readyState > 1) {
          this.width = data.width
          this.height = data.height
        } else {
          this.width = this.width || data.width
          this.height = this.height || data.height
          this.needsListeners = true
        }
        this.needsPoll = true
        this.setDefaultFormat()
      } else if (isPendingXHR(data)) {
        this.xhr = data
        this.needsListeners = true
      } else if (isRectArray(data)) {
        var w = data[0].length
        var h = data.length
        var c = 1
        var i, j, k, p
        if (Array.isArray(data[0][0])) {
          c = data[0][0].length
          
          array = Array(w * h * c)
          p = 0
          for (j = 0; j < h; ++j) {
            for (i = 0; i < w; ++i) {
              for (k = 0; k < c; ++k) {
                array[p++] = data[j][i][k]
              }
            }
          }
        } else {
          array = Array(w * h)
          p = 0
          for (j = 0; j < h; ++j) {
            for (i = 0; i < w; ++i) {
              array[p++] = data[j][i]
            }
          }
        }
        this.width = w
        this.height = h
        this.channels = c
        needsConvert = true
      } else if (options.copy) {
        this.copy = true
        this.x = this.x | 0
        this.y = this.y | 0
        this.width = (this.width || contextState.viewportWidth) | 0
        this.height = (this.height || contextState.viewportHeight) | 0
        this.setDefaultFormat()
      }

      // Fix up missing type info for typed arrays
      if (!this.type && this.data) {
        if (this.format === GL_DEPTH_COMPONENT) {
          if (this.data instanceof Uint16Array) {
            this.type = GL_UNSIGNED_SHORT
          } else if (this.data instanceof Uint32Array) {
            this.type = GL_UNSIGNED_INT
          }
        } else if (this.data instanceof Float32Array) {
          this.type = GL_FLOAT
        }
      }

      // Infer default format
      if (!this.internalformat) {
        var channels = this.channels = this.channels || 4
        this.internalformat = [
          GL_LUMINANCE,
          GL_LUMINANCE_ALPHA,
          GL_RGB,
          GL_RGBA][channels - 1]
        
      }

      var format = this.internalformat
      if (format === GL_DEPTH_COMPONENT || format === GL_DEPTH_STENCIL) {
        
        if (format === GL_DEPTH_COMPONENT) {
          
        }
        if (format === GL_DEPTH_STENCIL) {
          
        }
        
      }

      // Compute color format and number of channels
      var colorFormat = this.format = colorFormats[format]
      if (!this.channels) {
        switch (colorFormat) {
          case GL_LUMINANCE:
          case GL_ALPHA:
          case GL_DEPTH_COMPONENT:
            this.channels = 1
            break

          case GL_DEPTH_STENCIL:
          case GL_LUMINANCE_ALPHA:
            this.channels = 2
            break

          case GL_RGB:
            this.channels = 3
            break

          default:
            this.channels = 4
        }
      }

      // Check that texture type is supported
      var type = this.type
      if (type === GL_FLOAT) {
        
      } else if (type === GL_HALF_FLOAT_OES) {
        
      } else if (!type) {
        if (format === GL_DEPTH_COMPONENT) {
          type = GL_UNSIGNED_INT
        } else {
          type = GL_UNSIGNED_BYTE
        }
      }
      this.type = type

      // apply conversion
      if (needsConvert) {
        switch (type) {
          case GL_UNSIGNED_BYTE:
            this.data = new Uint8Array(array)
            break
          case GL_UNSIGNED_SHORT:
            this.data = new Uint16Array(array)
            break
          case GL_UNSIGNED_INT:
            this.data = new Uint32Array(array)
            break
          case GL_FLOAT:
            this.data = new Float32Array(array)
            break
          case GL_HALF_FLOAT_OES:
            this.data = convertToHalfFloat(array)
            break

          case GL_UNSIGNED_SHORT_5_6_5:
          case GL_UNSIGNED_SHORT_5_5_5_1:
          case GL_UNSIGNED_SHORT_4_4_4_4:
          case GL_UNSIGNED_INT_24_8_WEBGL:
            
            break

          default:
            
        }
      }

      if (this.data) {
        // apply transpose
        if (this.needsTranspose) {
          this.data = transposePixels(
            this.data,
            this.width,
            this.height,
            this.channels,
            this.strideX,
            this.strideY,
            this.strideC,
            this.offset)
        }
        // check data type
        switch (type) {
          case GL_UNSIGNED_BYTE:
            
            break
          case GL_UNSIGNED_SHORT_5_6_5:
          case GL_UNSIGNED_SHORT_5_5_5_1:
          case GL_UNSIGNED_SHORT_4_4_4_4:
          case GL_UNSIGNED_SHORT:
          case GL_HALF_FLOAT_OES:
            
            break
          case GL_UNSIGNED_INT:
            
            break

          case GL_FLOAT:
            
            break

          default:
            
        }
      }

      this.needsTranspose = false
    },

    setDefaultFormat: function () {
      this.format = this.internalformat = GL_RGBA
      this.type = GL_UNSIGNED_BYTE
      this.channels = 4
      this.compressed = false
    },

    upload: function (params) {
      gl.pixelStorei(GL_UNPACK_FLIP_Y_WEBGL, this.flipY)
      gl.pixelStorei(GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL, this.premultiplyAlpha)
      gl.pixelStorei(GL_UNPACK_COLORSPACE_CONVERSION_WEBGL, this.colorSpace)
      gl.pixelStorei(GL_UNPACK_ALIGNMENT, this.unpackAlignment)

      var target = this.target
      var miplevel = this.miplevel
      var image = this.image
      var canvas = this.canvas
      var video = this.video
      var data = this.data
      var internalformat = this.internalformat
      var format = this.format
      var type = this.type
      var width = this.width || Math.max(1, params.width >> miplevel)
      var height = this.height || Math.max(1, params.height >> miplevel)
      if (video && video.readyState > 2) {
        gl.texImage2D(target, miplevel, format, format, type, video)
      } else if (image && image.complete) {
        gl.texImage2D(target, miplevel, format, format, type, image)
      } else if (canvas) {
        gl.texImage2D(target, miplevel, format, format, type, canvas)
      } else if (this.compressed) {
        gl.compressedTexImage2D(target, miplevel, internalformat, width, height, 0, data)
      } else if (this.copy) {
        reglPoll()
        gl.copyTexImage2D(target, miplevel, format, this.x, this.y, width, height, 0)
      } else if (data) {
        gl.texImage2D(target, miplevel, format, width, height, 0, format, type, data)
      } else {
        gl.texImage2D(target, miplevel, format, width || 1, height || 1, 0, format, type, null)
      }
    }
  })

  function TexParams (target) {
    this.target = target

    // Default image shape info
    this.width = 0
    this.height = 0
    this.format = 0
    this.internalformat = 0
    this.type = 0

    // wrap mode
    this.wrapS = GL_CLAMP_TO_EDGE
    this.wrapT = GL_CLAMP_TO_EDGE

    // filtering
    this.minFilter = 0
    this.magFilter = GL_NEAREST
    this.anisotropic = 1

    // mipmaps
    this.genMipmaps = false
    this.mipmapHint = GL_DONT_CARE
  }

  extend(TexParams.prototype, {
    parse: function (options) {
      if (typeof options !== 'object' || !options) {
        return
      }

      if ('min' in options) {
        var minFilter = options.min
        
        this.minFilter = minFilters[minFilter]
      }

      if ('mag' in options) {
        var magFilter = options.mag
        
        this.magFilter = magFilters[magFilter]
      }

      var wrapS = this.wrapS
      var wrapT = this.wrapT
      if ('wrap' in options) {
        var wrap = options.wrap
        if (typeof wrap === 'string') {
          
          wrapS = wrapT = wrapModes[wrap]
        } else if (Array.isArray(wrap)) {
          
          
          wrapS = wrapModes[wrap[0]]
          wrapT = wrapModes[wrap[1]]
        }
      } else {
        if ('wrapS' in options) {
          var optWrapS = options.wrapS
          
          wrapS = wrapModes[optWrapS]
        }
        if ('wrapT' in options) {
          var optWrapT = options.wrapT
          
          wrapT = wrapModes[optWrapT]
        }
      }
      this.wrapS = wrapS
      this.wrapT = wrapT

      if ('anisotropic' in options) {
        var anisotropic = options.anisotropic
        
        this.anisotropic = options.anisotropic
      }

      if ('mipmap' in options) {
        var mipmap = options.mipmap
        switch (typeof mipmap) {
          case 'string':
            
            this.mipmapHint = mipmapHint[mipmap]
            this.genMipmaps = true
            break

          case 'boolean':
            this.genMipmaps = !!mipmap
            break

          case 'object':
            break

          default:
            
        }
      }
    },

    upload: function () {
      var target = this.target
      gl.texParameteri(target, GL_TEXTURE_MIN_FILTER, this.minFilter)
      gl.texParameteri(target, GL_TEXTURE_MAG_FILTER, this.magFilter)
      gl.texParameteri(target, GL_TEXTURE_WRAP_S, this.wrapS)
      gl.texParameteri(target, GL_TEXTURE_WRAP_T, this.wrapT)
      if (extensions.ext_texture_filter_anisotropic) {
        gl.texParameteri(target, GL_TEXTURE_MAX_ANISOTROPY_EXT, this.anisotropic)
      }
      if (this.genMipmaps) {
        gl.hint(GL_GENERATE_MIPMAP_HINT, this.mipmapHint)
        gl.generateMipmap(target)
      }
    }
  })

  // Final pass to merge params and pixel data
  function checkTextureComplete (params, pixels) {
    var i, pixmap

    var type = 0
    var format = 0
    var internalformat = 0
    var width = 0
    var height = 0
    var channels = 0
    var compressed = false
    var needsPoll = false
    var needsListeners = false
    var mipMask2D = 0
    var mipMaskCube = [0, 0, 0, 0, 0, 0]
    var cubeMask = 0
    var hasMip = false
    for (i = 0; i < pixels.length; ++i) {
      pixmap = pixels[i]
      width = width || (pixmap.width << pixmap.miplevel)
      height = height || (pixmap.height << pixmap.miplevel)
      type = type || pixmap.type
      format = format || pixmap.format
      internalformat = internalformat || pixmap.internalformat
      channels = channels || pixmap.channels
      needsPoll = needsPoll || pixmap.needsPoll
      needsListeners = needsListeners || pixmap.needsListeners
      compressed = compressed || pixmap.compressed

      var miplevel = pixmap.miplevel
      var target = pixmap.target
      hasMip = hasMip || (miplevel > 0)
      if (target === GL_TEXTURE_2D) {
        mipMask2D |= (1 << miplevel)
      } else {
        var face = target - GL_TEXTURE_CUBE_MAP_POSITIVE_X
        mipMaskCube[face] |= (1 << miplevel)
        cubeMask |= (1 << face)
      }
    }

    params.needsPoll = needsPoll
    params.needsListeners = needsListeners
    params.width = width
    params.height = height
    params.format = format
    params.internalformat = internalformat
    params.type = type

    var mipMask = hasMip ? (width << 1) - 1 : 1
    if (params.target === GL_TEXTURE_2D) {
      
      
    } else {
      
      for (i = 0; i < 6; ++i) {
        
      }
    }

    var mipFilter = (MIPMAP_FILTERS.indexOf(params.minFilter) >= 0)
    params.genMipmaps = !hasMip && (params.genMipmaps || mipFilter)
    var useMipmaps = hasMip || params.genMipmaps

    if (!params.minFilter) {
      params.minFilter = useMipmaps
        ? GL_LINEAR_MIPMAP_LINEAR
        : GL_NEAREST
    } else {
      
    }

    if (useMipmaps) {
      
    }

    if (params.genMipmaps) {
      
    }

    params.wrapS = params.wrapS || GL_CLAMP_TO_EDGE
    params.wrapT = params.wrapT || GL_CLAMP_TO_EDGE
    if (params.wrapS !== GL_CLAMP_TO_EDGE ||
        params.wrapT !== GL_CLAMP_TO_EDGE) {
      
    }

    if ((type === GL_FLOAT && !extensions.oes_texture_float_linear) ||
        (type === GL_HALF_FLOAT_OES &&
          !extensions.oes_texture_half_float_linear)) {
      
    }

    for (i = 0; i < pixels.length; ++i) {
      pixmap = pixels[i]
      var level = pixmap.miplevel
      if (pixmap.width) {
        
      }
      if (pixmap.height) {
        
      }
      if (pixmap.channels) {
        
      } else {
        pixmap.channels = channels
      }
      if (pixmap.format) {
        
      } else {
        pixmap.format = format
      }
      if (pixmap.internalformat) {
        
      } else {
        pixmap.internalformat = internalformat
      }
      if (pixmap.type) {
        
      } else {
        pixmap.type = type
      }
      if (pixmap.copy) {
        
      }
    }
  }

  var activeTexture = 0
  var textureCount = 0
  var textureSet = {}
  var pollSet = []
  var numTexUnits = limits.maxTextureUnits
  var textureUnits = Array(numTexUnits).map(function () {
    return null
  })

  function REGLTexture (target) {
    this.id = textureCount++
    this.refCount = 1

    this.target = target
    this.texture = null

    this.pollId = -1

    this.unit = -1
    this.bindCount = 0

    // cancels all pending callbacks
    this.cancelPending = null

    // parsed user inputs
    this.params = new TexParams(target)
    this.pixels = []
  }

  function update (texture, options) {
    var i
    clearListeners(texture)

    // Clear parameters and pixel data
    var params = texture.params
    TexParams.call(params, texture.target)
    var pixels = texture.pixels
    pixels.length = 0

    // parse parameters
    params.parse(options)

    // parse pixel data
    function parseMip (target, data) {
      var mipmap = data.mipmap
      var pixmap
      if (Array.isArray(mipmap)) {
        for (var i = 0; i < mipmap.length; ++i) {
          pixmap = new PixelInfo(target)
          pixmap.parseFlags(options)
          pixmap.parseFlags(data)
          pixmap.parse(mipmap[i], i)
          pixels.push(pixmap)
        }
      } else {
        pixmap = new PixelInfo(target)
        pixmap.parseFlags(options)
        pixmap.parse(data, 0)
        pixels.push(pixmap)
      }
    }
    if (texture.target === GL_TEXTURE_2D) {
      parseMip(GL_TEXTURE_2D, options)
    } else {
      var faces = options.faces || options
      if (Array.isArray(faces)) {
        
        for (i = 0; i < 6; ++i) {
          parseMip(GL_TEXTURE_CUBE_MAP_POSITIVE_X + i, faces[i])
        }
      } else if (typeof faces === 'string') {
        // TODO Read dds
      } else {
        // Initialize to all empty textures
        for (i = 0; i < 6; ++i) {
          parseMip(GL_TEXTURE_CUBE_MAP_POSITIVE_X + i, {})
        }
      }
    }

    // do a second pass to reconcile defaults
    checkTextureComplete(params, pixels)

    if (params.needsListeners) {
      hookListeners(texture)
    }

    if (params.needsPoll) {
      texture.pollId = pollSet.length
      pollSet.push(texture)
    }

    refresh(texture)
  }

  function refresh (texture) {
    if (!gl.isTexture(texture.texture)) {
      texture.texture = gl.createTexture()
    }

    // Lazy bind
    var target = texture.target
    var unit = texture.unit
    if (unit >= 0) {
      gl.activeTexture(GL_TEXTURE0 + unit)
      activeTexture = unit
    } else {
      gl.bindTexture(target, texture.texture)
    }

    // Upload
    var pixels = texture.pixels
    var params = texture.params
    for (var i = 0; i < pixels.length; ++i) {
      pixels[i].upload(params)
    }
    params.upload()

    // Lazy unbind
    if (unit < 0) {
      var active = textureUnits[activeTexture]
      if (active) {
        // restore binding state
        gl.bindTexture(active.target, active.texture)
      } else {
        // otherwise become new active
        texture.unit = activeTexture
        textureUnits[activeTexture] = texture
      }
    }
  }

  function hookListeners (texture) {
    var params = texture.params
    var pixels = texture.pixels

    // Appends all the texture data from the buffer to the current
    function appendDDS (target, miplevel, buffer) {
      var dds = parseDDS(buffer)

      

      if (dds.cube) {
        

        // TODO handle cube map DDS
        
      } else {
        
      }

      if (miplevel) {
        
      }

      dds.pixels.forEach(function (pixmap) {
        var info = new PixelInfo(dds.cube ? pixmap.target : target)

        info.channels = dds.channels
        info.compressed = dds.compressed
        info.type = dds.type
        info.internalformat = dds.format
        info.format = colorFormats[dds.format]

        info.width = pixmap.width
        info.height = pixmap.height
        info.miplevel = pixmap.miplevel || miplevel
        info.data = pixmap.data

        pixels.push(info)
      })
    }

    function onData () {
      // Update size of any newly loaded pixels
      for (var i = 0; i < pixels.length; ++i) {
        var pixelData = pixels[i]
        var image = pixelData.image
        var video = pixelData.video
        var xhr = pixelData.xhr
        if (image && image.complete) {
          pixelData.width = image.naturalWidth
          pixelData.height = image.naturalHeight
        } else if (video && video.readyState > 2) {
          pixelData.width = video.width
          pixelData.height = video.height
        } else if (xhr && xhr.readyState === 4) {
          pixels[i] = pixels[pixels.length - 1]
          pixels.pop()
          xhr.removeEventListener('readystatechange', refresh)
          appendDDS(pixelData.target, pixelData.miplevel, xhr.response)
        }
      }
      checkTextureComplete(params, pixels)
      refresh(texture)
    }

    pixels.forEach(function (pixelData) {
      if (pixelData.image && !pixelData.image.complete) {
        pixelData.image.addEventListener('load', onData)
      } else if (pixelData.video && pixelData.readyState < 1) {
        pixelData.video.addEventListener('progress', onData)
      } else if (pixelData.xhr) {
        pixelData.xhr.addEventListener('readystatechange', onData)
      }
    })

    texture.cancelPending = function detachListeners () {
      pixels.forEach(function (pixelData) {
        if (pixelData.image) {
          pixelData.image.removeEventListener('load', onData)
        } else if (pixelData.video) {
          pixelData.video.removeEventListener('progress', onData)
        } else if (pixelData.xhr) {
          pixelData.xhr.removeEventListener('readystatechange', onData)
          pixelData.xhr.abort()
        }
      })
    }
  }

  function clearListeners (texture) {
    var cancelPending = texture.cancelPending
    if (cancelPending) {
      cancelPending()
      texture.cancelPending = null
    }
    var id = texture.pollId
    if (id >= 0) {
      var other = pollSet[id] = pollSet[pollSet.length - 1]
      other.id = id
      pollSet.pop()
      texture.pollId = -1
    }
  }

  function destroy (texture) {
    var handle = texture.texture
    
    var unit = texture.unit
    var target = texture.target
    if (unit >= 0) {
      gl.activeTexture(GL_TEXTURE0 + unit)
      activeTexture = unit
      gl.bindTexture(target, null)
      textureUnits[unit] = null
    }
    clearListeners(texture)
    if (gl.isTexture(handle)) {
      gl.deleteTexture(handle)
    }
    texture.texture = null
    texture.params = null
    texture.pixels = null
    texture.refCount = 0
    delete textureSet[texture.id]
  }

  extend(REGLTexture.prototype, {
    bind: function () {
      var texture = this
      texture.bindCount += 1
      var unit = texture.unit
      if (unit < 0) {
        for (var i = 0; i < numTexUnits; ++i) {
          var other = textureUnits[i]
          if (other) {
            if (other.bindCount > 0) {
              continue
            }
            other.unit = -1
          }
          textureUnits[i] = texture
          unit = i
          break
        }
        if (unit >= numTexUnits) {
          
        }
        texture.unit = unit
        gl.activeTexture(GL_TEXTURE0 + unit)
        gl.bindTexture(texture.target, texture.texture)
        activeTexture = unit
      }
      return unit
    },

    unbind: function () {
      this.bindCount -= 1
    },

    decRef: function () {
      if (--this.refCount === 0) {
        destroy(this)
      }
    }
  })

  function createTexture (options, target) {
    var texture = new REGLTexture(target)
    textureSet[texture.id] = texture

    function reglTexture (a0, a1, a2, a3, a4, a5) {
      var options = a0 || {}
      if (target === GL_TEXTURE_CUBE_MAP && arguments.length === 6) {
        options = [a0, a1, a2, a3, a4, a5]
      }
      update(texture, options)
      reglTexture.width = texture.params.width
      reglTexture.height = texture.params.height
      return reglTexture
    }

    reglTexture(options)

    reglTexture._reglType = 'texture'
    reglTexture._texture = texture
    reglTexture.destroy = function () {
      texture.decRef()
    }

    return reglTexture
  }

  // Called after context restore
  function refreshTextures () {
    values(textureSet).forEach(refresh)
    for (var i = 0; i < numTexUnits; ++i) {
      textureUnits[i] = null
    }
    activeTexture = 0
    gl.activeTexture(GL_TEXTURE0)
  }

  // Called when regl is destroyed
  function destroyTextures () {
    for (var i = 0; i < numTexUnits; ++i) {
      gl.activeTexture(GL_TEXTURE0 + i)
      gl.bindTexture(GL_TEXTURE_2D, null)
      textureUnits[i] = null
    }
    gl.activeTexture(GL_TEXTURE0)
    activeTexture = 0
    values(textureSet).forEach(destroy)
  }

  // Called once per raf, updates video textures
  function pollTextures () {
    pollSet.forEach(refresh)
  }

  return {
    create: createTexture,
    refresh: refreshTextures,
    clear: destroyTextures,
    poll: pollTextures,
    getTexture: function (wrapper) {
      return null
    }
  }
}

},{"./util/extend":21,"./util/is-ndarray":23,"./util/is-typed-array":24,"./util/load-texture":25,"./util/parse-dds":27,"./util/to-half-float":30,"./util/values":32}],19:[function(require,module,exports){
/* globals performance */
module.exports =
  (typeof performance !== 'undefined' && performance.now)
  ? function () { return performance.now() }
  : function () { return +(new Date()) }

},{}],20:[function(require,module,exports){
var extend = require('./extend')

function slice (x) {
  return Array.prototype.slice.call(x)
}

function join (x) {
  return slice(x).join('')
}

module.exports = function createEnvironment () {
  // Unique variable id counter
  var varCounter = 0

  // Linked values are passed from this scope into the generated code block
  // Calling link() passes a value into the generated scope and returns
  // the variable name which it is bound to
  var linkedNames = []
  var linkedValues = []
  function link (value) {
    for (var i = 0; i < linkedValues.length; ++i) {
      if (linkedValues[i] === value) {
        return linkedNames[i]
      }
    }

    var name = 'g' + (varCounter++)
    linkedNames.push(name)
    linkedValues.push(value)
    return name
  }

  // create a code block
  function block () {
    var code = []
    function push () {
      code.push.apply(code, slice(arguments))
    }

    var vars = []
    function def () {
      var name = 'v' + (varCounter++)
      vars.push(name)

      if (arguments.length > 0) {
        code.push(name, '=')
        code.push.apply(code, slice(arguments))
        code.push(';')
      }

      return name
    }

    return extend(push, {
      def: def,
      toString: function () {
        return join([
          (vars.length > 0 ? 'var ' + vars + ';' : ''),
          join(code)
        ])
      }
    })
  }

  function scope () {
    var entry = block()
    var exit = block()

    var entryToString = entry.toString
    var exitToString = exit.toString

    function save (object, prop) {
      exit(object, prop, '=', entry.def(object, prop), ';')
    }

    return extend(entry, {
      entry: entry,
      exit: exit,
      save: save,
      set: function (object, prop, value) {
        save(object, prop)
        entry(object, prop, '=', value, ';')
      },
      toString: function () {
        return entryToString() + exitToString()
      }
    })
  }

  function conditional () {
    var pred = join(arguments)
    var thenBlock = scope()
    var elseBlock = scope()

    var thenToString = thenBlock.toString
    var elseToString = elseBlock.toString

    return extend(thenBlock, {
      then: function () {
        thenBlock.apply(thenBlock, slice(arguments))
        return this
      },
      else: function () {
        elseBlock.apply(elseBlock, slice(arguments))
        return this
      },
      toString: function () {
        var elseClause = elseToString()
        if (elseClause) {
          elseClause = 'else{' + elseClause + '}'
        }
        return join([
          'if(', pred, '){',
          thenToString(),
          '}', elseClause
        ])
      }
    })
  }

  // procedure list
  var globalBlock = block()
  var procedures = {}
  function proc (name, count) {
    var args = []
    function arg () {
      var name = 'a' + args.length
      args.push(name)
      return name
    }

    count = count || 0
    for (var i = 0; i < count; ++i) {
      arg()
    }

    var body = scope()
    var bodyToString = body.toString

    var result = procedures[name] = extend(body, {
      arg: arg,
      toString: function () {
        return join([
          'function(', args.join(), '){',
          bodyToString(),
          '}'
        ])
      }
    })

    return result
  }

  function compile () {
    var code = ['"use strict";',
      globalBlock,
      'return {']
    Object.keys(procedures).forEach(function (name) {
      code.push('"', name, '":', procedures[name].toString(), ',')
    })
    code.push('}')
    var src = join(code)
      .replace(/;/g, ';\n')
      .replace(/}/g, '}\n')
      .replace(/{/g, '{\n')
    var proc = Function.apply(null, linkedNames.concat(src))
    return proc.apply(null, linkedValues)
  }

  return {
    global: globalBlock,
    link: link,
    block: block,
    proc: proc,
    scope: scope,
    cond: conditional,
    compile: compile
  }
}

},{"./extend":21}],21:[function(require,module,exports){
module.exports = function (base, opts) {
  var keys = Object.keys(opts)
  for (var i = 0; i < keys.length; ++i) {
    base[keys[i]] = opts[keys[i]]
  }
  return base
}

},{}],22:[function(require,module,exports){
module.exports = function flatten (result, data, dimension) {
  var ptr = 0
  for (var i = 0; i < data.length; ++i) {
    var v = data[i]
    for (var j = 0; j < dimension; ++j) {
      result[ptr++] = v[j]
    }
  }
}

},{}],23:[function(require,module,exports){
var isTypedArray = require('./is-typed-array')

module.exports = function isNDArrayLike (obj) {
  return (
    !!obj &&
    typeof obj === 'object' &&
    Array.isArray(obj.shape) &&
    Array.isArray(obj.stride) &&
    typeof obj.offset === 'number' &&
    obj.shape.length === obj.stride.length &&
    (Array.isArray(obj.data) ||
      isTypedArray(obj.data)))
}

},{"./is-typed-array":24}],24:[function(require,module,exports){
var dtypes = require('../constants/arraytypes.json')
module.exports = function (x) {
  return Object.prototype.toString.call(x) in dtypes
}

},{"../constants/arraytypes.json":4}],25:[function(require,module,exports){
/* globals document, Image, XMLHttpRequest */

module.exports = loadTexture

function getExtension (url) {
  var parts = /\.(\w+)(\?.*)?$/.exec(url)
  if (parts && parts[1]) {
    return parts[1].toLowerCase()
  }
}

function isVideoExtension (url) {
  return [
    'avi',
    'asf',
    'gifv',
    'mov',
    'qt',
    'yuv',
    'mpg',
    'mpeg',
    'm2v',
    'mp4',
    'm4p',
    'm4v',
    'ogg',
    'ogv',
    'vob',
    'webm',
    'wmv'
  ].indexOf(url) >= 0
}

function isCompressedExtension (url) {
  return [
    'dds'
  ].indexOf(url) >= 0
}

function loadVideo (url, crossOrigin) {
  var video = document.createElement('video')
  video.autoplay = true
  video.loop = true
  if (crossOrigin) {
    video.crossOrigin = crossOrigin
  }
  video.src = url
  return video
}

function loadCompressedTexture (url, ext, crossOrigin) {
  var xhr = new XMLHttpRequest()
  xhr.responseType = 'arraybuffer'
  xhr.open('GET', url, true)
  xhr.send()
  return xhr
}

function loadImage (url, crossOrigin) {
  var image = new Image()
  if (crossOrigin) {
    image.crossOrigin = crossOrigin
  }
  image.src = url
  return image
}

// Currently this stuff only works in a DOM environment
function loadTexture (url, crossOrigin) {
  if (typeof document !== 'undefined') {
    var ext = getExtension(url)
    if (isVideoExtension(ext)) {
      return loadVideo(url, crossOrigin)
    }
    if (isCompressedExtension(ext)) {
      return loadCompressedTexture(url, ext, crossOrigin)
    }
    return loadImage(url, crossOrigin)
  }
  return null
}

},{}],26:[function(require,module,exports){
module.exports = function loop (n, f) {
  var result = Array(n)
  for (var i = 0; i < n; ++i) {
    result[i] = f(i)
  }
  return result
}

},{}],27:[function(require,module,exports){
// References:
//
// http://msdn.microsoft.com/en-us/library/bb943991.aspx/
// http://blog.tojicode.com/2011/12/compressed-textures-in-webgl.html
//


module.exports = parseDDS

var DDS_MAGIC = 0x20534444

var GL_TEXTURE_2D = 0x0DE1
var GL_TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515

var GL_COMPRESSED_RGB_S3TC_DXT1_EXT = 0x83F0
var GL_COMPRESSED_RGBA_S3TC_DXT1_EXT = 0x83F1
var GL_COMPRESSED_RGBA_S3TC_DXT3_EXT = 0x83F2
var GL_COMPRESSED_RGBA_S3TC_DXT5_EXT = 0x83F3

var GL_COMPRESSED_RGB_ETC1_WEBGL = 0x8D64

var GL_UNSIGNED_BYTE = 0x1401
// var GL_HALF_FLOAT_OES = 0x8D61
// var GL_FLOAT = 0x1406

var DDSD_MIPMAPCOUNT = 0x20000

var DDSCAPS2_CUBEMAP = 0x200
var DDSCAPS2_CUBEMAP_POSITIVEX = 0x400
var DDSCAPS2_CUBEMAP_NEGATIVEX = 0x800
var DDSCAPS2_CUBEMAP_POSITIVEY = 0x1000
var DDSCAPS2_CUBEMAP_NEGATIVEY = 0x2000
var DDSCAPS2_CUBEMAP_POSITIVEZ = 0x4000
var DDSCAPS2_CUBEMAP_NEGATIVEZ = 0x8000

var CUBEMAP_COMPLETE_FACES = (
  DDSCAPS2_CUBEMAP_POSITIVEX |
  DDSCAPS2_CUBEMAP_NEGATIVEX |
  DDSCAPS2_CUBEMAP_POSITIVEY |
  DDSCAPS2_CUBEMAP_NEGATIVEY |
  DDSCAPS2_CUBEMAP_POSITIVEZ |
  DDSCAPS2_CUBEMAP_NEGATIVEZ)

var DDPF_FOURCC = 0x4
var DDPF_RGB = 0x40

var FOURCC_DXT1 = 0x31545844
var FOURCC_DXT3 = 0x33545844
var FOURCC_DXT5 = 0x35545844
var FOURCC_ETC1 = 0x31435445

// DDS_HEADER {
var OFF_SIZE = 1        // int32 dwSize
var OFF_FLAGS = 2       // int32 dwFlags
var OFF_HEIGHT = 3      // int32 dwHeight
var OFF_WIDTH = 4       // int32 dwWidth
// var OFF_PITCH = 5       // int32 dwPitchOrLinearSize
// var OFF_DEPTH = 6       // int32 dwDepth
var OFF_MIPMAP = 7      // int32 dwMipMapCount; // offset: 7
// int32[11] dwReserved1
// DDS_PIXELFORMAT {
// var OFF_PF_SIZE = 19    // int32 dwSize; // offset: 19
var OFF_PF_FLAGS = 20   // int32 dwFlags
var OFF_FOURCC = 21     // char[4] dwFourCC
// var OFF_RGBA_BITS = 22  // int32 dwRGBBitCount
// var OFF_RED_MASK = 23   // int32 dwRBitMask
// var OFF_GREEN_MASK = 24 // int32 dwGBitMask
// var OFF_BLUE_MASK = 25  // int32 dwBBitMask
// var OFF_ALPHA_MASK = 26 // int32 dwABitMask; // offset: 26
// }
// var OFF_CAPS = 27       // int32 dwCaps; // offset: 27
var OFF_CAPS2 = 28      // int32 dwCaps2
// var OFF_CAPS3 = 29      // int32 dwCaps3
// var OFF_CAPS4 = 30      // int32 dwCaps4
// int32 dwReserved2 // offset 31

function parseDDS (arrayBuffer) {
  var header = new Int32Array(arrayBuffer)
  

  var flags = header[OFF_FLAGS]
  

  var width = header[OFF_WIDTH]
  var height = header[OFF_HEIGHT]

  var type = GL_UNSIGNED_BYTE
  var format = 0
  var blockBytes = 0
  var channels = 4
  switch (header[OFF_FOURCC]) {
    case FOURCC_DXT1:
      blockBytes = 8
      if (flags & DDPF_RGB) {
        channels = 3
        format = GL_COMPRESSED_RGB_S3TC_DXT1_EXT
      } else {
        format = GL_COMPRESSED_RGBA_S3TC_DXT1_EXT
      }
      break

    case FOURCC_DXT3:
      blockBytes = 16
      format = GL_COMPRESSED_RGBA_S3TC_DXT3_EXT
      break

    case FOURCC_DXT5:
      blockBytes = 16
      format = GL_COMPRESSED_RGBA_S3TC_DXT5_EXT
      break

    case FOURCC_ETC1:
      blockBytes = 8
      format = GL_COMPRESSED_RGB_ETC1_WEBGL
      break

    // TODO: Implement hdr and uncompressed textures

    default:
      // Handle uncompressed data here
      
  }

  var pixelFlags = header[OFF_PF_FLAGS]

  var mipmapCount = 1
  if (pixelFlags & DDSD_MIPMAPCOUNT) {
    mipmapCount = Math.max(1, header[OFF_MIPMAP])
  }

  var ptr = header[OFF_SIZE] + 4

  var result = {
    width: width,
    height: height,
    channels: channels,
    format: format,
    type: type,
    compressed: true,
    cube: false,
    pixels: []
  }

  function parseMips (target) {
    var mipWidth = width
    var mipHeight = height

    for (var i = 0; i < mipmapCount; ++i) {
      var size =
        Math.max(1, (mipWidth + 3) >> 2) *
        Math.max(1, (mipHeight + 3) >> 2) *
        blockBytes
      result.pixels.push({
        target: target,
        miplevel: i,
        width: mipWidth,
        height: mipHeight,
        data: new Uint8Array(arrayBuffer, ptr, size)
      })
      ptr += size
      mipWidth >>= 1
      mipHeight >>= 1
    }
  }

  var caps2 = header[OFF_CAPS2]
  var cubemap = !!(caps2 & DDSCAPS2_CUBEMAP)
  if (cubemap) {
    
    result.cube = true
    for (var i = 0; i < 6; ++i) {
      parseMips(GL_TEXTURE_CUBE_MAP_POSITIVE_X + i)
    }
  } else {
    parseMips(GL_TEXTURE_2D)
  }

  return result
}

},{}],28:[function(require,module,exports){
var loop = require('./loop')

var GL_BYTE = 5120
var GL_UNSIGNED_BYTE = 5121
var GL_SHORT = 5122
var GL_UNSIGNED_SHORT = 5123
var GL_INT = 5124
var GL_UNSIGNED_INT = 5125
var GL_FLOAT = 5126

var bufferPool = loop(8, function () {
  return []
})

function nextPow16 (v) {
  for (var i = 16; i <= (1 << 28); i *= 16) {
    if (v <= i) {
      return i
    }
  }
  return 0
}

function log2 (v) {
  var r, shift
  r = (v > 0xFFFF) << 4
  v >>>= r
  shift = (v > 0xFF) << 3
  v >>>= shift; r |= shift
  shift = (v > 0xF) << 2
  v >>>= shift; r |= shift
  shift = (v > 0x3) << 1
  v >>>= shift; r |= shift
  return r | (v >> 1)
}

function alloc (n) {
  var sz = nextPow16(n)
  var bin = bufferPool[log2(sz) >> 2]
  if (bin.length > 0) {
    return bin.pop()
  }
  return new ArrayBuffer(sz)
}

function free (buf) {
  bufferPool[log2(buf.byteLength) >> 2].push(buf)
}

function allocType (type, n) {
  switch (type) {
    case GL_BYTE:
      return new Int8Array(alloc(n), 0, n)
    case GL_UNSIGNED_BYTE:
      return new Uint8Array(alloc(n), 0, n)
    case GL_SHORT:
      return new Int16Array(alloc(2 * n), 0, n)
    case GL_UNSIGNED_SHORT:
      return new Uint16Array(alloc(2 * n), 0, n)
    case GL_INT:
      return new Int32Array(alloc(4 * n), 0, n)
    case GL_UNSIGNED_INT:
      return new Uint32Array(alloc(4 * n), 0, n)
    case GL_FLOAT:
      return new Float32Array(alloc(4 * n), 0, n)
    default:
      return null
  }
}

function freeType (array) {
  free(array.buffer)
}

module.exports = {
  alloc: alloc,
  free: free,
  allocType: allocType,
  freeType: freeType
}

},{"./loop":26}],29:[function(require,module,exports){
/* globals requestAnimationFrame, cancelAnimationFrame */
if (typeof requestAnimationFrame === 'function' &&
    typeof cancelAnimationFrame === 'function') {
  module.exports = {
    next: function (x) { return requestAnimationFrame(x) },
    cancel: function (x) { return cancelAnimationFrame(x) }
  }
} else {
  module.exports = {
    next: function (cb) {
      setTimeout(cb, 30)
    },
    cancel: clearTimeout
  }
}

},{}],30:[function(require,module,exports){
module.exports = function convertToHalfFloat (array) {
  var floats = new Float32Array(array)
  var uints = new Uint32Array(floats.buffer)
  var ushorts = new Uint16Array(array.length)

  for (var i = 0; i < array.length; ++i) {
    if (isNaN(array[i])) {
      ushorts[i] = 0xffff
    } else if (array[i] === Infinity) {
      ushorts[i] = 0x7c00
    } else if (array[i] === -Infinity) {
      ushorts[i] = 0xfc00
    } else {
      var x = uints[i]

      var sgn = (x >>> 31) << 15
      var exp = ((x << 1) >>> 24) - 127
      var frac = (x >> 13) & ((1 << 10) - 1)

      if (exp < -24) {
        // round non-representable denormals to 0
        ushorts[i] = sgn
      } else if (exp < -14) {
        // handle denormals
        var s = -14 - exp
        ushorts[i] = sgn + ((frac + (1 << 10)) >> s)
      } else if (exp > 15) {
        // round overflow to +/- Infinity
        ushorts[i] = sgn + 0x7c00
      } else {
        // otherwise convert directly
        ushorts[i] = sgn + ((exp + 15) << 10) + frac
      }
    }
  }

  return ushorts
}

},{}],31:[function(require,module,exports){
module.exports = function (
  result, data, shapeX, shapeY, strideX, strideY, offset) {
  var ptr = 0
  for (var i = 0; i < shapeX; ++i) {
    for (var j = 0; j < shapeY; ++j) {
      result[ptr++] = data[strideX * i + strideY * j + offset]
    }
  }
}

},{}],32:[function(require,module,exports){
module.exports = function (obj) {
  return Object.keys(obj).map(function (key) { return obj[key] })
}

},{}],33:[function(require,module,exports){
// Context and canvas creation helper functions
/*globals HTMLElement,WebGLRenderingContext*/


var extend = require('./util/extend')

function createCanvas (element, options) {
  var canvas = document.createElement('canvas')
  var args = getContext(canvas, options)

  extend(canvas.style, {
    border: 0,
    margin: 0,
    padding: 0,
    top: 0,
    left: 0
  })
  element.appendChild(canvas)

  if (element === document.body) {
    canvas.style.position = 'absolute'
    extend(element.style, {
      margin: 0,
      padding: 0
    })
  }

  var scale = +args.options.pixelRatio
  function resize () {
    var w = window.innerWidth
    var h = window.innerHeight
    if (element !== document.body) {
      var bounds = element.getBoundingClientRect()
      w = bounds.right - bounds.left
      h = bounds.top - bounds.bottom
    }
    canvas.width = scale * w
    canvas.height = scale * h
    extend(canvas.style, {
      width: w + 'px',
      height: h + 'px'
    })
  }

  window.addEventListener('resize', resize, false)

  var prevDestroy = args.options.onDestroy
  args.options = extend(extend({}, args.options), {
    onDestroy: function () {
      window.removeEventListener('resize', resize)
      element.removeChild(canvas)
      prevDestroy && prevDestroy()
    }
  })

  resize()

  return args
}

function getContext (canvas, options) {
  var glOptions = options.glOptions || {}

  function get (name) {
    try {
      return canvas.getContext(name, glOptions)
    } catch (e) {
      return null
    }
  }

  var gl = get('webgl') ||
           get('experimental-webgl') ||
           get('webgl-experimental')

  

  return {
    gl: gl,
    options: extend({
      pixelRatio: window.devicePixelRatio
    }, options)
  }
}

module.exports = function parseArgs (args) {
  if (typeof document === 'undefined' ||
      typeof HTMLElement === 'undefined') {
    return {
      gl: args[0],
      options: args[1] || {}
    }
  }

  var element = document.body
  var options = args[1] || {}

  if (typeof args[0] === 'string') {
    element = document.querySelector(args[0]) || document.body
  } else if (typeof args[0] === 'object') {
    if (args[0] instanceof HTMLElement) {
      element = args[0]
    } else if (args[0] instanceof WebGLRenderingContext) {
      return {
        gl: args[0],
        options: extend({
          pixelRatio: 1
        }, options)
      }
    } else {
      options = args[0]
    }
  }

  if (element.nodeName && element.nodeName.toUpperCase() === 'CANVAS') {
    return getContext(element, options)
  } else {
    return createCanvas(element, options)
  }
}

},{"./util/extend":21}],34:[function(require,module,exports){
'use strict'

module.exports = angleNormals

function hypot(x, y, z) {
  return Math.sqrt(Math.pow(x,2) + Math.pow(y,2) + Math.pow(z,2))
}

function weight(s, r, a) {
  return Math.atan2(r, (s - a))
}

function mulAdd(dest, s, x, y, z) {
  dest[0] += s * x
  dest[1] += s * y
  dest[2] += s * z
}

function angleNormals(cells, positions) {
  var numVerts = positions.length
  var numCells = cells.length

  //Allocate normal array
  var normals = new Array(numVerts)
  for(var i=0; i<numVerts; ++i) {
    normals[i] = [0,0,0]
  }

  //Scan cells, and
  for(var i=0; i<numCells; ++i) {
    var cell = cells[i]
    var a = positions[cell[0]]
    var b = positions[cell[1]]
    var c = positions[cell[2]]

    var abx = a[0] - b[0]
    var aby = a[1] - b[1]
    var abz = a[2] - b[2]
    var ab = hypot(abx, aby, abz)

    var bcx = b[0] - c[0]
    var bcy = b[1] - c[1]
    var bcz = b[2] - c[2]
    var bc = hypot(bcx, bcy, bcz)

    var cax = c[0] - a[0]
    var cay = c[1] - a[1]
    var caz = c[2] - a[2]
    var ca = hypot(cax, cay, caz)

    if(Math.min(ab, bc, ca) < 1e-6) {
      continue
    }

    var s = 0.5 * (ab + bc + ca)
    var r = Math.sqrt((s - ab)*(s - bc)*(s - ca)/s)

    var nx = aby * bcz - abz * bcy
    var ny = abz * bcx - abx * bcz
    var nz = abx * bcy - aby * bcx
    var nl = hypot(nx, ny, nz)
    nx /= nl
    ny /= nl
    nz /= nl

    mulAdd(normals[cell[0]], weight(s, r, bc), nx, ny, nz)
    mulAdd(normals[cell[1]], weight(s, r, ca), nx, ny, nz)
    mulAdd(normals[cell[2]], weight(s, r, ab), nx, ny, nz)
  }

  //Normalize all the normals
  for(var i=0; i<numVerts; ++i) {
    var n = normals[i]
    var l = Math.sqrt(
      Math.pow(n[0], 2) +
      Math.pow(n[1], 2) +
      Math.pow(n[2], 2))
    if(l < 1e-8) {
      n[0] = 1
      n[1] = 0
      n[2] = 0
      continue
    }
    n[0] /= l
    n[1] /= l
    n[2] /= l
  }

  return normals
}

},{}],35:[function(require,module,exports){
exports.positions=[[1.301895,0.122622,2.550061],[1.045326,0.139058,2.835156],[0.569251,0.155925,2.805125],[0.251886,0.144145,2.82928],[0.063033,0.131726,3.01408],[-0.277753,0.135892,3.10716],[-0.441048,0.277064,2.594331],[-1.010956,0.095285,2.668983],[-1.317639,0.069897,2.325448],[-0.751691,0.264681,2.381496],[0.684137,0.31134,2.364574],[1.347931,0.302882,2.201434],[-1.736903,0.029894,1.724111],[-1.319986,0.11998,0.912925],[1.538077,0.157372,0.481711],[1.951975,0.081742,1.1641],[1.834768,0.095832,1.602682],[2.446122,0.091817,1.37558],[2.617615,0.078644,0.742801],[-1.609748,0.04973,-0.238721],[-1.281973,0.230984,-0.180916],[-1.074501,0.248204,0.034007],[-1.201734,0.058499,0.402234],[-1.444454,0.054783,0.149579],[-4.694605,5.075882,1.043427],[-3.95963,7.767394,0.758447],[-4.753339,5.339817,0.665061],[-1.150325,9.133327,-0.368552],[-4.316107,2.893611,0.44399],[-0.809202,9.312575,-0.466061],[0.085626,5.963693,1.685666],[-1.314853,9.00142,-0.1339],[-4.364182,3.072556,1.436712],[-2.022074,7.323396,0.678657],[1.990887,6.13023,0.479643],[-3.295525,7.878917,1.409353],[0.571308,6.197569,0.670657],[0.89661,6.20018,0.337056],[0.331851,6.162372,1.186371],[-4.840066,5.599874,2.296069],[2.138989,6.031291,0.228335],[0.678923,6.026173,1.894052],[-0.781682,5.601573,1.836738],[1.181315,6.239007,0.393293],[-3.606308,7.376476,2.661452],[-0.579059,4.042511,-1.540883],[-3.064069,8.630253,-2.597539],[-2.157271,6.837012,0.300191],[-2.966013,7.821581,-1.13697],[-2.34426,8.122965,0.409043],[-0.951684,5.874251,1.415119],[-2.834853,7.748319,0.182406],[-3.242493,7.820096,0.373674],[-0.208532,5.992846,1.252084],[-3.048085,8.431527,-2.129795],[1.413245,5.806324,2.243906],[-0.051222,6.064901,0.696093],[-4.204306,2.700062,0.713875],[-4.610997,6.343405,0.344272],[-3.291336,9.30531,-3.340445],[-3.27211,7.559239,-2.324016],[-4.23882,6.498344,3.18452],[-3.945317,6.377804,3.38625],[-4.906378,5.472265,1.315193],[-3.580131,7.846717,0.709666],[-1.995504,6.645459,0.688487],[-2.595651,7.86054,0.793351],[-0.008849,0.305871,0.184484],[-0.029011,0.314116,-0.257312],[-2.522424,7.565392,1.804212],[-1.022993,8.650826,-0.855609],[-3.831265,6.595426,3.266783],[-4.042525,6.855724,3.060663],[-4.17126,7.404742,2.391387],[3.904526,3.767693,0.092179],[0.268076,6.086802,1.469223],[-3.320456,8.753222,-2.08969],[1.203048,6.26925,0.612407],[-4.406479,2.985974,0.853691],[-3.226889,6.615215,-0.404243],[0.346326,1.60211,3.509858],[-3.955476,7.253323,2.722392],[-1.23204,0.068935,1.68794],[0.625436,6.196455,1.333156],[4.469132,2.165298,1.70525],[0.950053,6.262899,0.922441],[-2.980404,5.25474,-0.663155],[-4.859043,6.28741,1.537081],[-3.077453,4.641475,-0.892167],[-0.44002,8.222503,-0.771454],[-4.034112,7.639786,0.389935],[-3.696045,6.242042,3.394679],[-1.221806,7.783617,0.196451],[0.71461,6.149895,1.656636],[-4.713539,6.163154,0.495369],[-1.509869,0.913044,-0.832413],[-1.547249,2.066753,-0.852669],[-3.757734,5.793742,3.455794],[-0.831911,0.199296,1.718536],[-3.062763,7.52718,-1.550559],[0.938688,6.103354,1.820958],[-4.037033,2.412311,0.988026],[-4.130746,2.571806,1.101689],[-0.693664,9.174283,-0.952323],[-1.286742,1.079679,-0.751219],[1.543185,1.408925,3.483132],[1.535973,2.047979,3.655029],[0.93844,5.84101,2.195219],[-0.684401,5.918492,1.20109],[1.28844,2.008676,3.710781],[-3.586722,7.435506,-1.454737],[-0.129975,4.384192,2.930593],[-1.030531,0.281374,3.214273],[-3.058751,8.137238,-3.227714],[3.649524,4.592226,1.340021],[-3.354828,7.322425,-1.412086],[0.936449,6.209237,1.512693],[-1.001832,3.590411,-1.545892],[-3.770486,4.593242,2.477056],[-0.971925,0.067797,0.921384],[-4.639832,6.865407,2.311791],[-0.441014,8.093595,-0.595999],[-2.004852,6.37142,1.635383],[4.759591,1.92818,0.328328],[3.748064,1.224074,2.140484],[-0.703601,5.285476,2.251988],[0.59532,6.21893,0.981004],[0.980799,6.257026,1.24223],[1.574697,6.204981,0.381628],[1.149594,6.173608,1.660763],[-3.501963,5.895989,3.456576],[1.071122,5.424198,2.588717],[-0.774693,8.473335,-0.276957],[3.849959,4.15542,0.396742],[-0.801715,4.973149,-1.068582],[-2.927676,0.625112,2.326393],[2.669682,4.045542,2.971184],[-4.391324,4.74086,0.343463],[1.520129,6.270031,0.775471],[1.837586,6.084731,0.109188],[1.271475,5.975024,2.032355],[-3.487968,4.513249,2.605871],[-1.32234,1.517264,-0.691879],[-1.080301,1.648226,-0.805526],[-3.365703,6.910166,-0.454902],[1.36034,0.432238,3.075004],[-3.305013,5.774685,3.39142],[3.88432,0.654141,0.12574],[3.57254,0.377934,0.302501],[4.196136,0.807999,0.212229],[3.932997,0.543123,0.380579],[4.023704,3.286125,0.537597],[1.864455,4.916544,2.691677],[-4.775427,6.499498,1.440153],[-3.464928,3.68234,2.766356],[3.648972,1.751262,2.157485],[1.179111,3.238846,3.774796],[-0.171164,0.299126,-0.592669],[-4.502912,3.316656,0.875188],[-0.948454,9.214025,-0.679508],[1.237665,6.288593,1.046],[1.523423,6.268963,1.139544],[1.436519,6.140608,1.739316],[3.723607,1.504355,2.136762],[2.009495,4.045514,3.22053],[-1.921944,7.249905,0.213973],[1.254068,1.205518,3.474709],[-0.317087,5.996269,0.525872],[-2.996914,3.934607,2.900178],[-3.316873,4.028154,2.785696],[-3.400267,4.280157,2.689268],[-3.134842,4.564875,2.697192],[1.480563,4.692567,2.834068],[0.873682,1.315452,3.541585],[1.599355,0.91622,3.246769],[-3.292102,7.125914,2.768515],[3.74296,4.511299,0.616539],[4.698935,1.55336,0.26921],[-3.274387,3.299421,2.823946],[-2.88809,3.410699,2.955248],[1.171407,1.76905,3.688472],[1.430276,3.92483,3.473666],[3.916941,2.553308,0.018941],[0.701632,2.442372,3.778639],[1.562657,2.302778,3.660957],[4.476622,1.152407,0.182131],[-0.61136,5.761367,1.598838],[-3.102154,3.691687,2.903738],[1.816012,5.546167,2.380308],[3.853928,4.25066,0.750017],[1.234681,3.581665,3.673723],[1.862271,1.361863,3.355209],[1.346844,4.146995,3.327877],[1.70672,4.080043,3.274307],[0.897242,1.908983,3.6969],[-0.587022,9.191132,-0.565301],[-0.217426,5.674606,2.019968],[0.278925,6.120777,0.485403],[1.463328,3.578742,-2.001464],[-3.072985,4.264581,2.789502],[3.62353,4.673843,0.383452],[-3.053491,8.752377,-2.908434],[-2.628687,4.505072,2.755601],[0.891047,5.113781,2.748272],[-2.923732,3.06515,2.866368],[0.848008,4.754252,2.896972],[-3.319184,8.811641,-2.327412],[0.12864,8.814781,-1.334456],[1.549501,4.549331,-1.28243],[1.647161,3.738973,3.507719],[1.250888,0.945599,3.348739],[3.809662,4.038822,0.053142],[1.483166,0.673327,3.09156],[0.829726,3.635921,3.713103],[1.352914,5.226651,2.668113],[2.237352,4.37414,3.016386],[4.507929,0.889447,0.744249],[4.57304,1.010981,0.496588],[3.931422,1.720989,2.088175],[-0.463177,5.989835,0.834346],[-2.811236,3.745023,2.969587],[-2.805135,4.219721,2.841108],[-2.836842,4.802543,2.60826],[1.776716,2.084611,3.568638],[4.046881,1.463478,2.106273],[0.316265,5.944313,1.892785],[-2.86347,2.776049,2.77242],[-2.673644,3.116508,2.907104],[-2.621149,4.018502,2.903409],[-2.573447,5.198013,2.477481],[1.104039,2.278985,3.722469],[-4.602743,4.306413,0.902296],[-2.684878,1.510731,0.535039],[0.092036,8.473269,-0.99413],[-1.280472,5.602393,1.928105],[-1.0279,4.121582,-1.403103],[-2.461081,3.304477,2.957317],[-2.375929,3.659383,2.953233],[1.417579,2.715389,3.718767],[0.819727,2.948823,3.810639],[1.329962,0.761779,3.203724],[1.73952,5.295229,2.537725],[0.952523,3.945016,3.548229],[-2.569498,0.633669,2.84818],[-2.276676,0.757013,2.780717],[-2.013147,7.354429,-0.003202],[0.93143,1.565913,3.600325],[1.249014,1.550556,3.585842],[2.287252,4.072353,3.124544],[-4.7349,7.006244,1.690653],[-3.500602,8.80386,-2.009196],[-0.582629,5.549138,2.000923],[-1.865297,6.356066,1.313593],[-3.212154,2.376143,-0.565593],[2.092889,3.493536,-1.727931],[-2.528501,2.784531,2.833758],[-2.565697,4.893154,2.559605],[-2.153366,5.04584,2.465215],[1.631311,2.568241,3.681445],[2.150193,4.699227,2.807505],[0.507599,5.01813,2.775892],[4.129862,1.863698,2.015101],[3.578279,4.50766,-0.009598],[3.491023,4.806749,1.549265],[0.619485,1.625336,3.605125],[1.107499,2.932557,3.790061],[-2.082292,6.99321,0.742601],[4.839909,1.379279,0.945274],[3.591328,4.322645,-0.259497],[1.055245,0.710686,3.16553],[-3.026494,7.842227,1.624553],[0.146569,6.119214,0.981673],[-2.043687,2.614509,2.785526],[-2.302242,3.047775,2.936355],[-2.245686,4.100424,2.87794],[2.116148,5.063507,2.572204],[-1.448406,7.64559,0.251692],[2.550717,4.9268,2.517526],[-2.955456,7.80293,-1.782407],[1.882995,4.637167,2.895436],[-2.014924,3.398262,2.954896],[-2.273654,4.771227,2.611418],[-2.162723,7.876761,0.702473],[-0.198659,5.823062,1.739272],[-1.280908,2.133189,-0.921241],[2.039932,4.251568,3.136579],[1.477815,4.354333,3.108325],[0.560504,3.744128,3.6913],[-2.234018,1.054373,2.352782],[-3.189156,7.686661,-2.514955],[-3.744736,7.69963,2.116973],[-2.283366,2.878365,2.87882],[-2.153786,4.457481,2.743529],[4.933978,1.677287,0.713773],[3.502146,0.535336,1.752511],[1.825169,4.419253,3.081198],[3.072331,0.280979,0.106534],[-0.508381,1.220392,2.878049],[-3.138824,8.445394,-1.659711],[-2.056425,2.954815,2.897241],[-2.035343,5.398477,2.215842],[-3.239915,7.126798,-0.712547],[-1.867923,7.989805,0.526518],[1.23405,6.248973,1.387189],[-0.216492,8.320933,-0.862495],[-2.079659,3.755709,2.928563],[-1.78595,4.300374,2.805295],[-1.856589,5.10678,2.386572],[-1.714362,5.544778,2.004623],[1.722403,4.200291,-1.408161],[0.195386,0.086928,-1.318006],[1.393693,3.013404,3.710686],[-0.415307,8.508471,-0.996883],[-1.853777,0.755635,2.757275],[-1.724057,3.64533,2.884251],[-1.884511,4.927802,2.530885],[-1.017174,7.783908,-0.227078],[-1.7798,2.342513,2.741749],[-1.841329,3.943996,2.88436],[1.430388,5.468067,2.503467],[-2.030296,0.940028,2.611088],[-1.677028,1.215666,2.607771],[-1.74092,2.832564,2.827295],[4.144673,0.631374,0.503358],[4.238811,0.653992,0.762436],[-1.847016,2.082815,2.642674],[4.045764,3.194073,0.852117],[-1.563989,8.112739,0.303102],[-1.781627,1.794836,2.602338],[-1.493749,2.533799,2.797251],[-1.934496,4.690689,2.658999],[-1.499174,5.777946,1.747498],[-2.387409,0.851291,1.500524],[-1.872211,8.269987,0.392533],[-4.647726,6.765771,0.833653],[-3.157482,0.341958,-0.20671],[-1.725766,3.24703,2.883579],[-1.458199,4.079031,2.836325],[-1.621548,4.515869,2.719266],[-1.607292,4.918914,2.505881],[-1.494661,5.556239,1.991599],[-1.727269,7.423769,0.012337],[-1.382497,1.161322,2.640222],[-1.52129,4.681714,2.615467],[-4.247127,2.792812,1.250843],[-1.576338,0.742947,2.769799],[-1.499257,2.172763,2.743142],[-1.480392,3.103261,2.862262],[1.049137,2.625836,3.775384],[-1.368063,1.791587,2.695516],[-1.307839,2.344534,2.767575],[-1.336758,5.092221,2.355225],[-1.5617,5.301749,2.21625],[-1.483362,8.537704,0.196752],[-1.517348,8.773614,0.074053],[-1.474302,1.492731,2.641433],[2.48718,0.644247,-0.920226],[0.818091,0.422682,3.171218],[-3.623398,6.930094,3.033045],[1.676333,3.531039,3.591591],[1.199939,5.683873,2.365623],[-1.223851,8.841201,0.025414],[-1.286307,3.847643,2.918044],[-1.25857,4.810831,2.543605],[2.603662,5.572146,1.991854],[0.138984,5.779724,2.077834],[-1.267039,3.175169,2.890889],[-1.293616,3.454612,2.911774],[-2.60112,1.277184,0.07724],[2.552779,3.649877,3.163643],[-1.038983,1.248011,2.605933],[-1.288709,4.390967,2.761214],[-1.034218,5.485963,2.011467],[-1.185576,1.464842,2.624335],[-1.045682,2.54896,2.761102],[4.259176,1.660627,2.018096],[-0.961707,1.717183,2.598342],[-1.044603,3.147464,2.855335],[-0.891998,4.685429,2.669696],[-1.027561,5.081672,2.377939],[4.386506,0.832434,0.510074],[-1.014225,9.064991,-0.175352],[-1.218752,2.895443,2.823785],[-0.972075,4.432669,2.788005],[-2.714986,0.52425,1.509798],[-0.699248,1.517219,2.645738],[-1.161581,2.078852,2.722795],[-0.845249,3.286247,2.996471],[1.068329,4.443444,2.993863],[3.98132,3.715557,1.027775],[1.658097,3.982428,-1.651688],[-4.053701,2.449888,0.734746],[-0.910935,2.214149,2.702393],[0.087824,3.96165,3.439344],[-0.779714,3.724134,2.993429],[-1.051093,3.810797,2.941957],[-0.644941,4.3859,2.870863],[-2.98403,8.666895,-3.691888],[-0.754304,2.508325,2.812999],[-4.635524,3.662891,0.913005],[-0.983299,4.125978,2.915378],[4.916497,1.905209,0.621315],[4.874983,1.728429,0.468521],[2.33127,5.181957,2.441697],[-0.653711,2.253387,2.7949],[-3.623744,8.978795,-2.46192],[-4.555927,6.160279,0.215755],[-4.940628,5.806712,1.18383],[3.308506,2.40326,-0.910776],[0.58835,5.251928,-0.992886],[2.152215,5.449733,2.331679],[-0.712755,0.766765,3.280375],[-0.741771,1.9716,2.657235],[-4.828957,5.566946,2.635623],[-3.474788,8.696771,-1.776121],[1.770417,6.205561,1.331627],[-0.620626,4.064721,2.968972],[-1.499187,2.307735,-0.978901],[4.098793,2.330245,1.667951],[1.940444,6.167057,0.935904],[-2.314436,1.104995,1.681277],[-2.733629,7.742793,1.7705],[-0.452248,4.719868,2.740834],[-0.649143,4.951713,2.541296],[-0.479417,9.43959,-0.676324],[-2.251853,6.559275,0.046819],[0.033531,8.316907,-0.789939],[-0.513125,0.995673,3.125462],[-2.637602,1.039747,0.602434],[1.527513,6.230089,1.430903],[4.036124,2.609846,1.506498],[-3.559828,7.877892,1.228076],[-4.570736,4.960193,0.838201],[-0.432121,5.157731,2.467518],[-1.206735,4.562511,-1.237054],[-0.823768,3.788746,-1.567481],[-3.095544,7.353613,-1.024577],[-4.056088,7.631119,2.062001],[-0.289385,5.382261,2.329421],[1.69752,6.136483,1.667037],[-0.168758,5.061138,2.617453],[2.853576,1.605528,-1.229958],[-4.514319,6.586675,0.352756],[-2.558081,7.741151,1.29295],[1.61116,5.92358,2.071534],[3.936921,3.354857,0.091755],[-0.1633,1.119272,3.147975],[0.067551,1.593475,3.38212],[-1.303239,2.328184,-1.011672],[-0.438093,0.73423,3.398384],[-4.62767,3.898187,0.849573],[0.286853,4.165281,3.284834],[-2.968052,8.492812,-3.493693],[-0.111896,3.696111,3.53791],[-3.808245,8.451731,-1.574742],[0.053416,5.558764,2.31107],[3.956269,3.012071,0.11121],[-0.710956,8.106561,-0.665154],[0.234725,2.717326,3.722379],[-0.031594,2.76411,3.657347],[-0.017371,4.700633,2.81911],[0.215064,5.034859,2.721426],[-0.111151,8.480333,-0.649399],[3.97942,3.575478,0.362219],[0.392962,4.735392,2.874321],[4.17015,2.085087,1.865999],[0.169054,1.244786,3.337709],[0.020049,3.165818,3.721736],[0.248212,3.595518,3.698376],[0.130706,5.295541,2.540034],[-4.541357,4.798332,1.026866],[-1.277485,1.289518,-0.667272],[3.892133,3.54263,-0.078056],[4.057379,3.03669,0.997913],[0.287719,0.884758,3.251787],[0.535771,1.144701,3.400096],[0.585303,1.399362,3.505353],[0.191551,2.076246,3.549355],[0.328656,2.394576,3.649623],[0.413124,3.240728,3.771515],[0.630361,4.501549,2.963623],[0.529441,5.854392,2.120225],[3.805796,3.769958,-0.162079],[3.447279,4.344846,-0.467276],[0.377618,5.551116,2.426017],[0.409355,1.821269,3.606333],[0.719959,2.194726,3.703851],[0.495922,3.501519,3.755661],[0.603408,5.354097,2.603088],[-4.605056,7.531978,1.19579],[0.907972,0.973128,3.356513],[0.750134,3.356137,3.765847],[0.4496,3.993244,3.504544],[-3.030738,7.48947,-1.259169],[0.707505,5.602005,2.43476],[0.668944,0.654891,3.213797],[0.593244,2.700978,3.791427],[1.467759,3.30327,3.71035],[3.316249,2.436388,2.581175],[3.26138,1.724425,2.539028],[-1.231292,7.968263,0.281414],[-0.108773,8.712307,-0.790607],[4.445684,1.819442,1.896988],[1.998959,2.281499,3.49447],[2.162269,2.113817,3.365449],[4.363397,1.406731,1.922714],[4.808,2.225842,0.611127],[2.735919,0.771812,-0.701142],[1.897735,2.878428,3.583482],[-3.31616,5.331985,3.212394],[-3.3314,6.018137,3.313018],[-3.503183,6.480103,3.222216],[-1.904453,5.750392,1.913324],[-1.339735,3.559592,-1.421817],[-1.044242,8.22539,0.037414],[1.643492,3.110676,3.647424],[3.992832,3.686244,0.710946],[1.774207,1.71842,3.475768],[-3.438842,5.5713,3.427818],[4.602447,1.2583,1.619528],[-0.925516,7.930042,0.072336],[-1.252093,3.846565,-1.420761],[-3.426857,5.072419,2.97806],[-3.160408,6.152629,3.061869],[3.739931,3.367082,2.041273],[1.027419,4.235891,3.251253],[4.777703,1.887452,1.560409],[-3.318528,6.733796,2.982968],[2.929265,4.962579,2.271079],[3.449761,2.838629,2.474576],[-3.280159,5.029875,2.787514],[4.068939,2.993629,0.741567],[0.303312,8.70927,-1.121972],[0.229852,8.981322,-1.186075],[-0.011045,9.148156,-1.047057],[-2.942683,5.579613,2.929297],[-3.145409,5.698727,3.205778],[-3.019089,6.30887,2.794323],[-3.217135,6.468191,2.970032],[-3.048298,6.993641,2.623378],[-3.07429,6.660982,2.702434],[3.612011,2.5574,2.25349],[2.54516,4.553967,2.75884],[-1.683759,7.400787,0.250868],[-1.756066,7.463557,0.448031],[-3.023761,5.149697,2.673539],[3.112376,2.677218,2.782378],[2.835327,4.581196,2.567146],[-2.973799,7.225458,2.506988],[-0.591645,8.740662,-0.505845],[3.782861,2.04337,2.03066],[3.331604,3.36343,2.605047],[2.966866,1.205497,2.537432],[0.002669,9.654748,-1.355559],[2.632801,0.58497,2.540311],[-2.819398,5.087372,2.521098],[2.616193,5.332961,2.194288],[-3.193973,4.925634,2.607924],[-3.12618,5.27524,2.944544],[-0.426003,8.516354,-0.501528],[2.802717,1.387643,2.751649],[-3.120597,7.889111,-2.75431],[2.636648,1.71702,2.991302],[-2.853151,6.711792,2.430276],[-2.843836,6.962865,2.400842],[1.9696,3.199023,3.504514],[-2.461751,0.386352,3.008994],[1.64127,0.495758,3.02958],[-4.330472,5.409831,0.025287],[-2.912387,5.980416,2.844261],[-2.490069,0.211078,2.985391],[3.581816,4.809118,0.733728],[2.693199,2.647213,3.126709],[-0.182964,8.184108,-0.638459],[-2.226855,0.444711,2.946552],[-0.720175,8.115055,0.017689],[2.645302,4.316212,2.850139],[-0.232764,9.329503,-0.918639],[4.852365,1.471901,0.65275],[2.76229,2.014994,2.957755],[-2.808374,5.354301,2.644695],[-2.790967,6.406963,2.547985],[-1.342684,0.418488,-1.669183],[2.690675,5.593587,-0.041236],[4.660146,1.6318,1.713314],[2.775667,3.007229,3.111332],[-0.396696,8.963432,-0.706202],[2.446707,2.740617,3.321433],[-4.803209,5.884634,2.603672],[-2.652003,1.6541,1.5078],[3.932327,3.972874,0.831924],[2.135906,0.955587,2.986608],[2.486131,2.053802,3.124115],[-0.386706,8.115753,-0.37565],[-2.720727,7.325044,2.224878],[-1.396946,7.638016,-0.16486],[-0.62083,7.989771,-0.144413],[-2.653272,5.729684,2.667679],[3.038188,4.65835,2.364142],[2.381721,0.739472,2.788992],[-2.345829,5.474929,2.380633],[-2.518983,6.080562,2.479383],[-2.615793,6.839622,2.186116],[-2.286566,0.143752,2.766848],[-4.771219,6.508766,1.070797],[3.717308,2.905019,2.097994],[2.50521,3.016743,3.295898],[2.208448,1.56029,3.216806],[3.346783,1.01254,2.119951],[2.653503,3.26122,3.175738],[-2.359636,5.827519,2.402297],[-1.952693,0.558102,2.853307],[-0.321562,9.414885,-1.187501],[3.138923,1.405072,2.520765],[1.493728,1.780051,3.621969],[3.01817,0.907291,2.336909],[3.183548,1.185297,2.352175],[1.608619,5.006753,2.695131],[-4.723919,6.836107,1.095288],[-1.017586,8.865429,-0.149328],[4.730762,1.214014,0.64008],[-2.135182,6.647907,1.495471],[-2.420382,6.546114,2.108209],[-2.458053,7.186346,1.896623],[3.437124,0.275798,1.138203],[0.095925,8.725832,-0.926481],[2.417376,2.429869,3.287659],[2.279951,1.200317,3.049994],[2.674753,2.326926,3.044059],[-2.328123,6.849164,1.75751],[-3.418616,7.853407,0.126248],[-3.151587,7.77543,-0.110889],[2.349144,5.653242,2.05869],[-2.273236,6.085631,2.242888],[-4.560601,4.525342,1.261241],[2.866334,3.796067,2.934717],[-2.17493,6.505518,1.791367],[3.12059,3.283157,2.818869],[3.037703,3.562356,2.866653],[0.066233,9.488418,-1.248237],[2.749941,0.975018,2.573371],[-2.155749,5.801033,2.204009],[-2.162778,6.261889,2.028596],[1.936874,0.459142,2.956718],[3.176249,4.335541,2.440447],[4.356599,1.029423,1.700589],[3.873502,3.082678,1.80431],[2.895489,4.243034,2.735259],[-0.095774,9.468195,-1.07451],[-1.124982,7.886808,-0.480851],[3.032304,3.065454,2.897927],[3.692687,4.5961,0.957858],[-3.013045,3.807235,-1.098381],[-0.790012,8.92912,-0.367572],[1.905793,0.73179,2.996728],[3.530396,3.426233,2.356583],[2.12299,0.624933,2.929167],[-2.069196,6.039284,2.01251],[-3.565623,7.182525,2.850039],[2.959264,2.376337,2.829242],[2.949071,1.822483,2.793933],[4.036142,0.763803,1.703744],[-1.993527,6.180318,1.804936],[-0.030987,0.766389,3.344766],[-0.549683,8.225193,-0.189341],[-0.765469,8.272246,-0.127174],[-2.947047,7.541648,-0.414113],[-3.050327,9.10114,-3.435619],[3.488566,2.231807,2.399836],[3.352283,4.727851,1.946438],[4.741011,2.162773,1.499574],[-1.815093,6.072079,1.580722],[-3.720969,8.267927,-0.984713],[1.932826,3.714052,3.427488],[3.323617,4.438961,2.20732],[0.254111,9.26364,-1.373244],[-1.493384,7.868585,-0.450051],[-0.841901,0.776135,-1.619467],[0.243537,6.027668,0.091687],[0.303057,0.313022,-0.531105],[-0.435273,0.474098,3.481552],[2.121507,2.622389,3.486293],[1.96194,1.101753,3.159584],[3.937991,3.407551,1.551392],[0.070906,0.295753,1.377185],[-1.93588,7.631764,0.651674],[-2.523531,0.744818,-0.30985],[2.891496,3.319875,2.983079],[4.781765,1.547061,1.523129],[-2.256064,7.571251,0.973716],[3.244861,3.058249,2.724392],[-0.145855,0.437775,3.433662],[1.586296,5.658538,2.358487],[3.658336,3.774921,2.071837],[2.840463,4.817098,2.46376],[-1.219464,8.122542,-0.672808],[-2.520906,2.664486,-1.034346],[-1.315417,8.471365,-0.709557],[3.429165,3.74686,2.446169],[3.074579,3.840758,2.767409],[3.569443,3.166337,2.333647],[2.294337,3.280051,3.359346],[2.21816,3.66578,3.269222],[2.158662,4.151444,-1.357919],[1.13862,4.380986,-1.404565],[3.388382,2.749931,-0.840949],[3.059892,5.084848,2.026066],[3.204739,2.075145,2.640706],[3.387065,1.42617,2.305275],[3.910398,2.670742,1.750179],[3.471512,1.945821,2.395881],[4.08082,1.070654,1.960171],[-1.057861,0.133036,2.146707],[-0.151749,5.53551,-0.624323],[3.233099,4.003778,2.571172],[2.611726,5.319199,-0.499388],[2.682909,1.094499,-1.206247],[-1.22823,7.656887,0.041409],[-2.293247,7.259189,0.013844],[0.081315,0.202174,3.286381],[-1.002038,5.794454,-0.187194],[3.448856,4.08091,2.258325],[0.287883,9.006888,-1.550641],[-3.851019,4.059839,-0.646922],[3.610966,4.205438,1.913129],[2.239042,2.950872,3.449959],[0.216305,0.442843,3.328052],[1.87141,2.470745,3.574559],[3.811378,2.768718,-0.228364],[2.511081,1.362724,2.969349],[-1.59813,7.866506,0.440184],[-3.307975,2.851072,-0.894978],[-0.107011,8.90573,-0.884399],[-3.855315,2.842597,-0.434541],[2.517853,1.090768,2.799687],[3.791709,2.36685,2.002703],[4.06294,2.773922,0.452723],[-2.973289,7.61703,-0.623653],[-2.95509,8.924462,-3.446319],[2.861402,0.562592,2.184397],[-1.109725,8.594206,-0.076812],[-0.725722,7.924485,-0.381133],[-1.485587,1.329994,-0.654405],[-4.342113,3.233735,1.752922],[-2.968049,7.955519,-2.09405],[-3.130948,0.446196,0.85287],[-4.958475,5.757329,1.447055],[-3.086547,7.615193,-1.953168],[-3.751923,5.412821,3.373373],[-4.599645,7.480953,1.677134],[1.133992,0.274871,0.032249],[-2.956512,8.126905,-1.785461],[-0.960645,4.73065,-1.191786],[-2.871064,0.875559,0.424881],[-4.932114,5.99614,1.483845],[-2.981761,8.124612,-1.387276],[0.362298,8.978545,-1.368024],[-4.408375,3.046271,0.602373],[2.865841,2.322263,-1.344625],[-4.7848,5.620895,0.594432],[-2.88322,0.338931,1.67231],[-4.688101,6.772931,1.872318],[-4.903948,6.164698,1.27135],[2.85663,1.005647,-0.906843],[2.691286,0.209811,0.050512],[-4.693636,6.477556,0.665796],[-4.472331,6.861067,0.477318],[0.883065,0.204907,3.073933],[-0.995867,8.048729,-0.653897],[-0.794663,5.670397,-0.390119],[3.313153,1.638006,-0.722289],[-4.856459,5.394758,1.032591],[-3.005448,7.783023,-0.819641],[3.11891,2.036974,-1.08689],[-2.364319,2.408419,2.63419],[-2.927132,8.75435,-3.537159],[-3.296222,7.964629,-3.134625],[-1.642041,4.13417,-1.301665],[2.030759,0.176372,-1.030923],[-4.559069,3.751053,0.548453],[3.438385,4.59454,-0.243215],[-2.561769,7.93935,0.177696],[2.990593,1.335314,-0.943177],[1.2808,0.276396,-0.49072],[-0.318889,0.290684,0.211143],[3.54614,3.342635,-0.767878],[-3.073372,7.780018,-2.357807],[-4.455388,4.387245,0.361038],[-4.659393,6.276064,2.767014],[0.636799,4.482223,-1.426284],[-2.987681,8.072969,-2.45245],[-2.610445,0.763554,1.792054],[3.358241,2.006707,-0.802973],[-0.498347,0.251594,0.962885],[3.1322,0.683312,2.038777],[-4.389801,7.493776,0.690247],[0.431467,4.22119,-1.614215],[-4.376181,3.213141,0.273255],[-4.872319,5.715645,0.829714],[-4.826893,6.195334,0.849912],[3.516562,2.23732,-0.677597],[3.131656,1.698841,-0.975761],[-4.754925,5.411666,1.989303],[-2.987299,7.320765,-0.629479],[-3.757635,3.274862,-0.744022],[3.487044,2.541999,-0.699933],[-4.53274,4.649505,0.77093],[-1.424192,0.099423,2.633327],[3.090867,2.476975,-1.146957],[-2.713256,0.815622,2.17311],[3.348121,3.254167,-0.984896],[-3.031379,0.16453,-0.309937],[-0.949757,4.518137,-1.309172],[-0.889509,0.095256,1.288803],[3.539594,1.966105,-0.553965],[-4.60612,7.127749,0.811958],[-2.332953,1.444713,1.624548],[3.136293,2.95805,-1.138272],[3.540808,3.069058,-0.735285],[3.678852,2.362375,-0.452543],[-4.648898,7.37438,0.954791],[-0.646871,0.19037,3.344746],[2.2825,0.29343,-0.826273],[-4.422291,7.183959,0.557517],[-4.694668,5.246103,2.541768],[-4.583691,4.145486,0.600207],[-2.934854,7.912513,-1.539269],[-3.067861,7.817472,-0.546501],[3.825095,3.229512,-0.237547],[2.532494,0.323059,2.387105],[-2.514583,0.692857,1.23597],[-4.736805,7.214384,1.259421],[-2.98071,8.409903,-2.468199],[2.621468,1.385844,-1.406355],[3.811447,3.560855,1.847828],[3.432925,1.497205,-0.489784],[3.746609,3.631538,-0.39067],[3.594909,2.832257,-0.576012],[-0.404192,5.300188,-0.856561],[-4.762996,6.483774,1.702648],[-4.756612,6.786223,1.43682],[-2.965309,8.437217,-2.785495],[2.863867,0.74087,-0.429684],[4.02503,2.968753,1.392419],[3.669036,1.833858,-0.304971],[-2.888864,0.720537,0.778057],[-2.36982,0.979443,1.054447],[-2.959259,8.222303,-2.659724],[-3.467825,7.545739,-2.333445],[2.153426,0.446256,-1.20523],[-3.229807,9.189699,-3.596609],[-3.72486,8.773707,-2.046671],[3.687218,3.297751,-0.523746],[1.381025,0.08815,-1.185668],[-2.796828,7.205622,-0.208783],[3.647194,4.066232,-0.291507],[-4.578376,3.885556,1.52546],[-2.840262,0.63094,1.89499],[-2.429514,0.922118,1.820781],[-4.675079,6.573925,2.423363],[2.806207,4.320188,-1.027372],[-1.289608,0.097241,1.321661],[-3.010731,8.141334,-2.866148],[3.202291,1.235617,-0.549025],[4.094792,2.477519,0.304581],[2.948403,0.966873,-0.664857],[-4.83297,5.920587,2.095461],[-2.169693,7.257277,0.946184],[-1.335807,3.057597,-1.303166],[-1.037877,0.64151,-1.685271],[2.627919,0.089814,0.439074],[3.815794,3.808102,1.730493],[-2.973455,8.433141,-3.08872],[-2.391558,7.331428,1.658264],[-4.333107,4.529978,1.850516],[-4.640293,3.767107,1.168841],[3.600716,4.46931,1.734024],[3.880803,1.730158,-0.172736],[3.814183,4.262372,1.167042],[4.37325,0.829542,1.413729],[2.490447,5.75111,0.011492],[3.460003,4.962436,1.188971],[3.918419,3.814234,1.358271],[-0.807595,8.840504,-0.953711],[3.752855,4.20577,1.57177],[-2.991085,8.816501,-3.244595],[-2.333196,7.128889,1.551985],[3.977718,3.570941,1.25937],[4.360071,0.755579,1.079916],[4.637579,1.027973,1.032567],[-2.317,7.421066,1.329589],[-1.013404,8.293662,-0.7823],[4.548023,1.020644,1.420462],[4.763258,1.266798,1.296203],[4.896,2.073084,1.255213],[4.015005,3.325226,1.093879],[4.94885,1.860936,0.894463],[-2.189645,6.954634,1.270077],[4.887442,1.720992,1.288526],[-3.184068,7.871802,0.956189],[-1.274318,0.839887,-1.224389],[-2.919521,7.84432,0.541629],[-2.994586,7.766102,1.96867],[-3.417504,9.241714,-3.093201],[-3.174563,7.466456,2.473617],[-3.263067,9.069412,-3.003459],[-2.841592,0.529833,2.693434],[-3.611069,9.158804,-2.829871],[-4.642828,5.927526,0.320549],[-3.809308,9.051035,-2.692749],[-2.837582,7.487987,-0.106206],[4.773025,2.330442,1.213899],[4.897435,2.209906,0.966657],[-3.067637,8.164062,-1.12661],[-3.122129,8.08074,-0.899194],[4.571019,2.358113,1.462054],[4.584884,2.454418,0.709466],[-3.661093,7.146581,-0.475948],[4.735131,2.415859,0.933939],[4.207556,2.540018,1.218293],[-3.607595,7.89161,-0.121172],[-1.527952,0.775564,-1.061903],[4.53874,2.503273,1.099583],[-3.938837,7.587988,0.082449],[-4.853582,6.152409,1.787943],[-4.752214,6.247234,2.296873],[4.602935,2.363955,0.488901],[-1.81638,6.365879,0.868272],[0.595467,4.744074,-1.32483],[1.87635,3.511986,-1.842924],[4.330947,2.534326,0.720503],[4.108736,2.750805,0.904552],[-1.890939,8.492628,-0.290768],[-3.504309,6.173058,-0.422804],[-1.611992,6.196732,0.648736],[-3.899149,7.826123,1.088845],[-3.078303,3.008813,-1.035784],[-2.798999,7.844899,1.340061],[-1.248839,5.959105,0.041761],[0.767779,4.337318,3.090817],[-3.831177,7.515605,2.432261],[-1.667528,6.156208,0.365267],[-1.726078,6.237384,1.100059],[-3.972037,4.520832,-0.370756],[-4.40449,7.636357,1.520425],[-1.34506,6.004054,1.293159],[-1.233556,6.049933,0.500651],[-3.696869,7.79732,0.37979],[-3.307798,8.949964,-2.698113],[-1.997295,6.615056,1.103691],[-3.219222,8.336394,-1.150614],[-3.452623,8.31866,-0.9417],[-3.94641,2.990494,2.212592],[-3.250025,8.030414,-0.596097],[-2.02375,1.571333,2.397939],[-3.190358,7.665013,2.268183],[-2.811918,7.618526,2.145587],[-1.005265,5.892303,0.072158],[-0.93721,5.974148,0.906669],[-4.646072,7.492193,1.45312],[-0.252931,1.797654,3.140638],[-1.076064,5.738433,1.695953],[-3.980534,7.744391,1.735791],[-0.721187,5.939396,0.526032],[-0.42818,5.919755,0.229001],[-1.43429,6.11622,0.93863],[-0.985638,5.939683,0.290636],[-4.433836,7.461372,1.966437],[-3.696398,7.844859,1.547325],[-3.390772,7.820186,1.812204],[-2.916787,7.864019,0.804341],[-3.715952,8.037269,-0.591341],[-4.204634,7.72919,1.119866],[-4.592233,5.592883,0.246264],[3.307299,5.061701,1.622917],[-3.515159,7.601467,2.368914],[-3.435742,8.533457,-1.37916],[-0.269421,4.545635,-1.366445],[-2.542124,3.768736,-1.258512],[-3.034003,7.873773,1.256854],[-2.801399,7.856028,1.080137],[3.29354,5.220894,1.081767],[-2.35109,1.299486,1.01206],[-3.232213,7.768136,2.047563],[3.290415,5.217525,0.68019],[-3.415109,7.731034,2.144326],[3.440357,4.962463,0.373387],[3.147346,5.352121,1.386923],[2.847252,5.469051,1.831981],[3.137682,5.410222,1.050188],[3.102694,5.310456,1.676434],[-3.044601,0.39515,1.994084],[2.903647,5.561338,1.518598],[-3.810148,8.093598,-0.889131],[4.234835,0.803054,1.593271],[3.240165,5.228747,0.325955],[3.037452,5.509825,0.817137],[2.635031,5.795187,1.439724],[3.071607,5.318303,0.080142],[2.909167,5.611751,1.155874],[3.044889,5.465928,0.486566],[2.502256,5.770673,1.740054],[-0.067497,0.086416,-1.190239],[2.33326,5.906051,0.138295],[0.65096,4.205423,3.308767],[-2.671137,7.936535,0.432731],[2.14463,5.879214,1.866047],[-4.776469,5.890689,0.561986],[2.72432,5.655145,0.211951],[2.730488,5.751455,0.695894],[2.572682,5.869295,1.152663],[1.906776,5.739123,2.196551],[2.344414,5.999961,0.772922],[-3.377905,7.448708,-1.863251],[2.285149,5.968156,1.459258],[2.385989,5.928974,0.3689],[2.192111,6.087516,0.959901],[2.36372,6.001101,1.074346],[1.972022,6.079603,1.591175],[1.87615,5.976698,1.91554],[-3.824761,9.05372,-2.928615],[2.044704,6.129704,1.263111],[-2.583046,0.849537,2.497344],[-0.078825,2.342205,3.520322],[-0.704686,0.537165,3.397194],[-0.257449,3.235334,3.647545],[-0.332064,1.448284,3.022583],[-2.200146,0.898284,-0.447212],[-2.497508,1.745446,1.829167],[0.30702,4.416315,2.978956],[-3.205197,3.479307,-1.040582],[0.110069,9.347725,-1.563686],[-0.82754,0.883886,3.065838],[-2.017103,1.244785,2.42512],[-0.421091,2.309929,3.153898],[-0.491604,3.796072,3.16245],[2.786955,3.501241,-1.340214],[-3.229055,4.380713,-0.899241],[3.730768,0.76845,1.90312],[-0.561079,2.652382,3.152463],[-3.461471,3.086496,2.662505],[-0.661405,3.446009,3.179939],[-0.915351,0.636755,3.243708],[-2.992964,8.915628,-3.729833],[-0.439627,3.502104,3.42665],[-1.154217,0.883181,2.800835],[-1.736193,1.465474,2.595489],[-0.423928,3.24435,3.548277],[-0.511153,2.871046,3.379749],[-0.675722,2.991756,3.143262],[-1.092602,0.599103,3.090639],[-0.89821,2.836952,2.840023],[-2.658412,0.781376,0.960575],[-2.271455,1.222857,1.330478],[-0.877861,1.111222,2.72263],[-0.306959,2.876987,3.556044],[-3.839274,7.84138,-0.918404],[-0.172094,4.083799,3.141708],[-1.548332,0.2529,2.864655],[-0.217353,4.873911,-1.223104],[-3.384242,3.181056,-0.95579],[-2.731704,0.382421,2.895502],[-1.285037,0.551267,2.947675],[0.077224,4.246579,3.066738],[-0.479979,1.77955,2.860011],[-0.716375,1.224694,2.666751],[-0.54622,3.138255,3.393457],[-2.33413,1.821222,2.124883],[-0.50653,2.037147,2.897465],[2.451291,1.211389,-1.466589],[-3.160047,2.894081,2.724286],[-4.137258,5.433431,3.21201],[0.462896,0.320456,-0.174837],[-0.37458,2.609447,3.379253],[-3.095244,0.256205,2.196446],[-4.197985,5.732991,3.262924],[-0.729747,0.246036,0.497036],[-2.356189,5.062,-0.965619],[-1.609036,0.25962,-1.487367],[-4.074381,6.074061,3.409459],[-3.619304,4.0022,2.65705],[-0.543393,8.742896,-1.056622],[-4.30356,6.858934,2.879642],[-0.716688,2.901831,-2.11202],[1.547362,0.083189,1.138764],[-0.250916,0.275268,1.201344],[-3.778035,3.13624,2.466177],[-4.594316,5.771342,3.01694],[-3.717706,3.442887,2.603344],[-4.311163,5.224669,3.019373],[-0.610389,2.095161,-1.923515],[-3.040086,6.196918,-0.429149],[-3.802695,3.768247,2.545523],[-0.159541,2.043362,3.328549],[-3.744329,4.31785,2.491889],[-3.047939,0.214155,1.873639],[-4.41685,6.113058,3.166774],[-1.165133,0.460692,-1.742134],[-1.371289,4.249996,-1.317935],[-3.447883,0.3521,0.466205],[-4.495555,6.465548,2.944147],[-3.455335,0.171653,0.390816],[-3.964028,4.017196,2.376009],[-1.323595,1.763126,-0.750772],[-3.971142,5.277524,-0.19496],[-3.222052,0.237723,0.872229],[-4.403784,3.89107,1.872077],[-3.333311,0.342997,0.661016],[-4.495871,4.29606,1.63608],[-3.636081,2.760711,2.361949],[-4.487235,3.559608,1.66737],[-4.719787,7.26888,1.658722],[-1.086143,9.035741,-0.707144],[-2.339693,1.600485,-0.404817],[-4.642011,7.123829,1.990987],[-1.498077,3.854035,-1.369787],[-4.188372,4.729363,2.02983],[-3.116344,5.882284,-0.468884],[-4.305236,4.246417,1.976991],[-3.022509,0.22819,1.065688],[-2.799916,0.52022,1.128319],[-4.262823,3.534409,2.020383],[-4.221533,3.947676,2.11735],[-3.744353,4.391712,-0.6193],[-1.272905,0.156694,-1.741753],[-3.62491,2.669825,-0.549664],[-4.180756,3.096179,1.987215],[-4.059276,4.305313,2.232924],[-2.812753,0.183226,1.370267],[-4.032437,3.512234,2.309985],[-0.03787,0.28188,0.530391],[-4.711562,5.468653,2.822838],[-4.500636,6.953314,2.564445],[-4.479433,7.216991,2.270682],[3.990562,0.50522,0.716309],[-2.512229,6.863447,-0.100658],[-2.968058,6.956639,-0.37061],[2.550375,3.142683,-1.54068],[-2.320059,3.521605,-1.279397],[-4.556319,6.64662,2.745363],[-4.281091,7.108116,2.667598],[-2.050095,8.411689,0.121353],[-2.44854,1.135487,0.851875],[3.121815,0.699943,-0.277167],[-4.69877,6.00376,2.843035],[-1.360599,8.824742,-0.595597],[1.128437,0.171611,0.301691],[-4.360146,6.289423,0.042233],[1.400795,4.088829,-1.620409],[-3.193462,8.460137,-3.559446],[-3.168771,8.878431,-3.635795],[-3.434275,9.304302,-3.460878],[-3.349993,8.808093,-3.38179],[-3.304823,8.323865,-3.325905],[-3.572607,9.308843,-3.207672],[-3.166393,8.201215,-3.43014],[-3.451638,9.05331,-3.351345],[-3.309591,8.549758,-3.375055],[-3.527992,8.793926,-3.100376],[-3.6287,8.981677,-3.076319],[-3.445505,8.001887,-2.8273],[-3.408011,8.221014,-3.039237],[-3.65928,8.740382,-2.808856],[-3.878019,8.797295,-2.462866],[-3.515132,8.232341,-2.747739],[-3.460331,8.51524,-3.06818],[-3.403703,7.658628,-2.648789],[-3.507113,8.00159,-2.582275],[-3.607373,8.174737,-2.401723],[-3.749043,8.378084,-2.226959],[-3.648514,8.502213,-2.6138],[-2.534199,0.904753,2.021148],[1.4083,5.744252,-0.571402],[-3.852536,8.571009,-2.352358],[2.868255,5.373126,-0.163705],[2.224363,4.669891,-1.061586],[-4.528281,4.885838,1.340274],[1.30817,4.609629,-1.28762],[-4.519698,3.422501,1.354826],[-3.549955,7.783228,-2.332859],[1.12313,6.120856,0.045115],[-3.620324,7.57716,-2.033423],[-0.798833,2.624133,-1.992682],[-3.617587,7.783148,-2.051383],[-3.669293,8.103776,-2.10227],[-3.892417,8.667436,-2.167288],[-0.537435,0.285345,-0.176267],[-0.841522,3.299866,-1.887861],[-0.761547,3.647082,-1.798953],[-3.661544,7.85708,-1.867924],[-3.886763,8.551783,-1.889171],[-0.591244,1.549749,-1.714784],[-0.775276,1.908218,-1.597609],[-0.961458,2.573273,-1.695549],[-2.215672,1.335009,2.143031],[-4.622674,4.130242,1.220683],[1.07344,0.290099,1.584734],[-0.976906,2.92171,-1.76667],[-1.13696,3.194401,-1.513455],[-3.743262,7.99949,-1.629286],[-2.876359,4.900986,-0.879556],[0.550835,3.905557,-2.031372],[0.777647,4.992314,-1.215703],[1.445881,4.266201,-1.414663],[1.274222,5.510543,-0.824495],[-0.864685,2.318581,-1.702389],[-0.627458,3.820722,-1.743153],[-3.867699,8.30866,-1.850066],[1.635287,5.45587,-0.83844],[-1.037876,2.538589,-1.513504],[-4.38993,4.73926,1.699639],[0.048709,4.765232,-1.279506],[-0.626548,1.339887,-1.595114],[-3.682827,7.643453,-1.723398],[-3.868783,8.180191,-1.511743],[-0.76988,1.508373,-1.419599],[-1.138374,2.766765,-1.448163],[1.699883,5.780752,-0.475361],[1.214305,0.308517,1.866405],[-1.713642,0.373461,-1.265204],[-1.582388,0.58294,-1.267977],[-0.879549,1.821581,-1.313787],[0.519057,5.858757,-0.381397],[-3.770989,2.449208,-0.132655],[0.087576,0.156713,-1.53616],[-0.942622,2.146534,-1.421494],[-1.026192,1.022164,-1.145423],[-0.964079,1.645473,-1.067631],[-1.109128,2.458789,-1.29106],[-1.037478,0.209489,-1.805424],[-3.724391,7.599686,-1.273458],[-3.787898,7.951792,-1.304794],[3.821677,2.165581,-0.181535],[-2.39467,0.304606,-0.570375],[-2.352928,1.0439,2.079369],[-0.288899,9.640684,-1.006079],[-3.472118,7.263001,-1.080326],[-1.240769,0.972352,-0.976446],[-1.845253,0.356801,-0.995574],[-2.32279,7.915361,-0.057477],[-1.08092,2.179315,-1.168821],[4.598833,2.156768,0.280264],[-4.725417,6.442373,2.056809],[-0.490347,9.46429,-0.981092],[-1.99652,0.09737,-0.765828],[-1.137793,1.888846,-0.894165],[-0.37247,4.29661,-1.465199],[-0.184631,5.692946,-0.421398],[-3.751694,7.742231,-1.086908],[-1.001416,1.298225,-0.904674],[-3.536884,7.190777,-0.788609],[-3.737597,7.511281,-0.940052],[-1.766651,0.669388,-0.873054],[3.112245,3.474345,-1.129672],[-0.175504,3.81298,-2.0479],[-3.766762,7.412514,-0.681569],[-0.63375,9.439424,-0.785128],[-0.518199,4.768982,-1.258625],[0.790619,4.212759,-1.610218],[-3.761951,3.742528,-0.756283],[0.897483,5.679808,-0.612423],[2.221126,4.427468,-1.252155],[-0.728577,5.846457,0.062702],[0.194451,9.503908,-1.482461],[-0.099243,9.385459,-1.39564],[0.643185,3.636855,-2.180247],[0.894522,5.900601,-0.356935],[2.595516,4.75731,-0.893245],[1.108497,3.936893,-1.905098],[1.989894,5.789726,-0.343268],[-3.802345,7.655508,-0.613817],[2.339353,4.96257,-0.90308],[0.12564,4.013324,-1.879236],[-4.078965,3.683254,-0.445439],[2.092899,5.256128,-0.831607],[0.427571,0.291769,1.272964],[2.335549,3.480056,-1.581949],[-0.15687,0.324827,-1.648922],[-0.536522,5.760786,-0.203535],[1.507082,0.078251,-0.923109],[-1.854742,0.134826,2.698774],[-3.939827,3.168498,-0.526144],[-3.98461,3.39869,-0.533212],[-3.961738,4.217132,-0.489147],[4.273789,2.181164,0.153786],[-0.470498,5.645664,-0.439079],[-0.414539,5.488017,-0.673379],[-0.097462,5.062739,-1.114863],[1.198092,5.882232,-0.391699],[2.855834,5.085022,-0.498678],[1.037998,4.129757,-1.701811],[1.728091,5.068444,-1.063761],[-3.832258,2.625141,-0.311384],[-4.078526,3.070256,-0.284362],[-4.080365,3.954243,-0.440471],[-0.152578,5.276267,-0.929815],[-1.489635,8.928082,-0.295891],[0.759294,5.15585,-1.087374],[-4.000338,2.801647,-0.235135],[-4.290801,3.823209,-0.19374],[-4.221493,4.25618,-0.189894],[-4.066195,4.71916,-0.201724],[-0.155386,4.076396,-1.662865],[3.054571,4.414305,-0.825985],[-1.652919,8.726499,-0.388504],[-3.042753,0.560068,-0.126425],[-2.434456,1.118088,-0.213563],[-2.623502,1.845062,-0.283697],[-4.233371,3.43941,-0.202918],[2.726702,3.82071,-1.280097],[0.184199,4.14639,-1.673653],[-1.289203,0.624562,-1.560929],[-3.823676,7.382458,-0.407223],[0.476667,5.064419,-1.143742],[-3.873651,4.955112,-0.269389],[1.349666,5.312227,-1.000274],[-2.043776,8.434488,-0.108891],[-2.763964,0.733395,-0.129294],[-4.380505,3.664409,-0.024546],[-0.71211,5.341811,-0.803281],[-3.960858,7.183112,-0.118407],[-3.822277,7.712853,-0.263221],[-2.346808,8.108588,0.063244],[-1.841731,8.642999,-0.142496],[-2.600055,0.985604,-0.043595],[-3.513057,2.213243,-0.044151],[-3.963492,2.603055,-0.080898],[-4.258066,3.14537,-0.027046],[-4.261572,5.00334,0.13004],[0.795464,3.99873,-1.905688],[-3.300873,0.384761,0.013271],[-2.770244,0.881942,0.077313],[-3.456227,1.993871,0.301054],[-4.441987,3.914144,0.177867],[-4.367075,6.611414,0.165312],[-3.201767,0.576292,0.105769],[-3.174354,0.645009,0.440373],[-2.996576,0.74262,0.161325],[-2.724979,1.656497,0.092983],[-3.261757,2.017742,-0.070763],[-4.280173,4.518235,-0.002999],[-4.471073,5.945358,0.05202],[-3.877137,2.40743,0.274928],[-4.371219,4.252758,0.078039],[-3.400914,0.40983,0.238599],[-4.44293,3.523242,0.146339],[-4.574528,5.279761,0.353923],[-4.226643,7.191282,0.269256],[-4.16361,2.843204,0.097727],[-4.528506,5.011661,0.536625],[0.35514,5.664802,-0.572814],[2.508711,5.580976,-0.266636],[2.556226,3.633779,-1.426362],[1.878456,4.533714,-1.223744],[2.460709,4.440241,-1.1395],[2.218589,5.514603,-0.560066],[2.263712,5.737023,-0.250694],[2.964981,3.814858,-1.139927],[0.991384,5.304131,-0.999867],[2.81187,4.547292,-0.916025],[2.918089,4.768382,-0.702808],[3.262403,4.414286,-0.657935],[0.652136,6.089113,0.069089],[3.361389,3.5052,-0.946123],[2.613042,5.037192,-0.697153],[0.094339,4.36858,-1.451238],[3.290862,4.155716,-0.732318],[2.658063,4.073614,-1.217455],[3.260349,3.753257,-0.946819],[1.124268,4.862463,-1.207855],[3.35158,4.899247,-0.027586],[3.194057,4.691257,-0.524566],[3.090119,5.116085,-0.23255],[2.418965,3.811753,-1.419399],[2.191789,3.877038,-1.47023],[4.043166,2.034188,0.015477],[-1.026966,0.86766,-1.410912],[1.937563,3.860005,-1.617465],[2.98904,4.101806,-0.998132],[-0.142611,5.865305,-0.100872],[3.972673,2.292069,0.089463],[3.23349,3.959925,-0.849829],[0.16304,5.857276,-0.216704],[4.122964,1.770061,-0.114906],[2.099057,4.978374,-0.98449],[3.502411,3.76181,-0.667502],[2.079484,5.939614,-0.036205],[-0.084568,3.525193,-2.253506],[0.423859,4.06095,-1.845327],[1.6013,6.006466,-0.153429],[0.271701,3.844964,-2.078748],[0.273577,5.218904,-0.994711],[-0.410578,3.92165,-1.773635],[1.941954,5.60041,-0.621569],[0.100825,5.462131,-0.774256],[-0.53016,3.619892,-2.027451],[-0.822371,5.517453,-0.605747],[-2.474925,7.670892,-0.020174],[4.01571,0.830194,-0.013793],[-0.400092,5.094112,-1.041992],[-2.887284,5.581246,-0.525324],[-1.559841,6.050972,0.079301],[-0.469317,3.291673,-2.235211],[0.337397,3.467926,-2.295458],[-2.632074,5.573701,-0.582717],[-0.030318,6.011395,0.276616],[-0.934373,0.388987,-1.780523],[-2.661263,5.844838,-0.425966],[0.549353,5.489646,-0.807268],[-2.194355,6.197491,-0.109322],[-2.289618,5.664813,-0.581098],[1.583583,3.796366,-1.844498],[0.855295,0.215979,-1.425557],[-2.627569,5.300236,-0.767174],[4.333347,2.384332,0.399129],[-1.880401,5.583843,-0.696561],[-2.172346,5.324859,-0.846246],[-2.27058,5.906265,-0.388373],[-1.960049,5.889346,-0.397593],[0.965756,3.67547,-2.105671],[-2.014066,6.431125,0.287254],[-1.776173,5.287097,-0.89091],[-2.025852,5.089562,-0.980218],[-1.886418,6.108358,-0.000667],[-1.600803,5.785347,-0.491069],[-1.66188,4.968053,-1.042535],[-1.600621,5.962818,-0.188044],[-1.588831,5.615418,-0.665456],[4.46901,1.880138,0.057248],[-1.978845,0.927399,-0.554856],[-1.408074,5.325266,-0.83967],[1.923123,4.843955,-1.101389],[-2.87378,0.117106,-0.412735],[-1.222193,5.62638,-0.539981],[-2.632537,0.166349,-0.489218],[-1.370865,5.838832,-0.341026],[-1.067742,5.448874,-0.692701],[-1.073798,5.220878,-0.908779],[-1.147562,4.950417,-1.079727],[-2.789115,4.531047,-1.042713],[-3.550826,4.170487,-0.806058],[-3.331694,4.798177,-0.69568],[-3.689404,4.688543,-0.534317],[-3.511509,5.106246,-0.483632],[1.796344,0.076137,0.080455],[-3.306354,5.473605,-0.478764],[-2.692503,3.346604,-1.20959],[-3.963056,5.187462,3.113156],[-3.901231,6.391477,-0.246984],[4.484234,1.518638,-0.001617],[4.308829,1.657716,-0.119275],[4.290045,1.339528,-0.110626],[-3.514938,3.524974,-0.909109],[-2.1943,2.12163,-0.71966],[4.108206,1.091087,-0.11416],[3.785312,1.392435,-0.28588],[4.092886,1.480476,-0.210655],[-2.965937,6.469006,-0.379085],[-3.708581,2.962974,-0.63979],[-3.297971,2.218917,-0.299872],[3.806949,0.804703,-0.11438],[3.747957,1.059258,-0.273069],[-3.101827,4.111444,-1.006255],[-1.536445,4.658913,-1.195049],[-3.549826,2.450555,-0.375694],[-3.676495,2.108366,0.534323],[-3.674738,5.925075,-0.400011],[-2.250115,2.848335,-1.121174],[-3.698062,5.667567,-0.381396],[3.468966,0.734643,-0.190624],[-3.97972,5.670078,-0.26874],[-3.002087,4.337837,-1.033421],[-3.356392,2.608308,-0.713323],[-1.833016,3.359983,-1.28775],[-1.989069,3.632416,-1.305607],[3.591254,0.542371,0.026146],[3.364927,1.082572,-0.342613],[-3.393759,3.866801,-0.937266],[-4.124865,5.549529,-0.161729],[-4.423423,5.687223,0.000103],[-1.496881,2.601785,-1.114328],[-2.642297,6.496932,-0.264175],[-3.684236,6.819423,-0.320233],[-2.286996,3.167067,-1.246651],[-1.624896,8.44848,-0.530014],[-3.666787,2.159266,0.268149],[-2.402625,2.011243,-0.56446],[-2.736166,2.259839,-0.6943],[-2.168611,3.89078,-1.292206],[-2.065956,3.345708,-1.281346],[-2.778147,2.675605,-0.995706],[-3.507431,4.513272,-0.71829],[-2.301184,4.293911,-1.238182],[3.205808,0.211078,0.394349],[-2.129936,4.870577,-1.080781],[-2.287977,2.496593,-0.934069],[-2.701833,2.931814,-1.114509],[3.294795,0.50631,-0.081062],[-2.552829,7.468771,-0.021541],[3.06721,0.944066,-0.43074],[-2.86086,1.973622,-0.303132],[-3.598818,5.419613,-0.401645],[-1.524381,0.080156,-1.61662],[-1.907291,2.646274,-1.039438],[2.950783,0.407562,-0.105407],[-1.663048,1.655038,-0.689787],[-1.728102,1.110064,-0.635963],[-2.085823,7.686296,-0.159745],[2.883518,3.157009,-1.30858],[-2.724116,0.417169,-0.389719],[-1.788636,7.862672,-0.346413],[-2.186418,1.249609,-0.434583],[-3.092434,2.606657,-0.860002],[-1.737314,3.874201,-1.330986],[2.564522,0.422967,-0.390903],[1.670782,3.538432,-1.924753],[-2.338131,4.02578,-1.286673],[-1.916516,4.054121,-1.301788],[2.87159,2.034949,-1.267139],[-1.931518,3.062883,-1.197227],[-0.816602,0.135682,3.104104],[0.469392,0.213916,-1.489608],[2.574055,1.950091,-1.514427],[2.733595,2.682546,-1.461213],[-1.915407,4.693647,-1.151721],[-3.412883,5.867094,-0.450528],[2.28822,0.120432,-0.04102],[2.244477,0.14424,-0.376933],[-1.676198,3.570698,-1.328031],[-1.821193,4.366982,-1.266271],[-1.552208,8.099221,-0.53262],[-1.727419,2.39097,-0.989456],[-2.468226,4.711663,-1.069766],[-2.451669,6.113319,-0.273788],[2.635447,2.295842,-1.518361],[-2.020809,8.150253,-0.246714],[2.292455,0.805596,-1.3042],[2.641556,1.65665,-1.466962],[2.409062,2.842538,-1.635025],[2.456682,1.459484,-1.57543],[-1.691047,3.173582,-1.247082],[-1.865642,1.957608,-0.768683],[-3.401579,0.20407,0.100932],[2.301981,1.7102,-1.650461],[2.342929,2.611944,-1.690713],[-1.676111,2.923894,-1.17835],[-2.992039,3.547631,-1.118945],[-3.571677,6.504634,-0.375455],[2.141764,1.460869,-1.702464],[-3.221958,5.146049,-0.615632],[2.19238,2.949367,-1.747242],[2.320791,2.232971,-1.706842],[2.088678,2.585235,-1.813159],[-2.196404,0.592218,-0.569709],[-2.120811,1.836483,-0.62338],[-1.949935,2.271249,-0.874128],[2.235901,1.110183,-1.510719],[2.020157,3.241128,-1.803917],[2.054336,1.949394,-1.792332],[-3.094117,4.996595,-0.740238],[2.038063,0.635949,-1.402041],[1.980644,1.684408,-1.76778],[1.587432,3.306542,-1.991131],[1.935322,0.976267,-1.602208],[1.922621,1.235522,-1.698813],[1.712495,1.911874,-1.903234],[1.912802,2.259273,-1.888698],[1.884367,0.355453,-1.312633],[1.676427,0.76283,-1.539455],[1.78453,2.83662,-1.943035],[1.697312,0.120281,-1.150324],[1.648318,2.484973,-1.999505],[-4.051804,5.958472,-0.231731],[-1.964823,1.464607,-0.58115],[1.55996,2.183486,-1.971378],[1.628125,1.045912,-1.707832],[1.701684,1.540428,-1.827156],[1.567475,4.869481,-1.184665],[1.432492,0.843779,-1.648083],[1.173837,2.978983,-2.156687],[1.235287,3.37975,-2.09515],[1.252589,1.525293,-1.949205],[1.159334,2.336379,-2.105361],[1.49061,2.695263,-2.083216],[-4.122486,6.782604,-0.02545],[1.173388,0.279193,-1.423418],[1.505684,0.380815,-1.414395],[1.391423,1.343031,-1.843557],[1.263449,2.73225,-2.144961],[1.295858,0.597122,-1.515628],[1.245851,3.729126,-1.993015],[-2.761439,6.23717,-0.365856],[0.978887,1.664888,-2.046633],[1.219542,0.982729,-1.785486],[1.315915,1.91748,-2.02788],[-3.052746,2.127222,-0.369082],[0.977656,1.36223,-1.944119],[0.936122,3.39447,-2.203007],[-2.740036,4.184702,-1.122849],[0.853581,2.864694,-2.260847],[0.719569,0.818762,-1.763618],[0.839115,1.159359,-1.907943],[0.932069,1.94559,-2.117962],[0.579321,3.326747,-2.299369],[0.86324,0.597822,-1.565106],[0.574567,1.158452,-1.943123],[0.525138,2.137252,-2.213867],[0.779941,2.342019,-2.206157],[0.915255,2.618102,-2.209041],[0.526426,3.02241,-2.321826],[0.495431,2.521396,-2.295905],[0.80799,3.156817,-2.286432],[0.273556,1.304936,-2.012509],[0.664326,1.530024,-2.048722],[0.219173,2.32907,-2.323212],[0.405324,0.695359,-1.704884],[0.398827,0.946649,-1.843899],[0.345109,1.608829,-2.100174],[-2.356743,0.062032,-0.4947],[-3.001084,0.27146,2.560034],[-2.064663,0.303055,-0.697324],[0.221271,3.174023,-2.374399],[0.195842,0.437865,-1.621473],[-0.385613,0.297763,1.960096],[1.999609,0.108928,-0.79125],[0.351698,9.227494,-1.57565],[0.021477,2.191913,-2.309353],[0.246381,2.836575,-2.356365],[1.543281,0.237539,1.901906],[0.031881,9.147022,-1.454203],[-0.001881,1.648503,-2.108044],[0.333423,1.907088,-2.204533],[0.044063,2.634032,-2.368412],[-0.028148,3.053684,-2.390082],[0.02413,3.34297,-2.36544],[-0.272645,9.02879,-1.238685],[-0.006348,0.832044,-1.758222],[-0.321105,1.458754,-1.886313],[-0.153948,8.618809,-1.105353],[-0.409303,1.137783,-1.720556],[-0.410054,1.742789,-1.957989],[-0.287905,2.380404,-2.294509],[-0.261375,2.646629,-2.356322],[-0.221986,3.215303,-2.345844],[-0.31608,0.687581,-1.71901],[-0.537705,0.855802,-1.648585],[-0.142834,1.193053,-1.87371],[-0.24371,2.044435,-2.176958],[-0.437999,2.959748,-2.299698],[-0.78895,0.176226,-1.729046],[-0.608509,0.546932,-1.734032],[-0.693698,4.478782,-1.369372],[-0.669153,8.469645,-0.911149],[-0.741857,1.082705,-1.458474],[-0.554059,2.440325,-2.141785],[2.09261,0.153182,2.57581],[1.792547,0.111794,2.563777],[1.855787,0.189541,2.835089],[1.492601,0.232246,2.987681],[-0.284918,0.236687,3.429738],[2.604841,0.11997,1.01506],[0.331271,0.168113,3.124031],[0.280606,0.308368,2.495937],[0.544591,0.325711,2.081274],[0.193145,0.19154,-0.977556],[3.810099,0.42324,1.032202],[3.54622,0.379245,1.392814],[0.61402,0.276328,0.849356],[-1.198628,0.144953,2.911457],[4.17199,0.68037,1.391526],[0.88279,0.321339,2.059129],[1.93035,0.109992,2.054154],[1.620331,0.121986,2.37203],[2.374812,0.10921,1.734876],[-0.031227,0.294412,2.593687],[4.075018,0.561914,1.038065],[-0.570366,0.126583,2.975558],[0.950052,0.318463,1.804012],[1.130034,0.117125,0.98385],[2.123049,0.08946,1.665911],[2.087572,0.068621,0.335013],[2.927337,0.167117,0.289611],[0.528876,0.313434,3.205969],[1.174911,0.162744,1.328262],[-4.88844,5.59535,1.661134],[-4.709607,5.165338,1.324082],[0.871199,0.277021,1.263831],[-3.910877,2.349318,1.272269],[1.56824,0.118605,2.768112],[1.179176,0.152617,-0.858003],[1.634629,0.247872,2.128625],[-4.627425,5.126935,1.617836],[3.845542,0.54907,1.45601],[2.654006,0.165508,1.637169],[-0.678324,0.26488,1.974741],[2.451139,0.100377,0.213768],[0.633199,0.286719,0.403357],[-0.533042,0.2524,1.373267],[0.99317,0.171106,0.624966],[-0.100063,0.306466,2.170225],[1.245943,0.092351,0.661031],[1.390414,0.198996,-0.0864],[-4.457265,5.030531,2.138242],[2.89776,0.146575,1.297468],[1.802703,0.088824,-0.490405],[1.055447,0.309261,2.392437],[2.300436,0.142429,2.104254],[2.33399,0.187756,2.416935],[2.325183,0.134349,0.574063],[2.410924,0.370971,2.637115],[1.132924,0.290511,3.061],[1.764028,0.070212,-0.80535],[2.156994,0.397657,2.844061],[0.920711,0.225527,-0.882456],[-4.552135,5.24096,2.85514],[0.210016,0.309396,2.064296],[0.612067,0.136815,-1.086002],[3.150236,0.426757,1.802703],[-0.24824,0.282258,1.470997],[0.974269,0.301311,-0.640898],[-4.401413,5.03966,2.535553],[0.644319,0.274006,-0.817806],[0.332922,0.309077,0.108474],[3.610001,0.317447,0.689353],[3.335681,0.358195,0.118477],[0.623544,0.318983,-0.4193],[-0.11012,0.307747,1.831331],[-0.407528,0.291044,2.282935],[0.069783,0.285095,0.950289],[0.970135,0.310392,-0.283742],[0.840564,0.306898,0.098854],[-0.541827,0.267753,1.683795],[-3.956082,4.55713,2.297164],[-4.161036,2.834481,1.64183],[-4.093952,4.977551,2.747747],[2.661819,0.261867,1.926145],[-3.749926,2.161875,0.895238],[-2.497776,1.3629,0.791855],[0.691482,0.304968,1.582939],[-4.013193,4.830963,2.4769],[-3.639585,2.091265,1.304415],[-3.9767,2.563053,1.6284],[-3.979915,2.788616,1.977977],[0.388782,0.312656,1.709168],[-3.40873,1.877324,0.851652],[-3.671637,5.136974,3.170734],[-3.12964,1.852012,0.157682],[-3.629687,4.852698,2.686837],[-3.196164,1.793459,0.452804],[-3.746338,2.31357,1.648551],[2.992192,0.125251,0.575976],[-3.254051,0.054431,0.314152],[-3.474644,1.925288,1.134116],[-3.418372,2.022882,1.578901],[-2.920955,1.705403,0.29842],[-3.57229,2.152022,1.607572],[-3.251259,0.09013,-0.106174],[-3.299952,1.877781,1.348623],[-3.666819,2.441459,2.004838],[-2.912646,1.824748,-0.045348],[-3.399511,2.479484,2.340393],[-3.009754,0.015286,0.075567],[-3.381443,2.316937,2.156923],[-3.352801,2.133341,1.857366],[-3.01788,1.687685,0.645867],[-2.931857,1.678712,1.158472],[-3.301008,0.08836,0.591001],[1.358025,0.19795,1.599144],[-2.999565,1.845016,1.618396],[-2.767957,0.028397,-0.196436],[-2.93962,2.078779,2.140593],[-3.346648,2.674056,2.518097],[3.324322,0.20822,0.628605],[3.091677,0.137202,0.9345],[-2.881807,0.009952,0.318439],[-2.764946,1.786619,1.693439],[-2.905542,1.932343,1.900002],[-3.140854,2.271384,2.274946],[-2.88995,2.487856,2.574759],[-2.367194,-0.000943,-0.15576],[-3.050738,0.068703,0.742988],[-2.759525,1.55679,0.877782],[-3.151775,2.48054,2.482749],[-2.578618,-0.002885,0.165716],[-2.651618,1.877246,1.981189],[-2.933973,0.133731,1.631023],[1.047628,0.100284,-1.085248],[-1.585123,0.062083,-1.394896],[-2.287917,-0.002671,0.214434],[-2.524899,0.007481,0.471788],[-2.815492,2.188198,2.343294],[-2.095142,-0.003149,-0.094574],[-2.172686,-0.000133,0.47963],[-2.732704,0.074306,1.742079],[-2.49653,2.145668,2.42691],[-1.343683,0.047721,-1.506391],[-2.581185,0.048703,0.975528],[-2.905101,0.083158,2.010052],[-2.601514,2.007801,2.223089],[-2.339464,0.02634,1.484304],[-2.907873,0.10367,2.378149],[-1.368796,0.062516,-1.049125],[-1.93244,0.02443,-0.427603],[-2.705081,0.060513,2.303802],[3.372155,0.206274,0.892293],[-1.761827,0.093202,-1.037404],[-1.700667,0.0397,-0.614221],[-1.872291,0.011979,-0.135753],[-1.929257,0.074005,0.728999],[-2.520128,0.049665,1.99054],[-2.699411,0.10092,2.603116],[3.211701,0.27302,1.423357],[-1.445362,0.1371,-0.626491],[2.921332,0.259112,1.645525],[-0.993242,0.058686,-1.408916],[-0.944986,0.157541,-1.097665],[-2.154301,0.032749,1.882001],[-2.108789,1.988557,2.442673],[-1.015659,0.25497,-0.416665],[-1.898411,0.015872,0.16715],[-1.585517,0.027121,0.453445],[-2.311105,0.061264,2.327061],[-2.637042,0.152224,2.832201],[-2.087515,2.292972,2.617585],[-0.750611,0.056697,-1.504516],[-0.472029,0.075654,-1.360203],[-0.710798,0.139244,-1.183863],[-0.97755,0.26052,-0.831167],[-0.655814,0.260843,-0.880068],[-0.897513,0.275537,-0.133042],[-2.049194,0.084947,2.455422],[-0.177837,0.076362,-1.449009],[-0.553393,0.279083,-0.59573],[-1.788636,0.06163,2.231198],[-0.34761,0.255578,-0.999614],[-1.398589,0.036482,0.65871],[-1.133918,0.05617,0.69473],[-1.43369,0.058226,1.977865],[-2.505459,1.492266,1.19295]]
exports.cells=[[2,1661,3],[1676,7,6],[712,1694,9],[3,1674,1662],[11,1672,0],[1705,0,1],[5,6,1674],[4,5,1674],[7,8,712],[2,1662,10],[1,10,1705],[11,1690,1672],[1705,11,0],[5,1676,6],[7,9,6],[7,712,9],[2,3,1662],[3,4,1674],[1,2,10],[12,82,1837],[1808,12,1799],[1808,1799,1796],[12,861,82],[861,1808,13],[1808,861,12],[1799,12,1816],[1680,14,1444],[15,17,16],[14,1678,1700],[16,17,1679],[15,1660,17],[14,1084,1678],[15,1708,18],[15,18,1660],[1680,1084,14],[1680,15,1084],[15,1680,1708],[793,813,119],[1076,793,119],[1076,1836,22],[23,19,20],[21,1076,22],[21,22,23],[23,20,21],[1076,119,1836],[806,634,470],[432,1349,806],[251,42,125],[809,1171,791],[953,631,827],[634,1210,1176],[157,1832,1834],[56,219,53],[126,38,83],[37,85,43],[59,1151,1154],[83,75,41],[77,85,138],[201,948,46],[1362,36,37],[452,775,885],[1237,95,104],[966,963,1262],[85,77,43],[36,85,37],[1018,439,1019],[41,225,481],[85,83,127],[93,83,41],[935,972,962],[116,93,100],[98,82,813],[41,75,225],[298,751,54],[1021,415,1018],[77,138,128],[766,823,1347],[593,121,573],[905,885,667],[786,744,747],[100,41,107],[604,334,765],[779,450,825],[968,962,969],[225,365,481],[365,283,196],[161,160,303],[875,399,158],[328,1817,954],[62,61,1079],[358,81,72],[74,211,133],[160,161,138],[91,62,1079],[167,56,1405],[56,167,219],[913,914,48],[344,57,102],[43,77,128],[1075,97,1079],[389,882,887],[219,108,53],[1242,859,120],[604,840,618],[754,87,762],[197,36,1362],[1439,88,1200],[1652,304,89],[81,44,940],[445,463,151],[717,520,92],[129,116,100],[1666,1811,624],[1079,97,91],[62,91,71],[688,898,526],[463,74,133],[278,826,99],[961,372,42],[799,94,1007],[100,93,41],[1314,943,1301],[184,230,109],[875,1195,231],[133,176,189],[751,755,826],[101,102,57],[1198,513,117],[748,518,97],[1145,1484,1304],[358,658,81],[971,672,993],[445,151,456],[252,621,122],[36,271,126],[85,36,126],[116,83,93],[141,171,1747],[1081,883,103],[1398,1454,149],[457,121,593],[127,116,303],[697,70,891],[457,891,1652],[1058,1668,112],[518,130,97],[214,319,131],[185,1451,1449],[463,133,516],[1428,123,177],[113,862,561],[215,248,136],[186,42,251],[127,83,116],[160,85,127],[162,129,140],[154,169,1080],[169,170,1080],[210,174,166],[1529,1492,1524],[450,875,231],[399,875,450],[171,141,170],[113,1155,452],[131,319,360],[44,175,904],[452,872,113],[746,754,407],[147,149,150],[309,390,1148],[53,186,283],[757,158,797],[303,129,162],[429,303,162],[154,168,169],[673,164,193],[38,271,75],[320,288,1022],[246,476,173],[175,548,904],[182,728,456],[199,170,169],[168,199,169],[199,171,170],[184,238,230],[246,247,180],[1496,1483,1467],[147,150,148],[828,472,445],[53,108,186],[56,53,271],[186,961,42],[1342,391,57],[1664,157,1834],[1070,204,178],[178,204,179],[285,215,295],[692,55,360],[192,193,286],[359,673,209],[586,195,653],[121,89,573],[202,171,199],[238,515,311],[174,210,240],[174,105,166],[717,276,595],[1155,1149,452],[1405,56,197],[53,283,30],[75,53,30],[45,235,1651],[210,166,490],[181,193,192],[185,620,217],[26,798,759],[1070,226,204],[220,187,179],[220,168,187],[202,222,171],[359,209,181],[182,456,736],[964,167,1405],[76,250,414],[807,1280,1833],[70,883,1652],[227,179,204],[221,199,168],[221,202,199],[360,494,131],[214,241,319],[105,247,166],[205,203,260],[388,480,939],[482,855,211],[8,807,1833],[226,255,204],[228,221,168],[166,173,490],[701,369,702],[211,855,262],[631,920,630],[1448,1147,1584],[255,227,204],[237,220,179],[228,168,220],[222,256,555],[215,259,279],[126,271,38],[108,50,186],[227,236,179],[236,237,179],[220,237,228],[228,202,221],[256,222,202],[555,256,229],[259,152,279],[27,1296,31],[186,50,961],[961,234,372],[1651,235,812],[1572,1147,1448],[255,226,1778],[255,236,227],[256,257,229],[106,184,109],[241,410,188],[177,578,620],[209,673,181],[1136,1457,79],[1507,245,718],[255,273,236],[275,410,241],[206,851,250],[1459,253,1595],[1406,677,1650],[228,274,202],[202,281,256],[348,239,496],[205,172,203],[369,248,702],[261,550,218],[261,465,550],[574,243,566],[921,900,1220],[291,273,255],[348,238,265],[109,230,194],[149,380,323],[443,270,421],[272,291,255],[274,228,237],[274,292,202],[281,257,256],[276,543,341],[152,259,275],[1111,831,249],[632,556,364],[299,273,291],[299,236,273],[280,237,236],[202,292,281],[247,246,173],[282,49,66],[1620,1233,1553],[299,280,236],[280,305,237],[237,305,274],[306,292,274],[330,257,281],[246,194,264],[166,247,173],[912,894,896],[611,320,244],[1154,1020,907],[969,962,290],[272,299,291],[305,318,274],[145,212,240],[164,248,285],[259,277,275],[193,164,295],[269,240,210],[1033,288,320],[46,948,206],[336,280,299],[330,281,292],[257,307,300],[369,136,248],[145,240,269],[502,84,465],[193,295,286],[164,285,295],[282,302,49],[161,303,429],[318,306,274],[306,330,292],[315,257,330],[315,307,257],[307,352,300],[300,352,308],[275,277,403],[353,1141,333],[1420,425,47],[611,313,320],[85,126,83],[128,1180,43],[303,116,129],[280,314,305],[314,318,305],[190,181,242],[203,214,131],[820,795,815],[322,299,272],[322,336,299],[315,339,307],[172,152,617],[172,214,203],[321,1033,320],[1401,941,946],[85,160,138],[976,454,951],[747,60,786],[317,322,272],[339,352,307],[266,33,867],[163,224,218],[247,614,180],[648,639,553],[388,172,205],[611,345,313],[313,345,320],[160,127,303],[454,672,951],[317,329,322],[314,280,336],[306,338,330],[330,339,315],[1236,115,436],[342,321,320],[1046,355,328],[328,346,325],[325,346,317],[367,314,336],[314,337,318],[337,306,318],[338,343,330],[342,320,345],[355,349,328],[346,329,317],[347,336,322],[314,362,337],[330,343,339],[340,308,352],[135,906,1022],[239,156,491],[194,230,486],[40,1015,1003],[321,355,1046],[329,382,322],[382,347,322],[347,367,336],[337,371,306],[306,371,338],[1681,296,1493],[286,172,388],[230,348,486],[348,183,486],[384,332,830],[328,349,346],[367,362,314],[371,343,338],[339,351,352],[57,344,78],[342,355,321],[386,346,349],[386,350,346],[346,350,329],[347,366,367],[343,363,339],[323,380,324],[152,275,241],[345,1045,342],[350,374,329],[339,363,351],[234,340,352],[353,361,354],[40,34,1015],[373,355,342],[373,349,355],[374,382,329],[366,347,382],[371,363,343],[351,379,352],[379,372,352],[372,234,352],[156,190,491],[319,241,692],[354,361,31],[366,377,367],[363,379,351],[133,590,516],[197,56,271],[1045,370,342],[370,373,342],[374,350,386],[377,366,382],[367,395,362],[400,337,362],[400,371,337],[378,363,371],[106,109,614],[181,673,193],[953,920,631],[376,349,373],[376,386,349],[378,379,363],[224,375,218],[279,152,172],[361,619,381],[1347,823,795],[760,857,384],[392,374,386],[394,395,367],[383,371,400],[383,378,371],[218,375,261],[197,271,36],[414,454,976],[385,376,373],[1051,382,374],[387,394,367],[377,387,367],[395,400,362],[279,172,295],[30,365,225],[450,231,825],[385,373,370],[398,374,392],[1051,377,382],[396,378,383],[348,496,183],[295,172,286],[357,269,495],[1148,390,1411],[75,30,225],[206,76,54],[412,386,376],[412,392,386],[396,383,400],[651,114,878],[123,1241,506],[238,311,265],[381,653,29],[618,815,334],[427,1032,411],[298,414,976],[791,332,384],[129,100,140],[412,404,392],[392,404,398],[140,107,360],[395,394,400],[423,379,378],[385,412,376],[406,94,58],[419,415,1021],[422,423,378],[423,125,379],[258,508,238],[311,156,265],[213,287,491],[449,411,1024],[412,1068,404],[55,140,360],[76,414,54],[394,416,400],[400,416,396],[422,378,396],[1258,796,789],[427,411,449],[427,297,1032],[1385,1366,483],[417,448,284],[1507,341,245],[162,140,444],[658,44,81],[433,125,423],[438,251,125],[429,162,439],[1342,57,1348],[765,766,442],[697,891,695],[1057,396,416],[440,423,422],[440,433,423],[433,438,125],[438,196,251],[74,482,211],[1136,79,144],[29,195,424],[242,1004,492],[57,757,28],[414,298,54],[238,348,230],[224,163,124],[295,215,279],[495,269,490],[449,446,427],[446,297,427],[1020,1163,909],[128,138,419],[66,980,443],[415,439,1018],[111,396,1057],[111,422,396],[840,249,831],[593,664,596],[218,550,155],[109,194,180],[483,268,855],[161,415,419],[1737,232,428],[360,107,494],[1006,1011,410],[444,140,55],[919,843,430],[190,242,213],[275,403,410],[131,494,488],[449,663,446],[138,161,419],[128,419,34],[439,162,444],[460,440,422],[440,438,433],[472,74,445],[491,190,213],[238,508,515],[46,206,54],[972,944,962],[1241,1428,1284],[111,460,422],[470,432,806],[248,164,702],[1025,467,453],[553,1235,648],[263,114,881],[267,293,896],[469,438,440],[455,196,438],[287,242,492],[239,265,156],[213,242,287],[1684,746,63],[663,474,446],[415,161,429],[140,100,107],[1055,459,467],[469,455,438],[259,542,277],[446,474,466],[446,466,447],[439,444,1019],[614,109,180],[190,359,181],[156,497,190],[726,474,663],[1023,458,459],[461,440,460],[269,210,490],[246,180,194],[590,133,189],[163,218,155],[467,468,453],[1063,1029,111],[111,1029,460],[1029,464,460],[461,469,440],[150,149,323],[828,445,456],[375,502,261],[474,475,466],[573,426,462],[478,1023,477],[478,458,1023],[458,479,467],[459,458,467],[468,393,453],[464,461,460],[484,365,455],[1232,182,1380],[172,617,214],[547,694,277],[542,547,277],[184,258,238],[261,502,465],[467,479,468],[484,455,469],[1380,182,864],[475,476,466],[80,447,476],[466,476,447],[415,429,439],[479,487,468],[487,287,468],[492,393,468],[260,469,461],[481,365,484],[531,473,931],[692,360,319],[726,495,474],[468,287,492],[480,464,1029],[260,461,464],[494,481,484],[74,472,482],[174,240,212],[223,106,614],[486,477,485],[478,496,458],[491,487,479],[123,402,177],[488,469,260],[488,484,469],[265,239,348],[248,215,285],[474,490,475],[477,486,478],[458,496,479],[239,491,479],[1584,1147,1334],[488,494,484],[401,123,506],[495,490,474],[490,173,475],[80,476,264],[491,287,487],[480,1029,1004],[480,205,464],[173,476,475],[485,194,486],[486,183,478],[478,183,496],[496,239,479],[848,1166,60],[268,262,855],[205,260,464],[260,203,488],[203,131,488],[246,264,476],[194,485,264],[1002,310,1664],[311,515,497],[515,359,497],[565,359,515],[1250,1236,301],[736,456,151],[654,174,567],[577,534,648],[519,505,645],[725,565,508],[150,1723,148],[584,502,505],[584,526,502],[502,526,84],[607,191,682],[560,499,660],[607,517,191],[1038,711,124],[951,672,971],[716,507,356],[868,513,1198],[615,794,608],[682,191,174],[1313,928,1211],[617,241,214],[511,71,91],[408,800,792],[192,286,525],[80,485,447],[91,97,130],[1675,324,888],[207,756,532],[582,1097,1124],[311,497,156],[510,130,146],[523,511,510],[608,708,616],[546,690,650],[511,527,358],[536,146,518],[465,418,550],[418,709,735],[520,514,500],[584,505,519],[536,518,509],[146,536,510],[538,527,511],[876,263,669],[646,524,605],[510,536,523],[527,175,358],[724,876,669],[721,724,674],[524,683,834],[558,509,522],[558,536,509],[523,538,511],[611,243,574],[528,706,556],[668,541,498],[523,537,538],[527,540,175],[532,756,533],[1013,60,747],[551,698,699],[92,520,500],[535,536,558],[536,569,523],[538,540,527],[539,548,175],[567,212,145],[401,896,293],[534,675,639],[1510,595,1507],[557,545,530],[569,536,535],[537,540,538],[540,539,175],[569,537,523],[1135,718,47],[587,681,626],[580,535,558],[99,747,278],[701,565,725],[665,132,514],[665,514,575],[132,549,653],[176,651,189],[65,47,266],[597,569,535],[569,581,537],[537,581,540],[563,539,540],[539,564,548],[1509,1233,1434],[132,653,740],[550,710,155],[714,721,644],[410,1011,188],[732,534,586],[560,562,729],[555,557,222],[580,558,545],[597,535,580],[581,563,540],[5,821,1676],[576,215,136],[649,457,741],[564,539,563],[124,711,224],[550,668,710],[550,541,668],[565,701,673],[560,613,499],[233,532,625],[545,555,580],[601,581,569],[594,904,548],[1463,1425,434],[185,149,1454],[721,674,644],[185,380,149],[577,424,586],[462,586,559],[597,601,569],[594,548,564],[566,603,574],[165,543,544],[457,89,121],[586,424,195],[725,587,606],[1078,582,1124],[588,925,866],[462,559,593],[189,878,590],[555,229,580],[602,563,581],[904,594,956],[434,1425,1438],[1024,112,821],[572,587,626],[600,597,580],[599,591,656],[600,580,229],[601,622,581],[581,622,602],[602,564,563],[602,594,564],[603,611,574],[498,529,546],[697,1145,70],[592,628,626],[610,597,600],[597,610,601],[222,557,171],[604,765,799],[573,462,593],[133,200,176],[729,607,627],[1011,692,188],[518,146,130],[585,687,609],[682,627,607],[1712,599,656],[562,592,607],[643,656,654],[257,600,229],[601,633,622],[623,594,602],[174,212,567],[725,606,701],[609,701,606],[610,633,601],[633,642,622],[380,216,324],[142,143,1249],[501,732,586],[534,577,586],[648,1235,577],[610,641,633],[310,1002,1831],[618,334,604],[1710,145,269],[707,498,659],[501,586,462],[625,501,462],[726,663,691],[300,600,257],[641,610,600],[622,629,602],[602,629,623],[55,692,444],[518,748,509],[929,1515,1411],[620,578,267],[71,511,358],[707,668,498],[650,687,585],[600,300,641],[641,657,633],[1675,888,1669],[622,636,629],[505,502,375],[541,529,498],[332,420,1053],[637,551,638],[534,639,648],[69,623,873],[300,512,641],[633,657,642],[562,660,579],[687,637,638],[709,646,605],[775,738,885],[559,549,132],[646,683,524],[641,512,657],[266,897,949],[1712,643,1657],[184,727,258],[674,724,669],[699,714,647],[628,659,572],[657,662,642],[571,881,651],[517,607,504],[598,706,528],[598,694,547],[640,552,560],[655,693,698],[698,693,721],[91,510,511],[144,301,1136],[324,216,888],[870,764,1681],[575,514,520],[276,544,543],[658,175,44],[645,505,711],[659,546,572],[700,524,655],[605,700,529],[266,867,897],[1695,1526,764],[579,659,628],[654,591,682],[586,549,559],[698,721,714],[896,401,506],[640,734,599],[664,665,575],[621,629,636],[1712,656,643],[547,644,598],[710,668,707],[640,560,734],[655,698,551],[694,528,277],[512,662,657],[504,592,626],[688,584,519],[152,241,617],[587,725,681],[598,669,706],[526,670,84],[598,528,694],[710,707,499],[579,592,562],[660,659,579],[323,324,1134],[326,895,473],[195,29,653],[84,670,915],[560,660,562],[504,626,681],[711,505,224],[651,881,114],[216,620,889],[1362,678,197],[493,99,48],[1659,691,680],[529,690,546],[430,843,709],[655,524,693],[174,191,105],[674,669,598],[98,712,82],[572,546,585],[72,61,71],[912,911,894],[106,223,184],[664,132,665],[843,646,709],[635,699,136],[699,698,714],[593,132,664],[688,526,584],[185,177,620],[533,675,534],[687,638,635],[1652,89,457],[896,506,912],[132,740,514],[689,685,282],[691,449,680],[48,436,493],[136,699,647],[739,640,554],[549,586,653],[532,533,625],[1530,695,649],[653,381,619],[736,151,531],[188,692,241],[177,402,578],[33,689,867],[689,33,685],[593,559,132],[949,65,266],[711,1038,661],[939,480,1004],[609,369,701],[616,552,615],[619,361,740],[151,463,516],[513,521,117],[691,663,449],[186,251,196],[333,302,327],[613,560,552],[616,613,552],[690,551,637],[660,707,659],[704,208,1203],[418,735,550],[163,708,124],[524,834,693],[554,640,599],[245,341,165],[565,673,359],[155,710,708],[105,191,517],[1515,198,1411],[1709,554,599],[60,289,786],[838,1295,1399],[533,534,625],[710,499,708],[556,632,410],[217,620,216],[591,627,682],[504,503,223],[643,654,567],[690,637,650],[545,557,555],[174,654,682],[719,691,1659],[727,681,508],[645,711,661],[794,615,739],[565,515,508],[282,685,302],[1150,397,1149],[638,699,635],[544,685,33],[719,726,691],[1742,1126,1733],[1724,1475,148],[556,410,403],[185,217,380],[503,504,681],[277,556,403],[32,1178,158],[1712,1709,599],[605,529,541],[635,136,369],[687,635,369],[529,700,690],[700,551,690],[89,304,573],[625,534,732],[730,302,685],[503,681,727],[702,673,701],[730,327,302],[327,353,333],[596,664,575],[660,499,707],[585,546,650],[560,729,734],[700,655,551],[176,571,651],[517,504,223],[730,685,544],[1661,1682,726],[1682,495,726],[1250,301,917],[605,524,700],[609,687,369],[516,389,895],[1553,686,1027],[673,702,164],[656,591,654],[520,596,575],[402,123,401],[828,456,728],[1645,677,1653],[528,556,277],[638,551,699],[190,497,359],[276,730,544],[1117,1525,933],[1027,686,1306],[155,708,163],[709,605,541],[647,644,547],[650,637,687],[599,734,591],[578,293,267],[1682,357,495],[510,91,130],[734,729,627],[576,542,215],[709,541,735],[735,541,550],[276,500,730],[500,327,730],[653,619,740],[414,851,454],[734,627,591],[729,562,607],[615,552,640],[525,181,192],[308,512,300],[223,503,727],[266,165,33],[92,500,276],[321,1046,1033],[585,609,606],[1200,1559,86],[628,572,626],[301,436,803],[714,644,647],[708,499,613],[721,693,724],[514,353,327],[353,740,361],[344,158,78],[708,613,616],[615,640,739],[500,514,327],[514,740,353],[1449,177,185],[462,233,625],[851,405,1163],[608,616,615],[647,542,576],[625,732,501],[1097,582,1311],[1235,424,577],[579,628,592],[607,592,504],[24,432,470],[105,614,247],[104,742,471],[542,259,215],[365,196,455],[1420,47,65],[223,727,184],[547,542,647],[572,585,606],[587,572,606],[262,780,1370],[647,576,136],[644,674,598],[271,53,75],[727,508,258],[471,742,142],[505,375,224],[357,1710,269],[725,508,681],[659,498,546],[743,1178,32],[1195,634,231],[1176,24,470],[743,1110,1178],[135,809,857],[63,746,407],[634,1176,470],[159,1112,27],[1176,1685,24],[399,450,779],[1178,856,875],[751,744,54],[436,48,772],[634,1108,1210],[769,1285,1286],[751,298,755],[746,1684,754],[754,924,87],[722,1625,756],[87,839,153],[489,795,820],[758,808,1518],[839,840,153],[831,1111,959],[1111,749,959],[810,1253,1363],[1247,1394,713],[1388,1329,1201],[1242,120,761],[857,791,384],[758,1523,808],[296,764,1504],[70,1652,891],[207,233,1638],[1348,57,28],[858,420,332],[964,1379,1278],[420,1194,816],[784,1076,1186],[1076,21,1186],[1710,767,1],[849,822,778],[806,137,787],[786,790,744],[790,54,744],[771,63,407],[785,852,818],[774,1823,272],[895,151,516],[135,1022,809],[99,826,48],[48,826,755],[808,705,408],[833,441,716],[1733,743,32],[1385,836,852],[772,827,737],[1005,49,781],[793,1697,813],[1518,441,1537],[1139,1132,859],[782,801,770],[1510,1530,676],[770,814,835],[231,787,825],[207,722,756],[26,771,798],[782,863,865],[832,54,790],[865,842,507],[799,765,94],[1175,1261,1353],[800,408,805],[262,986,200],[792,800,814],[801,792,770],[704,1203,1148],[356,1514,822],[165,544,33],[561,776,113],[1043,738,775],[815,831,820],[773,792,801],[772,48,914],[772,737,803],[436,772,803],[808,817,705],[1624,822,1527],[588,1144,788],[799,762,604],[821,1520,1676],[854,803,666],[828,482,472],[445,74,463],[831,489,820],[828,836,482],[716,782,763],[334,815,766],[815,823,766],[334,766,765],[819,805,837],[1716,1521,1412],[1684,924,754],[800,805,819],[1709,829,554],[806,1349,137],[99,1013,747],[341,595,276],[817,810,818],[1176,1691,1685],[763,782,865],[830,846,1052],[865,1499,842],[982,846,1053],[847,832,790],[1178,875,158],[817,818,705],[1302,1392,45],[96,417,284],[223,614,517],[356,507,1514],[1166,848,1179],[1349,432,26],[717,92,276],[770,835,863],[522,509,1745],[847,841,832],[832,841,46],[829,739,554],[802,824,39],[397,1043,775],[1567,849,778],[1385,483,855],[1349,26,1346],[441,801,782],[402,401,293],[1043,667,738],[759,798,1007],[819,837,728],[728,837,828],[837,852,828],[1537,441,833],[148,1475,147],[805,705,837],[716,441,782],[483,1371,780],[814,819,844],[845,753,1336],[1661,719,4],[862,847,790],[737,827,666],[201,46,841],[810,785,818],[408,705,805],[1560,1536,849],[1585,853,1786],[7,1668,807],[7,807,8],[822,1514,1527],[800,819,814],[847,862,841],[991,857,760],[705,818,837],[808,408,773],[402,293,578],[791,858,332],[1480,1228,1240],[814,844,835],[785,1385,852],[1132,120,859],[1743,1726,684],[1704,783,1279],[1623,1694,1731],[959,489,831],[1518,808,773],[862,872,841],[441,773,801],[331,512,308],[380,217,216],[841,872,201],[818,852,837],[448,1480,1240],[856,1108,1195],[1527,1514,1526],[819,182,1232],[871,724,693],[852,836,828],[770,792,814],[803,737,666],[751,826,278],[1674,1727,1699],[849,356,822],[871,693,834],[507,842,1514],[1406,1097,869],[1328,1349,1346],[823,815,795],[744,751,278],[1110,856,1178],[520,717,316],[871,834,683],[884,876,724],[165,266,47],[716,763,507],[216,889,888],[853,1585,1570],[1536,716,356],[886,873,623],[782,770,863],[432,24,26],[683,882,871],[884,724,871],[114,876,884],[516,590,389],[11,1218,1628],[862,113,872],[886,623,629],[830,1052,1120],[762,153,604],[773,408,792],[763,865,507],[153,840,604],[882,884,871],[531,151,326],[886,890,873],[133,262,200],[819,1232,844],[621,636,122],[645,892,519],[1130,1076,784],[114,263,876],[1670,10,1663],[911,670,894],[452,885,872],[872,885,201],[887,882,683],[878,884,882],[590,878,882],[890,867,689],[897,629,621],[897,886,629],[819,728,182],[519,893,688],[894,670,526],[898,894,526],[1536,356,849],[810,1363,785],[878,114,884],[879,888,892],[892,889,893],[893,898,688],[895,683,843],[895,887,683],[889,620,267],[590,882,389],[418,465,84],[949,897,621],[897,890,886],[889,267,893],[898,267,896],[531,326,473],[189,651,878],[843,683,646],[897,867,890],[888,889,892],[893,267,898],[896,894,898],[473,895,843],[895,389,887],[974,706,669],[513,1115,521],[326,151,895],[809,791,857],[211,262,133],[920,923,947],[923,90,947],[90,25,947],[25,972,935],[64,431,899],[52,899,901],[903,905,59],[437,967,73],[839,1242,761],[904,975,44],[917,301,144],[915,670,911],[905,201,885],[1684,63,1685],[1033,1194,288],[950,913,755],[912,918,911],[950,914,913],[506,918,912],[922,919,915],[911,922,915],[1004,451,492],[1263,553,639],[922,911,918],[630,920,947],[916,506,926],[916,918,506],[521,1115,1098],[916,922,918],[919,418,915],[83,38,75],[24,1685,771],[110,1230,1213],[712,8,1837],[922,930,919],[919,430,418],[1395,1402,1187],[930,922,916],[594,623,69],[35,431,968],[35,968,969],[866,924,1684],[1625,1263,675],[631,630,52],[930,931,919],[430,709,418],[302,333,49],[1446,978,1138],[799,1007,798],[931,843,919],[947,25,64],[885,738,667],[1262,963,964],[899,970,901],[1401,946,938],[1117,933,1091],[1685,63,771],[905,948,201],[979,937,980],[951,953,950],[937,270,443],[1154,903,59],[1194,954,1067],[909,405,907],[850,1151,59],[1769,811,1432],[76,206,250],[938,946,966],[965,927,942],[938,966,957],[955,975,904],[927,965,934],[52,51,631],[59,905,667],[431,935,968],[786,289,561],[252,122,671],[481,494,107],[954,1817,1067],[795,25,90],[958,965,945],[795,972,25],[902,983,955],[972,489,944],[1256,29,424],[671,331,945],[946,958,963],[956,955,904],[902,955,956],[671,512,331],[945,331,961],[662,671,122],[671,662,512],[934,65,927],[630,947,52],[666,631,910],[850,59,667],[961,331,234],[1024,411,1042],[890,69,873],[252,671,945],[975,290,940],[283,186,196],[30,283,365],[950,755,298],[946,965,958],[985,290,975],[969,290,985],[405,851,206],[935,431,64],[941,1423,1420],[964,963,167],[942,252,945],[78,757,57],[49,1005,66],[937,979,270],[631,666,827],[980,937,443],[66,689,282],[421,902,956],[947,64,52],[35,979,899],[951,971,953],[762,87,153],[27,31,381],[924,839,87],[946,963,966],[331,308,340],[957,966,1262],[473,843,931],[953,971,920],[270,969,902],[935,962,968],[51,1005,781],[969,983,902],[437,73,940],[69,421,956],[761,249,840],[263,974,669],[962,944,967],[962,437,290],[985,975,955],[907,405,948],[720,957,1262],[25,935,64],[176,200,571],[108,945,50],[250,851,414],[200,986,571],[881,974,263],[827,772,953],[970,899,980],[29,159,27],[234,331,340],[948,405,206],[980,899,979],[986,984,571],[571,984,881],[990,706,974],[946,934,965],[970,980,66],[1113,1486,1554],[984,981,881],[881,987,974],[689,66,443],[1005,901,66],[983,985,955],[165,47,718],[987,990,974],[1370,986,262],[901,970,66],[51,901,1005],[981,987,881],[988,706,990],[942,945,965],[290,437,940],[64,899,52],[988,556,706],[941,934,946],[431,35,899],[996,989,984],[984,989,981],[981,989,987],[35,969,270],[1370,995,986],[986,995,984],[989,999,987],[987,992,990],[992,988,990],[962,967,437],[951,950,976],[979,35,270],[421,270,902],[998,995,1370],[987,999,992],[988,364,556],[969,985,983],[689,443,890],[995,1000,984],[219,958,108],[998,1000,995],[999,997,992],[914,953,772],[845,1336,745],[806,787,231],[1000,996,984],[989,996,999],[50,945,961],[443,421,69],[797,158,779],[1098,1463,434],[996,1009,999],[1001,988,992],[1001,364,988],[903,907,905],[26,759,973],[997,1001,992],[632,364,1001],[1346,26,973],[998,1008,1000],[1000,1009,996],[531,931,736],[252,949,621],[286,388,525],[1174,1008,998],[1009,1010,999],[999,1010,997],[1014,1001,997],[614,105,517],[958,945,108],[525,1004,242],[963,958,219],[233,426,304],[1000,1008,1009],[1010,1014,997],[1001,1006,632],[824,413,39],[642,636,622],[480,388,205],[28,757,797],[1014,1006,1001],[1006,410,632],[975,940,44],[1234,420,858],[54,832,46],[1009,1012,1010],[167,963,219],[41,481,107],[1017,1010,1012],[122,636,662],[939,525,388],[525,939,1004],[950,953,914],[829,1735,739],[1008,880,1015],[1008,1015,1009],[1263,639,675],[956,594,69],[795,90,1347],[1179,848,1013],[759,1007,973],[1009,1015,1012],[1012,1016,1017],[1017,1014,1010],[1019,1011,1006],[927,65,949],[649,316,595],[913,48,755],[976,950,298],[1003,1015,880],[1018,1006,1014],[1021,1018,1014],[444,692,1011],[451,1029,1063],[1185,851,1163],[29,27,381],[181,525,242],[1021,1014,1017],[1016,1021,1017],[1018,1019,1006],[1019,444,1011],[927,949,942],[451,393,492],[903,1154,907],[391,101,57],[94,765,58],[419,1016,1012],[949,252,942],[907,1020,909],[765,442,58],[94,406,908],[1007,94,908],[34,1012,1015],[34,419,1012],[419,1021,1016],[451,1057,393],[907,948,905],[1034,1073,1039],[1061,906,1619],[1068,960,1034],[471,1249,104],[112,1024,1042],[372,379,125],[341,543,165],[141,1094,170],[566,243,1061],[398,1034,1039],[325,317,1823],[1493,296,1724],[850,667,1043],[1054,297,1065],[1619,135,1074],[1061,243,906],[680,1024,821],[1103,96,1245],[1440,1123,1491],[1047,1025,1044],[672,454,1231],[1484,697,1530],[993,672,1231],[178,154,1088],[1044,1041,1066],[112,1062,1058],[1530,649,676],[178,1088,1040],[1046,328,954],[243,244,1022],[954,1194,1033],[1042,411,1032],[971,993,1056],[960,1093,1034],[1754,1338,232],[385,1064,412],[1057,1063,111],[748,1071,1447],[1530,697,695],[971,1056,1270],[977,1059,1211],[649,741,316],[1060,1452,1030],[353,354,1323],[695,768,649],[398,404,1034],[596,316,741],[1836,119,13],[1513,1115,1528],[883,1081,1652],[1039,1073,1048],[462,426,233],[31,1296,354],[1055,1047,1066],[1032,1054,1045],[1521,310,1224],[119,861,13],[1194,1234,288],[1109,1771,1070],[1166,1160,776],[1044,1035,1041],[1026,960,1064],[1050,1032,1045],[1049,1041,387],[115,1013,99],[1046,954,1033],[1321,920,971],[611,1058,345],[1048,1066,1049],[1023,1055,1073],[1029,451,1004],[118,1094,141],[1094,1080,170],[1042,1032,1050],[1026,1064,385],[15,16,1084],[1096,1079,61],[1075,1071,748],[325,1817,328],[909,1163,405],[1022,1234,809],[374,398,1051],[1082,72,81],[1023,1034,1093],[1817,1794,1067],[86,1445,1400],[1507,1535,1510],[1079,1096,1075],[568,1478,1104],[1070,178,1040],[1034,1023,1073],[776,1155,113],[1103,143,142],[1140,81,73],[1082,81,1140],[1060,1030,936],[1040,1086,1109],[370,1065,385],[61,72,1082],[1087,1096,1144],[1040,1088,1086],[1651,812,752],[1062,1050,1045],[187,154,178],[179,187,178],[1099,1344,1101],[1668,1058,807],[1073,1055,1048],[1099,1336,1344],[1283,943,1123],[1049,387,1051],[1024,680,449],[61,1082,1100],[967,749,1111],[1439,1037,88],[742,1505,142],[398,1039,1051],[1107,1336,1099],[1344,1542,1101],[142,1505,1103],[477,1093,447],[477,1023,1093],[471,142,1249],[1041,1035,394],[1328,568,1104],[61,1100,1096],[154,1092,1088],[112,1042,1050],[154,187,168],[435,235,45],[1075,1096,1087],[97,1075,748],[1049,1066,1041],[816,1067,1028],[846,982,1142],[1245,96,284],[1092,154,1080],[1057,451,1063],[387,377,1051],[1055,1025,1047],[1075,1087,1089],[1106,1108,856],[1068,1034,404],[1480,1545,868],[906,135,1619],[1074,991,1095],[570,566,1061],[1025,453,1044],[745,1336,1107],[1035,1057,416],[1092,1102,1129],[1074,135,991],[1105,745,1107],[447,1026,446],[394,387,1041],[73,81,940],[1118,1108,1106],[1210,1108,874],[243,1022,906],[412,1064,1068],[1280,611,603],[960,447,1093],[1051,1039,1049],[1040,1109,1070],[1471,1037,1439],[69,890,443],[1377,703,1374],[1092,1080,1102],[1096,1100,788],[1096,788,1144],[1114,967,1111],[446,1026,297],[70,1112,883],[453,393,1057],[1118,874,1108],[1054,370,1045],[1080,1094,1102],[1039,1048,1049],[428,753,845],[1047,1044,1066],[1044,453,1035],[1472,731,1512],[1126,1121,743],[743,1121,1110],[1032,297,1054],[1480,868,1216],[71,358,72],[1133,967,1114],[1105,1119,745],[1035,453,1057],[1026,447,960],[454,851,1190],[1030,1477,652],[589,816,1028],[1110,1121,1106],[1122,1118,1106],[1116,874,1118],[1048,1055,1066],[1194,1067,816],[744,278,747],[745,1120,845],[845,1052,428],[1105,1780,1119],[1065,297,385],[1098,1529,1463],[731,1060,936],[235,434,812],[1445,1525,1117],[1106,1121,1122],[1122,1127,1118],[1127,1116,1118],[1094,118,1732],[1119,1120,745],[1406,1124,1097],[435,117,235],[1462,1440,1037],[1126,1129,1121],[1088,1092,1129],[1133,73,967],[1120,1052,845],[812,434,752],[1441,1559,1200],[1131,588,413],[1054,1065,370],[235,1098,434],[1052,1142,428],[1737,428,1142],[1496,1446,1483],[1182,1083,1654],[1121,1129,1122],[1732,1116,1127],[768,457,649],[761,1114,249],[1064,960,1068],[1135,1481,1136],[1126,952,1129],[1087,588,1131],[1087,1144,588],[859,788,1139],[1140,1133,1132],[1133,1140,73],[1822,570,1061],[394,1035,416],[1055,1023,459],[80,264,485],[1119,1128,1120],[145,1658,567],[695,891,768],[1129,1102,1122],[1122,1102,1127],[1416,1077,1413],[297,1026,385],[1052,846,1142],[1445,1117,1400],[952,1086,1129],[1714,1089,1131],[1131,1089,1087],[1100,1139,788],[112,1050,1062],[1323,354,1296],[49,333,1141],[1142,982,1737],[79,1457,1091],[1088,1129,1086],[1102,1094,1127],[1127,1094,1732],[1100,1082,1139],[1082,1132,1139],[1082,1140,1132],[1150,1043,397],[60,1166,289],[1696,1146,1698],[1297,1202,1313],[409,1297,1313],[1234,1194,420],[1408,1391,1394],[424,1235,1243],[1203,309,1148],[485,477,447],[1152,1156,850],[1153,1149,1155],[1153,1157,1149],[1149,1152,1150],[1156,1154,1151],[776,1153,1155],[1157,1152,1149],[1217,1393,1208],[1156,1159,1154],[1153,1165,1157],[1165,1152,1157],[1159,1020,1154],[1161,1153,776],[1161,1165,1153],[1165,1158,1152],[1152,1158,1156],[1158,1159,1156],[1166,776,561],[1160,1161,776],[1161,1164,1165],[1161,1160,1164],[1158,1162,1159],[1159,1162,1020],[1270,1321,971],[1164,1170,1165],[1165,1162,1158],[1162,1163,1020],[588,788,925],[1166,1167,1160],[1165,1170,1162],[1160,1167,1164],[1162,1170,1163],[1179,1167,1166],[1167,1168,1164],[1164,1168,1170],[1168,1169,1170],[1234,1022,288],[802,39,866],[1179,1168,1167],[1169,1173,1170],[1170,1173,1163],[1173,1185,1163],[1360,1267,1364],[1169,1185,1173],[611,244,243],[900,1226,1376],[1260,1408,1350],[618,840,831],[1181,1183,1179],[1179,1184,1168],[1208,1274,1291],[1183,1184,1179],[1168,1184,1169],[1387,1395,1254],[1208,1204,1172],[1182,1197,1083],[1187,1083,1197],[1213,1183,1181],[1169,1207,1185],[135,857,991],[1013,1213,1181],[1189,1183,1213],[1183,1189,1184],[1169,1184,1207],[1207,1190,1185],[1180,1389,1288],[1191,1192,1640],[1640,1192,1090],[1090,1205,1654],[1654,1205,1182],[1188,1395,1187],[1126,743,1733],[788,859,925],[809,1234,1171],[1193,1197,1182],[1189,1199,1184],[1639,1191,1637],[1639,1212,1191],[1205,1193,1182],[1198,1187,1197],[1199,1207,1184],[332,1053,846],[1090,1192,1205],[117,1188,1187],[435,1188,117],[435,1206,1188],[1199,1189,1213],[420,816,1053],[1212,1215,1191],[117,1187,1198],[45,1206,435],[120,1132,1133],[874,1116,1210],[1191,1215,1192],[1193,1216,1197],[1216,1198,1197],[1199,1214,1207],[117,521,235],[1220,1311,1078],[1220,900,1311],[1653,1215,1212],[1192,1225,1205],[1205,1209,1193],[1209,1216,1193],[1389,1217,1172],[1207,1214,454],[171,557,1747],[1805,1078,1787],[1805,1219,1078],[1198,1216,868],[666,910,854],[1230,1231,1213],[1213,1231,1199],[1199,1231,1214],[1219,1220,1078],[1215,1221,1192],[1192,1221,1225],[1225,1228,1205],[1205,1228,1209],[1209,1228,1216],[1464,1325,1223],[1215,1227,1221],[1228,1480,1216],[1226,1653,1376],[1653,1249,1215],[1221,1240,1225],[1225,1240,1228],[839,761,840],[1238,1219,1805],[1238,1220,1219],[1232,1380,1375],[1226,1249,1653],[1221,1227,1240],[233,207,532],[110,1236,1230],[1248,1231,1230],[1231,454,1214],[1249,1227,1215],[1248,1056,1231],[489,959,944],[448,1240,284],[925,859,1242],[1805,1244,1238],[1252,1220,1238],[1252,921,1220],[1236,1251,1230],[1230,1251,1248],[1056,993,1231],[1031,1264,1263],[68,1186,157],[1227,1245,1240],[1103,1245,143],[1243,1235,612],[1252,95,921],[1249,1226,1237],[1390,1387,1254],[1120,384,830],[830,332,846],[1227,143,1245],[1315,1369,1358],[1356,1269,1386],[972,795,489],[1831,1224,310],[1250,1255,1251],[1251,1056,1248],[1256,1243,103],[658,358,175],[1620,1238,1244],[1620,1252,1238],[1506,95,1252],[104,1249,1237],[1249,143,1227],[1268,1419,1329],[634,806,231],[618,831,815],[924,1242,839],[1255,1270,1251],[1251,1270,1056],[866,925,1242],[103,29,1256],[424,1243,1256],[134,1651,752],[1250,917,1255],[1172,1204,1260],[1352,1036,1276],[1265,1201,1329],[804,1282,1259],[1259,1294,723],[335,1330,1305],[407,762,799],[875,856,1195],[32,158,344],[967,944,749],[372,125,42],[1175,1354,1261],[553,612,1235],[1259,1273,1294],[1294,1283,723],[757,78,158],[407,799,798],[901,51,52],[139,1386,1389],[1386,1269,1389],[1389,1269,1217],[1148,1590,1268],[1428,1449,1450],[804,1281,1282],[1273,1259,1282],[158,399,779],[771,407,798],[521,1098,235],[917,1312,1255],[1312,1270,1255],[1217,1269,1393],[1195,1108,634],[1110,1106,856],[1210,1691,1176],[27,1112,1145],[1296,27,1145],[1171,858,791],[704,1148,1290],[1430,1436,1437],[1282,1308,1273],[1300,943,1283],[1393,1355,1274],[720,1278,769],[1287,1059,1399],[1310,1388,1272],[1312,1321,1270],[851,1185,1190],[1296,1145,1304],[26,24,771],[51,910,631],[1329,1290,1268],[1290,1148,1268],[1298,1293,733],[1281,1293,1282],[1282,1293,1308],[1308,1299,1273],[1300,1283,1294],[1340,943,1300],[1340,1301,943],[407,754,762],[1287,1399,1295],[34,139,128],[1288,1172,1260],[120,1133,1114],[1306,1113,1511],[1464,1223,1292],[1299,1294,1273],[1299,1300,1294],[1286,1295,838],[1285,1247,1286],[1247,713,1286],[1201,1265,1390],[1378,1368,1357],[1482,1320,917],[917,1320,1312],[850,1156,1151],[588,39,413],[1324,1306,686],[789,1365,928],[1223,1326,1292],[1292,1326,1298],[869,1097,1311],[790,786,561],[1323,1304,932],[1323,1296,1304],[1317,1324,686],[1306,368,1113],[1325,1342,1223],[1326,1348,1298],[1293,1327,1308],[1308,1318,1299],[704,1290,1258],[1320,1321,1312],[761,120,1114],[1684,802,866],[1674,6,1727],[1316,1323,932],[1335,1337,1305],[1348,1327,1293],[1298,1348,1293],[1333,1300,1299],[1333,1343,1300],[1328,1301,1340],[1328,1314,1301],[838,1399,1319],[921,1237,900],[409,1391,1408],[1376,1653,677],[1281,804,1458],[1331,1324,1317],[1324,368,1306],[368,1338,1307],[1327,797,1308],[797,1345,1308],[1308,1345,1318],[1318,1333,1299],[1341,1147,1572],[923,1321,1320],[923,920,1321],[39,588,866],[1141,1323,1316],[1330,1335,1305],[1337,1335,1336],[1339,1332,1325],[1223,1342,1326],[1342,1348,1326],[1348,797,1327],[1345,1333,1318],[1343,1340,1300],[1419,1265,1329],[1347,1320,1584],[1535,1141,1316],[1078,1311,582],[1344,1335,1330],[753,1331,1337],[368,1324,1331],[753,368,1331],[1332,1485,1325],[1325,1485,1342],[787,1343,1333],[137,1328,1340],[973,1341,1479],[406,1147,1341],[1171,1234,858],[1141,1535,1322],[49,1141,1322],[1344,1336,1335],[973,908,1341],[766,1347,1584],[1347,923,1320],[781,49,1322],[368,232,1338],[787,1340,1343],[787,137,1340],[568,1346,973],[58,1147,406],[442,1334,1147],[58,442,1147],[442,766,1334],[90,923,1347],[428,368,753],[779,1333,1345],[825,787,1333],[137,1349,1328],[1328,1346,568],[908,406,1341],[924,866,1242],[1336,753,1337],[428,232,368],[1115,777,1098],[1348,28,797],[797,779,1345],[779,825,1333],[1007,908,973],[583,1351,880],[1365,1246,977],[1658,145,1710],[1310,796,1388],[718,245,165],[1302,1272,1254],[1174,1351,583],[1174,715,1351],[1358,1260,1204],[1374,1373,1276],[1377,1374,1276],[678,1362,1382],[1377,1276,254],[139,34,40],[1008,1174,583],[1396,1286,1319],[768,891,457],[1316,932,1535],[1289,1371,1360],[182,736,864],[1355,1364,1274],[860,1367,1354],[1362,1222,1382],[1376,869,1311],[1590,1411,198],[1232,1375,877],[1394,1295,1286],[880,1356,1386],[880,1351,1356],[1211,1059,1287],[197,678,1405],[880,1386,1003],[1368,1253,1357],[1357,1253,1036],[715,1289,1364],[1354,1367,703],[1383,877,1375],[1266,1288,1260],[1373,1374,703],[1372,1289,1174],[1303,1366,1378],[1351,715,1355],[1665,1666,624],[1309,1357,1036],[900,1237,1226],[1174,1289,715],[1337,1331,1317],[1360,1303,1359],[1267,1354,1175],[1241,1284,1414],[1377,254,929],[1385,855,836],[1396,1319,1436],[1361,1366,1303],[1381,1368,1378],[1313,1211,1391],[1368,1385,1363],[813,82,861],[1058,1280,807],[893,519,892],[1359,1303,860],[1382,1350,1247],[1371,1303,1360],[1267,1175,1271],[769,1286,1396],[712,1837,82],[1366,1385,1381],[1365,796,1310],[1003,1386,40],[780,1371,1370],[561,862,790],[1284,1380,864],[1449,1428,177],[611,1280,1058],[1284,1375,1380],[926,506,1241],[1305,1337,1317],[309,1203,208],[1388,1201,1390],[1309,1036,1352],[1377,929,1411],[1399,1059,1257],[1112,70,1145],[289,1166,561],[1288,1389,1172],[1362,37,1180],[713,1394,1286],[1355,1393,1269],[1401,1423,941],[1274,1271,1384],[860,1378,1367],[715,1364,1355],[677,1406,869],[1297,1358,1202],[1388,1258,1329],[1180,1288,1266],[1008,583,880],[1524,1425,1463],[1390,1403,1387],[1278,1379,1247],[1278,1247,1285],[964,1278,1262],[1358,1369,1202],[1715,1699,1726],[926,1241,1414],[1341,1572,1479],[926,930,916],[1397,51,781],[409,1358,1297],[1236,436,301],[1376,677,869],[1351,1355,1356],[758,1534,1523],[1378,1357,1367],[977,1211,1365],[1135,1136,854],[1394,1391,1295],[1266,1260,1222],[1365,1302,1246],[1232,877,844],[736,930,864],[1408,1358,409],[1508,817,1523],[1381,1385,1368],[718,854,910],[854,718,1135],[1382,1222,1350],[1391,1211,1287],[1391,1287,1295],[1257,1651,134],[1414,1284,864],[1291,1369,1315],[1202,928,1313],[86,1400,1413],[1413,1200,86],[1263,1625,1031],[1413,1400,1404],[1002,1664,1834],[930,926,1414],[1399,1257,134],[520,316,596],[1393,1274,1208],[1657,1655,1712],[1407,1404,1400],[1404,1410,1413],[1649,1229,1406],[1362,1266,1222],[1384,1271,1175],[900,1376,1311],[1274,1384,1291],[1291,1384,1431],[1433,1396,1436],[1267,1359,1354],[309,1353,703],[838,1319,1286],[1407,1410,1404],[441,1518,773],[1241,123,1428],[1622,1521,1224],[1217,1208,1172],[1130,793,1076],[425,1409,1481],[1481,1409,1533],[1303,1378,860],[1350,1408,1394],[1246,1651,977],[1289,1360,1364],[1727,1694,1623],[1417,1407,1533],[1417,1410,1407],[1406,1650,1649],[1319,134,1437],[1414,864,930],[1406,1229,1124],[1354,1359,860],[1433,769,1396],[1417,1533,1409],[1416,1413,1410],[1415,1416,1410],[95,1237,921],[1392,1254,1395],[1360,1359,1267],[1258,1290,1329],[1180,128,1389],[1420,1409,425],[1417,1418,1410],[1418,1415,1410],[1422,1077,1416],[1247,1350,1394],[37,43,1180],[1204,1315,1358],[1428,1383,1375],[1356,1355,1269],[1409,1418,1417],[1302,45,1246],[1421,1416,1415],[1421,1422,1416],[1422,1494,1077],[957,720,938],[1423,1409,1420],[1423,1418,1409],[752,434,1438],[1260,1358,1408],[1363,1385,785],[1423,1426,1418],[1426,1424,1418],[1229,1649,1124],[1222,1260,1350],[1508,1523,1137],[1278,1285,769],[1482,917,144],[1418,1424,1415],[1425,1422,1421],[1425,1524,1422],[1272,1388,1390],[1391,409,1313],[1378,1366,1381],[1371,483,1361],[720,1262,1278],[29,103,159],[1271,1364,1267],[1424,1427,1415],[1537,1522,1518],[134,752,1438],[1420,934,941],[1428,1375,1284],[1277,1224,1831],[1362,1180,1266],[1401,1426,1423],[1577,1369,1291],[268,483,262],[1383,1450,1456],[1384,1175,1431],[1430,1415,1427],[1430,1421,1415],[1430,1425,1421],[1379,1382,1247],[1252,1553,1429],[1206,1392,1395],[1433,1430,1427],[309,208,1353],[1272,1390,1254],[1361,483,1366],[1523,817,808],[1302,1254,1392],[1371,1361,1303],[1426,1435,1424],[1435,1433,1424],[1433,1427,1424],[720,769,1433],[796,1258,1388],[1590,1419,1268],[1289,1372,1371],[1305,1317,1509],[998,1372,1174],[40,1386,139],[1261,1354,703],[1364,1271,1274],[134,1438,1437],[1436,1319,1437],[1317,686,1509],[1484,932,1304],[1434,1432,1509],[1420,65,934],[931,930,736],[1367,1357,1309],[1372,1370,1371],[1204,1208,1315],[1426,938,1435],[1368,1363,1253],[1207,454,1190],[1302,1310,1272],[309,1377,390],[390,1377,1411],[1370,1372,998],[1411,1590,1148],[720,1433,1435],[1450,1383,1428],[1379,678,1382],[1405,678,1379],[1208,1291,1315],[1399,134,1319],[1367,1309,1373],[1373,1352,1276],[596,741,593],[553,1264,612],[1433,1436,1430],[1437,1438,1430],[964,1405,1379],[1373,1309,1352],[1265,1403,1390],[1233,1618,1434],[1365,1310,1302],[789,796,1365],[720,1435,938],[128,139,1389],[1466,933,1525],[1191,1640,1637],[1314,1442,943],[1141,353,1323],[1489,1138,1474],[1462,1477,1440],[1474,1138,1488],[1442,1314,1443],[1446,1030,1546],[1484,1145,697],[1549,1443,1445],[1470,1572,1468],[1397,1239,1507],[1649,1825,1824],[1259,1440,1477],[1451,1450,1449],[978,1446,652],[1454,1456,1451],[1451,1456,1450],[341,1507,595],[933,1547,79],[804,1452,1060],[1454,1455,1456],[1398,1460,1454],[1455,877,1456],[1277,1831,1825],[804,1060,1458],[1339,1459,1595],[1314,1104,1443],[933,1448,1547],[147,1460,1398],[1460,1461,1454],[1454,1461,1455],[1292,1125,1464],[417,1531,1480],[1459,1339,1325],[811,1756,335],[1512,936,1490],[777,1529,1098],[147,1475,1460],[1464,253,1459],[836,855,482],[1487,1486,1307],[1104,1501,1443],[1439,1200,1532],[1475,1469,1460],[1460,1469,1461],[1325,1464,1459],[1277,1825,1649],[1532,1200,1077],[844,877,1455],[1572,933,1466],[1479,568,973],[1509,335,1305],[1339,1595,1759],[1469,1476,1461],[1461,1476,1455],[1104,1470,1468],[1464,1472,253],[1117,1091,1407],[1756,1542,335],[1206,1395,1188],[335,1542,1330],[835,844,1455],[1471,1598,1462],[1491,1442,1441],[835,1455,1476],[1441,1442,1443],[1489,1474,1473],[1251,1236,1250],[1030,1452,1477],[1598,1439,1532],[978,1598,1492],[1426,1401,938],[1448,1584,1482],[1724,1497,1475],[1475,1497,1469],[1484,1535,932],[1307,1486,1113],[1487,696,1495],[1037,1491,1441],[1030,1446,936],[1453,1487,1495],[696,1467,1495],[1138,1489,1483],[1497,1143,1469],[1469,1143,1476],[652,1598,978],[850,1043,1150],[1482,1584,1320],[1731,98,1697],[1113,1554,1573],[1524,1532,1494],[1496,1467,696],[1452,1259,1477],[296,1504,1497],[1504,1143,1497],[1143,1499,1476],[718,910,1498],[868,1540,1528],[817,1253,810],[1490,696,1487],[1440,1491,1037],[1510,676,595],[1488,1492,1517],[781,1239,1397],[1467,1519,1503],[1500,1307,1759],[1149,397,452],[1504,1514,1143],[1514,842,1143],[1125,733,1458],[1503,1531,1555],[1276,1036,1137],[1440,723,1123],[1036,1508,1137],[817,1508,1253],[103,883,1112],[1458,731,1472],[1512,1490,1487],[1487,1453,1486],[1138,978,1488],[1036,1253,1508],[1398,149,147],[1474,1517,1513],[1125,1458,1472],[1486,1453,1554],[1518,1534,758],[345,1058,1062],[928,1202,1369],[1554,1541,1505],[1464,1125,1472],[1504,764,1514],[304,426,573],[1505,742,1506],[1479,1572,1478],[1519,1483,1489],[833,716,1069],[1522,1534,1518],[1115,1513,777],[811,335,1432],[1591,1533,1407],[777,1517,1529],[1513,1517,777],[1498,910,1397],[1069,1539,833],[833,1539,1537],[1522,1551,1534],[1534,1551,1523],[1538,1137,1523],[910,51,1397],[1367,1373,703],[1466,1525,1468],[157,1186,1832],[1429,1511,1506],[1573,1505,1506],[1259,1452,804],[1503,1495,1467],[262,483,780],[1572,1466,1468],[1536,1556,716],[716,1556,1069],[1544,1523,1551],[1544,1538,1523],[1511,1573,1506],[933,1572,1448],[1543,1537,1539],[1537,1543,1522],[1091,933,79],[1519,1540,1545],[1549,1445,86],[1069,1548,1539],[1548,1543,1539],[1543,1551,1522],[1500,1487,1307],[68,784,1186],[1552,1544,1551],[1550,1538,1544],[1538,1550,1137],[1519,1473,1540],[1547,1448,1482],[1560,1563,1536],[1536,1563,1556],[1556,1548,1069],[1543,1558,1551],[1137,1550,1276],[1453,1495,1555],[1561,1543,1548],[1543,1561,1558],[1558,1566,1551],[1552,1550,1544],[1569,1557,1550],[1557,1276,1550],[1276,1557,254],[1531,1503,1480],[1535,1530,1510],[1545,1503,1519],[1547,1482,79],[1566,1552,1551],[1552,1569,1550],[1503,1545,1480],[703,1377,309],[1625,675,756],[1037,1441,88],[929,254,1557],[849,1567,1560],[1556,1564,1548],[1492,1529,1517],[1252,1429,1506],[1553,1027,1429],[1453,1555,1541],[1554,1453,1541],[1233,686,1553],[1328,1104,1314],[1564,1576,1548],[1548,1576,1561],[1557,1562,929],[1520,112,1668],[1483,1446,1138],[778,1570,1567],[1563,1564,1556],[1561,1565,1558],[1565,1566,1558],[1569,1552,1566],[1562,1557,1569],[1530,1535,1484],[1387,1402,1395],[1621,1634,1387],[1567,1568,1560],[1560,1568,1563],[1571,1569,1566],[1344,1330,1542],[1577,1431,1353],[1638,233,304],[1524,1463,1529],[1353,1431,1175],[1077,1200,1413],[1478,1470,1104],[1568,1575,1563],[1563,1575,1564],[1575,1576,1564],[1561,1576,1565],[1565,1574,1566],[1562,1515,929],[1555,96,1541],[1531,417,96],[1555,1531,96],[1246,45,1651],[208,1577,1353],[1586,1568,1567],[1574,1571,1566],[1571,1583,1569],[1474,1513,1528],[1239,1322,1535],[1478,1572,1470],[1570,1586,1567],[1488,1517,1474],[8,1833,1837],[1123,1442,1491],[1589,1568,1586],[1576,1594,1565],[1565,1594,1574],[1562,198,1515],[1559,1441,1549],[1441,1443,1549],[1135,425,1481],[1239,1535,1507],[1595,1487,1500],[1570,1585,1586],[1589,1578,1568],[1568,1578,1575],[1579,1569,1583],[1177,1577,208],[115,1236,110],[1578,1593,1575],[1587,1576,1575],[1576,1581,1594],[1571,1582,1583],[1588,1579,1583],[1579,1580,1562],[1569,1579,1562],[1562,1580,198],[1027,1511,1429],[1589,1593,1578],[1587,1581,1576],[1582,1574,1594],[1574,1582,1571],[1575,1593,1587],[1583,1582,1588],[1580,1590,198],[1587,1593,1581],[1505,1541,96],[1369,1577,1177],[1573,1554,1505],[1479,1478,568],[1585,1589,1586],[1369,1177,704],[766,1584,1334],[977,1257,1059],[1091,1591,1407],[1591,1091,1457],[1585,1604,1589],[1581,1592,1594],[1602,1582,1594],[1582,1608,1588],[1608,1579,1588],[1579,1597,1580],[1419,1590,1580],[1597,1419,1580],[1431,1577,1291],[1589,1604,1593],[1601,1596,1593],[1593,1596,1581],[1306,1511,1027],[1511,1113,1573],[1786,1412,1585],[1412,1604,1585],[1581,1596,1592],[1592,1602,1594],[1608,1599,1579],[1599,1611,1579],[1579,1611,1597],[1512,1487,253],[1519,1489,1473],[1545,1540,868],[1083,1187,1402],[1117,1407,1400],[1292,733,1125],[284,1240,1245],[1604,1600,1593],[1600,1601,1593],[1582,1607,1608],[789,1369,704],[1467,1483,1519],[1601,1613,1596],[1596,1613,1592],[1602,1607,1582],[1620,1553,1252],[1601,1605,1613],[1592,1613,1602],[1602,1606,1607],[1608,1609,1599],[1599,1609,1611],[1603,1597,1611],[1265,1419,1597],[1603,1265,1597],[1392,1206,45],[928,1369,789],[1474,1528,1473],[1104,1468,1501],[1412,1521,1604],[1613,1631,1602],[1607,1610,1608],[1608,1610,1609],[1476,863,835],[1495,1503,1555],[1498,1397,718],[1520,1668,7],[1604,1615,1600],[1605,1601,1600],[1602,1631,1606],[1606,1610,1607],[1759,1595,1500],[1292,1298,733],[1615,1604,1521],[1609,1603,1611],[652,1462,1598],[1468,1525,1445],[1443,1501,1445],[1134,1723,150],[1521,1622,1615],[1615,1616,1600],[1616,1605,1600],[1605,1616,1612],[1605,1612,1613],[1612,1617,1613],[1613,1617,1631],[1606,1614,1610],[1265,1603,1403],[448,417,1480],[1595,253,1487],[1501,1468,1445],[1383,1456,877],[1490,1496,696],[1610,1627,1609],[1627,1621,1609],[1591,1481,1533],[1598,1471,1439],[1353,1261,703],[1606,1631,1614],[1609,1621,1403],[1532,1077,1494],[1528,1115,513],[1546,652,1446],[1211,928,1365],[1540,1473,1528],[1078,1502,1787],[1425,1430,1438],[1617,1630,1631],[959,749,944],[566,570,603],[1716,310,1521],[775,452,397],[1615,1636,1616],[1616,1636,1612],[1610,1632,1627],[789,704,1258],[1457,1481,1591],[1769,1756,811],[207,1629,722],[1629,1625,722],[1224,1277,1622],[1622,1636,1615],[1636,1646,1612],[1612,1630,1617],[1631,1626,1614],[1614,1632,1610],[1506,104,95],[1481,1457,1136],[1123,943,1442],[936,1446,1496],[1499,863,1476],[1629,1031,1625],[1233,1509,686],[1633,1634,1621],[1621,1387,1403],[1472,1512,253],[1177,208,704],[1277,1636,1622],[1626,1632,1614],[1627,1633,1621],[936,1496,1490],[185,1454,1451],[731,936,1512],[1638,1635,207],[553,1263,1264],[1653,1212,1639],[1633,1627,1632],[1633,1387,1634],[1458,1060,731],[368,1307,1113],[1264,1031,1629],[1152,850,1150],[1277,1644,1636],[1646,1637,1612],[1637,1630,1612],[1647,1631,1630],[1647,1626,1631],[1422,1524,1494],[1030,652,1546],[1635,1629,207],[1635,1264,1629],[1639,1646,1636],[1637,1640,1630],[1641,1632,1626],[1632,1642,1633],[1633,1643,1387],[842,1499,1143],[865,863,1499],[1516,978,1492],[67,1130,784],[1103,1505,96],[88,1441,1200],[1644,1639,1636],[1640,1647,1630],[1647,1641,1626],[1633,1648,1643],[1492,1532,1524],[1488,1516,1492],[1037,1471,1462],[612,1264,1635],[1502,1078,1124],[1641,1642,1632],[1648,1633,1642],[1528,513,868],[1492,1598,1532],[1095,991,760],[679,157,1664],[760,1128,1785],[1277,1650,1644],[320,1022,244],[1559,1549,86],[1676,1520,7],[1488,978,1516],[1095,760,1785],[1128,384,1120],[304,312,1638],[1081,1638,312],[1081,1635,1638],[103,612,1635],[652,1477,1462],[1650,1645,1644],[1645,1639,1644],[1639,1637,1646],[1640,1090,1647],[1654,1641,1647],[1654,1642,1641],[1654,1648,1642],[1643,1402,1387],[1432,335,1509],[384,1128,760],[1652,312,304],[103,1243,612],[1277,1649,1650],[1090,1654,1647],[1643,1648,1402],[1134,324,1675],[679,68,157],[1652,1081,312],[1136,301,803],[1653,1639,1645],[723,1440,1259],[803,854,1136],[104,1506,742],[1112,159,103],[1654,1083,1648],[977,1651,1257],[1397,1507,718],[1081,103,1635],[1650,677,1645],[1083,1402,1648],[1706,1655,1671],[1624,1704,1711],[767,2,1],[608,794,294],[1678,1683,1686],[767,1682,2],[1669,1692,1675],[296,1681,764],[1671,1656,1672],[17,1673,1679],[1706,1671,1673],[1662,1674,1699],[1655,1657,1656],[418,84,915],[1526,1514,764],[1658,1657,567],[870,1695,764],[813,1697,98],[1659,821,5],[60,1013,848],[1013,110,1213],[661,1038,1692],[1660,1703,17],[1693,1673,17],[1663,1715,1743],[1013,115,110],[344,1733,32],[1670,1663,1743],[1670,1743,1738],[1677,1670,1738],[1661,4,3],[1084,1683,1678],[1728,793,1130],[1683,1767,1196],[1677,1738,1196],[1279,1786,853],[294,1038,608],[1279,1689,1786],[870,18,1708],[870,1680,1695],[1705,10,1670],[1084,1767,1683],[1196,1738,1686],[1750,870,1681],[1750,18,870],[1773,1703,1660],[1135,47,425],[150,323,1134],[1707,1655,1706],[1741,344,1687],[1685,1691,1684],[1684,1691,802],[1672,1656,0],[1038,124,608],[1671,1672,1690],[1628,1218,1767],[1686,1275,1667],[1493,1750,1681],[1773,18,1750],[1773,1660,18],[1679,1671,16],[1735,1706,1673],[1667,1678,1686],[1688,1658,1],[1656,1688,0],[1293,1281,1458],[1698,1678,1667],[1696,1130,1722],[1698,1667,1696],[1715,1662,1699],[1692,1038,294],[1682,767,357],[1669,661,1692],[802,1702,824],[1028,1067,1784],[822,1624,778],[119,813,861],[1218,1670,1677],[1703,1693,17],[1658,1710,1],[750,1730,1729],[1701,750,1729],[1693,1735,1673],[1731,1694,98],[1691,1702,802],[783,1729,1719],[1680,870,1708],[1707,1709,1655],[533,756,675],[1691,1210,1702],[11,1705,1670],[1767,1218,1196],[1218,1677,1196],[1664,1716,1721],[1729,1725,1719],[1729,1072,1725],[1210,1116,1702],[1702,1720,824],[1682,1661,2],[1713,1719,1721],[1716,1786,1713],[1730,1722,1072],[294,1717,1811],[1692,294,1666],[1659,680,821],[824,1720,1714],[1726,1731,1718],[345,1062,1045],[1738,1743,1275],[1075,1089,1071],[783,1719,1689],[1275,684,1728],[1692,1666,1665],[1675,1692,1665],[294,1811,1666],[1716,1664,310],[1678,1698,1700],[6,9,1727],[676,649,595],[381,31,361],[1723,1804,1772],[1727,9,1694],[1720,1089,1714],[1786,1716,1412],[1683,1196,1686],[1718,1697,1085],[1116,1739,1702],[1739,1734,1720],[1702,1739,1720],[1089,1720,1734],[509,748,1745],[1743,1715,1726],[1717,294,794],[1116,1732,1739],[1718,1731,1697],[1696,1667,1130],[1134,1665,1723],[1694,712,98],[101,1687,102],[391,1736,101],[662,636,642],[1734,1447,1089],[1089,1447,1071],[436,99,493],[1689,1279,783],[1485,1465,1342],[1736,1687,101],[344,1741,1733],[1741,1742,1733],[1735,829,1706],[829,1707,1706],[1485,1332,1465],[952,1126,1742],[1747,1447,1734],[879,892,645],[1730,1146,1696],[829,1709,1707],[1709,1712,1655],[118,1739,1732],[1332,1744,1465],[1687,1749,1741],[1741,1758,1742],[679,1072,68],[1072,1722,68],[118,1747,1739],[1747,1734,1739],[1465,1744,1736],[1736,1740,1687],[1704,1701,783],[1665,624,1723],[1722,1130,67],[1025,1055,467],[1444,14,1701],[558,522,530],[1657,1658,1688],[1339,1746,1332],[1332,1748,1744],[1687,1740,1749],[1741,1749,1758],[1109,952,1742],[1747,118,141],[1671,1690,1628],[1671,1628,16],[1657,1688,1656],[1745,748,1447],[357,767,1710],[1746,1748,1332],[1146,1700,1698],[1759,1307,1338],[1239,781,1322],[1745,1447,1747],[522,1745,1747],[316,717,595],[148,1493,1724],[1758,1109,1742],[1725,1072,679],[726,719,1661],[1695,1680,1526],[1772,1750,1493],[148,1772,1493],[1542,1751,1101],[952,1109,1086],[1744,1752,1736],[1736,1752,1740],[1753,1755,1740],[391,1342,1736],[821,112,1520],[557,530,1747],[530,522,1747],[994,879,645],[1542,1756,1751],[1813,1693,1703],[1746,1754,1748],[1748,1764,1744],[1752,1757,1740],[1740,1757,1753],[1749,1740,1755],[1755,1763,1749],[1763,1758,1749],[1275,1743,684],[1813,1735,1693],[1107,1099,1101],[1723,624,1804],[1403,1603,1609],[1748,1754,1764],[1744,1757,1752],[1760,1109,1758],[1465,1736,1342],[436,115,99],[1686,1738,1275],[1751,1766,1101],[1759,1754,1746],[1755,1753,1763],[1570,1279,853],[1701,1146,750],[1655,1656,1671],[11,1670,1218],[1761,1751,1756],[1766,1107,1101],[1726,1623,1731],[1711,1704,1279],[67,784,68],[558,530,545],[1620,1618,1233],[1769,1761,1756],[102,1687,344],[1338,1754,1759],[1754,232,1764],[1744,1765,1757],[1757,1763,1753],[1762,1760,1758],[1760,1771,1109],[1339,1759,1746],[1675,1665,1134],[1730,1696,1722],[1774,1751,1761],[1766,1780,1107],[1780,1105,1107],[1764,1765,1744],[1763,1762,1758],[1772,1773,1750],[1811,1813,1703],[1434,1769,1432],[1780,1766,1751],[232,1781,1764],[1711,1279,1570],[1688,1,0],[1774,1780,1751],[1764,1781,1765],[1765,1768,1757],[1757,1768,1763],[1777,1782,1760],[1762,1777,1760],[1769,1774,1761],[1763,1777,1762],[1760,1782,1771],[232,1737,1781],[1768,1776,1763],[272,255,774],[1669,994,661],[1618,1769,1434],[1765,589,1768],[1770,1777,1763],[1701,1729,783],[1783,1774,1769],[1789,1780,1774],[589,1775,1768],[1776,1770,1763],[1782,1778,1771],[1771,1778,1070],[624,1703,1773],[624,1811,1703],[1620,1244,1618],[1779,1769,1618],[1779,1783,1769],[739,1735,1813],[1775,1776,1768],[1790,1777,1770],[1777,1778,1782],[1725,679,1721],[733,1293,1458],[1802,1618,1244],[1802,1779,1618],[1788,1783,1779],[1789,1774,1783],[1796,1780,1789],[1796,1119,1780],[1823,1817,325],[1699,1727,1623],[750,1146,1730],[1497,1724,296],[1128,1119,1796],[61,62,71],[1131,413,824],[1114,1111,249],[1784,1776,1775],[1123,723,1283],[1791,1788,1779],[1788,1789,1783],[1095,1797,1074],[1028,1784,1775],[1784,1770,1776],[1777,1790,1778],[1793,1797,1095],[1797,1800,1074],[1798,1790,1770],[1805,1802,1244],[1802,1791,1779],[1792,1789,1788],[1793,1785,1128],[1793,1095,1785],[1074,1800,1619],[741,457,593],[1798,1770,1784],[1798,1794,1790],[1786,1689,1713],[684,1726,1718],[1728,1085,793],[1795,1787,1502],[1806,1802,1805],[1819,1788,1791],[1067,1798,1784],[1790,1794,1778],[1795,1502,1124],[1801,1805,1787],[1807,1791,1802],[1807,1819,1791],[1819,1792,1788],[1799,1128,1796],[994,645,661],[684,1085,1728],[684,1718,1085],[1699,1623,1726],[1801,1787,1795],[1808,1789,1792],[1808,1796,1789],[1799,1793,1128],[1809,1797,1793],[1809,1803,1797],[1803,1800,1797],[1067,1794,1798],[774,255,1778],[1673,1671,1679],[879,1669,888],[19,1807,1802],[1810,1619,1800],[879,994,1669],[1794,774,1778],[1723,1772,148],[1804,1773,1772],[1814,1795,1124],[1649,1814,1124],[1814,1801,1795],[1812,1806,1805],[19,1802,1806],[19,1819,1807],[1810,1800,1803],[1804,624,1773],[1714,1131,824],[1801,1812,1805],[1812,19,1806],[1808,1792,1819],[1799,1809,1793],[1821,1810,1803],[1717,739,1813],[1061,1619,1822],[1794,1817,774],[79,1482,144],[1815,1801,1814],[23,1819,19],[589,1028,1775],[1817,1823,774],[1689,1719,1713],[1824,1814,1649],[1827,1818,1801],[1818,1812,1801],[1818,19,1812],[1818,20,19],[1816,1809,1799],[1821,1803,1809],[1822,1619,1810],[124,708,608],[1663,10,1715],[1815,1827,1801],[1820,1808,1819],[23,1820,1819],[603,1810,1821],[603,1822,1810],[1085,1697,793],[1628,1690,11],[1527,1704,1624],[1730,1072,1729],[1526,1444,1704],[1526,1680,1444],[1704,1444,1701],[1816,1821,1809],[1722,67,68],[317,272,1823],[1716,1713,1721],[16,1628,1767],[1527,1526,1704],[1824,1826,1814],[1814,1826,1815],[1818,21,20],[1835,1808,1820],[603,570,1822],[226,1070,1778],[1013,1181,1179],[1721,679,1664],[1717,1813,1811],[1828,1827,1815],[22,1820,23],[22,1835,1820],[1830,603,1821],[719,1659,5],[643,567,1657],[1717,794,739],[1825,1826,1824],[1828,1815,1826],[1829,21,1818],[1808,1835,13],[4,719,5],[10,1662,1715],[1828,1832,1827],[1832,1818,1827],[12,1833,1816],[1833,1821,1816],[1833,1830,1821],[14,1146,1701],[1186,1829,1818],[1280,603,1830],[14,1700,1146],[1667,1728,1130],[1825,1834,1826],[1834,1828,1826],[1832,1186,1818],[1836,13,1835],[1624,1711,1570],[778,1624,1570],[1719,1725,1721],[1002,1825,1831],[1002,1834,1825],[1834,1832,1828],[1186,21,1829],[1836,1835,22],[1837,1833,12],[1280,1830,1833],[1667,1275,1728],[16,1767,1084],[589,1765,1838],[1765,1781,1838],[1781,1737,1838],[1737,982,1838],[982,1053,1838],[1053,816,1838],[816,589,1838]]

},{}],36:[function(require,module,exports){
module.exports = adjoint;

/**
 * Calculates the adjugate of a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
function adjoint(out, a) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    out[0]  =  (a11 * (a22 * a33 - a23 * a32) - a21 * (a12 * a33 - a13 * a32) + a31 * (a12 * a23 - a13 * a22));
    out[1]  = -(a01 * (a22 * a33 - a23 * a32) - a21 * (a02 * a33 - a03 * a32) + a31 * (a02 * a23 - a03 * a22));
    out[2]  =  (a01 * (a12 * a33 - a13 * a32) - a11 * (a02 * a33 - a03 * a32) + a31 * (a02 * a13 - a03 * a12));
    out[3]  = -(a01 * (a12 * a23 - a13 * a22) - a11 * (a02 * a23 - a03 * a22) + a21 * (a02 * a13 - a03 * a12));
    out[4]  = -(a10 * (a22 * a33 - a23 * a32) - a20 * (a12 * a33 - a13 * a32) + a30 * (a12 * a23 - a13 * a22));
    out[5]  =  (a00 * (a22 * a33 - a23 * a32) - a20 * (a02 * a33 - a03 * a32) + a30 * (a02 * a23 - a03 * a22));
    out[6]  = -(a00 * (a12 * a33 - a13 * a32) - a10 * (a02 * a33 - a03 * a32) + a30 * (a02 * a13 - a03 * a12));
    out[7]  =  (a00 * (a12 * a23 - a13 * a22) - a10 * (a02 * a23 - a03 * a22) + a20 * (a02 * a13 - a03 * a12));
    out[8]  =  (a10 * (a21 * a33 - a23 * a31) - a20 * (a11 * a33 - a13 * a31) + a30 * (a11 * a23 - a13 * a21));
    out[9]  = -(a00 * (a21 * a33 - a23 * a31) - a20 * (a01 * a33 - a03 * a31) + a30 * (a01 * a23 - a03 * a21));
    out[10] =  (a00 * (a11 * a33 - a13 * a31) - a10 * (a01 * a33 - a03 * a31) + a30 * (a01 * a13 - a03 * a11));
    out[11] = -(a00 * (a11 * a23 - a13 * a21) - a10 * (a01 * a23 - a03 * a21) + a20 * (a01 * a13 - a03 * a11));
    out[12] = -(a10 * (a21 * a32 - a22 * a31) - a20 * (a11 * a32 - a12 * a31) + a30 * (a11 * a22 - a12 * a21));
    out[13] =  (a00 * (a21 * a32 - a22 * a31) - a20 * (a01 * a32 - a02 * a31) + a30 * (a01 * a22 - a02 * a21));
    out[14] = -(a00 * (a11 * a32 - a12 * a31) - a10 * (a01 * a32 - a02 * a31) + a30 * (a01 * a12 - a02 * a11));
    out[15] =  (a00 * (a11 * a22 - a12 * a21) - a10 * (a01 * a22 - a02 * a21) + a20 * (a01 * a12 - a02 * a11));
    return out;
};
},{}],37:[function(require,module,exports){
module.exports = clone;

/**
 * Creates a new mat4 initialized with values from an existing matrix
 *
 * @param {mat4} a matrix to clone
 * @returns {mat4} a new 4x4 matrix
 */
function clone(a) {
    var out = new Float32Array(16);
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];
    out[8] = a[8];
    out[9] = a[9];
    out[10] = a[10];
    out[11] = a[11];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
    return out;
};
},{}],38:[function(require,module,exports){
module.exports = copy;

/**
 * Copy the values from one mat4 to another
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
function copy(out, a) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];
    out[8] = a[8];
    out[9] = a[9];
    out[10] = a[10];
    out[11] = a[11];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
    return out;
};
},{}],39:[function(require,module,exports){
module.exports = create;

/**
 * Creates a new identity mat4
 *
 * @returns {mat4} a new 4x4 matrix
 */
function create() {
    var out = new Float32Array(16);
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = 1;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 1;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;
    return out;
};
},{}],40:[function(require,module,exports){
module.exports = determinant;

/**
 * Calculates the determinant of a mat4
 *
 * @param {mat4} a the source matrix
 * @returns {Number} determinant of a
 */
function determinant(a) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15],

        b00 = a00 * a11 - a01 * a10,
        b01 = a00 * a12 - a02 * a10,
        b02 = a00 * a13 - a03 * a10,
        b03 = a01 * a12 - a02 * a11,
        b04 = a01 * a13 - a03 * a11,
        b05 = a02 * a13 - a03 * a12,
        b06 = a20 * a31 - a21 * a30,
        b07 = a20 * a32 - a22 * a30,
        b08 = a20 * a33 - a23 * a30,
        b09 = a21 * a32 - a22 * a31,
        b10 = a21 * a33 - a23 * a31,
        b11 = a22 * a33 - a23 * a32;

    // Calculate the determinant
    return b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
};
},{}],41:[function(require,module,exports){
module.exports = fromQuat;

/**
 * Creates a matrix from a quaternion rotation.
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {quat4} q Rotation quaternion
 * @returns {mat4} out
 */
function fromQuat(out, q) {
    var x = q[0], y = q[1], z = q[2], w = q[3],
        x2 = x + x,
        y2 = y + y,
        z2 = z + z,

        xx = x * x2,
        yx = y * x2,
        yy = y * y2,
        zx = z * x2,
        zy = z * y2,
        zz = z * z2,
        wx = w * x2,
        wy = w * y2,
        wz = w * z2;

    out[0] = 1 - yy - zz;
    out[1] = yx + wz;
    out[2] = zx - wy;
    out[3] = 0;

    out[4] = yx - wz;
    out[5] = 1 - xx - zz;
    out[6] = zy + wx;
    out[7] = 0;

    out[8] = zx + wy;
    out[9] = zy - wx;
    out[10] = 1 - xx - yy;
    out[11] = 0;

    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;

    return out;
};
},{}],42:[function(require,module,exports){
module.exports = fromRotationTranslation;

/**
 * Creates a matrix from a quaternion rotation and vector translation
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.translate(dest, vec);
 *     var quatMat = mat4.create();
 *     quat4.toMat4(quat, quatMat);
 *     mat4.multiply(dest, quatMat);
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {quat4} q Rotation quaternion
 * @param {vec3} v Translation vector
 * @returns {mat4} out
 */
function fromRotationTranslation(out, q, v) {
    // Quaternion math
    var x = q[0], y = q[1], z = q[2], w = q[3],
        x2 = x + x,
        y2 = y + y,
        z2 = z + z,

        xx = x * x2,
        xy = x * y2,
        xz = x * z2,
        yy = y * y2,
        yz = y * z2,
        zz = z * z2,
        wx = w * x2,
        wy = w * y2,
        wz = w * z2;

    out[0] = 1 - (yy + zz);
    out[1] = xy + wz;
    out[2] = xz - wy;
    out[3] = 0;
    out[4] = xy - wz;
    out[5] = 1 - (xx + zz);
    out[6] = yz + wx;
    out[7] = 0;
    out[8] = xz + wy;
    out[9] = yz - wx;
    out[10] = 1 - (xx + yy);
    out[11] = 0;
    out[12] = v[0];
    out[13] = v[1];
    out[14] = v[2];
    out[15] = 1;
    
    return out;
};
},{}],43:[function(require,module,exports){
module.exports = frustum;

/**
 * Generates a frustum matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {Number} left Left bound of the frustum
 * @param {Number} right Right bound of the frustum
 * @param {Number} bottom Bottom bound of the frustum
 * @param {Number} top Top bound of the frustum
 * @param {Number} near Near bound of the frustum
 * @param {Number} far Far bound of the frustum
 * @returns {mat4} out
 */
function frustum(out, left, right, bottom, top, near, far) {
    var rl = 1 / (right - left),
        tb = 1 / (top - bottom),
        nf = 1 / (near - far);
    out[0] = (near * 2) * rl;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = (near * 2) * tb;
    out[6] = 0;
    out[7] = 0;
    out[8] = (right + left) * rl;
    out[9] = (top + bottom) * tb;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[14] = (far * near * 2) * nf;
    out[15] = 0;
    return out;
};
},{}],44:[function(require,module,exports){
module.exports = identity;

/**
 * Set a mat4 to the identity matrix
 *
 * @param {mat4} out the receiving matrix
 * @returns {mat4} out
 */
function identity(out) {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = 1;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 1;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;
    return out;
};
},{}],45:[function(require,module,exports){
module.exports = {
  create: require('./create')
  , clone: require('./clone')
  , copy: require('./copy')
  , identity: require('./identity')
  , transpose: require('./transpose')
  , invert: require('./invert')
  , adjoint: require('./adjoint')
  , determinant: require('./determinant')
  , multiply: require('./multiply')
  , translate: require('./translate')
  , scale: require('./scale')
  , rotate: require('./rotate')
  , rotateX: require('./rotateX')
  , rotateY: require('./rotateY')
  , rotateZ: require('./rotateZ')
  , fromRotationTranslation: require('./fromRotationTranslation')
  , fromQuat: require('./fromQuat')
  , frustum: require('./frustum')
  , perspective: require('./perspective')
  , perspectiveFromFieldOfView: require('./perspectiveFromFieldOfView')
  , ortho: require('./ortho')
  , lookAt: require('./lookAt')
  , str: require('./str')
}
},{"./adjoint":36,"./clone":37,"./copy":38,"./create":39,"./determinant":40,"./fromQuat":41,"./fromRotationTranslation":42,"./frustum":43,"./identity":44,"./invert":46,"./lookAt":47,"./multiply":48,"./ortho":49,"./perspective":50,"./perspectiveFromFieldOfView":51,"./rotate":52,"./rotateX":53,"./rotateY":54,"./rotateZ":55,"./scale":56,"./str":57,"./translate":58,"./transpose":59}],46:[function(require,module,exports){
module.exports = invert;

/**
 * Inverts a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
function invert(out, a) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15],

        b00 = a00 * a11 - a01 * a10,
        b01 = a00 * a12 - a02 * a10,
        b02 = a00 * a13 - a03 * a10,
        b03 = a01 * a12 - a02 * a11,
        b04 = a01 * a13 - a03 * a11,
        b05 = a02 * a13 - a03 * a12,
        b06 = a20 * a31 - a21 * a30,
        b07 = a20 * a32 - a22 * a30,
        b08 = a20 * a33 - a23 * a30,
        b09 = a21 * a32 - a22 * a31,
        b10 = a21 * a33 - a23 * a31,
        b11 = a22 * a33 - a23 * a32,

        // Calculate the determinant
        det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

    if (!det) { 
        return null; 
    }
    det = 1.0 / det;

    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;

    return out;
};
},{}],47:[function(require,module,exports){
var identity = require('./identity');

module.exports = lookAt;

/**
 * Generates a look-at matrix with the given eye position, focal point, and up axis
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {vec3} eye Position of the viewer
 * @param {vec3} center Point the viewer is looking at
 * @param {vec3} up vec3 pointing up
 * @returns {mat4} out
 */
function lookAt(out, eye, center, up) {
    var x0, x1, x2, y0, y1, y2, z0, z1, z2, len,
        eyex = eye[0],
        eyey = eye[1],
        eyez = eye[2],
        upx = up[0],
        upy = up[1],
        upz = up[2],
        centerx = center[0],
        centery = center[1],
        centerz = center[2];

    if (Math.abs(eyex - centerx) < 0.000001 &&
        Math.abs(eyey - centery) < 0.000001 &&
        Math.abs(eyez - centerz) < 0.000001) {
        return identity(out);
    }

    z0 = eyex - centerx;
    z1 = eyey - centery;
    z2 = eyez - centerz;

    len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
    z0 *= len;
    z1 *= len;
    z2 *= len;

    x0 = upy * z2 - upz * z1;
    x1 = upz * z0 - upx * z2;
    x2 = upx * z1 - upy * z0;
    len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
    if (!len) {
        x0 = 0;
        x1 = 0;
        x2 = 0;
    } else {
        len = 1 / len;
        x0 *= len;
        x1 *= len;
        x2 *= len;
    }

    y0 = z1 * x2 - z2 * x1;
    y1 = z2 * x0 - z0 * x2;
    y2 = z0 * x1 - z1 * x0;

    len = Math.sqrt(y0 * y0 + y1 * y1 + y2 * y2);
    if (!len) {
        y0 = 0;
        y1 = 0;
        y2 = 0;
    } else {
        len = 1 / len;
        y0 *= len;
        y1 *= len;
        y2 *= len;
    }

    out[0] = x0;
    out[1] = y0;
    out[2] = z0;
    out[3] = 0;
    out[4] = x1;
    out[5] = y1;
    out[6] = z1;
    out[7] = 0;
    out[8] = x2;
    out[9] = y2;
    out[10] = z2;
    out[11] = 0;
    out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
    out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
    out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
    out[15] = 1;

    return out;
};
},{"./identity":44}],48:[function(require,module,exports){
module.exports = multiply;

/**
 * Multiplies two mat4's
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the first operand
 * @param {mat4} b the second operand
 * @returns {mat4} out
 */
function multiply(out, a, b) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    // Cache only the current line of the second matrix
    var b0  = b[0], b1 = b[1], b2 = b[2], b3 = b[3];  
    out[0] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[1] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[2] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[3] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[5] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[6] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[7] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[9] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[10] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[11] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[13] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[14] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[15] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
    return out;
};
},{}],49:[function(require,module,exports){
module.exports = ortho;

/**
 * Generates a orthogonal projection matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {number} left Left bound of the frustum
 * @param {number} right Right bound of the frustum
 * @param {number} bottom Bottom bound of the frustum
 * @param {number} top Top bound of the frustum
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {mat4} out
 */
function ortho(out, left, right, bottom, top, near, far) {
    var lr = 1 / (left - right),
        bt = 1 / (bottom - top),
        nf = 1 / (near - far);
    out[0] = -2 * lr;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = -2 * bt;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 2 * nf;
    out[11] = 0;
    out[12] = (left + right) * lr;
    out[13] = (top + bottom) * bt;
    out[14] = (far + near) * nf;
    out[15] = 1;
    return out;
};
},{}],50:[function(require,module,exports){
module.exports = perspective;

/**
 * Generates a perspective projection matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {number} fovy Vertical field of view in radians
 * @param {number} aspect Aspect ratio. typically viewport width/height
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {mat4} out
 */
function perspective(out, fovy, aspect, near, far) {
    var f = 1.0 / Math.tan(fovy / 2),
        nf = 1 / (near - far);
    out[0] = f / aspect;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = f;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[14] = (2 * far * near) * nf;
    out[15] = 0;
    return out;
};
},{}],51:[function(require,module,exports){
module.exports = perspectiveFromFieldOfView;

/**
 * Generates a perspective projection matrix with the given field of view.
 * This is primarily useful for generating projection matrices to be used
 * with the still experiemental WebVR API.
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {number} fov Object containing the following values: upDegrees, downDegrees, leftDegrees, rightDegrees
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {mat4} out
 */
function perspectiveFromFieldOfView(out, fov, near, far) {
    var upTan = Math.tan(fov.upDegrees * Math.PI/180.0),
        downTan = Math.tan(fov.downDegrees * Math.PI/180.0),
        leftTan = Math.tan(fov.leftDegrees * Math.PI/180.0),
        rightTan = Math.tan(fov.rightDegrees * Math.PI/180.0),
        xScale = 2.0 / (leftTan + rightTan),
        yScale = 2.0 / (upTan + downTan);

    out[0] = xScale;
    out[1] = 0.0;
    out[2] = 0.0;
    out[3] = 0.0;
    out[4] = 0.0;
    out[5] = yScale;
    out[6] = 0.0;
    out[7] = 0.0;
    out[8] = -((leftTan - rightTan) * xScale * 0.5);
    out[9] = ((upTan - downTan) * yScale * 0.5);
    out[10] = far / (near - far);
    out[11] = -1.0;
    out[12] = 0.0;
    out[13] = 0.0;
    out[14] = (far * near) / (near - far);
    out[15] = 0.0;
    return out;
}


},{}],52:[function(require,module,exports){
module.exports = rotate;

/**
 * Rotates a mat4 by the given angle
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @param {vec3} axis the axis to rotate around
 * @returns {mat4} out
 */
function rotate(out, a, rad, axis) {
    var x = axis[0], y = axis[1], z = axis[2],
        len = Math.sqrt(x * x + y * y + z * z),
        s, c, t,
        a00, a01, a02, a03,
        a10, a11, a12, a13,
        a20, a21, a22, a23,
        b00, b01, b02,
        b10, b11, b12,
        b20, b21, b22;

    if (Math.abs(len) < 0.000001) { return null; }
    
    len = 1 / len;
    x *= len;
    y *= len;
    z *= len;

    s = Math.sin(rad);
    c = Math.cos(rad);
    t = 1 - c;

    a00 = a[0]; a01 = a[1]; a02 = a[2]; a03 = a[3];
    a10 = a[4]; a11 = a[5]; a12 = a[6]; a13 = a[7];
    a20 = a[8]; a21 = a[9]; a22 = a[10]; a23 = a[11];

    // Construct the elements of the rotation matrix
    b00 = x * x * t + c; b01 = y * x * t + z * s; b02 = z * x * t - y * s;
    b10 = x * y * t - z * s; b11 = y * y * t + c; b12 = z * y * t + x * s;
    b20 = x * z * t + y * s; b21 = y * z * t - x * s; b22 = z * z * t + c;

    // Perform rotation-specific matrix multiplication
    out[0] = a00 * b00 + a10 * b01 + a20 * b02;
    out[1] = a01 * b00 + a11 * b01 + a21 * b02;
    out[2] = a02 * b00 + a12 * b01 + a22 * b02;
    out[3] = a03 * b00 + a13 * b01 + a23 * b02;
    out[4] = a00 * b10 + a10 * b11 + a20 * b12;
    out[5] = a01 * b10 + a11 * b11 + a21 * b12;
    out[6] = a02 * b10 + a12 * b11 + a22 * b12;
    out[7] = a03 * b10 + a13 * b11 + a23 * b12;
    out[8] = a00 * b20 + a10 * b21 + a20 * b22;
    out[9] = a01 * b20 + a11 * b21 + a21 * b22;
    out[10] = a02 * b20 + a12 * b21 + a22 * b22;
    out[11] = a03 * b20 + a13 * b21 + a23 * b22;

    if (a !== out) { // If the source and destination differ, copy the unchanged last row
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
    }
    return out;
};
},{}],53:[function(require,module,exports){
module.exports = rotateX;

/**
 * Rotates a matrix by the given angle around the X axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
function rotateX(out, a, rad) {
    var s = Math.sin(rad),
        c = Math.cos(rad),
        a10 = a[4],
        a11 = a[5],
        a12 = a[6],
        a13 = a[7],
        a20 = a[8],
        a21 = a[9],
        a22 = a[10],
        a23 = a[11];

    if (a !== out) { // If the source and destination differ, copy the unchanged rows
        out[0]  = a[0];
        out[1]  = a[1];
        out[2]  = a[2];
        out[3]  = a[3];
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
    }

    // Perform axis-specific matrix multiplication
    out[4] = a10 * c + a20 * s;
    out[5] = a11 * c + a21 * s;
    out[6] = a12 * c + a22 * s;
    out[7] = a13 * c + a23 * s;
    out[8] = a20 * c - a10 * s;
    out[9] = a21 * c - a11 * s;
    out[10] = a22 * c - a12 * s;
    out[11] = a23 * c - a13 * s;
    return out;
};
},{}],54:[function(require,module,exports){
module.exports = rotateY;

/**
 * Rotates a matrix by the given angle around the Y axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
function rotateY(out, a, rad) {
    var s = Math.sin(rad),
        c = Math.cos(rad),
        a00 = a[0],
        a01 = a[1],
        a02 = a[2],
        a03 = a[3],
        a20 = a[8],
        a21 = a[9],
        a22 = a[10],
        a23 = a[11];

    if (a !== out) { // If the source and destination differ, copy the unchanged rows
        out[4]  = a[4];
        out[5]  = a[5];
        out[6]  = a[6];
        out[7]  = a[7];
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
    }

    // Perform axis-specific matrix multiplication
    out[0] = a00 * c - a20 * s;
    out[1] = a01 * c - a21 * s;
    out[2] = a02 * c - a22 * s;
    out[3] = a03 * c - a23 * s;
    out[8] = a00 * s + a20 * c;
    out[9] = a01 * s + a21 * c;
    out[10] = a02 * s + a22 * c;
    out[11] = a03 * s + a23 * c;
    return out;
};
},{}],55:[function(require,module,exports){
module.exports = rotateZ;

/**
 * Rotates a matrix by the given angle around the Z axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
function rotateZ(out, a, rad) {
    var s = Math.sin(rad),
        c = Math.cos(rad),
        a00 = a[0],
        a01 = a[1],
        a02 = a[2],
        a03 = a[3],
        a10 = a[4],
        a11 = a[5],
        a12 = a[6],
        a13 = a[7];

    if (a !== out) { // If the source and destination differ, copy the unchanged last row
        out[8]  = a[8];
        out[9]  = a[9];
        out[10] = a[10];
        out[11] = a[11];
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
    }

    // Perform axis-specific matrix multiplication
    out[0] = a00 * c + a10 * s;
    out[1] = a01 * c + a11 * s;
    out[2] = a02 * c + a12 * s;
    out[3] = a03 * c + a13 * s;
    out[4] = a10 * c - a00 * s;
    out[5] = a11 * c - a01 * s;
    out[6] = a12 * c - a02 * s;
    out[7] = a13 * c - a03 * s;
    return out;
};
},{}],56:[function(require,module,exports){
module.exports = scale;

/**
 * Scales the mat4 by the dimensions in the given vec3
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to scale
 * @param {vec3} v the vec3 to scale the matrix by
 * @returns {mat4} out
 **/
function scale(out, a, v) {
    var x = v[0], y = v[1], z = v[2];

    out[0] = a[0] * x;
    out[1] = a[1] * x;
    out[2] = a[2] * x;
    out[3] = a[3] * x;
    out[4] = a[4] * y;
    out[5] = a[5] * y;
    out[6] = a[6] * y;
    out[7] = a[7] * y;
    out[8] = a[8] * z;
    out[9] = a[9] * z;
    out[10] = a[10] * z;
    out[11] = a[11] * z;
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
    return out;
};
},{}],57:[function(require,module,exports){
module.exports = str;

/**
 * Returns a string representation of a mat4
 *
 * @param {mat4} mat matrix to represent as a string
 * @returns {String} string representation of the matrix
 */
function str(a) {
    return 'mat4(' + a[0] + ', ' + a[1] + ', ' + a[2] + ', ' + a[3] + ', ' +
                    a[4] + ', ' + a[5] + ', ' + a[6] + ', ' + a[7] + ', ' +
                    a[8] + ', ' + a[9] + ', ' + a[10] + ', ' + a[11] + ', ' + 
                    a[12] + ', ' + a[13] + ', ' + a[14] + ', ' + a[15] + ')';
};
},{}],58:[function(require,module,exports){
module.exports = translate;

/**
 * Translate a mat4 by the given vector
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to translate
 * @param {vec3} v vector to translate by
 * @returns {mat4} out
 */
function translate(out, a, v) {
    var x = v[0], y = v[1], z = v[2],
        a00, a01, a02, a03,
        a10, a11, a12, a13,
        a20, a21, a22, a23;

    if (a === out) {
        out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
        out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
        out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
        out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    } else {
        a00 = a[0]; a01 = a[1]; a02 = a[2]; a03 = a[3];
        a10 = a[4]; a11 = a[5]; a12 = a[6]; a13 = a[7];
        a20 = a[8]; a21 = a[9]; a22 = a[10]; a23 = a[11];

        out[0] = a00; out[1] = a01; out[2] = a02; out[3] = a03;
        out[4] = a10; out[5] = a11; out[6] = a12; out[7] = a13;
        out[8] = a20; out[9] = a21; out[10] = a22; out[11] = a23;

        out[12] = a00 * x + a10 * y + a20 * z + a[12];
        out[13] = a01 * x + a11 * y + a21 * z + a[13];
        out[14] = a02 * x + a12 * y + a22 * z + a[14];
        out[15] = a03 * x + a13 * y + a23 * z + a[15];
    }

    return out;
};
},{}],59:[function(require,module,exports){
module.exports = transpose;

/**
 * Transpose the values of a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
function transpose(out, a) {
    // If we are transposing ourselves we can skip a few steps but have to cache some values
    if (out === a) {
        var a01 = a[1], a02 = a[2], a03 = a[3],
            a12 = a[6], a13 = a[7],
            a23 = a[11];

        out[1] = a[4];
        out[2] = a[8];
        out[3] = a[12];
        out[4] = a01;
        out[6] = a[9];
        out[7] = a[13];
        out[8] = a02;
        out[9] = a12;
        out[11] = a[14];
        out[12] = a03;
        out[13] = a13;
        out[14] = a23;
    } else {
        out[0] = a[0];
        out[1] = a[4];
        out[2] = a[8];
        out[3] = a[12];
        out[4] = a[1];
        out[5] = a[5];
        out[6] = a[9];
        out[7] = a[13];
        out[8] = a[2];
        out[9] = a[6];
        out[10] = a[10];
        out[11] = a[14];
        out[12] = a[3];
        out[13] = a[7];
        out[14] = a[11];
        out[15] = a[15];
    }
    
    return out;
};
},{}],60:[function(require,module,exports){

var extend = require('./lib/util/extend')
var dynamic = require('./lib/dynamic')
var raf = require('./lib/util/raf')
var clock = require('./lib/util/clock')
var createStringStore = require('./lib/strings')
var initWebGL = require('./lib/webgl')
var wrapExtensions = require('./lib/extension')
var wrapLimits = require('./lib/limits')
var wrapBuffers = require('./lib/buffer')
var wrapElements = require('./lib/elements')
var wrapTextures = require('./lib/texture')
var wrapRenderbuffers = require('./lib/renderbuffer')
var wrapFramebuffers = require('./lib/framebuffer')
var wrapAttributes = require('./lib/attribute')
var wrapShaders = require('./lib/shader')
var wrapRead = require('./lib/read')
var createCore = require('./lib/core')

var GL_COLOR_BUFFER_BIT = 16384
var GL_DEPTH_BUFFER_BIT = 256
var GL_STENCIL_BUFFER_BIT = 1024

var GL_ARRAY_BUFFER = 34962
var GL_TEXTURE_2D = 0x0DE1
var GL_TEXTURE_CUBE_MAP = 0x8513

var CONTEXT_LOST_EVENT = 'webglcontextlost'
var CONTEXT_RESTORED_EVENT = 'webglcontextrestored'

var DYN_PROP = 1
var DYN_CONTEXT = 2
var DYN_STATE = 3

module.exports = function wrapREGL () {
  var args = initWebGL(Array.prototype.slice.call(arguments))
  var gl = args.gl
  var options = args.options

  var stringStore = createStringStore()

  var extensionState = wrapExtensions(gl)
  var extensions = extensionState.extensions

  var START_TIME = clock()
  var LAST_TIME = START_TIME
  var WIDTH = gl.drawingBufferWidth
  var HEIGHT = gl.drawingBufferHeight

  var contextState = {
    count: 0,
    deltaTime: 0,
    time: 0,
    viewportWidth: WIDTH,
    viewportHeight: HEIGHT,
    framebufferWidth: WIDTH,
    framebufferHeight: HEIGHT,
    drawingBufferWidth: WIDTH,
    drawingBufferHeight: HEIGHT,
    pixelRatio: options.pixelRatio
  }
  var uniformState = {}
  var drawState = {
    elements: null,
    primitive: 4, // GL_TRIANGLES
    count: -1,
    offset: 0,
    instances: -1
  }

  var limits = wrapLimits(gl, extensions)
  var bufferState = wrapBuffers(gl)
  var elementState = wrapElements(gl, extensions, bufferState)
  var attributeState = wrapAttributes(
    gl,
    extensions,
    limits,
    bufferState,
    stringStore)
  var shaderState = wrapShaders(gl, stringStore)
  var textureState = wrapTextures(
    gl,
    extensions,
    limits,
    poll,
    contextState)
  var renderbufferState = wrapRenderbuffers(gl, extensions, limits)
  var framebufferState = wrapFramebuffers(
    gl,
    extensions,
    limits,
    textureState,
    renderbufferState)
  var readPixels = wrapRead(gl, poll, contextState)

  var core = createCore(
    gl,
    stringStore,
    extensions,
    limits,
    bufferState,
    elementState,
    textureState,
    framebufferState,
    uniformState,
    attributeState,
    shaderState,
    drawState,
    contextState)

  var nextState = core.next
  var canvas = gl.canvas

  var rafCallbacks = []
  var activeRAF = 0
  function handleRAF () {
    // schedule next animation frame
    activeRAF = raf.next(handleRAF)

    // increment frame coun
    contextState.count += 1

    // reset viewport
    var viewport = nextState.viewport
    var scissorBox = nextState.scissor_box
    viewport[0] = viewport[1] = scissorBox[0] = scissorBox[1] = 0

    contextState.viewportWidth =
      contextState.frameBufferWidth =
      contextState.drawingBufferWidth =
      viewport[2] =
      scissorBox[2] = gl.drawingBufferWidth
    contextState.viewportHeight =
      contextState.frameBufferWidth =
      contextState.drawingBufferHeight =
      viewport[3] =
      scissorBox[3] = gl.drawingBufferHeight

    var now = clock()
    contextState.deltaTime = (now - LAST_TIME) / 1000.0
    contextState.time = (now - START_TIME) / 1000.0
    LAST_TIME = now

    core.procs.refresh()
    textureState.poll()

    for (var i = 0; i < rafCallbacks.length; ++i) {
      var cb = rafCallbacks[i]
      cb(contextState, null, 0)
    }
  }

  function startRAF () {
    if (!activeRAF && rafCallbacks.length > 0) {
      handleRAF()
    }
  }

  function stopRAF () {
    if (activeRAF) {
      raf.cancel(handleRAF)
      activeRAF = 0
    }
  }

  function handleContextLoss (event) {
    /*
    stopRAF()
    event.preventDefault()
    if (options.onContextLost) {
      options.onContextLost()
    }
    */
  }

  function handleContextRestored (event) {
    /*
    gl.getError()
    extensionState.refresh()
    core.procs.refresh()
    bufferState.refresh()
    textureState.refresh()
    renderbufferState.refresh()
    framebufferState.refresh()
    shaderState.refresh()
    if (options.onContextRestored) {
      options.onContextRestored()
    }
    handleRAF()
    */
  }

  if (canvas) {
    canvas.addEventListener(CONTEXT_LOST_EVENT, handleContextLoss, false)
    canvas.addEventListener(CONTEXT_RESTORED_EVENT, handleContextRestored, false)
  }

  function destroy () {
    stopRAF()

    if (canvas) {
      canvas.removeEventListener(CONTEXT_LOST_EVENT, handleContextLoss)
      canvas.removeEventListener(CONTEXT_RESTORED_EVENT, handleContextRestored)
    }

    shaderState.clear()
    framebufferState.clear()
    renderbufferState.clear()
    textureState.clear()
    bufferState.clear()

    if (options.onDestroy) {
      options.onDestroy()
    }
  }

  function compileProcedure (options) {
    
    

    function flattenNestedOptions (options) {
      var result = extend({}, options)
      delete result.uniforms
      delete result.attributes
      delete result.context

      function merge (name) {
        if (name in result) {
          var child = result[name]
          delete result[name]
          Object.keys(child).forEach(function (prop) {
            result[name + '.' + prop] = child[prop]
          })
        }
      }
      merge('blend')
      merge('depth')
      merge('cull')
      merge('stencil')
      merge('polygonOffset')
      merge('scissor')
      merge('sample')

      return result
    }

    function separateDynamic (object) {
      var staticItems = {}
      var dynamicItems = {}
      Object.keys(object).forEach(function (option) {
        var value = object[option]
        if (dynamic.isDynamic(value)) {
          dynamicItems[option] = dynamic.unbox(value, option)
        } else {
          staticItems[option] = value
        }
      })
      return {
        dynamic: dynamicItems,
        static: staticItems
      }
    }

    // Treat context variables separate from other dynamic variables
    var context = separateDynamic(options.context || {})
    var uniforms = separateDynamic(options.uniforms || {})
    var attributes = separateDynamic(options.attributes || {})
    var opts = separateDynamic(flattenNestedOptions(options))

    var compiled = core.compile(opts, attributes, uniforms, context)

    var draw = compiled.draw
    var batch = compiled.batch
    var scope = compiled.scope

    var EMPTY_ARRAY = []
    function reserve (count) {
      while (EMPTY_ARRAY.length < count) {
        EMPTY_ARRAY.push(null)
      }
      return EMPTY_ARRAY
    }

    function REGLCommand (args, body) {
      var i
      if (typeof args === 'function') {
        return scope.call(this, null, args, 0)
      } else if (typeof body === 'function') {
        if (typeof args === 'number') {
          for (i = 0; i < args; ++i) {
            scope.call(this, null, body, i)
          }
          return
        } else if (Array.isArray(args)) {
          for (i = 0; i < args.length; ++i) {
            scope.call(this, args[i], body, i)
          }
          return
        } else {
          return scope.call(this, args, body, 0)
        }
      } else if (typeof args === 'number') {
        if (args > 0) {
          return batch.call(this, reserve(args | 0), args | 0)
        }
      } else if (Array.isArray(args)) {
        if (args.length) {
          return batch.call(this, args, args.length)
        }
      } else {
        return draw.call(this, args)
      }
    }

    return REGLCommand
  }

  function poll () {
    core.procs.poll()
  }

  function clear (options) {
    var clearFlags = 0

    poll()

    var c = options.color
    if (c) {
      gl.clearColor(+c[0] || 0, +c[1] || 0, +c[2] || 0, +c[3] || 0)
      clearFlags |= GL_COLOR_BUFFER_BIT
    }
    if ('depth' in options) {
      gl.clearDepth(+options.depth)
      clearFlags |= GL_DEPTH_BUFFER_BIT
    }
    if ('stencil' in options) {
      gl.clearStencil(options.stencil | 0)
      clearFlags |= GL_STENCIL_BUFFER_BIT
    }

    
    gl.clear(clearFlags)
  }

  function frame (cb) {
    rafCallbacks.push(cb)

    function cancel () {
      var index = rafCallbacks.find(function (item) {
        return item === cb
      })
      if (index < 0) {
        return
      }
      rafCallbacks.splice(index, 1)
      if (rafCallbacks.length <= 0) {
        stopRAF()
      }
    }

    startRAF()

    return {
      cancel: cancel
    }
  }

  core.procs.refresh()

  return extend(compileProcedure, {
    // Clear current FBO
    clear: clear,

    // Short cuts for dynamic variables
    prop: dynamic.define.bind(null, DYN_PROP),
    context: dynamic.define.bind(null, DYN_CONTEXT),
    this: dynamic.define.bind(null, DYN_STATE),

    // executes an empty draw command
    draw: compileProcedure({}),

    // Resources
    elements: function (options) {
      return elementState.create(options)
    },
    buffer: function (options) {
      return bufferState.create(options, GL_ARRAY_BUFFER)
    },
    texture: function (options) {
      return textureState.create(options, GL_TEXTURE_2D)
    },
    cube: function (options) {
      if (arguments.length === 6) {
        return textureState.create(
          Array.prototype.slice.call(arguments),
          GL_TEXTURE_CUBE_MAP)
      } else {
        return textureState.create(options, GL_TEXTURE_CUBE_MAP)
      }
    },
    renderbuffer: function (options) {
      return renderbufferState.create(options)
    },
    framebuffer: function (options) {
      return framebufferState.create(options)
    },
    framebufferCube: function (options) {
      
    },

    // Expose context attributes
    attributes: gl.getContextAttributes(),

    // Frame rendering
    frame: frame,

    // System limits
    limits: limits,

    // Read pixels
    read: readPixels,

    // Destroy regl and all associated resources
    destroy: destroy,

    // Direct GL state manipulation
    _gl: gl,
    _refresh: function () {
      core.procs.refresh()
    }
  })
}

},{"./lib/attribute":2,"./lib/buffer":3,"./lib/core":8,"./lib/dynamic":9,"./lib/elements":10,"./lib/extension":11,"./lib/framebuffer":12,"./lib/limits":13,"./lib/read":14,"./lib/renderbuffer":15,"./lib/shader":16,"./lib/strings":17,"./lib/texture":18,"./lib/util/clock":19,"./lib/util/extend":21,"./lib/util/raf":29,"./lib/webgl":33}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJleGFtcGxlL2Vudm1hcC5qcyIsImxpYi9hdHRyaWJ1dGUuanMiLCJsaWIvYnVmZmVyLmpzIiwibGliL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24iLCJsaWIvY29uc3RhbnRzL2R0eXBlcy5qc29uIiwibGliL2NvbnN0YW50cy9wcmltaXRpdmVzLmpzb24iLCJsaWIvY29uc3RhbnRzL3VzYWdlLmpzb24iLCJsaWIvY29yZS5qcyIsImxpYi9keW5hbWljLmpzIiwibGliL2VsZW1lbnRzLmpzIiwibGliL2V4dGVuc2lvbi5qcyIsImxpYi9mcmFtZWJ1ZmZlci5qcyIsImxpYi9saW1pdHMuanMiLCJsaWIvcmVhZC5qcyIsImxpYi9yZW5kZXJidWZmZXIuanMiLCJsaWIvc2hhZGVyLmpzIiwibGliL3N0cmluZ3MuanMiLCJsaWIvdGV4dHVyZS5qcyIsImxpYi91dGlsL2Nsb2NrLmpzIiwibGliL3V0aWwvY29kZWdlbi5qcyIsImxpYi91dGlsL2V4dGVuZC5qcyIsImxpYi91dGlsL2ZsYXR0ZW4uanMiLCJsaWIvdXRpbC9pcy1uZGFycmF5LmpzIiwibGliL3V0aWwvaXMtdHlwZWQtYXJyYXkuanMiLCJsaWIvdXRpbC9sb2FkLXRleHR1cmUuanMiLCJsaWIvdXRpbC9sb29wLmpzIiwibGliL3V0aWwvcGFyc2UtZGRzLmpzIiwibGliL3V0aWwvcG9vbC5qcyIsImxpYi91dGlsL3JhZi5qcyIsImxpYi91dGlsL3RvLWhhbGYtZmxvYXQuanMiLCJsaWIvdXRpbC90cmFuc3Bvc2UuanMiLCJsaWIvdXRpbC92YWx1ZXMuanMiLCJsaWIvd2ViZ2wuanMiLCJub2RlX21vZHVsZXMvYW5nbGUtbm9ybWFscy9hbmdsZS1ub3JtYWxzLmpzIiwibm9kZV9tb2R1bGVzL2J1bm55L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvYWRqb2ludC5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L2Nsb25lLmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvY29weS5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L2NyZWF0ZS5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L2RldGVybWluYW50LmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvZnJvbVF1YXQuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9mcm9tUm90YXRpb25UcmFuc2xhdGlvbi5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L2ZydXN0dW0uanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9pZGVudGl0eS5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvaW52ZXJ0LmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvbG9va0F0LmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvbXVsdGlwbHkuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9vcnRoby5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L3BlcnNwZWN0aXZlLmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvcGVyc3BlY3RpdmVGcm9tRmllbGRPZlZpZXcuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9yb3RhdGUuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9yb3RhdGVYLmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvcm90YXRlWS5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L3JvdGF0ZVouanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9zY2FsZS5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L3N0ci5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L3RyYW5zbGF0ZS5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L3RyYW5zcG9zZS5qcyIsInJlZ2wuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JTQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6akZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdFBBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMXBCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6SkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzEzQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25MQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFGQTtBQUNBO0FBQ0E7O0FDRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3REQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiY29uc3QgcmVnbCA9IHJlcXVpcmUoJy4uL3JlZ2wnKSgpXG5jb25zdCBtYXQ0ID0gcmVxdWlyZSgnZ2wtbWF0NCcpXG5jb25zdCBidW5ueSA9IHJlcXVpcmUoJ2J1bm55JylcbmNvbnN0IG5vcm1hbHMgPSByZXF1aXJlKCdhbmdsZS1ub3JtYWxzJylcblxuY29uc3Qgc2V0dXBFbnZNYXAgPSByZWdsKHtcbiAgY29udGV4dDoge1xuICAgIHZpZXc6ICh7Y291bnR9KSA9PiB7XG4gICAgICBjb25zdCB0ID0gMC4wMSAqIGNvdW50XG4gICAgICByZXR1cm4gbWF0NC5sb29rQXQoW10sXG4gICAgICAgIFszMCAqIE1hdGguY29zKHQpLCAyLjUsIDMwICogTWF0aC5zaW4odCldLFxuICAgICAgICBbMCwgMi41LCAwXSxcbiAgICAgICAgWzAsIDEsIDBdKVxuICAgIH1cbiAgfSxcbiAgZnJhZzogYFxuICBwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcbiAgdW5pZm9ybSBzYW1wbGVyQ3ViZSBlbnZtYXA7XG4gIHZhcnlpbmcgdmVjMyByZWZsZWN0RGlyO1xuICB2b2lkIG1haW4gKCkge1xuICAgIGdsX0ZyYWdDb2xvciA9IHRleHR1cmVDdWJlKGVudm1hcCwgcmVmbGVjdERpcik7XG4gIH1gLFxuICB1bmlmb3Jtczoge1xuICAgIGVudm1hcDogcmVnbC5jdWJlKFxuICAgICAgJ2Fzc2V0cy9wb3N4LmpwZycsXG4gICAgICAnYXNzZXRzL25lZ3guanBnJyxcbiAgICAgICdhc3NldHMvcG9zeS5qcGcnLFxuICAgICAgJ2Fzc2V0cy9uZWd5LmpwZycsXG4gICAgICAnYXNzZXRzL3Bvc3ouanBnJyxcbiAgICAgICdhc3NldHMvbmVnei5qcGcnKSxcbiAgICB2aWV3OiByZWdsLmNvbnRleHQoJ3ZpZXcnKSxcbiAgICBwcm9qZWN0aW9uOiAoe3ZpZXdwb3J0V2lkdGgsIHZpZXdwb3J0SGVpZ2h0fSkgPT5cbiAgICAgIG1hdDQucGVyc3BlY3RpdmUoW10sXG4gICAgICAgIE1hdGguUEkgLyA0LFxuICAgICAgICB2aWV3cG9ydFdpZHRoIC8gdmlld3BvcnRIZWlnaHQsXG4gICAgICAgIDAuMDEsXG4gICAgICAgIDEwMDApLFxuICAgIGludlZpZXc6ICh7dmlld30pID0+IG1hdDQuaW52ZXJ0KFtdLCB2aWV3KVxuICB9XG59KVxuXG5jb25zdCBkcmF3QmFja2dyb3VuZCA9IHJlZ2woe1xuICB2ZXJ0OiBgXG4gIHByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xuICBhdHRyaWJ1dGUgdmVjMiBwb3NpdGlvbjtcbiAgdW5pZm9ybSBtYXQ0IHZpZXc7XG4gIHZhcnlpbmcgdmVjMyByZWZsZWN0RGlyO1xuICB2b2lkIG1haW4oKSB7XG4gICAgcmVmbGVjdERpciA9ICh2aWV3ICogdmVjNChwb3NpdGlvbiwgMSwgMCkpLnh5ejtcbiAgICBnbF9Qb3NpdGlvbiA9IHZlYzQocG9zaXRpb24sIDAsIDEpO1xuICB9YCxcbiAgYXR0cmlidXRlczoge1xuICAgIHBvc2l0aW9uOiBbXG4gICAgICAtNCwgLTQsXG4gICAgICAtNCwgNCxcbiAgICAgIDgsIDBdXG4gIH0sXG4gIGRlcHRoOiB7XG4gICAgbWFzazogZmFsc2UsXG4gICAgZW5hYmxlOiBmYWxzZVxuICB9LFxuICBjb3VudDogM1xufSlcblxuY29uc3QgZHJhd0J1bm55ID0gcmVnbCh7XG4gIHZlcnQ6IGBcbiAgcHJlY2lzaW9uIG1lZGl1bXAgZmxvYXQ7XG4gIGF0dHJpYnV0ZSB2ZWMzIHBvc2l0aW9uLCBub3JtYWw7XG4gIHVuaWZvcm0gbWF0NCBwcm9qZWN0aW9uLCB2aWV3LCBpbnZWaWV3O1xuICB2YXJ5aW5nIHZlYzMgcmVmbGVjdERpcjtcbiAgdm9pZCBtYWluKCkge1xuICAgIHZlYzQgZXllID0gaW52VmlldyAqIHZlYzQoMCwgMCwgMCwgMSk7XG4gICAgcmVmbGVjdERpciA9IHJlZmxlY3QoXG4gICAgICBub3JtYWxpemUocG9zaXRpb24ueHl6IC0gZXllLnh5eiAvIGV5ZS53KSxcbiAgICAgIG5vcm1hbCk7XG4gICAgZ2xfUG9zaXRpb24gPSBwcm9qZWN0aW9uICogdmlldyAqIHZlYzQocG9zaXRpb24sIDEpO1xuICB9YCxcbiAgYXR0cmlidXRlczoge1xuICAgIHBvc2l0aW9uOiBidW5ueS5wb3NpdGlvbnMsXG4gICAgbm9ybWFsOiBub3JtYWxzKGJ1bm55LmNlbGxzLCBidW5ueS5wb3NpdGlvbnMpXG4gIH0sXG4gIGVsZW1lbnRzOiBidW5ueS5jZWxsc1xufSlcblxucmVnbC5mcmFtZSgoKSA9PiB7XG4gIHNldHVwRW52TWFwKCgpID0+IHtcbiAgICBkcmF3QmFja2dyb3VuZCgpXG4gICAgZHJhd0J1bm55KClcbiAgfSlcbn0pXG4iLCJ2YXIgR0xfRkxPQVQgPSA1MTI2XG5cbmZ1bmN0aW9uIEF0dHJpYnV0ZVJlY29yZCAoKSB7XG4gIHRoaXMuc3RhdGUgPSAwXG5cbiAgdGhpcy54ID0gMC4wXG4gIHRoaXMueSA9IDAuMFxuICB0aGlzLnogPSAwLjBcbiAgdGhpcy53ID0gMC4wXG5cbiAgdGhpcy5idWZmZXIgPSBudWxsXG4gIHRoaXMuc2l6ZSA9IDBcbiAgdGhpcy5ub3JtYWxpemVkID0gZmFsc2VcbiAgdGhpcy50eXBlID0gR0xfRkxPQVRcbiAgdGhpcy5vZmZzZXQgPSAwXG4gIHRoaXMuc3RyaWRlID0gMFxuICB0aGlzLmRpdmlzb3IgPSAwXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcEF0dHJpYnV0ZVN0YXRlIChcbiAgZ2wsXG4gIGV4dGVuc2lvbnMsXG4gIGxpbWl0cyxcbiAgYnVmZmVyU3RhdGUsXG4gIHN0cmluZ1N0b3JlKSB7XG4gIHZhciBOVU1fQVRUUklCVVRFUyA9IGxpbWl0cy5tYXhBdHRyaWJ1dGVzXG4gIHZhciBhdHRyaWJ1dGVCaW5kaW5ncyA9IG5ldyBBcnJheShOVU1fQVRUUklCVVRFUylcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBOVU1fQVRUUklCVVRFUzsgKytpKSB7XG4gICAgYXR0cmlidXRlQmluZGluZ3NbaV0gPSBuZXcgQXR0cmlidXRlUmVjb3JkKClcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgUmVjb3JkOiBBdHRyaWJ1dGVSZWNvcmQsXG4gICAgc2NvcGU6IHt9LFxuICAgIHN0YXRlOiBhdHRyaWJ1dGVCaW5kaW5nc1xuICB9XG59XG4iLCJcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtdHlwZWQtYXJyYXknKVxudmFyIGlzTkRBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtbmRhcnJheScpXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi91dGlsL3ZhbHVlcycpXG52YXIgZmxhdHRlbiA9IHJlcXVpcmUoJy4vdXRpbC9mbGF0dGVuJylcbnZhciB0cmFuc3Bvc2UgPSByZXF1aXJlKCcuL3V0aWwvdHJhbnNwb3NlJylcbnZhciBwb29sID0gcmVxdWlyZSgnLi91dGlsL3Bvb2wnKVxuXG52YXIgYXJyYXlUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbicpXG52YXIgYnVmZmVyVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9kdHlwZXMuanNvbicpXG52YXIgdXNhZ2VUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL3VzYWdlLmpzb24nKVxuXG52YXIgR0xfU1RBVElDX0RSQVcgPSAweDg4RTRcbnZhciBHTF9TVFJFQU1fRFJBVyA9IDB4ODhFMFxuXG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9GTE9BVCA9IDUxMjZcblxuZnVuY3Rpb24gdHlwZWRBcnJheUNvZGUgKGRhdGEpIHtcbiAgcmV0dXJuIGFycmF5VHlwZXNbT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGRhdGEpXSB8IDBcbn1cblxuZnVuY3Rpb24gY29weUFycmF5IChvdXQsIGlucCkge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGlucC5sZW5ndGg7ICsraSkge1xuICAgIG91dFtpXSA9IGlucFtpXVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcEJ1ZmZlclN0YXRlIChnbCkge1xuICB2YXIgYnVmZmVyQ291bnQgPSAwXG4gIHZhciBidWZmZXJTZXQgPSB7fVxuXG4gIGZ1bmN0aW9uIFJFR0xCdWZmZXIgKHR5cGUpIHtcbiAgICB0aGlzLmlkID0gYnVmZmVyQ291bnQrK1xuICAgIHRoaXMuYnVmZmVyID0gZ2wuY3JlYXRlQnVmZmVyKClcbiAgICB0aGlzLnR5cGUgPSB0eXBlXG4gICAgdGhpcy51c2FnZSA9IEdMX1NUQVRJQ19EUkFXXG4gICAgdGhpcy5ieXRlTGVuZ3RoID0gMFxuICAgIHRoaXMuZGltZW5zaW9uID0gMVxuICAgIHRoaXMuZHR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gIH1cblxuICBSRUdMQnVmZmVyLnByb3RvdHlwZS5iaW5kID0gZnVuY3Rpb24gKCkge1xuICAgIGdsLmJpbmRCdWZmZXIodGhpcy50eXBlLCB0aGlzLmJ1ZmZlcilcbiAgfVxuXG4gIHZhciBzdHJlYW1Qb29sID0gW11cblxuICBmdW5jdGlvbiBjcmVhdGVTdHJlYW0gKHR5cGUsIGRhdGEpIHtcbiAgICB2YXIgYnVmZmVyID0gc3RyZWFtUG9vbC5wb3AoKVxuICAgIGlmICghYnVmZmVyKSB7XG4gICAgICBidWZmZXIgPSBuZXcgUkVHTEJ1ZmZlcih0eXBlKVxuICAgICAgYnVmZmVyLmJ1ZmZlciA9IGdsLmNyZWF0ZUJ1ZmZlcigpXG4gICAgfVxuICAgIGJ1ZmZlci5iaW5kKClcbiAgICBpbml0QnVmZmVyRnJvbURhdGEoYnVmZmVyLCBkYXRhLCBHTF9TVFJFQU1fRFJBVywgMCwgMSlcbiAgICByZXR1cm4gYnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95U3RyZWFtIChzdHJlYW0pIHtcbiAgICBzdHJlYW1Qb29sLnB1c2goc3RyZWFtKVxuICB9XG5cbiAgZnVuY3Rpb24gaW5pdEJ1ZmZlckZyb21UeXBlZEFycmF5IChidWZmZXIsIGRhdGEsIHVzYWdlKSB7XG4gICAgYnVmZmVyLmJ5dGVMZW5ndGggPSBkYXRhLmJ5dGVMZW5ndGhcbiAgICBnbC5idWZmZXJEYXRhKGJ1ZmZlci50eXBlLCBkYXRhLCB1c2FnZSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGluaXRCdWZmZXJGcm9tRGF0YSAoYnVmZmVyLCBkYXRhLCB1c2FnZSwgZHR5cGUsIGRpbWVuc2lvbikge1xuICAgIGJ1ZmZlci51c2FnZSA9IHVzYWdlXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcbiAgICAgIGJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IEdMX0ZMT0FUXG4gICAgICBpZiAoZGF0YS5sZW5ndGggPiAwICYmIEFycmF5LmlzQXJyYXkoZGF0YVswXSkpIHtcbiAgICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IGRhdGFbMF0ubGVuZ3RoXG4gICAgICAgIHZhciBmbGF0RGF0YSA9IHBvb2wuYWxsb2NUeXBlKFxuICAgICAgICAgIGJ1ZmZlci5kdHlwZSxcbiAgICAgICAgICBkYXRhLmxlbmd0aCAqIGJ1ZmZlci5kaW1lbnNpb24pXG4gICAgICAgIGZsYXR0ZW4oZmxhdERhdGEsIGRhdGEsIGJ1ZmZlci5kaW1lbnNpb24pXG4gICAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIGZsYXREYXRhLCB1c2FnZSlcbiAgICAgICAgcG9vbC5mcmVlVHlwZShmbGF0RGF0YSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkaW1lbnNpb25cbiAgICAgICAgdmFyIHR5cGVkRGF0YSA9IHBvb2wuYWxsb2NUeXBlKGJ1ZmZlci5kdHlwZSwgZGF0YS5sZW5ndGgpXG4gICAgICAgIGNvcHlBcnJheSh0eXBlZERhdGEsIGRhdGEpXG4gICAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIHR5cGVkRGF0YSwgdXNhZ2UpXG4gICAgICAgIHBvb2wuZnJlZVR5cGUodHlwZWREYXRhKVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoaXNUeXBlZEFycmF5KGRhdGEpKSB7XG4gICAgICBidWZmZXIuZHR5cGUgPSBkdHlwZSB8fCB0eXBlZEFycmF5Q29kZShkYXRhKVxuICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IGRpbWVuc2lvblxuICAgICAgaW5pdEJ1ZmZlckZyb21UeXBlZEFycmF5KGJ1ZmZlciwgZGF0YSwgdXNhZ2UpXG4gICAgfSBlbHNlIGlmIChpc05EQXJyYXlMaWtlKGRhdGEpKSB7XG4gICAgICB2YXIgc2hhcGUgPSBkYXRhLnNoYXBlXG4gICAgICB2YXIgc3RyaWRlID0gZGF0YS5zdHJpZGVcbiAgICAgIHZhciBvZmZzZXQgPSBkYXRhLm9mZnNldFxuXG4gICAgICB2YXIgc2hhcGVYID0gMFxuICAgICAgdmFyIHNoYXBlWSA9IDBcbiAgICAgIHZhciBzdHJpZGVYID0gMFxuICAgICAgdmFyIHN0cmlkZVkgPSAwXG4gICAgICBpZiAoc2hhcGUubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICAgIHNoYXBlWSA9IDFcbiAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgICBzdHJpZGVZID0gMFxuICAgICAgfSBlbHNlIGlmIChzaGFwZS5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgc2hhcGVYID0gc2hhcGVbMF1cbiAgICAgICAgc2hhcGVZID0gc2hhcGVbMV1cbiAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgICBzdHJpZGVZID0gc3RyaWRlWzFdXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgIH1cblxuICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgdHlwZWRBcnJheUNvZGUoZGF0YS5kYXRhKSB8fCBHTF9GTE9BVFxuICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IHNoYXBlWVxuXG4gICAgICB2YXIgdHJhbnNwb3NlRGF0YSA9IHBvb2wuYWxsb2NUeXBlKGJ1ZmZlci5kdHlwZSwgc2hhcGVYICogc2hhcGVZKVxuICAgICAgdHJhbnNwb3NlKHRyYW5zcG9zZURhdGEsXG4gICAgICAgIGRhdGEuZGF0YSxcbiAgICAgICAgc2hhcGVYLCBzaGFwZVksXG4gICAgICAgIHN0cmlkZVgsIHN0cmlkZVksXG4gICAgICAgIG9mZnNldClcbiAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIHRyYW5zcG9zZURhdGEsIHVzYWdlKVxuICAgICAgcG9vbC5mcmVlVHlwZSh0cmFuc3Bvc2VEYXRhKVxuICAgIH0gZWxzZSB7XG4gICAgICBcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95IChidWZmZXIpIHtcbiAgICB2YXIgaGFuZGxlID0gYnVmZmVyLmJ1ZmZlclxuICAgIFxuICAgIGlmIChnbC5pc0J1ZmZlcihoYW5kbGUpKSB7XG4gICAgICBnbC5kZWxldGVCdWZmZXIoaGFuZGxlKVxuICAgIH1cbiAgICBidWZmZXIuYnVmZmVyID0gbnVsbFxuICAgIGRlbGV0ZSBidWZmZXJTZXRbYnVmZmVyLmlkXVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlQnVmZmVyIChvcHRpb25zLCB0eXBlLCBkZWZlckluaXQpIHtcbiAgICB2YXIgYnVmZmVyID0gbmV3IFJFR0xCdWZmZXIodHlwZSlcbiAgICBidWZmZXJTZXRbYnVmZmVyLmlkXSA9IGJ1ZmZlclxuXG4gICAgZnVuY3Rpb24gcmVnbEJ1ZmZlciAob3B0aW9ucykge1xuICAgICAgdmFyIHVzYWdlID0gR0xfU1RBVElDX0RSQVdcbiAgICAgIHZhciBkYXRhID0gbnVsbFxuICAgICAgdmFyIGJ5dGVMZW5ndGggPSAwXG4gICAgICB2YXIgZHR5cGUgPSAwXG4gICAgICB2YXIgZGltZW5zaW9uID0gMVxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICBpc1R5cGVkQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICBpc05EQXJyYXlMaWtlKG9wdGlvbnMpKSB7XG4gICAgICAgIGRhdGEgPSBvcHRpb25zXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnbnVtYmVyJykge1xuICAgICAgICBieXRlTGVuZ3RoID0gb3B0aW9ucyB8IDBcbiAgICAgIH0gZWxzZSBpZiAob3B0aW9ucykge1xuICAgICAgICBcblxuICAgICAgICBpZiAoJ2RhdGEnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBcbiAgICAgICAgICBkYXRhID0gb3B0aW9ucy5kYXRhXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ3VzYWdlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgXG4gICAgICAgICAgdXNhZ2UgPSB1c2FnZVR5cGVzW29wdGlvbnMudXNhZ2VdXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ3R5cGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBcbiAgICAgICAgICBkdHlwZSA9IGJ1ZmZlclR5cGVzW29wdGlvbnMudHlwZV1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnZGltZW5zaW9uJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgXG4gICAgICAgICAgZGltZW5zaW9uID0gb3B0aW9ucy5kaW1lbnNpb24gfCAwXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2xlbmd0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIFxuICAgICAgICAgIGJ5dGVMZW5ndGggPSBvcHRpb25zLmxlbmd0aCB8IDBcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBidWZmZXIuYmluZCgpXG4gICAgICBpZiAoIWRhdGEpIHtcbiAgICAgICAgZ2wuYnVmZmVyRGF0YShidWZmZXIudHlwZSwgYnl0ZUxlbmd0aCwgdXNhZ2UpXG4gICAgICAgIGJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgICAgYnVmZmVyLnVzYWdlID0gdXNhZ2VcbiAgICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IGRpbWVuc2lvblxuICAgICAgICBidWZmZXIuYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGhcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGluaXRCdWZmZXJGcm9tRGF0YShidWZmZXIsIGRhdGEsIHVzYWdlLCBkdHlwZSwgZGltZW5zaW9uKVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVnbEJ1ZmZlclxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNldFN1YkRhdGEgKGRhdGEsIG9mZnNldCkge1xuICAgICAgXG4gICAgICBnbC5idWZmZXJTdWJEYXRhKGJ1ZmZlci50eXBlLCBvZmZzZXQsIGRhdGEpXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3ViZGF0YSAoZGF0YSwgb2Zmc2V0Xykge1xuICAgICAgdmFyIG9mZnNldCA9IChvZmZzZXRfIHx8IDApIHwgMFxuICAgICAgYnVmZmVyLmJpbmQoKVxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcbiAgICAgICAgaWYgKGRhdGEubGVuZ3RoID4gMCAmJiBBcnJheS5pc0FycmF5KGRhdGFbMF0pKSB7XG4gICAgICAgICAgdmFyIGRpbWVuc2lvbiA9IGRhdGFbMF0ubGVuZ3RoXG4gICAgICAgICAgdmFyIGZsYXREYXRhID0gcG9vbC5hbGxvY1R5cGUoYnVmZmVyLmR0eXBlLCBkYXRhLmxlbmd0aCAqIGRpbWVuc2lvbilcbiAgICAgICAgICBmbGF0dGVuKGZsYXREYXRhLCBkYXRhLCBkaW1lbnNpb24pXG4gICAgICAgICAgc2V0U3ViRGF0YShmbGF0RGF0YSwgb2Zmc2V0KVxuICAgICAgICAgIHBvb2wuZnJlZVR5cGUoZmxhdERhdGEpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFyIGNvbnZlcnRlZCA9IHBvb2wuYWxsb2NUeXBlKGJ1ZmZlci5kdHlwZSwgZGF0YS5sZW5ndGgpXG4gICAgICAgICAgY29weUFycmF5KGNvbnZlcnRlZCwgZGF0YSlcbiAgICAgICAgICBzZXRTdWJEYXRhKGNvbnZlcnRlZCwgb2Zmc2V0KVxuICAgICAgICAgIHBvb2wuZnJlZVR5cGUoY29udmVydGVkKVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGlzVHlwZWRBcnJheShkYXRhKSkge1xuICAgICAgICBzZXRTdWJEYXRhKGRhdGEsIG9mZnNldClcbiAgICAgIH0gZWxzZSBpZiAoaXNOREFycmF5TGlrZShkYXRhKSkge1xuICAgICAgICB2YXIgc2hhcGUgPSBkYXRhLnNoYXBlXG4gICAgICAgIHZhciBzdHJpZGUgPSBkYXRhLnN0cmlkZVxuXG4gICAgICAgIHZhciBzaGFwZVggPSAwXG4gICAgICAgIHZhciBzaGFwZVkgPSAwXG4gICAgICAgIHZhciBzdHJpZGVYID0gMFxuICAgICAgICB2YXIgc3RyaWRlWSA9IDBcbiAgICAgICAgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICAgICAgc2hhcGVZID0gMVxuICAgICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgICBzdHJpZGVZID0gMFxuICAgICAgICB9IGVsc2UgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICAgICAgc2hhcGVZID0gc2hhcGVbMV1cbiAgICAgICAgICBzdHJpZGVYID0gc3RyaWRlWzBdXG4gICAgICAgICAgc3RyaWRlWSA9IHN0cmlkZVsxXVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICAgIHZhciBkdHlwZSA9IEFycmF5LmlzQXJyYXkoZGF0YS5kYXRhKVxuICAgICAgICAgID8gYnVmZmVyLmR0eXBlXG4gICAgICAgICAgOiB0eXBlZEFycmF5Q29kZShkYXRhLmRhdGEpXG5cbiAgICAgICAgdmFyIHRyYW5zcG9zZURhdGEgPSBwb29sLmFsbG9jVHlwZShkdHlwZSwgc2hhcGVYICogc2hhcGVZKVxuICAgICAgICB0cmFuc3Bvc2UodHJhbnNwb3NlRGF0YSxcbiAgICAgICAgICBkYXRhLmRhdGEsXG4gICAgICAgICAgc2hhcGVYLCBzaGFwZVksXG4gICAgICAgICAgc3RyaWRlWCwgc3RyaWRlWSxcbiAgICAgICAgICBkYXRhLm9mZnNldClcbiAgICAgICAgc2V0U3ViRGF0YSh0cmFuc3Bvc2VEYXRhLCBvZmZzZXQpXG4gICAgICAgIHBvb2wuZnJlZVR5cGUodHJhbnNwb3NlRGF0YSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlZ2xCdWZmZXJcbiAgICB9XG5cbiAgICBpZiAoIWRlZmVySW5pdCkge1xuICAgICAgcmVnbEJ1ZmZlcihvcHRpb25zKVxuICAgIH1cblxuICAgIHJlZ2xCdWZmZXIuX3JlZ2xUeXBlID0gJ2J1ZmZlcidcbiAgICByZWdsQnVmZmVyLl9idWZmZXIgPSBidWZmZXJcbiAgICByZWdsQnVmZmVyLnN1YmRhdGEgPSBzdWJkYXRhXG4gICAgcmVnbEJ1ZmZlci5kZXN0cm95ID0gZnVuY3Rpb24gKCkgeyBkZXN0cm95KGJ1ZmZlcikgfVxuXG4gICAgcmV0dXJuIHJlZ2xCdWZmZXJcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVCdWZmZXIsXG5cbiAgICBjcmVhdGVTdHJlYW06IGNyZWF0ZVN0cmVhbSxcbiAgICBkZXN0cm95U3RyZWFtOiBkZXN0cm95U3RyZWFtLFxuXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhbHVlcyhidWZmZXJTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgICB9LFxuXG4gICAgZ2V0QnVmZmVyOiBmdW5jdGlvbiAod3JhcHBlcikge1xuICAgICAgaWYgKHdyYXBwZXIgJiYgd3JhcHBlci5fYnVmZmVyIGluc3RhbmNlb2YgUkVHTEJ1ZmZlcikge1xuICAgICAgICByZXR1cm4gd3JhcHBlci5fYnVmZmVyXG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH0sXG5cbiAgICBfaW5pdEJ1ZmZlcjogaW5pdEJ1ZmZlckZyb21EYXRhXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJbb2JqZWN0IEludDhBcnJheV1cIjogNTEyMFxuLCBcIltvYmplY3QgSW50MTZBcnJheV1cIjogNTEyMlxuLCBcIltvYmplY3QgSW50MzJBcnJheV1cIjogNTEyNFxuLCBcIltvYmplY3QgVWludDhBcnJheV1cIjogNTEyMVxuLCBcIltvYmplY3QgVWludDhDbGFtcGVkQXJyYXldXCI6IDUxMjFcbiwgXCJbb2JqZWN0IFVpbnQxNkFycmF5XVwiOiA1MTIzXG4sIFwiW29iamVjdCBVaW50MzJBcnJheV1cIjogNTEyNVxuLCBcIltvYmplY3QgRmxvYXQzMkFycmF5XVwiOiA1MTI2XG4sIFwiW29iamVjdCBGbG9hdDY0QXJyYXldXCI6IDUxMjFcbiwgXCJbb2JqZWN0IEFycmF5QnVmZmVyXVwiOiA1MTIxXG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwiaW50OFwiOiA1MTIwXG4sIFwiaW50MTZcIjogNTEyMlxuLCBcImludDMyXCI6IDUxMjRcbiwgXCJ1aW50OFwiOiA1MTIxXG4sIFwidWludDE2XCI6IDUxMjNcbiwgXCJ1aW50MzJcIjogNTEyNVxuLCBcImZsb2F0XCI6IDUxMjZcbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJwb2ludHNcIjogMCxcbiAgXCJwb2ludFwiOiAwLFxuICBcImxpbmVzXCI6IDEsXG4gIFwibGluZVwiOiAxLFxuICBcImxpbmUgbG9vcFwiOiAyLFxuICBcImxpbmUgc3RyaXBcIjogMyxcbiAgXCJ0cmlhbmdsZXNcIjogNCxcbiAgXCJ0cmlhbmdsZVwiOiA0LFxuICBcInRyaWFuZ2xlIHN0cmlwXCI6IDUsXG4gIFwidHJpYW5nbGUgZmFuXCI6IDZcbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJzdGF0aWNcIjogMzUwNDQsXG4gIFwiZHluYW1pY1wiOiAzNTA0OCxcbiAgXCJzdHJlYW1cIjogMzUwNDBcbn1cbiIsIlxudmFyIGNyZWF0ZUVudmlyb25tZW50ID0gcmVxdWlyZSgnLi91dGlsL2NvZGVnZW4nKVxudmFyIGxvb3AgPSByZXF1aXJlKCcuL3V0aWwvbG9vcCcpXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtbmRhcnJheScpXG5cbnZhciBwcmltVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9wcmltaXRpdmVzLmpzb24nKVxudmFyIGdsVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9kdHlwZXMuanNvbicpXG5cbi8vIFwiY3V0ZVwiIG5hbWVzIGZvciB2ZWN0b3IgY29tcG9uZW50c1xudmFyIENVVEVfQ09NUE9ORU5UUyA9ICd4eXp3Jy5zcGxpdCgnJylcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG5cbnZhciBBVFRSSUJfU1RBVEVfUE9JTlRFUiA9IDFcbnZhciBBVFRSSUJfU1RBVEVfQ09OU1RBTlQgPSAyXG5cbnZhciBEWU5fRlVOQyA9IDBcbnZhciBEWU5fUFJPUCA9IDFcbnZhciBEWU5fQ09OVEVYVCA9IDJcbnZhciBEWU5fU1RBVEUgPSAzXG5cbnZhciBTX0RJVEhFUiA9ICdkaXRoZXInXG52YXIgU19CTEVORF9FTkFCTEUgPSAnYmxlbmQuZW5hYmxlJ1xudmFyIFNfQkxFTkRfQ09MT1IgPSAnYmxlbmQuY29sb3InXG52YXIgU19CTEVORF9FUVVBVElPTiA9ICdibGVuZC5lcXVhdGlvbidcbnZhciBTX0JMRU5EX0ZVTkMgPSAnYmxlbmQuZnVuYydcbnZhciBTX0RFUFRIX0VOQUJMRSA9ICdkZXB0aC5lbmFibGUnXG52YXIgU19ERVBUSF9GVU5DID0gJ2RlcHRoLmZ1bmMnXG52YXIgU19ERVBUSF9SQU5HRSA9ICdkZXB0aC5yYW5nZSdcbnZhciBTX0RFUFRIX01BU0sgPSAnZGVwdGgubWFzaydcbnZhciBTX0NPTE9SX01BU0sgPSAnY29sb3JNYXNrJ1xudmFyIFNfQ1VMTF9FTkFCTEUgPSAnY3VsbC5lbmFibGUnXG52YXIgU19DVUxMX0ZBQ0UgPSAnY3VsbC5mYWNlJ1xudmFyIFNfRlJPTlRfRkFDRSA9ICdmcm9udEZhY2UnXG52YXIgU19MSU5FX1dJRFRIID0gJ2xpbmVXaWR0aCdcbnZhciBTX1BPTFlHT05fT0ZGU0VUX0VOQUJMRSA9ICdwb2x5Z29uT2Zmc2V0LmVuYWJsZSdcbnZhciBTX1BPTFlHT05fT0ZGU0VUX09GRlNFVCA9ICdwb2x5Z29uT2Zmc2V0Lm9mZnNldCdcbnZhciBTX1NBTVBMRV9BTFBIQSA9ICdzYW1wbGUuYWxwaGEnXG52YXIgU19TQU1QTEVfRU5BQkxFID0gJ3NhbXBsZS5lbmFibGUnXG52YXIgU19TQU1QTEVfQ09WRVJBR0UgPSAnc2FtcGxlLmNvdmVyYWdlJ1xudmFyIFNfU1RFTkNJTF9FTkFCTEUgPSAnc3RlbmNpbC5lbmFibGUnXG52YXIgU19TVEVOQ0lMX01BU0sgPSAnc3RlbmNpbC5tYXNrJ1xudmFyIFNfU1RFTkNJTF9GVU5DID0gJ3N0ZW5jaWwuZnVuYydcbnZhciBTX1NURU5DSUxfT1BGUk9OVCA9ICdzdGVuY2lsLm9wRnJvbnQnXG52YXIgU19TVEVOQ0lMX09QQkFDSyA9ICdzdGVuY2lsLm9wQmFjaydcbnZhciBTX1NDSVNTT1JfRU5BQkxFID0gJ3NjaXNzb3IuZW5hYmxlJ1xudmFyIFNfU0NJU1NPUl9CT1ggPSAnc2Npc3Nvci5ib3gnXG52YXIgU19WSUVXUE9SVCA9ICd2aWV3cG9ydCdcblxudmFyIFNfRlJBTUVCVUZGRVIgPSAnZnJhbWVidWZmZXInXG52YXIgU19WRVJUID0gJ3ZlcnQnXG52YXIgU19GUkFHID0gJ2ZyYWcnXG52YXIgU19FTEVNRU5UUyA9ICdlbGVtZW50cydcbnZhciBTX1BSSU1JVElWRSA9ICdwcmltaXRpdmUnXG52YXIgU19DT1VOVCA9ICdjb3VudCdcbnZhciBTX09GRlNFVCA9ICdvZmZzZXQnXG52YXIgU19JTlNUQU5DRVMgPSAnaW5zdGFuY2VzJ1xuXG52YXIgU1VGRklYX1dJRFRIID0gJ1dpZHRoJ1xudmFyIFNVRkZJWF9IRUlHSFQgPSAnSGVpZ2h0J1xuXG52YXIgU19GUkFNRUJVRkZFUl9XSURUSCA9IFNfRlJBTUVCVUZGRVIgKyBTVUZGSVhfV0lEVEhcbnZhciBTX0ZSQU1FQlVGRkVSX0hFSUdIVCA9IFNfRlJBTUVCVUZGRVIgKyBTVUZGSVhfSEVJR0hUXG52YXIgU19WSUVXUE9SVF9XSURUSCA9IFNfVklFV1BPUlQgKyBTVUZGSVhfV0lEVEhcbnZhciBTX1ZJRVdQT1JUX0hFSUdIVCA9IFNfVklFV1BPUlQgKyBTVUZGSVhfSEVJR0hUXG52YXIgU19EUkFXSU5HQlVGRkVSID0gJ2RyYXdpbmdCdWZmZXInXG52YXIgU19EUkFXSU5HQlVGRkVSX1dJRFRIID0gU19EUkFXSU5HQlVGRkVSICsgU1VGRklYX1dJRFRIXG52YXIgU19EUkFXSU5HQlVGRkVSX0hFSUdIVCA9IFNfRFJBV0lOR0JVRkZFUiArIFNVRkZJWF9IRUlHSFRcblxudmFyIEdMX0FSUkFZX0JVRkZFUiA9IDM0OTYyXG52YXIgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIgPSAzNDk2M1xuXG52YXIgR0xfRlJBR01FTlRfU0hBREVSID0gMzU2MzJcbnZhciBHTF9WRVJURVhfU0hBREVSID0gMzU2MzNcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQID0gMHg4NTEzXG5cbnZhciBHTF9DVUxMX0ZBQ0UgPSAweDBCNDRcbnZhciBHTF9CTEVORCA9IDB4MEJFMlxudmFyIEdMX0RJVEhFUiA9IDB4MEJEMFxudmFyIEdMX1NURU5DSUxfVEVTVCA9IDB4MEI5MFxudmFyIEdMX0RFUFRIX1RFU1QgPSAweDBCNzFcbnZhciBHTF9TQ0lTU09SX1RFU1QgPSAweDBDMTFcbnZhciBHTF9QT0xZR09OX09GRlNFVF9GSUxMID0gMHg4MDM3XG52YXIgR0xfU0FNUExFX0FMUEhBX1RPX0NPVkVSQUdFID0gMHg4MDlFXG52YXIgR0xfU0FNUExFX0NPVkVSQUdFID0gMHg4MEEwXG5cbnZhciBHTF9GTE9BVCA9IDUxMjZcbnZhciBHTF9GTE9BVF9WRUMyID0gMzU2NjRcbnZhciBHTF9GTE9BVF9WRUMzID0gMzU2NjVcbnZhciBHTF9GTE9BVF9WRUM0ID0gMzU2NjZcbnZhciBHTF9JTlQgPSA1MTI0XG52YXIgR0xfSU5UX1ZFQzIgPSAzNTY2N1xudmFyIEdMX0lOVF9WRUMzID0gMzU2NjhcbnZhciBHTF9JTlRfVkVDNCA9IDM1NjY5XG52YXIgR0xfQk9PTCA9IDM1NjcwXG52YXIgR0xfQk9PTF9WRUMyID0gMzU2NzFcbnZhciBHTF9CT09MX1ZFQzMgPSAzNTY3MlxudmFyIEdMX0JPT0xfVkVDNCA9IDM1NjczXG52YXIgR0xfRkxPQVRfTUFUMiA9IDM1Njc0XG52YXIgR0xfRkxPQVRfTUFUMyA9IDM1Njc1XG52YXIgR0xfRkxPQVRfTUFUNCA9IDM1Njc2XG52YXIgR0xfU0FNUExFUl8yRCA9IDM1Njc4XG52YXIgR0xfU0FNUExFUl9DVUJFID0gMzU2ODBcblxudmFyIEdMX1RSSUFOR0xFUyA9IDRcblxudmFyIEdMX0ZST05UID0gMTAyOFxudmFyIEdMX0JBQ0sgPSAxMDI5XG52YXIgR0xfQ1cgPSAweDA5MDBcbnZhciBHTF9DQ1cgPSAweDA5MDFcbnZhciBHTF9NSU5fRVhUID0gMHg4MDA3XG52YXIgR0xfTUFYX0VYVCA9IDB4ODAwOFxudmFyIEdMX0FMV0FZUyA9IDUxOVxudmFyIEdMX0tFRVAgPSA3NjgwXG52YXIgR0xfWkVSTyA9IDBcbnZhciBHTF9PTkUgPSAxXG52YXIgR0xfRlVOQ19BREQgPSAweDgwMDZcbnZhciBHTF9MRVNTID0gNTEzXG5cbnZhciBHTF9GUkFNRUJVRkZFUiA9IDB4OEQ0MFxudmFyIEdMX0NPTE9SX0FUVEFDSE1FTlQwID0gMHg4Q0UwXG5cbnZhciBibGVuZEZ1bmNzID0ge1xuICAnMCc6IDAsXG4gICcxJzogMSxcbiAgJ3plcm8nOiAwLFxuICAnb25lJzogMSxcbiAgJ3NyYyBjb2xvcic6IDc2OCxcbiAgJ29uZSBtaW51cyBzcmMgY29sb3InOiA3NjksXG4gICdzcmMgYWxwaGEnOiA3NzAsXG4gICdvbmUgbWludXMgc3JjIGFscGhhJzogNzcxLFxuICAnZHN0IGNvbG9yJzogNzc0LFxuICAnb25lIG1pbnVzIGRzdCBjb2xvcic6IDc3NSxcbiAgJ2RzdCBhbHBoYSc6IDc3MixcbiAgJ29uZSBtaW51cyBkc3QgYWxwaGEnOiA3NzMsXG4gICdjb25zdGFudCBjb2xvcic6IDMyNzY5LFxuICAnb25lIG1pbnVzIGNvbnN0YW50IGNvbG9yJzogMzI3NzAsXG4gICdjb25zdGFudCBhbHBoYSc6IDMyNzcxLFxuICAnb25lIG1pbnVzIGNvbnN0YW50IGFscGhhJzogMzI3NzIsXG4gICdzcmMgYWxwaGEgc2F0dXJhdGUnOiA3NzZcbn1cblxudmFyIGNvbXBhcmVGdW5jcyA9IHtcbiAgJ25ldmVyJzogNTEyLFxuICAnbGVzcyc6IDUxMyxcbiAgJzwnOiA1MTMsXG4gICdlcXVhbCc6IDUxNCxcbiAgJz0nOiA1MTQsXG4gICc9PSc6IDUxNCxcbiAgJz09PSc6IDUxNCxcbiAgJ2xlcXVhbCc6IDUxNSxcbiAgJzw9JzogNTE1LFxuICAnZ3JlYXRlcic6IDUxNixcbiAgJz4nOiA1MTYsXG4gICdub3RlcXVhbCc6IDUxNyxcbiAgJyE9JzogNTE3LFxuICAnIT09JzogNTE3LFxuICAnZ2VxdWFsJzogNTE4LFxuICAnPj0nOiA1MTgsXG4gICdhbHdheXMnOiA1MTlcbn1cblxudmFyIHN0ZW5jaWxPcHMgPSB7XG4gICcwJzogMCxcbiAgJ3plcm8nOiAwLFxuICAna2VlcCc6IDc2ODAsXG4gICdyZXBsYWNlJzogNzY4MSxcbiAgJ2luY3JlbWVudCc6IDc2ODIsXG4gICdkZWNyZW1lbnQnOiA3NjgzLFxuICAnaW5jcmVtZW50IHdyYXAnOiAzNDA1NSxcbiAgJ2RlY3JlbWVudCB3cmFwJzogMzQwNTYsXG4gICdpbnZlcnQnOiA1Mzg2XG59XG5cbnZhciBzaGFkZXJUeXBlID0ge1xuICAnZnJhZyc6IEdMX0ZSQUdNRU5UX1NIQURFUixcbiAgJ3ZlcnQnOiBHTF9WRVJURVhfU0hBREVSXG59XG5cbnZhciBvcmllbnRhdGlvblR5cGUgPSB7XG4gICdjdyc6IEdMX0NXLFxuICAnY2N3JzogR0xfQ0NXXG59XG5cbmZ1bmN0aW9uIGlzQnVmZmVyQXJncyAoeCkge1xuICByZXR1cm4gQXJyYXkuaXNBcnJheSh4KSB8fFxuICAgIGlzVHlwZWRBcnJheSh4KSB8fFxuICAgIGlzTkRBcnJheSh4KVxufVxuXG4vLyBNYWtlIHN1cmUgdmlld3BvcnQgaXMgcHJvY2Vzc2VkIGZpcnN0XG5mdW5jdGlvbiBzb3J0U3RhdGUgKHN0YXRlKSB7XG4gIHJldHVybiBzdGF0ZS5zb3J0KGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgaWYgKGEgPT09IFNfVklFV1BPUlQpIHtcbiAgICAgIHJldHVybiAtMVxuICAgIH0gZWxzZSBpZiAoYiA9PT0gU19WSUVXUE9SVCkge1xuICAgICAgcmV0dXJuIDFcbiAgICB9XG4gICAgcmV0dXJuIChhIDwgYikgPyAtMSA6IDFcbiAgfSlcbn1cblxuZnVuY3Rpb24gRGVjbGFyYXRpb24gKHRoaXNEZXAsIGNvbnRleHREZXAsIHByb3BEZXAsIGFwcGVuZCkge1xuICB0aGlzLnRoaXNEZXAgPSB0aGlzRGVwXG4gIHRoaXMuY29udGV4dERlcCA9IGNvbnRleHREZXBcbiAgdGhpcy5wcm9wRGVwID0gcHJvcERlcFxuICB0aGlzLmFwcGVuZCA9IGFwcGVuZFxufVxuXG5mdW5jdGlvbiBpc1N0YXRpYyAoZGVjbCkge1xuICByZXR1cm4gZGVjbCAmJiAhKGRlY2wudGhpc0RlcCB8fCBkZWNsLmNvbnRleHREZXAgfHwgZGVjbC5wcm9wRGVwKVxufVxuXG5mdW5jdGlvbiBjcmVhdGVTdGF0aWNEZWNsIChhcHBlbmQpIHtcbiAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihmYWxzZSwgZmFsc2UsIGZhbHNlLCBhcHBlbmQpXG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUR5bmFtaWNEZWNsIChkeW4sIGFwcGVuZCkge1xuICB2YXIgdHlwZSA9IGR5bi50eXBlXG4gIGlmICh0eXBlID09PSBEWU5fRlVOQykge1xuICAgIHZhciBudW1BcmdzID0gZHluLmRhdGEubGVuZ3RoXG4gICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgIHRydWUsXG4gICAgICBudW1BcmdzID49IDEsXG4gICAgICBudW1BcmdzID49IDIsXG4gICAgICBhcHBlbmQpXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgIHR5cGUgPT09IERZTl9TVEFURSxcbiAgICAgIHR5cGUgPT09IERZTl9DT05URVhULFxuICAgICAgdHlwZSA9PT0gRFlOX1BST1AsXG4gICAgICBhcHBlbmQpXG4gIH1cbn1cblxudmFyIFNDT1BFX0RFQ0wgPSBuZXcgRGVjbGFyYXRpb24oZmFsc2UsIGZhbHNlLCBmYWxzZSwgZnVuY3Rpb24gKCkge30pXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVnbENvcmUgKFxuICBnbCxcbiAgc3RyaW5nU3RvcmUsXG4gIGV4dGVuc2lvbnMsXG4gIGxpbWl0cyxcbiAgYnVmZmVyU3RhdGUsXG4gIGVsZW1lbnRTdGF0ZSxcbiAgdGV4dHVyZVN0YXRlLFxuICBmcmFtZWJ1ZmZlclN0YXRlLFxuICB1bmlmb3JtU3RhdGUsXG4gIGF0dHJpYnV0ZVN0YXRlLFxuICBzaGFkZXJTdGF0ZSxcbiAgZHJhd1N0YXRlLFxuICBjb250ZXh0U3RhdGUpIHtcbiAgdmFyIEF0dHJpYnV0ZVJlY29yZCA9IGF0dHJpYnV0ZVN0YXRlLlJlY29yZFxuXG4gIHZhciBibGVuZEVxdWF0aW9ucyA9IHtcbiAgICAnYWRkJzogMzI3NzQsXG4gICAgJ3N1YnRyYWN0JzogMzI3NzgsXG4gICAgJ3JldmVyc2Ugc3VidHJhY3QnOiAzMjc3OVxuICB9XG4gIGlmIChleHRlbnNpb25zLmV4dF9ibGVuZF9taW5tYXgpIHtcbiAgICBibGVuZEVxdWF0aW9ucy5taW4gPSBHTF9NSU5fRVhUXG4gICAgYmxlbmRFcXVhdGlvbnMubWF4ID0gR0xfTUFYX0VYVFxuICB9XG5cbiAgdmFyIGV4dEluc3RhbmNpbmcgPSBleHRlbnNpb25zLmFuZ2xlX2luc3RhbmNlZF9hcnJheXNcbiAgdmFyIGV4dERyYXdCdWZmZXJzID0gZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnNcblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFdFQkdMIFNUQVRFXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgdmFyIGN1cnJlbnRTdGF0ZSA9IHtcbiAgICBkaXJ0eTogdHJ1ZVxuICB9XG4gIHZhciBuZXh0U3RhdGUgPSB7fVxuICB2YXIgR0xfU1RBVEVfTkFNRVMgPSBbXVxuICB2YXIgR0xfRkxBR1MgPSB7fVxuICB2YXIgR0xfVkFSSUFCTEVTID0ge31cblxuICBmdW5jdGlvbiBwcm9wTmFtZSAobmFtZSkge1xuICAgIHJldHVybiBuYW1lLnJlcGxhY2UoJy4nLCAnXycpXG4gIH1cblxuICBmdW5jdGlvbiBzdGF0ZUZsYWcgKHNuYW1lLCBjYXAsIGluaXQpIHtcbiAgICB2YXIgbmFtZSA9IHByb3BOYW1lKHNuYW1lKVxuICAgIEdMX1NUQVRFX05BTUVTLnB1c2goc25hbWUpXG4gICAgbmV4dFN0YXRlW25hbWVdID0gY3VycmVudFN0YXRlW25hbWVdID0gISFpbml0XG4gICAgR0xfRkxBR1NbbmFtZV0gPSBjYXBcbiAgfVxuXG4gIGZ1bmN0aW9uIHN0YXRlVmFyaWFibGUgKHNuYW1lLCBmdW5jLCBpbml0KSB7XG4gICAgdmFyIG5hbWUgPSBwcm9wTmFtZShzbmFtZSlcbiAgICBHTF9TVEFURV9OQU1FUy5wdXNoKHNuYW1lKVxuICAgIGlmIChBcnJheS5pc0FycmF5KGluaXQpKSB7XG4gICAgICBjdXJyZW50U3RhdGVbbmFtZV0gPSBpbml0LnNsaWNlKClcbiAgICAgIG5leHRTdGF0ZVtuYW1lXSA9IGluaXQuc2xpY2UoKVxuICAgIH0gZWxzZSB7XG4gICAgICBjdXJyZW50U3RhdGVbbmFtZV0gPSBuZXh0U3RhdGVbbmFtZV0gPSBpbml0XG4gICAgfVxuICAgIEdMX1ZBUklBQkxFU1tuYW1lXSA9IGZ1bmNcbiAgfVxuXG4gIC8vIERpdGhlcmluZ1xuICBzdGF0ZUZsYWcoU19ESVRIRVIsIEdMX0RJVEhFUilcblxuICAvLyBCbGVuZGluZ1xuICBzdGF0ZUZsYWcoU19CTEVORF9FTkFCTEUsIEdMX0JMRU5EKVxuICBzdGF0ZVZhcmlhYmxlKFNfQkxFTkRfQ09MT1IsICdibGVuZENvbG9yJywgWzAsIDAsIDAsIDBdKVxuICBzdGF0ZVZhcmlhYmxlKFNfQkxFTkRfRVFVQVRJT04sICdibGVuZEVxdWF0aW9uU2VwYXJhdGUnLFxuICAgIFtHTF9GVU5DX0FERCwgR0xfRlVOQ19BRERdKVxuICBzdGF0ZVZhcmlhYmxlKFNfQkxFTkRfRlVOQywgJ2JsZW5kRnVuY1NlcGFyYXRlJyxcbiAgICBbR0xfT05FLCBHTF9aRVJPLCBHTF9PTkUsIEdMX1pFUk9dKVxuXG4gIC8vIERlcHRoXG4gIHN0YXRlRmxhZyhTX0RFUFRIX0VOQUJMRSwgR0xfREVQVEhfVEVTVCwgdHJ1ZSlcbiAgc3RhdGVWYXJpYWJsZShTX0RFUFRIX0ZVTkMsICdkZXB0aEZ1bmMnLCBHTF9MRVNTKVxuICBzdGF0ZVZhcmlhYmxlKFNfREVQVEhfUkFOR0UsICdkZXB0aFJhbmdlJywgWzAsIDFdKVxuICBzdGF0ZVZhcmlhYmxlKFNfREVQVEhfTUFTSywgJ2RlcHRoTWFzaycsIHRydWUpXG5cbiAgLy8gQ29sb3IgbWFza1xuICBzdGF0ZVZhcmlhYmxlKFNfQ09MT1JfTUFTSywgU19DT0xPUl9NQVNLLCBbdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZV0pXG5cbiAgLy8gRmFjZSBjdWxsaW5nXG4gIHN0YXRlRmxhZyhTX0NVTExfRU5BQkxFLCBHTF9DVUxMX0ZBQ0UpXG4gIHN0YXRlVmFyaWFibGUoU19DVUxMX0ZBQ0UsICdjdWxsRmFjZScsIEdMX0JBQ0spXG5cbiAgLy8gRnJvbnQgZmFjZSBvcmllbnRhdGlvblxuICBzdGF0ZVZhcmlhYmxlKFNfRlJPTlRfRkFDRSwgU19GUk9OVF9GQUNFLCBHTF9DQ1cpXG5cbiAgLy8gTGluZSB3aWR0aFxuICBzdGF0ZVZhcmlhYmxlKFNfTElORV9XSURUSCwgU19MSU5FX1dJRFRILCAxKVxuXG4gIC8vIFBvbHlnb24gb2Zmc2V0XG4gIHN0YXRlRmxhZyhTX1BPTFlHT05fT0ZGU0VUX0VOQUJMRSwgR0xfUE9MWUdPTl9PRkZTRVRfRklMTClcbiAgc3RhdGVWYXJpYWJsZShTX1BPTFlHT05fT0ZGU0VUX09GRlNFVCwgJ3BvbHlnb25PZmZzZXQnLCBbMCwgMF0pXG5cbiAgLy8gU2FtcGxlIGNvdmVyYWdlXG4gIHN0YXRlRmxhZyhTX1NBTVBMRV9BTFBIQSwgR0xfU0FNUExFX0FMUEhBX1RPX0NPVkVSQUdFKVxuICBzdGF0ZUZsYWcoU19TQU1QTEVfRU5BQkxFLCBHTF9TQU1QTEVfQ09WRVJBR0UpXG4gIHN0YXRlVmFyaWFibGUoU19TQU1QTEVfQ09WRVJBR0UsICdzYW1wbGVDb3ZlcmFnZScsIFsxLCBmYWxzZV0pXG5cbiAgLy8gU3RlbmNpbFxuICBzdGF0ZUZsYWcoU19TVEVOQ0lMX0VOQUJMRSwgR0xfU1RFTkNJTF9URVNUKVxuICBzdGF0ZVZhcmlhYmxlKFNfU1RFTkNJTF9NQVNLLCAnc3RlbmNpbE1hc2snLCAtMSlcbiAgc3RhdGVWYXJpYWJsZShTX1NURU5DSUxfRlVOQywgJ3N0ZW5jaWxGdW5jJywgW0dMX0FMV0FZUywgMCwgLTFdKVxuICBzdGF0ZVZhcmlhYmxlKFNfU1RFTkNJTF9PUEZST05ULCAnc3RlbmNpbE9wU2VwYXJhdGUnLFxuICAgIFtHTF9GUk9OVCwgR0xfS0VFUCwgR0xfS0VFUCwgR0xfS0VFUF0pXG4gIHN0YXRlVmFyaWFibGUoU19TVEVOQ0lMX09QQkFDSywgJ3N0ZW5jaWxPcFNlcGFyYXRlJyxcbiAgICBbR0xfQkFDSywgR0xfS0VFUCwgR0xfS0VFUCwgR0xfS0VFUF0pXG5cbiAgLy8gU2Npc3NvclxuICBzdGF0ZUZsYWcoU19TQ0lTU09SX0VOQUJMRSwgR0xfU0NJU1NPUl9URVNUKVxuICBzdGF0ZVZhcmlhYmxlKFNfU0NJU1NPUl9CT1gsICdzY2lzc29yJyxcbiAgICBbMCwgMCwgZ2wuZHJhd2luZ0J1ZmZlcldpZHRoLCBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XSlcblxuICAvLyBWaWV3cG9ydFxuICBzdGF0ZVZhcmlhYmxlKFNfVklFV1BPUlQsIFNfVklFV1BPUlQsXG4gICAgWzAsIDAsIGdsLmRyYXdpbmdCdWZmZXJXaWR0aCwgZ2wuZHJhd2luZ0J1ZmZlckhlaWdodF0pXG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBFTlZJUk9OTUVOVFxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBzaGFyZWRTdGF0ZSA9IHtcbiAgICBnbDogZ2wsXG4gICAgY29udGV4dDogY29udGV4dFN0YXRlLFxuICAgIHN0cmluZ3M6IHN0cmluZ1N0b3JlLFxuICAgIG5leHQ6IG5leHRTdGF0ZSxcbiAgICBjdXJyZW50OiBjdXJyZW50U3RhdGUsXG4gICAgZHJhdzogZHJhd1N0YXRlLFxuICAgIGVsZW1lbnRzOiBlbGVtZW50U3RhdGUsXG4gICAgYnVmZmVyOiBidWZmZXJTdGF0ZSxcbiAgICBzaGFkZXI6IHNoYWRlclN0YXRlLFxuICAgIGF0dHJpYnV0ZXM6IGF0dHJpYnV0ZVN0YXRlLnN0YXRlLFxuICAgIHVuaWZvcm1zOiB1bmlmb3JtU3RhdGUsXG4gICAgZnJhbWVidWZmZXI6IGZyYW1lYnVmZmVyU3RhdGUsXG4gICAgZXh0ZW5zaW9uczogZXh0ZW5zaW9ucyxcblxuICAgIGlzQnVmZmVyQXJnczogaXNCdWZmZXJBcmdzXG4gIH1cblxuICB2YXIgc2hhcmVkQ29uc3RhbnRzID0ge1xuICAgIHByaW1UeXBlczogcHJpbVR5cGVzLFxuICAgIGNvbXBhcmVGdW5jczogY29tcGFyZUZ1bmNzLFxuICAgIGJsZW5kRnVuY3M6IGJsZW5kRnVuY3MsXG4gICAgYmxlbmRFcXVhdGlvbnM6IGJsZW5kRXF1YXRpb25zLFxuICAgIHN0ZW5jaWxPcHM6IHN0ZW5jaWxPcHMsXG4gICAgZ2xUeXBlczogZ2xUeXBlcyxcbiAgICBvcmllbnRhdGlvblR5cGU6IG9yaWVudGF0aW9uVHlwZVxuICB9XG5cbiAgaWYgKGV4dERyYXdCdWZmZXJzKSB7XG4gICAgc2hhcmVkQ29uc3RhbnRzLmJhY2tCdWZmZXIgPSBbR0xfQkFDS11cbiAgICBzaGFyZWRDb25zdGFudHMuZHJhd0J1ZmZlciA9IGxvb3AobGltaXRzLm1heERyYXdidWZmZXJzLCBmdW5jdGlvbiAoaSkge1xuICAgICAgcmV0dXJuIGxvb3AoaSwgZnVuY3Rpb24gKGopIHtcbiAgICAgICAgcmV0dXJuIEdMX0NPTE9SX0FUVEFDSE1FTlQwICsgalxuICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgdmFyIGRyYXdDYWxsQ291bnRlciA9IDBcbiAgZnVuY3Rpb24gY3JlYXRlUkVHTEVudmlyb25tZW50ICgpIHtcbiAgICB2YXIgZW52ID0gY3JlYXRlRW52aXJvbm1lbnQoKVxuICAgIHZhciBsaW5rID0gZW52LmxpbmtcbiAgICB2YXIgZ2xvYmFsID0gZW52Lmdsb2JhbFxuICAgIGVudi5pZCA9IGRyYXdDYWxsQ291bnRlcisrXG5cbiAgICBlbnYuYmF0Y2hJZCA9ICcwJ1xuXG4gICAgLy8gbGluayBzaGFyZWQgc3RhdGVcbiAgICB2YXIgU0hBUkVEID0gbGluayhzaGFyZWRTdGF0ZSlcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZCA9IHtcbiAgICAgIHByb3BzOiAnYTAnXG4gICAgfVxuICAgIE9iamVjdC5rZXlzKHNoYXJlZFN0YXRlKS5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICBzaGFyZWRbcHJvcF0gPSBnbG9iYWwuZGVmKFNIQVJFRCwgJy4nLCBwcm9wKVxuICAgIH0pXG5cbiAgICAvLyBJbmplY3QgcnVudGltZSBhc3NlcnRpb24gc3R1ZmYgZm9yIGRlYnVnIGJ1aWxkc1xuICAgIFxuXG4gICAgLy8gQ29weSBHTCBzdGF0ZSB2YXJpYWJsZXMgb3ZlclxuICAgIHZhciBuZXh0VmFycyA9IGVudi5uZXh0ID0ge31cbiAgICB2YXIgY3VycmVudFZhcnMgPSBlbnYuY3VycmVudCA9IHt9XG4gICAgT2JqZWN0LmtleXMoR0xfVkFSSUFCTEVTKS5mb3JFYWNoKGZ1bmN0aW9uICh2YXJpYWJsZSkge1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY3VycmVudFN0YXRlW3ZhcmlhYmxlXSkpIHtcbiAgICAgICAgbmV4dFZhcnNbdmFyaWFibGVdID0gZ2xvYmFsLmRlZihzaGFyZWQubmV4dCwgJy4nLCB2YXJpYWJsZSlcbiAgICAgICAgY3VycmVudFZhcnNbdmFyaWFibGVdID0gZ2xvYmFsLmRlZihzaGFyZWQuY3VycmVudCwgJy4nLCB2YXJpYWJsZSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gSW5pdGlhbGl6ZSBzaGFyZWQgY29uc3RhbnRzXG4gICAgdmFyIGNvbnN0YW50cyA9IGVudi5jb25zdGFudHMgPSB7fVxuICAgIE9iamVjdC5rZXlzKHNoYXJlZENvbnN0YW50cykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgY29uc3RhbnRzW25hbWVdID0gZ2xvYmFsLmRlZihKU09OLnN0cmluZ2lmeShzaGFyZWRDb25zdGFudHNbbmFtZV0pKVxuICAgIH0pXG5cbiAgICAvLyBIZWxwZXIgZnVuY3Rpb24gZm9yIGNhbGxpbmcgYSBibG9ja1xuICAgIGVudi5pbnZva2UgPSBmdW5jdGlvbiAoYmxvY2ssIHgpIHtcbiAgICAgIHN3aXRjaCAoeC50eXBlKSB7XG4gICAgICAgIGNhc2UgRFlOX0ZVTkM6XG4gICAgICAgICAgdmFyIGFyZ0xpc3QgPSBbXG4gICAgICAgICAgICAndGhpcycsXG4gICAgICAgICAgICBzaGFyZWQuY29udGV4dCxcbiAgICAgICAgICAgIHNoYXJlZC5wcm9wcyxcbiAgICAgICAgICAgIGVudi5iYXRjaElkXG4gICAgICAgICAgXVxuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoXG4gICAgICAgICAgICBsaW5rKHguZGF0YSksICcuY2FsbCgnLFxuICAgICAgICAgICAgICBhcmdMaXN0LnNsaWNlKDAsIE1hdGgubWF4KHguZGF0YS5sZW5ndGggKyAxLCA0KSksXG4gICAgICAgICAgICAgJyknKVxuICAgICAgICBjYXNlIERZTl9QUk9QOlxuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoc2hhcmVkLnByb3BzLCB4LmRhdGEpXG4gICAgICAgIGNhc2UgRFlOX0NPTlRFWFQ6XG4gICAgICAgICAgcmV0dXJuIGJsb2NrLmRlZihzaGFyZWQuY29udGV4dCwgeC5kYXRhKVxuICAgICAgICBjYXNlIERZTl9TVEFURTpcbiAgICAgICAgICByZXR1cm4gYmxvY2suZGVmKCd0aGlzJywgeC5kYXRhKVxuICAgICAgfVxuICAgIH1cblxuICAgIGVudi5hdHRyaWJDYWNoZSA9IHt9XG5cbiAgICB2YXIgc2NvcGVBdHRyaWJzID0ge31cbiAgICBlbnYuc2NvcGVBdHRyaWIgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIGlkID0gc3RyaW5nU3RvcmUuaWQobmFtZSlcbiAgICAgIGlmIChpZCBpbiBzY29wZUF0dHJpYnMpIHtcbiAgICAgICAgcmV0dXJuIHNjb3BlQXR0cmlic1tpZF1cbiAgICAgIH1cbiAgICAgIHZhciBiaW5kaW5nID0gYXR0cmlidXRlU3RhdGUuc2NvcGVbaWRdXG4gICAgICBpZiAoIWJpbmRpbmcpIHtcbiAgICAgICAgYmluZGluZyA9IGF0dHJpYnV0ZVN0YXRlLnNjb3BlW2lkXSA9IG5ldyBBdHRyaWJ1dGVSZWNvcmQoKVxuICAgICAgfVxuICAgICAgdmFyIHJlc3VsdCA9IHNjb3BlQXR0cmlic1tpZF0gPSBsaW5rKGJpbmRpbmcpXG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuXG4gICAgcmV0dXJuIGVudlxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBQQVJTSU5HXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gcGFyc2VGcmFtZWJ1ZmZlciAob3B0aW9ucykge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIGlmIChTX0ZSQU1FQlVGRkVSIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgIHZhciBmcmFtZWJ1ZmZlciA9IHN0YXRpY09wdGlvbnNbU19GUkFNRUJVRkZFUl1cbiAgICAgIGlmIChmcmFtZWJ1ZmZlcikge1xuICAgICAgICBmcmFtZWJ1ZmZlciA9IGZyYW1lYnVmZmVyU3RhdGUuZ2V0RnJhbWVidWZmZXIoZnJhbWVidWZmZXIpXG4gICAgICAgIFxuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBibG9jaykge1xuICAgICAgICAgIHZhciBGUkFNRUJVRkZFUiA9IGVudi5saW5rKGZyYW1lYnVmZmVyKVxuICAgICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgICAgICAgYmxvY2suc2V0KFxuICAgICAgICAgICAgc2hhcmVkLmZyYW1lYnVmZmVyLFxuICAgICAgICAgICAgJy5uZXh0JyxcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSKVxuICAgICAgICAgIHZhciBDT05URVhUID0gc2hhcmVkLmNvbnRleHRcbiAgICAgICAgICBibG9jay5zZXQoXG4gICAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9XSURUSCxcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSICsgJy53aWR0aCcpXG4gICAgICAgICAgYmxvY2suc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfSEVJR0hULFxuICAgICAgICAgICAgRlJBTUVCVUZGRVIgKyAnLmhlaWdodCcpXG4gICAgICAgICAgcmV0dXJuIEZSQU1FQlVGRkVSXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgICAgc2hhcmVkLmZyYW1lYnVmZmVyLFxuICAgICAgICAgICAgJy5uZXh0JyxcbiAgICAgICAgICAgICdudWxsJylcbiAgICAgICAgICB2YXIgQ09OVEVYVCA9IHNoYXJlZC5jb250ZXh0XG4gICAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfV0lEVEgsXG4gICAgICAgICAgICBDT05URVhUICsgJy4nICsgU19EUkFXSU5HQlVGRkVSX1dJRFRIKVxuICAgICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX0hFSUdIVCxcbiAgICAgICAgICAgIENPTlRFWFQgKyAnLicgKyBTX0RSQVdJTkdCVUZGRVJfSEVJR0hUKVxuICAgICAgICAgIHJldHVybiBudWxsXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChTX0ZSQU1FQlVGRkVSIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbU19GUkFNRUJVRkZFUl1cbiAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHZhciBGUkFNRUJVRkZFUl9GVU5DID0gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgICAgICB2YXIgRlJBTUVCVUZGRVJfU1RBVEUgPSBzaGFyZWQuZnJhbWVidWZmZXJcbiAgICAgICAgdmFyIEZSQU1FQlVGRkVSID0gc2NvcGUuZGVmKFxuICAgICAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLCAnLmdldEZyYW1lYnVmZmVyKCcsIEZSQU1FQlVGRkVSX0ZVTkMsICcpJylcblxuICAgICAgICBcblxuICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgRlJBTUVCVUZGRVJfU1RBVEUsXG4gICAgICAgICAgJy5uZXh0JyxcbiAgICAgICAgICBGUkFNRUJVRkZFUilcbiAgICAgICAgdmFyIENPTlRFWFQgPSBzaGFyZWQuY29udGV4dFxuICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX1dJRFRILFxuICAgICAgICAgIEZSQU1FQlVGRkVSICsgJz8nICsgRlJBTUVCVUZGRVIgKyAnLndpZHRoOicgK1xuICAgICAgICAgIENPTlRFWFQgKyAnLicgKyBTX0RSQVdJTkdCVUZGRVJfV0lEVEgpXG4gICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfSEVJR0hULFxuICAgICAgICAgIEZSQU1FQlVGRkVSICtcbiAgICAgICAgICAnPycgKyBGUkFNRUJVRkZFUiArICcuaGVpZ2h0OicgK1xuICAgICAgICAgIENPTlRFWFQgKyAnLicgKyBTX0RSQVdJTkdCVUZGRVJfSEVJR0hUKVxuICAgICAgICByZXR1cm4gRlJBTUVCVUZGRVJcbiAgICAgIH0pXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VWaWV3cG9ydFNjaXNzb3IgKG9wdGlvbnMsIGZyYW1lYnVmZmVyKSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgZnVuY3Rpb24gcGFyc2VCb3ggKHBhcmFtKSB7XG4gICAgICBpZiAocGFyYW0gaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICB2YXIgYm94ID0gc3RhdGljT3B0aW9uc1twYXJhbV1cbiAgICAgICAgXG5cbiAgICAgICAgdmFyIGlzU3RhdGljID0gdHJ1ZVxuICAgICAgICB2YXIgeCA9IGJveC54IHwgMFxuICAgICAgICB2YXIgeSA9IGJveC55IHwgMFxuICAgICAgICB2YXIgdywgaFxuICAgICAgICBpZiAoJ3cnIGluIGJveCkge1xuICAgICAgICAgIHcgPSBib3gudyB8IDBcbiAgICAgICAgICBcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpc1N0YXRpYyA9IGZhbHNlXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdoJyBpbiBib3gpIHtcbiAgICAgICAgICBoID0gYm94LmggfCAwXG4gICAgICAgICAgXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaXNTdGF0aWMgPSBmYWxzZVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgICBpc1N0YXRpYyAmJiBmcmFtZWJ1ZmZlciAmJiBmcmFtZWJ1ZmZlci50aGlzRGVwLFxuICAgICAgICAgIGlzU3RhdGljICYmIGZyYW1lYnVmZmVyICYmIGZyYW1lYnVmZmVyLmNvbnRleHREZXAsXG4gICAgICAgICAgaXNTdGF0aWMgJiYgZnJhbWVidWZmZXIgJiYgZnJhbWVidWZmZXIucHJvcERlcCxcbiAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgdmFyIENPTlRFWFQgPSBlbnYuc2hhcmVkLmNvbnRleHRcbiAgICAgICAgICAgIHZhciBCT1hfVyA9IHdcbiAgICAgICAgICAgIGlmICghKCd3JyBpbiBib3gpKSB7XG4gICAgICAgICAgICAgIEJPWF9XID0gc2NvcGUuZGVmKENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9XSURUSCwgJy0nLCB4KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIEJPWF9IID0gaFxuICAgICAgICAgICAgaWYgKCEoJ2gnIGluIGJveCkpIHtcbiAgICAgICAgICAgICAgQk9YX0ggPSBzY29wZS5kZWYoQ09OVEVYVCwgJy4nLCBTX0ZSQU1FQlVGRkVSX0hFSUdIVCwgJy0nLCB5KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFt4LCB5LCBCT1hfVywgQk9YX0hdXG4gICAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAocGFyYW0gaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5bkJveCA9IGR5bmFtaWNPcHRpb25zW3BhcmFtXVxuICAgICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlRHluYW1pY0RlY2woZHluQm94LCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBCT1ggPSBlbnYuaW52b2tlKHNjb3BlLCBkeW5Cb3gpXG5cbiAgICAgICAgICBcblxuICAgICAgICAgIHZhciBDT05URVhUID0gZW52LnNoYXJlZC5jb250ZXh0XG4gICAgICAgICAgdmFyIEJPWF9YID0gc2NvcGUuZGVmKEJPWCwgJy54fDAnKVxuICAgICAgICAgIHZhciBCT1hfWSA9IHNjb3BlLmRlZihCT1gsICcueXwwJylcbiAgICAgICAgICB2YXIgQk9YX1cgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAnXCJ3XCIgaW4gJywgQk9YLCAnPycsIEJPWCwgJy53fDA6JyxcbiAgICAgICAgICAgICcoJywgQ09OVEVYVCwgJy4nLCBTX0ZSQU1FQlVGRkVSX1dJRFRILCAnLScsIEJPWF9YLCAnKScpXG4gICAgICAgICAgdmFyIEJPWF9IID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgJ1wiaFwiIGluICcsIEJPWCwgJz8nLCBCT1gsICcuaHwwOicsXG4gICAgICAgICAgICAnKCcsIENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9IRUlHSFQsICctJywgQk9YX1ksICcpJylcblxuICAgICAgICAgIFxuXG4gICAgICAgICAgcmV0dXJuIFtCT1hfWCwgQk9YX1ksIEJPWF9XLCBCT1hfSF1cbiAgICAgICAgfSlcbiAgICAgICAgaWYgKGZyYW1lYnVmZmVyKSB7XG4gICAgICAgICAgcmVzdWx0LnRoaXNEZXAgPSByZXN1bHQudGhpc0RlcCB8fCBmcmFtZWJ1ZmZlci50aGlzRGVwXG4gICAgICAgICAgcmVzdWx0LmNvbnRleHREZXAgPSByZXN1bHQuY29udGV4dERlcCB8fCBmcmFtZWJ1ZmZlci5jb250ZXh0RGVwXG4gICAgICAgICAgcmVzdWx0LnByb3BEZXAgPSByZXN1bHQucHJvcERlcCB8fCBmcmFtZWJ1ZmZlci5wcnBvRGVwXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfSBlbHNlIGlmIChmcmFtZWJ1ZmZlcikge1xuICAgICAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAgIGZyYW1lYnVmZmVyLnRoaXNEZXAsXG4gICAgICAgICAgZnJhbWVidWZmZXIuY29udGV4dERlcCxcbiAgICAgICAgICBmcmFtZWJ1ZmZlci5wcm9wRGVwLFxuICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICB2YXIgQ09OVEVYVCA9IGVudi5zaGFyZWQuY29udGV4dFxuICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgMCwgMCxcbiAgICAgICAgICAgICAgc2NvcGUuZGVmKENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9XSURUSCksXG4gICAgICAgICAgICAgIHNjb3BlLmRlZihDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfSEVJR0hUKV1cbiAgICAgICAgICB9KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG51bGxcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgdmlld3BvcnQgPSBwYXJzZUJveChTX1ZJRVdQT1JUKVxuXG4gICAgaWYgKHZpZXdwb3J0KSB7XG4gICAgICB2YXIgcHJldlZpZXdwb3J0ID0gdmlld3BvcnRcbiAgICAgIHZpZXdwb3J0ID0gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICB2aWV3cG9ydC50aGlzRGVwLFxuICAgICAgICB2aWV3cG9ydC5jb250ZXh0RGVwLFxuICAgICAgICB2aWV3cG9ydC5wcm9wRGVwLFxuICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBWSUVXUE9SVCA9IHByZXZWaWV3cG9ydC5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgICAgICB2YXIgQ09OVEVYVCA9IGVudi5zaGFyZWQuY29udGV4dFxuICAgICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgICAnLicgKyBTX1ZJRVdQT1JUX1dJRFRILFxuICAgICAgICAgICAgVklFV1BPUlRbMl0pXG4gICAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfVklFV1BPUlRfSEVJR0hULFxuICAgICAgICAgICAgVklFV1BPUlRbM10pXG4gICAgICAgICAgcmV0dXJuIFZJRVdQT1JUXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHZpZXdwb3J0OiB2aWV3cG9ydCxcbiAgICAgIHNjaXNzb3JfYm94OiBwYXJzZUJveChTX1NDSVNTT1JfQk9YKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlUHJvZ3JhbSAob3B0aW9ucykge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIGZ1bmN0aW9uIHBhcnNlU2hhZGVyIChuYW1lKSB7XG4gICAgICBpZiAobmFtZSBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBpZCA9IHN0cmluZ1N0b3JlLmlkKHN0YXRpY09wdGlvbnNbbmFtZV0pXG4gICAgICAgIFxuICAgICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmV0dXJuIGlkXG4gICAgICAgIH0pXG4gICAgICAgIHJlc3VsdC5pZCA9IGlkXG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH0gZWxzZSBpZiAobmFtZSBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbbmFtZV1cbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgc3RyID0gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgICAgIHZhciBpZCA9IHNjb3BlLmRlZihlbnYuc2hhcmVkLnN0cmluZ3MsICcuaWQoJywgc3RyLCAnKScpXG4gICAgICAgICAgXG4gICAgICAgICAgcmV0dXJuIGlkXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHZhciBmcmFnID0gcGFyc2VTaGFkZXIoU19GUkFHKVxuICAgIHZhciB2ZXJ0ID0gcGFyc2VTaGFkZXIoU19WRVJUKVxuXG4gICAgdmFyIHByb2dyYW0gPSBudWxsXG4gICAgdmFyIHByb2dWYXJcbiAgICBpZiAoaXNTdGF0aWMoZnJhZykgJiYgaXNTdGF0aWModmVydCkpIHtcbiAgICAgIHByb2dyYW0gPSBzaGFkZXJTdGF0ZS5wcm9ncmFtKHZlcnQuaWQsIGZyYWcuaWQpXG4gICAgICBwcm9nVmFyID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICByZXR1cm4gZW52LmxpbmsocHJvZ3JhbSlcbiAgICAgIH0pXG4gICAgfSBlbHNlIHtcbiAgICAgIHByb2dWYXIgPSBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgIChmcmFnICYmIGZyYWcudGhpc0RlcCkgfHwgKHZlcnQgJiYgdmVydC50aGlzRGVwKSxcbiAgICAgICAgKGZyYWcgJiYgZnJhZy5jb250ZXh0RGVwKSB8fCAodmVydCAmJiB2ZXJ0LmNvbnRleHREZXApLFxuICAgICAgICAoZnJhZyAmJiBmcmFnLnByb3BEZXApIHx8ICh2ZXJ0ICYmIHZlcnQucHJvcERlcCksXG4gICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIFNIQURFUl9TVEFURSA9IGVudi5zaGFyZWQuc2hhZGVyXG4gICAgICAgICAgdmFyIGZyYWdJZFxuICAgICAgICAgIGlmIChmcmFnKSB7XG4gICAgICAgICAgICBmcmFnSWQgPSBmcmFnLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmcmFnSWQgPSBzY29wZS5kZWYoU0hBREVSX1NUQVRFLCAnLicsIFNfRlJBRylcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFyIHZlcnRJZFxuICAgICAgICAgIGlmICh2ZXJ0KSB7XG4gICAgICAgICAgICB2ZXJ0SWQgPSB2ZXJ0LmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2ZXJ0SWQgPSBzY29wZS5kZWYoU0hBREVSX1NUQVRFLCAnLicsIFNfVkVSVClcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFyIHByb2dEZWYgPSBTSEFERVJfU1RBVEUgKyAnLnByb2dyYW0oJyArIHZlcnRJZCArICcsJyArIGZyYWdJZFxuICAgICAgICAgIFxuICAgICAgICAgIHJldHVybiBzY29wZS5kZWYocHJvZ0RlZiArICcpJylcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgZnJhZzogZnJhZyxcbiAgICAgIHZlcnQ6IHZlcnQsXG4gICAgICBwcm9nVmFyOiBwcm9nVmFyLFxuICAgICAgcHJvZ3JhbTogcHJvZ3JhbVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlRHJhdyAob3B0aW9ucykge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIGZ1bmN0aW9uIHBhcnNlRWxlbWVudHMgKCkge1xuICAgICAgaWYgKFNfRUxFTUVOVFMgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICB2YXIgZWxlbWVudHMgPSBzdGF0aWNPcHRpb25zW1NfRUxFTUVOVFNdXG4gICAgICAgIGlmIChpc0J1ZmZlckFyZ3MoZWxlbWVudHMpKSB7XG4gICAgICAgICAgZWxlbWVudHMgPSBlbGVtZW50U3RhdGUuZ2V0RWxlbWVudHMoZWxlbWVudFN0YXRlLmNyZWF0ZShlbGVtZW50cykpXG4gICAgICAgIH0gZWxzZSBpZiAoZWxlbWVudHMpIHtcbiAgICAgICAgICBlbGVtZW50cyA9IGVsZW1lbnRTdGF0ZS5nZXRFbGVtZW50cyhlbGVtZW50cylcbiAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIGlmIChlbGVtZW50cykge1xuICAgICAgICAgICAgdmFyIHJlc3VsdCA9IGVudi5saW5rKGVsZW1lbnRzKVxuICAgICAgICAgICAgZW52LkVMRU1FTlRTID0gcmVzdWx0XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICAgICAgfVxuICAgICAgICAgIGVudi5FTEVNRU5UUyA9IG51bGxcbiAgICAgICAgICByZXR1cm4gbnVsbFxuICAgICAgICB9KVxuICAgICAgICByZXN1bHQudmFsdWUgPSBlbGVtZW50c1xuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9IGVsc2UgaWYgKFNfRUxFTUVOVFMgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5biA9IGR5bmFtaWNPcHRpb25zW1NfRUxFTUVOVFNdXG4gICAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcblxuICAgICAgICAgIHZhciBJU19CVUZGRVJfQVJHUyA9IHNoYXJlZC5pc0J1ZmZlckFyZ3NcbiAgICAgICAgICB2YXIgRUxFTUVOVF9TVEFURSA9IHNoYXJlZC5lbGVtZW50c1xuXG4gICAgICAgICAgdmFyIGVsZW1lbnREZWZuID0gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgICAgIHZhciBlbGVtZW50cyA9IHNjb3BlLmRlZignbnVsbCcpXG4gICAgICAgICAgdmFyIGVsZW1lbnRTdHJlYW0gPSBzY29wZS5kZWYoSVNfQlVGRkVSX0FSR1MsICcoJywgZWxlbWVudERlZm4sICcpJylcblxuICAgICAgICAgIHZhciBpZnRlID0gZW52LmNvbmQoZWxlbWVudFN0cmVhbSlcbiAgICAgICAgICAgIC50aGVuKGVsZW1lbnRzLCAnPScsIEVMRU1FTlRfU1RBVEUsICcuY3JlYXRlU3RyZWFtKCcsIGVsZW1lbnREZWZuLCAnKTsnKVxuICAgICAgICAgICAgLmVsc2UoZWxlbWVudHMsICc9JywgRUxFTUVOVF9TVEFURSwgJy5nZXRFbGVtZW50cygnLCBlbGVtZW50RGVmbiwgJyk7JylcblxuICAgICAgICAgIFxuXG4gICAgICAgICAgc2NvcGUuZW50cnkoaWZ0ZSlcbiAgICAgICAgICBzY29wZS5leGl0KFxuICAgICAgICAgICAgZW52LmNvbmQoZWxlbWVudFN0cmVhbSlcbiAgICAgICAgICAgICAgLnRoZW4oRUxFTUVOVF9TVEFURSwgJy5kZXN0cm95U3RyZWFtKCcsIGVsZW1lbnRzLCAnKTsnKSlcblxuICAgICAgICAgIGVudi5FTEVNRU5UUyA9IGVsZW1lbnRzXG5cbiAgICAgICAgICByZXR1cm4gZWxlbWVudHNcbiAgICAgICAgfSlcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICB2YXIgZWxlbWVudHMgPSBwYXJzZUVsZW1lbnRzKClcblxuICAgIGZ1bmN0aW9uIHBhcnNlUHJpbWl0aXZlICgpIHtcbiAgICAgIGlmIChTX1BSSU1JVElWRSBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBwcmltaXRpdmUgPSBzdGF0aWNPcHRpb25zW1NfUFJJTUlUSVZFXVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICByZXR1cm4gcHJpbVR5cGVzW3ByaW1pdGl2ZV1cbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAoU19QUklNSVRJVkUgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5blByaW1pdGl2ZSA9IGR5bmFtaWNPcHRpb25zW1NfUFJJTUlUSVZFXVxuICAgICAgICByZXR1cm4gY3JlYXRlRHluYW1pY0RlY2woZHluUHJpbWl0aXZlLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBQUklNX1RZUEVTID0gZW52LmNvbnN0YW50cy5wcmltVHlwZXNcbiAgICAgICAgICB2YXIgcHJpbSA9IGVudi5pbnZva2Uoc2NvcGUsIGR5blByaW1pdGl2ZSlcbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKFBSSU1fVFlQRVMsICdbJywgcHJpbSwgJ10nKVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChlbGVtZW50cykge1xuICAgICAgICBpZiAoaXNTdGF0aWMoZWxlbWVudHMpKSB7XG4gICAgICAgICAgaWYgKGVsZW1lbnRzLnZhbHVlKSB7XG4gICAgICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKGVudi5FTEVNRU5UUywgJy5wcmltVHlwZScpXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgIHJldHVybiBHTF9UUklBTkdMRVNcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgICAgICBlbGVtZW50cy50aGlzRGVwLFxuICAgICAgICAgICAgZWxlbWVudHMuY29udGV4dERlcCxcbiAgICAgICAgICAgIGVsZW1lbnRzLnByb3BEZXAsXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgICB2YXIgZWxlbWVudHMgPSBlbnYuRUxFTUVOVFNcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihlbGVtZW50cywgJz8nLCBlbGVtZW50cywgJy5wcmltVHlwZTonLCBHTF9UUklBTkdMRVMpXG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBhcnNlUGFyYW0gKHBhcmFtLCBpc09mZnNldCkge1xuICAgICAgaWYgKHBhcmFtIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIHZhbHVlID0gc3RhdGljT3B0aW9uc1twYXJhbV0gfCAwXG4gICAgICAgIFxuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIGlmIChpc09mZnNldCkge1xuICAgICAgICAgICAgZW52Lk9GRlNFVCA9IHZhbHVlXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChwYXJhbSBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluVmFsdWUgPSBkeW5hbWljT3B0aW9uc1twYXJhbV1cbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5blZhbHVlLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciByZXN1bHQgPSBlbnYuaW52b2tlKHNjb3BlLCBkeW5WYWx1ZSlcbiAgICAgICAgICBpZiAoaXNPZmZzZXQpIHtcbiAgICAgICAgICAgIGVudi5PRkZTRVQgPSByZXN1bHRcbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKGlzT2Zmc2V0ICYmIGVsZW1lbnRzKSB7XG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgZW52Lk9GRlNFVCA9ICcwJ1xuICAgICAgICAgIHJldHVybiAwXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHZhciBPRkZTRVQgPSBwYXJzZVBhcmFtKFNfT0ZGU0VULCB0cnVlKVxuXG4gICAgZnVuY3Rpb24gcGFyc2VWZXJ0Q291bnQgKCkge1xuICAgICAgaWYgKFNfQ09VTlQgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICB2YXIgY291bnQgPSBzdGF0aWNPcHRpb25zW1NfQ09VTlRdIHwgMFxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHJldHVybiBjb3VudFxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChTX0NPVU5UIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBkeW5Db3VudCA9IGR5bmFtaWNPcHRpb25zW1NfQ09VTlRdXG4gICAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW5Db3VudCwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgcmVzdWx0ID0gZW52Lmludm9rZShzY29wZSwgZHluQ291bnQpXG4gICAgICAgICAgXG4gICAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChlbGVtZW50cykge1xuICAgICAgICBpZiAoaXNTdGF0aWMoZWxlbWVudHMpKSB7XG4gICAgICAgICAgaWYgKGVsZW1lbnRzKSB7XG4gICAgICAgICAgICBpZiAoT0ZGU0VUKSB7XG4gICAgICAgICAgICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgICAgICAgICAgT0ZGU0VULnRoaXNEZXAsXG4gICAgICAgICAgICAgICAgT0ZGU0VULmNvbnRleHREZXAsXG4gICAgICAgICAgICAgICAgT0ZGU0VULnByb3BEZXAsXG4gICAgICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgICAgICAgIHZhciByZXN1bHQgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgICAgIGVudi5FTEVNRU5UUywgJy52ZXJ0Q291bnQtJywgZW52Lk9GRlNFVClcblxuICAgICAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKGVudi5FTEVNRU5UUywgJy52ZXJ0Q291bnQnKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgIHJldHVybiAtMVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YXIgdmFyaWFibGUgPSBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgICAgICBlbGVtZW50cy50aGlzRGVwIHx8IE9GRlNFVC50aGlzRGVwLFxuICAgICAgICAgICAgZWxlbWVudHMuY29udGV4dERlcCB8fCBPRkZTRVQuY29udGV4dERlcCxcbiAgICAgICAgICAgIGVsZW1lbnRzLnByb3BEZXAgfHwgT0ZGU0VULnByb3BEZXAsXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgICB2YXIgZWxlbWVudHMgPSBlbnYuRUxFTUVOVFNcbiAgICAgICAgICAgICAgaWYgKGVudi5PRkZTRVQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKGVsZW1lbnRzLCAnPycsIGVsZW1lbnRzLCAnLnZlcnRDb3VudC0nLFxuICAgICAgICAgICAgICAgICAgZW52Lk9GRlNFVCwgJzotMScpXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihlbGVtZW50cywgJz8nLCBlbGVtZW50cywgJy52ZXJ0Q291bnQ6LTEnKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4gdmFyaWFibGVcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgZWxlbWVudHM6IGVsZW1lbnRzLFxuICAgICAgcHJpbWl0aXZlOiBwYXJzZVByaW1pdGl2ZSgpLFxuICAgICAgY291bnQ6IHBhcnNlVmVydENvdW50KCksXG4gICAgICBpbnN0YW5jZXM6IHBhcnNlUGFyYW0oU19JTlNUQU5DRVMsIGZhbHNlKSxcbiAgICAgIG9mZnNldDogT0ZGU0VUXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VHTFN0YXRlIChvcHRpb25zKSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgdmFyIFNUQVRFID0ge31cblxuICAgIEdMX1NUQVRFX05BTUVTLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgIHZhciBwYXJhbSA9IHByb3BOYW1lKHByb3ApXG5cbiAgICAgIGZ1bmN0aW9uIHBhcnNlUGFyYW0gKHBhcnNlU3RhdGljLCBwYXJzZUR5bmFtaWMpIHtcbiAgICAgICAgaWYgKHByb3AgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICAgIHZhciB2YWx1ZSA9IHBhcnNlU3RhdGljKHN0YXRpY09wdGlvbnNbcHJvcF0pXG4gICAgICAgICAgU1RBVEVbcGFyYW1dID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgICB9KVxuICAgICAgICB9IGVsc2UgaWYgKHByb3AgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbcHJvcF1cbiAgICAgICAgICBTVEFURVtwYXJhbV0gPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICByZXR1cm4gcGFyc2VEeW5hbWljKGVudiwgc2NvcGUsIGVudi5pbnZva2Uoc2NvcGUsIGR5bikpXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBzd2l0Y2ggKHByb3ApIHtcbiAgICAgICAgY2FzZSBTX0NVTExfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfQkxFTkRfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfRElUSEVSOlxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19ERVBUSF9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19TQ0lTU09SX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX1BPTFlHT05fT0ZGU0VUX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX1NBTVBMRV9BTFBIQTpcbiAgICAgICAgY2FzZSBTX1NBTVBMRV9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19ERVBUSF9NQVNLOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfREVQVEhfRlVOQzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIGNvbXBhcmVGdW5jc1t2YWx1ZV1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIENPTVBBUkVfRlVOQ1MgPSBlbnYuY29uc3RhbnRzLmNvbXBhcmVGdW5jc1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihDT01QQVJFX0ZVTkNTLCAnWycsIHZhbHVlLCAnXScpXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19ERVBUSF9SQU5HRTpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIHZhciBaX05FQVIgPSBzY29wZS5kZWYoJysnLCB2YWx1ZSwgJ1swXScpXG4gICAgICAgICAgICAgIHZhciBaX0ZBUiA9IHNjb3BlLmRlZignKycsIHZhbHVlLCAnWzFdJylcbiAgICAgICAgICAgICAgcmV0dXJuIFtaX05FQVIsIFpfRkFSXVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfQkxFTkRfRlVOQzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIHNyY1JHQiA9ICgnc3JjUkdCJyBpbiB2YWx1ZSA/IHZhbHVlLnNyY1JHQiA6IHZhbHVlLnNyYylcbiAgICAgICAgICAgICAgdmFyIHNyY0FscGhhID0gKCdzcmNBbHBoYScgaW4gdmFsdWUgPyB2YWx1ZS5zcmNBbHBoYSA6IHZhbHVlLnNyYylcbiAgICAgICAgICAgICAgdmFyIGRzdFJHQiA9ICgnZHN0UkdCJyBpbiB2YWx1ZSA/IHZhbHVlLmRzdFJHQiA6IHZhbHVlLmRzdClcbiAgICAgICAgICAgICAgdmFyIGRzdEFscGhhID0gKCdkc3RBbHBoYScgaW4gdmFsdWUgPyB2YWx1ZS5kc3RBbHBoYSA6IHZhbHVlLmRzdClcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgYmxlbmRGdW5jc1tzcmNSR0JdLFxuICAgICAgICAgICAgICAgIGJsZW5kRnVuY3NbZHN0UkdCXSxcbiAgICAgICAgICAgICAgICBibGVuZEZ1bmNzW3NyY0FscGhhXSxcbiAgICAgICAgICAgICAgICBibGVuZEZ1bmNzW2RzdEFscGhhXVxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBCTEVORF9GVU5DUyA9IGVudi5jb25zdGFudHMuYmxlbmRGdW5jc1xuXG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIGZ1bmN0aW9uIHJlYWQgKHByZWZpeCwgc3VmZml4KSB7XG4gICAgICAgICAgICAgICAgdmFyIGZ1bmMgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgICAnXCInLCBwcmVmaXgsIHN1ZmZpeCwgJ1wiIGluICcsIHZhbHVlLFxuICAgICAgICAgICAgICAgICAgJz8nLCB2YWx1ZSwgJy4nLCBwcmVmaXgsIHN1ZmZpeCxcbiAgICAgICAgICAgICAgICAgICc6JywgdmFsdWUsICcuJywgcHJlZml4KVxuXG4gICAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKEJMRU5EX0ZVTkNTLCAnWycsIGZ1bmMsICddJylcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIHZhciBTUkNfUkdCID0gcmVhZCgnc3JjJywgJ1JHQicpXG4gICAgICAgICAgICAgIHZhciBTUkNfQUxQSEEgPSByZWFkKCdzcmMnLCAnQWxwaGEnKVxuICAgICAgICAgICAgICB2YXIgRFNUX1JHQiA9IHJlYWQoJ2RzdCcsICdSR0InKVxuICAgICAgICAgICAgICB2YXIgRFNUX0FMUEhBID0gcmVhZCgnZHN0JywgJ0FscGhhJylcblxuICAgICAgICAgICAgICByZXR1cm4gW1NSQ19SR0IsIERTVF9SR0IsIFNSQ19BTFBIQSwgRFNUX0FMUEhBXVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfQkxFTkRfRVFVQVRJT046XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWVdLFxuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWVdXG4gICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWUucmdiXSxcbiAgICAgICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlLmFscGhhXVxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICB2YXIgQkxFTkRfRVFVQVRJT05TID0gZW52LmNvbnN0YW50cy5ibGVuZEVxdWF0aW9uc1xuXG4gICAgICAgICAgICAgIHZhciBSR0IgPSBzY29wZS5kZWYoKVxuICAgICAgICAgICAgICB2YXIgQUxQSEEgPSBzY29wZS5kZWYoKVxuXG4gICAgICAgICAgICAgIHZhciBpZnRlID0gZW52LmNvbmQoJ3R5cGVvZiAnLCB2YWx1ZSwgJz09PVwic3RyaW5nXCInKVxuXG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIGlmdGUudGhlbihcbiAgICAgICAgICAgICAgICBSR0IsICc9JywgQUxQSEEsICc9JywgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhbHVlLCAnXTsnKVxuICAgICAgICAgICAgICBpZnRlLmVsc2UoXG4gICAgICAgICAgICAgICAgUkdCLCAnPScsIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YWx1ZSwgJy5yZ2JdOycsXG4gICAgICAgICAgICAgICAgQUxQSEEsICc9JywgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhbHVlLCAnLmFscGhhXTsnKVxuXG4gICAgICAgICAgICAgIHNjb3BlKGlmdGUpXG5cbiAgICAgICAgICAgICAgcmV0dXJuIFtSR0IsIEFMUEhBXVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfQkxFTkRfQ09MT1I6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBsb29wKDQsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICt2YWx1ZVtpXVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIGxvb3AoNCwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKCcrJywgdmFsdWUsICdbJywgaSwgJ10nKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9NQVNLOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWUgfCAwXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKHZhbHVlLCAnfDAnKVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9GVU5DOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB2YXIgY21wID0gdmFsdWUuY21wIHx8ICdrZWVwJ1xuICAgICAgICAgICAgICB2YXIgcmVmID0gdmFsdWUucmVmIHx8IDBcbiAgICAgICAgICAgICAgdmFyIG1hc2sgPSAnbWFzaycgaW4gdmFsdWUgPyB2YWx1ZS5tYXNrIDogLTFcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICBjb21wYXJlRnVuY3NbY21wXSxcbiAgICAgICAgICAgICAgICByZWYsXG4gICAgICAgICAgICAgICAgbWFza1xuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBDT01QQVJFX0ZVTkNTID0gZW52LmNvbnN0YW50cy5jb21wYXJlRnVuY3NcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHZhciBjbXAgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgJ1wiY21wXCIgaW4gJywgdmFsdWUsXG4gICAgICAgICAgICAgICAgJz8nLCBDT01QQVJFX0ZVTkNTLCAnWycsIHZhbHVlLCAnLmNtcF0nLFxuICAgICAgICAgICAgICAgICc6JywgR0xfS0VFUClcbiAgICAgICAgICAgICAgdmFyIHJlZiA9IHNjb3BlLmRlZih2YWx1ZSwgJy5yZWZ8MCcpXG4gICAgICAgICAgICAgIHZhciBtYXNrID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgICAgICdcIm1hc2tcIiBpbiAnLCB2YWx1ZSxcbiAgICAgICAgICAgICAgICAnPycsIHZhbHVlLCAnLm1hc2t8MDotMScpXG4gICAgICAgICAgICAgIHJldHVybiBbY21wLCByZWYsIG1hc2tdXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19TVEVOQ0lMX09QRlJPTlQ6XG4gICAgICAgIGNhc2UgU19TVEVOQ0lMX09QQkFDSzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIGZhaWwgPSB2YWx1ZS5mYWlsIHx8ICdrZWVwJ1xuICAgICAgICAgICAgICB2YXIgemZhaWwgPSB2YWx1ZS56ZmFpbCB8fCAna2VlcCdcbiAgICAgICAgICAgICAgdmFyIHBhc3MgPSB2YWx1ZS5wYXNzIHx8ICdrZWVwJ1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgIHByb3AgPT09IFNfU1RFTkNJTF9PUEJBQ0sgPyBHTF9CQUNLIDogR0xfRlJPTlQsXG4gICAgICAgICAgICAgICAgc3RlbmNpbE9wc1tmYWlsXSxcbiAgICAgICAgICAgICAgICBzdGVuY2lsT3BzW3pmYWlsXSxcbiAgICAgICAgICAgICAgICBzdGVuY2lsT3BzW3Bhc3NdXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIFNURU5DSUxfT1BTID0gZW52LmNvbnN0YW50cy5zdGVuY2lsT3BzXG5cbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgZnVuY3Rpb24gcmVhZCAobmFtZSkge1xuICAgICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihcbiAgICAgICAgICAgICAgICAgICdcIicsIG5hbWUsICdcIiBpbiAnLCB2YWx1ZSxcbiAgICAgICAgICAgICAgICAgICc/JywgU1RFTkNJTF9PUFMsICdbJywgdmFsdWUsICcuJywgbmFtZSwgJ106JyxcbiAgICAgICAgICAgICAgICAgIEdMX0tFRVApXG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgIHByb3AgPT09IFNfU1RFTkNJTF9PUEJBQ0sgPyBHTF9CQUNLIDogR0xfRlJPTlQsXG4gICAgICAgICAgICAgICAgcmVhZCgnZmFpbCcpLFxuICAgICAgICAgICAgICAgIHJlYWQoJ3pmYWlsJyksXG4gICAgICAgICAgICAgICAgcmVhZCgncGFzcycpXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX1BPTFlHT05fT0ZGU0VUX09GRlNFVDpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIGZhY3RvciA9IHZhbHVlLmZhY3RvciB8IDBcbiAgICAgICAgICAgICAgdmFyIHVuaXRzID0gdmFsdWUudW5pdHMgfCAwXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIFtmYWN0b3IsIHVuaXRzXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICB2YXIgRkFDVE9SID0gc2NvcGUuZGVmKHZhbHVlLCAnLmZhY3RvcnwwJylcbiAgICAgICAgICAgICAgdmFyIFVOSVRTID0gc2NvcGUuZGVmKHZhbHVlLCAnLnVuaXRzfDAnKVxuXG4gICAgICAgICAgICAgIHJldHVybiBbRkFDVE9SLCBVTklUU11cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0NVTExfRkFDRTpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICB2YXIgZmFjZSA9IDBcbiAgICAgICAgICAgICAgaWYgKHZhbHVlID09PSAnZnJvbnQnKSB7XG4gICAgICAgICAgICAgICAgZmFjZSA9IEdMX0ZST05UXG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAodmFsdWUgPT09ICdiYWNrJykge1xuICAgICAgICAgICAgICAgIGZhY2UgPSBHTF9CQUNLXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBmYWNlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKHZhbHVlLCAnPT09XCJmcm9udFwiPycsIEdMX0ZST05ULCAnOicsIEdMX0JBQ0spXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19MSU5FX1dJRFRIOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19GUk9OVF9GQUNFOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gb3JpZW50YXRpb25UeXBlW3ZhbHVlXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZih2YWx1ZSArICc9PT1cImN3XCI/JyArIEdMX0NXICsgJzonICsgR0xfQ0NXKVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfQ09MT1JfTUFTSzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLm1hcChmdW5jdGlvbiAodikgeyByZXR1cm4gISF2IH0pXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gbG9vcCg0LCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICAgIHJldHVybiAnISEnICsgdmFsdWUgKyAnWycgKyBpICsgJ10nXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19TQU1QTEVfQ09WRVJBR0U6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHZhciBzYW1wbGVWYWx1ZSA9ICd2YWx1ZScgaW4gdmFsdWUgPyB2YWx1ZS52YWx1ZSA6IDFcbiAgICAgICAgICAgICAgdmFyIHNhbXBsZUludmVydCA9ICEhdmFsdWUuaW52ZXJ0XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gW3NhbXBsZVZhbHVlLCBzYW1wbGVJbnZlcnRdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB2YXIgVkFMVUUgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgJ1widmFsdWVcIiBpbiAnLCB2YWx1ZSwgJz8rJywgdmFsdWUsICcudmFsdWU6MScpXG4gICAgICAgICAgICAgIHZhciBJTlZFUlQgPSBzY29wZS5kZWYoJyEhJywgdmFsdWUsICcuaW52ZXJ0JylcbiAgICAgICAgICAgICAgcmV0dXJuIFtWQUxVRSwgSU5WRVJUXVxuICAgICAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgcmV0dXJuIFNUQVRFXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZU9wdGlvbnMgKG9wdGlvbnMpIHtcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljXG5cbiAgICBcblxuICAgIHZhciBmcmFtZWJ1ZmZlciA9IHBhcnNlRnJhbWVidWZmZXIob3B0aW9ucylcbiAgICB2YXIgdmlld3BvcnRBbmRTY2lzc29yID0gcGFyc2VWaWV3cG9ydFNjaXNzb3Iob3B0aW9ucywgZnJhbWVidWZmZXIpXG4gICAgdmFyIGRyYXcgPSBwYXJzZURyYXcob3B0aW9ucylcbiAgICB2YXIgc3RhdGUgPSBwYXJzZUdMU3RhdGUob3B0aW9ucylcbiAgICB2YXIgc2hhZGVyID0gcGFyc2VQcm9ncmFtKG9wdGlvbnMpXG5cbiAgICBmdW5jdGlvbiBjb3B5Qm94IChuYW1lKSB7XG4gICAgICB2YXIgZGVmbiA9IHZpZXdwb3J0QW5kU2Npc3NvcltuYW1lXVxuICAgICAgaWYgKGRlZm4pIHtcbiAgICAgICAgc3RhdGVbbmFtZV0gPSBkZWZuXG4gICAgICB9XG4gICAgfVxuICAgIGNvcHlCb3goU19WSUVXUE9SVClcbiAgICBjb3B5Qm94KHByb3BOYW1lKFNfU0NJU1NPUl9CT1gpKVxuXG4gICAgdmFyIGRpcnR5ID0gT2JqZWN0LmtleXMoc3RhdGUpLmxlbmd0aCA+IDBcblxuICAgIHJldHVybiB7XG4gICAgICBmcmFtZWJ1ZmZlcjogZnJhbWVidWZmZXIsXG4gICAgICBkcmF3OiBkcmF3LFxuICAgICAgc2hhZGVyOiBzaGFkZXIsXG4gICAgICBzdGF0ZTogc3RhdGUsXG4gICAgICBkaXJ0eTogZGlydHlcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZVVuaWZvcm1zICh1bmlmb3Jtcykge1xuICAgIHZhciBzdGF0aWNVbmlmb3JtcyA9IHVuaWZvcm1zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljVW5pZm9ybXMgPSB1bmlmb3Jtcy5keW5hbWljXG5cbiAgICB2YXIgVU5JRk9STVMgPSB7fVxuXG4gICAgT2JqZWN0LmtleXMoc3RhdGljVW5pZm9ybXMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY1VuaWZvcm1zW25hbWVdXG4gICAgICB2YXIgcmVzdWx0XG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyB8fFxuICAgICAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgdHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nICYmXG4gICAgICAgIHZhbHVlLl9yZWdsVHlwZSA9PT0gJ3RleHR1cmUnKSB7XG4gICAgICAgIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudikge1xuICAgICAgICAgIHJldHVybiBlbnYubGluayh2YWx1ZSlcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkgfHwgaXNUeXBlZEFycmF5KHZhbHVlKSkge1xuICAgICAgICByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYpIHtcbiAgICAgICAgICB2YXIgSVRFTSA9IGVudi5nbG9iYWwuZGVmKCdbJyxcbiAgICAgICAgICAgIGxvb3AodmFsdWUubGVuZ3RoLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlW2ldXG4gICAgICAgICAgICB9KSwgJ10nKVxuICAgICAgICAgIHJldHVybiBJVEVNXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgIH1cbiAgICAgIHJlc3VsdC52YWx1ZSA9IHZhbHVlXG4gICAgICBVTklGT1JNU1tuYW1lXSA9IHJlc3VsdFxuICAgIH0pXG5cbiAgICBPYmplY3Qua2V5cyhkeW5hbWljVW5pZm9ybXMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgdmFyIGR5biA9IGR5bmFtaWNVbmlmb3Jtc1trZXldXG4gICAgICBVTklGT1JNU1trZXldID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICByZXR1cm4gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgcmV0dXJuIFVOSUZPUk1TXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUF0dHJpYnV0ZXMgKGF0dHJpYnV0ZXMpIHtcbiAgICB2YXIgc3RhdGljQXR0cmlidXRlcyA9IGF0dHJpYnV0ZXMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNBdHRyaWJ1dGVzID0gYXR0cmlidXRlcy5keW5hbWljXG5cbiAgICB2YXIgYXR0cmlidXRlRGVmcyA9IHt9XG5cbiAgICBPYmplY3Qua2V5cyhzdGF0aWNBdHRyaWJ1dGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY0F0dHJpYnV0ZXNbYXR0cmlidXRlXVxuICAgICAgdmFyIGlkID0gc3RyaW5nU3RvcmUuaWQoYXR0cmlidXRlKVxuXG4gICAgICB2YXIgcmVjb3JkID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gICAgICBpZiAoaXNCdWZmZXJBcmdzKHZhbHVlKSkge1xuICAgICAgICByZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfUE9JTlRFUlxuICAgICAgICByZWNvcmQuYnVmZmVyID0gYnVmZmVyU3RhdGUuZ2V0QnVmZmVyKFxuICAgICAgICAgIGJ1ZmZlclN0YXRlLmNyZWF0ZSh2YWx1ZSwgR0xfQVJSQVlfQlVGRkVSLCBmYWxzZSkpXG4gICAgICAgIHJlY29yZC50eXBlID0gcmVjb3JkLmJ1ZmZlci5kdHlwZVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcih2YWx1ZSlcbiAgICAgICAgaWYgKGJ1ZmZlcikge1xuICAgICAgICAgIHJlY29yZC5zdGF0ZSA9IEFUVFJJQl9TVEFURV9QT0lOVEVSXG4gICAgICAgICAgcmVjb3JkLmJ1ZmZlciA9IGJ1ZmZlclxuICAgICAgICAgIHJlY29yZC50eXBlID0gYnVmZmVyLmR0eXBlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKHZhbHVlLmNvbnN0YW50KSB7XG4gICAgICAgICAgICB2YXIgY29uc3RhbnQgPSB2YWx1ZS5jb25zdGFudFxuICAgICAgICAgICAgcmVjb3JkLnN0YXRlID0gQVRUUklCX1NUQVRFX0NPTlNUQU5UXG4gICAgICAgICAgICBpZiAodHlwZW9mIGNvbnN0YW50ID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICByZWNvcmQueCA9IGNvbnN0YW50XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgQ1VURV9DT01QT05FTlRTLmZvckVhY2goZnVuY3Rpb24gKGMsIGkpIHtcbiAgICAgICAgICAgICAgICBpZiAoaSA8IGNvbnN0YW50Lmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgcmVjb3JkW2NdID0gY29uc3RhbnRbaV1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcih2YWx1ZS5idWZmZXIpXG4gICAgICAgICAgICBcblxuICAgICAgICAgICAgdmFyIG9mZnNldCA9IHZhbHVlLm9mZnNldCB8IDBcbiAgICAgICAgICAgIFxuXG4gICAgICAgICAgICB2YXIgc3RyaWRlID0gdmFsdWUuc3RyaWRlIHwgMFxuICAgICAgICAgICAgXG5cbiAgICAgICAgICAgIHZhciBzaXplID0gdmFsdWUuc2l6ZSB8IDBcbiAgICAgICAgICAgIFxuXG4gICAgICAgICAgICB2YXIgbm9ybWFsaXplZCA9ICEhdmFsdWUubm9ybWFsaXplZFxuXG4gICAgICAgICAgICB2YXIgdHlwZSA9IDBcbiAgICAgICAgICAgIGlmICgndHlwZScgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHR5cGUgPSBnbFR5cGVzW3ZhbHVlLnR5cGVdXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBkaXZpc29yID0gdmFsdWUuZGl2aXNvciB8IDBcbiAgICAgICAgICAgIGlmICgnZGl2aXNvcicgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBcblxuICAgICAgICAgICAgcmVjb3JkLmJ1ZmZlciA9IGJ1ZmZlclxuICAgICAgICAgICAgcmVjb3JkLnN0YXRlID0gQVRUUklCX1NUQVRFX1BPSU5URVJcbiAgICAgICAgICAgIHJlY29yZC5zaXplID0gc2l6ZVxuICAgICAgICAgICAgcmVjb3JkLm5vcm1hbGl6ZWQgPSBub3JtYWxpemVkXG4gICAgICAgICAgICByZWNvcmQudHlwZSA9IHR5cGUgfHwgYnVmZmVyLmR0eXBlXG4gICAgICAgICAgICByZWNvcmQub2Zmc2V0ID0gb2Zmc2V0XG4gICAgICAgICAgICByZWNvcmQuc3RyaWRlID0gc3RyaWRlXG4gICAgICAgICAgICByZWNvcmQuZGl2aXNvciA9IGRpdmlzb3JcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgYXR0cmlidXRlRGVmc1thdHRyaWJ1dGVdID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICB2YXIgY2FjaGUgPSBlbnYuYXR0cmliQ2FjaGVcbiAgICAgICAgaWYgKGlkIGluIGNhY2hlKSB7XG4gICAgICAgICAgcmV0dXJuIGNhY2hlW2lkXVxuICAgICAgICB9XG4gICAgICAgIHZhciByZXN1bHQgPSB7XG4gICAgICAgICAgaXNTdHJlYW06IGZhbHNlXG4gICAgICAgIH1cbiAgICAgICAgT2JqZWN0LmtleXMocmVjb3JkKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICByZXN1bHRba2V5XSA9IHJlY29yZFtrZXldXG4gICAgICAgIH0pXG4gICAgICAgIGlmIChyZWNvcmQuYnVmZmVyKSB7XG4gICAgICAgICAgcmVzdWx0LmJ1ZmZlciA9IGVudi5saW5rKHJlY29yZC5idWZmZXIpXG4gICAgICAgIH1cbiAgICAgICAgY2FjaGVbaWRdID0gcmVzdWx0XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNBdHRyaWJ1dGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcbiAgICAgIHZhciBkeW4gPSBkeW5hbWljQXR0cmlidXRlc1thdHRyaWJ1dGVdXG5cbiAgICAgIGZ1bmN0aW9uIGFwcGVuZEF0dHJpYnV0ZUNvZGUgKGVudiwgYmxvY2spIHtcbiAgICAgICAgdmFyIFZBTFVFID0gZW52Lmludm9rZShibG9jaywgZHluKVxuXG4gICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG5cbiAgICAgICAgdmFyIElTX0JVRkZFUl9BUkdTID0gc2hhcmVkLmlzQnVmZmVyQXJnc1xuICAgICAgICB2YXIgQlVGRkVSX1NUQVRFID0gc2hhcmVkLmJ1ZmZlclxuXG4gICAgICAgIC8vIFBlcmZvcm0gdmFsaWRhdGlvbiBvbiBhdHRyaWJ1dGVcbiAgICAgICAgXG5cbiAgICAgICAgLy8gYWxsb2NhdGUgbmFtZXMgZm9yIHJlc3VsdFxuICAgICAgICB2YXIgcmVzdWx0ID0ge1xuICAgICAgICAgIGlzU3RyZWFtOiBibG9jay5kZWYoZmFsc2UpXG4gICAgICAgIH1cbiAgICAgICAgdmFyIGRlZmF1bHRSZWNvcmQgPSBuZXcgQXR0cmlidXRlUmVjb3JkKClcbiAgICAgICAgZGVmYXVsdFJlY29yZC5zdGF0ZSA9IEFUVFJJQl9TVEFURV9QT0lOVEVSXG4gICAgICAgIE9iamVjdC5rZXlzKGRlZmF1bHRSZWNvcmQpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgIHJlc3VsdFtrZXldID0gYmxvY2suZGVmKCcnICsgZGVmYXVsdFJlY29yZFtrZXldKVxuICAgICAgICB9KVxuXG4gICAgICAgIHZhciBCVUZGRVIgPSByZXN1bHQuYnVmZmVyXG4gICAgICAgIHZhciBUWVBFID0gcmVzdWx0LnR5cGVcbiAgICAgICAgYmxvY2soXG4gICAgICAgICAgJ2lmKCcsIElTX0JVRkZFUl9BUkdTLCAnKCcsIFZBTFVFLCAnKSl7JyxcbiAgICAgICAgICByZXN1bHQuaXNTdHJlYW0sICc9dHJ1ZTsnLFxuICAgICAgICAgIEJVRkZFUiwgJz0nLCBCVUZGRVJfU1RBVEUsICcuY3JlYXRlU3RyZWFtKCcsIEdMX0FSUkFZX0JVRkZFUiwgJywnLCBWQUxVRSwgJyk7JyxcbiAgICAgICAgICBUWVBFLCAnPScsIEJVRkZFUiwgJy5kdHlwZTsnLFxuICAgICAgICAgICd9ZWxzZXsnLFxuICAgICAgICAgIEJVRkZFUiwgJz0nLCBCVUZGRVJfU1RBVEUsICcuZ2V0QnVmZmVyKCcsIFZBTFVFLCAnKTsnLFxuICAgICAgICAgICdpZignLCBCVUZGRVIsICcpeycsXG4gICAgICAgICAgVFlQRSwgJz0nLCBCVUZGRVIsICcuZHR5cGU7JyxcbiAgICAgICAgICAnfWVsc2UgaWYoJywgVkFMVUUsICcuY29uc3RhbnQpeycsXG4gICAgICAgICAgcmVzdWx0LnN0YXRlLCAnPScsIEFUVFJJQl9TVEFURV9DT05TVEFOVCwgJzsnLFxuICAgICAgICAgIENVVEVfQ09NUE9ORU5UUy5tYXAoZnVuY3Rpb24gKG5hbWUsIGkpIHtcbiAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgIHJlc3VsdFtuYW1lXSArICc9JyArIFZBTFVFICsgJy5sZW5ndGg+PScgKyBpICtcbiAgICAgICAgICAgICAgJz8nICsgVkFMVUUgKyAnWycgKyBpICsgJ106MDsnXG4gICAgICAgICAgICApXG4gICAgICAgICAgfSkuam9pbignJyksXG4gICAgICAgICAgJ31lbHNleycsXG4gICAgICAgICAgQlVGRkVSLCAnPScsIEJVRkZFUl9TVEFURSwgJy5nZXRCdWZmZXIoJywgVkFMVUUsICcuYnVmZmVyKTsnLFxuICAgICAgICAgIFRZUEUsICc9XCJ0eXBlXCIgaW4gJywgVkFMVUUsICc/JyxcbiAgICAgICAgICBzaGFyZWQuZ2xUeXBlcywgJ1snLCBWQUxVRSwgJy50eXBlXTonLCBCVUZGRVIsICcuZHR5cGU7JyxcbiAgICAgICAgICByZXN1bHQubm9ybWFsaXplZCwgJz0hIScsIFZBTFVFLCAnLm5vcm1hbGl6ZWQ7JylcbiAgICAgICAgZnVuY3Rpb24gZW1pdFJlYWRSZWNvcmQgKG5hbWUpIHtcbiAgICAgICAgICBibG9jayhyZXN1bHRbbmFtZV0sICc9JywgVkFMVUUsICcuJywgbmFtZSwgJ3wwOycpXG4gICAgICAgIH1cbiAgICAgICAgZW1pdFJlYWRSZWNvcmQoJ3NpemUnKVxuICAgICAgICBlbWl0UmVhZFJlY29yZCgnb2Zmc2V0JylcbiAgICAgICAgZW1pdFJlYWRSZWNvcmQoJ3N0cmlkZScpXG4gICAgICAgIGVtaXRSZWFkUmVjb3JkKCdkaXZpc29yJylcblxuICAgICAgICBibG9jaygnfX0nKVxuXG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cblxuICAgICAgYXR0cmlidXRlRGVmc1thdHRyaWJ1dGVdID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBhcHBlbmRBdHRyaWJ1dGVDb2RlKVxuICAgIH0pXG5cbiAgICByZXR1cm4gYXR0cmlidXRlRGVmc1xuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VDb250ZXh0IChjb250ZXh0KSB7XG4gICAgdmFyIHN0YXRpY0NvbnRleHQgPSBjb250ZXh0LnN0YXRpY1xuICAgIHZhciBkeW5hbWljQ29udGV4dCA9IGNvbnRleHQuZHluYW1pY1xuICAgIHZhciByZXN1bHQgPSB7fVxuXG4gICAgT2JqZWN0LmtleXMoc3RhdGljQ29udGV4dCkuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIHZhbHVlID0gc3RhdGljQ29udGV4dFtuYW1lXVxuICAgICAgcmVzdWx0W25hbWVdID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyB8fCB0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgICAgIHJldHVybiAnJyArIHZhbHVlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGVudi5saW5rKHZhbHVlKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBPYmplY3Qua2V5cyhkeW5hbWljQ29udGV4dCkuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIGR5biA9IGR5bmFtaWNDb250ZXh0W25hbWVdXG4gICAgICByZXN1bHRbbmFtZV0gPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHJldHVybiBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUFyZ3VtZW50cyAob3B0aW9ucywgYXR0cmlidXRlcywgdW5pZm9ybXMsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0ID0gcGFyc2VPcHRpb25zKG9wdGlvbnMpXG4gICAgcmVzdWx0LnVuaWZvcm1zID0gcGFyc2VVbmlmb3Jtcyh1bmlmb3JtcylcbiAgICByZXN1bHQuYXR0cmlidXRlcyA9IHBhcnNlQXR0cmlidXRlcyhhdHRyaWJ1dGVzKVxuICAgIHJlc3VsdC5jb250ZXh0ID0gcGFyc2VDb250ZXh0KGNvbnRleHQpXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBDT01NT04gVVBEQVRFIEZVTkNUSU9OU1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGVtaXRDb250ZXh0IChlbnYsIHNjb3BlLCBjb250ZXh0KSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgQ09OVEVYVCA9IHNoYXJlZC5jb250ZXh0XG5cbiAgICB2YXIgY29udGV4dEVudGVyID0gZW52LnNjb3BlKClcblxuICAgIE9iamVjdC5rZXlzKGNvbnRleHQpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHNjb3BlLnNhdmUoQ09OVEVYVCwgJy4nICsgbmFtZSlcbiAgICAgIHZhciBkZWZuID0gY29udGV4dFtuYW1lXVxuICAgICAgY29udGV4dEVudGVyKENPTlRFWFQsICcuJywgbmFtZSwgJz0nLCBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKSwgJzsnKVxuICAgIH0pXG5cbiAgICBzY29wZShjb250ZXh0RW50ZXIpXG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIENPTU1PTiBEUkFXSU5HIEZVTkNUSU9OU1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGVtaXRQb2xsRnJhbWVidWZmZXIgKGVudiwgc2NvcGUsIGZyYW1lYnVmZmVyKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcblxuICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuICAgIHZhciBGUkFNRUJVRkZFUl9TVEFURSA9IHNoYXJlZC5mcmFtZWJ1ZmZlclxuICAgIHZhciBFWFRfRFJBV19CVUZGRVJTXG4gICAgaWYgKGV4dERyYXdCdWZmZXJzKSB7XG4gICAgICBFWFRfRFJBV19CVUZGRVJTID0gc2NvcGUuZGVmKHNoYXJlZC5leHRlbnNpb25zLCAnLndlYmdsX2RyYXdfYnVmZmVycycpXG4gICAgfVxuXG4gICAgdmFyIGNvbnN0YW50cyA9IGVudi5jb25zdGFudHNcblxuICAgIHZhciBEUkFXX0JVRkZFUlMgPSBjb25zdGFudHMuZHJhd0J1ZmZlcnNcbiAgICB2YXIgQkFDS19CVUZGRVIgPSBjb25zdGFudHMuYmFja0J1ZmZlclxuXG4gICAgdmFyIE5FWFRcbiAgICBpZiAoZnJhbWVidWZmZXIpIHtcbiAgICAgIE5FWFQgPSBmcmFtZWJ1ZmZlci5hcHBlbmQoZW52LCBzY29wZSlcbiAgICB9IGVsc2Uge1xuICAgICAgTkVYVCA9IHNjb3BlLmRlZihGUkFNRUJVRkZFUl9TVEFURSwgJy5uZXh0JylcbiAgICB9XG5cbiAgICBzY29wZShcbiAgICAgICdpZignLCBGUkFNRUJVRkZFUl9TVEFURSwgJy5kaXJ0eXx8JywgTkVYVCwgJyE9PScsIEZSQU1FQlVGRkVSX1NUQVRFLCAnLmN1cil7JyxcbiAgICAgICdpZignLCBORVhULCAnKXsnLFxuICAgICAgR0wsICcuYmluZEZyYW1lYnVmZmVyKCcsIEdMX0ZSQU1FQlVGRkVSLCAnLCcsIE5FWFQsICcuZnJhbWVidWZmZXIpOycpXG4gICAgaWYgKGV4dERyYXdCdWZmZXJzKSB7XG4gICAgICBzY29wZShFWFRfRFJBV19CVUZGRVJTLCAnLmRyYXdCdWZmZXJzV0VCR0woJyxcbiAgICAgICAgRFJBV19CVUZGRVJTLCAnWycsIE5FWFQsICcuY29sb3JBdHRhY2htZW50cy5sZW5ndGhdKTsnKVxuICAgIH1cbiAgICBzY29wZSgnfWVsc2V7JyxcbiAgICAgIEdMLCAnLmJpbmRGcmFtZWJ1ZmZlcignLCBHTF9GUkFNRUJVRkZFUiwgJyxudWxsKTsnKVxuICAgIGlmIChleHREcmF3QnVmZmVycykge1xuICAgICAgc2NvcGUoRVhUX0RSQVdfQlVGRkVSUywgJy5kcmF3QnVmZmVyc1dFQkdMKCcsIEJBQ0tfQlVGRkVSLCAnKTsnKVxuICAgIH1cbiAgICBzY29wZShcbiAgICAgICd9JyxcbiAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLCAnLmN1cj0nLCBORVhULCAnOycsXG4gICAgICBGUkFNRUJVRkZFUl9TVEFURSwgJy5kaXJ0eT1mYWxzZTsnLFxuICAgICAgJ30nKVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdFBvbGxTdGF0ZSAoZW52LCBzY29wZSwgYXJncykge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG5cbiAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcblxuICAgIHZhciBDVVJSRU5UX1ZBUlMgPSBlbnYuY3VycmVudFxuICAgIHZhciBORVhUX1ZBUlMgPSBlbnYubmV4dFxuICAgIHZhciBDVVJSRU5UX1NUQVRFID0gc2hhcmVkLmN1cnJlbnRcbiAgICB2YXIgTkVYVF9TVEFURSA9IHNoYXJlZC5uZXh0XG5cbiAgICB2YXIgYmxvY2sgPSBlbnYuY29uZChDVVJSRU5UX1NUQVRFLCAnLmRpcnR5JylcblxuICAgIEdMX1NUQVRFX05BTUVTLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgIHZhciBwYXJhbSA9IHByb3BOYW1lKHByb3ApXG4gICAgICBpZiAocGFyYW0gaW4gYXJncy5zdGF0ZSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgdmFyIE5FWFQsIENVUlJFTlRcbiAgICAgIGlmIChwYXJhbSBpbiBORVhUX1ZBUlMpIHtcbiAgICAgICAgTkVYVCA9IE5FWFRfVkFSU1twYXJhbV1cbiAgICAgICAgQ1VSUkVOVCA9IENVUlJFTlRfVkFSU1twYXJhbV1cbiAgICAgICAgdmFyIHBhcnRzID0gbG9vcChjdXJyZW50U3RhdGVbcGFyYW1dLmxlbmd0aCwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICByZXR1cm4gYmxvY2suZGVmKE5FWFQsICdbJywgaSwgJ10nKVxuICAgICAgICB9KVxuICAgICAgICBibG9jayhlbnYuY29uZChwYXJ0cy5tYXAoZnVuY3Rpb24gKHAsIGkpIHtcbiAgICAgICAgICByZXR1cm4gcCArICc9PT0nICsgQ1VSUkVOVCArICdbJyArIGkgKyAnXSdcbiAgICAgICAgfSkuam9pbignJiYnKSlcbiAgICAgICAgICAudGhlbihcbiAgICAgICAgICAgIEdMLCAnLicsIEdMX1ZBUklBQkxFU1twYXJhbV0sICcoJywgcGFydHMsICcpOycsXG4gICAgICAgICAgICBwYXJ0cy5tYXAoZnVuY3Rpb24gKHAsIGkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIENVUlJFTlQgKyAnWycgKyBpICsgJ109JyArIHBcbiAgICAgICAgICAgIH0pLmpvaW4oJzsnKSwgJzsnKSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIE5FWFQgPSBibG9jay5kZWYoTkVYVF9TVEFURSwgJy4nLCBwYXJhbSlcbiAgICAgICAgdmFyIGlmdGUgPSBlbnYuY29uZChORVhULCAnIT09JywgQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSlcbiAgICAgICAgYmxvY2soaWZ0ZSlcbiAgICAgICAgaWYgKHBhcmFtIGluIEdMX0ZMQUdTKSB7XG4gICAgICAgICAgaWZ0ZShcbiAgICAgICAgICAgIGVudi5jb25kKE5FWFQpXG4gICAgICAgICAgICAgICAgLnRoZW4oR0wsICcuZW5hYmxlKCcsIEdMX0ZMQUdTW3BhcmFtXSwgJyk7JylcbiAgICAgICAgICAgICAgICAuZWxzZShHTCwgJy5kaXNhYmxlKCcsIEdMX0ZMQUdTW3BhcmFtXSwgJyk7JyksXG4gICAgICAgICAgICBDVVJSRU5UX1NUQVRFLCAnLicsIHBhcmFtLCAnPScsIE5FWFQsICc7JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZnRlKFxuICAgICAgICAgICAgR0wsICcuJywgR0xfVkFSSUFCTEVTW3BhcmFtXSwgJygnLCBORVhULCAnKTsnLFxuICAgICAgICAgICAgQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSwgJz0nLCBORVhULCAnOycpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KVxuICAgIGlmIChPYmplY3Qua2V5cyhhcmdzLnN0YXRlKS5sZW5ndGggPT09IDApIHtcbiAgICAgIGJsb2NrKENVUlJFTlRfU1RBVEUsICcuZGlydHk9ZmFsc2U7JylcbiAgICB9XG4gICAgc2NvcGUoYmxvY2spXG4gIH1cblxuICBmdW5jdGlvbiBlbWl0U2V0T3B0aW9ucyAoZW52LCBzY29wZSwgb3B0aW9ucywgZmlsdGVyKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgQ1VSUkVOVF9WQVJTID0gZW52LmN1cnJlbnRcbiAgICB2YXIgQ1VSUkVOVF9TVEFURSA9IHNoYXJlZC5jdXJyZW50XG4gICAgdmFyIEdMID0gc2hhcmVkLmdsXG4gICAgc29ydFN0YXRlKE9iamVjdC5rZXlzKG9wdGlvbnMpKS5mb3JFYWNoKGZ1bmN0aW9uIChwYXJhbSkge1xuICAgICAgdmFyIGRlZm4gPSBvcHRpb25zW3BhcmFtXVxuICAgICAgaWYgKGZpbHRlciAmJiAhZmlsdGVyKGRlZm4pKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgdmFyIHZhcmlhYmxlID0gZGVmbi5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgIGlmIChHTF9GTEFHU1twYXJhbV0pIHtcbiAgICAgICAgdmFyIGZsYWcgPSBHTF9GTEFHU1twYXJhbV1cbiAgICAgICAgaWYgKGlzU3RhdGljKGRlZm4pKSB7XG4gICAgICAgICAgaWYgKHZhcmlhYmxlKSB7XG4gICAgICAgICAgICBzY29wZShHTCwgJy5lbmFibGUoJywgZmxhZywgJyk7JylcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2NvcGUoR0wsICcuZGlzYWJsZSgnLCBmbGFnLCAnKTsnKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzY29wZShlbnYuY29uZCh2YXJpYWJsZSlcbiAgICAgICAgICAgIC50aGVuKEdMLCAnLmVuYWJsZSgnLCBmbGFnLCAnKTsnKVxuICAgICAgICAgICAgLmVsc2UoR0wsICcuZGlzYWJsZSgnLCBmbGFnLCAnKTsnKSlcbiAgICAgICAgfVxuICAgICAgICBzY29wZShDVVJSRU5UX1NUQVRFLCAnLicsIHBhcmFtLCAnPScsIHZhcmlhYmxlLCAnOycpXG4gICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkodmFyaWFibGUpKSB7XG4gICAgICAgIHZhciBDVVJSRU5UID0gQ1VSUkVOVF9WQVJTW3BhcmFtXVxuICAgICAgICBzY29wZShcbiAgICAgICAgICBHTCwgJy4nLCBHTF9WQVJJQUJMRVNbcGFyYW1dLCAnKCcsIHZhcmlhYmxlLCAnKTsnLFxuICAgICAgICAgIHZhcmlhYmxlLm1hcChmdW5jdGlvbiAodiwgaSkge1xuICAgICAgICAgICAgcmV0dXJuIENVUlJFTlQgKyAnWycgKyBpICsgJ109JyArIHZcbiAgICAgICAgICB9KS5qb2luKCc7JyksICc7JylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgIEdMLCAnLicsIEdMX1ZBUklBQkxFU1twYXJhbV0sICcoJywgdmFyaWFibGUsICcpOycsXG4gICAgICAgICAgQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSwgJz0nLCB2YXJpYWJsZSwgJzsnKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBpbmplY3RFeHRlbnNpb25zIChlbnYsIHNjb3BlKSB7XG4gICAgaWYgKGV4dEluc3RhbmNpbmcgJiYgIWVudi5pbnN0YW5jaW5nKSB7XG4gICAgICBlbnYuaW5zdGFuY2luZyA9IHNjb3BlLmRlZihcbiAgICAgICAgZW52LnNoYXJlZC5leHRlbnNpb25zLCAnLmFuZ2xlX2luc3RhbmNlZF9hcnJheXMnKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRBdHRyaWJ1dGVzIChlbnYsIHNjb3BlLCBhcmdzLCBhdHRyaWJ1dGVzLCBmaWx0ZXIpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuXG4gICAgZnVuY3Rpb24gdHlwZUxlbmd0aCAoeCkge1xuICAgICAgc3dpdGNoICh4KSB7XG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMjpcbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDMjpcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzI6XG4gICAgICAgICAgcmV0dXJuIDJcbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMzOlxuICAgICAgICBjYXNlIEdMX0lOVF9WRUMzOlxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMzpcbiAgICAgICAgICByZXR1cm4gM1xuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzQ6XG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzQ6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUM0OlxuICAgICAgICAgIHJldHVybiA0XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgcmV0dXJuIDFcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlbWl0QmluZEF0dHJpYnV0ZSAoQVRUUklCVVRFLCBzaXplLCByZWNvcmQpIHtcbiAgICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuXG4gICAgICB2YXIgTE9DQVRJT04gPSBzY29wZS5kZWYoQVRUUklCVVRFLCAnLmxvY2F0aW9uJylcbiAgICAgIHZhciBCSU5ESU5HID0gc2NvcGUuZGVmKHNoYXJlZC5hdHRyaWJ1dGVzLCAnWycsIExPQ0FUSU9OLCAnXScpXG5cbiAgICAgIHZhciBTVEFURSA9IHJlY29yZC5zdGF0ZVxuICAgICAgdmFyIEJVRkZFUiA9IHJlY29yZC5idWZmZXJcbiAgICAgIHZhciBDT05TVF9DT01QT05FTlRTID0gW1xuICAgICAgICByZWNvcmQueCxcbiAgICAgICAgcmVjb3JkLnksXG4gICAgICAgIHJlY29yZC56LFxuICAgICAgICByZWNvcmQud1xuICAgICAgXVxuXG4gICAgICB2YXIgQ09NTU9OX0tFWVMgPSBbXG4gICAgICAgICdidWZmZXInLFxuICAgICAgICAnbm9ybWFsaXplZCcsXG4gICAgICAgICdvZmZzZXQnLFxuICAgICAgICAnc3RyaWRlJ1xuICAgICAgXVxuXG4gICAgICBmdW5jdGlvbiBlbWl0QnVmZmVyICgpIHtcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgJ2lmKCEnLCBCSU5ESU5HLCAnLnBvaW50ZXIpeycsXG4gICAgICAgICAgR0wsICcuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkoJywgTE9DQVRJT04sICcpOycsXG4gICAgICAgICAgQklORElORywgJy5wb2ludGVyPXRydWU7fScpXG5cbiAgICAgICAgdmFyIFRZUEUgPSByZWNvcmQudHlwZVxuICAgICAgICB2YXIgU0laRVxuICAgICAgICBpZiAoIXJlY29yZC5zaXplKSB7XG4gICAgICAgICAgU0laRSA9IHNpemVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBTSVpFID0gc2NvcGUuZGVmKHJlY29yZC5zaXplLCAnfHwnLCBzaXplKVxuICAgICAgICB9XG5cbiAgICAgICAgc2NvcGUoJ2lmKCcsXG4gICAgICAgICAgQklORElORywgJy50eXBlIT09JywgVFlQRSwgJ3x8JyxcbiAgICAgICAgICBCSU5ESU5HLCAnLnNpemUhPT0nLCBTSVpFLCAnfHwnLFxuICAgICAgICAgIENPTU1PTl9LRVlTLm1hcChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgICByZXR1cm4gQklORElORyArICcuJyArIGtleSArICchPT0nICsgcmVjb3JkW2tleV1cbiAgICAgICAgICB9KS5qb2luKCd8fCcpLFxuICAgICAgICAgICcpeycsXG4gICAgICAgICAgR0wsICcuYmluZEJ1ZmZlcignLCBHTF9BUlJBWV9CVUZGRVIsICcsJywgQlVGRkVSLCAnLmJ1ZmZlcik7JyxcbiAgICAgICAgICBHTCwgJy52ZXJ0ZXhBdHRyaWJQb2ludGVyKCcsIFtcbiAgICAgICAgICAgIExPQ0FUSU9OLFxuICAgICAgICAgICAgU0laRSxcbiAgICAgICAgICAgIFRZUEUsXG4gICAgICAgICAgICByZWNvcmQubm9ybWFsaXplZCxcbiAgICAgICAgICAgIHJlY29yZC5zdHJpZGUsXG4gICAgICAgICAgICByZWNvcmQub2Zmc2V0XG4gICAgICAgICAgXSwgJyk7JyxcbiAgICAgICAgICBCSU5ESU5HLCAnLnR5cGU9JywgVFlQRSwgJzsnLFxuICAgICAgICAgIEJJTkRJTkcsICcuc2l6ZT0nLCBTSVpFLCAnOycsXG4gICAgICAgICAgQ09NTU9OX0tFWVMubWFwKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICAgIHJldHVybiBCSU5ESU5HICsgJy4nICsga2V5ICsgJz0nICsgcmVjb3JkW2tleV0gKyAnOydcbiAgICAgICAgICB9KS5qb2luKCcnKSxcbiAgICAgICAgICAnfScpXG5cbiAgICAgICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcbiAgICAgICAgICB2YXIgRElWSVNPUiA9IHJlY29yZC5kaXZpc29yXG4gICAgICAgICAgc2NvcGUoXG4gICAgICAgICAgICAnaWYoJywgQklORElORywgJy5kaXZpc29yIT09JywgRElWSVNPUiwgJyl7JyxcbiAgICAgICAgICAgIGVudi5pbnN0YW5jaW5nLCAnLnZlcnRleEF0dHJpYkRpdmlzb3JBTkdMRSgnLCBbTE9DQVRJT04sIERJVklTT1JdLCAnKTsnLFxuICAgICAgICAgICAgQklORElORywgJy5kaXZpc29yPScsIERJVklTT1IsICc7fScpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gZW1pdENvbnN0YW50ICgpIHtcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgJ2lmKCcsIEJJTkRJTkcsICcucG9pbnRlcil7JyxcbiAgICAgICAgICBHTCwgJy5kaXNhYmxlVmVydGV4QXR0cmliQXJyYXkoJywgTE9DQVRJT04sICcpOycsXG4gICAgICAgICAgQklORElORywgJy5wb2ludGVyPWZhbHNlOycsXG4gICAgICAgICAgJ31pZignLCBDVVRFX0NPTVBPTkVOVFMubWFwKGZ1bmN0aW9uIChjLCBpKSB7XG4gICAgICAgICAgICByZXR1cm4gQklORElORyArICcuJyArIGMgKyAnIT09JyArIENPTlNUX0NPTVBPTkVOVFNbaV1cbiAgICAgICAgICB9KS5qb2luKCd8fCcpLCAnKXsnLFxuICAgICAgICAgIEdMLCAnLnZlcnRleEF0dHJpYjRmKCcsIExPQ0FUSU9OLCAnLCcsIENPTlNUX0NPTVBPTkVOVFMsICcpOycsXG4gICAgICAgICAgQ1VURV9DT01QT05FTlRTLm1hcChmdW5jdGlvbiAoYywgaSkge1xuICAgICAgICAgICAgcmV0dXJuIEJJTkRJTkcgKyAnLicgKyBjICsgJz0nICsgQ09OU1RfQ09NUE9ORU5UU1tpXSArICc7J1xuICAgICAgICAgIH0pLmpvaW4oJycpLFxuICAgICAgICAgICd9JylcbiAgICAgIH1cblxuICAgICAgaWYgKFNUQVRFID09PSBBVFRSSUJfU1RBVEVfUE9JTlRFUikge1xuICAgICAgICBlbWl0QnVmZmVyKClcbiAgICAgIH0gZWxzZSBpZiAoU1RBVEUgPT09IEFUVFJJQl9TVEFURV9DT05TVEFOVCkge1xuICAgICAgICBlbWl0Q29uc3RhbnQoKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2NvcGUoJ2lmKCcsIFNUQVRFLCAnPT09JywgQVRUUklCX1NUQVRFX1BPSU5URVIsICcpeycpXG4gICAgICAgIGVtaXRCdWZmZXIoKVxuICAgICAgICBzY29wZSgnfWVsc2V7JylcbiAgICAgICAgZW1pdENvbnN0YW50KClcbiAgICAgICAgc2NvcGUoJ30nKVxuICAgICAgfVxuICAgIH1cblxuICAgIGF0dHJpYnV0ZXMuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICB2YXIgbmFtZSA9IGF0dHJpYnV0ZS5uYW1lXG4gICAgICB2YXIgYXJnID0gYXJncy5hdHRyaWJ1dGVzW25hbWVdXG4gICAgICB2YXIgcmVjb3JkXG4gICAgICBpZiAoYXJnKSB7XG4gICAgICAgIGlmICghZmlsdGVyKGFyZykpIHtcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICByZWNvcmQgPSBhcmcuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoIWZpbHRlcihTQ09QRV9ERUNMKSkge1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIHZhciBzY29wZUF0dHJpYiA9IGVudi5zY29wZUF0dHJpYihuYW1lKVxuICAgICAgICBcbiAgICAgICAgcmVjb3JkID0ge31cbiAgICAgICAgT2JqZWN0LmtleXMobmV3IEF0dHJpYnV0ZVJlY29yZCgpKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICByZWNvcmRba2V5XSA9IHNjb3BlLmRlZihzY29wZUF0dHJpYiwgJy4nLCBrZXkpXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgICBlbWl0QmluZEF0dHJpYnV0ZShcbiAgICAgICAgZW52LmxpbmsoYXR0cmlidXRlKSwgdHlwZUxlbmd0aChhdHRyaWJ1dGUuaW5mby50eXBlKSwgcmVjb3JkKVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBlbWl0VW5pZm9ybXMgKGVudiwgc2NvcGUsIGFyZ3MsIHVuaWZvcm1zLCBmaWx0ZXIpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuXG4gICAgdmFyIGluZml4XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB1bmlmb3Jtcy5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIHVuaWZvcm0gPSB1bmlmb3Jtc1tpXVxuICAgICAgdmFyIG5hbWUgPSB1bmlmb3JtLm5hbWVcbiAgICAgIHZhciB0eXBlID0gdW5pZm9ybS5pbmZvLnR5cGVcbiAgICAgIHZhciBhcmcgPSBhcmdzLnVuaWZvcm1zW25hbWVdXG4gICAgICB2YXIgVU5JRk9STSA9IGVudi5saW5rKHVuaWZvcm0pXG4gICAgICB2YXIgTE9DQVRJT04gPSBVTklGT1JNICsgJy5sb2NhdGlvbidcblxuICAgICAgdmFyIFZBTFVFXG4gICAgICBpZiAoYXJnKSB7XG4gICAgICAgIGlmICghZmlsdGVyKGFyZykpIHtcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9XG4gICAgICAgIGlmIChhcmcuc3RhdGljKSB7XG4gICAgICAgICAgdmFyIHZhbHVlID0gYXJnLnZhbHVlXG4gICAgICAgICAgaWYgKHR5cGUgPT09IEdMX1NBTVBMRVJfMkQgfHwgdHlwZSA9PT0gR0xfU0FNUExFUl9DVUJFKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZhciBURVhfVkFMVUUgPSBlbnYubGluayh2YWx1ZS5fdGV4dHVyZSlcbiAgICAgICAgICAgIHNjb3BlKEdMLCAnLnVuaWZvcm0xaSgnLCBMT0NBVElPTiwgVEVYX1ZBTFVFICsgJy5iaW5kKCkpOycpXG4gICAgICAgICAgICBzY29wZS5leGl0KFRFWF9WQUxVRSwgJy51bmJpbmQoKScpXG4gICAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICAgIHR5cGUgPT09IEdMX0ZMT0FUX01BVDIgfHxcbiAgICAgICAgICAgIHR5cGUgPT09IEdMX0ZMT0FUX01BVDMgfHxcbiAgICAgICAgICAgIHR5cGUgPT09IEdMX0ZMT0FUX01BVDQpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmFyIE1BVF9WQUxVRSA9IGVudi5nbG9iYWwuZGVmKCdbJyArIHZhbHVlICsgJ10nKVxuICAgICAgICAgICAgdmFyIGRpbSA9IDJcbiAgICAgICAgICAgIGlmICh0eXBlID09PSBHTF9GTE9BVF9NQVQzKSB7XG4gICAgICAgICAgICAgIGRpbSA9IDNcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gR0xfRkxPQVRfTUFUNCkge1xuICAgICAgICAgICAgICBkaW0gPSA0XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzY29wZShcbiAgICAgICAgICAgICAgR0wsICcudW5pZm9ybU1hdHJpeCcsIGRpbSwgJ2Z2KCcsXG4gICAgICAgICAgICAgIExPQ0FUSU9OLCAnLGZhbHNlLCcsIE1BVF9WQUxVRSwgJyk7JylcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgICAgIGNhc2UgR0xfRkxPQVQ6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMWYnXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMyOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzJmJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMzpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICczZidcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzQ6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnNGYnXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9CT09MOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzFpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfSU5UOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzFpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfQk9PTF9WRUMyOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzJpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfSU5UX1ZFQzI6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMmknXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzM6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnM2knXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9JTlRfVkVDMzpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICczaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0JPT0xfVkVDNDpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICc0aSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0lOVF9WRUM0OlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzRpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzY29wZShHTCwgJy51bmlmb3JtJywgaW5maXgsICcoJywgTE9DQVRJT04sICcsJywgdmFsdWUsICcpOycpXG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgVkFMVUUgPSBhcmcuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICghZmlsdGVyKFNDT1BFX0RFQ0wpKSB7XG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuICAgICAgICBWQUxVRSA9IHNjb3BlLmRlZihzaGFyZWQudW5pZm9ybXMsICdbJywgc3RyaW5nU3RvcmUuaWQobmFtZSksICddJylcbiAgICAgIH1cblxuICAgICAgLy8gcGVyZm9ybSB0eXBlIHZhbGlkYXRpb25cbiAgICAgIFxuXG4gICAgICB2YXIgc2VwYXJhdG9yID0gJywnXG4gICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgY2FzZSBHTF9TQU1QTEVSXzJEOlxuICAgICAgICBjYXNlIEdMX1NBTVBMRVJfQ1VCRTpcbiAgICAgICAgICB2YXIgVEVYID0gc2NvcGUuZGVmKFZBTFVFLCAnLl90ZXh0dXJlJylcbiAgICAgICAgICBzY29wZShHTCwgJy51bmlmb3JtMWkoJywgTE9DQVRJT04sICcsJywgVEVYLCAnLmJpbmQoKSk7JylcbiAgICAgICAgICBzY29wZS5leGl0KFRFWCwgJy51bmJpbmQoKTsnKVxuICAgICAgICAgIGNvbnRpbnVlXG5cbiAgICAgICAgY2FzZSBHTF9JTlQ6XG4gICAgICAgIGNhc2UgR0xfQk9PTDpcbiAgICAgICAgICBpbmZpeCA9ICcxaSdcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzI6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUMyOlxuICAgICAgICAgIGluZml4ID0gJzJpdidcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzM6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUMzOlxuICAgICAgICAgIGluZml4ID0gJzNpdidcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzQ6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUM0OlxuICAgICAgICAgIGluZml4ID0gJzRpdidcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVQ6XG4gICAgICAgICAgaW5maXggPSAnMWYnXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzI6XG4gICAgICAgICAgaW5maXggPSAnMmZ2J1xuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMzOlxuICAgICAgICAgIGluZml4ID0gJzNmdidcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDNDpcbiAgICAgICAgICBpbmZpeCA9ICc0ZnYnXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUX01BVDI6XG4gICAgICAgICAgaW5maXggPSAnTWF0cml4MmZ2J1xuICAgICAgICAgIHNlcGFyYXRvciA9ICcsZmFsc2UsJ1xuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVF9NQVQzOlxuICAgICAgICAgIGluZml4ID0gJ01hdHJpeDNmdidcbiAgICAgICAgICBzZXBhcmF0b3IgPSAnLGZhbHNlLCdcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfTUFUNDpcbiAgICAgICAgICBpbmZpeCA9ICdNYXRyaXg0ZnYnXG4gICAgICAgICAgc2VwYXJhdG9yID0gJyxmYWxzZSwnXG4gICAgICAgICAgYnJlYWtcbiAgICAgIH1cbiAgICAgIHNjb3BlKEdMLCAnLnVuaWZvcm0nLCBpbmZpeCwgJygnLCBMT0NBVElPTiwgc2VwYXJhdG9yLCBWQUxVRSwgJyk7JylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBlbWl0RHJhdyAoZW52LCBvdXRlciwgaW5uZXIsIGFyZ3MpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuICAgIHZhciBEUkFXX1NUQVRFID0gc2hhcmVkLmRyYXdcblxuICAgIHZhciBkcmF3T3B0aW9ucyA9IGFyZ3MuZHJhd1xuXG4gICAgZnVuY3Rpb24gZW1pdEVsZW1lbnRzICgpIHtcbiAgICAgIHZhciBkZWZuID0gZHJhd09wdGlvbnMuZWxlbWVudHNcbiAgICAgIHZhciBFTEVNRU5UU1xuICAgICAgdmFyIHNjb3BlID0gb3V0ZXJcbiAgICAgIGlmIChkZWZuKSB7XG4gICAgICAgIGlmICghZGVmbi5iYXRjaFN0YXRpYykge1xuICAgICAgICAgIHNjb3BlID0gaW5uZXJcbiAgICAgICAgfVxuICAgICAgICBFTEVNRU5UUyA9IGRlZm4uYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBFTEVNRU5UUyA9IHNjb3BlLmRlZihEUkFXX1NUQVRFLCAnLicsIFNfRUxFTUVOVFMpXG4gICAgICB9XG4gICAgICBpZiAoRUxFTUVOVFMpIHtcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgJ2lmKCcgKyBFTEVNRU5UUyArICcpJyArXG4gICAgICAgICAgR0wgKyAnLmJpbmRCdWZmZXIoJyArIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSICsgJywnICsgRUxFTUVOVFMgKyAnLmJ1ZmZlci5idWZmZXIpOycpXG4gICAgICB9XG4gICAgICByZXR1cm4gRUxFTUVOVFNcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlbWl0Q291bnQgKCkge1xuICAgICAgdmFyIGRlZm4gPSBkcmF3T3B0aW9ucy5jb3VudFxuICAgICAgdmFyIENPVU5UXG4gICAgICB2YXIgc2NvcGUgPSBvdXRlclxuICAgICAgaWYgKGRlZm4pIHtcbiAgICAgICAgaWYgKCFkZWZuLmJhdGNoU3RhdGljKSB7XG4gICAgICAgICAgc2NvcGUgPSBpbm5lclxuICAgICAgICB9XG4gICAgICAgIENPVU5UID0gZGVmbi5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgICAgXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBDT1VOVCA9IHNjb3BlLmRlZihEUkFXX1NUQVRFLCAnLicsIFNfQ09VTlQpXG4gICAgICB9XG4gICAgICByZXR1cm4gQ09VTlRcbiAgICB9XG5cbiAgICB2YXIgRUxFTUVOVFMgPSBlbWl0RWxlbWVudHMoKVxuICAgIGZ1bmN0aW9uIGVtaXRWYWx1ZSAobmFtZSkge1xuICAgICAgdmFyIGRlZm4gPSBkcmF3T3B0aW9uc1tuYW1lXVxuICAgICAgaWYgKGRlZm4pIHtcbiAgICAgICAgaWYgKGRlZm4uYmF0Y2hTdGF0aWMpIHtcbiAgICAgICAgICByZXR1cm4gZGVmbi5hcHBlbmQoZW52LCBvdXRlcilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gZGVmbi5hcHBlbmQoZW52LCBpbm5lcilcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG91dGVyLmRlZihEUkFXX1NUQVRFLCAnLicsIG5hbWUpXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIFBSSU1JVElWRSA9IGVtaXRWYWx1ZShTX1BSSU1JVElWRSlcbiAgICB2YXIgT0ZGU0VUID0gZW1pdFZhbHVlKFNfT0ZGU0VUKVxuXG4gICAgdmFyIENPVU5UID0gZW1pdENvdW50KClcbiAgICBpZiAodHlwZW9mIENPVU5UID09PSAnbnVtYmVyJykge1xuICAgICAgaWYgKENPVU5UID09PSAwKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpbm5lcignaWYoJywgQ09VTlQsICcpeycpXG4gICAgICBpbm5lci5leGl0KCd9JylcbiAgICB9XG5cbiAgICB2YXIgSU5TVEFOQ0VTLCBFWFRfSU5TVEFOQ0lOR1xuICAgIGlmIChleHRJbnN0YW5jaW5nKSB7XG4gICAgICBJTlNUQU5DRVMgPSBlbWl0VmFsdWUoU19JTlNUQU5DRVMpXG4gICAgICBFWFRfSU5TVEFOQ0lORyA9IGVudi5pbnN0YW5jaW5nXG4gICAgfVxuXG4gICAgdmFyIEVMRU1FTlRfVFlQRSA9IEVMRU1FTlRTICsgJy50eXBlJ1xuXG4gICAgdmFyIGVsZW1lbnRzU3RhdGljID0gZHJhd09wdGlvbnMuZWxlbWVudHMgJiYgaXNTdGF0aWMoZHJhd09wdGlvbnMuZWxlbWVudHMpXG5cbiAgICBmdW5jdGlvbiBlbWl0SW5zdGFuY2luZyAoKSB7XG4gICAgICBmdW5jdGlvbiBkcmF3RWxlbWVudHMgKCkge1xuICAgICAgICBpbm5lcihFWFRfSU5TVEFOQ0lORywgJy5kcmF3RWxlbWVudHNJbnN0YW5jZWRBTkdMRSgnLCBbXG4gICAgICAgICAgUFJJTUlUSVZFLFxuICAgICAgICAgIENPVU5ULFxuICAgICAgICAgIEVMRU1FTlRfVFlQRSxcbiAgICAgICAgICBPRkZTRVQgKyAnPDwoKCcgKyBFTEVNRU5UX1RZUEUgKyAnLScgKyBHTF9VTlNJR05FRF9CWVRFICsgJyk+PjEpJyxcbiAgICAgICAgICBJTlNUQU5DRVNcbiAgICAgICAgXSwgJyk7JylcbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gZHJhd0FycmF5cyAoKSB7XG4gICAgICAgIGlubmVyKEVYVF9JTlNUQU5DSU5HLCAnLmRyYXdBcnJheXNJbnN0YW5jZWRBTkdMRSgnLFxuICAgICAgICAgIFtQUklNSVRJVkUsIE9GRlNFVCwgQ09VTlQsIElOU1RBTkNFU10sICcpOycpXG4gICAgICB9XG5cbiAgICAgIGlmIChFTEVNRU5UUykge1xuICAgICAgICBpZiAoIWVsZW1lbnRzU3RhdGljKSB7XG4gICAgICAgICAgaW5uZXIoJ2lmKCcsIEVMRU1FTlRTLCAnKXsnKVxuICAgICAgICAgIGRyYXdFbGVtZW50cygpXG4gICAgICAgICAgaW5uZXIoJ31lbHNleycpXG4gICAgICAgICAgZHJhd0FycmF5cygpXG4gICAgICAgICAgaW5uZXIoJ30nKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRyYXdFbGVtZW50cygpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRyYXdBcnJheXMoKVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVtaXRSZWd1bGFyICgpIHtcbiAgICAgIGZ1bmN0aW9uIGRyYXdFbGVtZW50cyAoKSB7XG4gICAgICAgIGlubmVyKEdMICsgJy5kcmF3RWxlbWVudHMoJyArIFtcbiAgICAgICAgICBQUklNSVRJVkUsXG4gICAgICAgICAgQ09VTlQsXG4gICAgICAgICAgRUxFTUVOVF9UWVBFLFxuICAgICAgICAgIE9GRlNFVCArICc8PCgoJyArIEVMRU1FTlRfVFlQRSArICctJyArIEdMX1VOU0lHTkVEX0JZVEUgKyAnKT4+MSknXG4gICAgICAgIF0gKyAnKTsnKVxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBkcmF3QXJyYXlzICgpIHtcbiAgICAgICAgaW5uZXIoR0wgKyAnLmRyYXdBcnJheXMoJyArIFtQUklNSVRJVkUsIE9GRlNFVCwgQ09VTlRdICsgJyk7JylcbiAgICAgIH1cblxuICAgICAgaWYgKEVMRU1FTlRTKSB7XG4gICAgICAgIGlmICghZWxlbWVudHNTdGF0aWMpIHtcbiAgICAgICAgICBpbm5lcignaWYoJywgRUxFTUVOVFMsICcpeycpXG4gICAgICAgICAgZHJhd0VsZW1lbnRzKClcbiAgICAgICAgICBpbm5lcignfWVsc2V7JylcbiAgICAgICAgICBkcmF3QXJyYXlzKClcbiAgICAgICAgICBpbm5lcignfScpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZHJhd0VsZW1lbnRzKClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZHJhd0FycmF5cygpXG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGV4dEluc3RhbmNpbmcgJiYgKHR5cGVvZiBJTlNUQU5DRVMgIT09ICdudW1iZXInIHx8IElOU1RBTkNFUyA+PSAwKSkge1xuICAgICAgaWYgKHR5cGVvZiBJTlNUQU5DRVMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGlubmVyKCdpZignLCBJTlNUQU5DRVMsICc+MCl7JylcbiAgICAgICAgZW1pdEluc3RhbmNpbmcoKVxuICAgICAgICBpbm5lcignfWVsc2UgaWYoJywgSU5TVEFOQ0VTLCAnPDApeycpXG4gICAgICAgIGVtaXRSZWd1bGFyKClcbiAgICAgICAgaW5uZXIoJ30nKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZW1pdEluc3RhbmNpbmcoKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBlbWl0UmVndWxhcigpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlQm9keSAoZW1pdEJvZHksIHBhcmVudEVudiwgYXJncywgcHJvZ3JhbSwgY291bnQpIHtcbiAgICB2YXIgZW52ID0gY3JlYXRlUkVHTEVudmlyb25tZW50KClcbiAgICB2YXIgc2NvcGUgPSBlbnYucHJvYygnYm9keScsIGNvdW50KVxuICAgIFxuICAgIGlmIChleHRJbnN0YW5jaW5nKSB7XG4gICAgICBlbnYuaW5zdGFuY2luZyA9IHNjb3BlLmRlZihcbiAgICAgICAgZW52LnNoYXJlZC5leHRlbnNpb25zLCAnLmFuZ2xlX2luc3RhbmNlZF9hcnJheXMnKVxuICAgIH1cbiAgICBlbWl0Qm9keShlbnYsIHNjb3BlLCBhcmdzLCBwcm9ncmFtKVxuICAgIHJldHVybiBlbnYuY29tcGlsZSgpLmJvZHlcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gRFJBVyBQUk9DXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gZW1pdERyYXdCb2R5IChlbnYsIGRyYXcsIGFyZ3MsIHByb2dyYW0pIHtcbiAgICBpbmplY3RFeHRlbnNpb25zKGVudiwgZHJhdylcblxuICAgIGVtaXRBdHRyaWJ1dGVzKGVudiwgZHJhdywgYXJncywgcHJvZ3JhbS5hdHRyaWJ1dGVzLCBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH0pXG4gICAgZW1pdFVuaWZvcm1zKGVudiwgZHJhdywgYXJncywgcHJvZ3JhbS51bmlmb3JtcywgZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHRydWVcbiAgICB9KVxuICAgIGVtaXREcmF3KGVudiwgZHJhdywgZHJhdywgYXJncylcbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXREcmF3UHJvYyAoZW52LCBhcmdzKSB7XG4gICAgdmFyIGRyYXcgPSBlbnYucHJvYygnZHJhdycsIDEpXG5cbiAgICBpbmplY3RFeHRlbnNpb25zKGVudiwgZHJhdylcblxuICAgIGVtaXRDb250ZXh0KGVudiwgZHJhdywgYXJncy5jb250ZXh0KVxuICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCBkcmF3LCBhcmdzLmZyYW1lYnVmZmVyKVxuICAgIGVtaXRQb2xsU3RhdGUoZW52LCBkcmF3LCBhcmdzKVxuICAgIGVtaXRTZXRPcHRpb25zKGVudiwgZHJhdywgYXJncy5zdGF0ZSlcblxuICAgIHZhciBwcm9ncmFtID0gYXJncy5zaGFkZXIucHJvZ1Zhci5hcHBlbmQoZW52LCBkcmF3KVxuICAgIGRyYXcoZW52LnNoYXJlZC5nbCwgJy51c2VQcm9ncmFtKCcsIHByb2dyYW0sICcucHJvZ3JhbSk7JylcblxuICAgIGlmIChhcmdzLnNoYWRlci5wcm9ncmFtKSB7XG4gICAgICBlbWl0RHJhd0JvZHkoZW52LCBkcmF3LCBhcmdzLCBhcmdzLnNoYWRlci5wcm9ncmFtKVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgZHJhd0NhY2hlID0gZW52Lmdsb2JhbC5kZWYoJ3t9JylcbiAgICAgIHZhciBQUk9HX0lEID0gZHJhdy5kZWYocHJvZ3JhbSwgJy5pZCcpXG4gICAgICB2YXIgQ0FDSEVEX1BST0MgPSBkcmF3LmRlZihkcmF3Q2FjaGUsICdbJywgUFJPR19JRCwgJ10nKVxuICAgICAgZHJhdyhcbiAgICAgICAgZW52LmNvbmQoQ0FDSEVEX1BST0MpXG4gICAgICAgICAgLnRoZW4oQ0FDSEVEX1BST0MsICcuY2FsbCh0aGlzLGEwKTsnKVxuICAgICAgICAgIC5lbHNlKFxuICAgICAgICAgICAgQ0FDSEVEX1BST0MsICc9JywgZHJhd0NhY2hlLCAnWycsIFBST0dfSUQsICddPScsXG4gICAgICAgICAgICBlbnYubGluayhmdW5jdGlvbiAocHJvZ3JhbSkge1xuICAgICAgICAgICAgICByZXR1cm4gY3JlYXRlQm9keShlbWl0RHJhd0JvZHksIGVudiwgYXJncywgcHJvZ3JhbSwgMSlcbiAgICAgICAgICAgIH0pLCAnKCcsIHByb2dyYW0sICcpOycsXG4gICAgICAgICAgICBDQUNIRURfUFJPQywgJy5jYWxsKHRoaXMsYTApOycpKVxuICAgIH1cblxuICAgIGlmIChPYmplY3Qua2V5cyhhcmdzLnN0YXRlKS5sZW5ndGggPiAwKSB7XG4gICAgICBkcmF3KGVudi5zaGFyZWQuY3VycmVudCwgJy5kaXJ0eT10cnVlOycpXG4gICAgfVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBCQVRDSCBQUk9DXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICBmdW5jdGlvbiBlbWl0QmF0Y2hEeW5hbWljU2hhZGVyQm9keSAoZW52LCBzY29wZSwgYXJncywgcHJvZ3JhbSkge1xuICAgIGVudi5iYXRjaElkID0gJ2ExJ1xuXG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIHNjb3BlKVxuXG4gICAgZnVuY3Rpb24gYWxsICgpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuXG4gICAgZW1pdEF0dHJpYnV0ZXMoZW52LCBzY29wZSwgYXJncywgcHJvZ3JhbS5hdHRyaWJ1dGVzLCBhbGwpXG4gICAgZW1pdFVuaWZvcm1zKGVudiwgc2NvcGUsIGFyZ3MsIHByb2dyYW0udW5pZm9ybXMsIGFsbClcbiAgICBlbWl0RHJhdyhlbnYsIHNjb3BlLCBzY29wZSwgYXJncylcbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRCYXRjaEJvZHkgKGVudiwgc2NvcGUsIGFyZ3MsIHByb2dyYW0pIHtcbiAgICBpbmplY3RFeHRlbnNpb25zKGVudiwgc2NvcGUpXG5cbiAgICB2YXIgY29udGV4dER5bmFtaWMgPSBhcmdzLmNvbnRleHREeW5hbWljXG5cbiAgICB2YXIgQkFUQ0hfSUQgPSBzY29wZS5kZWYoKVxuICAgIHZhciBQUk9QX0xJU1QgPSAnYTAnXG4gICAgdmFyIE5VTV9QUk9QUyA9ICdhMSdcbiAgICB2YXIgUFJPUFMgPSBzY29wZS5kZWYoKVxuICAgIGVudi5zaGFyZWQucHJvcHMgPSBQUk9QU1xuICAgIGVudi5iYXRjaElkID0gQkFUQ0hfSURcblxuICAgIHZhciBvdXRlciA9IGVudi5zY29wZSgpXG4gICAgdmFyIGlubmVyID0gZW52LnNjb3BlKClcblxuICAgIHNjb3BlKFxuICAgICAgb3V0ZXIuZW50cnksXG4gICAgICAnZm9yKCcsIEJBVENIX0lELCAnPTA7JywgQkFUQ0hfSUQsICc8JywgTlVNX1BST1BTLCAnOysrJywgQkFUQ0hfSUQsICcpeycsXG4gICAgICBQUk9QUywgJz0nLCBQUk9QX0xJU1QsICdbJywgQkFUQ0hfSUQsICddOycsXG4gICAgICBpbm5lcixcbiAgICAgICd9JyxcbiAgICAgIG91dGVyLmV4aXQpXG5cbiAgICBmdW5jdGlvbiBpc0lubmVyRGVmbiAoZGVmbikge1xuICAgICAgcmV0dXJuICgoZGVmbi5jb250ZXh0RGVwICYmIGNvbnRleHREeW5hbWljKSB8fCBkZWZuLnByb3BEZXApXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNPdXRlckRlZm4gKGRlZm4pIHtcbiAgICAgIHJldHVybiAhaXNJbm5lckRlZm4oZGVmbilcbiAgICB9XG5cbiAgICBpZiAoYXJncy5uZWVkc0NvbnRleHQpIHtcbiAgICAgIGVtaXRDb250ZXh0KGVudiwgaW5uZXIsIGFyZ3MuY29udGV4dClcbiAgICB9XG4gICAgaWYgKGFyZ3MubmVlZHNGcmFtZWJ1ZmZlcikge1xuICAgICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIGlubmVyLCBhcmdzLmZyYW1lYnVmZmVyKVxuICAgIH1cbiAgICBlbWl0U2V0T3B0aW9ucyhlbnYsIGlubmVyLCBhcmdzLnN0YXRlLCBpc0lubmVyRGVmbilcblxuICAgIGlmICghcHJvZ3JhbSkge1xuICAgICAgdmFyIHByb2dDYWNoZSA9IGVudi5nbG9iYWwuZGVmKCd7fScpXG4gICAgICB2YXIgUFJPR1JBTSA9IGFyZ3Muc2hhZGVyLnByb2dWYXIuYXBwZW5kKGVudiwgaW5uZXIpXG4gICAgICB2YXIgUFJPR19JRCA9IGlubmVyLmRlZihQUk9HUkFNLCAnLmlkJylcbiAgICAgIHZhciBDQUNIRURfUFJPQyA9IGlubmVyLmRlZihwcm9nQ2FjaGUsICdbJywgUFJPR19JRCwgJ10nKVxuICAgICAgaW5uZXIoXG4gICAgICAgIGVudi5zaGFyZWQuZ2wsICcudXNlUHJvZ3JhbSgnLCBQUk9HUkFNLCAnLnByb2dyYW0pOycsXG4gICAgICAgICdpZighJywgQ0FDSEVEX1BST0MsICcpeycsXG4gICAgICAgIENBQ0hFRF9QUk9DLCAnPScsIHByb2dDYWNoZSwgJ1snLCBQUk9HX0lELCAnXT0nLFxuICAgICAgICBlbnYubGluayhmdW5jdGlvbiAocHJvZ3JhbSkge1xuICAgICAgICAgIHJldHVybiBjcmVhdGVCb2R5KFxuICAgICAgICAgICAgZW1pdEJhdGNoRHluYW1pY1NoYWRlckJvZHksIGVudiwgYXJncywgcHJvZ3JhbSwgMilcbiAgICAgICAgfSksICcoJywgUFJPR1JBTSwgJyk7fScsXG4gICAgICAgIENBQ0hFRF9QUk9DLCAnLmNhbGwodGhpcyxhMFsnLCBCQVRDSF9JRCwgJ10sJywgQkFUQ0hfSUQsICcpOycpXG4gICAgfSBlbHNlIHtcbiAgICAgIGVtaXRBdHRyaWJ1dGVzKGVudiwgb3V0ZXIsIGFyZ3MsIHByb2dyYW0uYXR0cmlidXRlcywgaXNPdXRlckRlZm4pXG4gICAgICBlbWl0QXR0cmlidXRlcyhlbnYsIGlubmVyLCBhcmdzLCBwcm9ncmFtLmF0dHJpYnV0ZXMsIGlzSW5uZXJEZWZuKVxuICAgICAgZW1pdFVuaWZvcm1zKGVudiwgb3V0ZXIsIGFyZ3MsIHByb2dyYW0udW5pZm9ybXMsIGlzT3V0ZXJEZWZuKVxuICAgICAgZW1pdFVuaWZvcm1zKGVudiwgaW5uZXIsIGFyZ3MsIHByb2dyYW0udW5pZm9ybXMsIGlzSW5uZXJEZWZuKVxuICAgICAgZW1pdERyYXcoZW52LCBvdXRlciwgaW5uZXIsIGFyZ3MpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdEJhdGNoUHJvYyAoZW52LCBhcmdzKSB7XG4gICAgdmFyIGJhdGNoID0gZW52LnByb2MoJ2JhdGNoJywgMilcbiAgICBlbnYuYmF0Y2hJZCA9ICcwJ1xuXG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIGJhdGNoKVxuXG4gICAgLy8gQ2hlY2sgaWYgYW55IGNvbnRleHQgdmFyaWFibGVzIGRlcGVuZCBvbiBwcm9wc1xuICAgIHZhciBjb250ZXh0RHluYW1pYyA9IGZhbHNlXG4gICAgdmFyIG5lZWRzQ29udGV4dCA9IHRydWVcbiAgICBPYmplY3Qua2V5cyhhcmdzLmNvbnRleHQpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIGNvbnRleHREeW5hbWljID0gY29udGV4dER5bmFtaWMgfHwgYXJncy5jb250ZXh0W25hbWVdLnByb3BEZXBcbiAgICB9KVxuICAgIGlmICghY29udGV4dER5bmFtaWMpIHtcbiAgICAgIGVtaXRDb250ZXh0KGVudiwgYmF0Y2gsIGFyZ3MuY29udGV4dClcbiAgICAgIG5lZWRzQ29udGV4dCA9IGZhbHNlXG4gICAgfVxuXG4gICAgLy8gZnJhbWVidWZmZXIgc3RhdGUgYWZmZWN0cyBmcmFtZWJ1ZmZlcldpZHRoL2hlaWdodCBjb250ZXh0IHZhcnNcbiAgICB2YXIgZnJhbWVidWZmZXIgPSBhcmdzLmZyYW1lYnVmZmVyXG4gICAgdmFyIG5lZWRzRnJhbWVidWZmZXIgPSBmYWxzZVxuICAgIGlmIChmcmFtZWJ1ZmZlcikge1xuICAgICAgaWYgKGZyYW1lYnVmZmVyLnByb3BEZXApIHtcbiAgICAgICAgY29udGV4dER5bmFtaWMgPSBuZWVkc0ZyYW1lYnVmZmVyID0gdHJ1ZVxuICAgICAgfSBlbHNlIGlmIChmcmFtZWJ1ZmZlci5jb250ZXh0RGVwICYmIGNvbnRleHREeW5hbWljKSB7XG4gICAgICAgIG5lZWRzRnJhbWVidWZmZXIgPSB0cnVlXG4gICAgICB9XG4gICAgICBpZiAoIW5lZWRzRnJhbWVidWZmZXIpIHtcbiAgICAgICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIGJhdGNoLCBmcmFtZWJ1ZmZlcilcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyB2aWV3cG9ydCBpcyB3ZWlyZCBiZWNhdXNlIGl0IGNhbiBhZmZlY3QgY29udGV4dCB2YXJzXG4gICAgaWYgKGFyZ3Muc3RhdGUudmlld3BvcnQgJiYgYXJncy5zdGF0ZS52aWV3cG9ydC5wcm9wRHluYW1pYykge1xuICAgICAgY29udGV4dER5bmFtaWMgPSB0cnVlXG4gICAgfVxuXG4gICAgLy8gc2V0IHdlYmdsIG9wdGlvbnNcbiAgICBlbWl0UG9sbFN0YXRlKGVudiwgYmF0Y2gsIGFyZ3MpXG4gICAgZW1pdFNldE9wdGlvbnMoZW52LCBiYXRjaCwgYXJncy5zdGF0ZSwgZnVuY3Rpb24gKGRlZm4pIHtcbiAgICAgIHJldHVybiAhKChkZWZuLmNvbnRleHREZXAgJiYgY29udGV4dER5bmFtaWMpIHx8IGRlZm4ucHJvcERlcClcbiAgICB9KVxuXG4gICAgLy8gU2F2ZSB0aGVzZSB2YWx1ZXMgdG8gYXJncyBzbyB0aGF0IHRoZSBiYXRjaCBib2R5IHJvdXRpbmUgY2FuIHVzZSB0aGVtXG4gICAgYXJncy5jb250ZXh0RGVwID0gY29udGV4dER5bmFtaWNcbiAgICBhcmdzLm5lZWRzQ29udGV4dCA9IG5lZWRzQ29udGV4dFxuICAgIGFyZ3MubmVlZHNGcmFtZWJ1ZmZlciA9IG5lZWRzRnJhbWVidWZmZXJcblxuICAgIC8vIGRldGVybWluZSBpZiBzaGFkZXIgaXMgZHluYW1pY1xuICAgIHZhciBwcm9nRGVmbiA9IGFyZ3Muc2hhZGVyLnByb2dWYXJcbiAgICBpZiAoKHByb2dEZWZuLmNvbnRleHREZXAgJiYgY29udGV4dER5bmFtaWMpIHx8IHByb2dEZWZuLnByb3BEZXApIHtcbiAgICAgIGVtaXRCYXRjaEJvZHkoXG4gICAgICAgIGVudixcbiAgICAgICAgYmF0Y2gsXG4gICAgICAgIGFyZ3MsXG4gICAgICAgIG51bGwpXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBQUk9HUkFNID0gcHJvZ0RlZm4uYXBwZW5kKGVudiwgYmF0Y2gpXG4gICAgICBiYXRjaChlbnYuc2hhcmVkLmdsLCAnLnVzZVByb2dyYW0oJywgUFJPR1JBTSwgJy5wcm9ncmFtKTsnKVxuICAgICAgaWYgKGFyZ3Muc2hhZGVyLnByb2dyYW0pIHtcbiAgICAgICAgZW1pdEJhdGNoQm9keShcbiAgICAgICAgICBlbnYsXG4gICAgICAgICAgYmF0Y2gsXG4gICAgICAgICAgYXJncyxcbiAgICAgICAgICBhcmdzLnNoYWRlci5wcm9ncmFtKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGJhdGNoQ2FjaGUgPSBlbnYuZ2xvYmFsLmRlZigne30nKVxuICAgICAgICB2YXIgUFJPR19JRCA9IGJhdGNoLmRlZihQUk9HUkFNLCAnLmlkJylcbiAgICAgICAgdmFyIENBQ0hFRF9QUk9DID0gYmF0Y2guZGVmKGJhdGNoQ2FjaGUsICdbJywgUFJPR19JRCwgJ10nKVxuICAgICAgICBiYXRjaChcbiAgICAgICAgICBlbnYuY29uZChDQUNIRURfUFJPQylcbiAgICAgICAgICAgIC50aGVuKENBQ0hFRF9QUk9DLCAnLmNhbGwodGhpcyxhMCxhMSk7JylcbiAgICAgICAgICAgIC5lbHNlKFxuICAgICAgICAgICAgICBDQUNIRURfUFJPQywgJz0nLCBiYXRjaENhY2hlLCAnWycsIFBST0dfSUQsICddPScsXG4gICAgICAgICAgICAgIGVudi5saW5rKGZ1bmN0aW9uIChwcm9ncmFtKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZUJvZHkoZW1pdEJhdGNoQm9keSwgZW52LCBhcmdzLCBwcm9ncmFtLCAyKVxuICAgICAgICAgICAgICB9KSwgJygnLCBQUk9HUkFNLCAnKTsnLFxuICAgICAgICAgICAgICBDQUNIRURfUFJPQywgJy5jYWxsKHRoaXMsYTAsYTEpOycpKVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChPYmplY3Qua2V5cyhhcmdzLnN0YXRlKS5sZW5ndGggPiAwKSB7XG4gICAgICBiYXRjaChlbnYuc2hhcmVkLmN1cnJlbnQsICcuZGlydHk9dHJ1ZTsnKVxuICAgIH1cbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gU0NPUEUgQ09NTUFORFxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGVtaXRTY29wZVByb2MgKGVudiwgYXJncykge1xuICAgIHZhciBzY29wZSA9IGVudi5wcm9jKCdzY29wZScsIDMpXG4gICAgZW52LmJhdGNoSWQgPSAnYTInXG5cbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgIHZhciBDVVJSRU5UX1NUQVRFID0gc2hhcmVkLmN1cnJlbnRcblxuICAgIGVtaXRDb250ZXh0KGVudiwgc2NvcGUsIGFyZ3MuY29udGV4dClcblxuICAgIGlmIChhcmdzLmZyYW1lYnVmZmVyKSB7XG4gICAgICBhcmdzLmZyYW1lYnVmZmVyLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgIH1cblxuICAgIHNvcnRTdGF0ZShPYmplY3Qua2V5cyhhcmdzLnN0YXRlKSkuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIGRlZm4gPSBhcmdzLnN0YXRlW25hbWVdXG4gICAgICB2YXIgdmFsdWUgPSBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICAgIHZhbHVlLmZvckVhY2goZnVuY3Rpb24gKHYsIGkpIHtcbiAgICAgICAgICBzY29wZS5zZXQoZW52Lm5leHRbbmFtZV0sICdbJyArIGkgKyAnXScsIHYpXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzY29wZS5zZXQoc2hhcmVkLm5leHQsICcuJyArIG5hbWUsIHZhbHVlKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICA7W1NfRUxFTUVOVFMsIFNfT0ZGU0VULCBTX0NPVU5ULCBTX0lOU1RBTkNFUywgU19QUklNSVRJVkVdLmZvckVhY2goXG4gICAgICBmdW5jdGlvbiAob3B0KSB7XG4gICAgICAgIHZhciB2YXJpYWJsZSA9IGFyZ3MuZHJhd1tvcHRdXG4gICAgICAgIGlmICghdmFyaWFibGUpIHtcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICBzY29wZS5zZXQoc2hhcmVkLmRyYXcsICcuJyArIG9wdCwgJycgKyB2YXJpYWJsZS5hcHBlbmQoZW52LCBzY29wZSkpXG4gICAgICB9KVxuXG4gICAgT2JqZWN0LmtleXMoYXJncy51bmlmb3JtcykuZm9yRWFjaChmdW5jdGlvbiAob3B0KSB7XG4gICAgICBzY29wZS5zZXQoXG4gICAgICAgIHNoYXJlZC51bmlmb3JtcyxcbiAgICAgICAgJ1snICsgc3RyaW5nU3RvcmUuaWQob3B0KSArICddJyxcbiAgICAgICAgYXJncy51bmlmb3Jtc1tvcHRdLmFwcGVuZChlbnYsIHNjb3BlKSlcbiAgICB9KVxuXG4gICAgT2JqZWN0LmtleXMoYXJncy5hdHRyaWJ1dGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICB2YXIgcmVjb3JkID0gYXJncy5hdHRyaWJ1dGVzW25hbWVdLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgdmFyIHNjb3BlQXR0cmliID0gZW52LnNjb3BlQXR0cmliKG5hbWUpXG4gICAgICBPYmplY3Qua2V5cyhuZXcgQXR0cmlidXRlUmVjb3JkKCkpLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgICAgc2NvcGUuc2V0KHNjb3BlQXR0cmliLCAnLicgKyBwcm9wLCByZWNvcmRbcHJvcF0pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBmdW5jdGlvbiBzYXZlU2hhZGVyIChuYW1lKSB7XG4gICAgICB2YXIgc2hhZGVyID0gYXJncy5zaGFkZXJbbmFtZV1cbiAgICAgIGlmIChzaGFkZXIpIHtcbiAgICAgICAgc2NvcGUuc2V0KHNoYXJlZC5zaGFkZXIsICcuJyArIG5hbWUsIHNoYWRlci5hcHBlbmQoZW52LCBzY29wZSkpXG4gICAgICB9XG4gICAgfVxuICAgIHNhdmVTaGFkZXIoU19WRVJUKVxuICAgIHNhdmVTaGFkZXIoU19GUkFHKVxuXG4gICAgaWYgKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpLmxlbmd0aCA+IDApIHtcbiAgICAgIHNjb3BlKENVUlJFTlRfU1RBVEUsICcuZGlydHk9dHJ1ZTsnKVxuICAgICAgc2NvcGUuZXhpdChDVVJSRU5UX1NUQVRFLCAnLmRpcnR5PXRydWU7JylcbiAgICB9XG5cbiAgICBzY29wZSgnYTEoJywgZW52LnNoYXJlZC5jb250ZXh0LCAnLGEwLDApOycpXG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIE1BSU4gRFJBVyBDT01NQU5EXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gY29tcGlsZUNvbW1hbmQgKG9wdGlvbnMsIGF0dHJpYnV0ZXMsIHVuaWZvcm1zLCBjb250ZXh0KSB7XG4gICAgdmFyIGVudiA9IGNyZWF0ZVJFR0xFbnZpcm9ubWVudCgpXG4gICAgdmFyIGFyZ3MgPSBwYXJzZUFyZ3VtZW50cyhvcHRpb25zLCBhdHRyaWJ1dGVzLCB1bmlmb3JtcywgY29udGV4dClcblxuICAgIGVtaXREcmF3UHJvYyhlbnYsIGFyZ3MpXG4gICAgZW1pdFNjb3BlUHJvYyhlbnYsIGFyZ3MpXG4gICAgZW1pdEJhdGNoUHJvYyhlbnYsIGFyZ3MpXG5cbiAgICByZXR1cm4gZW52LmNvbXBpbGUoKVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBQT0xMIC8gUkVGUkVTSFxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHJldHVybiB7XG4gICAgbmV4dDogbmV4dFN0YXRlLFxuICAgIGN1cnJlbnQ6IGN1cnJlbnRTdGF0ZSxcbiAgICBwcm9jczogKGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBlbnYgPSBjcmVhdGVSRUdMRW52aXJvbm1lbnQoKVxuICAgICAgdmFyIHBvbGwgPSBlbnYucHJvYygncG9sbCcpXG4gICAgICB2YXIgcmVmcmVzaCA9IGVudi5wcm9jKCdyZWZyZXNoJylcbiAgICAgIHZhciBjb21tb24gPSBlbnYuYmxvY2soKVxuICAgICAgcG9sbChjb21tb24pXG4gICAgICByZWZyZXNoKGNvbW1vbilcblxuICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuICAgICAgdmFyIE5FWFRfU1RBVEUgPSBzaGFyZWQubmV4dFxuICAgICAgdmFyIENVUlJFTlRfU1RBVEUgPSBzaGFyZWQuY3VycmVudFxuXG4gICAgICBjb21tb24oQ1VSUkVOVF9TVEFURSwgJy5kaXJ0eT1mYWxzZTsnKVxuXG4gICAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgcG9sbClcblxuICAgICAgcmVmcmVzaChzaGFyZWQuZnJhbWVidWZmZXIsICcuZGlydHk9dHJ1ZTsnKVxuICAgICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIHJlZnJlc2gpXG5cbiAgICAgIC8vIEZJWE1FOiByZWZyZXNoIHNob3VsZCB1cGRhdGUgdmVydGV4IGF0dHJpYnV0ZSBwb2ludGVyc1xuXG4gICAgICBPYmplY3Qua2V5cyhHTF9GTEFHUykuZm9yRWFjaChmdW5jdGlvbiAoZmxhZykge1xuICAgICAgICB2YXIgY2FwID0gR0xfRkxBR1NbZmxhZ11cbiAgICAgICAgdmFyIE5FWFQgPSBjb21tb24uZGVmKE5FWFRfU1RBVEUsICcuJywgZmxhZylcbiAgICAgICAgdmFyIGJsb2NrID0gZW52LmJsb2NrKClcbiAgICAgICAgYmxvY2soJ2lmKCcsIE5FWFQsICcpeycsXG4gICAgICAgICAgR0wsICcuZW5hYmxlKCcsIGNhcCwgJyl9ZWxzZXsnLFxuICAgICAgICAgIEdMLCAnLmRpc2FibGUoJywgY2FwLCAnKX0nLFxuICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgZmxhZywgJz0nLCBORVhULCAnOycpXG4gICAgICAgIHJlZnJlc2goYmxvY2spXG4gICAgICAgIHBvbGwoXG4gICAgICAgICAgJ2lmKCcsIE5FWFQsICchPT0nLCBDVVJSRU5UX1NUQVRFLCAnLicsIGZsYWcsICcpeycsXG4gICAgICAgICAgYmxvY2ssXG4gICAgICAgICAgJ30nKVxuICAgICAgfSlcblxuICAgICAgT2JqZWN0LmtleXMoR0xfVkFSSUFCTEVTKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgIHZhciBmdW5jID0gR0xfVkFSSUFCTEVTW25hbWVdXG4gICAgICAgIHZhciBpbml0ID0gY3VycmVudFN0YXRlW25hbWVdXG4gICAgICAgIHZhciBORVhULCBDVVJSRU5UXG4gICAgICAgIHZhciBibG9jayA9IGVudi5ibG9jaygpXG4gICAgICAgIGJsb2NrKEdMLCAnLicsIGZ1bmMsICcoJylcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoaW5pdCkpIHtcbiAgICAgICAgICB2YXIgbiA9IGluaXQubGVuZ3RoXG4gICAgICAgICAgTkVYVCA9IGVudi5nbG9iYWwuZGVmKE5FWFRfU1RBVEUsICcuJywgbmFtZSlcbiAgICAgICAgICBDVVJSRU5UID0gZW52Lmdsb2JhbC5kZWYoQ1VSUkVOVF9TVEFURSwgJy4nLCBuYW1lKVxuICAgICAgICAgIGJsb2NrKFxuICAgICAgICAgICAgbG9vcChuLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICByZXR1cm4gTkVYVCArICdbJyArIGkgKyAnXSdcbiAgICAgICAgICAgIH0pLCAnKTsnLFxuICAgICAgICAgICAgbG9vcChuLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICByZXR1cm4gQ1VSUkVOVCArICdbJyArIGkgKyAnXT0nICsgTkVYVCArICdbJyArIGkgKyAnXTsnXG4gICAgICAgICAgICB9KS5qb2luKCcnKSlcbiAgICAgICAgICBwb2xsKFxuICAgICAgICAgICAgJ2lmKCcsIGxvb3AobiwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIE5FWFQgKyAnWycgKyBpICsgJ10hPT0nICsgQ1VSUkVOVCArICdbJyArIGkgKyAnXSdcbiAgICAgICAgICAgIH0pLmpvaW4oJ3x8JyksICcpeycsXG4gICAgICAgICAgICBibG9jayxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBORVhUID0gY29tbW9uLmRlZihORVhUX1NUQVRFLCAnLicsIG5hbWUpXG4gICAgICAgICAgQ1VSUkVOVCA9IGNvbW1vbi5kZWYoQ1VSUkVOVF9TVEFURSwgJy4nLCBuYW1lKVxuICAgICAgICAgIGJsb2NrKFxuICAgICAgICAgICAgTkVYVCwgJyk7JyxcbiAgICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgbmFtZSwgJz0nLCBORVhULCAnOycpXG4gICAgICAgICAgcG9sbChcbiAgICAgICAgICAgICdpZignLCBORVhULCAnIT09JywgQ1VSUkVOVCwgJyl7JyxcbiAgICAgICAgICAgIGJsb2NrLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICB9XG4gICAgICAgIHJlZnJlc2goYmxvY2spXG4gICAgICB9KVxuXG4gICAgICByZXR1cm4gZW52LmNvbXBpbGUoKVxuICAgIH0pKCksXG4gICAgY29tcGlsZTogY29tcGlsZUNvbW1hbmRcbiAgfVxufVxuIiwiXG5cbnZhciBWQVJJQUJMRV9DT1VOVEVSID0gMFxuXG52YXIgRFlOX0ZVTkMgPSAwXG52YXIgRFlOX1BFTkRJTkdfRkxBRyA9IDEyOFxuXG5mdW5jdGlvbiBEeW5hbWljVmFyaWFibGUgKHR5cGUsIGRhdGEpIHtcbiAgdGhpcy5pZCA9IChWQVJJQUJMRV9DT1VOVEVSKyspXG4gIHRoaXMudHlwZSA9IHR5cGVcbiAgdGhpcy5kYXRhID0gZGF0YVxufVxuXG5mdW5jdGlvbiBlc2NhcGVTdHIgKHN0cikge1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL1xcXFwvZywgJ1xcXFxcXFxcJykucmVwbGFjZSgvXCIvZywgJ1xcXFxcIicpXG59XG5cbmZ1bmN0aW9uIHNwbGl0UGFydHMgKHN0cikge1xuICBpZiAoc3RyLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBbXVxuICB9XG5cbiAgdmFyIGZpcnN0Q2hhciA9IHN0ci5jaGFyQXQoMClcbiAgdmFyIGxhc3RDaGFyID0gc3RyLmNoYXJBdChzdHIubGVuZ3RoIC0gMSlcblxuICBpZiAoc3RyLmxlbmd0aCA+IDEgJiZcbiAgICAgIGZpcnN0Q2hhciA9PT0gbGFzdENoYXIgJiZcbiAgICAgIChmaXJzdENoYXIgPT09ICdcIicgfHwgZmlyc3RDaGFyID09PSBcIidcIikpIHtcbiAgICByZXR1cm4gWydcIicgKyBlc2NhcGVTdHIoc3RyLnN1YnN0cigxLCBzdHIubGVuZ3RoIC0gMikpICsgJ1wiJ11cbiAgfVxuXG4gIHZhciBwYXJ0cyA9IC9cXFsoZmFsc2V8dHJ1ZXxudWxsfFxcZCt8J1teJ10qJ3xcIlteXCJdKlwiKVxcXS8uZXhlYyhzdHIpXG4gIGlmIChwYXJ0cykge1xuICAgIHJldHVybiAoXG4gICAgICBzcGxpdFBhcnRzKHN0ci5zdWJzdHIoMCwgcGFydHMuaW5kZXgpKVxuICAgICAgLmNvbmNhdChzcGxpdFBhcnRzKHBhcnRzWzFdKSlcbiAgICAgIC5jb25jYXQoc3BsaXRQYXJ0cyhzdHIuc3Vic3RyKHBhcnRzLmluZGV4ICsgcGFydHNbMF0ubGVuZ3RoKSkpXG4gICAgKVxuICB9XG5cbiAgdmFyIHN1YnBhcnRzID0gc3RyLnNwbGl0KCcuJylcbiAgaWYgKHN1YnBhcnRzLmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBbJ1wiJyArIGVzY2FwZVN0cihzdHIpICsgJ1wiJ11cbiAgfVxuXG4gIHZhciByZXN1bHQgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN1YnBhcnRzLmxlbmd0aDsgKytpKSB7XG4gICAgcmVzdWx0ID0gcmVzdWx0LmNvbmNhdChzcGxpdFBhcnRzKHN1YnBhcnRzW2ldKSlcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbmZ1bmN0aW9uIHRvQWNjZXNzb3JTdHJpbmcgKHN0cikge1xuICByZXR1cm4gJ1snICsgc3BsaXRQYXJ0cyhzdHIpLmpvaW4oJ11bJykgKyAnXSdcbn1cblxuZnVuY3Rpb24gZGVmaW5lRHluYW1pYyAodHlwZSwgZGF0YSkge1xuICBzd2l0Y2ggKHR5cGVvZiBkYXRhKSB7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgcmV0dXJuIG5ldyBEeW5hbWljVmFyaWFibGUodHlwZSwgdG9BY2Nlc3NvclN0cmluZyhkYXRhICsgJycpKVxuXG4gICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICAgIHJldHVybiBuZXcgRHluYW1pY1ZhcmlhYmxlKHR5cGUgfCBEWU5fUEVORElOR19GTEFHLCBudWxsKVxuXG4gICAgZGVmYXVsdDpcbiAgICAgIFxuICB9XG59XG5cbmZ1bmN0aW9uIGlzRHluYW1pYyAoeCkge1xuICByZXR1cm4gKHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nICYmICF4Ll9yZWdsVHlwZSkgfHxcbiAgICAgICAgIHggaW5zdGFuY2VvZiBEeW5hbWljVmFyaWFibGVcbn1cblxuZnVuY3Rpb24gdW5ib3ggKHgsIHBhdGgpIHtcbiAgaWYgKHggaW5zdGFuY2VvZiBEeW5hbWljVmFyaWFibGUpIHtcbiAgICBpZiAoeC50eXBlICYgRFlOX1BFTkRJTkdfRkxBRykge1xuICAgICAgcmV0dXJuIG5ldyBEeW5hbWljVmFyaWFibGUoXG4gICAgICAgIHgudHlwZSAmIH5EWU5fUEVORElOR19GTEFHLFxuICAgICAgICB0b0FjY2Vzc29yU3RyaW5nKHBhdGgpKVxuICAgIH1cbiAgfSBlbHNlIGlmICh0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHJldHVybiBuZXcgRHluYW1pY1ZhcmlhYmxlKERZTl9GVU5DLCB4KVxuICB9XG4gIHJldHVybiB4XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBkZWZpbmU6IGRlZmluZUR5bmFtaWMsXG4gIGlzRHluYW1pYzogaXNEeW5hbWljLFxuICB1bmJveDogdW5ib3gsXG4gIGFjY2Vzc29yOiB0b0FjY2Vzc29yU3RyaW5nXG59XG4iLCJcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtdHlwZWQtYXJyYXknKVxudmFyIGlzTkRBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtbmRhcnJheScpXG5cbnZhciBwcmltVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9wcmltaXRpdmVzLmpzb24nKVxudmFyIHVzYWdlVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy91c2FnZS5qc29uJylcblxudmFyIEdMX1BPSU5UUyA9IDBcbnZhciBHTF9MSU5FUyA9IDFcbnZhciBHTF9UUklBTkdMRVMgPSA0XG5cbnZhciBHTF9CWVRFID0gNTEyMFxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG52YXIgR0xfU0hPUlQgPSA1MTIyXG52YXIgR0xfVU5TSUdORURfU0hPUlQgPSA1MTIzXG52YXIgR0xfSU5UID0gNTEyNFxudmFyIEdMX1VOU0lHTkVEX0lOVCA9IDUxMjVcblxudmFyIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSID0gMzQ5NjNcblxudmFyIEdMX1NUUkVBTV9EUkFXID0gMHg4OEUwXG52YXIgR0xfU1RBVElDX0RSQVcgPSAweDg4RTRcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwRWxlbWVudHNTdGF0ZSAoZ2wsIGV4dGVuc2lvbnMsIGJ1ZmZlclN0YXRlKSB7XG4gIHZhciBlbGVtZW50VHlwZXMgPSB7XG4gICAgJ3VpbnQ4JzogR0xfVU5TSUdORURfQllURSxcbiAgICAndWludDE2JzogR0xfVU5TSUdORURfU0hPUlRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLm9lc19lbGVtZW50X2luZGV4X3VpbnQpIHtcbiAgICBlbGVtZW50VHlwZXMudWludDMyID0gR0xfVU5TSUdORURfSU5UXG4gIH1cblxuICBmdW5jdGlvbiBSRUdMRWxlbWVudEJ1ZmZlciAoYnVmZmVyKSB7XG4gICAgdGhpcy5idWZmZXIgPSBidWZmZXJcbiAgICB0aGlzLnByaW1UeXBlID0gR0xfVFJJQU5HTEVTXG4gICAgdGhpcy52ZXJ0Q291bnQgPSAwXG4gICAgdGhpcy50eXBlID0gMFxuICB9XG5cbiAgUkVHTEVsZW1lbnRCdWZmZXIucHJvdG90eXBlLmJpbmQgPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5idWZmZXIuYmluZCgpXG4gIH1cblxuICB2YXIgYnVmZmVyUG9vbCA9IFtdXG5cbiAgZnVuY3Rpb24gY3JlYXRlRWxlbWVudFN0cmVhbSAoZGF0YSkge1xuICAgIHZhciByZXN1bHQgPSBidWZmZXJQb29sLnBvcCgpXG4gICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgIHJlc3VsdCA9IG5ldyBSRUdMRWxlbWVudEJ1ZmZlcihidWZmZXJTdGF0ZS5jcmVhdGUoXG4gICAgICAgIG51bGwsXG4gICAgICAgIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSLFxuICAgICAgICB0cnVlKS5fYnVmZmVyKVxuICAgIH1cbiAgICBpbml0RWxlbWVudHMocmVzdWx0LCBkYXRhLCBHTF9TVFJFQU1fRFJBVywgLTEsIC0xLCAwLCAwKVxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3lFbGVtZW50U3RyZWFtIChlbGVtZW50cykge1xuICAgIGJ1ZmZlclBvb2wucHVzaChlbGVtZW50cylcbiAgfVxuXG4gIGZ1bmN0aW9uIGluaXRFbGVtZW50cyAoXG4gICAgZWxlbWVudHMsXG4gICAgZGF0YSxcbiAgICB1c2FnZSxcbiAgICBwcmltLFxuICAgIGNvdW50LFxuICAgIGJ5dGVMZW5ndGgsXG4gICAgdHlwZSkge1xuICAgIHZhciBwcmVkaWN0ZWRUeXBlID0gdHlwZVxuICAgIGlmICghdHlwZSAmJiAoXG4gICAgICAgICFpc1R5cGVkQXJyYXkoZGF0YSkgfHxcbiAgICAgICAoaXNOREFycmF5TGlrZShkYXRhKSAmJiAhaXNUeXBlZEFycmF5KGRhdGEuZGF0YSkpKSkge1xuICAgICAgcHJlZGljdGVkVHlwZSA9IGV4dGVuc2lvbnMub2VzX2VsZW1lbnRfaW5kZXhfdWludFxuICAgICAgICA/IEdMX1VOU0lHTkVEX0lOVFxuICAgICAgICA6IEdMX1VOU0lHTkVEX1NIT1JUXG4gICAgfVxuICAgIGVsZW1lbnRzLmJ1ZmZlci5iaW5kKClcbiAgICBidWZmZXJTdGF0ZS5faW5pdEJ1ZmZlcihcbiAgICAgIGVsZW1lbnRzLmJ1ZmZlcixcbiAgICAgIGRhdGEsXG4gICAgICB1c2FnZSxcbiAgICAgIHByZWRpY3RlZFR5cGUsXG4gICAgICAzKVxuXG4gICAgdmFyIGR0eXBlID0gdHlwZVxuICAgIGlmICghdHlwZSkge1xuICAgICAgc3dpdGNoIChlbGVtZW50cy5idWZmZXIuZHR5cGUpIHtcbiAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgICAgICBjYXNlIEdMX0JZVEU6XG4gICAgICAgICAgZHR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUOlxuICAgICAgICBjYXNlIEdMX1NIT1JUOlxuICAgICAgICAgIGR0eXBlID0gR0xfVU5TSUdORURfU0hPUlRcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfVU5TSUdORURfSU5UOlxuICAgICAgICBjYXNlIEdMX0lOVDpcbiAgICAgICAgICBkdHlwZSA9IEdMX1VOU0lHTkVEX0lOVFxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBcbiAgICAgIH1cbiAgICAgIGVsZW1lbnRzLmJ1ZmZlci5kdHlwZSA9IGR0eXBlXG4gICAgfVxuICAgIGVsZW1lbnRzLnR5cGUgPSBkdHlwZVxuXG4gICAgLy8gQ2hlY2sgb2VzX2VsZW1lbnRfaW5kZXhfdWludCBleHRlbnNpb25cbiAgICBcblxuICAgIC8vIHRyeSB0byBndWVzcyBkZWZhdWx0IHByaW1pdGl2ZSB0eXBlIGFuZCBhcmd1bWVudHNcbiAgICB2YXIgdmVydENvdW50ID0gY291bnRcbiAgICBpZiAodmVydENvdW50IDwgMCkge1xuICAgICAgdmVydENvdW50ID0gZWxlbWVudHMuYnVmZmVyLmJ5dGVMZW5ndGhcbiAgICAgIGlmIChkdHlwZSA9PT0gR0xfVU5TSUdORURfU0hPUlQpIHtcbiAgICAgICAgdmVydENvdW50ID4+PSAxXG4gICAgICB9IGVsc2UgaWYgKGR0eXBlID09PSBHTF9VTlNJR05FRF9JTlQpIHtcbiAgICAgICAgdmVydENvdW50ID4+PSAyXG4gICAgICB9XG4gICAgfVxuICAgIGVsZW1lbnRzLnZlcnRDb3VudCA9IHZlcnRDb3VudFxuXG4gICAgLy8gdHJ5IHRvIGd1ZXNzIHByaW1pdGl2ZSB0eXBlIGZyb20gY2VsbCBkaW1lbnNpb25cbiAgICB2YXIgcHJpbVR5cGUgPSBwcmltXG4gICAgaWYgKHByaW0gPCAwKSB7XG4gICAgICBwcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgICAgdmFyIGRpbWVuc2lvbiA9IGVsZW1lbnRzLmJ1ZmZlci5kaW1lbnNpb25cbiAgICAgIGlmIChkaW1lbnNpb24gPT09IDEpIHByaW1UeXBlID0gR0xfUE9JTlRTXG4gICAgICBpZiAoZGltZW5zaW9uID09PSAyKSBwcmltVHlwZSA9IEdMX0xJTkVTXG4gICAgICBpZiAoZGltZW5zaW9uID09PSAzKSBwcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgIH1cbiAgICBlbGVtZW50cy5wcmltVHlwZSA9IHByaW1UeXBlXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVFbGVtZW50cyAob3B0aW9ucykge1xuICAgIHZhciBidWZmZXIgPSBidWZmZXJTdGF0ZS5jcmVhdGUobnVsbCwgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIsIHRydWUpXG4gICAgdmFyIGVsZW1lbnRzID0gbmV3IFJFR0xFbGVtZW50QnVmZmVyKGJ1ZmZlci5fYnVmZmVyKVxuXG4gICAgZnVuY3Rpb24gcmVnbEVsZW1lbnRzIChvcHRpb25zKSB7XG4gICAgICBpZiAoIW9wdGlvbnMpIHtcbiAgICAgICAgYnVmZmVyKClcbiAgICAgICAgZWxlbWVudHMucHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICAgICAgZWxlbWVudHMudmVydENvdW50ID0gMFxuICAgICAgICBlbGVtZW50cy50eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgYnVmZmVyKG9wdGlvbnMpXG4gICAgICAgIGVsZW1lbnRzLnByaW1UeXBlID0gR0xfVFJJQU5HTEVTXG4gICAgICAgIGVsZW1lbnRzLnZlcnRDb3VudCA9IG9wdGlvbnMgfCAwXG4gICAgICAgIGVsZW1lbnRzLnR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgZGF0YSA9IG51bGxcbiAgICAgICAgdmFyIHVzYWdlID0gR0xfU1RBVElDX0RSQVdcbiAgICAgICAgdmFyIHByaW1UeXBlID0gLTFcbiAgICAgICAgdmFyIHZlcnRDb3VudCA9IC0xXG4gICAgICAgIHZhciBieXRlTGVuZ3RoID0gMFxuICAgICAgICB2YXIgZHR5cGUgPSAwXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KG9wdGlvbnMpIHx8XG4gICAgICAgICAgICBpc1R5cGVkQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICAgIGlzTkRBcnJheUxpa2Uob3B0aW9ucykpIHtcbiAgICAgICAgICBkYXRhID0gb3B0aW9uc1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFxuICAgICAgICAgIGlmICgnZGF0YScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgZGF0YSA9IG9wdGlvbnMuZGF0YVxuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgndXNhZ2UnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdXNhZ2UgPSB1c2FnZVR5cGVzW29wdGlvbnMudXNhZ2VdXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgncHJpbWl0aXZlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHByaW1UeXBlID0gcHJpbVR5cGVzW29wdGlvbnMucHJpbWl0aXZlXVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ2NvdW50JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZlcnRDb3VudCA9IG9wdGlvbnMuY291bnQgfCAwXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnbGVuZ3RoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBieXRlTGVuZ3RoID0gb3B0aW9ucy5sZW5ndGggfCAwXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgndHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBkdHlwZSA9IGVsZW1lbnRUeXBlc1tvcHRpb25zLnR5cGVdXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChkYXRhKSB7XG4gICAgICAgICAgaW5pdEVsZW1lbnRzKFxuICAgICAgICAgICAgZWxlbWVudHMsXG4gICAgICAgICAgICBkYXRhLFxuICAgICAgICAgICAgdXNhZ2UsXG4gICAgICAgICAgICBwcmltVHlwZSxcbiAgICAgICAgICAgIHZlcnRDb3VudCxcbiAgICAgICAgICAgIGJ5dGVMZW5ndGgsXG4gICAgICAgICAgICBkdHlwZSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YXIgX2J1ZmZlciA9IGVsZW1lbnRzLmJ1ZmZlclxuICAgICAgICAgIF9idWZmZXIuYmluZCgpXG4gICAgICAgICAgZ2wuYnVmZmVyRGF0YShHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiwgYnl0ZUxlbmd0aCwgdXNhZ2UpXG4gICAgICAgICAgX2J1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgICAgICBfYnVmZmVyLnVzYWdlID0gdXNhZ2VcbiAgICAgICAgICBfYnVmZmVyLmRpbWVuc2lvbiA9IDNcbiAgICAgICAgICBfYnVmZmVyLmJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoXG4gICAgICAgICAgZWxlbWVudHMucHJpbVR5cGUgPSBwcmltVHlwZSA8IDAgPyBHTF9UUklBTkdMRVMgOiBwcmltVHlwZVxuICAgICAgICAgIGVsZW1lbnRzLnZlcnRDb3VudCA9IHZlcnRDb3VudCA8IDAgPyAwIDogdmVydENvdW50XG4gICAgICAgICAgZWxlbWVudHMudHlwZSA9IF9idWZmZXIuZHR5cGVcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVnbEVsZW1lbnRzXG4gICAgfVxuXG4gICAgcmVnbEVsZW1lbnRzKG9wdGlvbnMpXG5cbiAgICByZWdsRWxlbWVudHMuX3JlZ2xUeXBlID0gJ2VsZW1lbnRzJ1xuICAgIHJlZ2xFbGVtZW50cy5fZWxlbWVudHMgPSBlbGVtZW50c1xuICAgIHJlZ2xFbGVtZW50cy5zdWJkYXRhID0gZnVuY3Rpb24gKGRhdGEsIG9mZnNldCkge1xuICAgICAgYnVmZmVyLnN1YmRhdGEoZGF0YSwgb2Zmc2V0KVxuICAgICAgcmV0dXJuIHJlZ2xFbGVtZW50c1xuICAgIH1cbiAgICByZWdsRWxlbWVudHMuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIFxuICAgICAgYnVmZmVyLmRlc3Ryb3koKVxuICAgICAgZWxlbWVudHMuYnVmZmVyID0gbnVsbFxuICAgIH1cblxuICAgIHJldHVybiByZWdsRWxlbWVudHNcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVFbGVtZW50cyxcbiAgICBjcmVhdGVTdHJlYW06IGNyZWF0ZUVsZW1lbnRTdHJlYW0sXG4gICAgZGVzdHJveVN0cmVhbTogZGVzdHJveUVsZW1lbnRTdHJlYW0sXG4gICAgZ2V0RWxlbWVudHM6IGZ1bmN0aW9uIChlbGVtZW50cykge1xuICAgICAgaWYgKHR5cGVvZiBlbGVtZW50cyA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgICAgIGVsZW1lbnRzLl9lbGVtZW50cyBpbnN0YW5jZW9mIFJFR0xFbGVtZW50QnVmZmVyKSB7XG4gICAgICAgIHJldHVybiBlbGVtZW50cy5fZWxlbWVudHNcbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZUV4dGVuc2lvbkNhY2hlIChnbCkge1xuICB2YXIgZXh0ZW5zaW9ucyA9IHt9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaEV4dGVuc2lvbnMgKCkge1xuICAgIFtcbiAgICAgICdvZXNfdGV4dHVyZV9mbG9hdCcsXG4gICAgICAnb2VzX3RleHR1cmVfZmxvYXRfbGluZWFyJyxcbiAgICAgICdvZXNfdGV4dHVyZV9oYWxmX2Zsb2F0JyxcbiAgICAgICdvZXNfdGV4dHVyZV9oYWxmX2Zsb2F0X2xpbmVhcicsXG4gICAgICAnb2VzX3N0YW5kYXJkX2Rlcml2YXRpdmVzJyxcbiAgICAgICdvZXNfZWxlbWVudF9pbmRleF91aW50JyxcbiAgICAgICdvZXNfZmJvX3JlbmRlcl9taXBtYXAnLFxuXG4gICAgICAnd2ViZ2xfZGVwdGhfdGV4dHVyZScsXG4gICAgICAnd2ViZ2xfZHJhd19idWZmZXJzJyxcbiAgICAgICd3ZWJnbF9jb2xvcl9idWZmZXJfZmxvYXQnLFxuXG4gICAgICAnZXh0X3RleHR1cmVfZmlsdGVyX2FuaXNvdHJvcGljJyxcbiAgICAgICdleHRfZnJhZ19kZXB0aCcsXG4gICAgICAnZXh0X2JsZW5kX21pbm1heCcsXG4gICAgICAnZXh0X3NoYWRlcl90ZXh0dXJlX2xvZCcsXG4gICAgICAnZXh0X2NvbG9yX2J1ZmZlcl9oYWxmX2Zsb2F0JyxcbiAgICAgICdleHRfc3JnYicsXG5cbiAgICAgICdhbmdsZV9pbnN0YW5jZWRfYXJyYXlzJyxcblxuICAgICAgJ3dlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9zM3RjJyxcbiAgICAgICd3ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfYXRjJyxcbiAgICAgICd3ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfcHZydGMnLFxuICAgICAgJ3dlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9ldGMxJ1xuICAgIF0uZm9yRWFjaChmdW5jdGlvbiAoZXh0KSB7XG4gICAgICB0cnkge1xuICAgICAgICBleHRlbnNpb25zW2V4dF0gPSBnbC5nZXRFeHRlbnNpb24oZXh0KVxuICAgICAgfSBjYXRjaCAoZSkge31cbiAgICB9KVxuICB9XG5cbiAgcmVmcmVzaEV4dGVuc2lvbnMoKVxuXG4gIHJldHVybiB7XG4gICAgZXh0ZW5zaW9uczogZXh0ZW5zaW9ucyxcbiAgICByZWZyZXNoOiByZWZyZXNoRXh0ZW5zaW9uc1xuICB9XG59XG4iLCJcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL3V0aWwvZXh0ZW5kJylcblxuLy8gV2Ugc3RvcmUgdGhlc2UgY29uc3RhbnRzIHNvIHRoYXQgdGhlIG1pbmlmaWVyIGNhbiBpbmxpbmUgdGhlbVxudmFyIEdMX0ZSQU1FQlVGRkVSID0gMHg4RDQwXG52YXIgR0xfUkVOREVSQlVGRkVSID0gMHg4RDQxXG5cbnZhciBHTF9URVhUVVJFXzJEID0gMHgwREUxXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUCA9IDB4ODUxM1xudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCA9IDB4ODUxNVxuXG52YXIgR0xfQ09MT1JfQVRUQUNITUVOVDAgPSAweDhDRTBcbnZhciBHTF9ERVBUSF9BVFRBQ0hNRU5UID0gMHg4RDAwXG52YXIgR0xfU1RFTkNJTF9BVFRBQ0hNRU5UID0gMHg4RDIwXG52YXIgR0xfREVQVEhfU1RFTkNJTF9BVFRBQ0hNRU5UID0gMHg4MjFBXG5cbnZhciBHTF9VTlNJR05FRF9CWVRFID0gMHgxNDAxXG52YXIgR0xfRkxPQVQgPSAweDE0MDZcblxudmFyIEdMX0hBTEZfRkxPQVRfT0VTID0gMHg4RDYxXG5cbnZhciBHTF9SR0JBID0gMHgxOTA4XG5cbnZhciBHTF9SR0JBNCA9IDB4ODA1NlxudmFyIEdMX1JHQjVfQTEgPSAweDgwNTdcbnZhciBHTF9SR0I1NjUgPSAweDhENjJcbnZhciBHTF9ERVBUSF9DT01QT05FTlQxNiA9IDB4ODFBNVxudmFyIEdMX1NURU5DSUxfSU5ERVg4ID0gMHg4RDQ4XG5cbnZhciBHTF9ERVBUSF9DT01QT05FTlQgPSAweDE5MDJcbnZhciBHTF9ERVBUSF9TVEVOQ0lMID0gMHg4NEY5XG5cbnZhciBHTF9TUkdCOF9BTFBIQThfRVhUID0gMHg4QzQzXG5cbnZhciBHTF9SR0JBMzJGX0VYVCA9IDB4ODgxNFxuXG52YXIgR0xfUkdCQTE2Rl9FWFQgPSAweDg4MUFcbnZhciBHTF9SR0IxNkZfRVhUID0gMHg4ODFCXG5cbnZhciBHTF9GUkFNRUJVRkZFUl9DT01QTEVURSA9IDB4OENENVxudmFyIEdMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfQVRUQUNITUVOVCA9IDB4OENENlxudmFyIEdMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfTUlTU0lOR19BVFRBQ0hNRU5UID0gMHg4Q0Q3XG52YXIgR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9ESU1FTlNJT05TID0gMHg4Q0Q5XG52YXIgR0xfRlJBTUVCVUZGRVJfVU5TVVBQT1JURUQgPSAweDhDRERcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwRkJPU3RhdGUgKFxuICBnbCxcbiAgZXh0ZW5zaW9ucyxcbiAgbGltaXRzLFxuICB0ZXh0dXJlU3RhdGUsXG4gIHJlbmRlcmJ1ZmZlclN0YXRlKSB7XG4gIHZhciBmcmFtZWJ1ZmZlclN0YXRlID0ge1xuICAgIGN1cnJlbnQ6IG51bGwsXG4gICAgbmV4dDogbnVsbCxcbiAgICBkaXJ0eTogZmFsc2VcbiAgfVxuXG4gIHZhciBzdGF0dXNDb2RlID0ge31cbiAgc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9DT01QTEVURV0gPSAnY29tcGxldGUnXG4gIHN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9BVFRBQ0hNRU5UXSA9ICdpbmNvbXBsZXRlIGF0dGFjaG1lbnQnXG4gIHN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9ESU1FTlNJT05TXSA9ICdpbmNvbXBsZXRlIGRpbWVuc2lvbnMnXG4gIHN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9NSVNTSU5HX0FUVEFDSE1FTlRdID0gJ2luY29tcGxldGUsIG1pc3NpbmcgYXR0YWNobWVudCdcbiAgc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9VTlNVUFBPUlRFRF0gPSAndW5zdXBwb3J0ZWQnXG5cbiAgdmFyIGNvbG9yVGV4dHVyZUZvcm1hdHMgPSB7XG4gICAgJ3JnYmEnOiBHTF9SR0JBXG4gIH1cblxuICB2YXIgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzID0ge1xuICAgICdyZ2JhNCc6IEdMX1JHQkE0LFxuICAgICdyZ2I1NjUnOiBHTF9SR0I1NjUsXG4gICAgJ3JnYjUgYTEnOiBHTF9SR0I1X0ExXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0c1snc3JnYmEnXSA9IEdMX1NSR0I4X0FMUEhBOF9FWFRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9jb2xvcl9idWZmZXJfaGFsZl9mbG9hdCkge1xuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0c1sncmdiYTE2ZiddID0gR0xfUkdCQTE2Rl9FWFRcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHNbJ3JnYjE2ZiddID0gR0xfUkdCMTZGX0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29sb3JfYnVmZmVyX2Zsb2F0KSB7XG4gICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzWydyZ2JhMzJmJ10gPSBHTF9SR0JBMzJGX0VYVFxuICB9XG5cbiAgdmFyIGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMgPSBbR0xfREVQVEhfQ09NUE9ORU5UMTZdXG4gIHZhciBzdGVuY2lsUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMgPSBbR0xfU1RFTkNJTF9JTkRFWDhdXG4gIHZhciBkZXB0aFN0ZW5jaWxSZW5kZXJidWZmZXJGb3JtYXRFbnVtcyA9IFtHTF9ERVBUSF9TVEVOQ0lMXVxuXG4gIHZhciBkZXB0aFRleHR1cmVGb3JtYXRFbnVtcyA9IFtdXG4gIHZhciBzdGVuY2lsVGV4dHVyZUZvcm1hdEVudW1zID0gW11cbiAgdmFyIGRlcHRoU3RlbmNpbFRleHR1cmVGb3JtYXRFbnVtcyA9IFtdXG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfZGVwdGhfdGV4dHVyZSkge1xuICAgIGRlcHRoVGV4dHVyZUZvcm1hdEVudW1zLnB1c2goR0xfREVQVEhfQ09NUE9ORU5UKVxuICAgIGRlcHRoU3RlbmNpbFRleHR1cmVGb3JtYXRFbnVtcy5wdXNoKEdMX0RFUFRIX1NURU5DSUwpXG4gIH1cblxuICB2YXIgY29sb3JGb3JtYXRzID0gZXh0ZW5kKGV4dGVuZCh7fSxcbiAgICBjb2xvclRleHR1cmVGb3JtYXRzKSxcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMpXG5cbiAgdmFyIGNvbG9yVGV4dHVyZUZvcm1hdEVudW1zID0gdmFsdWVzKGNvbG9yVGV4dHVyZUZvcm1hdHMpXG4gIHZhciBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdEVudW1zID0gdmFsdWVzKGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cylcblxuICB2YXIgaGlnaGVzdFByZWNpc2lvbiA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgdmFyIGNvbG9yVHlwZXMgPSB7XG4gICAgJ3VpbnQ4JzogR0xfVU5TSUdORURfQllURVxuICB9XG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2hhbGZfZmxvYXQpIHtcbiAgICBoaWdoZXN0UHJlY2lzaW9uID0gY29sb3JUeXBlc1snaGFsZiBmbG9hdCddID0gR0xfSEFMRl9GTE9BVF9PRVNcbiAgfVxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCkge1xuICAgIGhpZ2hlc3RQcmVjaXNpb24gPSBjb2xvclR5cGVzLmZsb2F0ID0gR0xfRkxPQVRcbiAgfVxuICBjb2xvclR5cGVzLmJlc3QgPSBoaWdoZXN0UHJlY2lzaW9uXG5cbiAgdmFyIERSQVdfQlVGRkVSUyA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHJlc3VsdCA9IG5ldyBBcnJheShsaW1pdHMubWF4RHJhd2J1ZmZlcnMpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPD0gbGltaXRzLm1heERyYXdidWZmZXJzOyArK2kpIHtcbiAgICAgIHZhciByb3cgPSByZXN1bHRbaV0gPSBuZXcgQXJyYXkoaSlcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaTsgKytqKSB7XG4gICAgICAgIHJvd1tqXSA9IEdMX0NPTE9SX0FUVEFDSE1FTlQwICsgalxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG4gIH0pKClcblxuICBmdW5jdGlvbiBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQgKHRhcmdldCwgbGV2ZWwsIHRleHR1cmUsIHJlbmRlcmJ1ZmZlcikge1xuICAgIHRoaXMudGFyZ2V0ID0gdGFyZ2V0XG4gICAgdGhpcy5sZXZlbCA9IGxldmVsXG4gICAgdGhpcy50ZXh0dXJlID0gdGV4dHVyZVxuICAgIHRoaXMucmVuZGVyYnVmZmVyID0gcmVuZGVyYnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiBkZWNSZWYgKGF0dGFjaG1lbnQpIHtcbiAgICBpZiAoYXR0YWNobWVudCkge1xuICAgICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgICBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmUuZGVjUmVmKClcbiAgICAgIH1cbiAgICAgIGlmIChhdHRhY2htZW50LnJlbmRlcmJ1ZmZlcikge1xuICAgICAgICBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLmRlY1JlZigpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaW5jUmVmQW5kQ2hlY2tTaGFwZSAoYXR0YWNobWVudCwgZnJhbWVidWZmZXIpIHtcbiAgICB2YXIgd2lkdGggPSBmcmFtZWJ1ZmZlci53aWR0aFxuICAgIHZhciBoZWlnaHQgPSBmcmFtZWJ1ZmZlci5oZWlnaHRcbiAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XG4gICAgICB2YXIgdGV4dHVyZSA9IGF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZVxuICAgICAgdmFyIHR3ID0gTWF0aC5tYXgoMSwgdGV4dHVyZS5wYXJhbXMud2lkdGggPj4gYXR0YWNobWVudC5sZXZlbClcbiAgICAgIHZhciB0aCA9IE1hdGgubWF4KDEsIHRleHR1cmUucGFyYW1zLmhlaWdodCA+PiBhdHRhY2htZW50LmxldmVsKVxuICAgICAgd2lkdGggPSB3aWR0aCB8fCB0d1xuICAgICAgaGVpZ2h0ID0gaGVpZ2h0IHx8IHRoXG4gICAgICBcbiAgICAgIFxuICAgICAgdGV4dHVyZS5yZWZDb3VudCArPSAxXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciByZW5kZXJidWZmZXIgPSBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyXG4gICAgICB3aWR0aCA9IHdpZHRoIHx8IHJlbmRlcmJ1ZmZlci53aWR0aFxuICAgICAgaGVpZ2h0ID0gaGVpZ2h0IHx8IHJlbmRlcmJ1ZmZlci5oZWlnaHRcbiAgICAgIFxuICAgICAgXG4gICAgICByZW5kZXJidWZmZXIucmVmQ291bnQgKz0gMVxuICAgIH1cbiAgICBmcmFtZWJ1ZmZlci53aWR0aCA9IHdpZHRoXG4gICAgZnJhbWVidWZmZXIuaGVpZ2h0ID0gaGVpZ2h0XG4gIH1cblxuICBmdW5jdGlvbiBhdHRhY2ggKGxvY2F0aW9uLCBhdHRhY2htZW50KSB7XG4gICAgaWYgKGF0dGFjaG1lbnQpIHtcbiAgICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgICAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoXG4gICAgICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICAgICAgbG9jYXRpb24sXG4gICAgICAgICAgYXR0YWNobWVudC50YXJnZXQsXG4gICAgICAgICAgYXR0YWNobWVudC50ZXh0dXJlLl90ZXh0dXJlLnRleHR1cmUsXG4gICAgICAgICAgYXR0YWNobWVudC5sZXZlbClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGdsLmZyYW1lYnVmZmVyUmVuZGVyYnVmZmVyKFxuICAgICAgICAgIEdMX0ZSQU1FQlVGRkVSLFxuICAgICAgICAgIGxvY2F0aW9uLFxuICAgICAgICAgIEdMX1JFTkRFUkJVRkZFUixcbiAgICAgICAgICBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLnJlbmRlcmJ1ZmZlcilcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoXG4gICAgICAgIEdMX0ZSQU1FQlVGRkVSLFxuICAgICAgICBsb2NhdGlvbixcbiAgICAgICAgR0xfVEVYVFVSRV8yRCxcbiAgICAgICAgbnVsbCxcbiAgICAgICAgMClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiB0cnlVcGRhdGVBdHRhY2htZW50IChcbiAgICBhdHRhY2htZW50LFxuICAgIGlzVGV4dHVyZSxcbiAgICBmb3JtYXQsXG4gICAgdHlwZSxcbiAgICB3aWR0aCxcbiAgICBoZWlnaHQpIHtcbiAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XG4gICAgICB2YXIgdGV4dHVyZSA9IGF0dGFjaG1lbnQudGV4dHVyZVxuICAgICAgaWYgKGlzVGV4dHVyZSkge1xuICAgICAgICB0ZXh0dXJlKHtcbiAgICAgICAgICBmb3JtYXQ6IGZvcm1hdCxcbiAgICAgICAgICB0eXBlOiB0eXBlLFxuICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICB9KVxuICAgICAgICB0ZXh0dXJlLl90ZXh0dXJlLnJlZkNvdW50ICs9IDFcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHJlbmRlcmJ1ZmZlciA9IGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyXG4gICAgICBpZiAoIWlzVGV4dHVyZSkge1xuICAgICAgICByZW5kZXJidWZmZXIoe1xuICAgICAgICAgIGZvcm1hdDogZm9ybWF0LFxuICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICB9KVxuICAgICAgICByZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5yZWZDb3VudCArPSAxXG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgICB9XG4gICAgfVxuICAgIGRlY1JlZihhdHRhY2htZW50KVxuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VBdHRhY2htZW50IChhdHRhY2htZW50KSB7XG4gICAgdmFyIHRhcmdldCA9IEdMX1RFWFRVUkVfMkRcbiAgICB2YXIgbGV2ZWwgPSAwXG4gICAgdmFyIHRleHR1cmUgPSBudWxsXG4gICAgdmFyIHJlbmRlcmJ1ZmZlciA9IG51bGxcblxuICAgIHZhciBkYXRhID0gYXR0YWNobWVudFxuICAgIGlmICh0eXBlb2YgYXR0YWNobWVudCA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGRhdGEgPSBhdHRhY2htZW50LmRhdGFcbiAgICAgIGlmICgnbGV2ZWwnIGluIGF0dGFjaG1lbnQpIHtcbiAgICAgICAgbGV2ZWwgPSBhdHRhY2htZW50LmxldmVsIHwgMFxuICAgICAgfVxuICAgICAgaWYgKCd0YXJnZXQnIGluIGF0dGFjaG1lbnQpIHtcbiAgICAgICAgdGFyZ2V0ID0gYXR0YWNobWVudC50YXJnZXQgfCAwXG4gICAgICB9XG4gICAgfVxuXG4gICAgXG5cbiAgICB2YXIgdHlwZSA9IGF0dGFjaG1lbnQuX3JlZ2xUeXBlXG4gICAgaWYgKHR5cGUgPT09ICd0ZXh0dXJlJykge1xuICAgICAgdGV4dHVyZSA9IGF0dGFjaG1lbnRcbiAgICAgIGlmICh0ZXh0dXJlLl90ZXh0dXJlLnRhcmdldCA9PT0gR0xfVEVYVFVSRV9DVUJFX01BUCkge1xuICAgICAgICBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFxuICAgICAgfVxuICAgICAgLy8gVE9ETyBjaGVjayBtaXBsZXZlbCBpcyBjb25zaXN0ZW50XG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAncmVuZGVyYnVmZmVyJykge1xuICAgICAgcmVuZGVyYnVmZmVyID0gYXR0YWNobWVudFxuICAgICAgdGFyZ2V0ID0gR0xfUkVOREVSQlVGRkVSXG4gICAgICBsZXZlbCA9IDBcbiAgICB9IGVsc2Uge1xuICAgICAgXG4gICAgfVxuXG4gICAgcmV0dXJuIG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQodGFyZ2V0LCBsZXZlbCwgdGV4dHVyZSwgcmVuZGVyYnVmZmVyKVxuICB9XG5cbiAgZnVuY3Rpb24gdW53cmFwQXR0YWNobWVudCAoYXR0YWNobWVudCkge1xuICAgIHJldHVybiBhdHRhY2htZW50ICYmIChhdHRhY2htZW50LnRleHR1cmUgfHwgYXR0YWNobWVudC5yZW5kZXJidWZmZXIpXG4gIH1cblxuICB2YXIgZnJhbWVidWZmZXJDb3VudCA9IDBcbiAgdmFyIGZyYW1lYnVmZmVyU2V0ID0ge31cblxuICBmdW5jdGlvbiBSRUdMRnJhbWVidWZmZXIgKCkge1xuICAgIHRoaXMuaWQgPSBmcmFtZWJ1ZmZlckNvdW50KytcbiAgICBmcmFtZWJ1ZmZlclNldFt0aGlzLmlkXSA9IHRoaXNcblxuICAgIHRoaXMuZnJhbWVidWZmZXIgPSBudWxsXG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcblxuICAgIHRoaXMuY29sb3JBdHRhY2htZW50cyA9IFtdXG4gICAgdGhpcy5kZXB0aEF0dGFjaG1lbnQgPSBudWxsXG4gICAgdGhpcy5zdGVuY2lsQXR0YWNobWVudCA9IG51bGxcbiAgICB0aGlzLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBudWxsXG5cbiAgICB0aGlzLm93bnNDb2xvciA9IGZhbHNlXG4gICAgdGhpcy5vd25zRGVwdGhTdGVuY2lsID0gZmFsc2VcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlZnJlc2ggKGZyYW1lYnVmZmVyKSB7XG4gICAgaWYgKCFnbC5pc0ZyYW1lYnVmZmVyKGZyYW1lYnVmZmVyLmZyYW1lYnVmZmVyKSkge1xuICAgICAgZnJhbWVidWZmZXIuZnJhbWVidWZmZXIgPSBnbC5jcmVhdGVGcmFtZWJ1ZmZlcigpXG4gICAgfVxuICAgIGZyYW1lYnVmZmVyU3RhdGUuZGlydHkgPSB0cnVlXG4gICAgZ2wuYmluZEZyYW1lYnVmZmVyKEdMX0ZSQU1FQlVGRkVSLCBmcmFtZWJ1ZmZlci5mcmFtZWJ1ZmZlcilcblxuICAgIHZhciBjb2xvckF0dGFjaG1lbnRzID0gZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50c1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY29sb3JBdHRhY2htZW50cy5sZW5ndGg7ICsraSkge1xuICAgICAgYXR0YWNoKEdMX0NPTE9SX0FUVEFDSE1FTlQwICsgaSwgY29sb3JBdHRhY2htZW50c1tpXSlcbiAgICB9XG4gICAgZm9yIChpID0gY29sb3JBdHRhY2htZW50cy5sZW5ndGg7IGkgPCBsaW1pdHMubWF4Q29sb3JBdHRhY2htZW50czsgKytpKSB7XG4gICAgICBhdHRhY2goR0xfQ09MT1JfQVRUQUNITUVOVDAgKyBpLCBudWxsKVxuICAgIH1cbiAgICBhdHRhY2goR0xfREVQVEhfQVRUQUNITUVOVCwgZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50KVxuICAgIGF0dGFjaChHTF9TVEVOQ0lMX0FUVEFDSE1FTlQsIGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50KVxuICAgIGF0dGFjaChHTF9ERVBUSF9TVEVOQ0lMX0FUVEFDSE1FTlQsIGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQpXG5cbiAgICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnMpIHtcbiAgICAgIGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzLmRyYXdCdWZmZXJzV0VCR0woXG4gICAgICAgIERSQVdfQlVGRkVSU1tjb2xvckF0dGFjaG1lbnRzLmxlbmd0aF0pXG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgc3RhdHVzIGNvZGVcbiAgICB2YXIgc3RhdHVzID0gZ2wuY2hlY2tGcmFtZWJ1ZmZlclN0YXR1cyhHTF9GUkFNRUJVRkZFUilcbiAgICBpZiAoc3RhdHVzICE9PSBHTF9GUkFNRUJVRkZFUl9DT01QTEVURSkge1xuICAgICAgXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZGVjRkJPUmVmcyAoZnJhbWVidWZmZXIpIHtcbiAgICBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzLmZvckVhY2goZGVjUmVmKVxuICAgIGRlY1JlZihmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQpXG4gICAgZGVjUmVmKGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50KVxuICAgIGRlY1JlZihmcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWxBdHRhY2htZW50KVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAoZnJhbWVidWZmZXIpIHtcbiAgICB2YXIgaGFuZGxlID0gZnJhbWVidWZmZXIuZnJhbWVidWZmZXJcbiAgICBcbiAgICBpZiAoZ2wuaXNGcmFtZWJ1ZmZlcihoYW5kbGUpKSB7XG4gICAgICBnbC5kZWxldGVGcmFtZWJ1ZmZlcihoYW5kbGUpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlRkJPIChvcHRpb25zKSB7XG4gICAgdmFyIGZyYW1lYnVmZmVyID0gbmV3IFJFR0xGcmFtZWJ1ZmZlcigpXG5cbiAgICBmdW5jdGlvbiByZWdsRnJhbWVidWZmZXIgKGlucHV0KSB7XG4gICAgICB2YXIgaVxuICAgICAgdmFyIG9wdGlvbnMgPSBpbnB1dCB8fCB7fVxuXG4gICAgICB2YXIgZXh0RHJhd0J1ZmZlcnMgPSBleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVyc1xuXG4gICAgICB2YXIgd2lkdGggPSAwXG4gICAgICB2YXIgaGVpZ2h0ID0gMFxuICAgICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgc2hhcGUgPSBvcHRpb25zLnNoYXBlXG4gICAgICAgIFxuICAgICAgICB3aWR0aCA9IHNoYXBlWzBdXG4gICAgICAgIGhlaWdodCA9IHNoYXBlWzFdXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoJ3JhZGl1cycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHdpZHRoID0gaGVpZ2h0ID0gb3B0aW9ucy5yYWRpdXNcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgd2lkdGggPSBvcHRpb25zLndpZHRoXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBoZWlnaHQgPSBvcHRpb25zLmhlaWdodFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIGNvbG9yVHlwZSwgbnVtQ29sb3JzXG4gICAgICB2YXIgY29sb3JCdWZmZXJzID0gbnVsbFxuICAgICAgdmFyIG93bnNDb2xvciA9IGZhbHNlXG4gICAgICBpZiAoJ2NvbG9yQnVmZmVycycgaW4gb3B0aW9ucyB8fCAnY29sb3JCdWZmZXInIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGNvbG9ySW5wdXRzID0gb3B0aW9ucy5jb2xvckJ1ZmZlcnMgfHwgb3B0aW9ucy5jb2xvckJ1ZmZlclxuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoY29sb3JJbnB1dHMpKSB7XG4gICAgICAgICAgY29sb3JJbnB1dHMgPSBbY29sb3JJbnB1dHNdXG4gICAgICAgIH1cblxuICAgICAgICBmcmFtZWJ1ZmZlci53aWR0aCA9IHdpZHRoXG4gICAgICAgIGZyYW1lYnVmZmVyLmhlaWdodCA9IGhlaWdodFxuXG4gICAgICAgIGlmIChjb2xvcklucHV0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgICAgXG5cbiAgICAgICAgLy8gV3JhcCBjb2xvciBhdHRhY2htZW50c1xuICAgICAgICBjb2xvckJ1ZmZlcnMgPSBjb2xvcklucHV0cy5tYXAocGFyc2VBdHRhY2htZW50KVxuXG4gICAgICAgIC8vIENoZWNrIGhlYWQgbm9kZVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JCdWZmZXJzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgdmFyIGNvbG9yQXR0YWNobWVudCA9IGNvbG9yQnVmZmVyc1tpXVxuICAgICAgICAgIFxuICAgICAgICAgIGluY1JlZkFuZENoZWNrU2hhcGUoXG4gICAgICAgICAgICBjb2xvckF0dGFjaG1lbnQsXG4gICAgICAgICAgICBmcmFtZWJ1ZmZlcilcbiAgICAgICAgfVxuXG4gICAgICAgIHdpZHRoID0gZnJhbWVidWZmZXIud2lkdGhcbiAgICAgICAgaGVpZ2h0ID0gZnJhbWVidWZmZXIuaGVpZ2h0XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgY29sb3JUZXh0dXJlID0gdHJ1ZVxuICAgICAgICB2YXIgY29sb3JGb3JtYXQgPSAncmdiYSdcbiAgICAgICAgdmFyIGNvbG9yVHlwZSA9ICd1aW50OCdcbiAgICAgICAgdmFyIGNvbG9yQ291bnQgPSAxXG4gICAgICAgIG93bnNDb2xvciA9IHRydWVcblxuICAgICAgICBmcmFtZWJ1ZmZlci53aWR0aCA9IHdpZHRoID0gd2lkdGggfHwgZ2wuZHJhd2luZ0J1ZmZlcldpZHRoXG4gICAgICAgIGZyYW1lYnVmZmVyLmhlaWdodCA9IGhlaWdodCA9IGhlaWdodCB8fCBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XG5cbiAgICAgICAgaWYgKCdmb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjb2xvckZvcm1hdCA9IG9wdGlvbnMuZm9ybWF0XG4gICAgICAgICAgXG4gICAgICAgICAgY29sb3JUZXh0dXJlID0gY29sb3JGb3JtYXQgaW4gY29sb3JUZXh0dXJlRm9ybWF0c1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgXG4gICAgICAgICAgY29sb3JUeXBlID0gb3B0aW9ucy50eXBlXG4gICAgICAgICAgXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2NvbG9yQ291bnQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjb2xvckNvdW50ID0gb3B0aW9ucy5jb2xvckNvdW50IHwgMFxuICAgICAgICAgIFxuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmV1c2UgY29sb3IgYnVmZmVyIGFycmF5IGlmIHdlIG93biBpdFxuICAgICAgICBpZiAoZnJhbWVidWZmZXIub3duc0NvbG9yKSB7XG4gICAgICAgICAgY29sb3JCdWZmZXJzID0gZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50c1xuICAgICAgICAgIHdoaWxlIChjb2xvckJ1ZmZlcnMubGVuZ3RoID4gY29sb3JDb3VudCkge1xuICAgICAgICAgICAgZGVjUmVmKGNvbG9yQnVmZmVycy5wb3AoKSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29sb3JCdWZmZXJzID0gW11cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHVwZGF0ZSBidWZmZXJzIGluIHBsYWNlLCByZW1vdmUgaW5jb21wYXRpYmxlIGJ1ZmZlcnNcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQnVmZmVycy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgIGlmICghdHJ5VXBkYXRlQXR0YWNobWVudChcbiAgICAgICAgICAgICAgY29sb3JCdWZmZXJzW2ldLFxuICAgICAgICAgICAgICBjb2xvclRleHR1cmUsXG4gICAgICAgICAgICAgIGNvbG9yRm9ybWF0LFxuICAgICAgICAgICAgICBjb2xvclR5cGUsXG4gICAgICAgICAgICAgIHdpZHRoLFxuICAgICAgICAgICAgICBoZWlnaHQpKSB7XG4gICAgICAgICAgICBjb2xvckJ1ZmZlcnNbaS0tXSA9IGNvbG9yQnVmZmVyc1tjb2xvckJ1ZmZlcnMubGVuZ3RoIC0gMV1cbiAgICAgICAgICAgIGNvbG9yQnVmZmVycy5wb3AoKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFRoZW4gYXBwZW5kIG5ldyBidWZmZXJzXG4gICAgICAgIHdoaWxlIChjb2xvckJ1ZmZlcnMubGVuZ3RoIDwgY29sb3JDb3VudCkge1xuICAgICAgICAgIGlmIChjb2xvclRleHR1cmUpIHtcbiAgICAgICAgICAgIGNvbG9yQnVmZmVycy5wdXNoKG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQoXG4gICAgICAgICAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICAgICAgICAgIDAsXG4gICAgICAgICAgICAgIHRleHR1cmVTdGF0ZS5jcmVhdGUoe1xuICAgICAgICAgICAgICAgIGZvcm1hdDogY29sb3JGb3JtYXQsXG4gICAgICAgICAgICAgICAgdHlwZTogY29sb3JUeXBlLFxuICAgICAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICAgICAgICB9LCBHTF9URVhUVVJFXzJEKSxcbiAgICAgICAgICAgICAgbnVsbCkpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbG9yQnVmZmVycy5wdXNoKG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQoXG4gICAgICAgICAgICAgIEdMX1JFTkRFUkJVRkZFUixcbiAgICAgICAgICAgICAgMCxcbiAgICAgICAgICAgICAgbnVsbCxcbiAgICAgICAgICAgICAgcmVuZGVyYnVmZmVyU3RhdGUuY3JlYXRlKHtcbiAgICAgICAgICAgICAgICBmb3JtYXQ6IGNvbG9yRm9ybWF0LFxuICAgICAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICAgICAgICB9KSkpXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIFxuXG4gICAgICBmcmFtZWJ1ZmZlci53aWR0aCA9IHdpZHRoXG4gICAgICBmcmFtZWJ1ZmZlci5oZWlnaHQgPSBoZWlnaHRcblxuICAgICAgdmFyIGRlcHRoQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIHN0ZW5jaWxCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgZGVwdGhTdGVuY2lsQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIG93bnNEZXB0aFN0ZW5jaWwgPSBmYWxzZVxuICAgICAgdmFyIGRlcHRoU3RlbmNpbENvdW50ID0gMFxuXG4gICAgICBpZiAoJ2RlcHRoQnVmZmVyJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGRlcHRoQnVmZmVyID0gcGFyc2VBdHRhY2htZW50KG9wdGlvbnMuZGVwdGhCdWZmZXIpXG4gICAgICAgIFxuICAgICAgICBkZXB0aFN0ZW5jaWxDb3VudCArPSAxXG4gICAgICB9XG4gICAgICBpZiAoJ3N0ZW5jaWxCdWZmZXInIGluIG9wdGlvbnMpIHtcbiAgICAgICAgc3RlbmNpbEJ1ZmZlciA9IHBhcnNlQXR0YWNobWVudChvcHRpb25zLnN0ZW5jaWxCdWZmZXIpXG4gICAgICAgIFxuICAgICAgICBkZXB0aFN0ZW5jaWxDb3VudCArPSAxXG4gICAgICB9XG4gICAgICBpZiAoJ2RlcHRoU3RlbmNpbEJ1ZmZlcicgaW4gb3B0aW9ucykge1xuICAgICAgICBkZXB0aFN0ZW5jaWxCdWZmZXIgPSBwYXJzZUF0dGFjaG1lbnQob3B0aW9ucy5kZXB0aFN0ZW5jaWxCdWZmZXIpXG4gICAgICAgIFxuICAgICAgICBkZXB0aFN0ZW5jaWxDb3VudCArPSAxXG4gICAgICB9XG5cbiAgICAgIGlmICghKGRlcHRoQnVmZmVyIHx8IHN0ZW5jaWxCdWZmZXIgfHwgZGVwdGhTdGVuY2lsQnVmZmVyKSkge1xuICAgICAgICB2YXIgZGVwdGggPSB0cnVlXG4gICAgICAgIHZhciBzdGVuY2lsID0gZmFsc2VcbiAgICAgICAgdmFyIHVzZVRleHR1cmUgPSBmYWxzZVxuXG4gICAgICAgIGlmICgnZGVwdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBkZXB0aCA9ICEhb3B0aW9ucy5kZXB0aFxuICAgICAgICB9XG4gICAgICAgIGlmICgnc3RlbmNpbCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHN0ZW5jaWwgPSAhIW9wdGlvbnMuc3RlbmNpbFxuICAgICAgICB9XG4gICAgICAgIGlmICgnZGVwdGhUZXh0dXJlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdXNlVGV4dHVyZSA9ICEhb3B0aW9ucy5kZXB0aFRleHR1cmVcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBjdXJEZXB0aFN0ZW5jaWwgPVxuICAgICAgICAgIGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudCB8fFxuICAgICAgICAgIGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50IHx8XG4gICAgICAgICAgZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudFxuICAgICAgICB2YXIgbmV4dERlcHRoU3RlbmNpbCA9IG51bGxcblxuICAgICAgICBpZiAoZGVwdGggfHwgc3RlbmNpbCkge1xuICAgICAgICAgIG93bnNEZXB0aFN0ZW5jaWwgPSB0cnVlXG5cbiAgICAgICAgICBpZiAodXNlVGV4dHVyZSkge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2YXIgZGVwdGhUZXh0dXJlRm9ybWF0XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChzdGVuY2lsKSB7XG4gICAgICAgICAgICAgIGRlcHRoVGV4dHVyZUZvcm1hdCA9ICdkZXB0aCBzdGVuY2lsJ1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZGVwdGhUZXh0dXJlRm9ybWF0ID0gJ2RlcHRoJ1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGZyYW1lYnVmZmVyLm93bnNEZXB0aFN0ZW5jaWwgJiYgY3VyRGVwdGhTdGVuY2lsLnRleHR1cmUpIHtcbiAgICAgICAgICAgICAgY3VyRGVwdGhTdGVuY2lsLnRleHR1cmUoe1xuICAgICAgICAgICAgICAgIGZvcm1hdDogZGVwdGhUZXh0dXJlRm9ybWF0LFxuICAgICAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICBjdXJEZXB0aFN0ZW5jaWwudGV4dHVyZS5fdGV4dHVyZS5yZWZDb3VudCArPSAxXG4gICAgICAgICAgICAgIG5leHREZXB0aFN0ZW5jaWwgPSBjdXJEZXB0aFN0ZW5jaWxcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIG5leHREZXB0aFN0ZW5jaWwgPSBuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KFxuICAgICAgICAgICAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICAgICAgICAgICAgMCxcbiAgICAgICAgICAgICAgICB0ZXh0dXJlU3RhdGUuY3JlYXRlKHtcbiAgICAgICAgICAgICAgICAgIGZvcm1hdDogZGVwdGhUZXh0dXJlRm9ybWF0LFxuICAgICAgICAgICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgICAgICAgICAgaGVpZ2h0OiBoZWlnaHRcbiAgICAgICAgICAgICAgICB9LCBHTF9URVhUVVJFXzJEKSxcbiAgICAgICAgICAgICAgICBudWxsKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgZGVwdGhSZW5kZXJidWZmZXJGb3JtYXRcbiAgICAgICAgICAgIGlmIChkZXB0aCkge1xuICAgICAgICAgICAgICBpZiAoc3RlbmNpbCkge1xuICAgICAgICAgICAgICAgIGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0ID0gJ2RlcHRoIHN0ZW5jaWwnXG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVwdGhSZW5kZXJidWZmZXJGb3JtYXQgPSAnZGVwdGgnXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0ID0gJ3N0ZW5jaWwnXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZnJhbWVidWZmZXIub3duc0RlcHRoU3RlbmNpbCAmJiBjdXJEZXB0aFN0ZW5jaWwucmVuZGVyYnVmZmVyKSB7XG4gICAgICAgICAgICAgIGN1ckRlcHRoU3RlbmNpbC5yZW5kZXJidWZmZXIoe1xuICAgICAgICAgICAgICAgIGZvcm1hdDogZGVwdGhSZW5kZXJidWZmZXJGb3JtYXQsXG4gICAgICAgICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIGN1ckRlcHRoU3RlbmNpbC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5yZWZDb3VudCArPSAxXG4gICAgICAgICAgICAgIG5leHREZXB0aFN0ZW5jaWwgPSBjdXJEZXB0aFN0ZW5jaWxcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIG5leHREZXB0aFN0ZW5jaWwgPSBuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KFxuICAgICAgICAgICAgICAgIEdMX1JFTkRFUkJVRkZFUixcbiAgICAgICAgICAgICAgICAwLFxuICAgICAgICAgICAgICAgIG51bGwsXG4gICAgICAgICAgICAgICAgcmVuZGVyYnVmZmVyU3RhdGUuY3JlYXRlKHtcbiAgICAgICAgICAgICAgICAgIGZvcm1hdDogZGVwdGhSZW5kZXJidWZmZXJGb3JtYXQsXG4gICAgICAgICAgICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICAgICAgICAgIH0pKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChkZXB0aCkge1xuICAgICAgICAgICAgaWYgKHN0ZW5jaWwpIHtcbiAgICAgICAgICAgICAgZGVwdGhTdGVuY2lsQnVmZmVyID0gbmV4dERlcHRoU3RlbmNpbFxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZGVwdGhCdWZmZXIgPSBuZXh0RGVwdGhTdGVuY2lsXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0ZW5jaWxCdWZmZXIgPSBuZXh0RGVwdGhTdGVuY2lsXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcblxuICAgICAgICBpbmNSZWZBbmRDaGVja1NoYXBlKFxuICAgICAgICAgIGRlcHRoQnVmZmVyIHx8XG4gICAgICAgICAgc3RlbmNpbEJ1ZmZlciB8fFxuICAgICAgICAgIGRlcHRoU3RlbmNpbEJ1ZmZlcixcbiAgICAgICAgICBmcmFtZWJ1ZmZlcilcbiAgICAgIH1cblxuICAgICAgZGVjRkJPUmVmcyhmcmFtZWJ1ZmZlcilcblxuICAgICAgZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50cyA9IGNvbG9yQnVmZmVyc1xuICAgICAgZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50ID0gZGVwdGhCdWZmZXJcbiAgICAgIGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50ID0gc3RlbmNpbEJ1ZmZlclxuICAgICAgZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IGRlcHRoU3RlbmNpbEJ1ZmZlclxuICAgICAgZnJhbWVidWZmZXIub3duc0NvbG9yID0gb3duc0NvbG9yXG4gICAgICBmcmFtZWJ1ZmZlci5vd25zRGVwdGhTdGVuY2lsID0gb3duc0RlcHRoU3RlbmNpbFxuXG4gICAgICByZWdsRnJhbWVidWZmZXIuY29sb3IgPSBjb2xvckJ1ZmZlcnMubWFwKHVud3JhcEF0dGFjaG1lbnQpXG4gICAgICByZWdsRnJhbWVidWZmZXIuZGVwdGggPSB1bndyYXBBdHRhY2htZW50KGRlcHRoQnVmZmVyKVxuICAgICAgcmVnbEZyYW1lYnVmZmVyLnN0ZW5jaWwgPSB1bndyYXBBdHRhY2htZW50KHN0ZW5jaWxCdWZmZXIpXG4gICAgICByZWdsRnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsID0gdW53cmFwQXR0YWNobWVudChkZXB0aFN0ZW5jaWxCdWZmZXIpXG5cbiAgICAgIHJlZnJlc2goZnJhbWVidWZmZXIpXG5cbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci53aWR0aCA9IGZyYW1lYnVmZmVyLndpZHRoXG4gICAgICByZWdsRnJhbWVidWZmZXIuaGVpZ2h0ID0gZnJhbWVidWZmZXIuaGVpZ2h0XG5cbiAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJcbiAgICB9XG5cbiAgICByZWdsRnJhbWVidWZmZXIob3B0aW9ucylcblxuICAgIHJlZ2xGcmFtZWJ1ZmZlci5fcmVnbFR5cGUgPSAnZnJhbWVidWZmZXInXG4gICAgcmVnbEZyYW1lYnVmZmVyLl9mcmFtZWJ1ZmZlciA9IGZyYW1lYnVmZmVyXG4gICAgcmVnbEZyYW1lYnVmZmVyLl9kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgZGVzdHJveShmcmFtZWJ1ZmZlcilcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbEZyYW1lYnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoQ2FjaGUgKCkge1xuICAgIHZhbHVlcyhmcmFtZWJ1ZmZlclNldCkuZm9yRWFjaChyZWZyZXNoKVxuICB9XG5cbiAgZnVuY3Rpb24gY2xlYXJDYWNoZSAoKSB7XG4gICAgdmFsdWVzKGZyYW1lYnVmZmVyU2V0KS5mb3JFYWNoKGRlc3Ryb3kpXG4gIH1cblxuICByZXR1cm4gZXh0ZW5kKGZyYW1lYnVmZmVyU3RhdGUsIHtcbiAgICBnZXRGcmFtZWJ1ZmZlcjogZnVuY3Rpb24gKG9iamVjdCkge1xuICAgICAgaWYgKHR5cGVvZiBvYmplY3QgPT09ICdmdW5jdGlvbicgJiYgb2JqZWN0Ll9yZWdsVHlwZSA9PT0gJ2ZyYW1lYnVmZmVyJykge1xuICAgICAgICB2YXIgZmJvID0gb2JqZWN0Ll9mcmFtZWJ1ZmZlclxuICAgICAgICBpZiAoZmJvIGluc3RhbmNlb2YgUkVHTEZyYW1lYnVmZmVyKSB7XG4gICAgICAgICAgcmV0dXJuIGZib1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH0sXG4gICAgY3JlYXRlOiBjcmVhdGVGQk8sXG4gICAgY2xlYXI6IGNsZWFyQ2FjaGUsXG4gICAgcmVmcmVzaDogcmVmcmVzaENhY2hlXG4gIH0pXG59XG4iLCJ2YXIgR0xfU1VCUElYRUxfQklUUyA9IDB4MEQ1MFxudmFyIEdMX1JFRF9CSVRTID0gMHgwRDUyXG52YXIgR0xfR1JFRU5fQklUUyA9IDB4MEQ1M1xudmFyIEdMX0JMVUVfQklUUyA9IDB4MEQ1NFxudmFyIEdMX0FMUEhBX0JJVFMgPSAweDBENTVcbnZhciBHTF9ERVBUSF9CSVRTID0gMHgwRDU2XG52YXIgR0xfU1RFTkNJTF9CSVRTID0gMHgwRDU3XG5cbnZhciBHTF9BTElBU0VEX1BPSU5UX1NJWkVfUkFOR0UgPSAweDg0NkRcbnZhciBHTF9BTElBU0VEX0xJTkVfV0lEVEhfUkFOR0UgPSAweDg0NkVcblxudmFyIEdMX01BWF9URVhUVVJFX1NJWkUgPSAweDBEMzNcbnZhciBHTF9NQVhfVklFV1BPUlRfRElNUyA9IDB4MEQzQVxudmFyIEdMX01BWF9WRVJURVhfQVRUUklCUyA9IDB4ODg2OVxudmFyIEdMX01BWF9WRVJURVhfVU5JRk9STV9WRUNUT1JTID0gMHg4REZCXG52YXIgR0xfTUFYX1ZBUllJTkdfVkVDVE9SUyA9IDB4OERGQ1xudmFyIEdMX01BWF9DT01CSU5FRF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4QjREXG52YXIgR0xfTUFYX1ZFUlRFWF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4QjRDXG52YXIgR0xfTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMgPSAweDg4NzJcbnZhciBHTF9NQVhfRlJBR01FTlRfVU5JRk9STV9WRUNUT1JTID0gMHg4REZEXG52YXIgR0xfTUFYX0NVQkVfTUFQX1RFWFRVUkVfU0laRSA9IDB4ODUxQ1xudmFyIEdMX01BWF9SRU5ERVJCVUZGRVJfU0laRSA9IDB4ODRFOFxuXG52YXIgR0xfVkVORE9SID0gMHgxRjAwXG52YXIgR0xfUkVOREVSRVIgPSAweDFGMDFcbnZhciBHTF9WRVJTSU9OID0gMHgxRjAyXG52YXIgR0xfU0hBRElOR19MQU5HVUFHRV9WRVJTSU9OID0gMHg4QjhDXG5cbnZhciBHTF9NQVhfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQgPSAweDg0RkZcblxudmFyIEdMX01BWF9DT0xPUl9BVFRBQ0hNRU5UU19XRUJHTCA9IDB4OENERlxudmFyIEdMX01BWF9EUkFXX0JVRkZFUlNfV0VCR0wgPSAweDg4MjRcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMpIHtcbiAgdmFyIG1heEFuaXNvdHJvcGljID0gMVxuICBpZiAoZXh0ZW5zaW9ucy5leHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMpIHtcbiAgICBtYXhBbmlzb3Ryb3BpYyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQpXG4gIH1cblxuICB2YXIgbWF4RHJhd2J1ZmZlcnMgPSAxXG4gIHZhciBtYXhDb2xvckF0dGFjaG1lbnRzID0gMVxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnMpIHtcbiAgICBtYXhEcmF3YnVmZmVycyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfRFJBV19CVUZGRVJTX1dFQkdMKVxuICAgIG1heENvbG9yQXR0YWNobWVudHMgPSBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NPTE9SX0FUVEFDSE1FTlRTX1dFQkdMKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICAvLyBkcmF3aW5nIGJ1ZmZlciBiaXQgZGVwdGhcbiAgICBjb2xvckJpdHM6IFtcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9SRURfQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfR1JFRU5fQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfQkxVRV9CSVRTKSxcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9BTFBIQV9CSVRTKVxuICAgIF0sXG4gICAgZGVwdGhCaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfREVQVEhfQklUUyksXG4gICAgc3RlbmNpbEJpdHM6IGdsLmdldFBhcmFtZXRlcihHTF9TVEVOQ0lMX0JJVFMpLFxuICAgIHN1YnBpeGVsQml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NVQlBJWEVMX0JJVFMpLFxuXG4gICAgLy8gc3VwcG9ydGVkIGV4dGVuc2lvbnNcbiAgICBleHRlbnNpb25zOiBPYmplY3Qua2V5cyhleHRlbnNpb25zKS5maWx0ZXIoZnVuY3Rpb24gKGV4dCkge1xuICAgICAgcmV0dXJuICEhZXh0ZW5zaW9uc1tleHRdXG4gICAgfSksXG5cbiAgICAvLyBtYXggYW5pc28gc2FtcGxlc1xuICAgIG1heEFuaXNvdHJvcGljOiBtYXhBbmlzb3Ryb3BpYyxcblxuICAgIC8vIG1heCBkcmF3IGJ1ZmZlcnNcbiAgICBtYXhEcmF3YnVmZmVyczogbWF4RHJhd2J1ZmZlcnMsXG4gICAgbWF4Q29sb3JBdHRhY2htZW50czogbWF4Q29sb3JBdHRhY2htZW50cyxcblxuICAgIC8vIHBvaW50IGFuZCBsaW5lIHNpemUgcmFuZ2VzXG4gICAgcG9pbnRTaXplRGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMSUFTRURfUE9JTlRfU0laRV9SQU5HRSksXG4gICAgbGluZVdpZHRoRGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMSUFTRURfTElORV9XSURUSF9SQU5HRSksXG4gICAgbWF4Vmlld3BvcnREaW1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZJRVdQT1JUX0RJTVMpLFxuICAgIG1heENvbWJpbmVkVGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NPTUJJTkVEX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heEN1YmVNYXBTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NVQkVfTUFQX1RFWFRVUkVfU0laRSksXG4gICAgbWF4UmVuZGVyYnVmZmVyU2l6ZTogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9SRU5ERVJCVUZGRVJfU0laRSksXG4gICAgbWF4VGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heFRleHR1cmVTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfU0laRSksXG4gICAgbWF4QXR0cmlidXRlczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WRVJURVhfQVRUUklCUyksXG4gICAgbWF4VmVydGV4VW5pZm9ybXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkVSVEVYX1VOSUZPUk1fVkVDVE9SUyksXG4gICAgbWF4VmVydGV4VGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZFUlRFWF9URVhUVVJFX0lNQUdFX1VOSVRTKSxcbiAgICBtYXhWYXJ5aW5nVmVjdG9yczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WQVJZSU5HX1ZFQ1RPUlMpLFxuICAgIG1heEZyYWdtZW50VW5pZm9ybXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfRlJBR01FTlRfVU5JRk9STV9WRUNUT1JTKSxcblxuICAgIC8vIHZlbmRvciBpbmZvXG4gICAgZ2xzbDogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NIQURJTkdfTEFOR1VBR0VfVkVSU0lPTiksXG4gICAgcmVuZGVyZXI6IGdsLmdldFBhcmFtZXRlcihHTF9SRU5ERVJFUiksXG4gICAgdmVuZG9yOiBnbC5nZXRQYXJhbWV0ZXIoR0xfVkVORE9SKSxcbiAgICB2ZXJzaW9uOiBnbC5nZXRQYXJhbWV0ZXIoR0xfVkVSU0lPTilcbiAgfVxufVxuIiwiXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcblxudmFyIEdMX1JHQkEgPSA2NDA4XG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9QQUNLX0FMSUdOTUVOVCA9IDB4MEQwNVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBSZWFkUGl4ZWxzIChnbCwgcmVnbFBvbGwsIGNvbnRleHQpIHtcbiAgZnVuY3Rpb24gcmVhZFBpeGVscyAoaW5wdXQpIHtcbiAgICB2YXIgb3B0aW9ucyA9IGlucHV0IHx8IHt9XG4gICAgaWYgKGlzVHlwZWRBcnJheShpbnB1dCkpIHtcbiAgICAgIG9wdGlvbnMgPSB7XG4gICAgICAgIGRhdGE6IG9wdGlvbnNcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDIpIHtcbiAgICAgIG9wdGlvbnMgPSB7XG4gICAgICAgIHdpZHRoOiBhcmd1bWVudHNbMF0gfCAwLFxuICAgICAgICBoZWlnaHQ6IGFyZ3VtZW50c1sxXSB8IDBcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBpbnB1dCAhPT0gJ29iamVjdCcpIHtcbiAgICAgIG9wdGlvbnMgPSB7fVxuICAgIH1cblxuICAgIC8vIFVwZGF0ZSBXZWJHTCBzdGF0ZVxuICAgIHJlZ2xQb2xsKClcblxuICAgIC8vIFJlYWQgdmlld3BvcnQgc3RhdGVcbiAgICB2YXIgeCA9IG9wdGlvbnMueCB8fCAwXG4gICAgdmFyIHkgPSBvcHRpb25zLnkgfHwgMFxuICAgIHZhciB3aWR0aCA9IG9wdGlvbnMud2lkdGggfHwgY29udGV4dC52aWV3cG9ydFdpZHRoXG4gICAgdmFyIGhlaWdodCA9IG9wdGlvbnMuaGVpZ2h0IHx8IGNvbnRleHQudmlld3BvcnRIZWlnaHRcblxuICAgIC8vIENvbXB1dGUgc2l6ZVxuICAgIHZhciBzaXplID0gd2lkdGggKiBoZWlnaHQgKiA0XG5cbiAgICAvLyBBbGxvY2F0ZSBkYXRhXG4gICAgdmFyIGRhdGEgPSBvcHRpb25zLmRhdGEgfHwgbmV3IFVpbnQ4QXJyYXkoc2l6ZSlcblxuICAgIC8vIFR5cGUgY2hlY2tcbiAgICBcbiAgICBcblxuICAgIC8vIFJ1biByZWFkIHBpeGVsc1xuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1BBQ0tfQUxJR05NRU5ULCA0KVxuICAgIGdsLnJlYWRQaXhlbHMoeCwgeSwgd2lkdGgsIGhlaWdodCwgR0xfUkdCQSwgR0xfVU5TSUdORURfQllURSwgZGF0YSlcblxuICAgIHJldHVybiBkYXRhXG4gIH1cblxuICByZXR1cm4gcmVhZFBpeGVsc1xufVxuIiwiXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi91dGlsL3ZhbHVlcycpXG5cbnZhciBHTF9SRU5ERVJCVUZGRVIgPSAweDhENDFcblxudmFyIEdMX1JHQkE0ID0gMHg4MDU2XG52YXIgR0xfUkdCNV9BMSA9IDB4ODA1N1xudmFyIEdMX1JHQjU2NSA9IDB4OEQ2MlxudmFyIEdMX0RFUFRIX0NPTVBPTkVOVDE2ID0gMHg4MUE1XG52YXIgR0xfU1RFTkNJTF9JTkRFWDggPSAweDhENDhcbnZhciBHTF9ERVBUSF9TVEVOQ0lMID0gMHg4NEY5XG5cbnZhciBHTF9TUkdCOF9BTFBIQThfRVhUID0gMHg4QzQzXG5cbnZhciBHTF9SR0JBMzJGX0VYVCA9IDB4ODgxNFxuXG52YXIgR0xfUkdCQTE2Rl9FWFQgPSAweDg4MUFcbnZhciBHTF9SR0IxNkZfRVhUID0gMHg4ODFCXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGdsLCBleHRlbnNpb25zLCBsaW1pdHMpIHtcbiAgdmFyIGZvcm1hdFR5cGVzID0ge1xuICAgICdyZ2JhNCc6IEdMX1JHQkE0LFxuICAgICdyZ2I1NjUnOiBHTF9SR0I1NjUsXG4gICAgJ3JnYjUgYTEnOiBHTF9SR0I1X0ExLFxuICAgICdkZXB0aCc6IEdMX0RFUFRIX0NPTVBPTkVOVDE2LFxuICAgICdzdGVuY2lsJzogR0xfU1RFTkNJTF9JTkRFWDgsXG4gICAgJ2RlcHRoIHN0ZW5jaWwnOiBHTF9ERVBUSF9TVEVOQ0lMXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIGZvcm1hdFR5cGVzWydzcmdiYSddID0gR0xfU1JHQjhfQUxQSEE4X0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X2NvbG9yX2J1ZmZlcl9oYWxmX2Zsb2F0KSB7XG4gICAgZm9ybWF0VHlwZXNbJ3JnYmExNmYnXSA9IEdMX1JHQkExNkZfRVhUXG4gICAgZm9ybWF0VHlwZXNbJ3JnYjE2ZiddID0gR0xfUkdCMTZGX0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29sb3JfYnVmZmVyX2Zsb2F0KSB7XG4gICAgZm9ybWF0VHlwZXNbJ3JnYmEzMmYnXSA9IEdMX1JHQkEzMkZfRVhUXG4gIH1cblxuICB2YXIgcmVuZGVyYnVmZmVyQ291bnQgPSAwXG4gIHZhciByZW5kZXJidWZmZXJTZXQgPSB7fVxuXG4gIGZ1bmN0aW9uIFJFR0xSZW5kZXJidWZmZXIgKCkge1xuICAgIHRoaXMuaWQgPSByZW5kZXJidWZmZXJDb3VudCsrXG4gICAgdGhpcy5yZWZDb3VudCA9IDFcblxuICAgIHRoaXMucmVuZGVyYnVmZmVyID0gbnVsbFxuXG4gICAgdGhpcy5mb3JtYXQgPSBHTF9SR0JBNFxuICAgIHRoaXMud2lkdGggPSAwXG4gICAgdGhpcy5oZWlnaHQgPSAwXG4gIH1cblxuICBSRUdMUmVuZGVyYnVmZmVyLnByb3RvdHlwZS5kZWNSZWYgPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKC0tdGhpcy5yZWZDb3VudCA9PT0gMCkge1xuICAgICAgZGVzdHJveSh0aGlzKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHJlZnJlc2ggKHJiKSB7XG4gICAgaWYgKCFnbC5pc1JlbmRlcmJ1ZmZlcihyYi5yZW5kZXJidWZmZXIpKSB7XG4gICAgICByYi5yZW5kZXJidWZmZXIgPSBnbC5jcmVhdGVSZW5kZXJidWZmZXIoKVxuICAgIH1cbiAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKEdMX1JFTkRFUkJVRkZFUiwgcmIucmVuZGVyYnVmZmVyKVxuICAgIGdsLnJlbmRlcmJ1ZmZlclN0b3JhZ2UoXG4gICAgICBHTF9SRU5ERVJCVUZGRVIsXG4gICAgICByYi5mb3JtYXQsXG4gICAgICByYi53aWR0aCxcbiAgICAgIHJiLmhlaWdodClcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKHJiKSB7XG4gICAgdmFyIGhhbmRsZSA9IHJiLnJlbmRlcmJ1ZmZlclxuICAgIFxuICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCBudWxsKVxuICAgIGlmIChnbC5pc1JlbmRlcmJ1ZmZlcihoYW5kbGUpKSB7XG4gICAgICBnbC5kZWxldGVSZW5kZXJidWZmZXIoaGFuZGxlKVxuICAgIH1cbiAgICByYi5yZW5kZXJidWZmZXIgPSBudWxsXG4gICAgcmIucmVmQ291bnQgPSAwXG4gICAgZGVsZXRlIHJlbmRlcmJ1ZmZlclNldFtyYi5pZF1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZVJlbmRlcmJ1ZmZlciAoaW5wdXQpIHtcbiAgICB2YXIgcmVuZGVyYnVmZmVyID0gbmV3IFJFR0xSZW5kZXJidWZmZXIoKVxuICAgIHJlbmRlcmJ1ZmZlclNldFtyZW5kZXJidWZmZXIuaWRdID0gcmVuZGVyYnVmZmVyXG5cbiAgICBmdW5jdGlvbiByZWdsUmVuZGVyYnVmZmVyIChpbnB1dCkge1xuICAgICAgdmFyIG9wdGlvbnMgPSBpbnB1dCB8fCB7fVxuXG4gICAgICB2YXIgdyA9IDBcbiAgICAgIHZhciBoID0gMFxuICAgICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgc2hhcGUgPSBvcHRpb25zLnNoYXBlXG4gICAgICAgIFxuICAgICAgICB3ID0gc2hhcGVbMF0gfCAwXG4gICAgICAgIGggPSBzaGFwZVsxXSB8IDBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdyA9IGggPSBvcHRpb25zLnJhZGl1cyB8IDBcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdyA9IG9wdGlvbnMud2lkdGggfCAwXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBoID0gb3B0aW9ucy5oZWlnaHQgfCAwXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHZhciBzID0gbGltaXRzLm1heFJlbmRlcmJ1ZmZlclNpemVcbiAgICAgIFxuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci53aWR0aCA9IHJlbmRlcmJ1ZmZlci53aWR0aCA9IE1hdGgubWF4KHcsIDEpXG4gICAgICByZWdsUmVuZGVyYnVmZmVyLmhlaWdodCA9IHJlbmRlcmJ1ZmZlci5oZWlnaHQgPSBNYXRoLm1heChoLCAxKVxuXG4gICAgICByZW5kZXJidWZmZXIuZm9ybWF0ID0gR0xfUkdCQTRcbiAgICAgIGlmICgnZm9ybWF0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBmb3JtYXQgPSBvcHRpb25zLmZvcm1hdFxuICAgICAgICBcbiAgICAgICAgcmVuZGVyYnVmZmVyLmZvcm1hdCA9IGZvcm1hdFR5cGVzW2Zvcm1hdF1cbiAgICAgIH1cblxuICAgICAgcmVmcmVzaChyZW5kZXJidWZmZXIpXG5cbiAgICAgIHJldHVybiByZWdsUmVuZGVyYnVmZmVyXG4gICAgfVxuXG4gICAgcmVnbFJlbmRlcmJ1ZmZlcihpbnB1dClcblxuICAgIHJlZ2xSZW5kZXJidWZmZXIuX3JlZ2xUeXBlID0gJ3JlbmRlcmJ1ZmZlcidcbiAgICByZWdsUmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIgPSByZW5kZXJidWZmZXJcbiAgICByZWdsUmVuZGVyYnVmZmVyLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICByZW5kZXJidWZmZXIuZGVjUmVmKClcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbFJlbmRlcmJ1ZmZlclxuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaFJlbmRlcmJ1ZmZlcnMgKCkge1xuICAgIHZhbHVlcyhyZW5kZXJidWZmZXJTZXQpLmZvckVhY2gocmVmcmVzaClcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3lSZW5kZXJidWZmZXJzICgpIHtcbiAgICB2YWx1ZXMocmVuZGVyYnVmZmVyU2V0KS5mb3JFYWNoKGRlc3Ryb3kpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNyZWF0ZTogY3JlYXRlUmVuZGVyYnVmZmVyLFxuICAgIHJlZnJlc2g6IHJlZnJlc2hSZW5kZXJidWZmZXJzLFxuICAgIGNsZWFyOiBkZXN0cm95UmVuZGVyYnVmZmVyc1xuICB9XG59XG4iLCJcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcblxudmFyIEdMX0ZSQUdNRU5UX1NIQURFUiA9IDM1NjMyXG52YXIgR0xfVkVSVEVYX1NIQURFUiA9IDM1NjMzXG5cbnZhciBHTF9BQ1RJVkVfVU5JRk9STVMgPSAweDhCODZcbnZhciBHTF9BQ1RJVkVfQVRUUklCVVRFUyA9IDB4OEI4OVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBTaGFkZXJTdGF0ZSAoZ2wsIHN0cmluZ1N0b3JlKSB7XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBnbHNsIGNvbXBpbGF0aW9uIGFuZCBsaW5raW5nXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICB2YXIgZnJhZ1NoYWRlcnMgPSB7fVxuICB2YXIgdmVydFNoYWRlcnMgPSB7fVxuXG4gIGZ1bmN0aW9uIEFjdGl2ZUluZm8gKG5hbWUsIGlkLCBsb2NhdGlvbiwgaW5mbykge1xuICAgIHRoaXMubmFtZSA9IG5hbWVcbiAgICB0aGlzLmlkID0gaWRcbiAgICB0aGlzLmxvY2F0aW9uID0gbG9jYXRpb25cbiAgICB0aGlzLmluZm8gPSBpbmZvXG4gIH1cblxuICBmdW5jdGlvbiBpbnNlcnRBY3RpdmVJbmZvIChsaXN0LCBpbmZvKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAobGlzdFtpXS5pZCA9PT0gaW5mby5pZCkge1xuICAgICAgICBsaXN0W2ldLmxvY2F0aW9uID0gaW5mby5sb2NhdGlvblxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICB9XG4gICAgbGlzdC5wdXNoKGluZm8pXG4gIH1cblxuICBmdW5jdGlvbiBnZXRTaGFkZXIgKHR5cGUsIGlkLCBjb21tYW5kKSB7XG4gICAgdmFyIGNhY2hlID0gdHlwZSA9PT0gR0xfRlJBR01FTlRfU0hBREVSID8gZnJhZ1NoYWRlcnMgOiB2ZXJ0U2hhZGVyc1xuICAgIHZhciBzaGFkZXIgPSBjYWNoZVtpZF1cblxuICAgIGlmICghc2hhZGVyKSB7XG4gICAgICB2YXIgc291cmNlID0gc3RyaW5nU3RvcmUuc3RyKGlkKVxuICAgICAgc2hhZGVyID0gZ2wuY3JlYXRlU2hhZGVyKHR5cGUpXG4gICAgICBnbC5zaGFkZXJTb3VyY2Uoc2hhZGVyLCBzb3VyY2UpXG4gICAgICBnbC5jb21waWxlU2hhZGVyKHNoYWRlcilcbiAgICAgIFxuICAgICAgY2FjaGVbaWRdID0gc2hhZGVyXG4gICAgfVxuXG4gICAgcmV0dXJuIHNoYWRlclxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIHByb2dyYW0gbGlua2luZ1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgdmFyIHByb2dyYW1DYWNoZSA9IHt9XG4gIHZhciBwcm9ncmFtTGlzdCA9IFtdXG5cbiAgdmFyIFBST0dSQU1fQ09VTlRFUiA9IDBcblxuICBmdW5jdGlvbiBSRUdMUHJvZ3JhbSAoZnJhZ0lkLCB2ZXJ0SWQpIHtcbiAgICB0aGlzLmlkID0gUFJPR1JBTV9DT1VOVEVSKytcbiAgICB0aGlzLmZyYWdJZCA9IGZyYWdJZFxuICAgIHRoaXMudmVydElkID0gdmVydElkXG4gICAgdGhpcy5wcm9ncmFtID0gbnVsbFxuICAgIHRoaXMudW5pZm9ybXMgPSBbXVxuICAgIHRoaXMuYXR0cmlidXRlcyA9IFtdXG4gIH1cblxuICBmdW5jdGlvbiBsaW5rUHJvZ3JhbSAoZGVzYywgY29tbWFuZCkge1xuICAgIHZhciBpLCBpbmZvXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gY29tcGlsZSAmIGxpbmtcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIGZyYWdTaGFkZXIgPSBnZXRTaGFkZXIoR0xfRlJBR01FTlRfU0hBREVSLCBkZXNjLmZyYWdJZClcbiAgICB2YXIgdmVydFNoYWRlciA9IGdldFNoYWRlcihHTF9WRVJURVhfU0hBREVSLCBkZXNjLnZlcnRJZClcblxuICAgIHZhciBwcm9ncmFtID0gZGVzYy5wcm9ncmFtID0gZ2wuY3JlYXRlUHJvZ3JhbSgpXG4gICAgZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW0sIGZyYWdTaGFkZXIpXG4gICAgZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW0sIHZlcnRTaGFkZXIpXG4gICAgZ2wubGlua1Byb2dyYW0ocHJvZ3JhbSlcbiAgICBcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBncmFiIHVuaWZvcm1zXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBudW1Vbmlmb3JtcyA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIocHJvZ3JhbSwgR0xfQUNUSVZFX1VOSUZPUk1TKVxuICAgIHZhciB1bmlmb3JtcyA9IGRlc2MudW5pZm9ybXNcbiAgICBmb3IgKGkgPSAwOyBpIDwgbnVtVW5pZm9ybXM7ICsraSkge1xuICAgICAgaW5mbyA9IGdsLmdldEFjdGl2ZVVuaWZvcm0ocHJvZ3JhbSwgaSlcbiAgICAgIGlmIChpbmZvKSB7XG4gICAgICAgIGlmIChpbmZvLnNpemUgPiAxKSB7XG4gICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBpbmZvLnNpemU7ICsraikge1xuICAgICAgICAgICAgdmFyIG5hbWUgPSBpbmZvLm5hbWUucmVwbGFjZSgnWzBdJywgJ1snICsgaiArICddJylcbiAgICAgICAgICAgIGluc2VydEFjdGl2ZUluZm8odW5pZm9ybXMsIG5ldyBBY3RpdmVJbmZvKFxuICAgICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgICBzdHJpbmdTdG9yZS5pZChuYW1lKSxcbiAgICAgICAgICAgICAgZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHByb2dyYW0sIG5hbWUpLFxuICAgICAgICAgICAgICBpbmZvKSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaW5zZXJ0QWN0aXZlSW5mbyh1bmlmb3JtcywgbmV3IEFjdGl2ZUluZm8oXG4gICAgICAgICAgICBpbmZvLm5hbWUsXG4gICAgICAgICAgICBzdHJpbmdTdG9yZS5pZChpbmZvLm5hbWUpLFxuICAgICAgICAgICAgZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHByb2dyYW0sIGluZm8ubmFtZSksXG4gICAgICAgICAgICBpbmZvKSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBncmFiIGF0dHJpYnV0ZXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIG51bUF0dHJpYnV0ZXMgPSBnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHByb2dyYW0sIEdMX0FDVElWRV9BVFRSSUJVVEVTKVxuICAgIHZhciBhdHRyaWJ1dGVzID0gZGVzYy5hdHRyaWJ1dGVzXG4gICAgZm9yIChpID0gMDsgaSA8IG51bUF0dHJpYnV0ZXM7ICsraSkge1xuICAgICAgaW5mbyA9IGdsLmdldEFjdGl2ZUF0dHJpYihwcm9ncmFtLCBpKVxuICAgICAgaWYgKGluZm8pIHtcbiAgICAgICAgaW5zZXJ0QWN0aXZlSW5mbyhhdHRyaWJ1dGVzLCBuZXcgQWN0aXZlSW5mbyhcbiAgICAgICAgICBpbmZvLm5hbWUsXG4gICAgICAgICAgc3RyaW5nU3RvcmUuaWQoaW5mby5uYW1lKSxcbiAgICAgICAgICBnbC5nZXRBdHRyaWJMb2NhdGlvbihwcm9ncmFtLCBpbmZvLm5hbWUpLFxuICAgICAgICAgIGluZm8pKVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBkZWxldGVTaGFkZXIgPSBnbC5kZWxldGVTaGFkZXIuYmluZChnbClcbiAgICAgIHZhbHVlcyhmcmFnU2hhZGVycykuZm9yRWFjaChkZWxldGVTaGFkZXIpXG4gICAgICBmcmFnU2hhZGVycyA9IHt9XG4gICAgICB2YWx1ZXModmVydFNoYWRlcnMpLmZvckVhY2goZGVsZXRlU2hhZGVyKVxuICAgICAgdmVydFNoYWRlcnMgPSB7fVxuXG4gICAgICBwcm9ncmFtTGlzdC5mb3JFYWNoKGZ1bmN0aW9uIChkZXNjKSB7XG4gICAgICAgIGdsLmRlbGV0ZVByb2dyYW0oZGVzYy5wcm9ncmFtKVxuICAgICAgfSlcbiAgICAgIHByb2dyYW1MaXN0Lmxlbmd0aCA9IDBcbiAgICAgIHByb2dyYW1DYWNoZSA9IHt9XG4gICAgfSxcblxuICAgIHJlZnJlc2g6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGZyYWdTaGFkZXJzID0ge31cbiAgICAgIHZlcnRTaGFkZXJzID0ge31cbiAgICAgIHByb2dyYW1MaXN0LmZvckVhY2gobGlua1Byb2dyYW0pXG4gICAgfSxcblxuICAgIHByb2dyYW06IGZ1bmN0aW9uICh2ZXJ0SWQsIGZyYWdJZCwgY29tbWFuZCkge1xuICAgICAgXG4gICAgICBcblxuICAgICAgdmFyIGNhY2hlID0gcHJvZ3JhbUNhY2hlW2ZyYWdJZF1cbiAgICAgIGlmICghY2FjaGUpIHtcbiAgICAgICAgY2FjaGUgPSBwcm9ncmFtQ2FjaGVbZnJhZ0lkXSA9IHt9XG4gICAgICB9XG4gICAgICB2YXIgcHJvZ3JhbSA9IGNhY2hlW3ZlcnRJZF1cbiAgICAgIGlmICghcHJvZ3JhbSkge1xuICAgICAgICBwcm9ncmFtID0gbmV3IFJFR0xQcm9ncmFtKGZyYWdJZCwgdmVydElkKVxuICAgICAgICBsaW5rUHJvZ3JhbShwcm9ncmFtLCBjb21tYW5kKVxuICAgICAgICBjYWNoZVt2ZXJ0SWRdID0gcHJvZ3JhbVxuICAgICAgICBwcm9ncmFtTGlzdC5wdXNoKHByb2dyYW0pXG4gICAgICB9XG4gICAgICByZXR1cm4gcHJvZ3JhbVxuICAgIH0sXG5cbiAgICBzaGFkZXI6IGdldFNoYWRlcixcblxuICAgIGZyYWc6IG51bGwsXG4gICAgdmVydDogbnVsbFxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZVN0cmluZ1N0b3JlICgpIHtcbiAgdmFyIHN0cmluZ0lkcyA9IHsnJzogMH1cbiAgdmFyIHN0cmluZ1ZhbHVlcyA9IFsnJ11cbiAgcmV0dXJuIHtcbiAgICBpZDogZnVuY3Rpb24gKHN0cikge1xuICAgICAgdmFyIHJlc3VsdCA9IHN0cmluZ0lkc1tzdHJdXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IHN0cmluZ0lkc1tzdHJdID0gc3RyaW5nVmFsdWVzLmxlbmd0aFxuICAgICAgc3RyaW5nVmFsdWVzLnB1c2goc3RyKVxuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH0sXG5cbiAgICBzdHI6IGZ1bmN0aW9uIChpZCkge1xuICAgICAgcmV0dXJuIHN0cmluZ1ZhbHVlc1tpZF1cbiAgICB9XG4gIH1cbn1cbiIsIlxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vdXRpbC9leHRlbmQnKVxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vdXRpbC9pcy10eXBlZC1hcnJheScpXG52YXIgaXNOREFycmF5TGlrZSA9IHJlcXVpcmUoJy4vdXRpbC9pcy1uZGFycmF5JylcbnZhciBsb2FkVGV4dHVyZSA9IHJlcXVpcmUoJy4vdXRpbC9sb2FkLXRleHR1cmUnKVxudmFyIGNvbnZlcnRUb0hhbGZGbG9hdCA9IHJlcXVpcmUoJy4vdXRpbC90by1oYWxmLWZsb2F0JylcbnZhciBwYXJzZUREUyA9IHJlcXVpcmUoJy4vdXRpbC9wYXJzZS1kZHMnKVxuXG52YXIgR0xfQ09NUFJFU1NFRF9URVhUVVJFX0ZPUk1BVFMgPSAweDg2QTNcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQID0gMHg4NTEzXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YID0gMHg4NTE1XG5cbnZhciBHTF9SR0JBID0gMHgxOTA4XG52YXIgR0xfQUxQSEEgPSAweDE5MDZcbnZhciBHTF9SR0IgPSAweDE5MDdcbnZhciBHTF9MVU1JTkFOQ0UgPSAweDE5MDlcbnZhciBHTF9MVU1JTkFOQ0VfQUxQSEEgPSAweDE5MEFcblxudmFyIEdMX1JHQkE0ID0gMHg4MDU2XG52YXIgR0xfUkdCNV9BMSA9IDB4ODA1N1xudmFyIEdMX1JHQjU2NSA9IDB4OEQ2MlxuXG52YXIgR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNCA9IDB4ODAzM1xudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzEgPSAweDgwMzRcbnZhciBHTF9VTlNJR05FRF9TSE9SVF81XzZfNSA9IDB4ODM2M1xudmFyIEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMID0gMHg4NEZBXG5cbnZhciBHTF9ERVBUSF9DT01QT05FTlQgPSAweDE5MDJcbnZhciBHTF9ERVBUSF9TVEVOQ0lMID0gMHg4NEY5XG5cbnZhciBHTF9TUkdCX0VYVCA9IDB4OEM0MFxudmFyIEdMX1NSR0JfQUxQSEFfRVhUID0gMHg4QzQyXG5cbnZhciBHTF9IQUxGX0ZMT0FUX09FUyA9IDB4OEQ2MVxuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVCA9IDB4ODNGMFxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhUID0gMHg4M0YxXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFQgPSAweDgzRjJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVCA9IDB4ODNGM1xuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfQVRDX1dFQkdMID0gMHg4QzkyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19FWFBMSUNJVF9BTFBIQV9XRUJHTCA9IDB4OEM5M1xudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9BVENfSU5URVJQT0xBVEVEX0FMUEhBX1dFQkdMID0gMHg4N0VFXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ180QlBQVjFfSU1HID0gMHg4QzAwXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfMkJQUFYxX0lNRyA9IDB4OEMwMVxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ180QlBQVjFfSU1HID0gMHg4QzAyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzJCUFBWMV9JTUcgPSAweDhDMDNcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0wgPSAweDhENjRcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSAweDE0MDFcbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDB4MTQwM1xudmFyIEdMX1VOU0lHTkVEX0lOVCA9IDB4MTQwNVxudmFyIEdMX0ZMT0FUID0gMHgxNDA2XG5cbnZhciBHTF9URVhUVVJFX1dSQVBfUyA9IDB4MjgwMlxudmFyIEdMX1RFWFRVUkVfV1JBUF9UID0gMHgyODAzXG5cbnZhciBHTF9SRVBFQVQgPSAweDI5MDFcbnZhciBHTF9DTEFNUF9UT19FREdFID0gMHg4MTJGXG52YXIgR0xfTUlSUk9SRURfUkVQRUFUID0gMHg4MzcwXG5cbnZhciBHTF9URVhUVVJFX01BR19GSUxURVIgPSAweDI4MDBcbnZhciBHTF9URVhUVVJFX01JTl9GSUxURVIgPSAweDI4MDFcblxudmFyIEdMX05FQVJFU1QgPSAweDI2MDBcbnZhciBHTF9MSU5FQVIgPSAweDI2MDFcbnZhciBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNUID0gMHgyNzAwXG52YXIgR0xfTElORUFSX01JUE1BUF9ORUFSRVNUID0gMHgyNzAxXG52YXIgR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSID0gMHgyNzAyXG52YXIgR0xfTElORUFSX01JUE1BUF9MSU5FQVIgPSAweDI3MDNcblxudmFyIEdMX0dFTkVSQVRFX01JUE1BUF9ISU5UID0gMHg4MTkyXG52YXIgR0xfRE9OVF9DQVJFID0gMHgxMTAwXG52YXIgR0xfRkFTVEVTVCA9IDB4MTEwMVxudmFyIEdMX05JQ0VTVCA9IDB4MTEwMlxuXG52YXIgR0xfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQgPSAweDg0RkVcblxudmFyIEdMX1VOUEFDS19BTElHTk1FTlQgPSAweDBDRjVcbnZhciBHTF9VTlBBQ0tfRkxJUF9ZX1dFQkdMID0gMHg5MjQwXG52YXIgR0xfVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBX1dFQkdMID0gMHg5MjQxXG52YXIgR0xfVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTl9XRUJHTCA9IDB4OTI0M1xuXG52YXIgR0xfQlJPV1NFUl9ERUZBVUxUX1dFQkdMID0gMHg5MjQ0XG5cbnZhciBHTF9URVhUVVJFMCA9IDB4ODRDMFxuXG52YXIgTUlQTUFQX0ZJTFRFUlMgPSBbXG4gIEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QsXG4gIEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUixcbiAgR0xfTElORUFSX01JUE1BUF9ORUFSRVNULFxuICBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUlxuXVxuXG5mdW5jdGlvbiBpc1BvdzIgKHYpIHtcbiAgcmV0dXJuICEodiAmICh2IC0gMSkpICYmICghIXYpXG59XG5cbmZ1bmN0aW9uIGlzTnVtZXJpY0FycmF5IChhcnIpIHtcbiAgcmV0dXJuIChcbiAgICBBcnJheS5pc0FycmF5KGFycikgJiZcbiAgICAoYXJyLmxlbmd0aCA9PT0gMCB8fFxuICAgIHR5cGVvZiBhcnJbMF0gPT09ICdudW1iZXInKSlcbn1cblxuZnVuY3Rpb24gaXNSZWN0QXJyYXkgKGFycikge1xuICBpZiAoIUFycmF5LmlzQXJyYXkoYXJyKSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgdmFyIHdpZHRoID0gYXJyLmxlbmd0aFxuICBpZiAod2lkdGggPT09IDAgfHwgIUFycmF5LmlzQXJyYXkoYXJyWzBdKSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgdmFyIGhlaWdodCA9IGFyclswXS5sZW5ndGhcbiAgZm9yICh2YXIgaSA9IDE7IGkgPCB3aWR0aDsgKytpKSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGFycltpXSkgfHwgYXJyW2ldLmxlbmd0aCAhPT0gaGVpZ2h0KSB7XG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRydWVcbn1cblxuZnVuY3Rpb24gY2xhc3NTdHJpbmcgKHgpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4KVxufVxuXG5mdW5jdGlvbiBpc0NhbnZhc0VsZW1lbnQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gJ1tvYmplY3QgSFRNTENhbnZhc0VsZW1lbnRdJ1xufVxuXG5mdW5jdGlvbiBpc0NvbnRleHQyRCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSAnW29iamVjdCBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkRdJ1xufVxuXG5mdW5jdGlvbiBpc0ltYWdlRWxlbWVudCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSAnW29iamVjdCBIVE1MSW1hZ2VFbGVtZW50XSdcbn1cblxuZnVuY3Rpb24gaXNWaWRlb0VsZW1lbnQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gJ1tvYmplY3QgSFRNTFZpZGVvRWxlbWVudF0nXG59XG5cbmZ1bmN0aW9uIGlzUGVuZGluZ1hIUiAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSAnW29iamVjdCBYTUxIdHRwUmVxdWVzdF0nXG59XG5cbmZ1bmN0aW9uIGlzUGl4ZWxEYXRhIChvYmplY3QpIHtcbiAgcmV0dXJuIChcbiAgICB0eXBlb2Ygb2JqZWN0ID09PSAnc3RyaW5nJyB8fFxuICAgICghIW9iamVjdCAmJiAoXG4gICAgICBpc1R5cGVkQXJyYXkob2JqZWN0KSB8fFxuICAgICAgaXNOdW1lcmljQXJyYXkob2JqZWN0KSB8fFxuICAgICAgaXNOREFycmF5TGlrZShvYmplY3QpIHx8XG4gICAgICBpc0NhbnZhc0VsZW1lbnQob2JqZWN0KSB8fFxuICAgICAgaXNDb250ZXh0MkQob2JqZWN0KSB8fFxuICAgICAgaXNJbWFnZUVsZW1lbnQob2JqZWN0KSB8fFxuICAgICAgaXNWaWRlb0VsZW1lbnQob2JqZWN0KSB8fFxuICAgICAgaXNSZWN0QXJyYXkob2JqZWN0KSkpKVxufVxuXG4vLyBUcmFuc3Bvc2UgYW4gYXJyYXkgb2YgcGl4ZWxzXG5mdW5jdGlvbiB0cmFuc3Bvc2VQaXhlbHMgKGRhdGEsIG54LCBueSwgbmMsIHN4LCBzeSwgc2MsIG9mZikge1xuICB2YXIgcmVzdWx0ID0gbmV3IGRhdGEuY29uc3RydWN0b3IobnggKiBueSAqIG5jKVxuICB2YXIgcHRyID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IG55OyArK2kpIHtcbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IG54OyArK2opIHtcbiAgICAgIGZvciAodmFyIGsgPSAwOyBrIDwgbmM7ICsraykge1xuICAgICAgICByZXN1bHRbcHRyKytdID0gZGF0YVtzeSAqIGkgKyBzeCAqIGogKyBzYyAqIGsgKyBvZmZdXG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVUZXh0dXJlU2V0IChnbCwgZXh0ZW5zaW9ucywgbGltaXRzLCByZWdsUG9sbCwgY29udGV4dFN0YXRlKSB7XG4gIHZhciBtaXBtYXBIaW50ID0ge1xuICAgIFwiZG9uJ3QgY2FyZVwiOiBHTF9ET05UX0NBUkUsXG4gICAgJ2RvbnQgY2FyZSc6IEdMX0RPTlRfQ0FSRSxcbiAgICAnbmljZSc6IEdMX05JQ0VTVCxcbiAgICAnZmFzdCc6IEdMX0ZBU1RFU1RcbiAgfVxuXG4gIHZhciB3cmFwTW9kZXMgPSB7XG4gICAgJ3JlcGVhdCc6IEdMX1JFUEVBVCxcbiAgICAnY2xhbXAnOiBHTF9DTEFNUF9UT19FREdFLFxuICAgICdtaXJyb3InOiBHTF9NSVJST1JFRF9SRVBFQVRcbiAgfVxuXG4gIHZhciBtYWdGaWx0ZXJzID0ge1xuICAgICduZWFyZXN0JzogR0xfTkVBUkVTVCxcbiAgICAnbGluZWFyJzogR0xfTElORUFSXG4gIH1cblxuICB2YXIgbWluRmlsdGVycyA9IGV4dGVuZCh7XG4gICAgJ25lYXJlc3QgbWlwbWFwIG5lYXJlc3QnOiBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNULFxuICAgICdsaW5lYXIgbWlwbWFwIG5lYXJlc3QnOiBHTF9MSU5FQVJfTUlQTUFQX05FQVJFU1QsXG4gICAgJ25lYXJlc3QgbWlwbWFwIGxpbmVhcic6IEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUixcbiAgICAnbGluZWFyIG1pcG1hcCBsaW5lYXInOiBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUixcbiAgICAnbWlwbWFwJzogR0xfTElORUFSX01JUE1BUF9MSU5FQVJcbiAgfSwgbWFnRmlsdGVycylcblxuICB2YXIgY29sb3JTcGFjZSA9IHtcbiAgICAnbm9uZSc6IDAsXG4gICAgJ2Jyb3dzZXInOiBHTF9CUk9XU0VSX0RFRkFVTFRfV0VCR0xcbiAgfVxuXG4gIHZhciB0ZXh0dXJlVHlwZXMgPSB7XG4gICAgJ3VpbnQ4JzogR0xfVU5TSUdORURfQllURSxcbiAgICAncmdiYTQnOiBHTF9VTlNJR05FRF9TSE9SVF80XzRfNF80LFxuICAgICdyZ2I1NjUnOiBHTF9VTlNJR05FRF9TSE9SVF81XzZfNSxcbiAgICAncmdiNSBhMSc6IEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzFcbiAgfVxuXG4gIHZhciB0ZXh0dXJlRm9ybWF0cyA9IHtcbiAgICAnYWxwaGEnOiBHTF9BTFBIQSxcbiAgICAnbHVtaW5hbmNlJzogR0xfTFVNSU5BTkNFLFxuICAgICdsdW1pbmFuY2UgYWxwaGEnOiBHTF9MVU1JTkFOQ0VfQUxQSEEsXG4gICAgJ3JnYic6IEdMX1JHQixcbiAgICAncmdiYSc6IEdMX1JHQkEsXG4gICAgJ3JnYmE0JzogR0xfUkdCQTQsXG4gICAgJ3JnYjUgYTEnOiBHTF9SR0I1X0ExLFxuICAgICdyZ2I1NjUnOiBHTF9SR0I1NjVcbiAgfVxuXG4gIHZhciBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMgPSB7fVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9zcmdiKSB7XG4gICAgdGV4dHVyZUZvcm1hdHMuc3JnYiA9IEdMX1NSR0JfRVhUXG4gICAgdGV4dHVyZUZvcm1hdHMuc3JnYmEgPSBHTF9TUkdCX0FMUEhBX0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfZmxvYXQpIHtcbiAgICB0ZXh0dXJlVHlwZXMuZmxvYXQgPSBHTF9GTE9BVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfaGFsZl9mbG9hdCkge1xuICAgIHRleHR1cmVUeXBlc1snaGFsZiBmbG9hdCddID0gR0xfSEFMRl9GTE9BVF9PRVNcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2RlcHRoX3RleHR1cmUpIHtcbiAgICBleHRlbmQodGV4dHVyZUZvcm1hdHMsIHtcbiAgICAgICdkZXB0aCc6IEdMX0RFUFRIX0NPTVBPTkVOVCxcbiAgICAgICdkZXB0aCBzdGVuY2lsJzogR0xfREVQVEhfU1RFTkNJTFxuICAgIH0pXG5cbiAgICBleHRlbmQodGV4dHVyZVR5cGVzLCB7XG4gICAgICAndWludDE2JzogR0xfVU5TSUdORURfU0hPUlQsXG4gICAgICAndWludDMyJzogR0xfVU5TSUdORURfSU5ULFxuICAgICAgJ2RlcHRoIHN0ZW5jaWwnOiBHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTFxuICAgIH0pXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfczN0Yykge1xuICAgIGV4dGVuZChjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMsIHtcbiAgICAgICdyZ2IgczN0YyBkeHQxJzogR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVCxcbiAgICAgICdyZ2JhIHMzdGMgZHh0MSc6IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhULFxuICAgICAgJ3JnYmEgczN0YyBkeHQzJzogR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFQsXG4gICAgICAncmdiYSBzM3RjIGR4dDUnOiBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVFxuICAgIH0pXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfYXRjKSB7XG4gICAgZXh0ZW5kKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ3JnYiBhcmMnOiBHTF9DT01QUkVTU0VEX1JHQl9BVENfV0VCR0wsXG4gICAgICAncmdiYSBhdGMgZXhwbGljaXQgYWxwaGEnOiBHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0VYUExJQ0lUX0FMUEhBX1dFQkdMLFxuICAgICAgJ3JnYmEgYXRjIGludGVycG9sYXRlZCBhbHBoYSc6IEdMX0NPTVBSRVNTRURfUkdCQV9BVENfSU5URVJQT0xBVEVEX0FMUEhBX1dFQkdMXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9wdnJ0Yykge1xuICAgIGV4dGVuZChjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMsIHtcbiAgICAgICdyZ2IgcHZydGMgNGJwcHYxJzogR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfNEJQUFYxX0lNRyxcbiAgICAgICdyZ2IgcHZydGMgMmJwcHYxJzogR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfMkJQUFYxX0lNRyxcbiAgICAgICdyZ2JhIHB2cnRjIDRicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ180QlBQVjFfSU1HLFxuICAgICAgJ3JnYmEgcHZydGMgMmJwcHYxJzogR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzJCUFBWMV9JTUdcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX2V0YzEpIHtcbiAgICBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHNbJ3JnYiBldGMxJ10gPSBHTF9DT01QUkVTU0VEX1JHQl9FVEMxX1dFQkdMXG4gIH1cblxuICAvLyBDb3B5IG92ZXIgYWxsIHRleHR1cmUgZm9ybWF0c1xuICB2YXIgc3VwcG9ydGVkQ29tcHJlc3NlZEZvcm1hdHMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChcbiAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfQ09NUFJFU1NFRF9URVhUVVJFX0ZPUk1BVFMpKVxuICBPYmplY3Qua2V5cyhjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB2YXIgZm9ybWF0ID0gY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzW25hbWVdXG4gICAgaWYgKHN1cHBvcnRlZENvbXByZXNzZWRGb3JtYXRzLmluZGV4T2YoZm9ybWF0KSA+PSAwKSB7XG4gICAgICB0ZXh0dXJlRm9ybWF0c1tuYW1lXSA9IGZvcm1hdFxuICAgIH1cbiAgfSlcblxuICB2YXIgc3VwcG9ydGVkRm9ybWF0cyA9IE9iamVjdC5rZXlzKHRleHR1cmVGb3JtYXRzKVxuICBsaW1pdHMudGV4dHVyZUZvcm1hdHMgPSBzdXBwb3J0ZWRGb3JtYXRzXG5cbiAgdmFyIGNvbG9yRm9ybWF0cyA9IHN1cHBvcnRlZEZvcm1hdHMucmVkdWNlKGZ1bmN0aW9uIChjb2xvciwga2V5KSB7XG4gICAgdmFyIGdsZW51bSA9IHRleHR1cmVGb3JtYXRzW2tleV1cbiAgICBpZiAoZ2xlbnVtID09PSBHTF9MVU1JTkFOQ0UgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9BTFBIQSB8fFxuICAgICAgICBnbGVudW0gPT09IEdMX0xVTUlOQU5DRSB8fFxuICAgICAgICBnbGVudW0gPT09IEdMX0xVTUlOQU5DRV9BTFBIQSB8fFxuICAgICAgICBnbGVudW0gPT09IEdMX0RFUFRIX0NPTVBPTkVOVCB8fFxuICAgICAgICBnbGVudW0gPT09IEdMX0RFUFRIX1NURU5DSUwpIHtcbiAgICAgIGNvbG9yW2dsZW51bV0gPSBnbGVudW1cbiAgICB9IGVsc2UgaWYgKGdsZW51bSA9PT0gR0xfUkdCNV9BMSB8fCBrZXkuaW5kZXhPZigncmdiYScpID49IDApIHtcbiAgICAgIGNvbG9yW2dsZW51bV0gPSBHTF9SR0JBXG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbG9yW2dsZW51bV0gPSBHTF9SR0JcbiAgICB9XG4gICAgcmV0dXJuIGNvbG9yXG4gIH0sIHt9KVxuXG4gIC8vIFBpeGVsIHN0b3JhZ2UgcGFyc2luZ1xuICBmdW5jdGlvbiBQaXhlbEluZm8gKHRhcmdldCkge1xuICAgIC8vIHRleCB0YXJnZXRcbiAgICB0aGlzLnRhcmdldCA9IHRhcmdldFxuXG4gICAgLy8gcGl4ZWxTdG9yZWkgaW5mb1xuICAgIHRoaXMuZmxpcFkgPSBmYWxzZVxuICAgIHRoaXMucHJlbXVsdGlwbHlBbHBoYSA9IGZhbHNlXG4gICAgdGhpcy51bnBhY2tBbGlnbm1lbnQgPSAxXG4gICAgdGhpcy5jb2xvclNwYWNlID0gMFxuXG4gICAgLy8gc2hhcGVcbiAgICB0aGlzLndpZHRoID0gMFxuICAgIHRoaXMuaGVpZ2h0ID0gMFxuICAgIHRoaXMuY2hhbm5lbHMgPSAwXG5cbiAgICAvLyBmb3JtYXQgYW5kIHR5cGVcbiAgICB0aGlzLmZvcm1hdCA9IDBcbiAgICB0aGlzLmludGVybmFsZm9ybWF0ID0gMFxuICAgIHRoaXMudHlwZSA9IDBcbiAgICB0aGlzLmNvbXByZXNzZWQgPSBmYWxzZVxuXG4gICAgLy8gbWlwIGxldmVsXG4gICAgdGhpcy5taXBsZXZlbCA9IDBcblxuICAgIC8vIG5kYXJyYXktbGlrZSBwYXJhbWV0ZXJzXG4gICAgdGhpcy5zdHJpZGVYID0gMFxuICAgIHRoaXMuc3RyaWRlWSA9IDBcbiAgICB0aGlzLnN0cmlkZUMgPSAwXG4gICAgdGhpcy5vZmZzZXQgPSAwXG5cbiAgICAvLyBjb3B5IHBpeGVscyBpbmZvXG4gICAgdGhpcy54ID0gMFxuICAgIHRoaXMueSA9IDBcbiAgICB0aGlzLmNvcHkgPSBmYWxzZVxuXG4gICAgLy8gZGF0YSBzb3VyY2VzXG4gICAgdGhpcy5kYXRhID0gbnVsbFxuICAgIHRoaXMuaW1hZ2UgPSBudWxsXG4gICAgdGhpcy52aWRlbyA9IG51bGxcbiAgICB0aGlzLmNhbnZhcyA9IG51bGxcbiAgICB0aGlzLnhociA9IG51bGxcblxuICAgIC8vIENPUlNcbiAgICB0aGlzLmNyb3NzT3JpZ2luID0gbnVsbFxuXG4gICAgLy8gaG9ycmlibGUgc3RhdGUgZmxhZ3NcbiAgICB0aGlzLm5lZWRzUG9sbCA9IGZhbHNlXG4gICAgdGhpcy5uZWVkc0xpc3RlbmVycyA9IGZhbHNlXG4gIH1cblxuICBleHRlbmQoUGl4ZWxJbmZvLnByb3RvdHlwZSwge1xuICAgIHBhcnNlRmxhZ3M6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMgIT09ICdvYmplY3QnIHx8ICFvcHRpb25zKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICBpZiAoJ3ByZW11bHRpcGx5QWxwaGEnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgXG4gICAgICAgIHRoaXMucHJlbXVsdGlwbHlBbHBoYSA9IG9wdGlvbnMucHJlbXVsdGlwbHlBbHBoYVxuICAgICAgfVxuXG4gICAgICBpZiAoJ2ZsaXBZJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIFxuICAgICAgICB0aGlzLmZsaXBZID0gb3B0aW9ucy5mbGlwWVxuICAgICAgfVxuXG4gICAgICBpZiAoJ2FsaWdubWVudCcgaW4gb3B0aW9ucykge1xuICAgICAgICBcbiAgICAgICAgdGhpcy51bnBhY2tBbGlnbm1lbnQgPSBvcHRpb25zLmFsaWdubWVudFxuICAgICAgfVxuXG4gICAgICBpZiAoJ2NvbG9yU3BhY2UnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgXG4gICAgICAgIHRoaXMuY29sb3JTcGFjZSA9IGNvbG9yU3BhY2Vbb3B0aW9ucy5jb2xvclNwYWNlXVxuICAgICAgfVxuXG4gICAgICBpZiAoJ2Zvcm1hdCcgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgZm9ybWF0ID0gb3B0aW9ucy5mb3JtYXRcbiAgICAgICAgXG4gICAgICAgIHRoaXMuaW50ZXJuYWxmb3JtYXQgPSB0ZXh0dXJlRm9ybWF0c1tmb3JtYXRdXG4gICAgICAgIGlmIChmb3JtYXQgaW4gdGV4dHVyZVR5cGVzKSB7XG4gICAgICAgICAgdGhpcy50eXBlID0gdGV4dHVyZVR5cGVzW2Zvcm1hdF1cbiAgICAgICAgfVxuICAgICAgICBpZiAoZm9ybWF0IGluIGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cykge1xuICAgICAgICAgIHRoaXMuY29tcHJlc3NlZCA9IHRydWVcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoJ3R5cGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHR5cGUgPSBvcHRpb25zLnR5cGVcbiAgICAgICAgXG4gICAgICAgIHRoaXMudHlwZSA9IHRleHR1cmVUeXBlc1t0eXBlXVxuICAgICAgfVxuXG4gICAgICB2YXIgdyA9IHRoaXMud2lkdGhcbiAgICAgIHZhciBoID0gdGhpcy5oZWlnaHRcbiAgICAgIHZhciBjID0gdGhpcy5jaGFubmVsc1xuICAgICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xuICAgICAgICBcbiAgICAgICAgdyA9IG9wdGlvbnMuc2hhcGVbMF1cbiAgICAgICAgaCA9IG9wdGlvbnMuc2hhcGVbMV1cbiAgICAgICAgaWYgKG9wdGlvbnMuc2hhcGUubGVuZ3RoID09PSAzKSB7XG4gICAgICAgICAgYyA9IG9wdGlvbnMuc2hhcGVbMl1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB3ID0gaCA9IG9wdGlvbnMucmFkaXVzXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCd3aWR0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHcgPSBvcHRpb25zLndpZHRoXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBoID0gb3B0aW9ucy5oZWlnaHRcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ2NoYW5uZWxzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgYyA9IG9wdGlvbnMuY2hhbm5lbHNcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdGhpcy53aWR0aCA9IHcgfCAwXG4gICAgICB0aGlzLmhlaWdodCA9IGggfCAwXG4gICAgICB0aGlzLmNoYW5uZWxzID0gYyB8IDBcblxuICAgICAgaWYgKCdzdHJpZGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHN0cmlkZSA9IG9wdGlvbnMuc3RyaWRlXG4gICAgICAgIFxuICAgICAgICB0aGlzLnN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgdGhpcy5zdHJpZGVZID0gc3RyaWRlWzFdXG4gICAgICAgIGlmIChzdHJpZGUubGVuZ3RoID09PSAzKSB7XG4gICAgICAgICAgdGhpcy5zdHJpZGVDID0gc3RyaWRlWzJdXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5zdHJpZGVDID0gMVxuICAgICAgICB9XG4gICAgICAgIHRoaXMubmVlZHNUcmFuc3Bvc2UgPSB0cnVlXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnN0cmlkZUMgPSAxXG4gICAgICAgIHRoaXMuc3RyaWRlWCA9IHRoaXMuc3RyaWRlQyAqIGNcbiAgICAgICAgdGhpcy5zdHJpZGVZID0gdGhpcy5zdHJpZGVYICogd1xuICAgICAgfVxuXG4gICAgICBpZiAoJ29mZnNldCcgaW4gb3B0aW9ucykge1xuICAgICAgICB0aGlzLm9mZnNldCA9IG9wdGlvbnMub2Zmc2V0IHwgMFxuICAgICAgICB0aGlzLm5lZWRzVHJhbnNwb3NlID0gdHJ1ZVxuICAgICAgfVxuXG4gICAgICBpZiAoJ2Nyb3NzT3JpZ2luJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHRoaXMuY3Jvc3NPcmlnaW4gPSBvcHRpb25zLmNyb3NzT3JpZ2luXG4gICAgICB9XG4gICAgfSxcbiAgICBwYXJzZTogZnVuY3Rpb24gKG9wdGlvbnMsIG1pcGxldmVsKSB7XG4gICAgICB0aGlzLm1pcGxldmVsID0gbWlwbGV2ZWxcbiAgICAgIHRoaXMud2lkdGggPSB0aGlzLndpZHRoID4+IG1pcGxldmVsXG4gICAgICB0aGlzLmhlaWdodCA9IHRoaXMuaGVpZ2h0ID4+IG1pcGxldmVsXG5cbiAgICAgIHZhciBkYXRhID0gb3B0aW9uc1xuICAgICAgc3dpdGNoICh0eXBlb2Ygb3B0aW9ucykge1xuICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICAgICAgaWYgKCFvcHRpb25zKSB7XG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG4gICAgICAgICAgdGhpcy5wYXJzZUZsYWdzKG9wdGlvbnMpXG4gICAgICAgICAgaWYgKGlzUGl4ZWxEYXRhKG9wdGlvbnMuZGF0YSkpIHtcbiAgICAgICAgICAgIGRhdGEgPSBvcHRpb25zLmRhdGFcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBcbiAgICAgIH1cblxuICAgICAgaWYgKHR5cGVvZiBkYXRhID09PSAnc3RyaW5nJykge1xuICAgICAgICBkYXRhID0gbG9hZFRleHR1cmUoZGF0YSwgdGhpcy5jcm9zc09yaWdpbilcbiAgICAgIH1cblxuICAgICAgdmFyIGFycmF5ID0gbnVsbFxuICAgICAgdmFyIG5lZWRzQ29udmVydCA9IGZhbHNlXG5cbiAgICAgIGlmICh0aGlzLmNvbXByZXNzZWQpIHtcbiAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIGlmIChkYXRhID09PSBudWxsKSB7XG4gICAgICAgIC8vIFRPRE9cbiAgICAgIH0gZWxzZSBpZiAoaXNUeXBlZEFycmF5KGRhdGEpKSB7XG4gICAgICAgIHRoaXMuZGF0YSA9IGRhdGFcbiAgICAgIH0gZWxzZSBpZiAoaXNOdW1lcmljQXJyYXkoZGF0YSkpIHtcbiAgICAgICAgYXJyYXkgPSBkYXRhXG4gICAgICAgIG5lZWRzQ29udmVydCA9IHRydWVcbiAgICAgIH0gZWxzZSBpZiAoaXNOREFycmF5TGlrZShkYXRhKSkge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhLmRhdGEpKSB7XG4gICAgICAgICAgYXJyYXkgPSBkYXRhLmRhdGFcbiAgICAgICAgICBuZWVkc0NvbnZlcnQgPSB0cnVlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5kYXRhID0gZGF0YS5kYXRhXG4gICAgICAgIH1cbiAgICAgICAgdmFyIHNoYXBlID0gZGF0YS5zaGFwZVxuICAgICAgICB0aGlzLndpZHRoID0gc2hhcGVbMF1cbiAgICAgICAgdGhpcy5oZWlnaHQgPSBzaGFwZVsxXVxuICAgICAgICBpZiAoc2hhcGUubGVuZ3RoID09PSAzKSB7XG4gICAgICAgICAgdGhpcy5jaGFubmVscyA9IHNoYXBlWzJdXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5jaGFubmVscyA9IDFcbiAgICAgICAgfVxuICAgICAgICB2YXIgc3RyaWRlID0gZGF0YS5zdHJpZGVcbiAgICAgICAgdGhpcy5zdHJpZGVYID0gZGF0YS5zdHJpZGVbMF1cbiAgICAgICAgdGhpcy5zdHJpZGVZID0gZGF0YS5zdHJpZGVbMV1cbiAgICAgICAgaWYgKHN0cmlkZS5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgICB0aGlzLnN0cmlkZUMgPSBkYXRhLnN0cmlkZVsyXVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuc3RyaWRlQyA9IDFcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm9mZnNldCA9IGRhdGEub2Zmc2V0XG4gICAgICAgIHRoaXMubmVlZHNUcmFuc3Bvc2UgPSB0cnVlXG4gICAgICB9IGVsc2UgaWYgKGlzQ2FudmFzRWxlbWVudChkYXRhKSB8fCBpc0NvbnRleHQyRChkYXRhKSkge1xuICAgICAgICBpZiAoaXNDYW52YXNFbGVtZW50KGRhdGEpKSB7XG4gICAgICAgICAgdGhpcy5jYW52YXMgPSBkYXRhXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5jYW52YXMgPSBkYXRhLmNhbnZhc1xuICAgICAgICB9XG4gICAgICAgIHRoaXMud2lkdGggPSB0aGlzLmNhbnZhcy53aWR0aFxuICAgICAgICB0aGlzLmhlaWdodCA9IHRoaXMuY2FudmFzLmhlaWdodFxuICAgICAgICB0aGlzLnNldERlZmF1bHRGb3JtYXQoKVxuICAgICAgfSBlbHNlIGlmIChpc0ltYWdlRWxlbWVudChkYXRhKSkge1xuICAgICAgICB0aGlzLmltYWdlID0gZGF0YVxuICAgICAgICBpZiAoIWRhdGEuY29tcGxldGUpIHtcbiAgICAgICAgICB0aGlzLndpZHRoID0gdGhpcy53aWR0aCB8fCBkYXRhLm5hdHVyYWxXaWR0aFxuICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gdGhpcy5oZWlnaHQgfHwgZGF0YS5uYXR1cmFsSGVpZ2h0XG4gICAgICAgICAgdGhpcy5uZWVkc0xpc3RlbmVycyA9IHRydWVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLndpZHRoID0gZGF0YS5uYXR1cmFsV2lkdGhcbiAgICAgICAgICB0aGlzLmhlaWdodCA9IGRhdGEubmF0dXJhbEhlaWdodFxuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2V0RGVmYXVsdEZvcm1hdCgpXG4gICAgICB9IGVsc2UgaWYgKGlzVmlkZW9FbGVtZW50KGRhdGEpKSB7XG4gICAgICAgIHRoaXMudmlkZW8gPSBkYXRhXG4gICAgICAgIGlmIChkYXRhLnJlYWR5U3RhdGUgPiAxKSB7XG4gICAgICAgICAgdGhpcy53aWR0aCA9IGRhdGEud2lkdGhcbiAgICAgICAgICB0aGlzLmhlaWdodCA9IGRhdGEuaGVpZ2h0XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy53aWR0aCA9IHRoaXMud2lkdGggfHwgZGF0YS53aWR0aFxuICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gdGhpcy5oZWlnaHQgfHwgZGF0YS5oZWlnaHRcbiAgICAgICAgICB0aGlzLm5lZWRzTGlzdGVuZXJzID0gdHJ1ZVxuICAgICAgICB9XG4gICAgICAgIHRoaXMubmVlZHNQb2xsID0gdHJ1ZVxuICAgICAgICB0aGlzLnNldERlZmF1bHRGb3JtYXQoKVxuICAgICAgfSBlbHNlIGlmIChpc1BlbmRpbmdYSFIoZGF0YSkpIHtcbiAgICAgICAgdGhpcy54aHIgPSBkYXRhXG4gICAgICAgIHRoaXMubmVlZHNMaXN0ZW5lcnMgPSB0cnVlXG4gICAgICB9IGVsc2UgaWYgKGlzUmVjdEFycmF5KGRhdGEpKSB7XG4gICAgICAgIHZhciB3ID0gZGF0YVswXS5sZW5ndGhcbiAgICAgICAgdmFyIGggPSBkYXRhLmxlbmd0aFxuICAgICAgICB2YXIgYyA9IDFcbiAgICAgICAgdmFyIGksIGosIGssIHBcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YVswXVswXSkpIHtcbiAgICAgICAgICBjID0gZGF0YVswXVswXS5sZW5ndGhcbiAgICAgICAgICBcbiAgICAgICAgICBhcnJheSA9IEFycmF5KHcgKiBoICogYylcbiAgICAgICAgICBwID0gMFxuICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBoOyArK2opIHtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCB3OyArK2kpIHtcbiAgICAgICAgICAgICAgZm9yIChrID0gMDsgayA8IGM7ICsraykge1xuICAgICAgICAgICAgICAgIGFycmF5W3ArK10gPSBkYXRhW2pdW2ldW2tdXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYXJyYXkgPSBBcnJheSh3ICogaClcbiAgICAgICAgICBwID0gMFxuICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBoOyArK2opIHtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCB3OyArK2kpIHtcbiAgICAgICAgICAgICAgYXJyYXlbcCsrXSA9IGRhdGFbal1baV1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy53aWR0aCA9IHdcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoXG4gICAgICAgIHRoaXMuY2hhbm5lbHMgPSBjXG4gICAgICAgIG5lZWRzQ29udmVydCA9IHRydWVcbiAgICAgIH0gZWxzZSBpZiAob3B0aW9ucy5jb3B5KSB7XG4gICAgICAgIHRoaXMuY29weSA9IHRydWVcbiAgICAgICAgdGhpcy54ID0gdGhpcy54IHwgMFxuICAgICAgICB0aGlzLnkgPSB0aGlzLnkgfCAwXG4gICAgICAgIHRoaXMud2lkdGggPSAodGhpcy53aWR0aCB8fCBjb250ZXh0U3RhdGUudmlld3BvcnRXaWR0aCkgfCAwXG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gKHRoaXMuaGVpZ2h0IHx8IGNvbnRleHRTdGF0ZS52aWV3cG9ydEhlaWdodCkgfCAwXG4gICAgICAgIHRoaXMuc2V0RGVmYXVsdEZvcm1hdCgpXG4gICAgICB9XG5cbiAgICAgIC8vIEZpeCB1cCBtaXNzaW5nIHR5cGUgaW5mbyBmb3IgdHlwZWQgYXJyYXlzXG4gICAgICBpZiAoIXRoaXMudHlwZSAmJiB0aGlzLmRhdGEpIHtcbiAgICAgICAgaWYgKHRoaXMuZm9ybWF0ID09PSBHTF9ERVBUSF9DT01QT05FTlQpIHtcbiAgICAgICAgICBpZiAodGhpcy5kYXRhIGluc3RhbmNlb2YgVWludDE2QXJyYXkpIHtcbiAgICAgICAgICAgIHRoaXMudHlwZSA9IEdMX1VOU0lHTkVEX1NIT1JUXG4gICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmRhdGEgaW5zdGFuY2VvZiBVaW50MzJBcnJheSkge1xuICAgICAgICAgICAgdGhpcy50eXBlID0gR0xfVU5TSUdORURfSU5UXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YSBpbnN0YW5jZW9mIEZsb2F0MzJBcnJheSkge1xuICAgICAgICAgIHRoaXMudHlwZSA9IEdMX0ZMT0FUXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gSW5mZXIgZGVmYXVsdCBmb3JtYXRcbiAgICAgIGlmICghdGhpcy5pbnRlcm5hbGZvcm1hdCkge1xuICAgICAgICB2YXIgY2hhbm5lbHMgPSB0aGlzLmNoYW5uZWxzID0gdGhpcy5jaGFubmVscyB8fCA0XG4gICAgICAgIHRoaXMuaW50ZXJuYWxmb3JtYXQgPSBbXG4gICAgICAgICAgR0xfTFVNSU5BTkNFLFxuICAgICAgICAgIEdMX0xVTUlOQU5DRV9BTFBIQSxcbiAgICAgICAgICBHTF9SR0IsXG4gICAgICAgICAgR0xfUkdCQV1bY2hhbm5lbHMgLSAxXVxuICAgICAgICBcbiAgICAgIH1cblxuICAgICAgdmFyIGZvcm1hdCA9IHRoaXMuaW50ZXJuYWxmb3JtYXRcbiAgICAgIGlmIChmb3JtYXQgPT09IEdMX0RFUFRIX0NPTVBPTkVOVCB8fCBmb3JtYXQgPT09IEdMX0RFUFRIX1NURU5DSUwpIHtcbiAgICAgICAgXG4gICAgICAgIGlmIChmb3JtYXQgPT09IEdMX0RFUFRIX0NPTVBPTkVOVCkge1xuICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICAgIGlmIChmb3JtYXQgPT09IEdMX0RFUFRIX1NURU5DSUwpIHtcbiAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgIH1cblxuICAgICAgLy8gQ29tcHV0ZSBjb2xvciBmb3JtYXQgYW5kIG51bWJlciBvZiBjaGFubmVsc1xuICAgICAgdmFyIGNvbG9yRm9ybWF0ID0gdGhpcy5mb3JtYXQgPSBjb2xvckZvcm1hdHNbZm9ybWF0XVxuICAgICAgaWYgKCF0aGlzLmNoYW5uZWxzKSB7XG4gICAgICAgIHN3aXRjaCAoY29sb3JGb3JtYXQpIHtcbiAgICAgICAgICBjYXNlIEdMX0xVTUlOQU5DRTpcbiAgICAgICAgICBjYXNlIEdMX0FMUEhBOlxuICAgICAgICAgIGNhc2UgR0xfREVQVEhfQ09NUE9ORU5UOlxuICAgICAgICAgICAgdGhpcy5jaGFubmVscyA9IDFcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBjYXNlIEdMX0RFUFRIX1NURU5DSUw6XG4gICAgICAgICAgY2FzZSBHTF9MVU1JTkFOQ0VfQUxQSEE6XG4gICAgICAgICAgICB0aGlzLmNoYW5uZWxzID0gMlxuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGNhc2UgR0xfUkdCOlxuICAgICAgICAgICAgdGhpcy5jaGFubmVscyA9IDNcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgdGhpcy5jaGFubmVscyA9IDRcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayB0aGF0IHRleHR1cmUgdHlwZSBpcyBzdXBwb3J0ZWRcbiAgICAgIHZhciB0eXBlID0gdGhpcy50eXBlXG4gICAgICBpZiAodHlwZSA9PT0gR0xfRkxPQVQpIHtcbiAgICAgICAgXG4gICAgICB9IGVsc2UgaWYgKHR5cGUgPT09IEdMX0hBTEZfRkxPQVRfT0VTKSB7XG4gICAgICAgIFxuICAgICAgfSBlbHNlIGlmICghdHlwZSkge1xuICAgICAgICBpZiAoZm9ybWF0ID09PSBHTF9ERVBUSF9DT01QT05FTlQpIHtcbiAgICAgICAgICB0eXBlID0gR0xfVU5TSUdORURfSU5UXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdGhpcy50eXBlID0gdHlwZVxuXG4gICAgICAvLyBhcHBseSBjb252ZXJzaW9uXG4gICAgICBpZiAobmVlZHNDb252ZXJ0KSB7XG4gICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IG5ldyBVaW50OEFycmF5KGFycmF5KVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUOlxuICAgICAgICAgICAgdGhpcy5kYXRhID0gbmV3IFVpbnQxNkFycmF5KGFycmF5KVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX0lOVDpcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IG5ldyBVaW50MzJBcnJheShhcnJheSlcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IG5ldyBGbG9hdDMyQXJyYXkoYXJyYXkpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfSEFMRl9GTE9BVF9PRVM6XG4gICAgICAgICAgICB0aGlzLmRhdGEgPSBjb252ZXJ0VG9IYWxmRmxvYXQoYXJyYXkpXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVF81XzZfNTpcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzE6XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVF80XzRfNF80OlxuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfSU5UXzI0XzhfV0VCR0w6XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuZGF0YSkge1xuICAgICAgICAvLyBhcHBseSB0cmFuc3Bvc2VcbiAgICAgICAgaWYgKHRoaXMubmVlZHNUcmFuc3Bvc2UpIHtcbiAgICAgICAgICB0aGlzLmRhdGEgPSB0cmFuc3Bvc2VQaXhlbHMoXG4gICAgICAgICAgICB0aGlzLmRhdGEsXG4gICAgICAgICAgICB0aGlzLndpZHRoLFxuICAgICAgICAgICAgdGhpcy5oZWlnaHQsXG4gICAgICAgICAgICB0aGlzLmNoYW5uZWxzLFxuICAgICAgICAgICAgdGhpcy5zdHJpZGVYLFxuICAgICAgICAgICAgdGhpcy5zdHJpZGVZLFxuICAgICAgICAgICAgdGhpcy5zdHJpZGVDLFxuICAgICAgICAgICAgdGhpcy5vZmZzZXQpXG4gICAgICAgIH1cbiAgICAgICAgLy8gY2hlY2sgZGF0YSB0eXBlXG4gICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81OlxuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMTpcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQ6XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVDpcbiAgICAgICAgICBjYXNlIEdMX0hBTEZfRkxPQVRfT0VTOlxuICAgICAgICAgICAgXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfSU5UOlxuICAgICAgICAgICAgXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB0aGlzLm5lZWRzVHJhbnNwb3NlID0gZmFsc2VcbiAgICB9LFxuXG4gICAgc2V0RGVmYXVsdEZvcm1hdDogZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy5mb3JtYXQgPSB0aGlzLmludGVybmFsZm9ybWF0ID0gR0xfUkdCQVxuICAgICAgdGhpcy50eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgICAgdGhpcy5jaGFubmVscyA9IDRcbiAgICAgIHRoaXMuY29tcHJlc3NlZCA9IGZhbHNlXG4gICAgfSxcblxuICAgIHVwbG9hZDogZnVuY3Rpb24gKHBhcmFtcykge1xuICAgICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX0ZMSVBfWV9XRUJHTCwgdGhpcy5mbGlwWSlcbiAgICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19QUkVNVUxUSVBMWV9BTFBIQV9XRUJHTCwgdGhpcy5wcmVtdWx0aXBseUFscGhhKVxuICAgICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTl9XRUJHTCwgdGhpcy5jb2xvclNwYWNlKVxuICAgICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX0FMSUdOTUVOVCwgdGhpcy51bnBhY2tBbGlnbm1lbnQpXG5cbiAgICAgIHZhciB0YXJnZXQgPSB0aGlzLnRhcmdldFxuICAgICAgdmFyIG1pcGxldmVsID0gdGhpcy5taXBsZXZlbFxuICAgICAgdmFyIGltYWdlID0gdGhpcy5pbWFnZVxuICAgICAgdmFyIGNhbnZhcyA9IHRoaXMuY2FudmFzXG4gICAgICB2YXIgdmlkZW8gPSB0aGlzLnZpZGVvXG4gICAgICB2YXIgZGF0YSA9IHRoaXMuZGF0YVxuICAgICAgdmFyIGludGVybmFsZm9ybWF0ID0gdGhpcy5pbnRlcm5hbGZvcm1hdFxuICAgICAgdmFyIGZvcm1hdCA9IHRoaXMuZm9ybWF0XG4gICAgICB2YXIgdHlwZSA9IHRoaXMudHlwZVxuICAgICAgdmFyIHdpZHRoID0gdGhpcy53aWR0aCB8fCBNYXRoLm1heCgxLCBwYXJhbXMud2lkdGggPj4gbWlwbGV2ZWwpXG4gICAgICB2YXIgaGVpZ2h0ID0gdGhpcy5oZWlnaHQgfHwgTWF0aC5tYXgoMSwgcGFyYW1zLmhlaWdodCA+PiBtaXBsZXZlbClcbiAgICAgIGlmICh2aWRlbyAmJiB2aWRlby5yZWFkeVN0YXRlID4gMikge1xuICAgICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgZm9ybWF0LCB0eXBlLCB2aWRlbylcbiAgICAgIH0gZWxzZSBpZiAoaW1hZ2UgJiYgaW1hZ2UuY29tcGxldGUpIHtcbiAgICAgICAgZ2wudGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIGZvcm1hdCwgdHlwZSwgaW1hZ2UpXG4gICAgICB9IGVsc2UgaWYgKGNhbnZhcykge1xuICAgICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgZm9ybWF0LCB0eXBlLCBjYW52YXMpXG4gICAgICB9IGVsc2UgaWYgKHRoaXMuY29tcHJlc3NlZCkge1xuICAgICAgICBnbC5jb21wcmVzc2VkVGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBpbnRlcm5hbGZvcm1hdCwgd2lkdGgsIGhlaWdodCwgMCwgZGF0YSlcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5jb3B5KSB7XG4gICAgICAgIHJlZ2xQb2xsKClcbiAgICAgICAgZ2wuY29weVRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCB0aGlzLngsIHRoaXMueSwgd2lkdGgsIGhlaWdodCwgMClcbiAgICAgIH0gZWxzZSBpZiAoZGF0YSkge1xuICAgICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgd2lkdGgsIGhlaWdodCwgMCwgZm9ybWF0LCB0eXBlLCBkYXRhKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZ2wudGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIHdpZHRoIHx8IDEsIGhlaWdodCB8fCAxLCAwLCBmb3JtYXQsIHR5cGUsIG51bGwpXG4gICAgICB9XG4gICAgfVxuICB9KVxuXG4gIGZ1bmN0aW9uIFRleFBhcmFtcyAodGFyZ2V0KSB7XG4gICAgdGhpcy50YXJnZXQgPSB0YXJnZXRcblxuICAgIC8vIERlZmF1bHQgaW1hZ2Ugc2hhcGUgaW5mb1xuICAgIHRoaXMud2lkdGggPSAwXG4gICAgdGhpcy5oZWlnaHQgPSAwXG4gICAgdGhpcy5mb3JtYXQgPSAwXG4gICAgdGhpcy5pbnRlcm5hbGZvcm1hdCA9IDBcbiAgICB0aGlzLnR5cGUgPSAwXG5cbiAgICAvLyB3cmFwIG1vZGVcbiAgICB0aGlzLndyYXBTID0gR0xfQ0xBTVBfVE9fRURHRVxuICAgIHRoaXMud3JhcFQgPSBHTF9DTEFNUF9UT19FREdFXG5cbiAgICAvLyBmaWx0ZXJpbmdcbiAgICB0aGlzLm1pbkZpbHRlciA9IDBcbiAgICB0aGlzLm1hZ0ZpbHRlciA9IEdMX05FQVJFU1RcbiAgICB0aGlzLmFuaXNvdHJvcGljID0gMVxuXG4gICAgLy8gbWlwbWFwc1xuICAgIHRoaXMuZ2VuTWlwbWFwcyA9IGZhbHNlXG4gICAgdGhpcy5taXBtYXBIaW50ID0gR0xfRE9OVF9DQVJFXG4gIH1cblxuICBleHRlbmQoVGV4UGFyYW1zLnByb3RvdHlwZSwge1xuICAgIHBhcnNlOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zICE9PSAnb2JqZWN0JyB8fCAhb3B0aW9ucykge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgaWYgKCdtaW4nIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIG1pbkZpbHRlciA9IG9wdGlvbnMubWluXG4gICAgICAgIFxuICAgICAgICB0aGlzLm1pbkZpbHRlciA9IG1pbkZpbHRlcnNbbWluRmlsdGVyXVxuICAgICAgfVxuXG4gICAgICBpZiAoJ21hZycgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgbWFnRmlsdGVyID0gb3B0aW9ucy5tYWdcbiAgICAgICAgXG4gICAgICAgIHRoaXMubWFnRmlsdGVyID0gbWFnRmlsdGVyc1ttYWdGaWx0ZXJdXG4gICAgICB9XG5cbiAgICAgIHZhciB3cmFwUyA9IHRoaXMud3JhcFNcbiAgICAgIHZhciB3cmFwVCA9IHRoaXMud3JhcFRcbiAgICAgIGlmICgnd3JhcCcgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgd3JhcCA9IG9wdGlvbnMud3JhcFxuICAgICAgICBpZiAodHlwZW9mIHdyYXAgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgXG4gICAgICAgICAgd3JhcFMgPSB3cmFwVCA9IHdyYXBNb2Rlc1t3cmFwXVxuICAgICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkod3JhcCkpIHtcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICB3cmFwUyA9IHdyYXBNb2Rlc1t3cmFwWzBdXVxuICAgICAgICAgIHdyYXBUID0gd3JhcE1vZGVzW3dyYXBbMV1dXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICgnd3JhcFMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgb3B0V3JhcFMgPSBvcHRpb25zLndyYXBTXG4gICAgICAgICAgXG4gICAgICAgICAgd3JhcFMgPSB3cmFwTW9kZXNbb3B0V3JhcFNdXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCd3cmFwVCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHZhciBvcHRXcmFwVCA9IG9wdGlvbnMud3JhcFRcbiAgICAgICAgICBcbiAgICAgICAgICB3cmFwVCA9IHdyYXBNb2Rlc1tvcHRXcmFwVF1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdGhpcy53cmFwUyA9IHdyYXBTXG4gICAgICB0aGlzLndyYXBUID0gd3JhcFRcblxuICAgICAgaWYgKCdhbmlzb3Ryb3BpYycgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgYW5pc290cm9waWMgPSBvcHRpb25zLmFuaXNvdHJvcGljXG4gICAgICAgIFxuICAgICAgICB0aGlzLmFuaXNvdHJvcGljID0gb3B0aW9ucy5hbmlzb3Ryb3BpY1xuICAgICAgfVxuXG4gICAgICBpZiAoJ21pcG1hcCcgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgbWlwbWFwID0gb3B0aW9ucy5taXBtYXBcbiAgICAgICAgc3dpdGNoICh0eXBlb2YgbWlwbWFwKSB7XG4gICAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdGhpcy5taXBtYXBIaW50ID0gbWlwbWFwSGludFttaXBtYXBdXG4gICAgICAgICAgICB0aGlzLmdlbk1pcG1hcHMgPSB0cnVlXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICAgICAgICB0aGlzLmdlbk1pcG1hcHMgPSAhIW1pcG1hcFxuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcblxuICAgIHVwbG9hZDogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHRhcmdldCA9IHRoaXMudGFyZ2V0XG4gICAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9NSU5fRklMVEVSLCB0aGlzLm1pbkZpbHRlcilcbiAgICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX01BR19GSUxURVIsIHRoaXMubWFnRmlsdGVyKVxuICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfV1JBUF9TLCB0aGlzLndyYXBTKVxuICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfV1JBUF9ULCB0aGlzLndyYXBUKVxuICAgICAgaWYgKGV4dGVuc2lvbnMuZXh0X3RleHR1cmVfZmlsdGVyX2FuaXNvdHJvcGljKSB7XG4gICAgICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVCwgdGhpcy5hbmlzb3Ryb3BpYylcbiAgICAgIH1cbiAgICAgIGlmICh0aGlzLmdlbk1pcG1hcHMpIHtcbiAgICAgICAgZ2wuaGludChHTF9HRU5FUkFURV9NSVBNQVBfSElOVCwgdGhpcy5taXBtYXBIaW50KVxuICAgICAgICBnbC5nZW5lcmF0ZU1pcG1hcCh0YXJnZXQpXG4gICAgICB9XG4gICAgfVxuICB9KVxuXG4gIC8vIEZpbmFsIHBhc3MgdG8gbWVyZ2UgcGFyYW1zIGFuZCBwaXhlbCBkYXRhXG4gIGZ1bmN0aW9uIGNoZWNrVGV4dHVyZUNvbXBsZXRlIChwYXJhbXMsIHBpeGVscykge1xuICAgIHZhciBpLCBwaXhtYXBcblxuICAgIHZhciB0eXBlID0gMFxuICAgIHZhciBmb3JtYXQgPSAwXG4gICAgdmFyIGludGVybmFsZm9ybWF0ID0gMFxuICAgIHZhciB3aWR0aCA9IDBcbiAgICB2YXIgaGVpZ2h0ID0gMFxuICAgIHZhciBjaGFubmVscyA9IDBcbiAgICB2YXIgY29tcHJlc3NlZCA9IGZhbHNlXG4gICAgdmFyIG5lZWRzUG9sbCA9IGZhbHNlXG4gICAgdmFyIG5lZWRzTGlzdGVuZXJzID0gZmFsc2VcbiAgICB2YXIgbWlwTWFzazJEID0gMFxuICAgIHZhciBtaXBNYXNrQ3ViZSA9IFswLCAwLCAwLCAwLCAwLCAwXVxuICAgIHZhciBjdWJlTWFzayA9IDBcbiAgICB2YXIgaGFzTWlwID0gZmFsc2VcbiAgICBmb3IgKGkgPSAwOyBpIDwgcGl4ZWxzLmxlbmd0aDsgKytpKSB7XG4gICAgICBwaXhtYXAgPSBwaXhlbHNbaV1cbiAgICAgIHdpZHRoID0gd2lkdGggfHwgKHBpeG1hcC53aWR0aCA8PCBwaXhtYXAubWlwbGV2ZWwpXG4gICAgICBoZWlnaHQgPSBoZWlnaHQgfHwgKHBpeG1hcC5oZWlnaHQgPDwgcGl4bWFwLm1pcGxldmVsKVxuICAgICAgdHlwZSA9IHR5cGUgfHwgcGl4bWFwLnR5cGVcbiAgICAgIGZvcm1hdCA9IGZvcm1hdCB8fCBwaXhtYXAuZm9ybWF0XG4gICAgICBpbnRlcm5hbGZvcm1hdCA9IGludGVybmFsZm9ybWF0IHx8IHBpeG1hcC5pbnRlcm5hbGZvcm1hdFxuICAgICAgY2hhbm5lbHMgPSBjaGFubmVscyB8fCBwaXhtYXAuY2hhbm5lbHNcbiAgICAgIG5lZWRzUG9sbCA9IG5lZWRzUG9sbCB8fCBwaXhtYXAubmVlZHNQb2xsXG4gICAgICBuZWVkc0xpc3RlbmVycyA9IG5lZWRzTGlzdGVuZXJzIHx8IHBpeG1hcC5uZWVkc0xpc3RlbmVyc1xuICAgICAgY29tcHJlc3NlZCA9IGNvbXByZXNzZWQgfHwgcGl4bWFwLmNvbXByZXNzZWRcblxuICAgICAgdmFyIG1pcGxldmVsID0gcGl4bWFwLm1pcGxldmVsXG4gICAgICB2YXIgdGFyZ2V0ID0gcGl4bWFwLnRhcmdldFxuICAgICAgaGFzTWlwID0gaGFzTWlwIHx8IChtaXBsZXZlbCA+IDApXG4gICAgICBpZiAodGFyZ2V0ID09PSBHTF9URVhUVVJFXzJEKSB7XG4gICAgICAgIG1pcE1hc2syRCB8PSAoMSA8PCBtaXBsZXZlbClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBmYWNlID0gdGFyZ2V0IC0gR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YXG4gICAgICAgIG1pcE1hc2tDdWJlW2ZhY2VdIHw9ICgxIDw8IG1pcGxldmVsKVxuICAgICAgICBjdWJlTWFzayB8PSAoMSA8PCBmYWNlKVxuICAgICAgfVxuICAgIH1cblxuICAgIHBhcmFtcy5uZWVkc1BvbGwgPSBuZWVkc1BvbGxcbiAgICBwYXJhbXMubmVlZHNMaXN0ZW5lcnMgPSBuZWVkc0xpc3RlbmVyc1xuICAgIHBhcmFtcy53aWR0aCA9IHdpZHRoXG4gICAgcGFyYW1zLmhlaWdodCA9IGhlaWdodFxuICAgIHBhcmFtcy5mb3JtYXQgPSBmb3JtYXRcbiAgICBwYXJhbXMuaW50ZXJuYWxmb3JtYXQgPSBpbnRlcm5hbGZvcm1hdFxuICAgIHBhcmFtcy50eXBlID0gdHlwZVxuXG4gICAgdmFyIG1pcE1hc2sgPSBoYXNNaXAgPyAod2lkdGggPDwgMSkgLSAxIDogMVxuICAgIGlmIChwYXJhbXMudGFyZ2V0ID09PSBHTF9URVhUVVJFXzJEKSB7XG4gICAgICBcbiAgICAgIFxuICAgIH0gZWxzZSB7XG4gICAgICBcbiAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIG1pcEZpbHRlciA9IChNSVBNQVBfRklMVEVSUy5pbmRleE9mKHBhcmFtcy5taW5GaWx0ZXIpID49IDApXG4gICAgcGFyYW1zLmdlbk1pcG1hcHMgPSAhaGFzTWlwICYmIChwYXJhbXMuZ2VuTWlwbWFwcyB8fCBtaXBGaWx0ZXIpXG4gICAgdmFyIHVzZU1pcG1hcHMgPSBoYXNNaXAgfHwgcGFyYW1zLmdlbk1pcG1hcHNcblxuICAgIGlmICghcGFyYW1zLm1pbkZpbHRlcikge1xuICAgICAgcGFyYW1zLm1pbkZpbHRlciA9IHVzZU1pcG1hcHNcbiAgICAgICAgPyBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUlxuICAgICAgICA6IEdMX05FQVJFU1RcbiAgICB9IGVsc2Uge1xuICAgICAgXG4gICAgfVxuXG4gICAgaWYgKHVzZU1pcG1hcHMpIHtcbiAgICAgIFxuICAgIH1cblxuICAgIGlmIChwYXJhbXMuZ2VuTWlwbWFwcykge1xuICAgICAgXG4gICAgfVxuXG4gICAgcGFyYW1zLndyYXBTID0gcGFyYW1zLndyYXBTIHx8IEdMX0NMQU1QX1RPX0VER0VcbiAgICBwYXJhbXMud3JhcFQgPSBwYXJhbXMud3JhcFQgfHwgR0xfQ0xBTVBfVE9fRURHRVxuICAgIGlmIChwYXJhbXMud3JhcFMgIT09IEdMX0NMQU1QX1RPX0VER0UgfHxcbiAgICAgICAgcGFyYW1zLndyYXBUICE9PSBHTF9DTEFNUF9UT19FREdFKSB7XG4gICAgICBcbiAgICB9XG5cbiAgICBpZiAoKHR5cGUgPT09IEdMX0ZMT0FUICYmICFleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0X2xpbmVhcikgfHxcbiAgICAgICAgKHR5cGUgPT09IEdMX0hBTEZfRkxPQVRfT0VTICYmXG4gICAgICAgICAgIWV4dGVuc2lvbnMub2VzX3RleHR1cmVfaGFsZl9mbG9hdF9saW5lYXIpKSB7XG4gICAgICBcbiAgICB9XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgcGl4ZWxzLmxlbmd0aDsgKytpKSB7XG4gICAgICBwaXhtYXAgPSBwaXhlbHNbaV1cbiAgICAgIHZhciBsZXZlbCA9IHBpeG1hcC5taXBsZXZlbFxuICAgICAgaWYgKHBpeG1hcC53aWR0aCkge1xuICAgICAgICBcbiAgICAgIH1cbiAgICAgIGlmIChwaXhtYXAuaGVpZ2h0KSB7XG4gICAgICAgIFxuICAgICAgfVxuICAgICAgaWYgKHBpeG1hcC5jaGFubmVscykge1xuICAgICAgICBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBpeG1hcC5jaGFubmVscyA9IGNoYW5uZWxzXG4gICAgICB9XG4gICAgICBpZiAocGl4bWFwLmZvcm1hdCkge1xuICAgICAgICBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBpeG1hcC5mb3JtYXQgPSBmb3JtYXRcbiAgICAgIH1cbiAgICAgIGlmIChwaXhtYXAuaW50ZXJuYWxmb3JtYXQpIHtcbiAgICAgICAgXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwaXhtYXAuaW50ZXJuYWxmb3JtYXQgPSBpbnRlcm5hbGZvcm1hdFxuICAgICAgfVxuICAgICAgaWYgKHBpeG1hcC50eXBlKSB7XG4gICAgICAgIFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGl4bWFwLnR5cGUgPSB0eXBlXG4gICAgICB9XG4gICAgICBpZiAocGl4bWFwLmNvcHkpIHtcbiAgICAgICAgXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgdmFyIGFjdGl2ZVRleHR1cmUgPSAwXG4gIHZhciB0ZXh0dXJlQ291bnQgPSAwXG4gIHZhciB0ZXh0dXJlU2V0ID0ge31cbiAgdmFyIHBvbGxTZXQgPSBbXVxuICB2YXIgbnVtVGV4VW5pdHMgPSBsaW1pdHMubWF4VGV4dHVyZVVuaXRzXG4gIHZhciB0ZXh0dXJlVW5pdHMgPSBBcnJheShudW1UZXhVbml0cykubWFwKGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9KVxuXG4gIGZ1bmN0aW9uIFJFR0xUZXh0dXJlICh0YXJnZXQpIHtcbiAgICB0aGlzLmlkID0gdGV4dHVyZUNvdW50KytcbiAgICB0aGlzLnJlZkNvdW50ID0gMVxuXG4gICAgdGhpcy50YXJnZXQgPSB0YXJnZXRcbiAgICB0aGlzLnRleHR1cmUgPSBudWxsXG5cbiAgICB0aGlzLnBvbGxJZCA9IC0xXG5cbiAgICB0aGlzLnVuaXQgPSAtMVxuICAgIHRoaXMuYmluZENvdW50ID0gMFxuXG4gICAgLy8gY2FuY2VscyBhbGwgcGVuZGluZyBjYWxsYmFja3NcbiAgICB0aGlzLmNhbmNlbFBlbmRpbmcgPSBudWxsXG5cbiAgICAvLyBwYXJzZWQgdXNlciBpbnB1dHNcbiAgICB0aGlzLnBhcmFtcyA9IG5ldyBUZXhQYXJhbXModGFyZ2V0KVxuICAgIHRoaXMucGl4ZWxzID0gW11cbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZSAodGV4dHVyZSwgb3B0aW9ucykge1xuICAgIHZhciBpXG4gICAgY2xlYXJMaXN0ZW5lcnModGV4dHVyZSlcblxuICAgIC8vIENsZWFyIHBhcmFtZXRlcnMgYW5kIHBpeGVsIGRhdGFcbiAgICB2YXIgcGFyYW1zID0gdGV4dHVyZS5wYXJhbXNcbiAgICBUZXhQYXJhbXMuY2FsbChwYXJhbXMsIHRleHR1cmUudGFyZ2V0KVxuICAgIHZhciBwaXhlbHMgPSB0ZXh0dXJlLnBpeGVsc1xuICAgIHBpeGVscy5sZW5ndGggPSAwXG5cbiAgICAvLyBwYXJzZSBwYXJhbWV0ZXJzXG4gICAgcGFyYW1zLnBhcnNlKG9wdGlvbnMpXG5cbiAgICAvLyBwYXJzZSBwaXhlbCBkYXRhXG4gICAgZnVuY3Rpb24gcGFyc2VNaXAgKHRhcmdldCwgZGF0YSkge1xuICAgICAgdmFyIG1pcG1hcCA9IGRhdGEubWlwbWFwXG4gICAgICB2YXIgcGl4bWFwXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShtaXBtYXApKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWlwbWFwLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgcGl4bWFwID0gbmV3IFBpeGVsSW5mbyh0YXJnZXQpXG4gICAgICAgICAgcGl4bWFwLnBhcnNlRmxhZ3Mob3B0aW9ucylcbiAgICAgICAgICBwaXhtYXAucGFyc2VGbGFncyhkYXRhKVxuICAgICAgICAgIHBpeG1hcC5wYXJzZShtaXBtYXBbaV0sIGkpXG4gICAgICAgICAgcGl4ZWxzLnB1c2gocGl4bWFwKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwaXhtYXAgPSBuZXcgUGl4ZWxJbmZvKHRhcmdldClcbiAgICAgICAgcGl4bWFwLnBhcnNlRmxhZ3Mob3B0aW9ucylcbiAgICAgICAgcGl4bWFwLnBhcnNlKGRhdGEsIDApXG4gICAgICAgIHBpeGVscy5wdXNoKHBpeG1hcClcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHRleHR1cmUudGFyZ2V0ID09PSBHTF9URVhUVVJFXzJEKSB7XG4gICAgICBwYXJzZU1pcChHTF9URVhUVVJFXzJELCBvcHRpb25zKVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgZmFjZXMgPSBvcHRpb25zLmZhY2VzIHx8IG9wdGlvbnNcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGZhY2VzKSkge1xuICAgICAgICBcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICAgIHBhcnNlTWlwKEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIGksIGZhY2VzW2ldKVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmYWNlcyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgLy8gVE9ETyBSZWFkIGRkc1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gSW5pdGlhbGl6ZSB0byBhbGwgZW1wdHkgdGV4dHVyZXNcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICAgIHBhcnNlTWlwKEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIGksIHt9KVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gZG8gYSBzZWNvbmQgcGFzcyB0byByZWNvbmNpbGUgZGVmYXVsdHNcbiAgICBjaGVja1RleHR1cmVDb21wbGV0ZShwYXJhbXMsIHBpeGVscylcblxuICAgIGlmIChwYXJhbXMubmVlZHNMaXN0ZW5lcnMpIHtcbiAgICAgIGhvb2tMaXN0ZW5lcnModGV4dHVyZSlcbiAgICB9XG5cbiAgICBpZiAocGFyYW1zLm5lZWRzUG9sbCkge1xuICAgICAgdGV4dHVyZS5wb2xsSWQgPSBwb2xsU2V0Lmxlbmd0aFxuICAgICAgcG9sbFNldC5wdXNoKHRleHR1cmUpXG4gICAgfVxuXG4gICAgcmVmcmVzaCh0ZXh0dXJlKVxuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaCAodGV4dHVyZSkge1xuICAgIGlmICghZ2wuaXNUZXh0dXJlKHRleHR1cmUudGV4dHVyZSkpIHtcbiAgICAgIHRleHR1cmUudGV4dHVyZSA9IGdsLmNyZWF0ZVRleHR1cmUoKVxuICAgIH1cblxuICAgIC8vIExhenkgYmluZFxuICAgIHZhciB0YXJnZXQgPSB0ZXh0dXJlLnRhcmdldFxuICAgIHZhciB1bml0ID0gdGV4dHVyZS51bml0XG4gICAgaWYgKHVuaXQgPj0gMCkge1xuICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIHVuaXQpXG4gICAgICBhY3RpdmVUZXh0dXJlID0gdW5pdFxuICAgIH0gZWxzZSB7XG4gICAgICBnbC5iaW5kVGV4dHVyZSh0YXJnZXQsIHRleHR1cmUudGV4dHVyZSlcbiAgICB9XG5cbiAgICAvLyBVcGxvYWRcbiAgICB2YXIgcGl4ZWxzID0gdGV4dHVyZS5waXhlbHNcbiAgICB2YXIgcGFyYW1zID0gdGV4dHVyZS5wYXJhbXNcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHBpeGVscy5sZW5ndGg7ICsraSkge1xuICAgICAgcGl4ZWxzW2ldLnVwbG9hZChwYXJhbXMpXG4gICAgfVxuICAgIHBhcmFtcy51cGxvYWQoKVxuXG4gICAgLy8gTGF6eSB1bmJpbmRcbiAgICBpZiAodW5pdCA8IDApIHtcbiAgICAgIHZhciBhY3RpdmUgPSB0ZXh0dXJlVW5pdHNbYWN0aXZlVGV4dHVyZV1cbiAgICAgIGlmIChhY3RpdmUpIHtcbiAgICAgICAgLy8gcmVzdG9yZSBiaW5kaW5nIHN0YXRlXG4gICAgICAgIGdsLmJpbmRUZXh0dXJlKGFjdGl2ZS50YXJnZXQsIGFjdGl2ZS50ZXh0dXJlKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gb3RoZXJ3aXNlIGJlY29tZSBuZXcgYWN0aXZlXG4gICAgICAgIHRleHR1cmUudW5pdCA9IGFjdGl2ZVRleHR1cmVcbiAgICAgICAgdGV4dHVyZVVuaXRzW2FjdGl2ZVRleHR1cmVdID0gdGV4dHVyZVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGhvb2tMaXN0ZW5lcnMgKHRleHR1cmUpIHtcbiAgICB2YXIgcGFyYW1zID0gdGV4dHVyZS5wYXJhbXNcbiAgICB2YXIgcGl4ZWxzID0gdGV4dHVyZS5waXhlbHNcblxuICAgIC8vIEFwcGVuZHMgYWxsIHRoZSB0ZXh0dXJlIGRhdGEgZnJvbSB0aGUgYnVmZmVyIHRvIHRoZSBjdXJyZW50XG4gICAgZnVuY3Rpb24gYXBwZW5kRERTICh0YXJnZXQsIG1pcGxldmVsLCBidWZmZXIpIHtcbiAgICAgIHZhciBkZHMgPSBwYXJzZUREUyhidWZmZXIpXG5cbiAgICAgIFxuXG4gICAgICBpZiAoZGRzLmN1YmUpIHtcbiAgICAgICAgXG5cbiAgICAgICAgLy8gVE9ETyBoYW5kbGUgY3ViZSBtYXAgRERTXG4gICAgICAgIFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIGlmIChtaXBsZXZlbCkge1xuICAgICAgICBcbiAgICAgIH1cblxuICAgICAgZGRzLnBpeGVscy5mb3JFYWNoKGZ1bmN0aW9uIChwaXhtYXApIHtcbiAgICAgICAgdmFyIGluZm8gPSBuZXcgUGl4ZWxJbmZvKGRkcy5jdWJlID8gcGl4bWFwLnRhcmdldCA6IHRhcmdldClcblxuICAgICAgICBpbmZvLmNoYW5uZWxzID0gZGRzLmNoYW5uZWxzXG4gICAgICAgIGluZm8uY29tcHJlc3NlZCA9IGRkcy5jb21wcmVzc2VkXG4gICAgICAgIGluZm8udHlwZSA9IGRkcy50eXBlXG4gICAgICAgIGluZm8uaW50ZXJuYWxmb3JtYXQgPSBkZHMuZm9ybWF0XG4gICAgICAgIGluZm8uZm9ybWF0ID0gY29sb3JGb3JtYXRzW2Rkcy5mb3JtYXRdXG5cbiAgICAgICAgaW5mby53aWR0aCA9IHBpeG1hcC53aWR0aFxuICAgICAgICBpbmZvLmhlaWdodCA9IHBpeG1hcC5oZWlnaHRcbiAgICAgICAgaW5mby5taXBsZXZlbCA9IHBpeG1hcC5taXBsZXZlbCB8fCBtaXBsZXZlbFxuICAgICAgICBpbmZvLmRhdGEgPSBwaXhtYXAuZGF0YVxuXG4gICAgICAgIHBpeGVscy5wdXNoKGluZm8pXG4gICAgICB9KVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uRGF0YSAoKSB7XG4gICAgICAvLyBVcGRhdGUgc2l6ZSBvZiBhbnkgbmV3bHkgbG9hZGVkIHBpeGVsc1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwaXhlbHMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgdmFyIHBpeGVsRGF0YSA9IHBpeGVsc1tpXVxuICAgICAgICB2YXIgaW1hZ2UgPSBwaXhlbERhdGEuaW1hZ2VcbiAgICAgICAgdmFyIHZpZGVvID0gcGl4ZWxEYXRhLnZpZGVvXG4gICAgICAgIHZhciB4aHIgPSBwaXhlbERhdGEueGhyXG4gICAgICAgIGlmIChpbWFnZSAmJiBpbWFnZS5jb21wbGV0ZSkge1xuICAgICAgICAgIHBpeGVsRGF0YS53aWR0aCA9IGltYWdlLm5hdHVyYWxXaWR0aFxuICAgICAgICAgIHBpeGVsRGF0YS5oZWlnaHQgPSBpbWFnZS5uYXR1cmFsSGVpZ2h0XG4gICAgICAgIH0gZWxzZSBpZiAodmlkZW8gJiYgdmlkZW8ucmVhZHlTdGF0ZSA+IDIpIHtcbiAgICAgICAgICBwaXhlbERhdGEud2lkdGggPSB2aWRlby53aWR0aFxuICAgICAgICAgIHBpeGVsRGF0YS5oZWlnaHQgPSB2aWRlby5oZWlnaHRcbiAgICAgICAgfSBlbHNlIGlmICh4aHIgJiYgeGhyLnJlYWR5U3RhdGUgPT09IDQpIHtcbiAgICAgICAgICBwaXhlbHNbaV0gPSBwaXhlbHNbcGl4ZWxzLmxlbmd0aCAtIDFdXG4gICAgICAgICAgcGl4ZWxzLnBvcCgpXG4gICAgICAgICAgeGhyLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3JlYWR5c3RhdGVjaGFuZ2UnLCByZWZyZXNoKVxuICAgICAgICAgIGFwcGVuZEREUyhwaXhlbERhdGEudGFyZ2V0LCBwaXhlbERhdGEubWlwbGV2ZWwsIHhoci5yZXNwb25zZSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY2hlY2tUZXh0dXJlQ29tcGxldGUocGFyYW1zLCBwaXhlbHMpXG4gICAgICByZWZyZXNoKHRleHR1cmUpXG4gICAgfVxuXG4gICAgcGl4ZWxzLmZvckVhY2goZnVuY3Rpb24gKHBpeGVsRGF0YSkge1xuICAgICAgaWYgKHBpeGVsRGF0YS5pbWFnZSAmJiAhcGl4ZWxEYXRhLmltYWdlLmNvbXBsZXRlKSB7XG4gICAgICAgIHBpeGVsRGF0YS5pbWFnZS5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgb25EYXRhKVxuICAgICAgfSBlbHNlIGlmIChwaXhlbERhdGEudmlkZW8gJiYgcGl4ZWxEYXRhLnJlYWR5U3RhdGUgPCAxKSB7XG4gICAgICAgIHBpeGVsRGF0YS52aWRlby5hZGRFdmVudExpc3RlbmVyKCdwcm9ncmVzcycsIG9uRGF0YSlcbiAgICAgIH0gZWxzZSBpZiAocGl4ZWxEYXRhLnhocikge1xuICAgICAgICBwaXhlbERhdGEueGhyLmFkZEV2ZW50TGlzdGVuZXIoJ3JlYWR5c3RhdGVjaGFuZ2UnLCBvbkRhdGEpXG4gICAgICB9XG4gICAgfSlcblxuICAgIHRleHR1cmUuY2FuY2VsUGVuZGluZyA9IGZ1bmN0aW9uIGRldGFjaExpc3RlbmVycyAoKSB7XG4gICAgICBwaXhlbHMuZm9yRWFjaChmdW5jdGlvbiAocGl4ZWxEYXRhKSB7XG4gICAgICAgIGlmIChwaXhlbERhdGEuaW1hZ2UpIHtcbiAgICAgICAgICBwaXhlbERhdGEuaW1hZ2UucmVtb3ZlRXZlbnRMaXN0ZW5lcignbG9hZCcsIG9uRGF0YSlcbiAgICAgICAgfSBlbHNlIGlmIChwaXhlbERhdGEudmlkZW8pIHtcbiAgICAgICAgICBwaXhlbERhdGEudmlkZW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcigncHJvZ3Jlc3MnLCBvbkRhdGEpXG4gICAgICAgIH0gZWxzZSBpZiAocGl4ZWxEYXRhLnhocikge1xuICAgICAgICAgIHBpeGVsRGF0YS54aHIucmVtb3ZlRXZlbnRMaXN0ZW5lcigncmVhZHlzdGF0ZWNoYW5nZScsIG9uRGF0YSlcbiAgICAgICAgICBwaXhlbERhdGEueGhyLmFib3J0KClcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjbGVhckxpc3RlbmVycyAodGV4dHVyZSkge1xuICAgIHZhciBjYW5jZWxQZW5kaW5nID0gdGV4dHVyZS5jYW5jZWxQZW5kaW5nXG4gICAgaWYgKGNhbmNlbFBlbmRpbmcpIHtcbiAgICAgIGNhbmNlbFBlbmRpbmcoKVxuICAgICAgdGV4dHVyZS5jYW5jZWxQZW5kaW5nID0gbnVsbFxuICAgIH1cbiAgICB2YXIgaWQgPSB0ZXh0dXJlLnBvbGxJZFxuICAgIGlmIChpZCA+PSAwKSB7XG4gICAgICB2YXIgb3RoZXIgPSBwb2xsU2V0W2lkXSA9IHBvbGxTZXRbcG9sbFNldC5sZW5ndGggLSAxXVxuICAgICAgb3RoZXIuaWQgPSBpZFxuICAgICAgcG9sbFNldC5wb3AoKVxuICAgICAgdGV4dHVyZS5wb2xsSWQgPSAtMVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKHRleHR1cmUpIHtcbiAgICB2YXIgaGFuZGxlID0gdGV4dHVyZS50ZXh0dXJlXG4gICAgXG4gICAgdmFyIHVuaXQgPSB0ZXh0dXJlLnVuaXRcbiAgICB2YXIgdGFyZ2V0ID0gdGV4dHVyZS50YXJnZXRcbiAgICBpZiAodW5pdCA+PSAwKSB7XG4gICAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwICsgdW5pdClcbiAgICAgIGFjdGl2ZVRleHR1cmUgPSB1bml0XG4gICAgICBnbC5iaW5kVGV4dHVyZSh0YXJnZXQsIG51bGwpXG4gICAgICB0ZXh0dXJlVW5pdHNbdW5pdF0gPSBudWxsXG4gICAgfVxuICAgIGNsZWFyTGlzdGVuZXJzKHRleHR1cmUpXG4gICAgaWYgKGdsLmlzVGV4dHVyZShoYW5kbGUpKSB7XG4gICAgICBnbC5kZWxldGVUZXh0dXJlKGhhbmRsZSlcbiAgICB9XG4gICAgdGV4dHVyZS50ZXh0dXJlID0gbnVsbFxuICAgIHRleHR1cmUucGFyYW1zID0gbnVsbFxuICAgIHRleHR1cmUucGl4ZWxzID0gbnVsbFxuICAgIHRleHR1cmUucmVmQ291bnQgPSAwXG4gICAgZGVsZXRlIHRleHR1cmVTZXRbdGV4dHVyZS5pZF1cbiAgfVxuXG4gIGV4dGVuZChSRUdMVGV4dHVyZS5wcm90b3R5cGUsIHtcbiAgICBiaW5kOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgdGV4dHVyZSA9IHRoaXNcbiAgICAgIHRleHR1cmUuYmluZENvdW50ICs9IDFcbiAgICAgIHZhciB1bml0ID0gdGV4dHVyZS51bml0XG4gICAgICBpZiAodW5pdCA8IDApIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1UZXhVbml0czsgKytpKSB7XG4gICAgICAgICAgdmFyIG90aGVyID0gdGV4dHVyZVVuaXRzW2ldXG4gICAgICAgICAgaWYgKG90aGVyKSB7XG4gICAgICAgICAgICBpZiAob3RoZXIuYmluZENvdW50ID4gMCkge1xuICAgICAgICAgICAgICBjb250aW51ZVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgb3RoZXIudW5pdCA9IC0xXG4gICAgICAgICAgfVxuICAgICAgICAgIHRleHR1cmVVbml0c1tpXSA9IHRleHR1cmVcbiAgICAgICAgICB1bml0ID0gaVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIH1cbiAgICAgICAgaWYgKHVuaXQgPj0gbnVtVGV4VW5pdHMpIHtcbiAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgICB0ZXh0dXJlLnVuaXQgPSB1bml0XG4gICAgICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTAgKyB1bml0KVxuICAgICAgICBnbC5iaW5kVGV4dHVyZSh0ZXh0dXJlLnRhcmdldCwgdGV4dHVyZS50ZXh0dXJlKVxuICAgICAgICBhY3RpdmVUZXh0dXJlID0gdW5pdFxuICAgICAgfVxuICAgICAgcmV0dXJuIHVuaXRcbiAgICB9LFxuXG4gICAgdW5iaW5kOiBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLmJpbmRDb3VudCAtPSAxXG4gICAgfSxcblxuICAgIGRlY1JlZjogZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKC0tdGhpcy5yZWZDb3VudCA9PT0gMCkge1xuICAgICAgICBkZXN0cm95KHRoaXMpXG4gICAgICB9XG4gICAgfVxuICB9KVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZVRleHR1cmUgKG9wdGlvbnMsIHRhcmdldCkge1xuICAgIHZhciB0ZXh0dXJlID0gbmV3IFJFR0xUZXh0dXJlKHRhcmdldClcbiAgICB0ZXh0dXJlU2V0W3RleHR1cmUuaWRdID0gdGV4dHVyZVxuXG4gICAgZnVuY3Rpb24gcmVnbFRleHR1cmUgKGEwLCBhMSwgYTIsIGEzLCBhNCwgYTUpIHtcbiAgICAgIHZhciBvcHRpb25zID0gYTAgfHwge31cbiAgICAgIGlmICh0YXJnZXQgPT09IEdMX1RFWFRVUkVfQ1VCRV9NQVAgJiYgYXJndW1lbnRzLmxlbmd0aCA9PT0gNikge1xuICAgICAgICBvcHRpb25zID0gW2EwLCBhMSwgYTIsIGEzLCBhNCwgYTVdXG4gICAgICB9XG4gICAgICB1cGRhdGUodGV4dHVyZSwgb3B0aW9ucylcbiAgICAgIHJlZ2xUZXh0dXJlLndpZHRoID0gdGV4dHVyZS5wYXJhbXMud2lkdGhcbiAgICAgIHJlZ2xUZXh0dXJlLmhlaWdodCA9IHRleHR1cmUucGFyYW1zLmhlaWdodFxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlXG4gICAgfVxuXG4gICAgcmVnbFRleHR1cmUob3B0aW9ucylcblxuICAgIHJlZ2xUZXh0dXJlLl9yZWdsVHlwZSA9ICd0ZXh0dXJlJ1xuICAgIHJlZ2xUZXh0dXJlLl90ZXh0dXJlID0gdGV4dHVyZVxuICAgIHJlZ2xUZXh0dXJlLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB0ZXh0dXJlLmRlY1JlZigpXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlZ2xUZXh0dXJlXG4gIH1cblxuICAvLyBDYWxsZWQgYWZ0ZXIgY29udGV4dCByZXN0b3JlXG4gIGZ1bmN0aW9uIHJlZnJlc2hUZXh0dXJlcyAoKSB7XG4gICAgdmFsdWVzKHRleHR1cmVTZXQpLmZvckVhY2gocmVmcmVzaClcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bVRleFVuaXRzOyArK2kpIHtcbiAgICAgIHRleHR1cmVVbml0c1tpXSA9IG51bGxcbiAgICB9XG4gICAgYWN0aXZlVGV4dHVyZSA9IDBcbiAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwKVxuICB9XG5cbiAgLy8gQ2FsbGVkIHdoZW4gcmVnbCBpcyBkZXN0cm95ZWRcbiAgZnVuY3Rpb24gZGVzdHJveVRleHR1cmVzICgpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bVRleFVuaXRzOyArK2kpIHtcbiAgICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTAgKyBpKVxuICAgICAgZ2wuYmluZFRleHR1cmUoR0xfVEVYVFVSRV8yRCwgbnVsbClcbiAgICAgIHRleHR1cmVVbml0c1tpXSA9IG51bGxcbiAgICB9XG4gICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMClcbiAgICBhY3RpdmVUZXh0dXJlID0gMFxuICAgIHZhbHVlcyh0ZXh0dXJlU2V0KS5mb3JFYWNoKGRlc3Ryb3kpXG4gIH1cblxuICAvLyBDYWxsZWQgb25jZSBwZXIgcmFmLCB1cGRhdGVzIHZpZGVvIHRleHR1cmVzXG4gIGZ1bmN0aW9uIHBvbGxUZXh0dXJlcyAoKSB7XG4gICAgcG9sbFNldC5mb3JFYWNoKHJlZnJlc2gpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNyZWF0ZTogY3JlYXRlVGV4dHVyZSxcbiAgICByZWZyZXNoOiByZWZyZXNoVGV4dHVyZXMsXG4gICAgY2xlYXI6IGRlc3Ryb3lUZXh0dXJlcyxcbiAgICBwb2xsOiBwb2xsVGV4dHVyZXMsXG4gICAgZ2V0VGV4dHVyZTogZnVuY3Rpb24gKHdyYXBwZXIpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG59XG4iLCIvKiBnbG9iYWxzIHBlcmZvcm1hbmNlICovXG5tb2R1bGUuZXhwb3J0cyA9XG4gICh0eXBlb2YgcGVyZm9ybWFuY2UgIT09ICd1bmRlZmluZWQnICYmIHBlcmZvcm1hbmNlLm5vdylcbiAgPyBmdW5jdGlvbiAoKSB7IHJldHVybiBwZXJmb3JtYW5jZS5ub3coKSB9XG4gIDogZnVuY3Rpb24gKCkgeyByZXR1cm4gKyhuZXcgRGF0ZSgpKSB9XG4iLCJ2YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi9leHRlbmQnKVxuXG5mdW5jdGlvbiBzbGljZSAoeCkge1xuICByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoeClcbn1cblxuZnVuY3Rpb24gam9pbiAoeCkge1xuICByZXR1cm4gc2xpY2UoeCkuam9pbignJylcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVFbnZpcm9ubWVudCAoKSB7XG4gIC8vIFVuaXF1ZSB2YXJpYWJsZSBpZCBjb3VudGVyXG4gIHZhciB2YXJDb3VudGVyID0gMFxuXG4gIC8vIExpbmtlZCB2YWx1ZXMgYXJlIHBhc3NlZCBmcm9tIHRoaXMgc2NvcGUgaW50byB0aGUgZ2VuZXJhdGVkIGNvZGUgYmxvY2tcbiAgLy8gQ2FsbGluZyBsaW5rKCkgcGFzc2VzIGEgdmFsdWUgaW50byB0aGUgZ2VuZXJhdGVkIHNjb3BlIGFuZCByZXR1cm5zXG4gIC8vIHRoZSB2YXJpYWJsZSBuYW1lIHdoaWNoIGl0IGlzIGJvdW5kIHRvXG4gIHZhciBsaW5rZWROYW1lcyA9IFtdXG4gIHZhciBsaW5rZWRWYWx1ZXMgPSBbXVxuICBmdW5jdGlvbiBsaW5rICh2YWx1ZSkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGlua2VkVmFsdWVzLmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAobGlua2VkVmFsdWVzW2ldID09PSB2YWx1ZSkge1xuICAgICAgICByZXR1cm4gbGlua2VkTmFtZXNbaV1cbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgbmFtZSA9ICdnJyArICh2YXJDb3VudGVyKyspXG4gICAgbGlua2VkTmFtZXMucHVzaChuYW1lKVxuICAgIGxpbmtlZFZhbHVlcy5wdXNoKHZhbHVlKVxuICAgIHJldHVybiBuYW1lXG4gIH1cblxuICAvLyBjcmVhdGUgYSBjb2RlIGJsb2NrXG4gIGZ1bmN0aW9uIGJsb2NrICgpIHtcbiAgICB2YXIgY29kZSA9IFtdXG4gICAgZnVuY3Rpb24gcHVzaCAoKSB7XG4gICAgICBjb2RlLnB1c2guYXBwbHkoY29kZSwgc2xpY2UoYXJndW1lbnRzKSlcbiAgICB9XG5cbiAgICB2YXIgdmFycyA9IFtdXG4gICAgZnVuY3Rpb24gZGVmICgpIHtcbiAgICAgIHZhciBuYW1lID0gJ3YnICsgKHZhckNvdW50ZXIrKylcbiAgICAgIHZhcnMucHVzaChuYW1lKVxuXG4gICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29kZS5wdXNoKG5hbWUsICc9JylcbiAgICAgICAgY29kZS5wdXNoLmFwcGx5KGNvZGUsIHNsaWNlKGFyZ3VtZW50cykpXG4gICAgICAgIGNvZGUucHVzaCgnOycpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiBuYW1lXG4gICAgfVxuXG4gICAgcmV0dXJuIGV4dGVuZChwdXNoLCB7XG4gICAgICBkZWY6IGRlZixcbiAgICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBqb2luKFtcbiAgICAgICAgICAodmFycy5sZW5ndGggPiAwID8gJ3ZhciAnICsgdmFycyArICc7JyA6ICcnKSxcbiAgICAgICAgICBqb2luKGNvZGUpXG4gICAgICAgIF0pXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIHNjb3BlICgpIHtcbiAgICB2YXIgZW50cnkgPSBibG9jaygpXG4gICAgdmFyIGV4aXQgPSBibG9jaygpXG5cbiAgICB2YXIgZW50cnlUb1N0cmluZyA9IGVudHJ5LnRvU3RyaW5nXG4gICAgdmFyIGV4aXRUb1N0cmluZyA9IGV4aXQudG9TdHJpbmdcblxuICAgIGZ1bmN0aW9uIHNhdmUgKG9iamVjdCwgcHJvcCkge1xuICAgICAgZXhpdChvYmplY3QsIHByb3AsICc9JywgZW50cnkuZGVmKG9iamVjdCwgcHJvcCksICc7JylcbiAgICB9XG5cbiAgICByZXR1cm4gZXh0ZW5kKGVudHJ5LCB7XG4gICAgICBlbnRyeTogZW50cnksXG4gICAgICBleGl0OiBleGl0LFxuICAgICAgc2F2ZTogc2F2ZSxcbiAgICAgIHNldDogZnVuY3Rpb24gKG9iamVjdCwgcHJvcCwgdmFsdWUpIHtcbiAgICAgICAgc2F2ZShvYmplY3QsIHByb3ApXG4gICAgICAgIGVudHJ5KG9iamVjdCwgcHJvcCwgJz0nLCB2YWx1ZSwgJzsnKVxuICAgICAgfSxcbiAgICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBlbnRyeVRvU3RyaW5nKCkgKyBleGl0VG9TdHJpbmcoKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBjb25kaXRpb25hbCAoKSB7XG4gICAgdmFyIHByZWQgPSBqb2luKGFyZ3VtZW50cylcbiAgICB2YXIgdGhlbkJsb2NrID0gc2NvcGUoKVxuICAgIHZhciBlbHNlQmxvY2sgPSBzY29wZSgpXG5cbiAgICB2YXIgdGhlblRvU3RyaW5nID0gdGhlbkJsb2NrLnRvU3RyaW5nXG4gICAgdmFyIGVsc2VUb1N0cmluZyA9IGVsc2VCbG9jay50b1N0cmluZ1xuXG4gICAgcmV0dXJuIGV4dGVuZCh0aGVuQmxvY2ssIHtcbiAgICAgIHRoZW46IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhlbkJsb2NrLmFwcGx5KHRoZW5CbG9jaywgc2xpY2UoYXJndW1lbnRzKSlcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICAgIH0sXG4gICAgICBlbHNlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGVsc2VCbG9jay5hcHBseShlbHNlQmxvY2ssIHNsaWNlKGFyZ3VtZW50cykpXG4gICAgICAgIHJldHVybiB0aGlzXG4gICAgICB9LFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGVsc2VDbGF1c2UgPSBlbHNlVG9TdHJpbmcoKVxuICAgICAgICBpZiAoZWxzZUNsYXVzZSkge1xuICAgICAgICAgIGVsc2VDbGF1c2UgPSAnZWxzZXsnICsgZWxzZUNsYXVzZSArICd9J1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBqb2luKFtcbiAgICAgICAgICAnaWYoJywgcHJlZCwgJyl7JyxcbiAgICAgICAgICB0aGVuVG9TdHJpbmcoKSxcbiAgICAgICAgICAnfScsIGVsc2VDbGF1c2VcbiAgICAgICAgXSlcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgLy8gcHJvY2VkdXJlIGxpc3RcbiAgdmFyIGdsb2JhbEJsb2NrID0gYmxvY2soKVxuICB2YXIgcHJvY2VkdXJlcyA9IHt9XG4gIGZ1bmN0aW9uIHByb2MgKG5hbWUsIGNvdW50KSB7XG4gICAgdmFyIGFyZ3MgPSBbXVxuICAgIGZ1bmN0aW9uIGFyZyAoKSB7XG4gICAgICB2YXIgbmFtZSA9ICdhJyArIGFyZ3MubGVuZ3RoXG4gICAgICBhcmdzLnB1c2gobmFtZSlcbiAgICAgIHJldHVybiBuYW1lXG4gICAgfVxuXG4gICAgY291bnQgPSBjb3VudCB8fCAwXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb3VudDsgKytpKSB7XG4gICAgICBhcmcoKVxuICAgIH1cblxuICAgIHZhciBib2R5ID0gc2NvcGUoKVxuICAgIHZhciBib2R5VG9TdHJpbmcgPSBib2R5LnRvU3RyaW5nXG5cbiAgICB2YXIgcmVzdWx0ID0gcHJvY2VkdXJlc1tuYW1lXSA9IGV4dGVuZChib2R5LCB7XG4gICAgICBhcmc6IGFyZyxcbiAgICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBqb2luKFtcbiAgICAgICAgICAnZnVuY3Rpb24oJywgYXJncy5qb2luKCksICcpeycsXG4gICAgICAgICAgYm9keVRvU3RyaW5nKCksXG4gICAgICAgICAgJ30nXG4gICAgICAgIF0pXG4gICAgICB9XG4gICAgfSlcblxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXBpbGUgKCkge1xuICAgIHZhciBjb2RlID0gWydcInVzZSBzdHJpY3RcIjsnLFxuICAgICAgZ2xvYmFsQmxvY2ssXG4gICAgICAncmV0dXJuIHsnXVxuICAgIE9iamVjdC5rZXlzKHByb2NlZHVyZXMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIGNvZGUucHVzaCgnXCInLCBuYW1lLCAnXCI6JywgcHJvY2VkdXJlc1tuYW1lXS50b1N0cmluZygpLCAnLCcpXG4gICAgfSlcbiAgICBjb2RlLnB1c2goJ30nKVxuICAgIHZhciBzcmMgPSBqb2luKGNvZGUpXG4gICAgICAucmVwbGFjZSgvOy9nLCAnO1xcbicpXG4gICAgICAucmVwbGFjZSgvfS9nLCAnfVxcbicpXG4gICAgICAucmVwbGFjZSgvey9nLCAne1xcbicpXG4gICAgdmFyIHByb2MgPSBGdW5jdGlvbi5hcHBseShudWxsLCBsaW5rZWROYW1lcy5jb25jYXQoc3JjKSlcbiAgICByZXR1cm4gcHJvYy5hcHBseShudWxsLCBsaW5rZWRWYWx1ZXMpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGdsb2JhbDogZ2xvYmFsQmxvY2ssXG4gICAgbGluazogbGluayxcbiAgICBibG9jazogYmxvY2ssXG4gICAgcHJvYzogcHJvYyxcbiAgICBzY29wZTogc2NvcGUsXG4gICAgY29uZDogY29uZGl0aW9uYWwsXG4gICAgY29tcGlsZTogY29tcGlsZVxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChiYXNlLCBvcHRzKSB7XG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMob3B0cylcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgKytpKSB7XG4gICAgYmFzZVtrZXlzW2ldXSA9IG9wdHNba2V5c1tpXV1cbiAgfVxuICByZXR1cm4gYmFzZVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmbGF0dGVuIChyZXN1bHQsIGRhdGEsIGRpbWVuc2lvbikge1xuICB2YXIgcHRyID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IGRhdGEubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgdiA9IGRhdGFbaV1cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IGRpbWVuc2lvbjsgKytqKSB7XG4gICAgICByZXN1bHRbcHRyKytdID0gdltqXVxuICAgIH1cbiAgfVxufVxuIiwidmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vaXMtdHlwZWQtYXJyYXknKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzTkRBcnJheUxpa2UgKG9iaikge1xuICByZXR1cm4gKFxuICAgICEhb2JqICYmXG4gICAgdHlwZW9mIG9iaiA9PT0gJ29iamVjdCcgJiZcbiAgICBBcnJheS5pc0FycmF5KG9iai5zaGFwZSkgJiZcbiAgICBBcnJheS5pc0FycmF5KG9iai5zdHJpZGUpICYmXG4gICAgdHlwZW9mIG9iai5vZmZzZXQgPT09ICdudW1iZXInICYmXG4gICAgb2JqLnNoYXBlLmxlbmd0aCA9PT0gb2JqLnN0cmlkZS5sZW5ndGggJiZcbiAgICAoQXJyYXkuaXNBcnJheShvYmouZGF0YSkgfHxcbiAgICAgIGlzVHlwZWRBcnJheShvYmouZGF0YSkpKVxufVxuIiwidmFyIGR0eXBlcyA9IHJlcXVpcmUoJy4uL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24nKVxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoeCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHgpIGluIGR0eXBlc1xufVxuIiwiLyogZ2xvYmFscyBkb2N1bWVudCwgSW1hZ2UsIFhNTEh0dHBSZXF1ZXN0ICovXG5cbm1vZHVsZS5leHBvcnRzID0gbG9hZFRleHR1cmVcblxuZnVuY3Rpb24gZ2V0RXh0ZW5zaW9uICh1cmwpIHtcbiAgdmFyIHBhcnRzID0gL1xcLihcXHcrKShcXD8uKik/JC8uZXhlYyh1cmwpXG4gIGlmIChwYXJ0cyAmJiBwYXJ0c1sxXSkge1xuICAgIHJldHVybiBwYXJ0c1sxXS50b0xvd2VyQ2FzZSgpXG4gIH1cbn1cblxuZnVuY3Rpb24gaXNWaWRlb0V4dGVuc2lvbiAodXJsKSB7XG4gIHJldHVybiBbXG4gICAgJ2F2aScsXG4gICAgJ2FzZicsXG4gICAgJ2dpZnYnLFxuICAgICdtb3YnLFxuICAgICdxdCcsXG4gICAgJ3l1dicsXG4gICAgJ21wZycsXG4gICAgJ21wZWcnLFxuICAgICdtMnYnLFxuICAgICdtcDQnLFxuICAgICdtNHAnLFxuICAgICdtNHYnLFxuICAgICdvZ2cnLFxuICAgICdvZ3YnLFxuICAgICd2b2InLFxuICAgICd3ZWJtJyxcbiAgICAnd212J1xuICBdLmluZGV4T2YodXJsKSA+PSAwXG59XG5cbmZ1bmN0aW9uIGlzQ29tcHJlc3NlZEV4dGVuc2lvbiAodXJsKSB7XG4gIHJldHVybiBbXG4gICAgJ2RkcydcbiAgXS5pbmRleE9mKHVybCkgPj0gMFxufVxuXG5mdW5jdGlvbiBsb2FkVmlkZW8gKHVybCwgY3Jvc3NPcmlnaW4pIHtcbiAgdmFyIHZpZGVvID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndmlkZW8nKVxuICB2aWRlby5hdXRvcGxheSA9IHRydWVcbiAgdmlkZW8ubG9vcCA9IHRydWVcbiAgaWYgKGNyb3NzT3JpZ2luKSB7XG4gICAgdmlkZW8uY3Jvc3NPcmlnaW4gPSBjcm9zc09yaWdpblxuICB9XG4gIHZpZGVvLnNyYyA9IHVybFxuICByZXR1cm4gdmlkZW9cbn1cblxuZnVuY3Rpb24gbG9hZENvbXByZXNzZWRUZXh0dXJlICh1cmwsIGV4dCwgY3Jvc3NPcmlnaW4pIHtcbiAgdmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpXG4gIHhoci5yZXNwb25zZVR5cGUgPSAnYXJyYXlidWZmZXInXG4gIHhoci5vcGVuKCdHRVQnLCB1cmwsIHRydWUpXG4gIHhoci5zZW5kKClcbiAgcmV0dXJuIHhoclxufVxuXG5mdW5jdGlvbiBsb2FkSW1hZ2UgKHVybCwgY3Jvc3NPcmlnaW4pIHtcbiAgdmFyIGltYWdlID0gbmV3IEltYWdlKClcbiAgaWYgKGNyb3NzT3JpZ2luKSB7XG4gICAgaW1hZ2UuY3Jvc3NPcmlnaW4gPSBjcm9zc09yaWdpblxuICB9XG4gIGltYWdlLnNyYyA9IHVybFxuICByZXR1cm4gaW1hZ2Vcbn1cblxuLy8gQ3VycmVudGx5IHRoaXMgc3R1ZmYgb25seSB3b3JrcyBpbiBhIERPTSBlbnZpcm9ubWVudFxuZnVuY3Rpb24gbG9hZFRleHR1cmUgKHVybCwgY3Jvc3NPcmlnaW4pIHtcbiAgaWYgKHR5cGVvZiBkb2N1bWVudCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICB2YXIgZXh0ID0gZ2V0RXh0ZW5zaW9uKHVybClcbiAgICBpZiAoaXNWaWRlb0V4dGVuc2lvbihleHQpKSB7XG4gICAgICByZXR1cm4gbG9hZFZpZGVvKHVybCwgY3Jvc3NPcmlnaW4pXG4gICAgfVxuICAgIGlmIChpc0NvbXByZXNzZWRFeHRlbnNpb24oZXh0KSkge1xuICAgICAgcmV0dXJuIGxvYWRDb21wcmVzc2VkVGV4dHVyZSh1cmwsIGV4dCwgY3Jvc3NPcmlnaW4pXG4gICAgfVxuICAgIHJldHVybiBsb2FkSW1hZ2UodXJsLCBjcm9zc09yaWdpbilcbiAgfVxuICByZXR1cm4gbnVsbFxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBsb29wIChuLCBmKSB7XG4gIHZhciByZXN1bHQgPSBBcnJheShuKVxuICBmb3IgKHZhciBpID0gMDsgaSA8IG47ICsraSkge1xuICAgIHJlc3VsdFtpXSA9IGYoaSlcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG4iLCIvLyBSZWZlcmVuY2VzOlxuLy9cbi8vIGh0dHA6Ly9tc2RuLm1pY3Jvc29mdC5jb20vZW4tdXMvbGlicmFyeS9iYjk0Mzk5MS5hc3B4L1xuLy8gaHR0cDovL2Jsb2cudG9qaWNvZGUuY29tLzIwMTEvMTIvY29tcHJlc3NlZC10ZXh0dXJlcy1pbi13ZWJnbC5odG1sXG4vL1xuXG5cbm1vZHVsZS5leHBvcnRzID0gcGFyc2VERFNcblxudmFyIEREU19NQUdJQyA9IDB4MjA1MzQ0NDRcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggPSAweDg1MTVcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFQgPSAweDgzRjBcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVCA9IDB4ODNGMVxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhUID0gMHg4M0YyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUNV9FWFQgPSAweDgzRjNcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0wgPSAweDhENjRcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSAweDE0MDFcbi8vIHZhciBHTF9IQUxGX0ZMT0FUX09FUyA9IDB4OEQ2MVxuLy8gdmFyIEdMX0ZMT0FUID0gMHgxNDA2XG5cbnZhciBERFNEX01JUE1BUENPVU5UID0gMHgyMDAwMFxuXG52YXIgRERTQ0FQUzJfQ1VCRU1BUCA9IDB4MjAwXG52YXIgRERTQ0FQUzJfQ1VCRU1BUF9QT1NJVElWRVggPSAweDQwMFxudmFyIEREU0NBUFMyX0NVQkVNQVBfTkVHQVRJVkVYID0gMHg4MDBcbnZhciBERFNDQVBTMl9DVUJFTUFQX1BPU0lUSVZFWSA9IDB4MTAwMFxudmFyIEREU0NBUFMyX0NVQkVNQVBfTkVHQVRJVkVZID0gMHgyMDAwXG52YXIgRERTQ0FQUzJfQ1VCRU1BUF9QT1NJVElWRVogPSAweDQwMDBcbnZhciBERFNDQVBTMl9DVUJFTUFQX05FR0FUSVZFWiA9IDB4ODAwMFxuXG52YXIgQ1VCRU1BUF9DT01QTEVURV9GQUNFUyA9IChcbiAgRERTQ0FQUzJfQ1VCRU1BUF9QT1NJVElWRVggfFxuICBERFNDQVBTMl9DVUJFTUFQX05FR0FUSVZFWCB8XG4gIEREU0NBUFMyX0NVQkVNQVBfUE9TSVRJVkVZIHxcbiAgRERTQ0FQUzJfQ1VCRU1BUF9ORUdBVElWRVkgfFxuICBERFNDQVBTMl9DVUJFTUFQX1BPU0lUSVZFWiB8XG4gIEREU0NBUFMyX0NVQkVNQVBfTkVHQVRJVkVaKVxuXG52YXIgRERQRl9GT1VSQ0MgPSAweDRcbnZhciBERFBGX1JHQiA9IDB4NDBcblxudmFyIEZPVVJDQ19EWFQxID0gMHgzMTU0NTg0NFxudmFyIEZPVVJDQ19EWFQzID0gMHgzMzU0NTg0NFxudmFyIEZPVVJDQ19EWFQ1ID0gMHgzNTU0NTg0NFxudmFyIEZPVVJDQ19FVEMxID0gMHgzMTQzNTQ0NVxuXG4vLyBERFNfSEVBREVSIHtcbnZhciBPRkZfU0laRSA9IDEgICAgICAgIC8vIGludDMyIGR3U2l6ZVxudmFyIE9GRl9GTEFHUyA9IDIgICAgICAgLy8gaW50MzIgZHdGbGFnc1xudmFyIE9GRl9IRUlHSFQgPSAzICAgICAgLy8gaW50MzIgZHdIZWlnaHRcbnZhciBPRkZfV0lEVEggPSA0ICAgICAgIC8vIGludDMyIGR3V2lkdGhcbi8vIHZhciBPRkZfUElUQ0ggPSA1ICAgICAgIC8vIGludDMyIGR3UGl0Y2hPckxpbmVhclNpemVcbi8vIHZhciBPRkZfREVQVEggPSA2ICAgICAgIC8vIGludDMyIGR3RGVwdGhcbnZhciBPRkZfTUlQTUFQID0gNyAgICAgIC8vIGludDMyIGR3TWlwTWFwQ291bnQ7IC8vIG9mZnNldDogN1xuLy8gaW50MzJbMTFdIGR3UmVzZXJ2ZWQxXG4vLyBERFNfUElYRUxGT1JNQVQge1xuLy8gdmFyIE9GRl9QRl9TSVpFID0gMTkgICAgLy8gaW50MzIgZHdTaXplOyAvLyBvZmZzZXQ6IDE5XG52YXIgT0ZGX1BGX0ZMQUdTID0gMjAgICAvLyBpbnQzMiBkd0ZsYWdzXG52YXIgT0ZGX0ZPVVJDQyA9IDIxICAgICAvLyBjaGFyWzRdIGR3Rm91ckNDXG4vLyB2YXIgT0ZGX1JHQkFfQklUUyA9IDIyICAvLyBpbnQzMiBkd1JHQkJpdENvdW50XG4vLyB2YXIgT0ZGX1JFRF9NQVNLID0gMjMgICAvLyBpbnQzMiBkd1JCaXRNYXNrXG4vLyB2YXIgT0ZGX0dSRUVOX01BU0sgPSAyNCAvLyBpbnQzMiBkd0dCaXRNYXNrXG4vLyB2YXIgT0ZGX0JMVUVfTUFTSyA9IDI1ICAvLyBpbnQzMiBkd0JCaXRNYXNrXG4vLyB2YXIgT0ZGX0FMUEhBX01BU0sgPSAyNiAvLyBpbnQzMiBkd0FCaXRNYXNrOyAvLyBvZmZzZXQ6IDI2XG4vLyB9XG4vLyB2YXIgT0ZGX0NBUFMgPSAyNyAgICAgICAvLyBpbnQzMiBkd0NhcHM7IC8vIG9mZnNldDogMjdcbnZhciBPRkZfQ0FQUzIgPSAyOCAgICAgIC8vIGludDMyIGR3Q2FwczJcbi8vIHZhciBPRkZfQ0FQUzMgPSAyOSAgICAgIC8vIGludDMyIGR3Q2FwczNcbi8vIHZhciBPRkZfQ0FQUzQgPSAzMCAgICAgIC8vIGludDMyIGR3Q2FwczRcbi8vIGludDMyIGR3UmVzZXJ2ZWQyIC8vIG9mZnNldCAzMVxuXG5mdW5jdGlvbiBwYXJzZUREUyAoYXJyYXlCdWZmZXIpIHtcbiAgdmFyIGhlYWRlciA9IG5ldyBJbnQzMkFycmF5KGFycmF5QnVmZmVyKVxuICBcblxuICB2YXIgZmxhZ3MgPSBoZWFkZXJbT0ZGX0ZMQUdTXVxuICBcblxuICB2YXIgd2lkdGggPSBoZWFkZXJbT0ZGX1dJRFRIXVxuICB2YXIgaGVpZ2h0ID0gaGVhZGVyW09GRl9IRUlHSFRdXG5cbiAgdmFyIHR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gIHZhciBmb3JtYXQgPSAwXG4gIHZhciBibG9ja0J5dGVzID0gMFxuICB2YXIgY2hhbm5lbHMgPSA0XG4gIHN3aXRjaCAoaGVhZGVyW09GRl9GT1VSQ0NdKSB7XG4gICAgY2FzZSBGT1VSQ0NfRFhUMTpcbiAgICAgIGJsb2NrQnl0ZXMgPSA4XG4gICAgICBpZiAoZmxhZ3MgJiBERFBGX1JHQikge1xuICAgICAgICBjaGFubmVscyA9IDNcbiAgICAgICAgZm9ybWF0ID0gR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZm9ybWF0ID0gR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFRcbiAgICAgIH1cbiAgICAgIGJyZWFrXG5cbiAgICBjYXNlIEZPVVJDQ19EWFQzOlxuICAgICAgYmxvY2tCeXRlcyA9IDE2XG4gICAgICBmb3JtYXQgPSBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVFxuICAgICAgYnJlYWtcblxuICAgIGNhc2UgRk9VUkNDX0RYVDU6XG4gICAgICBibG9ja0J5dGVzID0gMTZcbiAgICAgIGZvcm1hdCA9IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUXG4gICAgICBicmVha1xuXG4gICAgY2FzZSBGT1VSQ0NfRVRDMTpcbiAgICAgIGJsb2NrQnl0ZXMgPSA4XG4gICAgICBmb3JtYXQgPSBHTF9DT01QUkVTU0VEX1JHQl9FVEMxX1dFQkdMXG4gICAgICBicmVha1xuXG4gICAgLy8gVE9ETzogSW1wbGVtZW50IGhkciBhbmQgdW5jb21wcmVzc2VkIHRleHR1cmVzXG5cbiAgICBkZWZhdWx0OlxuICAgICAgLy8gSGFuZGxlIHVuY29tcHJlc3NlZCBkYXRhIGhlcmVcbiAgICAgIFxuICB9XG5cbiAgdmFyIHBpeGVsRmxhZ3MgPSBoZWFkZXJbT0ZGX1BGX0ZMQUdTXVxuXG4gIHZhciBtaXBtYXBDb3VudCA9IDFcbiAgaWYgKHBpeGVsRmxhZ3MgJiBERFNEX01JUE1BUENPVU5UKSB7XG4gICAgbWlwbWFwQ291bnQgPSBNYXRoLm1heCgxLCBoZWFkZXJbT0ZGX01JUE1BUF0pXG4gIH1cblxuICB2YXIgcHRyID0gaGVhZGVyW09GRl9TSVpFXSArIDRcblxuICB2YXIgcmVzdWx0ID0ge1xuICAgIHdpZHRoOiB3aWR0aCxcbiAgICBoZWlnaHQ6IGhlaWdodCxcbiAgICBjaGFubmVsczogY2hhbm5lbHMsXG4gICAgZm9ybWF0OiBmb3JtYXQsXG4gICAgdHlwZTogdHlwZSxcbiAgICBjb21wcmVzc2VkOiB0cnVlLFxuICAgIGN1YmU6IGZhbHNlLFxuICAgIHBpeGVsczogW11cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlTWlwcyAodGFyZ2V0KSB7XG4gICAgdmFyIG1pcFdpZHRoID0gd2lkdGhcbiAgICB2YXIgbWlwSGVpZ2h0ID0gaGVpZ2h0XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1pcG1hcENvdW50OyArK2kpIHtcbiAgICAgIHZhciBzaXplID1cbiAgICAgICAgTWF0aC5tYXgoMSwgKG1pcFdpZHRoICsgMykgPj4gMikgKlxuICAgICAgICBNYXRoLm1heCgxLCAobWlwSGVpZ2h0ICsgMykgPj4gMikgKlxuICAgICAgICBibG9ja0J5dGVzXG4gICAgICByZXN1bHQucGl4ZWxzLnB1c2goe1xuICAgICAgICB0YXJnZXQ6IHRhcmdldCxcbiAgICAgICAgbWlwbGV2ZWw6IGksXG4gICAgICAgIHdpZHRoOiBtaXBXaWR0aCxcbiAgICAgICAgaGVpZ2h0OiBtaXBIZWlnaHQsXG4gICAgICAgIGRhdGE6IG5ldyBVaW50OEFycmF5KGFycmF5QnVmZmVyLCBwdHIsIHNpemUpXG4gICAgICB9KVxuICAgICAgcHRyICs9IHNpemVcbiAgICAgIG1pcFdpZHRoID4+PSAxXG4gICAgICBtaXBIZWlnaHQgPj49IDFcbiAgICB9XG4gIH1cblxuICB2YXIgY2FwczIgPSBoZWFkZXJbT0ZGX0NBUFMyXVxuICB2YXIgY3ViZW1hcCA9ICEhKGNhcHMyICYgRERTQ0FQUzJfQ1VCRU1BUClcbiAgaWYgKGN1YmVtYXApIHtcbiAgICBcbiAgICByZXN1bHQuY3ViZSA9IHRydWVcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgcGFyc2VNaXBzKEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIGkpXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHBhcnNlTWlwcyhHTF9URVhUVVJFXzJEKVxuICB9XG5cbiAgcmV0dXJuIHJlc3VsdFxufVxuIiwidmFyIGxvb3AgPSByZXF1aXJlKCcuL2xvb3AnKVxuXG52YXIgR0xfQllURSA9IDUxMjBcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX1NIT1JUID0gNTEyMlxudmFyIEdMX1VOU0lHTkVEX1NIT1JUID0gNTEyM1xudmFyIEdMX0lOVCA9IDUxMjRcbnZhciBHTF9VTlNJR05FRF9JTlQgPSA1MTI1XG52YXIgR0xfRkxPQVQgPSA1MTI2XG5cbnZhciBidWZmZXJQb29sID0gbG9vcCg4LCBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiBbXVxufSlcblxuZnVuY3Rpb24gbmV4dFBvdzE2ICh2KSB7XG4gIGZvciAodmFyIGkgPSAxNjsgaSA8PSAoMSA8PCAyOCk7IGkgKj0gMTYpIHtcbiAgICBpZiAodiA8PSBpKSB7XG4gICAgICByZXR1cm4gaVxuICAgIH1cbiAgfVxuICByZXR1cm4gMFxufVxuXG5mdW5jdGlvbiBsb2cyICh2KSB7XG4gIHZhciByLCBzaGlmdFxuICByID0gKHYgPiAweEZGRkYpIDw8IDRcbiAgdiA+Pj49IHJcbiAgc2hpZnQgPSAodiA+IDB4RkYpIDw8IDNcbiAgdiA+Pj49IHNoaWZ0OyByIHw9IHNoaWZ0XG4gIHNoaWZ0ID0gKHYgPiAweEYpIDw8IDJcbiAgdiA+Pj49IHNoaWZ0OyByIHw9IHNoaWZ0XG4gIHNoaWZ0ID0gKHYgPiAweDMpIDw8IDFcbiAgdiA+Pj49IHNoaWZ0OyByIHw9IHNoaWZ0XG4gIHJldHVybiByIHwgKHYgPj4gMSlcbn1cblxuZnVuY3Rpb24gYWxsb2MgKG4pIHtcbiAgdmFyIHN6ID0gbmV4dFBvdzE2KG4pXG4gIHZhciBiaW4gPSBidWZmZXJQb29sW2xvZzIoc3opID4+IDJdXG4gIGlmIChiaW4ubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBiaW4ucG9wKClcbiAgfVxuICByZXR1cm4gbmV3IEFycmF5QnVmZmVyKHN6KVxufVxuXG5mdW5jdGlvbiBmcmVlIChidWYpIHtcbiAgYnVmZmVyUG9vbFtsb2cyKGJ1Zi5ieXRlTGVuZ3RoKSA+PiAyXS5wdXNoKGJ1Zilcbn1cblxuZnVuY3Rpb24gYWxsb2NUeXBlICh0eXBlLCBuKSB7XG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgR0xfQllURTpcbiAgICAgIHJldHVybiBuZXcgSW50OEFycmF5KGFsbG9jKG4pLCAwLCBuKVxuICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICAgIHJldHVybiBuZXcgVWludDhBcnJheShhbGxvYyhuKSwgMCwgbilcbiAgICBjYXNlIEdMX1NIT1JUOlxuICAgICAgcmV0dXJuIG5ldyBJbnQxNkFycmF5KGFsbG9jKDIgKiBuKSwgMCwgbilcbiAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUOlxuICAgICAgcmV0dXJuIG5ldyBVaW50MTZBcnJheShhbGxvYygyICogbiksIDAsIG4pXG4gICAgY2FzZSBHTF9JTlQ6XG4gICAgICByZXR1cm4gbmV3IEludDMyQXJyYXkoYWxsb2MoNCAqIG4pLCAwLCBuKVxuICAgIGNhc2UgR0xfVU5TSUdORURfSU5UOlxuICAgICAgcmV0dXJuIG5ldyBVaW50MzJBcnJheShhbGxvYyg0ICogbiksIDAsIG4pXG4gICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgIHJldHVybiBuZXcgRmxvYXQzMkFycmF5KGFsbG9jKDQgKiBuKSwgMCwgbilcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIG51bGxcbiAgfVxufVxuXG5mdW5jdGlvbiBmcmVlVHlwZSAoYXJyYXkpIHtcbiAgZnJlZShhcnJheS5idWZmZXIpXG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhbGxvYzogYWxsb2MsXG4gIGZyZWU6IGZyZWUsXG4gIGFsbG9jVHlwZTogYWxsb2NUeXBlLFxuICBmcmVlVHlwZTogZnJlZVR5cGVcbn1cbiIsIi8qIGdsb2JhbHMgcmVxdWVzdEFuaW1hdGlvbkZyYW1lLCBjYW5jZWxBbmltYXRpb25GcmFtZSAqL1xuaWYgKHR5cGVvZiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgPT09ICdmdW5jdGlvbicgJiZcbiAgICB0eXBlb2YgY2FuY2VsQW5pbWF0aW9uRnJhbWUgPT09ICdmdW5jdGlvbicpIHtcbiAgbW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgbmV4dDogZnVuY3Rpb24gKHgpIHsgcmV0dXJuIHJlcXVlc3RBbmltYXRpb25GcmFtZSh4KSB9LFxuICAgIGNhbmNlbDogZnVuY3Rpb24gKHgpIHsgcmV0dXJuIGNhbmNlbEFuaW1hdGlvbkZyYW1lKHgpIH1cbiAgfVxufSBlbHNlIHtcbiAgbW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgbmV4dDogZnVuY3Rpb24gKGNiKSB7XG4gICAgICBzZXRUaW1lb3V0KGNiLCAzMClcbiAgICB9LFxuICAgIGNhbmNlbDogY2xlYXJUaW1lb3V0XG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY29udmVydFRvSGFsZkZsb2F0IChhcnJheSkge1xuICB2YXIgZmxvYXRzID0gbmV3IEZsb2F0MzJBcnJheShhcnJheSlcbiAgdmFyIHVpbnRzID0gbmV3IFVpbnQzMkFycmF5KGZsb2F0cy5idWZmZXIpXG4gIHZhciB1c2hvcnRzID0gbmV3IFVpbnQxNkFycmF5KGFycmF5Lmxlbmd0aClcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgKytpKSB7XG4gICAgaWYgKGlzTmFOKGFycmF5W2ldKSkge1xuICAgICAgdXNob3J0c1tpXSA9IDB4ZmZmZlxuICAgIH0gZWxzZSBpZiAoYXJyYXlbaV0gPT09IEluZmluaXR5KSB7XG4gICAgICB1c2hvcnRzW2ldID0gMHg3YzAwXG4gICAgfSBlbHNlIGlmIChhcnJheVtpXSA9PT0gLUluZmluaXR5KSB7XG4gICAgICB1c2hvcnRzW2ldID0gMHhmYzAwXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciB4ID0gdWludHNbaV1cblxuICAgICAgdmFyIHNnbiA9ICh4ID4+PiAzMSkgPDwgMTVcbiAgICAgIHZhciBleHAgPSAoKHggPDwgMSkgPj4+IDI0KSAtIDEyN1xuICAgICAgdmFyIGZyYWMgPSAoeCA+PiAxMykgJiAoKDEgPDwgMTApIC0gMSlcblxuICAgICAgaWYgKGV4cCA8IC0yNCkge1xuICAgICAgICAvLyByb3VuZCBub24tcmVwcmVzZW50YWJsZSBkZW5vcm1hbHMgdG8gMFxuICAgICAgICB1c2hvcnRzW2ldID0gc2duXG4gICAgICB9IGVsc2UgaWYgKGV4cCA8IC0xNCkge1xuICAgICAgICAvLyBoYW5kbGUgZGVub3JtYWxzXG4gICAgICAgIHZhciBzID0gLTE0IC0gZXhwXG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ24gKyAoKGZyYWMgKyAoMSA8PCAxMCkpID4+IHMpXG4gICAgICB9IGVsc2UgaWYgKGV4cCA+IDE1KSB7XG4gICAgICAgIC8vIHJvdW5kIG92ZXJmbG93IHRvICsvLSBJbmZpbml0eVxuICAgICAgICB1c2hvcnRzW2ldID0gc2duICsgMHg3YzAwXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBvdGhlcndpc2UgY29udmVydCBkaXJlY3RseVxuICAgICAgICB1c2hvcnRzW2ldID0gc2duICsgKChleHAgKyAxNSkgPDwgMTApICsgZnJhY1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB1c2hvcnRzXG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChcbiAgcmVzdWx0LCBkYXRhLCBzaGFwZVgsIHNoYXBlWSwgc3RyaWRlWCwgc3RyaWRlWSwgb2Zmc2V0KSB7XG4gIHZhciBwdHIgPSAwXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc2hhcGVYOyArK2kpIHtcbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IHNoYXBlWTsgKytqKSB7XG4gICAgICByZXN1bHRbcHRyKytdID0gZGF0YVtzdHJpZGVYICogaSArIHN0cmlkZVkgKiBqICsgb2Zmc2V0XVxuICAgIH1cbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAob2JqKSB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhvYmopLm1hcChmdW5jdGlvbiAoa2V5KSB7IHJldHVybiBvYmpba2V5XSB9KVxufVxuIiwiLy8gQ29udGV4dCBhbmQgY2FudmFzIGNyZWF0aW9uIGhlbHBlciBmdW5jdGlvbnNcbi8qZ2xvYmFscyBIVE1MRWxlbWVudCxXZWJHTFJlbmRlcmluZ0NvbnRleHQqL1xuXG5cbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL3V0aWwvZXh0ZW5kJylcblxuZnVuY3Rpb24gY3JlYXRlQ2FudmFzIChlbGVtZW50LCBvcHRpb25zKSB7XG4gIHZhciBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKVxuICB2YXIgYXJncyA9IGdldENvbnRleHQoY2FudmFzLCBvcHRpb25zKVxuXG4gIGV4dGVuZChjYW52YXMuc3R5bGUsIHtcbiAgICBib3JkZXI6IDAsXG4gICAgbWFyZ2luOiAwLFxuICAgIHBhZGRpbmc6IDAsXG4gICAgdG9wOiAwLFxuICAgIGxlZnQ6IDBcbiAgfSlcbiAgZWxlbWVudC5hcHBlbmRDaGlsZChjYW52YXMpXG5cbiAgaWYgKGVsZW1lbnQgPT09IGRvY3VtZW50LmJvZHkpIHtcbiAgICBjYW52YXMuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnXG4gICAgZXh0ZW5kKGVsZW1lbnQuc3R5bGUsIHtcbiAgICAgIG1hcmdpbjogMCxcbiAgICAgIHBhZGRpbmc6IDBcbiAgICB9KVxuICB9XG5cbiAgdmFyIHNjYWxlID0gK2FyZ3Mub3B0aW9ucy5waXhlbFJhdGlvXG4gIGZ1bmN0aW9uIHJlc2l6ZSAoKSB7XG4gICAgdmFyIHcgPSB3aW5kb3cuaW5uZXJXaWR0aFxuICAgIHZhciBoID0gd2luZG93LmlubmVySGVpZ2h0XG4gICAgaWYgKGVsZW1lbnQgIT09IGRvY3VtZW50LmJvZHkpIHtcbiAgICAgIHZhciBib3VuZHMgPSBlbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpXG4gICAgICB3ID0gYm91bmRzLnJpZ2h0IC0gYm91bmRzLmxlZnRcbiAgICAgIGggPSBib3VuZHMudG9wIC0gYm91bmRzLmJvdHRvbVxuICAgIH1cbiAgICBjYW52YXMud2lkdGggPSBzY2FsZSAqIHdcbiAgICBjYW52YXMuaGVpZ2h0ID0gc2NhbGUgKiBoXG4gICAgZXh0ZW5kKGNhbnZhcy5zdHlsZSwge1xuICAgICAgd2lkdGg6IHcgKyAncHgnLFxuICAgICAgaGVpZ2h0OiBoICsgJ3B4J1xuICAgIH0pXG4gIH1cblxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgcmVzaXplLCBmYWxzZSlcblxuICB2YXIgcHJldkRlc3Ryb3kgPSBhcmdzLm9wdGlvbnMub25EZXN0cm95XG4gIGFyZ3Mub3B0aW9ucyA9IGV4dGVuZChleHRlbmQoe30sIGFyZ3Mub3B0aW9ucyksIHtcbiAgICBvbkRlc3Ryb3k6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdyZXNpemUnLCByZXNpemUpXG4gICAgICBlbGVtZW50LnJlbW92ZUNoaWxkKGNhbnZhcylcbiAgICAgIHByZXZEZXN0cm95ICYmIHByZXZEZXN0cm95KClcbiAgICB9XG4gIH0pXG5cbiAgcmVzaXplKClcblxuICByZXR1cm4gYXJnc1xufVxuXG5mdW5jdGlvbiBnZXRDb250ZXh0IChjYW52YXMsIG9wdGlvbnMpIHtcbiAgdmFyIGdsT3B0aW9ucyA9IG9wdGlvbnMuZ2xPcHRpb25zIHx8IHt9XG5cbiAgZnVuY3Rpb24gZ2V0IChuYW1lKSB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBjYW52YXMuZ2V0Q29udGV4dChuYW1lLCBnbE9wdGlvbnMpXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cblxuICB2YXIgZ2wgPSBnZXQoJ3dlYmdsJykgfHxcbiAgICAgICAgICAgZ2V0KCdleHBlcmltZW50YWwtd2ViZ2wnKSB8fFxuICAgICAgICAgICBnZXQoJ3dlYmdsLWV4cGVyaW1lbnRhbCcpXG5cbiAgXG5cbiAgcmV0dXJuIHtcbiAgICBnbDogZ2wsXG4gICAgb3B0aW9uczogZXh0ZW5kKHtcbiAgICAgIHBpeGVsUmF0aW86IHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvXG4gICAgfSwgb3B0aW9ucylcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHBhcnNlQXJncyAoYXJncykge1xuICBpZiAodHlwZW9mIGRvY3VtZW50ID09PSAndW5kZWZpbmVkJyB8fFxuICAgICAgdHlwZW9mIEhUTUxFbGVtZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgIHJldHVybiB7XG4gICAgICBnbDogYXJnc1swXSxcbiAgICAgIG9wdGlvbnM6IGFyZ3NbMV0gfHwge31cbiAgICB9XG4gIH1cblxuICB2YXIgZWxlbWVudCA9IGRvY3VtZW50LmJvZHlcbiAgdmFyIG9wdGlvbnMgPSBhcmdzWzFdIHx8IHt9XG5cbiAgaWYgKHR5cGVvZiBhcmdzWzBdID09PSAnc3RyaW5nJykge1xuICAgIGVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGFyZ3NbMF0pIHx8IGRvY3VtZW50LmJvZHlcbiAgfSBlbHNlIGlmICh0eXBlb2YgYXJnc1swXSA9PT0gJ29iamVjdCcpIHtcbiAgICBpZiAoYXJnc1swXSBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSB7XG4gICAgICBlbGVtZW50ID0gYXJnc1swXVxuICAgIH0gZWxzZSBpZiAoYXJnc1swXSBpbnN0YW5jZW9mIFdlYkdMUmVuZGVyaW5nQ29udGV4dCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZ2w6IGFyZ3NbMF0sXG4gICAgICAgIG9wdGlvbnM6IGV4dGVuZCh7XG4gICAgICAgICAgcGl4ZWxSYXRpbzogMVxuICAgICAgICB9LCBvcHRpb25zKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBvcHRpb25zID0gYXJnc1swXVxuICAgIH1cbiAgfVxuXG4gIGlmIChlbGVtZW50Lm5vZGVOYW1lICYmIGVsZW1lbnQubm9kZU5hbWUudG9VcHBlckNhc2UoKSA9PT0gJ0NBTlZBUycpIHtcbiAgICByZXR1cm4gZ2V0Q29udGV4dChlbGVtZW50LCBvcHRpb25zKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBjcmVhdGVDYW52YXMoZWxlbWVudCwgb3B0aW9ucylcbiAgfVxufVxuIiwiJ3VzZSBzdHJpY3QnXG5cbm1vZHVsZS5leHBvcnRzID0gYW5nbGVOb3JtYWxzXG5cbmZ1bmN0aW9uIGh5cG90KHgsIHksIHopIHtcbiAgcmV0dXJuIE1hdGguc3FydChNYXRoLnBvdyh4LDIpICsgTWF0aC5wb3coeSwyKSArIE1hdGgucG93KHosMikpXG59XG5cbmZ1bmN0aW9uIHdlaWdodChzLCByLCBhKSB7XG4gIHJldHVybiBNYXRoLmF0YW4yKHIsIChzIC0gYSkpXG59XG5cbmZ1bmN0aW9uIG11bEFkZChkZXN0LCBzLCB4LCB5LCB6KSB7XG4gIGRlc3RbMF0gKz0gcyAqIHhcbiAgZGVzdFsxXSArPSBzICogeVxuICBkZXN0WzJdICs9IHMgKiB6XG59XG5cbmZ1bmN0aW9uIGFuZ2xlTm9ybWFscyhjZWxscywgcG9zaXRpb25zKSB7XG4gIHZhciBudW1WZXJ0cyA9IHBvc2l0aW9ucy5sZW5ndGhcbiAgdmFyIG51bUNlbGxzID0gY2VsbHMubGVuZ3RoXG5cbiAgLy9BbGxvY2F0ZSBub3JtYWwgYXJyYXlcbiAgdmFyIG5vcm1hbHMgPSBuZXcgQXJyYXkobnVtVmVydHMpXG4gIGZvcih2YXIgaT0wOyBpPG51bVZlcnRzOyArK2kpIHtcbiAgICBub3JtYWxzW2ldID0gWzAsMCwwXVxuICB9XG5cbiAgLy9TY2FuIGNlbGxzLCBhbmRcbiAgZm9yKHZhciBpPTA7IGk8bnVtQ2VsbHM7ICsraSkge1xuICAgIHZhciBjZWxsID0gY2VsbHNbaV1cbiAgICB2YXIgYSA9IHBvc2l0aW9uc1tjZWxsWzBdXVxuICAgIHZhciBiID0gcG9zaXRpb25zW2NlbGxbMV1dXG4gICAgdmFyIGMgPSBwb3NpdGlvbnNbY2VsbFsyXV1cblxuICAgIHZhciBhYnggPSBhWzBdIC0gYlswXVxuICAgIHZhciBhYnkgPSBhWzFdIC0gYlsxXVxuICAgIHZhciBhYnogPSBhWzJdIC0gYlsyXVxuICAgIHZhciBhYiA9IGh5cG90KGFieCwgYWJ5LCBhYnopXG5cbiAgICB2YXIgYmN4ID0gYlswXSAtIGNbMF1cbiAgICB2YXIgYmN5ID0gYlsxXSAtIGNbMV1cbiAgICB2YXIgYmN6ID0gYlsyXSAtIGNbMl1cbiAgICB2YXIgYmMgPSBoeXBvdChiY3gsIGJjeSwgYmN6KVxuXG4gICAgdmFyIGNheCA9IGNbMF0gLSBhWzBdXG4gICAgdmFyIGNheSA9IGNbMV0gLSBhWzFdXG4gICAgdmFyIGNheiA9IGNbMl0gLSBhWzJdXG4gICAgdmFyIGNhID0gaHlwb3QoY2F4LCBjYXksIGNheilcblxuICAgIGlmKE1hdGgubWluKGFiLCBiYywgY2EpIDwgMWUtNikge1xuICAgICAgY29udGludWVcbiAgICB9XG5cbiAgICB2YXIgcyA9IDAuNSAqIChhYiArIGJjICsgY2EpXG4gICAgdmFyIHIgPSBNYXRoLnNxcnQoKHMgLSBhYikqKHMgLSBiYykqKHMgLSBjYSkvcylcblxuICAgIHZhciBueCA9IGFieSAqIGJjeiAtIGFieiAqIGJjeVxuICAgIHZhciBueSA9IGFieiAqIGJjeCAtIGFieCAqIGJjelxuICAgIHZhciBueiA9IGFieCAqIGJjeSAtIGFieSAqIGJjeFxuICAgIHZhciBubCA9IGh5cG90KG54LCBueSwgbnopXG4gICAgbnggLz0gbmxcbiAgICBueSAvPSBubFxuICAgIG56IC89IG5sXG5cbiAgICBtdWxBZGQobm9ybWFsc1tjZWxsWzBdXSwgd2VpZ2h0KHMsIHIsIGJjKSwgbngsIG55LCBueilcbiAgICBtdWxBZGQobm9ybWFsc1tjZWxsWzFdXSwgd2VpZ2h0KHMsIHIsIGNhKSwgbngsIG55LCBueilcbiAgICBtdWxBZGQobm9ybWFsc1tjZWxsWzJdXSwgd2VpZ2h0KHMsIHIsIGFiKSwgbngsIG55LCBueilcbiAgfVxuXG4gIC8vTm9ybWFsaXplIGFsbCB0aGUgbm9ybWFsc1xuICBmb3IodmFyIGk9MDsgaTxudW1WZXJ0czsgKytpKSB7XG4gICAgdmFyIG4gPSBub3JtYWxzW2ldXG4gICAgdmFyIGwgPSBNYXRoLnNxcnQoXG4gICAgICBNYXRoLnBvdyhuWzBdLCAyKSArXG4gICAgICBNYXRoLnBvdyhuWzFdLCAyKSArXG4gICAgICBNYXRoLnBvdyhuWzJdLCAyKSlcbiAgICBpZihsIDwgMWUtOCkge1xuICAgICAgblswXSA9IDFcbiAgICAgIG5bMV0gPSAwXG4gICAgICBuWzJdID0gMFxuICAgICAgY29udGludWVcbiAgICB9XG4gICAgblswXSAvPSBsXG4gICAgblsxXSAvPSBsXG4gICAgblsyXSAvPSBsXG4gIH1cblxuICByZXR1cm4gbm9ybWFsc1xufVxuIiwiZXhwb3J0cy5wb3NpdGlvbnM9W1sxLjMwMTg5NSwwLjEyMjYyMiwyLjU1MDA2MV0sWzEuMDQ1MzI2LDAuMTM5MDU4LDIuODM1MTU2XSxbMC41NjkyNTEsMC4xNTU5MjUsMi44MDUxMjVdLFswLjI1MTg4NiwwLjE0NDE0NSwyLjgyOTI4XSxbMC4wNjMwMzMsMC4xMzE3MjYsMy4wMTQwOF0sWy0wLjI3Nzc1MywwLjEzNTg5MiwzLjEwNzE2XSxbLTAuNDQxMDQ4LDAuMjc3MDY0LDIuNTk0MzMxXSxbLTEuMDEwOTU2LDAuMDk1Mjg1LDIuNjY4OTgzXSxbLTEuMzE3NjM5LDAuMDY5ODk3LDIuMzI1NDQ4XSxbLTAuNzUxNjkxLDAuMjY0NjgxLDIuMzgxNDk2XSxbMC42ODQxMzcsMC4zMTEzNCwyLjM2NDU3NF0sWzEuMzQ3OTMxLDAuMzAyODgyLDIuMjAxNDM0XSxbLTEuNzM2OTAzLDAuMDI5ODk0LDEuNzI0MTExXSxbLTEuMzE5OTg2LDAuMTE5OTgsMC45MTI5MjVdLFsxLjUzODA3NywwLjE1NzM3MiwwLjQ4MTcxMV0sWzEuOTUxOTc1LDAuMDgxNzQyLDEuMTY0MV0sWzEuODM0NzY4LDAuMDk1ODMyLDEuNjAyNjgyXSxbMi40NDYxMjIsMC4wOTE4MTcsMS4zNzU1OF0sWzIuNjE3NjE1LDAuMDc4NjQ0LDAuNzQyODAxXSxbLTEuNjA5NzQ4LDAuMDQ5NzMsLTAuMjM4NzIxXSxbLTEuMjgxOTczLDAuMjMwOTg0LC0wLjE4MDkxNl0sWy0xLjA3NDUwMSwwLjI0ODIwNCwwLjAzNDAwN10sWy0xLjIwMTczNCwwLjA1ODQ5OSwwLjQwMjIzNF0sWy0xLjQ0NDQ1NCwwLjA1NDc4MywwLjE0OTU3OV0sWy00LjY5NDYwNSw1LjA3NTg4MiwxLjA0MzQyN10sWy0zLjk1OTYzLDcuNzY3Mzk0LDAuNzU4NDQ3XSxbLTQuNzUzMzM5LDUuMzM5ODE3LDAuNjY1MDYxXSxbLTEuMTUwMzI1LDkuMTMzMzI3LC0wLjM2ODU1Ml0sWy00LjMxNjEwNywyLjg5MzYxMSwwLjQ0Mzk5XSxbLTAuODA5MjAyLDkuMzEyNTc1LC0wLjQ2NjA2MV0sWzAuMDg1NjI2LDUuOTYzNjkzLDEuNjg1NjY2XSxbLTEuMzE0ODUzLDkuMDAxNDIsLTAuMTMzOV0sWy00LjM2NDE4MiwzLjA3MjU1NiwxLjQzNjcxMl0sWy0yLjAyMjA3NCw3LjMyMzM5NiwwLjY3ODY1N10sWzEuOTkwODg3LDYuMTMwMjMsMC40Nzk2NDNdLFstMy4yOTU1MjUsNy44Nzg5MTcsMS40MDkzNTNdLFswLjU3MTMwOCw2LjE5NzU2OSwwLjY3MDY1N10sWzAuODk2NjEsNi4yMDAxOCwwLjMzNzA1Nl0sWzAuMzMxODUxLDYuMTYyMzcyLDEuMTg2MzcxXSxbLTQuODQwMDY2LDUuNTk5ODc0LDIuMjk2MDY5XSxbMi4xMzg5ODksNi4wMzEyOTEsMC4yMjgzMzVdLFswLjY3ODkyMyw2LjAyNjE3MywxLjg5NDA1Ml0sWy0wLjc4MTY4Miw1LjYwMTU3MywxLjgzNjczOF0sWzEuMTgxMzE1LDYuMjM5MDA3LDAuMzkzMjkzXSxbLTMuNjA2MzA4LDcuMzc2NDc2LDIuNjYxNDUyXSxbLTAuNTc5MDU5LDQuMDQyNTExLC0xLjU0MDg4M10sWy0zLjA2NDA2OSw4LjYzMDI1MywtMi41OTc1MzldLFstMi4xNTcyNzEsNi44MzcwMTIsMC4zMDAxOTFdLFstMi45NjYwMTMsNy44MjE1ODEsLTEuMTM2OTddLFstMi4zNDQyNiw4LjEyMjk2NSwwLjQwOTA0M10sWy0wLjk1MTY4NCw1Ljg3NDI1MSwxLjQxNTExOV0sWy0yLjgzNDg1Myw3Ljc0ODMxOSwwLjE4MjQwNl0sWy0zLjI0MjQ5Myw3LjgyMDA5NiwwLjM3MzY3NF0sWy0wLjIwODUzMiw1Ljk5Mjg0NiwxLjI1MjA4NF0sWy0zLjA0ODA4NSw4LjQzMTUyNywtMi4xMjk3OTVdLFsxLjQxMzI0NSw1LjgwNjMyNCwyLjI0MzkwNl0sWy0wLjA1MTIyMiw2LjA2NDkwMSwwLjY5NjA5M10sWy00LjIwNDMwNiwyLjcwMDA2MiwwLjcxMzg3NV0sWy00LjYxMDk5Nyw2LjM0MzQwNSwwLjM0NDI3Ml0sWy0zLjI5MTMzNiw5LjMwNTMxLC0zLjM0MDQ0NV0sWy0zLjI3MjExLDcuNTU5MjM5LC0yLjMyNDAxNl0sWy00LjIzODgyLDYuNDk4MzQ0LDMuMTg0NTJdLFstMy45NDUzMTcsNi4zNzc4MDQsMy4zODYyNV0sWy00LjkwNjM3OCw1LjQ3MjI2NSwxLjMxNTE5M10sWy0zLjU4MDEzMSw3Ljg0NjcxNywwLjcwOTY2Nl0sWy0xLjk5NTUwNCw2LjY0NTQ1OSwwLjY4ODQ4N10sWy0yLjU5NTY1MSw3Ljg2MDU0LDAuNzkzMzUxXSxbLTAuMDA4ODQ5LDAuMzA1ODcxLDAuMTg0NDg0XSxbLTAuMDI5MDExLDAuMzE0MTE2LC0wLjI1NzMxMl0sWy0yLjUyMjQyNCw3LjU2NTM5MiwxLjgwNDIxMl0sWy0xLjAyMjk5Myw4LjY1MDgyNiwtMC44NTU2MDldLFstMy44MzEyNjUsNi41OTU0MjYsMy4yNjY3ODNdLFstNC4wNDI1MjUsNi44NTU3MjQsMy4wNjA2NjNdLFstNC4xNzEyNiw3LjQwNDc0MiwyLjM5MTM4N10sWzMuOTA0NTI2LDMuNzY3NjkzLDAuMDkyMTc5XSxbMC4yNjgwNzYsNi4wODY4MDIsMS40NjkyMjNdLFstMy4zMjA0NTYsOC43NTMyMjIsLTIuMDg5NjldLFsxLjIwMzA0OCw2LjI2OTI1LDAuNjEyNDA3XSxbLTQuNDA2NDc5LDIuOTg1OTc0LDAuODUzNjkxXSxbLTMuMjI2ODg5LDYuNjE1MjE1LC0wLjQwNDI0M10sWzAuMzQ2MzI2LDEuNjAyMTEsMy41MDk4NThdLFstMy45NTU0NzYsNy4yNTMzMjMsMi43MjIzOTJdLFstMS4yMzIwNCwwLjA2ODkzNSwxLjY4Nzk0XSxbMC42MjU0MzYsNi4xOTY0NTUsMS4zMzMxNTZdLFs0LjQ2OTEzMiwyLjE2NTI5OCwxLjcwNTI1XSxbMC45NTAwNTMsNi4yNjI4OTksMC45MjI0NDFdLFstMi45ODA0MDQsNS4yNTQ3NCwtMC42NjMxNTVdLFstNC44NTkwNDMsNi4yODc0MSwxLjUzNzA4MV0sWy0zLjA3NzQ1Myw0LjY0MTQ3NSwtMC44OTIxNjddLFstMC40NDAwMiw4LjIyMjUwMywtMC43NzE0NTRdLFstNC4wMzQxMTIsNy42Mzk3ODYsMC4zODk5MzVdLFstMy42OTYwNDUsNi4yNDIwNDIsMy4zOTQ2NzldLFstMS4yMjE4MDYsNy43ODM2MTcsMC4xOTY0NTFdLFswLjcxNDYxLDYuMTQ5ODk1LDEuNjU2NjM2XSxbLTQuNzEzNTM5LDYuMTYzMTU0LDAuNDk1MzY5XSxbLTEuNTA5ODY5LDAuOTEzMDQ0LC0wLjgzMjQxM10sWy0xLjU0NzI0OSwyLjA2Njc1MywtMC44NTI2NjldLFstMy43NTc3MzQsNS43OTM3NDIsMy40NTU3OTRdLFstMC44MzE5MTEsMC4xOTkyOTYsMS43MTg1MzZdLFstMy4wNjI3NjMsNy41MjcxOCwtMS41NTA1NTldLFswLjkzODY4OCw2LjEwMzM1NCwxLjgyMDk1OF0sWy00LjAzNzAzMywyLjQxMjMxMSwwLjk4ODAyNl0sWy00LjEzMDc0NiwyLjU3MTgwNiwxLjEwMTY4OV0sWy0wLjY5MzY2NCw5LjE3NDI4MywtMC45NTIzMjNdLFstMS4yODY3NDIsMS4wNzk2NzksLTAuNzUxMjE5XSxbMS41NDMxODUsMS40MDg5MjUsMy40ODMxMzJdLFsxLjUzNTk3MywyLjA0Nzk3OSwzLjY1NTAyOV0sWzAuOTM4NDQsNS44NDEwMSwyLjE5NTIxOV0sWy0wLjY4NDQwMSw1LjkxODQ5MiwxLjIwMTA5XSxbMS4yODg0NCwyLjAwODY3NiwzLjcxMDc4MV0sWy0zLjU4NjcyMiw3LjQzNTUwNiwtMS40NTQ3MzddLFstMC4xMjk5NzUsNC4zODQxOTIsMi45MzA1OTNdLFstMS4wMzA1MzEsMC4yODEzNzQsMy4yMTQyNzNdLFstMy4wNTg3NTEsOC4xMzcyMzgsLTMuMjI3NzE0XSxbMy42NDk1MjQsNC41OTIyMjYsMS4zNDAwMjFdLFstMy4zNTQ4MjgsNy4zMjI0MjUsLTEuNDEyMDg2XSxbMC45MzY0NDksNi4yMDkyMzcsMS41MTI2OTNdLFstMS4wMDE4MzIsMy41OTA0MTEsLTEuNTQ1ODkyXSxbLTMuNzcwNDg2LDQuNTkzMjQyLDIuNDc3MDU2XSxbLTAuOTcxOTI1LDAuMDY3Nzk3LDAuOTIxMzg0XSxbLTQuNjM5ODMyLDYuODY1NDA3LDIuMzExNzkxXSxbLTAuNDQxMDE0LDguMDkzNTk1LC0wLjU5NTk5OV0sWy0yLjAwNDg1Miw2LjM3MTQyLDEuNjM1MzgzXSxbNC43NTk1OTEsMS45MjgxOCwwLjMyODMyOF0sWzMuNzQ4MDY0LDEuMjI0MDc0LDIuMTQwNDg0XSxbLTAuNzAzNjAxLDUuMjg1NDc2LDIuMjUxOTg4XSxbMC41OTUzMiw2LjIxODkzLDAuOTgxMDA0XSxbMC45ODA3OTksNi4yNTcwMjYsMS4yNDIyM10sWzEuNTc0Njk3LDYuMjA0OTgxLDAuMzgxNjI4XSxbMS4xNDk1OTQsNi4xNzM2MDgsMS42NjA3NjNdLFstMy41MDE5NjMsNS44OTU5ODksMy40NTY1NzZdLFsxLjA3MTEyMiw1LjQyNDE5OCwyLjU4ODcxN10sWy0wLjc3NDY5Myw4LjQ3MzMzNSwtMC4yNzY5NTddLFszLjg0OTk1OSw0LjE1NTQyLDAuMzk2NzQyXSxbLTAuODAxNzE1LDQuOTczMTQ5LC0xLjA2ODU4Ml0sWy0yLjkyNzY3NiwwLjYyNTExMiwyLjMyNjM5M10sWzIuNjY5NjgyLDQuMDQ1NTQyLDIuOTcxMTg0XSxbLTQuMzkxMzI0LDQuNzQwODYsMC4zNDM0NjNdLFsxLjUyMDEyOSw2LjI3MDAzMSwwLjc3NTQ3MV0sWzEuODM3NTg2LDYuMDg0NzMxLDAuMTA5MTg4XSxbMS4yNzE0NzUsNS45NzUwMjQsMi4wMzIzNTVdLFstMy40ODc5NjgsNC41MTMyNDksMi42MDU4NzFdLFstMS4zMjIzNCwxLjUxNzI2NCwtMC42OTE4NzldLFstMS4wODAzMDEsMS42NDgyMjYsLTAuODA1NTI2XSxbLTMuMzY1NzAzLDYuOTEwMTY2LC0wLjQ1NDkwMl0sWzEuMzYwMzQsMC40MzIyMzgsMy4wNzUwMDRdLFstMy4zMDUwMTMsNS43NzQ2ODUsMy4zOTE0Ml0sWzMuODg0MzIsMC42NTQxNDEsMC4xMjU3NF0sWzMuNTcyNTQsMC4zNzc5MzQsMC4zMDI1MDFdLFs0LjE5NjEzNiwwLjgwNzk5OSwwLjIxMjIyOV0sWzMuOTMyOTk3LDAuNTQzMTIzLDAuMzgwNTc5XSxbNC4wMjM3MDQsMy4yODYxMjUsMC41Mzc1OTddLFsxLjg2NDQ1NSw0LjkxNjU0NCwyLjY5MTY3N10sWy00Ljc3NTQyNyw2LjQ5OTQ5OCwxLjQ0MDE1M10sWy0zLjQ2NDkyOCwzLjY4MjM0LDIuNzY2MzU2XSxbMy42NDg5NzIsMS43NTEyNjIsMi4xNTc0ODVdLFsxLjE3OTExMSwzLjIzODg0NiwzLjc3NDc5Nl0sWy0wLjE3MTE2NCwwLjI5OTEyNiwtMC41OTI2NjldLFstNC41MDI5MTIsMy4zMTY2NTYsMC44NzUxODhdLFstMC45NDg0NTQsOS4yMTQwMjUsLTAuNjc5NTA4XSxbMS4yMzc2NjUsNi4yODg1OTMsMS4wNDZdLFsxLjUyMzQyMyw2LjI2ODk2MywxLjEzOTU0NF0sWzEuNDM2NTE5LDYuMTQwNjA4LDEuNzM5MzE2XSxbMy43MjM2MDcsMS41MDQzNTUsMi4xMzY3NjJdLFsyLjAwOTQ5NSw0LjA0NTUxNCwzLjIyMDUzXSxbLTEuOTIxOTQ0LDcuMjQ5OTA1LDAuMjEzOTczXSxbMS4yNTQwNjgsMS4yMDU1MTgsMy40NzQ3MDldLFstMC4zMTcwODcsNS45OTYyNjksMC41MjU4NzJdLFstMi45OTY5MTQsMy45MzQ2MDcsMi45MDAxNzhdLFstMy4zMTY4NzMsNC4wMjgxNTQsMi43ODU2OTZdLFstMy40MDAyNjcsNC4yODAxNTcsMi42ODkyNjhdLFstMy4xMzQ4NDIsNC41NjQ4NzUsMi42OTcxOTJdLFsxLjQ4MDU2Myw0LjY5MjU2NywyLjgzNDA2OF0sWzAuODczNjgyLDEuMzE1NDUyLDMuNTQxNTg1XSxbMS41OTkzNTUsMC45MTYyMiwzLjI0Njc2OV0sWy0zLjI5MjEwMiw3LjEyNTkxNCwyLjc2ODUxNV0sWzMuNzQyOTYsNC41MTEyOTksMC42MTY1MzldLFs0LjY5ODkzNSwxLjU1MzM2LDAuMjY5MjFdLFstMy4yNzQzODcsMy4yOTk0MjEsMi44MjM5NDZdLFstMi44ODgwOSwzLjQxMDY5OSwyLjk1NTI0OF0sWzEuMTcxNDA3LDEuNzY5MDUsMy42ODg0NzJdLFsxLjQzMDI3NiwzLjkyNDgzLDMuNDczNjY2XSxbMy45MTY5NDEsMi41NTMzMDgsMC4wMTg5NDFdLFswLjcwMTYzMiwyLjQ0MjM3MiwzLjc3ODYzOV0sWzEuNTYyNjU3LDIuMzAyNzc4LDMuNjYwOTU3XSxbNC40NzY2MjIsMS4xNTI0MDcsMC4xODIxMzFdLFstMC42MTEzNiw1Ljc2MTM2NywxLjU5ODgzOF0sWy0zLjEwMjE1NCwzLjY5MTY4NywyLjkwMzczOF0sWzEuODE2MDEyLDUuNTQ2MTY3LDIuMzgwMzA4XSxbMy44NTM5MjgsNC4yNTA2NiwwLjc1MDAxN10sWzEuMjM0NjgxLDMuNTgxNjY1LDMuNjczNzIzXSxbMS44NjIyNzEsMS4zNjE4NjMsMy4zNTUyMDldLFsxLjM0Njg0NCw0LjE0Njk5NSwzLjMyNzg3N10sWzEuNzA2NzIsNC4wODAwNDMsMy4yNzQzMDddLFswLjg5NzI0MiwxLjkwODk4MywzLjY5NjldLFstMC41ODcwMjIsOS4xOTExMzIsLTAuNTY1MzAxXSxbLTAuMjE3NDI2LDUuNjc0NjA2LDIuMDE5OTY4XSxbMC4yNzg5MjUsNi4xMjA3NzcsMC40ODU0MDNdLFsxLjQ2MzMyOCwzLjU3ODc0MiwtMi4wMDE0NjRdLFstMy4wNzI5ODUsNC4yNjQ1ODEsMi43ODk1MDJdLFszLjYyMzUzLDQuNjczODQzLDAuMzgzNDUyXSxbLTMuMDUzNDkxLDguNzUyMzc3LC0yLjkwODQzNF0sWy0yLjYyODY4Nyw0LjUwNTA3MiwyLjc1NTYwMV0sWzAuODkxMDQ3LDUuMTEzNzgxLDIuNzQ4MjcyXSxbLTIuOTIzNzMyLDMuMDY1MTUsMi44NjYzNjhdLFswLjg0ODAwOCw0Ljc1NDI1MiwyLjg5Njk3Ml0sWy0zLjMxOTE4NCw4LjgxMTY0MSwtMi4zMjc0MTJdLFswLjEyODY0LDguODE0NzgxLC0xLjMzNDQ1Nl0sWzEuNTQ5NTAxLDQuNTQ5MzMxLC0xLjI4MjQzXSxbMS42NDcxNjEsMy43Mzg5NzMsMy41MDc3MTldLFsxLjI1MDg4OCwwLjk0NTU5OSwzLjM0ODczOV0sWzMuODA5NjYyLDQuMDM4ODIyLDAuMDUzMTQyXSxbMS40ODMxNjYsMC42NzMzMjcsMy4wOTE1Nl0sWzAuODI5NzI2LDMuNjM1OTIxLDMuNzEzMTAzXSxbMS4zNTI5MTQsNS4yMjY2NTEsMi42NjgxMTNdLFsyLjIzNzM1Miw0LjM3NDE0LDMuMDE2Mzg2XSxbNC41MDc5MjksMC44ODk0NDcsMC43NDQyNDldLFs0LjU3MzA0LDEuMDEwOTgxLDAuNDk2NTg4XSxbMy45MzE0MjIsMS43MjA5ODksMi4wODgxNzVdLFstMC40NjMxNzcsNS45ODk4MzUsMC44MzQzNDZdLFstMi44MTEyMzYsMy43NDUwMjMsMi45Njk1ODddLFstMi44MDUxMzUsNC4yMTk3MjEsMi44NDExMDhdLFstMi44MzY4NDIsNC44MDI1NDMsMi42MDgyNl0sWzEuNzc2NzE2LDIuMDg0NjExLDMuNTY4NjM4XSxbNC4wNDY4ODEsMS40NjM0NzgsMi4xMDYyNzNdLFswLjMxNjI2NSw1Ljk0NDMxMywxLjg5Mjc4NV0sWy0yLjg2MzQ3LDIuNzc2MDQ5LDIuNzcyNDJdLFstMi42NzM2NDQsMy4xMTY1MDgsMi45MDcxMDRdLFstMi42MjExNDksNC4wMTg1MDIsMi45MDM0MDldLFstMi41NzM0NDcsNS4xOTgwMTMsMi40Nzc0ODFdLFsxLjEwNDAzOSwyLjI3ODk4NSwzLjcyMjQ2OV0sWy00LjYwMjc0Myw0LjMwNjQxMywwLjkwMjI5Nl0sWy0yLjY4NDg3OCwxLjUxMDczMSwwLjUzNTAzOV0sWzAuMDkyMDM2LDguNDczMjY5LC0wLjk5NDEzXSxbLTEuMjgwNDcyLDUuNjAyMzkzLDEuOTI4MTA1XSxbLTEuMDI3OSw0LjEyMTU4MiwtMS40MDMxMDNdLFstMi40NjEwODEsMy4zMDQ0NzcsMi45NTczMTddLFstMi4zNzU5MjksMy42NTkzODMsMi45NTMyMzNdLFsxLjQxNzU3OSwyLjcxNTM4OSwzLjcxODc2N10sWzAuODE5NzI3LDIuOTQ4ODIzLDMuODEwNjM5XSxbMS4zMjk5NjIsMC43NjE3NzksMy4yMDM3MjRdLFsxLjczOTUyLDUuMjk1MjI5LDIuNTM3NzI1XSxbMC45NTI1MjMsMy45NDUwMTYsMy41NDgyMjldLFstMi41Njk0OTgsMC42MzM2NjksMi44NDgxOF0sWy0yLjI3NjY3NiwwLjc1NzAxMywyLjc4MDcxN10sWy0yLjAxMzE0Nyw3LjM1NDQyOSwtMC4wMDMyMDJdLFswLjkzMTQzLDEuNTY1OTEzLDMuNjAwMzI1XSxbMS4yNDkwMTQsMS41NTA1NTYsMy41ODU4NDJdLFsyLjI4NzI1Miw0LjA3MjM1MywzLjEyNDU0NF0sWy00LjczNDksNy4wMDYyNDQsMS42OTA2NTNdLFstMy41MDA2MDIsOC44MDM4NiwtMi4wMDkxOTZdLFstMC41ODI2MjksNS41NDkxMzgsMi4wMDA5MjNdLFstMS44NjUyOTcsNi4zNTYwNjYsMS4zMTM1OTNdLFstMy4yMTIxNTQsMi4zNzYxNDMsLTAuNTY1NTkzXSxbMi4wOTI4ODksMy40OTM1MzYsLTEuNzI3OTMxXSxbLTIuNTI4NTAxLDIuNzg0NTMxLDIuODMzNzU4XSxbLTIuNTY1Njk3LDQuODkzMTU0LDIuNTU5NjA1XSxbLTIuMTUzMzY2LDUuMDQ1ODQsMi40NjUyMTVdLFsxLjYzMTMxMSwyLjU2ODI0MSwzLjY4MTQ0NV0sWzIuMTUwMTkzLDQuNjk5MjI3LDIuODA3NTA1XSxbMC41MDc1OTksNS4wMTgxMywyLjc3NTg5Ml0sWzQuMTI5ODYyLDEuODYzNjk4LDIuMDE1MTAxXSxbMy41NzgyNzksNC41MDc2NiwtMC4wMDk1OThdLFszLjQ5MTAyMyw0LjgwNjc0OSwxLjU0OTI2NV0sWzAuNjE5NDg1LDEuNjI1MzM2LDMuNjA1MTI1XSxbMS4xMDc0OTksMi45MzI1NTcsMy43OTAwNjFdLFstMi4wODIyOTIsNi45OTMyMSwwLjc0MjYwMV0sWzQuODM5OTA5LDEuMzc5Mjc5LDAuOTQ1Mjc0XSxbMy41OTEzMjgsNC4zMjI2NDUsLTAuMjU5NDk3XSxbMS4wNTUyNDUsMC43MTA2ODYsMy4xNjU1M10sWy0zLjAyNjQ5NCw3Ljg0MjIyNywxLjYyNDU1M10sWzAuMTQ2NTY5LDYuMTE5MjE0LDAuOTgxNjczXSxbLTIuMDQzNjg3LDIuNjE0NTA5LDIuNzg1NTI2XSxbLTIuMzAyMjQyLDMuMDQ3Nzc1LDIuOTM2MzU1XSxbLTIuMjQ1Njg2LDQuMTAwNDI0LDIuODc3OTRdLFsyLjExNjE0OCw1LjA2MzUwNywyLjU3MjIwNF0sWy0xLjQ0ODQwNiw3LjY0NTU5LDAuMjUxNjkyXSxbMi41NTA3MTcsNC45MjY4LDIuNTE3NTI2XSxbLTIuOTU1NDU2LDcuODAyOTMsLTEuNzgyNDA3XSxbMS44ODI5OTUsNC42MzcxNjcsMi44OTU0MzZdLFstMi4wMTQ5MjQsMy4zOTgyNjIsMi45NTQ4OTZdLFstMi4yNzM2NTQsNC43NzEyMjcsMi42MTE0MThdLFstMi4xNjI3MjMsNy44NzY3NjEsMC43MDI0NzNdLFstMC4xOTg2NTksNS44MjMwNjIsMS43MzkyNzJdLFstMS4yODA5MDgsMi4xMzMxODksLTAuOTIxMjQxXSxbMi4wMzk5MzIsNC4yNTE1NjgsMy4xMzY1NzldLFsxLjQ3NzgxNSw0LjM1NDMzMywzLjEwODMyNV0sWzAuNTYwNTA0LDMuNzQ0MTI4LDMuNjkxM10sWy0yLjIzNDAxOCwxLjA1NDM3MywyLjM1Mjc4Ml0sWy0zLjE4OTE1Niw3LjY4NjY2MSwtMi41MTQ5NTVdLFstMy43NDQ3MzYsNy42OTk2MywyLjExNjk3M10sWy0yLjI4MzM2NiwyLjg3ODM2NSwyLjg3ODgyXSxbLTIuMTUzNzg2LDQuNDU3NDgxLDIuNzQzNTI5XSxbNC45MzM5NzgsMS42NzcyODcsMC43MTM3NzNdLFszLjUwMjE0NiwwLjUzNTMzNiwxLjc1MjUxMV0sWzEuODI1MTY5LDQuNDE5MjUzLDMuMDgxMTk4XSxbMy4wNzIzMzEsMC4yODA5NzksMC4xMDY1MzRdLFstMC41MDgzODEsMS4yMjAzOTIsMi44NzgwNDldLFstMy4xMzg4MjQsOC40NDUzOTQsLTEuNjU5NzExXSxbLTIuMDU2NDI1LDIuOTU0ODE1LDIuODk3MjQxXSxbLTIuMDM1MzQzLDUuMzk4NDc3LDIuMjE1ODQyXSxbLTMuMjM5OTE1LDcuMTI2Nzk4LC0wLjcxMjU0N10sWy0xLjg2NzkyMyw3Ljk4OTgwNSwwLjUyNjUxOF0sWzEuMjM0MDUsNi4yNDg5NzMsMS4zODcxODldLFstMC4yMTY0OTIsOC4zMjA5MzMsLTAuODYyNDk1XSxbLTIuMDc5NjU5LDMuNzU1NzA5LDIuOTI4NTYzXSxbLTEuNzg1OTUsNC4zMDAzNzQsMi44MDUyOTVdLFstMS44NTY1ODksNS4xMDY3OCwyLjM4NjU3Ml0sWy0xLjcxNDM2Miw1LjU0NDc3OCwyLjAwNDYyM10sWzEuNzIyNDAzLDQuMjAwMjkxLC0xLjQwODE2MV0sWzAuMTk1Mzg2LDAuMDg2OTI4LC0xLjMxODAwNl0sWzEuMzkzNjkzLDMuMDEzNDA0LDMuNzEwNjg2XSxbLTAuNDE1MzA3LDguNTA4NDcxLC0wLjk5Njg4M10sWy0xLjg1Mzc3NywwLjc1NTYzNSwyLjc1NzI3NV0sWy0xLjcyNDA1NywzLjY0NTMzLDIuODg0MjUxXSxbLTEuODg0NTExLDQuOTI3ODAyLDIuNTMwODg1XSxbLTEuMDE3MTc0LDcuNzgzOTA4LC0wLjIyNzA3OF0sWy0xLjc3OTgsMi4zNDI1MTMsMi43NDE3NDldLFstMS44NDEzMjksMy45NDM5OTYsMi44ODQzNl0sWzEuNDMwMzg4LDUuNDY4MDY3LDIuNTAzNDY3XSxbLTIuMDMwMjk2LDAuOTQwMDI4LDIuNjExMDg4XSxbLTEuNjc3MDI4LDEuMjE1NjY2LDIuNjA3NzcxXSxbLTEuNzQwOTIsMi44MzI1NjQsMi44MjcyOTVdLFs0LjE0NDY3MywwLjYzMTM3NCwwLjUwMzM1OF0sWzQuMjM4ODExLDAuNjUzOTkyLDAuNzYyNDM2XSxbLTEuODQ3MDE2LDIuMDgyODE1LDIuNjQyNjc0XSxbNC4wNDU3NjQsMy4xOTQwNzMsMC44NTIxMTddLFstMS41NjM5ODksOC4xMTI3MzksMC4zMDMxMDJdLFstMS43ODE2MjcsMS43OTQ4MzYsMi42MDIzMzhdLFstMS40OTM3NDksMi41MzM3OTksMi43OTcyNTFdLFstMS45MzQ0OTYsNC42OTA2ODksMi42NTg5OTldLFstMS40OTkxNzQsNS43Nzc5NDYsMS43NDc0OThdLFstMi4zODc0MDksMC44NTEyOTEsMS41MDA1MjRdLFstMS44NzIyMTEsOC4yNjk5ODcsMC4zOTI1MzNdLFstNC42NDc3MjYsNi43NjU3NzEsMC44MzM2NTNdLFstMy4xNTc0ODIsMC4zNDE5NTgsLTAuMjA2NzFdLFstMS43MjU3NjYsMy4yNDcwMywyLjg4MzU3OV0sWy0xLjQ1ODE5OSw0LjA3OTAzMSwyLjgzNjMyNV0sWy0xLjYyMTU0OCw0LjUxNTg2OSwyLjcxOTI2Nl0sWy0xLjYwNzI5Miw0LjkxODkxNCwyLjUwNTg4MV0sWy0xLjQ5NDY2MSw1LjU1NjIzOSwxLjk5MTU5OV0sWy0xLjcyNzI2OSw3LjQyMzc2OSwwLjAxMjMzN10sWy0xLjM4MjQ5NywxLjE2MTMyMiwyLjY0MDIyMl0sWy0xLjUyMTI5LDQuNjgxNzE0LDIuNjE1NDY3XSxbLTQuMjQ3MTI3LDIuNzkyODEyLDEuMjUwODQzXSxbLTEuNTc2MzM4LDAuNzQyOTQ3LDIuNzY5Nzk5XSxbLTEuNDk5MjU3LDIuMTcyNzYzLDIuNzQzMTQyXSxbLTEuNDgwMzkyLDMuMTAzMjYxLDIuODYyMjYyXSxbMS4wNDkxMzcsMi42MjU4MzYsMy43NzUzODRdLFstMS4zNjgwNjMsMS43OTE1ODcsMi42OTU1MTZdLFstMS4zMDc4MzksMi4zNDQ1MzQsMi43Njc1NzVdLFstMS4zMzY3NTgsNS4wOTIyMjEsMi4zNTUyMjVdLFstMS41NjE3LDUuMzAxNzQ5LDIuMjE2MjVdLFstMS40ODMzNjIsOC41Mzc3MDQsMC4xOTY3NTJdLFstMS41MTczNDgsOC43NzM2MTQsMC4wNzQwNTNdLFstMS40NzQzMDIsMS40OTI3MzEsMi42NDE0MzNdLFsyLjQ4NzE4LDAuNjQ0MjQ3LC0wLjkyMDIyNl0sWzAuODE4MDkxLDAuNDIyNjgyLDMuMTcxMjE4XSxbLTMuNjIzMzk4LDYuOTMwMDk0LDMuMDMzMDQ1XSxbMS42NzYzMzMsMy41MzEwMzksMy41OTE1OTFdLFsxLjE5OTkzOSw1LjY4Mzg3MywyLjM2NTYyM10sWy0xLjIyMzg1MSw4Ljg0MTIwMSwwLjAyNTQxNF0sWy0xLjI4NjMwNywzLjg0NzY0MywyLjkxODA0NF0sWy0xLjI1ODU3LDQuODEwODMxLDIuNTQzNjA1XSxbMi42MDM2NjIsNS41NzIxNDYsMS45OTE4NTRdLFswLjEzODk4NCw1Ljc3OTcyNCwyLjA3NzgzNF0sWy0xLjI2NzAzOSwzLjE3NTE2OSwyLjg5MDg4OV0sWy0xLjI5MzYxNiwzLjQ1NDYxMiwyLjkxMTc3NF0sWy0yLjYwMTEyLDEuMjc3MTg0LDAuMDc3MjRdLFsyLjU1Mjc3OSwzLjY0OTg3NywzLjE2MzY0M10sWy0xLjAzODk4MywxLjI0ODAxMSwyLjYwNTkzM10sWy0xLjI4ODcwOSw0LjM5MDk2NywyLjc2MTIxNF0sWy0xLjAzNDIxOCw1LjQ4NTk2MywyLjAxMTQ2N10sWy0xLjE4NTU3NiwxLjQ2NDg0MiwyLjYyNDMzNV0sWy0xLjA0NTY4MiwyLjU0ODk2LDIuNzYxMTAyXSxbNC4yNTkxNzYsMS42NjA2MjcsMi4wMTgwOTZdLFstMC45NjE3MDcsMS43MTcxODMsMi41OTgzNDJdLFstMS4wNDQ2MDMsMy4xNDc0NjQsMi44NTUzMzVdLFstMC44OTE5OTgsNC42ODU0MjksMi42Njk2OTZdLFstMS4wMjc1NjEsNS4wODE2NzIsMi4zNzc5MzldLFs0LjM4NjUwNiwwLjgzMjQzNCwwLjUxMDA3NF0sWy0xLjAxNDIyNSw5LjA2NDk5MSwtMC4xNzUzNTJdLFstMS4yMTg3NTIsMi44OTU0NDMsMi44MjM3ODVdLFstMC45NzIwNzUsNC40MzI2NjksMi43ODgwMDVdLFstMi43MTQ5ODYsMC41MjQyNSwxLjUwOTc5OF0sWy0wLjY5OTI0OCwxLjUxNzIxOSwyLjY0NTczOF0sWy0xLjE2MTU4MSwyLjA3ODg1MiwyLjcyMjc5NV0sWy0wLjg0NTI0OSwzLjI4NjI0NywyLjk5NjQ3MV0sWzEuMDY4MzI5LDQuNDQzNDQ0LDIuOTkzODYzXSxbMy45ODEzMiwzLjcxNTU1NywxLjAyNzc3NV0sWzEuNjU4MDk3LDMuOTgyNDI4LC0xLjY1MTY4OF0sWy00LjA1MzcwMSwyLjQ0OTg4OCwwLjczNDc0Nl0sWy0wLjkxMDkzNSwyLjIxNDE0OSwyLjcwMjM5M10sWzAuMDg3ODI0LDMuOTYxNjUsMy40MzkzNDRdLFstMC43Nzk3MTQsMy43MjQxMzQsMi45OTM0MjldLFstMS4wNTEwOTMsMy44MTA3OTcsMi45NDE5NTddLFstMC42NDQ5NDEsNC4zODU5LDIuODcwODYzXSxbLTIuOTg0MDMsOC42NjY4OTUsLTMuNjkxODg4XSxbLTAuNzU0MzA0LDIuNTA4MzI1LDIuODEyOTk5XSxbLTQuNjM1NTI0LDMuNjYyODkxLDAuOTEzMDA1XSxbLTAuOTgzMjk5LDQuMTI1OTc4LDIuOTE1Mzc4XSxbNC45MTY0OTcsMS45MDUyMDksMC42MjEzMTVdLFs0Ljg3NDk4MywxLjcyODQyOSwwLjQ2ODUyMV0sWzIuMzMxMjcsNS4xODE5NTcsMi40NDE2OTddLFstMC42NTM3MTEsMi4yNTMzODcsMi43OTQ5XSxbLTMuNjIzNzQ0LDguOTc4Nzk1LC0yLjQ2MTkyXSxbLTQuNTU1OTI3LDYuMTYwMjc5LDAuMjE1NzU1XSxbLTQuOTQwNjI4LDUuODA2NzEyLDEuMTgzODNdLFszLjMwODUwNiwyLjQwMzI2LC0wLjkxMDc3Nl0sWzAuNTg4MzUsNS4yNTE5MjgsLTAuOTkyODg2XSxbMi4xNTIyMTUsNS40NDk3MzMsMi4zMzE2NzldLFstMC43MTI3NTUsMC43NjY3NjUsMy4yODAzNzVdLFstMC43NDE3NzEsMS45NzE2LDIuNjU3MjM1XSxbLTQuODI4OTU3LDUuNTY2OTQ2LDIuNjM1NjIzXSxbLTMuNDc0Nzg4LDguNjk2NzcxLC0xLjc3NjEyMV0sWzEuNzcwNDE3LDYuMjA1NTYxLDEuMzMxNjI3XSxbLTAuNjIwNjI2LDQuMDY0NzIxLDIuOTY4OTcyXSxbLTEuNDk5MTg3LDIuMzA3NzM1LC0wLjk3ODkwMV0sWzQuMDk4NzkzLDIuMzMwMjQ1LDEuNjY3OTUxXSxbMS45NDA0NDQsNi4xNjcwNTcsMC45MzU5MDRdLFstMi4zMTQ0MzYsMS4xMDQ5OTUsMS42ODEyNzddLFstMi43MzM2MjksNy43NDI3OTMsMS43NzA1XSxbLTAuNDUyMjQ4LDQuNzE5ODY4LDIuNzQwODM0XSxbLTAuNjQ5MTQzLDQuOTUxNzEzLDIuNTQxMjk2XSxbLTAuNDc5NDE3LDkuNDM5NTksLTAuNjc2MzI0XSxbLTIuMjUxODUzLDYuNTU5Mjc1LDAuMDQ2ODE5XSxbMC4wMzM1MzEsOC4zMTY5MDcsLTAuNzg5OTM5XSxbLTAuNTEzMTI1LDAuOTk1NjczLDMuMTI1NDYyXSxbLTIuNjM3NjAyLDEuMDM5NzQ3LDAuNjAyNDM0XSxbMS41Mjc1MTMsNi4yMzAwODksMS40MzA5MDNdLFs0LjAzNjEyNCwyLjYwOTg0NiwxLjUwNjQ5OF0sWy0zLjU1OTgyOCw3Ljg3Nzg5MiwxLjIyODA3Nl0sWy00LjU3MDczNiw0Ljk2MDE5MywwLjgzODIwMV0sWy0wLjQzMjEyMSw1LjE1NzczMSwyLjQ2NzUxOF0sWy0xLjIwNjczNSw0LjU2MjUxMSwtMS4yMzcwNTRdLFstMC44MjM3NjgsMy43ODg3NDYsLTEuNTY3NDgxXSxbLTMuMDk1NTQ0LDcuMzUzNjEzLC0xLjAyNDU3N10sWy00LjA1NjA4OCw3LjYzMTExOSwyLjA2MjAwMV0sWy0wLjI4OTM4NSw1LjM4MjI2MSwyLjMyOTQyMV0sWzEuNjk3NTIsNi4xMzY0ODMsMS42NjcwMzddLFstMC4xNjg3NTgsNS4wNjExMzgsMi42MTc0NTNdLFsyLjg1MzU3NiwxLjYwNTUyOCwtMS4yMjk5NThdLFstNC41MTQzMTksNi41ODY2NzUsMC4zNTI3NTZdLFstMi41NTgwODEsNy43NDExNTEsMS4yOTI5NV0sWzEuNjExMTYsNS45MjM1OCwyLjA3MTUzNF0sWzMuOTM2OTIxLDMuMzU0ODU3LDAuMDkxNzU1XSxbLTAuMTYzMywxLjExOTI3MiwzLjE0Nzk3NV0sWzAuMDY3NTUxLDEuNTkzNDc1LDMuMzgyMTJdLFstMS4zMDMyMzksMi4zMjgxODQsLTEuMDExNjcyXSxbLTAuNDM4MDkzLDAuNzM0MjMsMy4zOTgzODRdLFstNC42Mjc2NywzLjg5ODE4NywwLjg0OTU3M10sWzAuMjg2ODUzLDQuMTY1MjgxLDMuMjg0ODM0XSxbLTIuOTY4MDUyLDguNDkyODEyLC0zLjQ5MzY5M10sWy0wLjExMTg5NiwzLjY5NjExMSwzLjUzNzkxXSxbLTMuODA4MjQ1LDguNDUxNzMxLC0xLjU3NDc0Ml0sWzAuMDUzNDE2LDUuNTU4NzY0LDIuMzExMDddLFszLjk1NjI2OSwzLjAxMjA3MSwwLjExMTIxXSxbLTAuNzEwOTU2LDguMTA2NTYxLC0wLjY2NTE1NF0sWzAuMjM0NzI1LDIuNzE3MzI2LDMuNzIyMzc5XSxbLTAuMDMxNTk0LDIuNzY0MTEsMy42NTczNDddLFstMC4wMTczNzEsNC43MDA2MzMsMi44MTkxMV0sWzAuMjE1MDY0LDUuMDM0ODU5LDIuNzIxNDI2XSxbLTAuMTExMTUxLDguNDgwMzMzLC0wLjY0OTM5OV0sWzMuOTc5NDIsMy41NzU0NzgsMC4zNjIyMTldLFswLjM5Mjk2Miw0LjczNTM5MiwyLjg3NDMyMV0sWzQuMTcwMTUsMi4wODUwODcsMS44NjU5OTldLFswLjE2OTA1NCwxLjI0NDc4NiwzLjMzNzcwOV0sWzAuMDIwMDQ5LDMuMTY1ODE4LDMuNzIxNzM2XSxbMC4yNDgyMTIsMy41OTU1MTgsMy42OTgzNzZdLFswLjEzMDcwNiw1LjI5NTU0MSwyLjU0MDAzNF0sWy00LjU0MTM1Nyw0Ljc5ODMzMiwxLjAyNjg2Nl0sWy0xLjI3NzQ4NSwxLjI4OTUxOCwtMC42NjcyNzJdLFszLjg5MjEzMywzLjU0MjYzLC0wLjA3ODA1Nl0sWzQuMDU3Mzc5LDMuMDM2NjksMC45OTc5MTNdLFswLjI4NzcxOSwwLjg4NDc1OCwzLjI1MTc4N10sWzAuNTM1NzcxLDEuMTQ0NzAxLDMuNDAwMDk2XSxbMC41ODUzMDMsMS4zOTkzNjIsMy41MDUzNTNdLFswLjE5MTU1MSwyLjA3NjI0NiwzLjU0OTM1NV0sWzAuMzI4NjU2LDIuMzk0NTc2LDMuNjQ5NjIzXSxbMC40MTMxMjQsMy4yNDA3MjgsMy43NzE1MTVdLFswLjYzMDM2MSw0LjUwMTU0OSwyLjk2MzYyM10sWzAuNTI5NDQxLDUuODU0MzkyLDIuMTIwMjI1XSxbMy44MDU3OTYsMy43Njk5NTgsLTAuMTYyMDc5XSxbMy40NDcyNzksNC4zNDQ4NDYsLTAuNDY3Mjc2XSxbMC4zNzc2MTgsNS41NTExMTYsMi40MjYwMTddLFswLjQwOTM1NSwxLjgyMTI2OSwzLjYwNjMzM10sWzAuNzE5OTU5LDIuMTk0NzI2LDMuNzAzODUxXSxbMC40OTU5MjIsMy41MDE1MTksMy43NTU2NjFdLFswLjYwMzQwOCw1LjM1NDA5NywyLjYwMzA4OF0sWy00LjYwNTA1Niw3LjUzMTk3OCwxLjE5NTc5XSxbMC45MDc5NzIsMC45NzMxMjgsMy4zNTY1MTNdLFswLjc1MDEzNCwzLjM1NjEzNywzLjc2NTg0N10sWzAuNDQ5NiwzLjk5MzI0NCwzLjUwNDU0NF0sWy0zLjAzMDczOCw3LjQ4OTQ3LC0xLjI1OTE2OV0sWzAuNzA3NTA1LDUuNjAyMDA1LDIuNDM0NzZdLFswLjY2ODk0NCwwLjY1NDg5MSwzLjIxMzc5N10sWzAuNTkzMjQ0LDIuNzAwOTc4LDMuNzkxNDI3XSxbMS40Njc3NTksMy4zMDMyNywzLjcxMDM1XSxbMy4zMTYyNDksMi40MzYzODgsMi41ODExNzVdLFszLjI2MTM4LDEuNzI0NDI1LDIuNTM5MDI4XSxbLTEuMjMxMjkyLDcuOTY4MjYzLDAuMjgxNDE0XSxbLTAuMTA4NzczLDguNzEyMzA3LC0wLjc5MDYwN10sWzQuNDQ1Njg0LDEuODE5NDQyLDEuODk2OTg4XSxbMS45OTg5NTksMi4yODE0OTksMy40OTQ0N10sWzIuMTYyMjY5LDIuMTEzODE3LDMuMzY1NDQ5XSxbNC4zNjMzOTcsMS40MDY3MzEsMS45MjI3MTRdLFs0LjgwOCwyLjIyNTg0MiwwLjYxMTEyN10sWzIuNzM1OTE5LDAuNzcxODEyLC0wLjcwMTE0Ml0sWzEuODk3NzM1LDIuODc4NDI4LDMuNTgzNDgyXSxbLTMuMzE2MTYsNS4zMzE5ODUsMy4yMTIzOTRdLFstMy4zMzE0LDYuMDE4MTM3LDMuMzEzMDE4XSxbLTMuNTAzMTgzLDYuNDgwMTAzLDMuMjIyMjE2XSxbLTEuOTA0NDUzLDUuNzUwMzkyLDEuOTEzMzI0XSxbLTEuMzM5NzM1LDMuNTU5NTkyLC0xLjQyMTgxN10sWy0xLjA0NDI0Miw4LjIyNTM5LDAuMDM3NDE0XSxbMS42NDM0OTIsMy4xMTA2NzYsMy42NDc0MjRdLFszLjk5MjgzMiwzLjY4NjI0NCwwLjcxMDk0Nl0sWzEuNzc0MjA3LDEuNzE4NDIsMy40NzU3NjhdLFstMy40Mzg4NDIsNS41NzEzLDMuNDI3ODE4XSxbNC42MDI0NDcsMS4yNTgzLDEuNjE5NTI4XSxbLTAuOTI1NTE2LDcuOTMwMDQyLDAuMDcyMzM2XSxbLTEuMjUyMDkzLDMuODQ2NTY1LC0xLjQyMDc2MV0sWy0zLjQyNjg1Nyw1LjA3MjQxOSwyLjk3ODA2XSxbLTMuMTYwNDA4LDYuMTUyNjI5LDMuMDYxODY5XSxbMy43Mzk5MzEsMy4zNjcwODIsMi4wNDEyNzNdLFsxLjAyNzQxOSw0LjIzNTg5MSwzLjI1MTI1M10sWzQuNzc3NzAzLDEuODg3NDUyLDEuNTYwNDA5XSxbLTMuMzE4NTI4LDYuNzMzNzk2LDIuOTgyOTY4XSxbMi45MjkyNjUsNC45NjI1NzksMi4yNzEwNzldLFszLjQ0OTc2MSwyLjgzODYyOSwyLjQ3NDU3Nl0sWy0zLjI4MDE1OSw1LjAyOTg3NSwyLjc4NzUxNF0sWzQuMDY4OTM5LDIuOTkzNjI5LDAuNzQxNTY3XSxbMC4zMDMzMTIsOC43MDkyNywtMS4xMjE5NzJdLFswLjIyOTg1Miw4Ljk4MTMyMiwtMS4xODYwNzVdLFstMC4wMTEwNDUsOS4xNDgxNTYsLTEuMDQ3MDU3XSxbLTIuOTQyNjgzLDUuNTc5NjEzLDIuOTI5Mjk3XSxbLTMuMTQ1NDA5LDUuNjk4NzI3LDMuMjA1Nzc4XSxbLTMuMDE5MDg5LDYuMzA4ODcsMi43OTQzMjNdLFstMy4yMTcxMzUsNi40NjgxOTEsMi45NzAwMzJdLFstMy4wNDgyOTgsNi45OTM2NDEsMi42MjMzNzhdLFstMy4wNzQyOSw2LjY2MDk4MiwyLjcwMjQzNF0sWzMuNjEyMDExLDIuNTU3NCwyLjI1MzQ5XSxbMi41NDUxNiw0LjU1Mzk2NywyLjc1ODg0XSxbLTEuNjgzNzU5LDcuNDAwNzg3LDAuMjUwODY4XSxbLTEuNzU2MDY2LDcuNDYzNTU3LDAuNDQ4MDMxXSxbLTMuMDIzNzYxLDUuMTQ5Njk3LDIuNjczNTM5XSxbMy4xMTIzNzYsMi42NzcyMTgsMi43ODIzNzhdLFsyLjgzNTMyNyw0LjU4MTE5NiwyLjU2NzE0Nl0sWy0yLjk3Mzc5OSw3LjIyNTQ1OCwyLjUwNjk4OF0sWy0wLjU5MTY0NSw4Ljc0MDY2MiwtMC41MDU4NDVdLFszLjc4Mjg2MSwyLjA0MzM3LDIuMDMwNjZdLFszLjMzMTYwNCwzLjM2MzQzLDIuNjA1MDQ3XSxbMi45NjY4NjYsMS4yMDU0OTcsMi41Mzc0MzJdLFswLjAwMjY2OSw5LjY1NDc0OCwtMS4zNTU1NTldLFsyLjYzMjgwMSwwLjU4NDk3LDIuNTQwMzExXSxbLTIuODE5Mzk4LDUuMDg3MzcyLDIuNTIxMDk4XSxbMi42MTYxOTMsNS4zMzI5NjEsMi4xOTQyODhdLFstMy4xOTM5NzMsNC45MjU2MzQsMi42MDc5MjRdLFstMy4xMjYxOCw1LjI3NTI0LDIuOTQ0NTQ0XSxbLTAuNDI2MDAzLDguNTE2MzU0LC0wLjUwMTUyOF0sWzIuODAyNzE3LDEuMzg3NjQzLDIuNzUxNjQ5XSxbLTMuMTIwNTk3LDcuODg5MTExLC0yLjc1NDMxXSxbMi42MzY2NDgsMS43MTcwMiwyLjk5MTMwMl0sWy0yLjg1MzE1MSw2LjcxMTc5MiwyLjQzMDI3Nl0sWy0yLjg0MzgzNiw2Ljk2Mjg2NSwyLjQwMDg0Ml0sWzEuOTY5NiwzLjE5OTAyMywzLjUwNDUxNF0sWy0yLjQ2MTc1MSwwLjM4NjM1MiwzLjAwODk5NF0sWzEuNjQxMjcsMC40OTU3NTgsMy4wMjk1OF0sWy00LjMzMDQ3Miw1LjQwOTgzMSwwLjAyNTI4N10sWy0yLjkxMjM4Nyw1Ljk4MDQxNiwyLjg0NDI2MV0sWy0yLjQ5MDA2OSwwLjIxMTA3OCwyLjk4NTM5MV0sWzMuNTgxODE2LDQuODA5MTE4LDAuNzMzNzI4XSxbMi42OTMxOTksMi42NDcyMTMsMy4xMjY3MDldLFstMC4xODI5NjQsOC4xODQxMDgsLTAuNjM4NDU5XSxbLTIuMjI2ODU1LDAuNDQ0NzExLDIuOTQ2NTUyXSxbLTAuNzIwMTc1LDguMTE1MDU1LDAuMDE3Njg5XSxbMi42NDUzMDIsNC4zMTYyMTIsMi44NTAxMzldLFstMC4yMzI3NjQsOS4zMjk1MDMsLTAuOTE4NjM5XSxbNC44NTIzNjUsMS40NzE5MDEsMC42NTI3NV0sWzIuNzYyMjksMi4wMTQ5OTQsMi45NTc3NTVdLFstMi44MDgzNzQsNS4zNTQzMDEsMi42NDQ2OTVdLFstMi43OTA5NjcsNi40MDY5NjMsMi41NDc5ODVdLFstMS4zNDI2ODQsMC40MTg0ODgsLTEuNjY5MTgzXSxbMi42OTA2NzUsNS41OTM1ODcsLTAuMDQxMjM2XSxbNC42NjAxNDYsMS42MzE4LDEuNzEzMzE0XSxbMi43NzU2NjcsMy4wMDcyMjksMy4xMTEzMzJdLFstMC4zOTY2OTYsOC45NjM0MzIsLTAuNzA2MjAyXSxbMi40NDY3MDcsMi43NDA2MTcsMy4zMjE0MzNdLFstNC44MDMyMDksNS44ODQ2MzQsMi42MDM2NzJdLFstMi42NTIwMDMsMS42NTQxLDEuNTA3OF0sWzMuOTMyMzI3LDMuOTcyODc0LDAuODMxOTI0XSxbMi4xMzU5MDYsMC45NTU1ODcsMi45ODY2MDhdLFsyLjQ4NjEzMSwyLjA1MzgwMiwzLjEyNDExNV0sWy0wLjM4NjcwNiw4LjExNTc1MywtMC4zNzU2NV0sWy0yLjcyMDcyNyw3LjMyNTA0NCwyLjIyNDg3OF0sWy0xLjM5Njk0Niw3LjYzODAxNiwtMC4xNjQ4Nl0sWy0wLjYyMDgzLDcuOTg5NzcxLC0wLjE0NDQxM10sWy0yLjY1MzI3Miw1LjcyOTY4NCwyLjY2NzY3OV0sWzMuMDM4MTg4LDQuNjU4MzUsMi4zNjQxNDJdLFsyLjM4MTcyMSwwLjczOTQ3MiwyLjc4ODk5Ml0sWy0yLjM0NTgyOSw1LjQ3NDkyOSwyLjM4MDYzM10sWy0yLjUxODk4Myw2LjA4MDU2MiwyLjQ3OTM4M10sWy0yLjYxNTc5Myw2LjgzOTYyMiwyLjE4NjExNl0sWy0yLjI4NjU2NiwwLjE0Mzc1MiwyLjc2Njg0OF0sWy00Ljc3MTIxOSw2LjUwODc2NiwxLjA3MDc5N10sWzMuNzE3MzA4LDIuOTA1MDE5LDIuMDk3OTk0XSxbMi41MDUyMSwzLjAxNjc0MywzLjI5NTg5OF0sWzIuMjA4NDQ4LDEuNTYwMjksMy4yMTY4MDZdLFszLjM0Njc4MywxLjAxMjU0LDIuMTE5OTUxXSxbMi42NTM1MDMsMy4yNjEyMiwzLjE3NTczOF0sWy0yLjM1OTYzNiw1LjgyNzUxOSwyLjQwMjI5N10sWy0xLjk1MjY5MywwLjU1ODEwMiwyLjg1MzMwN10sWy0wLjMyMTU2Miw5LjQxNDg4NSwtMS4xODc1MDFdLFszLjEzODkyMywxLjQwNTA3MiwyLjUyMDc2NV0sWzEuNDkzNzI4LDEuNzgwMDUxLDMuNjIxOTY5XSxbMy4wMTgxNywwLjkwNzI5MSwyLjMzNjkwOV0sWzMuMTgzNTQ4LDEuMTg1Mjk3LDIuMzUyMTc1XSxbMS42MDg2MTksNS4wMDY3NTMsMi42OTUxMzFdLFstNC43MjM5MTksNi44MzYxMDcsMS4wOTUyODhdLFstMS4wMTc1ODYsOC44NjU0MjksLTAuMTQ5MzI4XSxbNC43MzA3NjIsMS4yMTQwMTQsMC42NDAwOF0sWy0yLjEzNTE4Miw2LjY0NzkwNywxLjQ5NTQ3MV0sWy0yLjQyMDM4Miw2LjU0NjExNCwyLjEwODIwOV0sWy0yLjQ1ODA1Myw3LjE4NjM0NiwxLjg5NjYyM10sWzMuNDM3MTI0LDAuMjc1Nzk4LDEuMTM4MjAzXSxbMC4wOTU5MjUsOC43MjU4MzIsLTAuOTI2NDgxXSxbMi40MTczNzYsMi40Mjk4NjksMy4yODc2NTldLFsyLjI3OTk1MSwxLjIwMDMxNywzLjA0OTk5NF0sWzIuNjc0NzUzLDIuMzI2OTI2LDMuMDQ0MDU5XSxbLTIuMzI4MTIzLDYuODQ5MTY0LDEuNzU3NTFdLFstMy40MTg2MTYsNy44NTM0MDcsMC4xMjYyNDhdLFstMy4xNTE1ODcsNy43NzU0MywtMC4xMTA4ODldLFsyLjM0OTE0NCw1LjY1MzI0MiwyLjA1ODY5XSxbLTIuMjczMjM2LDYuMDg1NjMxLDIuMjQyODg4XSxbLTQuNTYwNjAxLDQuNTI1MzQyLDEuMjYxMjQxXSxbMi44NjYzMzQsMy43OTYwNjcsMi45MzQ3MTddLFstMi4xNzQ5Myw2LjUwNTUxOCwxLjc5MTM2N10sWzMuMTIwNTksMy4yODMxNTcsMi44MTg4NjldLFszLjAzNzcwMywzLjU2MjM1NiwyLjg2NjY1M10sWzAuMDY2MjMzLDkuNDg4NDE4LC0xLjI0ODIzN10sWzIuNzQ5OTQxLDAuOTc1MDE4LDIuNTczMzcxXSxbLTIuMTU1NzQ5LDUuODAxMDMzLDIuMjA0MDA5XSxbLTIuMTYyNzc4LDYuMjYxODg5LDIuMDI4NTk2XSxbMS45MzY4NzQsMC40NTkxNDIsMi45NTY3MThdLFszLjE3NjI0OSw0LjMzNTU0MSwyLjQ0MDQ0N10sWzQuMzU2NTk5LDEuMDI5NDIzLDEuNzAwNTg5XSxbMy44NzM1MDIsMy4wODI2NzgsMS44MDQzMV0sWzIuODk1NDg5LDQuMjQzMDM0LDIuNzM1MjU5XSxbLTAuMDk1Nzc0LDkuNDY4MTk1LC0xLjA3NDUxXSxbLTEuMTI0OTgyLDcuODg2ODA4LC0wLjQ4MDg1MV0sWzMuMDMyMzA0LDMuMDY1NDU0LDIuODk3OTI3XSxbMy42OTI2ODcsNC41OTYxLDAuOTU3ODU4XSxbLTMuMDEzMDQ1LDMuODA3MjM1LC0xLjA5ODM4MV0sWy0wLjc5MDAxMiw4LjkyOTEyLC0wLjM2NzU3Ml0sWzEuOTA1NzkzLDAuNzMxNzksMi45OTY3MjhdLFszLjUzMDM5NiwzLjQyNjIzMywyLjM1NjU4M10sWzIuMTIyOTksMC42MjQ5MzMsMi45MjkxNjddLFstMi4wNjkxOTYsNi4wMzkyODQsMi4wMTI1MV0sWy0zLjU2NTYyMyw3LjE4MjUyNSwyLjg1MDAzOV0sWzIuOTU5MjY0LDIuMzc2MzM3LDIuODI5MjQyXSxbMi45NDkwNzEsMS44MjI0ODMsMi43OTM5MzNdLFs0LjAzNjE0MiwwLjc2MzgwMywxLjcwMzc0NF0sWy0xLjk5MzUyNyw2LjE4MDMxOCwxLjgwNDkzNl0sWy0wLjAzMDk4NywwLjc2NjM4OSwzLjM0NDc2Nl0sWy0wLjU0OTY4Myw4LjIyNTE5MywtMC4xODkzNDFdLFstMC43NjU0NjksOC4yNzIyNDYsLTAuMTI3MTc0XSxbLTIuOTQ3MDQ3LDcuNTQxNjQ4LC0wLjQxNDExM10sWy0zLjA1MDMyNyw5LjEwMTE0LC0zLjQzNTYxOV0sWzMuNDg4NTY2LDIuMjMxODA3LDIuMzk5ODM2XSxbMy4zNTIyODMsNC43Mjc4NTEsMS45NDY0MzhdLFs0Ljc0MTAxMSwyLjE2Mjc3MywxLjQ5OTU3NF0sWy0xLjgxNTA5Myw2LjA3MjA3OSwxLjU4MDcyMl0sWy0zLjcyMDk2OSw4LjI2NzkyNywtMC45ODQ3MTNdLFsxLjkzMjgyNiwzLjcxNDA1MiwzLjQyNzQ4OF0sWzMuMzIzNjE3LDQuNDM4OTYxLDIuMjA3MzJdLFswLjI1NDExMSw5LjI2MzY0LC0xLjM3MzI0NF0sWy0xLjQ5MzM4NCw3Ljg2ODU4NSwtMC40NTAwNTFdLFstMC44NDE5MDEsMC43NzYxMzUsLTEuNjE5NDY3XSxbMC4yNDM1MzcsNi4wMjc2NjgsMC4wOTE2ODddLFswLjMwMzA1NywwLjMxMzAyMiwtMC41MzExMDVdLFstMC40MzUyNzMsMC40NzQwOTgsMy40ODE1NTJdLFsyLjEyMTUwNywyLjYyMjM4OSwzLjQ4NjI5M10sWzEuOTYxOTQsMS4xMDE3NTMsMy4xNTk1ODRdLFszLjkzNzk5MSwzLjQwNzU1MSwxLjU1MTM5Ml0sWzAuMDcwOTA2LDAuMjk1NzUzLDEuMzc3MTg1XSxbLTEuOTM1ODgsNy42MzE3NjQsMC42NTE2NzRdLFstMi41MjM1MzEsMC43NDQ4MTgsLTAuMzA5ODVdLFsyLjg5MTQ5NiwzLjMxOTg3NSwyLjk4MzA3OV0sWzQuNzgxNzY1LDEuNTQ3MDYxLDEuNTIzMTI5XSxbLTIuMjU2MDY0LDcuNTcxMjUxLDAuOTczNzE2XSxbMy4yNDQ4NjEsMy4wNTgyNDksMi43MjQzOTJdLFstMC4xNDU4NTUsMC40Mzc3NzUsMy40MzM2NjJdLFsxLjU4NjI5Niw1LjY1ODUzOCwyLjM1ODQ4N10sWzMuNjU4MzM2LDMuNzc0OTIxLDIuMDcxODM3XSxbMi44NDA0NjMsNC44MTcwOTgsMi40NjM3Nl0sWy0xLjIxOTQ2NCw4LjEyMjU0MiwtMC42NzI4MDhdLFstMi41MjA5MDYsMi42NjQ0ODYsLTEuMDM0MzQ2XSxbLTEuMzE1NDE3LDguNDcxMzY1LC0wLjcwOTU1N10sWzMuNDI5MTY1LDMuNzQ2ODYsMi40NDYxNjldLFszLjA3NDU3OSwzLjg0MDc1OCwyLjc2NzQwOV0sWzMuNTY5NDQzLDMuMTY2MzM3LDIuMzMzNjQ3XSxbMi4yOTQzMzcsMy4yODAwNTEsMy4zNTkzNDZdLFsyLjIxODE2LDMuNjY1NzgsMy4yNjkyMjJdLFsyLjE1ODY2Miw0LjE1MTQ0NCwtMS4zNTc5MTldLFsxLjEzODYyLDQuMzgwOTg2LC0xLjQwNDU2NV0sWzMuMzg4MzgyLDIuNzQ5OTMxLC0wLjg0MDk0OV0sWzMuMDU5ODkyLDUuMDg0ODQ4LDIuMDI2MDY2XSxbMy4yMDQ3MzksMi4wNzUxNDUsMi42NDA3MDZdLFszLjM4NzA2NSwxLjQyNjE3LDIuMzA1Mjc1XSxbMy45MTAzOTgsMi42NzA3NDIsMS43NTAxNzldLFszLjQ3MTUxMiwxLjk0NTgyMSwyLjM5NTg4MV0sWzQuMDgwODIsMS4wNzA2NTQsMS45NjAxNzFdLFstMS4wNTc4NjEsMC4xMzMwMzYsMi4xNDY3MDddLFstMC4xNTE3NDksNS41MzU1MSwtMC42MjQzMjNdLFszLjIzMzA5OSw0LjAwMzc3OCwyLjU3MTE3Ml0sWzIuNjExNzI2LDUuMzE5MTk5LC0wLjQ5OTM4OF0sWzIuNjgyOTA5LDEuMDk0NDk5LC0xLjIwNjI0N10sWy0xLjIyODIzLDcuNjU2ODg3LDAuMDQxNDA5XSxbLTIuMjkzMjQ3LDcuMjU5MTg5LDAuMDEzODQ0XSxbMC4wODEzMTUsMC4yMDIxNzQsMy4yODYzODFdLFstMS4wMDIwMzgsNS43OTQ0NTQsLTAuMTg3MTk0XSxbMy40NDg4NTYsNC4wODA5MSwyLjI1ODMyNV0sWzAuMjg3ODgzLDkuMDA2ODg4LC0xLjU1MDY0MV0sWy0zLjg1MTAxOSw0LjA1OTgzOSwtMC42NDY5MjJdLFszLjYxMDk2Niw0LjIwNTQzOCwxLjkxMzEyOV0sWzIuMjM5MDQyLDIuOTUwODcyLDMuNDQ5OTU5XSxbMC4yMTYzMDUsMC40NDI4NDMsMy4zMjgwNTJdLFsxLjg3MTQxLDIuNDcwNzQ1LDMuNTc0NTU5XSxbMy44MTEzNzgsMi43Njg3MTgsLTAuMjI4MzY0XSxbMi41MTEwODEsMS4zNjI3MjQsMi45NjkzNDldLFstMS41OTgxMyw3Ljg2NjUwNiwwLjQ0MDE4NF0sWy0zLjMwNzk3NSwyLjg1MTA3MiwtMC44OTQ5NzhdLFstMC4xMDcwMTEsOC45MDU3MywtMC44ODQzOTldLFstMy44NTUzMTUsMi44NDI1OTcsLTAuNDM0NTQxXSxbMi41MTc4NTMsMS4wOTA3NjgsMi43OTk2ODddLFszLjc5MTcwOSwyLjM2Njg1LDIuMDAyNzAzXSxbNC4wNjI5NCwyLjc3MzkyMiwwLjQ1MjcyM10sWy0yLjk3MzI4OSw3LjYxNzAzLC0wLjYyMzY1M10sWy0yLjk1NTA5LDguOTI0NDYyLC0zLjQ0NjMxOV0sWzIuODYxNDAyLDAuNTYyNTkyLDIuMTg0Mzk3XSxbLTEuMTA5NzI1LDguNTk0MjA2LC0wLjA3NjgxMl0sWy0wLjcyNTcyMiw3LjkyNDQ4NSwtMC4zODExMzNdLFstMS40ODU1ODcsMS4zMjk5OTQsLTAuNjU0NDA1XSxbLTQuMzQyMTEzLDMuMjMzNzM1LDEuNzUyOTIyXSxbLTIuOTY4MDQ5LDcuOTU1NTE5LC0yLjA5NDA1XSxbLTMuMTMwOTQ4LDAuNDQ2MTk2LDAuODUyODddLFstNC45NTg0NzUsNS43NTczMjksMS40NDcwNTVdLFstMy4wODY1NDcsNy42MTUxOTMsLTEuOTUzMTY4XSxbLTMuNzUxOTIzLDUuNDEyODIxLDMuMzczMzczXSxbLTQuNTk5NjQ1LDcuNDgwOTUzLDEuNjc3MTM0XSxbMS4xMzM5OTIsMC4yNzQ4NzEsMC4wMzIyNDldLFstMi45NTY1MTIsOC4xMjY5MDUsLTEuNzg1NDYxXSxbLTAuOTYwNjQ1LDQuNzMwNjUsLTEuMTkxNzg2XSxbLTIuODcxMDY0LDAuODc1NTU5LDAuNDI0ODgxXSxbLTQuOTMyMTE0LDUuOTk2MTQsMS40ODM4NDVdLFstMi45ODE3NjEsOC4xMjQ2MTIsLTEuMzg3Mjc2XSxbMC4zNjIyOTgsOC45Nzg1NDUsLTEuMzY4MDI0XSxbLTQuNDA4Mzc1LDMuMDQ2MjcxLDAuNjAyMzczXSxbMi44NjU4NDEsMi4zMjIyNjMsLTEuMzQ0NjI1XSxbLTQuNzg0OCw1LjYyMDg5NSwwLjU5NDQzMl0sWy0yLjg4MzIyLDAuMzM4OTMxLDEuNjcyMzFdLFstNC42ODgxMDEsNi43NzI5MzEsMS44NzIzMThdLFstNC45MDM5NDgsNi4xNjQ2OTgsMS4yNzEzNV0sWzIuODU2NjMsMS4wMDU2NDcsLTAuOTA2ODQzXSxbMi42OTEyODYsMC4yMDk4MTEsMC4wNTA1MTJdLFstNC42OTM2MzYsNi40Nzc1NTYsMC42NjU3OTZdLFstNC40NzIzMzEsNi44NjEwNjcsMC40NzczMThdLFswLjg4MzA2NSwwLjIwNDkwNywzLjA3MzkzM10sWy0wLjk5NTg2Nyw4LjA0ODcyOSwtMC42NTM4OTddLFstMC43OTQ2NjMsNS42NzAzOTcsLTAuMzkwMTE5XSxbMy4zMTMxNTMsMS42MzgwMDYsLTAuNzIyMjg5XSxbLTQuODU2NDU5LDUuMzk0NzU4LDEuMDMyNTkxXSxbLTMuMDA1NDQ4LDcuNzgzMDIzLC0wLjgxOTY0MV0sWzMuMTE4OTEsMi4wMzY5NzQsLTEuMDg2ODldLFstMi4zNjQzMTksMi40MDg0MTksMi42MzQxOV0sWy0yLjkyNzEzMiw4Ljc1NDM1LC0zLjUzNzE1OV0sWy0zLjI5NjIyMiw3Ljk2NDYyOSwtMy4xMzQ2MjVdLFstMS42NDIwNDEsNC4xMzQxNywtMS4zMDE2NjVdLFsyLjAzMDc1OSwwLjE3NjM3MiwtMS4wMzA5MjNdLFstNC41NTkwNjksMy43NTEwNTMsMC41NDg0NTNdLFszLjQzODM4NSw0LjU5NDU0LC0wLjI0MzIxNV0sWy0yLjU2MTc2OSw3LjkzOTM1LDAuMTc3Njk2XSxbMi45OTA1OTMsMS4zMzUzMTQsLTAuOTQzMTc3XSxbMS4yODA4LDAuMjc2Mzk2LC0wLjQ5MDcyXSxbLTAuMzE4ODg5LDAuMjkwNjg0LDAuMjExMTQzXSxbMy41NDYxNCwzLjM0MjYzNSwtMC43Njc4NzhdLFstMy4wNzMzNzIsNy43ODAwMTgsLTIuMzU3ODA3XSxbLTQuNDU1Mzg4LDQuMzg3MjQ1LDAuMzYxMDM4XSxbLTQuNjU5MzkzLDYuMjc2MDY0LDIuNzY3MDE0XSxbMC42MzY3OTksNC40ODIyMjMsLTEuNDI2Mjg0XSxbLTIuOTg3NjgxLDguMDcyOTY5LC0yLjQ1MjQ1XSxbLTIuNjEwNDQ1LDAuNzYzNTU0LDEuNzkyMDU0XSxbMy4zNTgyNDEsMi4wMDY3MDcsLTAuODAyOTczXSxbLTAuNDk4MzQ3LDAuMjUxNTk0LDAuOTYyODg1XSxbMy4xMzIyLDAuNjgzMzEyLDIuMDM4Nzc3XSxbLTQuMzg5ODAxLDcuNDkzNzc2LDAuNjkwMjQ3XSxbMC40MzE0NjcsNC4yMjExOSwtMS42MTQyMTVdLFstNC4zNzYxODEsMy4yMTMxNDEsMC4yNzMyNTVdLFstNC44NzIzMTksNS43MTU2NDUsMC44Mjk3MTRdLFstNC44MjY4OTMsNi4xOTUzMzQsMC44NDk5MTJdLFszLjUxNjU2MiwyLjIzNzMyLC0wLjY3NzU5N10sWzMuMTMxNjU2LDEuNjk4ODQxLC0wLjk3NTc2MV0sWy00Ljc1NDkyNSw1LjQxMTY2NiwxLjk4OTMwM10sWy0yLjk4NzI5OSw3LjMyMDc2NSwtMC42Mjk0NzldLFstMy43NTc2MzUsMy4yNzQ4NjIsLTAuNzQ0MDIyXSxbMy40ODcwNDQsMi41NDE5OTksLTAuNjk5OTMzXSxbLTQuNTMyNzQsNC42NDk1MDUsMC43NzA5M10sWy0xLjQyNDE5MiwwLjA5OTQyMywyLjYzMzMyN10sWzMuMDkwODY3LDIuNDc2OTc1LC0xLjE0Njk1N10sWy0yLjcxMzI1NiwwLjgxNTYyMiwyLjE3MzExXSxbMy4zNDgxMjEsMy4yNTQxNjcsLTAuOTg0ODk2XSxbLTMuMDMxMzc5LDAuMTY0NTMsLTAuMzA5OTM3XSxbLTAuOTQ5NzU3LDQuNTE4MTM3LC0xLjMwOTE3Ml0sWy0wLjg4OTUwOSwwLjA5NTI1NiwxLjI4ODgwM10sWzMuNTM5NTk0LDEuOTY2MTA1LC0wLjU1Mzk2NV0sWy00LjYwNjEyLDcuMTI3NzQ5LDAuODExOTU4XSxbLTIuMzMyOTUzLDEuNDQ0NzEzLDEuNjI0NTQ4XSxbMy4xMzYyOTMsMi45NTgwNSwtMS4xMzgyNzJdLFszLjU0MDgwOCwzLjA2OTA1OCwtMC43MzUyODVdLFszLjY3ODg1MiwyLjM2MjM3NSwtMC40NTI1NDNdLFstNC42NDg4OTgsNy4zNzQzOCwwLjk1NDc5MV0sWy0wLjY0Njg3MSwwLjE5MDM3LDMuMzQ0NzQ2XSxbMi4yODI1LDAuMjkzNDMsLTAuODI2MjczXSxbLTQuNDIyMjkxLDcuMTgzOTU5LDAuNTU3NTE3XSxbLTQuNjk0NjY4LDUuMjQ2MTAzLDIuNTQxNzY4XSxbLTQuNTgzNjkxLDQuMTQ1NDg2LDAuNjAwMjA3XSxbLTIuOTM0ODU0LDcuOTEyNTEzLC0xLjUzOTI2OV0sWy0zLjA2Nzg2MSw3LjgxNzQ3MiwtMC41NDY1MDFdLFszLjgyNTA5NSwzLjIyOTUxMiwtMC4yMzc1NDddLFsyLjUzMjQ5NCwwLjMyMzA1OSwyLjM4NzEwNV0sWy0yLjUxNDU4MywwLjY5Mjg1NywxLjIzNTk3XSxbLTQuNzM2ODA1LDcuMjE0Mzg0LDEuMjU5NDIxXSxbLTIuOTgwNzEsOC40MDk5MDMsLTIuNDY4MTk5XSxbMi42MjE0NjgsMS4zODU4NDQsLTEuNDA2MzU1XSxbMy44MTE0NDcsMy41NjA4NTUsMS44NDc4MjhdLFszLjQzMjkyNSwxLjQ5NzIwNSwtMC40ODk3ODRdLFszLjc0NjYwOSwzLjYzMTUzOCwtMC4zOTA2N10sWzMuNTk0OTA5LDIuODMyMjU3LC0wLjU3NjAxMl0sWy0wLjQwNDE5Miw1LjMwMDE4OCwtMC44NTY1NjFdLFstNC43NjI5OTYsNi40ODM3NzQsMS43MDI2NDhdLFstNC43NTY2MTIsNi43ODYyMjMsMS40MzY4Ml0sWy0yLjk2NTMwOSw4LjQzNzIxNywtMi43ODU0OTVdLFsyLjg2Mzg2NywwLjc0MDg3LC0wLjQyOTY4NF0sWzQuMDI1MDMsMi45Njg3NTMsMS4zOTI0MTldLFszLjY2OTAzNiwxLjgzMzg1OCwtMC4zMDQ5NzFdLFstMi44ODg4NjQsMC43MjA1MzcsMC43NzgwNTddLFstMi4zNjk4MiwwLjk3OTQ0MywxLjA1NDQ0N10sWy0yLjk1OTI1OSw4LjIyMjMwMywtMi42NTk3MjRdLFstMy40Njc4MjUsNy41NDU3MzksLTIuMzMzNDQ1XSxbMi4xNTM0MjYsMC40NDYyNTYsLTEuMjA1MjNdLFstMy4yMjk4MDcsOS4xODk2OTksLTMuNTk2NjA5XSxbLTMuNzI0ODYsOC43NzM3MDcsLTIuMDQ2NjcxXSxbMy42ODcyMTgsMy4yOTc3NTEsLTAuNTIzNzQ2XSxbMS4zODEwMjUsMC4wODgxNSwtMS4xODU2NjhdLFstMi43OTY4MjgsNy4yMDU2MjIsLTAuMjA4NzgzXSxbMy42NDcxOTQsNC4wNjYyMzIsLTAuMjkxNTA3XSxbLTQuNTc4Mzc2LDMuODg1NTU2LDEuNTI1NDZdLFstMi44NDAyNjIsMC42MzA5NCwxLjg5NDk5XSxbLTIuNDI5NTE0LDAuOTIyMTE4LDEuODIwNzgxXSxbLTQuNjc1MDc5LDYuNTczOTI1LDIuNDIzMzYzXSxbMi44MDYyMDcsNC4zMjAxODgsLTEuMDI3MzcyXSxbLTEuMjg5NjA4LDAuMDk3MjQxLDEuMzIxNjYxXSxbLTMuMDEwNzMxLDguMTQxMzM0LC0yLjg2NjE0OF0sWzMuMjAyMjkxLDEuMjM1NjE3LC0wLjU0OTAyNV0sWzQuMDk0NzkyLDIuNDc3NTE5LDAuMzA0NTgxXSxbMi45NDg0MDMsMC45NjY4NzMsLTAuNjY0ODU3XSxbLTQuODMyOTcsNS45MjA1ODcsMi4wOTU0NjFdLFstMi4xNjk2OTMsNy4yNTcyNzcsMC45NDYxODRdLFstMS4zMzU4MDcsMy4wNTc1OTcsLTEuMzAzMTY2XSxbLTEuMDM3ODc3LDAuNjQxNTEsLTEuNjg1MjcxXSxbMi42Mjc5MTksMC4wODk4MTQsMC40MzkwNzRdLFszLjgxNTc5NCwzLjgwODEwMiwxLjczMDQ5M10sWy0yLjk3MzQ1NSw4LjQzMzE0MSwtMy4wODg3Ml0sWy0yLjM5MTU1OCw3LjMzMTQyOCwxLjY1ODI2NF0sWy00LjMzMzEwNyw0LjUyOTk3OCwxLjg1MDUxNl0sWy00LjY0MDI5MywzLjc2NzEwNywxLjE2ODg0MV0sWzMuNjAwNzE2LDQuNDY5MzEsMS43MzQwMjRdLFszLjg4MDgwMywxLjczMDE1OCwtMC4xNzI3MzZdLFszLjgxNDE4Myw0LjI2MjM3MiwxLjE2NzA0Ml0sWzQuMzczMjUsMC44Mjk1NDIsMS40MTM3MjldLFsyLjQ5MDQ0Nyw1Ljc1MTExLDAuMDExNDkyXSxbMy40NjAwMDMsNC45NjI0MzYsMS4xODg5NzFdLFszLjkxODQxOSwzLjgxNDIzNCwxLjM1ODI3MV0sWy0wLjgwNzU5NSw4Ljg0MDUwNCwtMC45NTM3MTFdLFszLjc1Mjg1NSw0LjIwNTc3LDEuNTcxNzddLFstMi45OTEwODUsOC44MTY1MDEsLTMuMjQ0NTk1XSxbLTIuMzMzMTk2LDcuMTI4ODg5LDEuNTUxOTg1XSxbMy45Nzc3MTgsMy41NzA5NDEsMS4yNTkzN10sWzQuMzYwMDcxLDAuNzU1NTc5LDEuMDc5OTE2XSxbNC42Mzc1NzksMS4wMjc5NzMsMS4wMzI1NjddLFstMi4zMTcsNy40MjEwNjYsMS4zMjk1ODldLFstMS4wMTM0MDQsOC4yOTM2NjIsLTAuNzgyM10sWzQuNTQ4MDIzLDEuMDIwNjQ0LDEuNDIwNDYyXSxbNC43NjMyNTgsMS4yNjY3OTgsMS4yOTYyMDNdLFs0Ljg5NiwyLjA3MzA4NCwxLjI1NTIxM10sWzQuMDE1MDA1LDMuMzI1MjI2LDEuMDkzODc5XSxbNC45NDg4NSwxLjg2MDkzNiwwLjg5NDQ2M10sWy0yLjE4OTY0NSw2Ljk1NDYzNCwxLjI3MDA3N10sWzQuODg3NDQyLDEuNzIwOTkyLDEuMjg4NTI2XSxbLTMuMTg0MDY4LDcuODcxODAyLDAuOTU2MTg5XSxbLTEuMjc0MzE4LDAuODM5ODg3LC0xLjIyNDM4OV0sWy0yLjkxOTUyMSw3Ljg0NDMyLDAuNTQxNjI5XSxbLTIuOTk0NTg2LDcuNzY2MTAyLDEuOTY4NjddLFstMy40MTc1MDQsOS4yNDE3MTQsLTMuMDkzMjAxXSxbLTMuMTc0NTYzLDcuNDY2NDU2LDIuNDczNjE3XSxbLTMuMjYzMDY3LDkuMDY5NDEyLC0zLjAwMzQ1OV0sWy0yLjg0MTU5MiwwLjUyOTgzMywyLjY5MzQzNF0sWy0zLjYxMTA2OSw5LjE1ODgwNCwtMi44Mjk4NzFdLFstNC42NDI4MjgsNS45Mjc1MjYsMC4zMjA1NDldLFstMy44MDkzMDgsOS4wNTEwMzUsLTIuNjkyNzQ5XSxbLTIuODM3NTgyLDcuNDg3OTg3LC0wLjEwNjIwNl0sWzQuNzczMDI1LDIuMzMwNDQyLDEuMjEzODk5XSxbNC44OTc0MzUsMi4yMDk5MDYsMC45NjY2NTddLFstMy4wNjc2MzcsOC4xNjQwNjIsLTEuMTI2NjFdLFstMy4xMjIxMjksOC4wODA3NCwtMC44OTkxOTRdLFs0LjU3MTAxOSwyLjM1ODExMywxLjQ2MjA1NF0sWzQuNTg0ODg0LDIuNDU0NDE4LDAuNzA5NDY2XSxbLTMuNjYxMDkzLDcuMTQ2NTgxLC0wLjQ3NTk0OF0sWzQuNzM1MTMxLDIuNDE1ODU5LDAuOTMzOTM5XSxbNC4yMDc1NTYsMi41NDAwMTgsMS4yMTgyOTNdLFstMy42MDc1OTUsNy44OTE2MSwtMC4xMjExNzJdLFstMS41Mjc5NTIsMC43NzU1NjQsLTEuMDYxOTAzXSxbNC41Mzg3NCwyLjUwMzI3MywxLjA5OTU4M10sWy0zLjkzODgzNyw3LjU4Nzk4OCwwLjA4MjQ0OV0sWy00Ljg1MzU4Miw2LjE1MjQwOSwxLjc4Nzk0M10sWy00Ljc1MjIxNCw2LjI0NzIzNCwyLjI5Njg3M10sWzQuNjAyOTM1LDIuMzYzOTU1LDAuNDg4OTAxXSxbLTEuODE2MzgsNi4zNjU4NzksMC44NjgyNzJdLFswLjU5NTQ2Nyw0Ljc0NDA3NCwtMS4zMjQ4M10sWzEuODc2MzUsMy41MTE5ODYsLTEuODQyOTI0XSxbNC4zMzA5NDcsMi41MzQzMjYsMC43MjA1MDNdLFs0LjEwODczNiwyLjc1MDgwNSwwLjkwNDU1Ml0sWy0xLjg5MDkzOSw4LjQ5MjYyOCwtMC4yOTA3NjhdLFstMy41MDQzMDksNi4xNzMwNTgsLTAuNDIyODA0XSxbLTEuNjExOTkyLDYuMTk2NzMyLDAuNjQ4NzM2XSxbLTMuODk5MTQ5LDcuODI2MTIzLDEuMDg4ODQ1XSxbLTMuMDc4MzAzLDMuMDA4ODEzLC0xLjAzNTc4NF0sWy0yLjc5ODk5OSw3Ljg0NDg5OSwxLjM0MDA2MV0sWy0xLjI0ODgzOSw1Ljk1OTEwNSwwLjA0MTc2MV0sWzAuNzY3Nzc5LDQuMzM3MzE4LDMuMDkwODE3XSxbLTMuODMxMTc3LDcuNTE1NjA1LDIuNDMyMjYxXSxbLTEuNjY3NTI4LDYuMTU2MjA4LDAuMzY1MjY3XSxbLTEuNzI2MDc4LDYuMjM3Mzg0LDEuMTAwMDU5XSxbLTMuOTcyMDM3LDQuNTIwODMyLC0wLjM3MDc1Nl0sWy00LjQwNDQ5LDcuNjM2MzU3LDEuNTIwNDI1XSxbLTEuMzQ1MDYsNi4wMDQwNTQsMS4yOTMxNTldLFstMS4yMzM1NTYsNi4wNDk5MzMsMC41MDA2NTFdLFstMy42OTY4NjksNy43OTczMiwwLjM3OTc5XSxbLTMuMzA3Nzk4LDguOTQ5OTY0LC0yLjY5ODExM10sWy0xLjk5NzI5NSw2LjYxNTA1NiwxLjEwMzY5MV0sWy0zLjIxOTIyMiw4LjMzNjM5NCwtMS4xNTA2MTRdLFstMy40NTI2MjMsOC4zMTg2NiwtMC45NDE3XSxbLTMuOTQ2NDEsMi45OTA0OTQsMi4yMTI1OTJdLFstMy4yNTAwMjUsOC4wMzA0MTQsLTAuNTk2MDk3XSxbLTIuMDIzNzUsMS41NzEzMzMsMi4zOTc5MzldLFstMy4xOTAzNTgsNy42NjUwMTMsMi4yNjgxODNdLFstMi44MTE5MTgsNy42MTg1MjYsMi4xNDU1ODddLFstMS4wMDUyNjUsNS44OTIzMDMsMC4wNzIxNThdLFstMC45MzcyMSw1Ljk3NDE0OCwwLjkwNjY2OV0sWy00LjY0NjA3Miw3LjQ5MjE5MywxLjQ1MzEyXSxbLTAuMjUyOTMxLDEuNzk3NjU0LDMuMTQwNjM4XSxbLTEuMDc2MDY0LDUuNzM4NDMzLDEuNjk1OTUzXSxbLTMuOTgwNTM0LDcuNzQ0MzkxLDEuNzM1NzkxXSxbLTAuNzIxMTg3LDUuOTM5Mzk2LDAuNTI2MDMyXSxbLTAuNDI4MTgsNS45MTk3NTUsMC4yMjkwMDFdLFstMS40MzQyOSw2LjExNjIyLDAuOTM4NjNdLFstMC45ODU2MzgsNS45Mzk2ODMsMC4yOTA2MzZdLFstNC40MzM4MzYsNy40NjEzNzIsMS45NjY0MzddLFstMy42OTYzOTgsNy44NDQ4NTksMS41NDczMjVdLFstMy4zOTA3NzIsNy44MjAxODYsMS44MTIyMDRdLFstMi45MTY3ODcsNy44NjQwMTksMC44MDQzNDFdLFstMy43MTU5NTIsOC4wMzcyNjksLTAuNTkxMzQxXSxbLTQuMjA0NjM0LDcuNzI5MTksMS4xMTk4NjZdLFstNC41OTIyMzMsNS41OTI4ODMsMC4yNDYyNjRdLFszLjMwNzI5OSw1LjA2MTcwMSwxLjYyMjkxN10sWy0zLjUxNTE1OSw3LjYwMTQ2NywyLjM2ODkxNF0sWy0zLjQzNTc0Miw4LjUzMzQ1NywtMS4zNzkxNl0sWy0wLjI2OTQyMSw0LjU0NTYzNSwtMS4zNjY0NDVdLFstMi41NDIxMjQsMy43Njg3MzYsLTEuMjU4NTEyXSxbLTMuMDM0MDAzLDcuODczNzczLDEuMjU2ODU0XSxbLTIuODAxMzk5LDcuODU2MDI4LDEuMDgwMTM3XSxbMy4yOTM1NCw1LjIyMDg5NCwxLjA4MTc2N10sWy0yLjM1MTA5LDEuMjk5NDg2LDEuMDEyMDZdLFstMy4yMzIyMTMsNy43NjgxMzYsMi4wNDc1NjNdLFszLjI5MDQxNSw1LjIxNzUyNSwwLjY4MDE5XSxbLTMuNDE1MTA5LDcuNzMxMDM0LDIuMTQ0MzI2XSxbMy40NDAzNTcsNC45NjI0NjMsMC4zNzMzODddLFszLjE0NzM0Niw1LjM1MjEyMSwxLjM4NjkyM10sWzIuODQ3MjUyLDUuNDY5MDUxLDEuODMxOTgxXSxbMy4xMzc2ODIsNS40MTAyMjIsMS4wNTAxODhdLFszLjEwMjY5NCw1LjMxMDQ1NiwxLjY3NjQzNF0sWy0zLjA0NDYwMSwwLjM5NTE1LDEuOTk0MDg0XSxbMi45MDM2NDcsNS41NjEzMzgsMS41MTg1OThdLFstMy44MTAxNDgsOC4wOTM1OTgsLTAuODg5MTMxXSxbNC4yMzQ4MzUsMC44MDMwNTQsMS41OTMyNzFdLFszLjI0MDE2NSw1LjIyODc0NywwLjMyNTk1NV0sWzMuMDM3NDUyLDUuNTA5ODI1LDAuODE3MTM3XSxbMi42MzUwMzEsNS43OTUxODcsMS40Mzk3MjRdLFszLjA3MTYwNyw1LjMxODMwMywwLjA4MDE0Ml0sWzIuOTA5MTY3LDUuNjExNzUxLDEuMTU1ODc0XSxbMy4wNDQ4ODksNS40NjU5MjgsMC40ODY1NjZdLFsyLjUwMjI1Niw1Ljc3MDY3MywxLjc0MDA1NF0sWy0wLjA2NzQ5NywwLjA4NjQxNiwtMS4xOTAyMzldLFsyLjMzMzI2LDUuOTA2MDUxLDAuMTM4Mjk1XSxbMC42NTA5Niw0LjIwNTQyMywzLjMwODc2N10sWy0yLjY3MTEzNyw3LjkzNjUzNSwwLjQzMjczMV0sWzIuMTQ0NjMsNS44NzkyMTQsMS44NjYwNDddLFstNC43NzY0NjksNS44OTA2ODksMC41NjE5ODZdLFsyLjcyNDMyLDUuNjU1MTQ1LDAuMjExOTUxXSxbMi43MzA0ODgsNS43NTE0NTUsMC42OTU4OTRdLFsyLjU3MjY4Miw1Ljg2OTI5NSwxLjE1MjY2M10sWzEuOTA2Nzc2LDUuNzM5MTIzLDIuMTk2NTUxXSxbMi4zNDQ0MTQsNS45OTk5NjEsMC43NzI5MjJdLFstMy4zNzc5MDUsNy40NDg3MDgsLTEuODYzMjUxXSxbMi4yODUxNDksNS45NjgxNTYsMS40NTkyNThdLFsyLjM4NTk4OSw1LjkyODk3NCwwLjM2ODldLFsyLjE5MjExMSw2LjA4NzUxNiwwLjk1OTkwMV0sWzIuMzYzNzIsNi4wMDExMDEsMS4wNzQzNDZdLFsxLjk3MjAyMiw2LjA3OTYwMywxLjU5MTE3NV0sWzEuODc2MTUsNS45NzY2OTgsMS45MTU1NF0sWy0zLjgyNDc2MSw5LjA1MzcyLC0yLjkyODYxNV0sWzIuMDQ0NzA0LDYuMTI5NzA0LDEuMjYzMTExXSxbLTIuNTgzMDQ2LDAuODQ5NTM3LDIuNDk3MzQ0XSxbLTAuMDc4ODI1LDIuMzQyMjA1LDMuNTIwMzIyXSxbLTAuNzA0Njg2LDAuNTM3MTY1LDMuMzk3MTk0XSxbLTAuMjU3NDQ5LDMuMjM1MzM0LDMuNjQ3NTQ1XSxbLTAuMzMyMDY0LDEuNDQ4Mjg0LDMuMDIyNTgzXSxbLTIuMjAwMTQ2LDAuODk4Mjg0LC0wLjQ0NzIxMl0sWy0yLjQ5NzUwOCwxLjc0NTQ0NiwxLjgyOTE2N10sWzAuMzA3MDIsNC40MTYzMTUsMi45Nzg5NTZdLFstMy4yMDUxOTcsMy40NzkzMDcsLTEuMDQwNTgyXSxbMC4xMTAwNjksOS4zNDc3MjUsLTEuNTYzNjg2XSxbLTAuODI3NTQsMC44ODM4ODYsMy4wNjU4MzhdLFstMi4wMTcxMDMsMS4yNDQ3ODUsMi40MjUxMl0sWy0wLjQyMTA5MSwyLjMwOTkyOSwzLjE1Mzg5OF0sWy0wLjQ5MTYwNCwzLjc5NjA3MiwzLjE2MjQ1XSxbMi43ODY5NTUsMy41MDEyNDEsLTEuMzQwMjE0XSxbLTMuMjI5MDU1LDQuMzgwNzEzLC0wLjg5OTI0MV0sWzMuNzMwNzY4LDAuNzY4NDUsMS45MDMxMl0sWy0wLjU2MTA3OSwyLjY1MjM4MiwzLjE1MjQ2M10sWy0zLjQ2MTQ3MSwzLjA4NjQ5NiwyLjY2MjUwNV0sWy0wLjY2MTQwNSwzLjQ0NjAwOSwzLjE3OTkzOV0sWy0wLjkxNTM1MSwwLjYzNjc1NSwzLjI0MzcwOF0sWy0yLjk5Mjk2NCw4LjkxNTYyOCwtMy43Mjk4MzNdLFstMC40Mzk2MjcsMy41MDIxMDQsMy40MjY2NV0sWy0xLjE1NDIxNywwLjg4MzE4MSwyLjgwMDgzNV0sWy0xLjczNjE5MywxLjQ2NTQ3NCwyLjU5NTQ4OV0sWy0wLjQyMzkyOCwzLjI0NDM1LDMuNTQ4Mjc3XSxbLTAuNTExMTUzLDIuODcxMDQ2LDMuMzc5NzQ5XSxbLTAuNjc1NzIyLDIuOTkxNzU2LDMuMTQzMjYyXSxbLTEuMDkyNjAyLDAuNTk5MTAzLDMuMDkwNjM5XSxbLTAuODk4MjEsMi44MzY5NTIsMi44NDAwMjNdLFstMi42NTg0MTIsMC43ODEzNzYsMC45NjA1NzVdLFstMi4yNzE0NTUsMS4yMjI4NTcsMS4zMzA0NzhdLFstMC44Nzc4NjEsMS4xMTEyMjIsMi43MjI2M10sWy0wLjMwNjk1OSwyLjg3Njk4NywzLjU1NjA0NF0sWy0zLjgzOTI3NCw3Ljg0MTM4LC0wLjkxODQwNF0sWy0wLjE3MjA5NCw0LjA4Mzc5OSwzLjE0MTcwOF0sWy0xLjU0ODMzMiwwLjI1MjksMi44NjQ2NTVdLFstMC4yMTczNTMsNC44NzM5MTEsLTEuMjIzMTA0XSxbLTMuMzg0MjQyLDMuMTgxMDU2LC0wLjk1NTc5XSxbLTIuNzMxNzA0LDAuMzgyNDIxLDIuODk1NTAyXSxbLTEuMjg1MDM3LDAuNTUxMjY3LDIuOTQ3Njc1XSxbMC4wNzcyMjQsNC4yNDY1NzksMy4wNjY3MzhdLFstMC40Nzk5NzksMS43Nzk1NSwyLjg2MDAxMV0sWy0wLjcxNjM3NSwxLjIyNDY5NCwyLjY2Njc1MV0sWy0wLjU0NjIyLDMuMTM4MjU1LDMuMzkzNDU3XSxbLTIuMzM0MTMsMS44MjEyMjIsMi4xMjQ4ODNdLFstMC41MDY1MywyLjAzNzE0NywyLjg5NzQ2NV0sWzIuNDUxMjkxLDEuMjExMzg5LC0xLjQ2NjU4OV0sWy0zLjE2MDA0NywyLjg5NDA4MSwyLjcyNDI4Nl0sWy00LjEzNzI1OCw1LjQzMzQzMSwzLjIxMjAxXSxbMC40NjI4OTYsMC4zMjA0NTYsLTAuMTc0ODM3XSxbLTAuMzc0NTgsMi42MDk0NDcsMy4zNzkyNTNdLFstMy4wOTUyNDQsMC4yNTYyMDUsMi4xOTY0NDZdLFstNC4xOTc5ODUsNS43MzI5OTEsMy4yNjI5MjRdLFstMC43Mjk3NDcsMC4yNDYwMzYsMC40OTcwMzZdLFstMi4zNTYxODksNS4wNjIsLTAuOTY1NjE5XSxbLTEuNjA5MDM2LDAuMjU5NjIsLTEuNDg3MzY3XSxbLTQuMDc0MzgxLDYuMDc0MDYxLDMuNDA5NDU5XSxbLTMuNjE5MzA0LDQuMDAyMiwyLjY1NzA1XSxbLTAuNTQzMzkzLDguNzQyODk2LC0xLjA1NjYyMl0sWy00LjMwMzU2LDYuODU4OTM0LDIuODc5NjQyXSxbLTAuNzE2Njg4LDIuOTAxODMxLC0yLjExMjAyXSxbMS41NDczNjIsMC4wODMxODksMS4xMzg3NjRdLFstMC4yNTA5MTYsMC4yNzUyNjgsMS4yMDEzNDRdLFstMy43NzgwMzUsMy4xMzYyNCwyLjQ2NjE3N10sWy00LjU5NDMxNiw1Ljc3MTM0MiwzLjAxNjk0XSxbLTMuNzE3NzA2LDMuNDQyODg3LDIuNjAzMzQ0XSxbLTQuMzExMTYzLDUuMjI0NjY5LDMuMDE5MzczXSxbLTAuNjEwMzg5LDIuMDk1MTYxLC0xLjkyMzUxNV0sWy0zLjA0MDA4Niw2LjE5NjkxOCwtMC40MjkxNDldLFstMy44MDI2OTUsMy43NjgyNDcsMi41NDU1MjNdLFstMC4xNTk1NDEsMi4wNDMzNjIsMy4zMjg1NDldLFstMy43NDQzMjksNC4zMTc4NSwyLjQ5MTg4OV0sWy0zLjA0NzkzOSwwLjIxNDE1NSwxLjg3MzYzOV0sWy00LjQxNjg1LDYuMTEzMDU4LDMuMTY2Nzc0XSxbLTEuMTY1MTMzLDAuNDYwNjkyLC0xLjc0MjEzNF0sWy0xLjM3MTI4OSw0LjI0OTk5NiwtMS4zMTc5MzVdLFstMy40NDc4ODMsMC4zNTIxLDAuNDY2MjA1XSxbLTQuNDk1NTU1LDYuNDY1NTQ4LDIuOTQ0MTQ3XSxbLTMuNDU1MzM1LDAuMTcxNjUzLDAuMzkwODE2XSxbLTMuOTY0MDI4LDQuMDE3MTk2LDIuMzc2MDA5XSxbLTEuMzIzNTk1LDEuNzYzMTI2LC0wLjc1MDc3Ml0sWy0zLjk3MTE0Miw1LjI3NzUyNCwtMC4xOTQ5Nl0sWy0zLjIyMjA1MiwwLjIzNzcyMywwLjg3MjIyOV0sWy00LjQwMzc4NCwzLjg5MTA3LDEuODcyMDc3XSxbLTMuMzMzMzExLDAuMzQyOTk3LDAuNjYxMDE2XSxbLTQuNDk1ODcxLDQuMjk2MDYsMS42MzYwOF0sWy0zLjYzNjA4MSwyLjc2MDcxMSwyLjM2MTk0OV0sWy00LjQ4NzIzNSwzLjU1OTYwOCwxLjY2NzM3XSxbLTQuNzE5Nzg3LDcuMjY4ODgsMS42NTg3MjJdLFstMS4wODYxNDMsOS4wMzU3NDEsLTAuNzA3MTQ0XSxbLTIuMzM5NjkzLDEuNjAwNDg1LC0wLjQwNDgxN10sWy00LjY0MjAxMSw3LjEyMzgyOSwxLjk5MDk4N10sWy0xLjQ5ODA3NywzLjg1NDAzNSwtMS4zNjk3ODddLFstNC4xODgzNzIsNC43MjkzNjMsMi4wMjk4M10sWy0zLjExNjM0NCw1Ljg4MjI4NCwtMC40Njg4ODRdLFstNC4zMDUyMzYsNC4yNDY0MTcsMS45NzY5OTFdLFstMy4wMjI1MDksMC4yMjgxOSwxLjA2NTY4OF0sWy0yLjc5OTkxNiwwLjUyMDIyLDEuMTI4MzE5XSxbLTQuMjYyODIzLDMuNTM0NDA5LDIuMDIwMzgzXSxbLTQuMjIxNTMzLDMuOTQ3Njc2LDIuMTE3MzVdLFstMy43NDQzNTMsNC4zOTE3MTIsLTAuNjE5M10sWy0xLjI3MjkwNSwwLjE1NjY5NCwtMS43NDE3NTNdLFstMy42MjQ5MSwyLjY2OTgyNSwtMC41NDk2NjRdLFstNC4xODA3NTYsMy4wOTYxNzksMS45ODcyMTVdLFstNC4wNTkyNzYsNC4zMDUzMTMsMi4yMzI5MjRdLFstMi44MTI3NTMsMC4xODMyMjYsMS4zNzAyNjddLFstNC4wMzI0MzcsMy41MTIyMzQsMi4zMDk5ODVdLFstMC4wMzc4NywwLjI4MTg4LDAuNTMwMzkxXSxbLTQuNzExNTYyLDUuNDY4NjUzLDIuODIyODM4XSxbLTQuNTAwNjM2LDYuOTUzMzE0LDIuNTY0NDQ1XSxbLTQuNDc5NDMzLDcuMjE2OTkxLDIuMjcwNjgyXSxbMy45OTA1NjIsMC41MDUyMiwwLjcxNjMwOV0sWy0yLjUxMjIyOSw2Ljg2MzQ0NywtMC4xMDA2NThdLFstMi45NjgwNTgsNi45NTY2MzksLTAuMzcwNjFdLFsyLjU1MDM3NSwzLjE0MjY4MywtMS41NDA2OF0sWy0yLjMyMDA1OSwzLjUyMTYwNSwtMS4yNzkzOTddLFstNC41NTYzMTksNi42NDY2MiwyLjc0NTM2M10sWy00LjI4MTA5MSw3LjEwODExNiwyLjY2NzU5OF0sWy0yLjA1MDA5NSw4LjQxMTY4OSwwLjEyMTM1M10sWy0yLjQ0ODU0LDEuMTM1NDg3LDAuODUxODc1XSxbMy4xMjE4MTUsMC42OTk5NDMsLTAuMjc3MTY3XSxbLTQuNjk4NzcsNi4wMDM3NiwyLjg0MzAzNV0sWy0xLjM2MDU5OSw4LjgyNDc0MiwtMC41OTU1OTddLFsxLjEyODQzNywwLjE3MTYxMSwwLjMwMTY5MV0sWy00LjM2MDE0Niw2LjI4OTQyMywwLjA0MjIzM10sWzEuNDAwNzk1LDQuMDg4ODI5LC0xLjYyMDQwOV0sWy0zLjE5MzQ2Miw4LjQ2MDEzNywtMy41NTk0NDZdLFstMy4xNjg3NzEsOC44Nzg0MzEsLTMuNjM1Nzk1XSxbLTMuNDM0Mjc1LDkuMzA0MzAyLC0zLjQ2MDg3OF0sWy0zLjM0OTk5Myw4LjgwODA5MywtMy4zODE3OV0sWy0zLjMwNDgyMyw4LjMyMzg2NSwtMy4zMjU5MDVdLFstMy41NzI2MDcsOS4zMDg4NDMsLTMuMjA3NjcyXSxbLTMuMTY2MzkzLDguMjAxMjE1LC0zLjQzMDE0XSxbLTMuNDUxNjM4LDkuMDUzMzEsLTMuMzUxMzQ1XSxbLTMuMzA5NTkxLDguNTQ5NzU4LC0zLjM3NTA1NV0sWy0zLjUyNzk5Miw4Ljc5MzkyNiwtMy4xMDAzNzZdLFstMy42Mjg3LDguOTgxNjc3LC0zLjA3NjMxOV0sWy0zLjQ0NTUwNSw4LjAwMTg4NywtMi44MjczXSxbLTMuNDA4MDExLDguMjIxMDE0LC0zLjAzOTIzN10sWy0zLjY1OTI4LDguNzQwMzgyLC0yLjgwODg1Nl0sWy0zLjg3ODAxOSw4Ljc5NzI5NSwtMi40NjI4NjZdLFstMy41MTUxMzIsOC4yMzIzNDEsLTIuNzQ3NzM5XSxbLTMuNDYwMzMxLDguNTE1MjQsLTMuMDY4MThdLFstMy40MDM3MDMsNy42NTg2MjgsLTIuNjQ4Nzg5XSxbLTMuNTA3MTEzLDguMDAxNTksLTIuNTgyMjc1XSxbLTMuNjA3MzczLDguMTc0NzM3LC0yLjQwMTcyM10sWy0zLjc0OTA0Myw4LjM3ODA4NCwtMi4yMjY5NTldLFstMy42NDg1MTQsOC41MDIyMTMsLTIuNjEzOF0sWy0yLjUzNDE5OSwwLjkwNDc1MywyLjAyMTE0OF0sWzEuNDA4Myw1Ljc0NDI1MiwtMC41NzE0MDJdLFstMy44NTI1MzYsOC41NzEwMDksLTIuMzUyMzU4XSxbMi44NjgyNTUsNS4zNzMxMjYsLTAuMTYzNzA1XSxbMi4yMjQzNjMsNC42Njk4OTEsLTEuMDYxNTg2XSxbLTQuNTI4MjgxLDQuODg1ODM4LDEuMzQwMjc0XSxbMS4zMDgxNyw0LjYwOTYyOSwtMS4yODc2Ml0sWy00LjUxOTY5OCwzLjQyMjUwMSwxLjM1NDgyNl0sWy0zLjU0OTk1NSw3Ljc4MzIyOCwtMi4zMzI4NTldLFsxLjEyMzEzLDYuMTIwODU2LDAuMDQ1MTE1XSxbLTMuNjIwMzI0LDcuNTc3MTYsLTIuMDMzNDIzXSxbLTAuNzk4ODMzLDIuNjI0MTMzLC0xLjk5MjY4Ml0sWy0zLjYxNzU4Nyw3Ljc4MzE0OCwtMi4wNTEzODNdLFstMy42NjkyOTMsOC4xMDM3NzYsLTIuMTAyMjddLFstMy44OTI0MTcsOC42Njc0MzYsLTIuMTY3Mjg4XSxbLTAuNTM3NDM1LDAuMjg1MzQ1LC0wLjE3NjI2N10sWy0wLjg0MTUyMiwzLjI5OTg2NiwtMS44ODc4NjFdLFstMC43NjE1NDcsMy42NDcwODIsLTEuNzk4OTUzXSxbLTMuNjYxNTQ0LDcuODU3MDgsLTEuODY3OTI0XSxbLTMuODg2NzYzLDguNTUxNzgzLC0xLjg4OTE3MV0sWy0wLjU5MTI0NCwxLjU0OTc0OSwtMS43MTQ3ODRdLFstMC43NzUyNzYsMS45MDgyMTgsLTEuNTk3NjA5XSxbLTAuOTYxNDU4LDIuNTczMjczLC0xLjY5NTU0OV0sWy0yLjIxNTY3MiwxLjMzNTAwOSwyLjE0MzAzMV0sWy00LjYyMjY3NCw0LjEzMDI0MiwxLjIyMDY4M10sWzEuMDczNDQsMC4yOTAwOTksMS41ODQ3MzRdLFstMC45NzY5MDYsMi45MjE3MSwtMS43NjY2N10sWy0xLjEzNjk2LDMuMTk0NDAxLC0xLjUxMzQ1NV0sWy0zLjc0MzI2Miw3Ljk5OTQ5LC0xLjYyOTI4Nl0sWy0yLjg3NjM1OSw0LjkwMDk4NiwtMC44Nzk1NTZdLFswLjU1MDgzNSwzLjkwNTU1NywtMi4wMzEzNzJdLFswLjc3NzY0Nyw0Ljk5MjMxNCwtMS4yMTU3MDNdLFsxLjQ0NTg4MSw0LjI2NjIwMSwtMS40MTQ2NjNdLFsxLjI3NDIyMiw1LjUxMDU0MywtMC44MjQ0OTVdLFstMC44NjQ2ODUsMi4zMTg1ODEsLTEuNzAyMzg5XSxbLTAuNjI3NDU4LDMuODIwNzIyLC0xLjc0MzE1M10sWy0zLjg2NzY5OSw4LjMwODY2LC0xLjg1MDA2Nl0sWzEuNjM1Mjg3LDUuNDU1ODcsLTAuODM4NDRdLFstMS4wMzc4NzYsMi41Mzg1ODksLTEuNTEzNTA0XSxbLTQuMzg5OTMsNC43MzkyNiwxLjY5OTYzOV0sWzAuMDQ4NzA5LDQuNzY1MjMyLC0xLjI3OTUwNl0sWy0wLjYyNjU0OCwxLjMzOTg4NywtMS41OTUxMTRdLFstMy42ODI4MjcsNy42NDM0NTMsLTEuNzIzMzk4XSxbLTMuODY4NzgzLDguMTgwMTkxLC0xLjUxMTc0M10sWy0wLjc2OTg4LDEuNTA4MzczLC0xLjQxOTU5OV0sWy0xLjEzODM3NCwyLjc2Njc2NSwtMS40NDgxNjNdLFsxLjY5OTg4Myw1Ljc4MDc1MiwtMC40NzUzNjFdLFsxLjIxNDMwNSwwLjMwODUxNywxLjg2NjQwNV0sWy0xLjcxMzY0MiwwLjM3MzQ2MSwtMS4yNjUyMDRdLFstMS41ODIzODgsMC41ODI5NCwtMS4yNjc5NzddLFstMC44Nzk1NDksMS44MjE1ODEsLTEuMzEzNzg3XSxbMC41MTkwNTcsNS44NTg3NTcsLTAuMzgxMzk3XSxbLTMuNzcwOTg5LDIuNDQ5MjA4LC0wLjEzMjY1NV0sWzAuMDg3NTc2LDAuMTU2NzEzLC0xLjUzNjE2XSxbLTAuOTQyNjIyLDIuMTQ2NTM0LC0xLjQyMTQ5NF0sWy0xLjAyNjE5MiwxLjAyMjE2NCwtMS4xNDU0MjNdLFstMC45NjQwNzksMS42NDU0NzMsLTEuMDY3NjMxXSxbLTEuMTA5MTI4LDIuNDU4Nzg5LC0xLjI5MTA2XSxbLTEuMDM3NDc4LDAuMjA5NDg5LC0xLjgwNTQyNF0sWy0zLjcyNDM5MSw3LjU5OTY4NiwtMS4yNzM0NThdLFstMy43ODc4OTgsNy45NTE3OTIsLTEuMzA0Nzk0XSxbMy44MjE2NzcsMi4xNjU1ODEsLTAuMTgxNTM1XSxbLTIuMzk0NjcsMC4zMDQ2MDYsLTAuNTcwMzc1XSxbLTIuMzUyOTI4LDEuMDQzOSwyLjA3OTM2OV0sWy0wLjI4ODg5OSw5LjY0MDY4NCwtMS4wMDYwNzldLFstMy40NzIxMTgsNy4yNjMwMDEsLTEuMDgwMzI2XSxbLTEuMjQwNzY5LDAuOTcyMzUyLC0wLjk3NjQ0Nl0sWy0xLjg0NTI1MywwLjM1NjgwMSwtMC45OTU1NzRdLFstMi4zMjI3OSw3LjkxNTM2MSwtMC4wNTc0NzddLFstMS4wODA5MiwyLjE3OTMxNSwtMS4xNjg4MjFdLFs0LjU5ODgzMywyLjE1Njc2OCwwLjI4MDI2NF0sWy00LjcyNTQxNyw2LjQ0MjM3MywyLjA1NjgwOV0sWy0wLjQ5MDM0Nyw5LjQ2NDI5LC0wLjk4MTA5Ml0sWy0xLjk5NjUyLDAuMDk3MzcsLTAuNzY1ODI4XSxbLTEuMTM3NzkzLDEuODg4ODQ2LC0wLjg5NDE2NV0sWy0wLjM3MjQ3LDQuMjk2NjEsLTEuNDY1MTk5XSxbLTAuMTg0NjMxLDUuNjkyOTQ2LC0wLjQyMTM5OF0sWy0zLjc1MTY5NCw3Ljc0MjIzMSwtMS4wODY5MDhdLFstMS4wMDE0MTYsMS4yOTgyMjUsLTAuOTA0Njc0XSxbLTMuNTM2ODg0LDcuMTkwNzc3LC0wLjc4ODYwOV0sWy0zLjczNzU5Nyw3LjUxMTI4MSwtMC45NDAwNTJdLFstMS43NjY2NTEsMC42NjkzODgsLTAuODczMDU0XSxbMy4xMTIyNDUsMy40NzQzNDUsLTEuMTI5NjcyXSxbLTAuMTc1NTA0LDMuODEyOTgsLTIuMDQ3OV0sWy0zLjc2Njc2Miw3LjQxMjUxNCwtMC42ODE1NjldLFstMC42MzM3NSw5LjQzOTQyNCwtMC43ODUxMjhdLFstMC41MTgxOTksNC43Njg5ODIsLTEuMjU4NjI1XSxbMC43OTA2MTksNC4yMTI3NTksLTEuNjEwMjE4XSxbLTMuNzYxOTUxLDMuNzQyNTI4LC0wLjc1NjI4M10sWzAuODk3NDgzLDUuNjc5ODA4LC0wLjYxMjQyM10sWzIuMjIxMTI2LDQuNDI3NDY4LC0xLjI1MjE1NV0sWy0wLjcyODU3Nyw1Ljg0NjQ1NywwLjA2MjcwMl0sWzAuMTk0NDUxLDkuNTAzOTA4LC0xLjQ4MjQ2MV0sWy0wLjA5OTI0Myw5LjM4NTQ1OSwtMS4zOTU2NF0sWzAuNjQzMTg1LDMuNjM2ODU1LC0yLjE4MDI0N10sWzAuODk0NTIyLDUuOTAwNjAxLC0wLjM1NjkzNV0sWzIuNTk1NTE2LDQuNzU3MzEsLTAuODkzMjQ1XSxbMS4xMDg0OTcsMy45MzY4OTMsLTEuOTA1MDk4XSxbMS45ODk4OTQsNS43ODk3MjYsLTAuMzQzMjY4XSxbLTMuODAyMzQ1LDcuNjU1NTA4LC0wLjYxMzgxN10sWzIuMzM5MzUzLDQuOTYyNTcsLTAuOTAzMDhdLFswLjEyNTY0LDQuMDEzMzI0LC0xLjg3OTIzNl0sWy00LjA3ODk2NSwzLjY4MzI1NCwtMC40NDU0MzldLFsyLjA5Mjg5OSw1LjI1NjEyOCwtMC44MzE2MDddLFswLjQyNzU3MSwwLjI5MTc2OSwxLjI3Mjk2NF0sWzIuMzM1NTQ5LDMuNDgwMDU2LC0xLjU4MTk0OV0sWy0wLjE1Njg3LDAuMzI0ODI3LC0xLjY0ODkyMl0sWy0wLjUzNjUyMiw1Ljc2MDc4NiwtMC4yMDM1MzVdLFsxLjUwNzA4MiwwLjA3ODI1MSwtMC45MjMxMDldLFstMS44NTQ3NDIsMC4xMzQ4MjYsMi42OTg3NzRdLFstMy45Mzk4MjcsMy4xNjg0OTgsLTAuNTI2MTQ0XSxbLTMuOTg0NjEsMy4zOTg2OSwtMC41MzMyMTJdLFstMy45NjE3MzgsNC4yMTcxMzIsLTAuNDg5MTQ3XSxbNC4yNzM3ODksMi4xODExNjQsMC4xNTM3ODZdLFstMC40NzA0OTgsNS42NDU2NjQsLTAuNDM5MDc5XSxbLTAuNDE0NTM5LDUuNDg4MDE3LC0wLjY3MzM3OV0sWy0wLjA5NzQ2Miw1LjA2MjczOSwtMS4xMTQ4NjNdLFsxLjE5ODA5Miw1Ljg4MjIzMiwtMC4zOTE2OTldLFsyLjg1NTgzNCw1LjA4NTAyMiwtMC40OTg2NzhdLFsxLjAzNzk5OCw0LjEyOTc1NywtMS43MDE4MTFdLFsxLjcyODA5MSw1LjA2ODQ0NCwtMS4wNjM3NjFdLFstMy44MzIyNTgsMi42MjUxNDEsLTAuMzExMzg0XSxbLTQuMDc4NTI2LDMuMDcwMjU2LC0wLjI4NDM2Ml0sWy00LjA4MDM2NSwzLjk1NDI0MywtMC40NDA0NzFdLFstMC4xNTI1NzgsNS4yNzYyNjcsLTAuOTI5ODE1XSxbLTEuNDg5NjM1LDguOTI4MDgyLC0wLjI5NTg5MV0sWzAuNzU5Mjk0LDUuMTU1ODUsLTEuMDg3Mzc0XSxbLTQuMDAwMzM4LDIuODAxNjQ3LC0wLjIzNTEzNV0sWy00LjI5MDgwMSwzLjgyMzIwOSwtMC4xOTM3NF0sWy00LjIyMTQ5Myw0LjI1NjE4LC0wLjE4OTg5NF0sWy00LjA2NjE5NSw0LjcxOTE2LC0wLjIwMTcyNF0sWy0wLjE1NTM4Niw0LjA3NjM5NiwtMS42NjI4NjVdLFszLjA1NDU3MSw0LjQxNDMwNSwtMC44MjU5ODVdLFstMS42NTI5MTksOC43MjY0OTksLTAuMzg4NTA0XSxbLTMuMDQyNzUzLDAuNTYwMDY4LC0wLjEyNjQyNV0sWy0yLjQzNDQ1NiwxLjExODA4OCwtMC4yMTM1NjNdLFstMi42MjM1MDIsMS44NDUwNjIsLTAuMjgzNjk3XSxbLTQuMjMzMzcxLDMuNDM5NDEsLTAuMjAyOTE4XSxbMi43MjY3MDIsMy44MjA3MSwtMS4yODAwOTddLFswLjE4NDE5OSw0LjE0NjM5LC0xLjY3MzY1M10sWy0xLjI4OTIwMywwLjYyNDU2MiwtMS41NjA5MjldLFstMy44MjM2NzYsNy4zODI0NTgsLTAuNDA3MjIzXSxbMC40NzY2NjcsNS4wNjQ0MTksLTEuMTQzNzQyXSxbLTMuODczNjUxLDQuOTU1MTEyLC0wLjI2OTM4OV0sWzEuMzQ5NjY2LDUuMzEyMjI3LC0xLjAwMDI3NF0sWy0yLjA0Mzc3Niw4LjQzNDQ4OCwtMC4xMDg4OTFdLFstMi43NjM5NjQsMC43MzMzOTUsLTAuMTI5Mjk0XSxbLTQuMzgwNTA1LDMuNjY0NDA5LC0wLjAyNDU0Nl0sWy0wLjcxMjExLDUuMzQxODExLC0wLjgwMzI4MV0sWy0zLjk2MDg1OCw3LjE4MzExMiwtMC4xMTg0MDddLFstMy44MjIyNzcsNy43MTI4NTMsLTAuMjYzMjIxXSxbLTIuMzQ2ODA4LDguMTA4NTg4LDAuMDYzMjQ0XSxbLTEuODQxNzMxLDguNjQyOTk5LC0wLjE0MjQ5Nl0sWy0yLjYwMDA1NSwwLjk4NTYwNCwtMC4wNDM1OTVdLFstMy41MTMwNTcsMi4yMTMyNDMsLTAuMDQ0MTUxXSxbLTMuOTYzNDkyLDIuNjAzMDU1LC0wLjA4MDg5OF0sWy00LjI1ODA2NiwzLjE0NTM3LC0wLjAyNzA0Nl0sWy00LjI2MTU3Miw1LjAwMzM0LDAuMTMwMDRdLFswLjc5NTQ2NCwzLjk5ODczLC0xLjkwNTY4OF0sWy0zLjMwMDg3MywwLjM4NDc2MSwwLjAxMzI3MV0sWy0yLjc3MDI0NCwwLjg4MTk0MiwwLjA3NzMxM10sWy0zLjQ1NjIyNywxLjk5Mzg3MSwwLjMwMTA1NF0sWy00LjQ0MTk4NywzLjkxNDE0NCwwLjE3Nzg2N10sWy00LjM2NzA3NSw2LjYxMTQxNCwwLjE2NTMxMl0sWy0zLjIwMTc2NywwLjU3NjI5MiwwLjEwNTc2OV0sWy0zLjE3NDM1NCwwLjY0NTAwOSwwLjQ0MDM3M10sWy0yLjk5NjU3NiwwLjc0MjYyLDAuMTYxMzI1XSxbLTIuNzI0OTc5LDEuNjU2NDk3LDAuMDkyOTgzXSxbLTMuMjYxNzU3LDIuMDE3NzQyLC0wLjA3MDc2M10sWy00LjI4MDE3Myw0LjUxODIzNSwtMC4wMDI5OTldLFstNC40NzEwNzMsNS45NDUzNTgsMC4wNTIwMl0sWy0zLjg3NzEzNywyLjQwNzQzLDAuMjc0OTI4XSxbLTQuMzcxMjE5LDQuMjUyNzU4LDAuMDc4MDM5XSxbLTMuNDAwOTE0LDAuNDA5ODMsMC4yMzg1OTldLFstNC40NDI5MywzLjUyMzI0MiwwLjE0NjMzOV0sWy00LjU3NDUyOCw1LjI3OTc2MSwwLjM1MzkyM10sWy00LjIyNjY0Myw3LjE5MTI4MiwwLjI2OTI1Nl0sWy00LjE2MzYxLDIuODQzMjA0LDAuMDk3NzI3XSxbLTQuNTI4NTA2LDUuMDExNjYxLDAuNTM2NjI1XSxbMC4zNTUxNCw1LjY2NDgwMiwtMC41NzI4MTRdLFsyLjUwODcxMSw1LjU4MDk3NiwtMC4yNjY2MzZdLFsyLjU1NjIyNiwzLjYzMzc3OSwtMS40MjYzNjJdLFsxLjg3ODQ1Niw0LjUzMzcxNCwtMS4yMjM3NDRdLFsyLjQ2MDcwOSw0LjQ0MDI0MSwtMS4xMzk1XSxbMi4yMTg1ODksNS41MTQ2MDMsLTAuNTYwMDY2XSxbMi4yNjM3MTIsNS43MzcwMjMsLTAuMjUwNjk0XSxbMi45NjQ5ODEsMy44MTQ4NTgsLTEuMTM5OTI3XSxbMC45OTEzODQsNS4zMDQxMzEsLTAuOTk5ODY3XSxbMi44MTE4Nyw0LjU0NzI5MiwtMC45MTYwMjVdLFsyLjkxODA4OSw0Ljc2ODM4MiwtMC43MDI4MDhdLFszLjI2MjQwMyw0LjQxNDI4NiwtMC42NTc5MzVdLFswLjY1MjEzNiw2LjA4OTExMywwLjA2OTA4OV0sWzMuMzYxMzg5LDMuNTA1MiwtMC45NDYxMjNdLFsyLjYxMzA0Miw1LjAzNzE5MiwtMC42OTcxNTNdLFswLjA5NDMzOSw0LjM2ODU4LC0xLjQ1MTIzOF0sWzMuMjkwODYyLDQuMTU1NzE2LC0wLjczMjMxOF0sWzIuNjU4MDYzLDQuMDczNjE0LC0xLjIxNzQ1NV0sWzMuMjYwMzQ5LDMuNzUzMjU3LC0wLjk0NjgxOV0sWzEuMTI0MjY4LDQuODYyNDYzLC0xLjIwNzg1NV0sWzMuMzUxNTgsNC44OTkyNDcsLTAuMDI3NTg2XSxbMy4xOTQwNTcsNC42OTEyNTcsLTAuNTI0NTY2XSxbMy4wOTAxMTksNS4xMTYwODUsLTAuMjMyNTVdLFsyLjQxODk2NSwzLjgxMTc1MywtMS40MTkzOTldLFsyLjE5MTc4OSwzLjg3NzAzOCwtMS40NzAyM10sWzQuMDQzMTY2LDIuMDM0MTg4LDAuMDE1NDc3XSxbLTEuMDI2OTY2LDAuODY3NjYsLTEuNDEwOTEyXSxbMS45Mzc1NjMsMy44NjAwMDUsLTEuNjE3NDY1XSxbMi45ODkwNCw0LjEwMTgwNiwtMC45OTgxMzJdLFstMC4xNDI2MTEsNS44NjUzMDUsLTAuMTAwODcyXSxbMy45NzI2NzMsMi4yOTIwNjksMC4wODk0NjNdLFszLjIzMzQ5LDMuOTU5OTI1LC0wLjg0OTgyOV0sWzAuMTYzMDQsNS44NTcyNzYsLTAuMjE2NzA0XSxbNC4xMjI5NjQsMS43NzAwNjEsLTAuMTE0OTA2XSxbMi4wOTkwNTcsNC45NzgzNzQsLTAuOTg0NDldLFszLjUwMjQxMSwzLjc2MTgxLC0wLjY2NzUwMl0sWzIuMDc5NDg0LDUuOTM5NjE0LC0wLjAzNjIwNV0sWy0wLjA4NDU2OCwzLjUyNTE5MywtMi4yNTM1MDZdLFswLjQyMzg1OSw0LjA2MDk1LC0xLjg0NTMyN10sWzEuNjAxMyw2LjAwNjQ2NiwtMC4xNTM0MjldLFswLjI3MTcwMSwzLjg0NDk2NCwtMi4wNzg3NDhdLFswLjI3MzU3Nyw1LjIxODkwNCwtMC45OTQ3MTFdLFstMC40MTA1NzgsMy45MjE2NSwtMS43NzM2MzVdLFsxLjk0MTk1NCw1LjYwMDQxLC0wLjYyMTU2OV0sWzAuMTAwODI1LDUuNDYyMTMxLC0wLjc3NDI1Nl0sWy0wLjUzMDE2LDMuNjE5ODkyLC0yLjAyNzQ1MV0sWy0wLjgyMjM3MSw1LjUxNzQ1MywtMC42MDU3NDddLFstMi40NzQ5MjUsNy42NzA4OTIsLTAuMDIwMTc0XSxbNC4wMTU3MSwwLjgzMDE5NCwtMC4wMTM3OTNdLFstMC40MDAwOTIsNS4wOTQxMTIsLTEuMDQxOTkyXSxbLTIuODg3Mjg0LDUuNTgxMjQ2LC0wLjUyNTMyNF0sWy0xLjU1OTg0MSw2LjA1MDk3MiwwLjA3OTMwMV0sWy0wLjQ2OTMxNywzLjI5MTY3MywtMi4yMzUyMTFdLFswLjMzNzM5NywzLjQ2NzkyNiwtMi4yOTU0NThdLFstMi42MzIwNzQsNS41NzM3MDEsLTAuNTgyNzE3XSxbLTAuMDMwMzE4LDYuMDExMzk1LDAuMjc2NjE2XSxbLTAuOTM0MzczLDAuMzg4OTg3LC0xLjc4MDUyM10sWy0yLjY2MTI2Myw1Ljg0NDgzOCwtMC40MjU5NjZdLFswLjU0OTM1Myw1LjQ4OTY0NiwtMC44MDcyNjhdLFstMi4xOTQzNTUsNi4xOTc0OTEsLTAuMTA5MzIyXSxbLTIuMjg5NjE4LDUuNjY0ODEzLC0wLjU4MTA5OF0sWzEuNTgzNTgzLDMuNzk2MzY2LC0xLjg0NDQ5OF0sWzAuODU1Mjk1LDAuMjE1OTc5LC0xLjQyNTU1N10sWy0yLjYyNzU2OSw1LjMwMDIzNiwtMC43NjcxNzRdLFs0LjMzMzM0NywyLjM4NDMzMiwwLjM5OTEyOV0sWy0xLjg4MDQwMSw1LjU4Mzg0MywtMC42OTY1NjFdLFstMi4xNzIzNDYsNS4zMjQ4NTksLTAuODQ2MjQ2XSxbLTIuMjcwNTgsNS45MDYyNjUsLTAuMzg4MzczXSxbLTEuOTYwMDQ5LDUuODg5MzQ2LC0wLjM5NzU5M10sWzAuOTY1NzU2LDMuNjc1NDcsLTIuMTA1NjcxXSxbLTIuMDE0MDY2LDYuNDMxMTI1LDAuMjg3MjU0XSxbLTEuNzc2MTczLDUuMjg3MDk3LC0wLjg5MDkxXSxbLTIuMDI1ODUyLDUuMDg5NTYyLC0wLjk4MDIxOF0sWy0xLjg4NjQxOCw2LjEwODM1OCwtMC4wMDA2NjddLFstMS42MDA4MDMsNS43ODUzNDcsLTAuNDkxMDY5XSxbLTEuNjYxODgsNC45NjgwNTMsLTEuMDQyNTM1XSxbLTEuNjAwNjIxLDUuOTYyODE4LC0wLjE4ODA0NF0sWy0xLjU4ODgzMSw1LjYxNTQxOCwtMC42NjU0NTZdLFs0LjQ2OTAxLDEuODgwMTM4LDAuMDU3MjQ4XSxbLTEuOTc4ODQ1LDAuOTI3Mzk5LC0wLjU1NDg1Nl0sWy0xLjQwODA3NCw1LjMyNTI2NiwtMC44Mzk2N10sWzEuOTIzMTIzLDQuODQzOTU1LC0xLjEwMTM4OV0sWy0yLjg3Mzc4LDAuMTE3MTA2LC0wLjQxMjczNV0sWy0xLjIyMjE5Myw1LjYyNjM4LC0wLjUzOTk4MV0sWy0yLjYzMjUzNywwLjE2NjM0OSwtMC40ODkyMThdLFstMS4zNzA4NjUsNS44Mzg4MzIsLTAuMzQxMDI2XSxbLTEuMDY3NzQyLDUuNDQ4ODc0LC0wLjY5MjcwMV0sWy0xLjA3Mzc5OCw1LjIyMDg3OCwtMC45MDg3NzldLFstMS4xNDc1NjIsNC45NTA0MTcsLTEuMDc5NzI3XSxbLTIuNzg5MTE1LDQuNTMxMDQ3LC0xLjA0MjcxM10sWy0zLjU1MDgyNiw0LjE3MDQ4NywtMC44MDYwNThdLFstMy4zMzE2OTQsNC43OTgxNzcsLTAuNjk1NjhdLFstMy42ODk0MDQsNC42ODg1NDMsLTAuNTM0MzE3XSxbLTMuNTExNTA5LDUuMTA2MjQ2LC0wLjQ4MzYzMl0sWzEuNzk2MzQ0LDAuMDc2MTM3LDAuMDgwNDU1XSxbLTMuMzA2MzU0LDUuNDczNjA1LC0wLjQ3ODc2NF0sWy0yLjY5MjUwMywzLjM0NjYwNCwtMS4yMDk1OV0sWy0zLjk2MzA1Niw1LjE4NzQ2MiwzLjExMzE1Nl0sWy0zLjkwMTIzMSw2LjM5MTQ3NywtMC4yNDY5ODRdLFs0LjQ4NDIzNCwxLjUxODYzOCwtMC4wMDE2MTddLFs0LjMwODgyOSwxLjY1NzcxNiwtMC4xMTkyNzVdLFs0LjI5MDA0NSwxLjMzOTUyOCwtMC4xMTA2MjZdLFstMy41MTQ5MzgsMy41MjQ5NzQsLTAuOTA5MTA5XSxbLTIuMTk0MywyLjEyMTYzLC0wLjcxOTY2XSxbNC4xMDgyMDYsMS4wOTEwODcsLTAuMTE0MTZdLFszLjc4NTMxMiwxLjM5MjQzNSwtMC4yODU4OF0sWzQuMDkyODg2LDEuNDgwNDc2LC0wLjIxMDY1NV0sWy0yLjk2NTkzNyw2LjQ2OTAwNiwtMC4zNzkwODVdLFstMy43MDg1ODEsMi45NjI5NzQsLTAuNjM5NzldLFstMy4yOTc5NzEsMi4yMTg5MTcsLTAuMjk5ODcyXSxbMy44MDY5NDksMC44MDQ3MDMsLTAuMTE0MzhdLFszLjc0Nzk1NywxLjA1OTI1OCwtMC4yNzMwNjldLFstMy4xMDE4MjcsNC4xMTE0NDQsLTEuMDA2MjU1XSxbLTEuNTM2NDQ1LDQuNjU4OTEzLC0xLjE5NTA0OV0sWy0zLjU0OTgyNiwyLjQ1MDU1NSwtMC4zNzU2OTRdLFstMy42NzY0OTUsMi4xMDgzNjYsMC41MzQzMjNdLFstMy42NzQ3MzgsNS45MjUwNzUsLTAuNDAwMDExXSxbLTIuMjUwMTE1LDIuODQ4MzM1LC0xLjEyMTE3NF0sWy0zLjY5ODA2Miw1LjY2NzU2NywtMC4zODEzOTZdLFszLjQ2ODk2NiwwLjczNDY0MywtMC4xOTA2MjRdLFstMy45Nzk3Miw1LjY3MDA3OCwtMC4yNjg3NF0sWy0zLjAwMjA4Nyw0LjMzNzgzNywtMS4wMzM0MjFdLFstMy4zNTYzOTIsMi42MDgzMDgsLTAuNzEzMzIzXSxbLTEuODMzMDE2LDMuMzU5OTgzLC0xLjI4Nzc1XSxbLTEuOTg5MDY5LDMuNjMyNDE2LC0xLjMwNTYwN10sWzMuNTkxMjU0LDAuNTQyMzcxLDAuMDI2MTQ2XSxbMy4zNjQ5MjcsMS4wODI1NzIsLTAuMzQyNjEzXSxbLTMuMzkzNzU5LDMuODY2ODAxLC0wLjkzNzI2Nl0sWy00LjEyNDg2NSw1LjU0OTUyOSwtMC4xNjE3MjldLFstNC40MjM0MjMsNS42ODcyMjMsMC4wMDAxMDNdLFstMS40OTY4ODEsMi42MDE3ODUsLTEuMTE0MzI4XSxbLTIuNjQyMjk3LDYuNDk2OTMyLC0wLjI2NDE3NV0sWy0zLjY4NDIzNiw2LjgxOTQyMywtMC4zMjAyMzNdLFstMi4yODY5OTYsMy4xNjcwNjcsLTEuMjQ2NjUxXSxbLTEuNjI0ODk2LDguNDQ4NDgsLTAuNTMwMDE0XSxbLTMuNjY2Nzg3LDIuMTU5MjY2LDAuMjY4MTQ5XSxbLTIuNDAyNjI1LDIuMDExMjQzLC0wLjU2NDQ2XSxbLTIuNzM2MTY2LDIuMjU5ODM5LC0wLjY5NDNdLFstMi4xNjg2MTEsMy44OTA3OCwtMS4yOTIyMDZdLFstMi4wNjU5NTYsMy4zNDU3MDgsLTEuMjgxMzQ2XSxbLTIuNzc4MTQ3LDIuNjc1NjA1LC0wLjk5NTcwNl0sWy0zLjUwNzQzMSw0LjUxMzI3MiwtMC43MTgyOV0sWy0yLjMwMTE4NCw0LjI5MzkxMSwtMS4yMzgxODJdLFszLjIwNTgwOCwwLjIxMTA3OCwwLjM5NDM0OV0sWy0yLjEyOTkzNiw0Ljg3MDU3NywtMS4wODA3ODFdLFstMi4yODc5NzcsMi40OTY1OTMsLTAuOTM0MDY5XSxbLTIuNzAxODMzLDIuOTMxODE0LC0xLjExNDUwOV0sWzMuMjk0Nzk1LDAuNTA2MzEsLTAuMDgxMDYyXSxbLTIuNTUyODI5LDcuNDY4NzcxLC0wLjAyMTU0MV0sWzMuMDY3MjEsMC45NDQwNjYsLTAuNDMwNzRdLFstMi44NjA4NiwxLjk3MzYyMiwtMC4zMDMxMzJdLFstMy41OTg4MTgsNS40MTk2MTMsLTAuNDAxNjQ1XSxbLTEuNTI0MzgxLDAuMDgwMTU2LC0xLjYxNjYyXSxbLTEuOTA3MjkxLDIuNjQ2Mjc0LC0xLjAzOTQzOF0sWzIuOTUwNzgzLDAuNDA3NTYyLC0wLjEwNTQwN10sWy0xLjY2MzA0OCwxLjY1NTAzOCwtMC42ODk3ODddLFstMS43MjgxMDIsMS4xMTAwNjQsLTAuNjM1OTYzXSxbLTIuMDg1ODIzLDcuNjg2Mjk2LC0wLjE1OTc0NV0sWzIuODgzNTE4LDMuMTU3MDA5LC0xLjMwODU4XSxbLTIuNzI0MTE2LDAuNDE3MTY5LC0wLjM4OTcxOV0sWy0xLjc4ODYzNiw3Ljg2MjY3MiwtMC4zNDY0MTNdLFstMi4xODY0MTgsMS4yNDk2MDksLTAuNDM0NTgzXSxbLTMuMDkyNDM0LDIuNjA2NjU3LC0wLjg2MDAwMl0sWy0xLjczNzMxNCwzLjg3NDIwMSwtMS4zMzA5ODZdLFsyLjU2NDUyMiwwLjQyMjk2NywtMC4zOTA5MDNdLFsxLjY3MDc4MiwzLjUzODQzMiwtMS45MjQ3NTNdLFstMi4zMzgxMzEsNC4wMjU3OCwtMS4yODY2NzNdLFstMS45MTY1MTYsNC4wNTQxMjEsLTEuMzAxNzg4XSxbMi44NzE1OSwyLjAzNDk0OSwtMS4yNjcxMzldLFstMS45MzE1MTgsMy4wNjI4ODMsLTEuMTk3MjI3XSxbLTAuODE2NjAyLDAuMTM1NjgyLDMuMTA0MTA0XSxbMC40NjkzOTIsMC4yMTM5MTYsLTEuNDg5NjA4XSxbMi41NzQwNTUsMS45NTAwOTEsLTEuNTE0NDI3XSxbMi43MzM1OTUsMi42ODI1NDYsLTEuNDYxMjEzXSxbLTEuOTE1NDA3LDQuNjkzNjQ3LC0xLjE1MTcyMV0sWy0zLjQxMjg4Myw1Ljg2NzA5NCwtMC40NTA1MjhdLFsyLjI4ODIyLDAuMTIwNDMyLC0wLjA0MTAyXSxbMi4yNDQ0NzcsMC4xNDQyNCwtMC4zNzY5MzNdLFstMS42NzYxOTgsMy41NzA2OTgsLTEuMzI4MDMxXSxbLTEuODIxMTkzLDQuMzY2OTgyLC0xLjI2NjI3MV0sWy0xLjU1MjIwOCw4LjA5OTIyMSwtMC41MzI2Ml0sWy0xLjcyNzQxOSwyLjM5MDk3LC0wLjk4OTQ1Nl0sWy0yLjQ2ODIyNiw0LjcxMTY2MywtMS4wNjk3NjZdLFstMi40NTE2NjksNi4xMTMzMTksLTAuMjczNzg4XSxbMi42MzU0NDcsMi4yOTU4NDIsLTEuNTE4MzYxXSxbLTIuMDIwODA5LDguMTUwMjUzLC0wLjI0NjcxNF0sWzIuMjkyNDU1LDAuODA1NTk2LC0xLjMwNDJdLFsyLjY0MTU1NiwxLjY1NjY1LC0xLjQ2Njk2Ml0sWzIuNDA5MDYyLDIuODQyNTM4LC0xLjYzNTAyNV0sWzIuNDU2NjgyLDEuNDU5NDg0LC0xLjU3NTQzXSxbLTEuNjkxMDQ3LDMuMTczNTgyLC0xLjI0NzA4Ml0sWy0xLjg2NTY0MiwxLjk1NzYwOCwtMC43Njg2ODNdLFstMy40MDE1NzksMC4yMDQwNywwLjEwMDkzMl0sWzIuMzAxOTgxLDEuNzEwMiwtMS42NTA0NjFdLFsyLjM0MjkyOSwyLjYxMTk0NCwtMS42OTA3MTNdLFstMS42NzYxMTEsMi45MjM4OTQsLTEuMTc4MzVdLFstMi45OTIwMzksMy41NDc2MzEsLTEuMTE4OTQ1XSxbLTMuNTcxNjc3LDYuNTA0NjM0LC0wLjM3NTQ1NV0sWzIuMTQxNzY0LDEuNDYwODY5LC0xLjcwMjQ2NF0sWy0zLjIyMTk1OCw1LjE0NjA0OSwtMC42MTU2MzJdLFsyLjE5MjM4LDIuOTQ5MzY3LC0xLjc0NzI0Ml0sWzIuMzIwNzkxLDIuMjMyOTcxLC0xLjcwNjg0Ml0sWzIuMDg4Njc4LDIuNTg1MjM1LC0xLjgxMzE1OV0sWy0yLjE5NjQwNCwwLjU5MjIxOCwtMC41Njk3MDldLFstMi4xMjA4MTEsMS44MzY0ODMsLTAuNjIzMzhdLFstMS45NDk5MzUsMi4yNzEyNDksLTAuODc0MTI4XSxbMi4yMzU5MDEsMS4xMTAxODMsLTEuNTEwNzE5XSxbMi4wMjAxNTcsMy4yNDExMjgsLTEuODAzOTE3XSxbMi4wNTQzMzYsMS45NDkzOTQsLTEuNzkyMzMyXSxbLTMuMDk0MTE3LDQuOTk2NTk1LC0wLjc0MDIzOF0sWzIuMDM4MDYzLDAuNjM1OTQ5LC0xLjQwMjA0MV0sWzEuOTgwNjQ0LDEuNjg0NDA4LC0xLjc2Nzc4XSxbMS41ODc0MzIsMy4zMDY1NDIsLTEuOTkxMTMxXSxbMS45MzUzMjIsMC45NzYyNjcsLTEuNjAyMjA4XSxbMS45MjI2MjEsMS4yMzU1MjIsLTEuNjk4ODEzXSxbMS43MTI0OTUsMS45MTE4NzQsLTEuOTAzMjM0XSxbMS45MTI4MDIsMi4yNTkyNzMsLTEuODg4Njk4XSxbMS44ODQzNjcsMC4zNTU0NTMsLTEuMzEyNjMzXSxbMS42NzY0MjcsMC43NjI4MywtMS41Mzk0NTVdLFsxLjc4NDUzLDIuODM2NjIsLTEuOTQzMDM1XSxbMS42OTczMTIsMC4xMjAyODEsLTEuMTUwMzI0XSxbMS42NDgzMTgsMi40ODQ5NzMsLTEuOTk5NTA1XSxbLTQuMDUxODA0LDUuOTU4NDcyLC0wLjIzMTczMV0sWy0xLjk2NDgyMywxLjQ2NDYwNywtMC41ODExNV0sWzEuNTU5OTYsMi4xODM0ODYsLTEuOTcxMzc4XSxbMS42MjgxMjUsMS4wNDU5MTIsLTEuNzA3ODMyXSxbMS43MDE2ODQsMS41NDA0MjgsLTEuODI3MTU2XSxbMS41Njc0NzUsNC44Njk0ODEsLTEuMTg0NjY1XSxbMS40MzI0OTIsMC44NDM3NzksLTEuNjQ4MDgzXSxbMS4xNzM4MzcsMi45Nzg5ODMsLTIuMTU2Njg3XSxbMS4yMzUyODcsMy4zNzk3NSwtMi4wOTUxNV0sWzEuMjUyNTg5LDEuNTI1MjkzLC0xLjk0OTIwNV0sWzEuMTU5MzM0LDIuMzM2Mzc5LC0yLjEwNTM2MV0sWzEuNDkwNjEsMi42OTUyNjMsLTIuMDgzMjE2XSxbLTQuMTIyNDg2LDYuNzgyNjA0LC0wLjAyNTQ1XSxbMS4xNzMzODgsMC4yNzkxOTMsLTEuNDIzNDE4XSxbMS41MDU2ODQsMC4zODA4MTUsLTEuNDE0Mzk1XSxbMS4zOTE0MjMsMS4zNDMwMzEsLTEuODQzNTU3XSxbMS4yNjM0NDksMi43MzIyNSwtMi4xNDQ5NjFdLFsxLjI5NTg1OCwwLjU5NzEyMiwtMS41MTU2MjhdLFsxLjI0NTg1MSwzLjcyOTEyNiwtMS45OTMwMTVdLFstMi43NjE0MzksNi4yMzcxNywtMC4zNjU4NTZdLFswLjk3ODg4NywxLjY2NDg4OCwtMi4wNDY2MzNdLFsxLjIxOTU0MiwwLjk4MjcyOSwtMS43ODU0ODZdLFsxLjMxNTkxNSwxLjkxNzQ4LC0yLjAyNzg4XSxbLTMuMDUyNzQ2LDIuMTI3MjIyLC0wLjM2OTA4Ml0sWzAuOTc3NjU2LDEuMzYyMjMsLTEuOTQ0MTE5XSxbMC45MzYxMjIsMy4zOTQ0NywtMi4yMDMwMDddLFstMi43NDAwMzYsNC4xODQ3MDIsLTEuMTIyODQ5XSxbMC44NTM1ODEsMi44NjQ2OTQsLTIuMjYwODQ3XSxbMC43MTk1NjksMC44MTg3NjIsLTEuNzYzNjE4XSxbMC44MzkxMTUsMS4xNTkzNTksLTEuOTA3OTQzXSxbMC45MzIwNjksMS45NDU1OSwtMi4xMTc5NjJdLFswLjU3OTMyMSwzLjMyNjc0NywtMi4yOTkzNjldLFswLjg2MzI0LDAuNTk3ODIyLC0xLjU2NTEwNl0sWzAuNTc0NTY3LDEuMTU4NDUyLC0xLjk0MzEyM10sWzAuNTI1MTM4LDIuMTM3MjUyLC0yLjIxMzg2N10sWzAuNzc5OTQxLDIuMzQyMDE5LC0yLjIwNjE1N10sWzAuOTE1MjU1LDIuNjE4MTAyLC0yLjIwOTA0MV0sWzAuNTI2NDI2LDMuMDIyNDEsLTIuMzIxODI2XSxbMC40OTU0MzEsMi41MjEzOTYsLTIuMjk1OTA1XSxbMC44MDc5OSwzLjE1NjgxNywtMi4yODY0MzJdLFswLjI3MzU1NiwxLjMwNDkzNiwtMi4wMTI1MDldLFswLjY2NDMyNiwxLjUzMDAyNCwtMi4wNDg3MjJdLFswLjIxOTE3MywyLjMyOTA3LC0yLjMyMzIxMl0sWzAuNDA1MzI0LDAuNjk1MzU5LC0xLjcwNDg4NF0sWzAuMzk4ODI3LDAuOTQ2NjQ5LC0xLjg0Mzg5OV0sWzAuMzQ1MTA5LDEuNjA4ODI5LC0yLjEwMDE3NF0sWy0yLjM1Njc0MywwLjA2MjAzMiwtMC40OTQ3XSxbLTMuMDAxMDg0LDAuMjcxNDYsMi41NjAwMzRdLFstMi4wNjQ2NjMsMC4zMDMwNTUsLTAuNjk3MzI0XSxbMC4yMjEyNzEsMy4xNzQwMjMsLTIuMzc0Mzk5XSxbMC4xOTU4NDIsMC40Mzc4NjUsLTEuNjIxNDczXSxbLTAuMzg1NjEzLDAuMjk3NzYzLDEuOTYwMDk2XSxbMS45OTk2MDksMC4xMDg5MjgsLTAuNzkxMjVdLFswLjM1MTY5OCw5LjIyNzQ5NCwtMS41NzU2NV0sWzAuMDIxNDc3LDIuMTkxOTEzLC0yLjMwOTM1M10sWzAuMjQ2MzgxLDIuODM2NTc1LC0yLjM1NjM2NV0sWzEuNTQzMjgxLDAuMjM3NTM5LDEuOTAxOTA2XSxbMC4wMzE4ODEsOS4xNDcwMjIsLTEuNDU0MjAzXSxbLTAuMDAxODgxLDEuNjQ4NTAzLC0yLjEwODA0NF0sWzAuMzMzNDIzLDEuOTA3MDg4LC0yLjIwNDUzM10sWzAuMDQ0MDYzLDIuNjM0MDMyLC0yLjM2ODQxMl0sWy0wLjAyODE0OCwzLjA1MzY4NCwtMi4zOTAwODJdLFswLjAyNDEzLDMuMzQyOTcsLTIuMzY1NDRdLFstMC4yNzI2NDUsOS4wMjg3OSwtMS4yMzg2ODVdLFstMC4wMDYzNDgsMC44MzIwNDQsLTEuNzU4MjIyXSxbLTAuMzIxMTA1LDEuNDU4NzU0LC0xLjg4NjMxM10sWy0wLjE1Mzk0OCw4LjYxODgwOSwtMS4xMDUzNTNdLFstMC40MDkzMDMsMS4xMzc3ODMsLTEuNzIwNTU2XSxbLTAuNDEwMDU0LDEuNzQyNzg5LC0xLjk1Nzk4OV0sWy0wLjI4NzkwNSwyLjM4MDQwNCwtMi4yOTQ1MDldLFstMC4yNjEzNzUsMi42NDY2MjksLTIuMzU2MzIyXSxbLTAuMjIxOTg2LDMuMjE1MzAzLC0yLjM0NTg0NF0sWy0wLjMxNjA4LDAuNjg3NTgxLC0xLjcxOTAxXSxbLTAuNTM3NzA1LDAuODU1ODAyLC0xLjY0ODU4NV0sWy0wLjE0MjgzNCwxLjE5MzA1MywtMS44NzM3MV0sWy0wLjI0MzcxLDIuMDQ0NDM1LC0yLjE3Njk1OF0sWy0wLjQzNzk5OSwyLjk1OTc0OCwtMi4yOTk2OThdLFstMC43ODg5NSwwLjE3NjIyNiwtMS43MjkwNDZdLFstMC42MDg1MDksMC41NDY5MzIsLTEuNzM0MDMyXSxbLTAuNjkzNjk4LDQuNDc4NzgyLC0xLjM2OTM3Ml0sWy0wLjY2OTE1Myw4LjQ2OTY0NSwtMC45MTExNDldLFstMC43NDE4NTcsMS4wODI3MDUsLTEuNDU4NDc0XSxbLTAuNTU0MDU5LDIuNDQwMzI1LC0yLjE0MTc4NV0sWzIuMDkyNjEsMC4xNTMxODIsMi41NzU4MV0sWzEuNzkyNTQ3LDAuMTExNzk0LDIuNTYzNzc3XSxbMS44NTU3ODcsMC4xODk1NDEsMi44MzUwODldLFsxLjQ5MjYwMSwwLjIzMjI0NiwyLjk4NzY4MV0sWy0wLjI4NDkxOCwwLjIzNjY4NywzLjQyOTczOF0sWzIuNjA0ODQxLDAuMTE5OTcsMS4wMTUwNl0sWzAuMzMxMjcxLDAuMTY4MTEzLDMuMTI0MDMxXSxbMC4yODA2MDYsMC4zMDgzNjgsMi40OTU5MzddLFswLjU0NDU5MSwwLjMyNTcxMSwyLjA4MTI3NF0sWzAuMTkzMTQ1LDAuMTkxNTQsLTAuOTc3NTU2XSxbMy44MTAwOTksMC40MjMyNCwxLjAzMjIwMl0sWzMuNTQ2MjIsMC4zNzkyNDUsMS4zOTI4MTRdLFswLjYxNDAyLDAuMjc2MzI4LDAuODQ5MzU2XSxbLTEuMTk4NjI4LDAuMTQ0OTUzLDIuOTExNDU3XSxbNC4xNzE5OSwwLjY4MDM3LDEuMzkxNTI2XSxbMC44ODI3OSwwLjMyMTMzOSwyLjA1OTEyOV0sWzEuOTMwMzUsMC4xMDk5OTIsMi4wNTQxNTRdLFsxLjYyMDMzMSwwLjEyMTk4NiwyLjM3MjAzXSxbMi4zNzQ4MTIsMC4xMDkyMSwxLjczNDg3Nl0sWy0wLjAzMTIyNywwLjI5NDQxMiwyLjU5MzY4N10sWzQuMDc1MDE4LDAuNTYxOTE0LDEuMDM4MDY1XSxbLTAuNTcwMzY2LDAuMTI2NTgzLDIuOTc1NTU4XSxbMC45NTAwNTIsMC4zMTg0NjMsMS44MDQwMTJdLFsxLjEzMDAzNCwwLjExNzEyNSwwLjk4Mzg1XSxbMi4xMjMwNDksMC4wODk0NiwxLjY2NTkxMV0sWzIuMDg3NTcyLDAuMDY4NjIxLDAuMzM1MDEzXSxbMi45MjczMzcsMC4xNjcxMTcsMC4yODk2MTFdLFswLjUyODg3NiwwLjMxMzQzNCwzLjIwNTk2OV0sWzEuMTc0OTExLDAuMTYyNzQ0LDEuMzI4MjYyXSxbLTQuODg4NDQsNS41OTUzNSwxLjY2MTEzNF0sWy00LjcwOTYwNyw1LjE2NTMzOCwxLjMyNDA4Ml0sWzAuODcxMTk5LDAuMjc3MDIxLDEuMjYzODMxXSxbLTMuOTEwODc3LDIuMzQ5MzE4LDEuMjcyMjY5XSxbMS41NjgyNCwwLjExODYwNSwyLjc2ODExMl0sWzEuMTc5MTc2LDAuMTUyNjE3LC0wLjg1ODAwM10sWzEuNjM0NjI5LDAuMjQ3ODcyLDIuMTI4NjI1XSxbLTQuNjI3NDI1LDUuMTI2OTM1LDEuNjE3ODM2XSxbMy44NDU1NDIsMC41NDkwNywxLjQ1NjAxXSxbMi42NTQwMDYsMC4xNjU1MDgsMS42MzcxNjldLFstMC42NzgzMjQsMC4yNjQ4OCwxLjk3NDc0MV0sWzIuNDUxMTM5LDAuMTAwMzc3LDAuMjEzNzY4XSxbMC42MzMxOTksMC4yODY3MTksMC40MDMzNTddLFstMC41MzMwNDIsMC4yNTI0LDEuMzczMjY3XSxbMC45OTMxNywwLjE3MTEwNiwwLjYyNDk2Nl0sWy0wLjEwMDA2MywwLjMwNjQ2NiwyLjE3MDIyNV0sWzEuMjQ1OTQzLDAuMDkyMzUxLDAuNjYxMDMxXSxbMS4zOTA0MTQsMC4xOTg5OTYsLTAuMDg2NF0sWy00LjQ1NzI2NSw1LjAzMDUzMSwyLjEzODI0Ml0sWzIuODk3NzYsMC4xNDY1NzUsMS4yOTc0NjhdLFsxLjgwMjcwMywwLjA4ODgyNCwtMC40OTA0MDVdLFsxLjA1NTQ0NywwLjMwOTI2MSwyLjM5MjQzN10sWzIuMzAwNDM2LDAuMTQyNDI5LDIuMTA0MjU0XSxbMi4zMzM5OSwwLjE4Nzc1NiwyLjQxNjkzNV0sWzIuMzI1MTgzLDAuMTM0MzQ5LDAuNTc0MDYzXSxbMi40MTA5MjQsMC4zNzA5NzEsMi42MzcxMTVdLFsxLjEzMjkyNCwwLjI5MDUxMSwzLjA2MV0sWzEuNzY0MDI4LDAuMDcwMjEyLC0wLjgwNTM1XSxbMi4xNTY5OTQsMC4zOTc2NTcsMi44NDQwNjFdLFswLjkyMDcxMSwwLjIyNTUyNywtMC44ODI0NTZdLFstNC41NTIxMzUsNS4yNDA5NiwyLjg1NTE0XSxbMC4yMTAwMTYsMC4zMDkzOTYsMi4wNjQyOTZdLFswLjYxMjA2NywwLjEzNjgxNSwtMS4wODYwMDJdLFszLjE1MDIzNiwwLjQyNjc1NywxLjgwMjcwM10sWy0wLjI0ODI0LDAuMjgyMjU4LDEuNDcwOTk3XSxbMC45NzQyNjksMC4zMDEzMTEsLTAuNjQwODk4XSxbLTQuNDAxNDEzLDUuMDM5NjYsMi41MzU1NTNdLFswLjY0NDMxOSwwLjI3NDAwNiwtMC44MTc4MDZdLFswLjMzMjkyMiwwLjMwOTA3NywwLjEwODQ3NF0sWzMuNjEwMDAxLDAuMzE3NDQ3LDAuNjg5MzUzXSxbMy4zMzU2ODEsMC4zNTgxOTUsMC4xMTg0NzddLFswLjYyMzU0NCwwLjMxODk4MywtMC40MTkzXSxbLTAuMTEwMTIsMC4zMDc3NDcsMS44MzEzMzFdLFstMC40MDc1MjgsMC4yOTEwNDQsMi4yODI5MzVdLFswLjA2OTc4MywwLjI4NTA5NSwwLjk1MDI4OV0sWzAuOTcwMTM1LDAuMzEwMzkyLC0wLjI4Mzc0Ml0sWzAuODQwNTY0LDAuMzA2ODk4LDAuMDk4ODU0XSxbLTAuNTQxODI3LDAuMjY3NzUzLDEuNjgzNzk1XSxbLTMuOTU2MDgyLDQuNTU3MTMsMi4yOTcxNjRdLFstNC4xNjEwMzYsMi44MzQ0ODEsMS42NDE4M10sWy00LjA5Mzk1Miw0Ljk3NzU1MSwyLjc0Nzc0N10sWzIuNjYxODE5LDAuMjYxODY3LDEuOTI2MTQ1XSxbLTMuNzQ5OTI2LDIuMTYxODc1LDAuODk1MjM4XSxbLTIuNDk3Nzc2LDEuMzYyOSwwLjc5MTg1NV0sWzAuNjkxNDgyLDAuMzA0OTY4LDEuNTgyOTM5XSxbLTQuMDEzMTkzLDQuODMwOTYzLDIuNDc2OV0sWy0zLjYzOTU4NSwyLjA5MTI2NSwxLjMwNDQxNV0sWy0zLjk3NjcsMi41NjMwNTMsMS42Mjg0XSxbLTMuOTc5OTE1LDIuNzg4NjE2LDEuOTc3OTc3XSxbMC4zODg3ODIsMC4zMTI2NTYsMS43MDkxNjhdLFstMy40MDg3MywxLjg3NzMyNCwwLjg1MTY1Ml0sWy0zLjY3MTYzNyw1LjEzNjk3NCwzLjE3MDczNF0sWy0zLjEyOTY0LDEuODUyMDEyLDAuMTU3NjgyXSxbLTMuNjI5Njg3LDQuODUyNjk4LDIuNjg2ODM3XSxbLTMuMTk2MTY0LDEuNzkzNDU5LDAuNDUyODA0XSxbLTMuNzQ2MzM4LDIuMzEzNTcsMS42NDg1NTFdLFsyLjk5MjE5MiwwLjEyNTI1MSwwLjU3NTk3Nl0sWy0zLjI1NDA1MSwwLjA1NDQzMSwwLjMxNDE1Ml0sWy0zLjQ3NDY0NCwxLjkyNTI4OCwxLjEzNDExNl0sWy0zLjQxODM3MiwyLjAyMjg4MiwxLjU3ODkwMV0sWy0yLjkyMDk1NSwxLjcwNTQwMywwLjI5ODQyXSxbLTMuNTcyMjksMi4xNTIwMjIsMS42MDc1NzJdLFstMy4yNTEyNTksMC4wOTAxMywtMC4xMDYxNzRdLFstMy4yOTk5NTIsMS44Nzc3ODEsMS4zNDg2MjNdLFstMy42NjY4MTksMi40NDE0NTksMi4wMDQ4MzhdLFstMi45MTI2NDYsMS44MjQ3NDgsLTAuMDQ1MzQ4XSxbLTMuMzk5NTExLDIuNDc5NDg0LDIuMzQwMzkzXSxbLTMuMDA5NzU0LDAuMDE1Mjg2LDAuMDc1NTY3XSxbLTMuMzgxNDQzLDIuMzE2OTM3LDIuMTU2OTIzXSxbLTMuMzUyODAxLDIuMTMzMzQxLDEuODU3MzY2XSxbLTMuMDE3ODgsMS42ODc2ODUsMC42NDU4NjddLFstMi45MzE4NTcsMS42Nzg3MTIsMS4xNTg0NzJdLFstMy4zMDEwMDgsMC4wODgzNiwwLjU5MTAwMV0sWzEuMzU4MDI1LDAuMTk3OTUsMS41OTkxNDRdLFstMi45OTk1NjUsMS44NDUwMTYsMS42MTgzOTZdLFstMi43Njc5NTcsMC4wMjgzOTcsLTAuMTk2NDM2XSxbLTIuOTM5NjIsMi4wNzg3NzksMi4xNDA1OTNdLFstMy4zNDY2NDgsMi42NzQwNTYsMi41MTgwOTddLFszLjMyNDMyMiwwLjIwODIyLDAuNjI4NjA1XSxbMy4wOTE2NzcsMC4xMzcyMDIsMC45MzQ1XSxbLTIuODgxODA3LDAuMDA5OTUyLDAuMzE4NDM5XSxbLTIuNzY0OTQ2LDEuNzg2NjE5LDEuNjkzNDM5XSxbLTIuOTA1NTQyLDEuOTMyMzQzLDEuOTAwMDAyXSxbLTMuMTQwODU0LDIuMjcxMzg0LDIuMjc0OTQ2XSxbLTIuODg5OTUsMi40ODc4NTYsMi41NzQ3NTldLFstMi4zNjcxOTQsLTAuMDAwOTQzLC0wLjE1NTc2XSxbLTMuMDUwNzM4LDAuMDY4NzAzLDAuNzQyOTg4XSxbLTIuNzU5NTI1LDEuNTU2NzksMC44Nzc3ODJdLFstMy4xNTE3NzUsMi40ODA1NCwyLjQ4Mjc0OV0sWy0yLjU3ODYxOCwtMC4wMDI4ODUsMC4xNjU3MTZdLFstMi42NTE2MTgsMS44NzcyNDYsMS45ODExODldLFstMi45MzM5NzMsMC4xMzM3MzEsMS42MzEwMjNdLFsxLjA0NzYyOCwwLjEwMDI4NCwtMS4wODUyNDhdLFstMS41ODUxMjMsMC4wNjIwODMsLTEuMzk0ODk2XSxbLTIuMjg3OTE3LC0wLjAwMjY3MSwwLjIxNDQzNF0sWy0yLjUyNDg5OSwwLjAwNzQ4MSwwLjQ3MTc4OF0sWy0yLjgxNTQ5MiwyLjE4ODE5OCwyLjM0MzI5NF0sWy0yLjA5NTE0MiwtMC4wMDMxNDksLTAuMDk0NTc0XSxbLTIuMTcyNjg2LC0wLjAwMDEzMywwLjQ3OTYzXSxbLTIuNzMyNzA0LDAuMDc0MzA2LDEuNzQyMDc5XSxbLTIuNDk2NTMsMi4xNDU2NjgsMi40MjY5MV0sWy0xLjM0MzY4MywwLjA0NzcyMSwtMS41MDYzOTFdLFstMi41ODExODUsMC4wNDg3MDMsMC45NzU1MjhdLFstMi45MDUxMDEsMC4wODMxNTgsMi4wMTAwNTJdLFstMi42MDE1MTQsMi4wMDc4MDEsMi4yMjMwODldLFstMi4zMzk0NjQsMC4wMjYzNCwxLjQ4NDMwNF0sWy0yLjkwNzg3MywwLjEwMzY3LDIuMzc4MTQ5XSxbLTEuMzY4Nzk2LDAuMDYyNTE2LC0xLjA0OTEyNV0sWy0xLjkzMjQ0LDAuMDI0NDMsLTAuNDI3NjAzXSxbLTIuNzA1MDgxLDAuMDYwNTEzLDIuMzAzODAyXSxbMy4zNzIxNTUsMC4yMDYyNzQsMC44OTIyOTNdLFstMS43NjE4MjcsMC4wOTMyMDIsLTEuMDM3NDA0XSxbLTEuNzAwNjY3LDAuMDM5NywtMC42MTQyMjFdLFstMS44NzIyOTEsMC4wMTE5NzksLTAuMTM1NzUzXSxbLTEuOTI5MjU3LDAuMDc0MDA1LDAuNzI4OTk5XSxbLTIuNTIwMTI4LDAuMDQ5NjY1LDEuOTkwNTRdLFstMi42OTk0MTEsMC4xMDA5MiwyLjYwMzExNl0sWzMuMjExNzAxLDAuMjczMDIsMS40MjMzNTddLFstMS40NDUzNjIsMC4xMzcxLC0wLjYyNjQ5MV0sWzIuOTIxMzMyLDAuMjU5MTEyLDEuNjQ1NTI1XSxbLTAuOTkzMjQyLDAuMDU4Njg2LC0xLjQwODkxNl0sWy0wLjk0NDk4NiwwLjE1NzU0MSwtMS4wOTc2NjVdLFstMi4xNTQzMDEsMC4wMzI3NDksMS44ODIwMDFdLFstMi4xMDg3ODksMS45ODg1NTcsMi40NDI2NzNdLFstMS4wMTU2NTksMC4yNTQ5NywtMC40MTY2NjVdLFstMS44OTg0MTEsMC4wMTU4NzIsMC4xNjcxNV0sWy0xLjU4NTUxNywwLjAyNzEyMSwwLjQ1MzQ0NV0sWy0yLjMxMTEwNSwwLjA2MTI2NCwyLjMyNzA2MV0sWy0yLjYzNzA0MiwwLjE1MjIyNCwyLjgzMjIwMV0sWy0yLjA4NzUxNSwyLjI5Mjk3MiwyLjYxNzU4NV0sWy0wLjc1MDYxMSwwLjA1NjY5NywtMS41MDQ1MTZdLFstMC40NzIwMjksMC4wNzU2NTQsLTEuMzYwMjAzXSxbLTAuNzEwNzk4LDAuMTM5MjQ0LC0xLjE4Mzg2M10sWy0wLjk3NzU1LDAuMjYwNTIsLTAuODMxMTY3XSxbLTAuNjU1ODE0LDAuMjYwODQzLC0wLjg4MDA2OF0sWy0wLjg5NzUxMywwLjI3NTUzNywtMC4xMzMwNDJdLFstMi4wNDkxOTQsMC4wODQ5NDcsMi40NTU0MjJdLFstMC4xNzc4MzcsMC4wNzYzNjIsLTEuNDQ5MDA5XSxbLTAuNTUzMzkzLDAuMjc5MDgzLC0wLjU5NTczXSxbLTEuNzg4NjM2LDAuMDYxNjMsMi4yMzExOThdLFstMC4zNDc2MSwwLjI1NTU3OCwtMC45OTk2MTRdLFstMS4zOTg1ODksMC4wMzY0ODIsMC42NTg3MV0sWy0xLjEzMzkxOCwwLjA1NjE3LDAuNjk0NzNdLFstMS40MzM2OSwwLjA1ODIyNiwxLjk3Nzg2NV0sWy0yLjUwNTQ1OSwxLjQ5MjI2NiwxLjE5Mjk1XV1cbmV4cG9ydHMuY2VsbHM9W1syLDE2NjEsM10sWzE2NzYsNyw2XSxbNzEyLDE2OTQsOV0sWzMsMTY3NCwxNjYyXSxbMTEsMTY3MiwwXSxbMTcwNSwwLDFdLFs1LDYsMTY3NF0sWzQsNSwxNjc0XSxbNyw4LDcxMl0sWzIsMTY2MiwxMF0sWzEsMTAsMTcwNV0sWzExLDE2OTAsMTY3Ml0sWzE3MDUsMTEsMF0sWzUsMTY3Niw2XSxbNyw5LDZdLFs3LDcxMiw5XSxbMiwzLDE2NjJdLFszLDQsMTY3NF0sWzEsMiwxMF0sWzEyLDgyLDE4MzddLFsxODA4LDEyLDE3OTldLFsxODA4LDE3OTksMTc5Nl0sWzEyLDg2MSw4Ml0sWzg2MSwxODA4LDEzXSxbMTgwOCw4NjEsMTJdLFsxNzk5LDEyLDE4MTZdLFsxNjgwLDE0LDE0NDRdLFsxNSwxNywxNl0sWzE0LDE2NzgsMTcwMF0sWzE2LDE3LDE2NzldLFsxNSwxNjYwLDE3XSxbMTQsMTA4NCwxNjc4XSxbMTUsMTcwOCwxOF0sWzE1LDE4LDE2NjBdLFsxNjgwLDEwODQsMTRdLFsxNjgwLDE1LDEwODRdLFsxNSwxNjgwLDE3MDhdLFs3OTMsODEzLDExOV0sWzEwNzYsNzkzLDExOV0sWzEwNzYsMTgzNiwyMl0sWzIzLDE5LDIwXSxbMjEsMTA3NiwyMl0sWzIxLDIyLDIzXSxbMjMsMjAsMjFdLFsxMDc2LDExOSwxODM2XSxbODA2LDYzNCw0NzBdLFs0MzIsMTM0OSw4MDZdLFsyNTEsNDIsMTI1XSxbODA5LDExNzEsNzkxXSxbOTUzLDYzMSw4MjddLFs2MzQsMTIxMCwxMTc2XSxbMTU3LDE4MzIsMTgzNF0sWzU2LDIxOSw1M10sWzEyNiwzOCw4M10sWzM3LDg1LDQzXSxbNTksMTE1MSwxMTU0XSxbODMsNzUsNDFdLFs3Nyw4NSwxMzhdLFsyMDEsOTQ4LDQ2XSxbMTM2MiwzNiwzN10sWzQ1Miw3NzUsODg1XSxbMTIzNyw5NSwxMDRdLFs5NjYsOTYzLDEyNjJdLFs4NSw3Nyw0M10sWzM2LDg1LDM3XSxbMTAxOCw0MzksMTAxOV0sWzQxLDIyNSw0ODFdLFs4NSw4MywxMjddLFs5Myw4Myw0MV0sWzkzNSw5NzIsOTYyXSxbMTE2LDkzLDEwMF0sWzk4LDgyLDgxM10sWzQxLDc1LDIyNV0sWzI5OCw3NTEsNTRdLFsxMDIxLDQxNSwxMDE4XSxbNzcsMTM4LDEyOF0sWzc2Niw4MjMsMTM0N10sWzU5MywxMjEsNTczXSxbOTA1LDg4NSw2NjddLFs3ODYsNzQ0LDc0N10sWzEwMCw0MSwxMDddLFs2MDQsMzM0LDc2NV0sWzc3OSw0NTAsODI1XSxbOTY4LDk2Miw5NjldLFsyMjUsMzY1LDQ4MV0sWzM2NSwyODMsMTk2XSxbMTYxLDE2MCwzMDNdLFs4NzUsMzk5LDE1OF0sWzMyOCwxODE3LDk1NF0sWzYyLDYxLDEwNzldLFszNTgsODEsNzJdLFs3NCwyMTEsMTMzXSxbMTYwLDE2MSwxMzhdLFs5MSw2MiwxMDc5XSxbMTY3LDU2LDE0MDVdLFs1NiwxNjcsMjE5XSxbOTEzLDkxNCw0OF0sWzM0NCw1NywxMDJdLFs0Myw3NywxMjhdLFsxMDc1LDk3LDEwNzldLFszODksODgyLDg4N10sWzIxOSwxMDgsNTNdLFsxMjQyLDg1OSwxMjBdLFs2MDQsODQwLDYxOF0sWzc1NCw4Nyw3NjJdLFsxOTcsMzYsMTM2Ml0sWzE0MzksODgsMTIwMF0sWzE2NTIsMzA0LDg5XSxbODEsNDQsOTQwXSxbNDQ1LDQ2MywxNTFdLFs3MTcsNTIwLDkyXSxbMTI5LDExNiwxMDBdLFsxNjY2LDE4MTEsNjI0XSxbMTA3OSw5Nyw5MV0sWzYyLDkxLDcxXSxbNjg4LDg5OCw1MjZdLFs0NjMsNzQsMTMzXSxbMjc4LDgyNiw5OV0sWzk2MSwzNzIsNDJdLFs3OTksOTQsMTAwN10sWzEwMCw5Myw0MV0sWzEzMTQsOTQzLDEzMDFdLFsxODQsMjMwLDEwOV0sWzg3NSwxMTk1LDIzMV0sWzEzMywxNzYsMTg5XSxbNzUxLDc1NSw4MjZdLFsxMDEsMTAyLDU3XSxbMTE5OCw1MTMsMTE3XSxbNzQ4LDUxOCw5N10sWzExNDUsMTQ4NCwxMzA0XSxbMzU4LDY1OCw4MV0sWzk3MSw2NzIsOTkzXSxbNDQ1LDE1MSw0NTZdLFsyNTIsNjIxLDEyMl0sWzM2LDI3MSwxMjZdLFs4NSwzNiwxMjZdLFsxMTYsODMsOTNdLFsxNDEsMTcxLDE3NDddLFsxMDgxLDg4MywxMDNdLFsxMzk4LDE0NTQsMTQ5XSxbNDU3LDEyMSw1OTNdLFsxMjcsMTE2LDMwM10sWzY5Nyw3MCw4OTFdLFs0NTcsODkxLDE2NTJdLFsxMDU4LDE2NjgsMTEyXSxbNTE4LDEzMCw5N10sWzIxNCwzMTksMTMxXSxbMTg1LDE0NTEsMTQ0OV0sWzQ2MywxMzMsNTE2XSxbMTQyOCwxMjMsMTc3XSxbMTEzLDg2Miw1NjFdLFsyMTUsMjQ4LDEzNl0sWzE4Niw0MiwyNTFdLFsxMjcsODMsMTE2XSxbMTYwLDg1LDEyN10sWzE2MiwxMjksMTQwXSxbMTU0LDE2OSwxMDgwXSxbMTY5LDE3MCwxMDgwXSxbMjEwLDE3NCwxNjZdLFsxNTI5LDE0OTIsMTUyNF0sWzQ1MCw4NzUsMjMxXSxbMzk5LDg3NSw0NTBdLFsxNzEsMTQxLDE3MF0sWzExMywxMTU1LDQ1Ml0sWzEzMSwzMTksMzYwXSxbNDQsMTc1LDkwNF0sWzQ1Miw4NzIsMTEzXSxbNzQ2LDc1NCw0MDddLFsxNDcsMTQ5LDE1MF0sWzMwOSwzOTAsMTE0OF0sWzUzLDE4NiwyODNdLFs3NTcsMTU4LDc5N10sWzMwMywxMjksMTYyXSxbNDI5LDMwMywxNjJdLFsxNTQsMTY4LDE2OV0sWzY3MywxNjQsMTkzXSxbMzgsMjcxLDc1XSxbMzIwLDI4OCwxMDIyXSxbMjQ2LDQ3NiwxNzNdLFsxNzUsNTQ4LDkwNF0sWzE4Miw3MjgsNDU2XSxbMTk5LDE3MCwxNjldLFsxNjgsMTk5LDE2OV0sWzE5OSwxNzEsMTcwXSxbMTg0LDIzOCwyMzBdLFsyNDYsMjQ3LDE4MF0sWzE0OTYsMTQ4MywxNDY3XSxbMTQ3LDE1MCwxNDhdLFs4MjgsNDcyLDQ0NV0sWzUzLDEwOCwxODZdLFs1Niw1MywyNzFdLFsxODYsOTYxLDQyXSxbMTM0MiwzOTEsNTddLFsxNjY0LDE1NywxODM0XSxbMTA3MCwyMDQsMTc4XSxbMTc4LDIwNCwxNzldLFsyODUsMjE1LDI5NV0sWzY5Miw1NSwzNjBdLFsxOTIsMTkzLDI4Nl0sWzM1OSw2NzMsMjA5XSxbNTg2LDE5NSw2NTNdLFsxMjEsODksNTczXSxbMjAyLDE3MSwxOTldLFsyMzgsNTE1LDMxMV0sWzE3NCwyMTAsMjQwXSxbMTc0LDEwNSwxNjZdLFs3MTcsMjc2LDU5NV0sWzExNTUsMTE0OSw0NTJdLFsxNDA1LDU2LDE5N10sWzUzLDI4MywzMF0sWzc1LDUzLDMwXSxbNDUsMjM1LDE2NTFdLFsyMTAsMTY2LDQ5MF0sWzE4MSwxOTMsMTkyXSxbMTg1LDYyMCwyMTddLFsyNiw3OTgsNzU5XSxbMTA3MCwyMjYsMjA0XSxbMjIwLDE4NywxNzldLFsyMjAsMTY4LDE4N10sWzIwMiwyMjIsMTcxXSxbMzU5LDIwOSwxODFdLFsxODIsNDU2LDczNl0sWzk2NCwxNjcsMTQwNV0sWzc2LDI1MCw0MTRdLFs4MDcsMTI4MCwxODMzXSxbNzAsODgzLDE2NTJdLFsyMjcsMTc5LDIwNF0sWzIyMSwxOTksMTY4XSxbMjIxLDIwMiwxOTldLFszNjAsNDk0LDEzMV0sWzIxNCwyNDEsMzE5XSxbMTA1LDI0NywxNjZdLFsyMDUsMjAzLDI2MF0sWzM4OCw0ODAsOTM5XSxbNDgyLDg1NSwyMTFdLFs4LDgwNywxODMzXSxbMjI2LDI1NSwyMDRdLFsyMjgsMjIxLDE2OF0sWzE2NiwxNzMsNDkwXSxbNzAxLDM2OSw3MDJdLFsyMTEsODU1LDI2Ml0sWzYzMSw5MjAsNjMwXSxbMTQ0OCwxMTQ3LDE1ODRdLFsyNTUsMjI3LDIwNF0sWzIzNywyMjAsMTc5XSxbMjI4LDE2OCwyMjBdLFsyMjIsMjU2LDU1NV0sWzIxNSwyNTksMjc5XSxbMTI2LDI3MSwzOF0sWzEwOCw1MCwxODZdLFsyMjcsMjM2LDE3OV0sWzIzNiwyMzcsMTc5XSxbMjIwLDIzNywyMjhdLFsyMjgsMjAyLDIyMV0sWzI1NiwyMjIsMjAyXSxbNTU1LDI1NiwyMjldLFsyNTksMTUyLDI3OV0sWzI3LDEyOTYsMzFdLFsxODYsNTAsOTYxXSxbOTYxLDIzNCwzNzJdLFsxNjUxLDIzNSw4MTJdLFsxNTcyLDExNDcsMTQ0OF0sWzI1NSwyMjYsMTc3OF0sWzI1NSwyMzYsMjI3XSxbMjU2LDI1NywyMjldLFsxMDYsMTg0LDEwOV0sWzI0MSw0MTAsMTg4XSxbMTc3LDU3OCw2MjBdLFsyMDksNjczLDE4MV0sWzExMzYsMTQ1Nyw3OV0sWzE1MDcsMjQ1LDcxOF0sWzI1NSwyNzMsMjM2XSxbMjc1LDQxMCwyNDFdLFsyMDYsODUxLDI1MF0sWzE0NTksMjUzLDE1OTVdLFsxNDA2LDY3NywxNjUwXSxbMjI4LDI3NCwyMDJdLFsyMDIsMjgxLDI1Nl0sWzM0OCwyMzksNDk2XSxbMjA1LDE3MiwyMDNdLFszNjksMjQ4LDcwMl0sWzI2MSw1NTAsMjE4XSxbMjYxLDQ2NSw1NTBdLFs1NzQsMjQzLDU2Nl0sWzkyMSw5MDAsMTIyMF0sWzI5MSwyNzMsMjU1XSxbMzQ4LDIzOCwyNjVdLFsxMDksMjMwLDE5NF0sWzE0OSwzODAsMzIzXSxbNDQzLDI3MCw0MjFdLFsyNzIsMjkxLDI1NV0sWzI3NCwyMjgsMjM3XSxbMjc0LDI5MiwyMDJdLFsyODEsMjU3LDI1Nl0sWzI3Niw1NDMsMzQxXSxbMTUyLDI1OSwyNzVdLFsxMTExLDgzMSwyNDldLFs2MzIsNTU2LDM2NF0sWzI5OSwyNzMsMjkxXSxbMjk5LDIzNiwyNzNdLFsyODAsMjM3LDIzNl0sWzIwMiwyOTIsMjgxXSxbMjQ3LDI0NiwxNzNdLFsyODIsNDksNjZdLFsxNjIwLDEyMzMsMTU1M10sWzI5OSwyODAsMjM2XSxbMjgwLDMwNSwyMzddLFsyMzcsMzA1LDI3NF0sWzMwNiwyOTIsMjc0XSxbMzMwLDI1NywyODFdLFsyNDYsMTk0LDI2NF0sWzE2NiwyNDcsMTczXSxbOTEyLDg5NCw4OTZdLFs2MTEsMzIwLDI0NF0sWzExNTQsMTAyMCw5MDddLFs5NjksOTYyLDI5MF0sWzI3MiwyOTksMjkxXSxbMzA1LDMxOCwyNzRdLFsxNDUsMjEyLDI0MF0sWzE2NCwyNDgsMjg1XSxbMjU5LDI3NywyNzVdLFsxOTMsMTY0LDI5NV0sWzI2OSwyNDAsMjEwXSxbMTAzMywyODgsMzIwXSxbNDYsOTQ4LDIwNl0sWzMzNiwyODAsMjk5XSxbMzMwLDI4MSwyOTJdLFsyNTcsMzA3LDMwMF0sWzM2OSwxMzYsMjQ4XSxbMTQ1LDI0MCwyNjldLFs1MDIsODQsNDY1XSxbMTkzLDI5NSwyODZdLFsxNjQsMjg1LDI5NV0sWzI4MiwzMDIsNDldLFsxNjEsMzAzLDQyOV0sWzMxOCwzMDYsMjc0XSxbMzA2LDMzMCwyOTJdLFszMTUsMjU3LDMzMF0sWzMxNSwzMDcsMjU3XSxbMzA3LDM1MiwzMDBdLFszMDAsMzUyLDMwOF0sWzI3NSwyNzcsNDAzXSxbMzUzLDExNDEsMzMzXSxbMTQyMCw0MjUsNDddLFs2MTEsMzEzLDMyMF0sWzg1LDEyNiw4M10sWzEyOCwxMTgwLDQzXSxbMzAzLDExNiwxMjldLFsyODAsMzE0LDMwNV0sWzMxNCwzMTgsMzA1XSxbMTkwLDE4MSwyNDJdLFsyMDMsMjE0LDEzMV0sWzgyMCw3OTUsODE1XSxbMzIyLDI5OSwyNzJdLFszMjIsMzM2LDI5OV0sWzMxNSwzMzksMzA3XSxbMTcyLDE1Miw2MTddLFsxNzIsMjE0LDIwM10sWzMyMSwxMDMzLDMyMF0sWzE0MDEsOTQxLDk0Nl0sWzg1LDE2MCwxMzhdLFs5NzYsNDU0LDk1MV0sWzc0Nyw2MCw3ODZdLFszMTcsMzIyLDI3Ml0sWzMzOSwzNTIsMzA3XSxbMjY2LDMzLDg2N10sWzE2MywyMjQsMjE4XSxbMjQ3LDYxNCwxODBdLFs2NDgsNjM5LDU1M10sWzM4OCwxNzIsMjA1XSxbNjExLDM0NSwzMTNdLFszMTMsMzQ1LDMyMF0sWzE2MCwxMjcsMzAzXSxbNDU0LDY3Miw5NTFdLFszMTcsMzI5LDMyMl0sWzMxNCwyODAsMzM2XSxbMzA2LDMzOCwzMzBdLFszMzAsMzM5LDMxNV0sWzEyMzYsMTE1LDQzNl0sWzM0MiwzMjEsMzIwXSxbMTA0NiwzNTUsMzI4XSxbMzI4LDM0NiwzMjVdLFszMjUsMzQ2LDMxN10sWzM2NywzMTQsMzM2XSxbMzE0LDMzNywzMThdLFszMzcsMzA2LDMxOF0sWzMzOCwzNDMsMzMwXSxbMzQyLDMyMCwzNDVdLFszNTUsMzQ5LDMyOF0sWzM0NiwzMjksMzE3XSxbMzQ3LDMzNiwzMjJdLFszMTQsMzYyLDMzN10sWzMzMCwzNDMsMzM5XSxbMzQwLDMwOCwzNTJdLFsxMzUsOTA2LDEwMjJdLFsyMzksMTU2LDQ5MV0sWzE5NCwyMzAsNDg2XSxbNDAsMTAxNSwxMDAzXSxbMzIxLDM1NSwxMDQ2XSxbMzI5LDM4MiwzMjJdLFszODIsMzQ3LDMyMl0sWzM0NywzNjcsMzM2XSxbMzM3LDM3MSwzMDZdLFszMDYsMzcxLDMzOF0sWzE2ODEsMjk2LDE0OTNdLFsyODYsMTcyLDM4OF0sWzIzMCwzNDgsNDg2XSxbMzQ4LDE4Myw0ODZdLFszODQsMzMyLDgzMF0sWzMyOCwzNDksMzQ2XSxbMzY3LDM2MiwzMTRdLFszNzEsMzQzLDMzOF0sWzMzOSwzNTEsMzUyXSxbNTcsMzQ0LDc4XSxbMzQyLDM1NSwzMjFdLFszODYsMzQ2LDM0OV0sWzM4NiwzNTAsMzQ2XSxbMzQ2LDM1MCwzMjldLFszNDcsMzY2LDM2N10sWzM0MywzNjMsMzM5XSxbMzIzLDM4MCwzMjRdLFsxNTIsMjc1LDI0MV0sWzM0NSwxMDQ1LDM0Ml0sWzM1MCwzNzQsMzI5XSxbMzM5LDM2MywzNTFdLFsyMzQsMzQwLDM1Ml0sWzM1MywzNjEsMzU0XSxbNDAsMzQsMTAxNV0sWzM3MywzNTUsMzQyXSxbMzczLDM0OSwzNTVdLFszNzQsMzgyLDMyOV0sWzM2NiwzNDcsMzgyXSxbMzcxLDM2MywzNDNdLFszNTEsMzc5LDM1Ml0sWzM3OSwzNzIsMzUyXSxbMzcyLDIzNCwzNTJdLFsxNTYsMTkwLDQ5MV0sWzMxOSwyNDEsNjkyXSxbMzU0LDM2MSwzMV0sWzM2NiwzNzcsMzY3XSxbMzYzLDM3OSwzNTFdLFsxMzMsNTkwLDUxNl0sWzE5Nyw1NiwyNzFdLFsxMDQ1LDM3MCwzNDJdLFszNzAsMzczLDM0Ml0sWzM3NCwzNTAsMzg2XSxbMzc3LDM2NiwzODJdLFszNjcsMzk1LDM2Ml0sWzQwMCwzMzcsMzYyXSxbNDAwLDM3MSwzMzddLFszNzgsMzYzLDM3MV0sWzEwNiwxMDksNjE0XSxbMTgxLDY3MywxOTNdLFs5NTMsOTIwLDYzMV0sWzM3NiwzNDksMzczXSxbMzc2LDM4NiwzNDldLFszNzgsMzc5LDM2M10sWzIyNCwzNzUsMjE4XSxbMjc5LDE1MiwxNzJdLFszNjEsNjE5LDM4MV0sWzEzNDcsODIzLDc5NV0sWzc2MCw4NTcsMzg0XSxbMzkyLDM3NCwzODZdLFszOTQsMzk1LDM2N10sWzM4MywzNzEsNDAwXSxbMzgzLDM3OCwzNzFdLFsyMTgsMzc1LDI2MV0sWzE5NywyNzEsMzZdLFs0MTQsNDU0LDk3Nl0sWzM4NSwzNzYsMzczXSxbMTA1MSwzODIsMzc0XSxbMzg3LDM5NCwzNjddLFszNzcsMzg3LDM2N10sWzM5NSw0MDAsMzYyXSxbMjc5LDE3MiwyOTVdLFszMCwzNjUsMjI1XSxbNDUwLDIzMSw4MjVdLFszODUsMzczLDM3MF0sWzM5OCwzNzQsMzkyXSxbMTA1MSwzNzcsMzgyXSxbMzk2LDM3OCwzODNdLFszNDgsNDk2LDE4M10sWzI5NSwxNzIsMjg2XSxbMzU3LDI2OSw0OTVdLFsxMTQ4LDM5MCwxNDExXSxbNzUsMzAsMjI1XSxbMjA2LDc2LDU0XSxbNDEyLDM4NiwzNzZdLFs0MTIsMzkyLDM4Nl0sWzM5NiwzODMsNDAwXSxbNjUxLDExNCw4NzhdLFsxMjMsMTI0MSw1MDZdLFsyMzgsMzExLDI2NV0sWzM4MSw2NTMsMjldLFs2MTgsODE1LDMzNF0sWzQyNywxMDMyLDQxMV0sWzI5OCw0MTQsOTc2XSxbNzkxLDMzMiwzODRdLFsxMjksMTAwLDE0MF0sWzQxMiw0MDQsMzkyXSxbMzkyLDQwNCwzOThdLFsxNDAsMTA3LDM2MF0sWzM5NSwzOTQsNDAwXSxbNDIzLDM3OSwzNzhdLFszODUsNDEyLDM3Nl0sWzQwNiw5NCw1OF0sWzQxOSw0MTUsMTAyMV0sWzQyMiw0MjMsMzc4XSxbNDIzLDEyNSwzNzldLFsyNTgsNTA4LDIzOF0sWzMxMSwxNTYsMjY1XSxbMjEzLDI4Nyw0OTFdLFs0NDksNDExLDEwMjRdLFs0MTIsMTA2OCw0MDRdLFs1NSwxNDAsMzYwXSxbNzYsNDE0LDU0XSxbMzk0LDQxNiw0MDBdLFs0MDAsNDE2LDM5Nl0sWzQyMiwzNzgsMzk2XSxbMTI1OCw3OTYsNzg5XSxbNDI3LDQxMSw0NDldLFs0MjcsMjk3LDEwMzJdLFsxMzg1LDEzNjYsNDgzXSxbNDE3LDQ0OCwyODRdLFsxNTA3LDM0MSwyNDVdLFsxNjIsMTQwLDQ0NF0sWzY1OCw0NCw4MV0sWzQzMywxMjUsNDIzXSxbNDM4LDI1MSwxMjVdLFs0MjksMTYyLDQzOV0sWzEzNDIsNTcsMTM0OF0sWzc2NSw3NjYsNDQyXSxbNjk3LDg5MSw2OTVdLFsxMDU3LDM5Niw0MTZdLFs0NDAsNDIzLDQyMl0sWzQ0MCw0MzMsNDIzXSxbNDMzLDQzOCwxMjVdLFs0MzgsMTk2LDI1MV0sWzc0LDQ4MiwyMTFdLFsxMTM2LDc5LDE0NF0sWzI5LDE5NSw0MjRdLFsyNDIsMTAwNCw0OTJdLFs1Nyw3NTcsMjhdLFs0MTQsMjk4LDU0XSxbMjM4LDM0OCwyMzBdLFsyMjQsMTYzLDEyNF0sWzI5NSwyMTUsMjc5XSxbNDk1LDI2OSw0OTBdLFs0NDksNDQ2LDQyN10sWzQ0NiwyOTcsNDI3XSxbMTAyMCwxMTYzLDkwOV0sWzEyOCwxMzgsNDE5XSxbNjYsOTgwLDQ0M10sWzQxNSw0MzksMTAxOF0sWzExMSwzOTYsMTA1N10sWzExMSw0MjIsMzk2XSxbODQwLDI0OSw4MzFdLFs1OTMsNjY0LDU5Nl0sWzIxOCw1NTAsMTU1XSxbMTA5LDE5NCwxODBdLFs0ODMsMjY4LDg1NV0sWzE2MSw0MTUsNDE5XSxbMTczNywyMzIsNDI4XSxbMzYwLDEwNyw0OTRdLFsxMDA2LDEwMTEsNDEwXSxbNDQ0LDE0MCw1NV0sWzkxOSw4NDMsNDMwXSxbMTkwLDI0MiwyMTNdLFsyNzUsNDAzLDQxMF0sWzEzMSw0OTQsNDg4XSxbNDQ5LDY2Myw0NDZdLFsxMzgsMTYxLDQxOV0sWzEyOCw0MTksMzRdLFs0MzksMTYyLDQ0NF0sWzQ2MCw0NDAsNDIyXSxbNDQwLDQzOCw0MzNdLFs0NzIsNzQsNDQ1XSxbNDkxLDE5MCwyMTNdLFsyMzgsNTA4LDUxNV0sWzQ2LDIwNiw1NF0sWzk3Miw5NDQsOTYyXSxbMTI0MSwxNDI4LDEyODRdLFsxMTEsNDYwLDQyMl0sWzQ3MCw0MzIsODA2XSxbMjQ4LDE2NCw3MDJdLFsxMDI1LDQ2Nyw0NTNdLFs1NTMsMTIzNSw2NDhdLFsyNjMsMTE0LDg4MV0sWzI2NywyOTMsODk2XSxbNDY5LDQzOCw0NDBdLFs0NTUsMTk2LDQzOF0sWzI4NywyNDIsNDkyXSxbMjM5LDI2NSwxNTZdLFsyMTMsMjQyLDI4N10sWzE2ODQsNzQ2LDYzXSxbNjYzLDQ3NCw0NDZdLFs0MTUsMTYxLDQyOV0sWzE0MCwxMDAsMTA3XSxbMTA1NSw0NTksNDY3XSxbNDY5LDQ1NSw0MzhdLFsyNTksNTQyLDI3N10sWzQ0Niw0NzQsNDY2XSxbNDQ2LDQ2Niw0NDddLFs0MzksNDQ0LDEwMTldLFs2MTQsMTA5LDE4MF0sWzE5MCwzNTksMTgxXSxbMTU2LDQ5NywxOTBdLFs3MjYsNDc0LDY2M10sWzEwMjMsNDU4LDQ1OV0sWzQ2MSw0NDAsNDYwXSxbMjY5LDIxMCw0OTBdLFsyNDYsMTgwLDE5NF0sWzU5MCwxMzMsMTg5XSxbMTYzLDIxOCwxNTVdLFs0NjcsNDY4LDQ1M10sWzEwNjMsMTAyOSwxMTFdLFsxMTEsMTAyOSw0NjBdLFsxMDI5LDQ2NCw0NjBdLFs0NjEsNDY5LDQ0MF0sWzE1MCwxNDksMzIzXSxbODI4LDQ0NSw0NTZdLFszNzUsNTAyLDI2MV0sWzQ3NCw0NzUsNDY2XSxbNTczLDQyNiw0NjJdLFs0NzgsMTAyMyw0NzddLFs0NzgsNDU4LDEwMjNdLFs0NTgsNDc5LDQ2N10sWzQ1OSw0NTgsNDY3XSxbNDY4LDM5Myw0NTNdLFs0NjQsNDYxLDQ2MF0sWzQ4NCwzNjUsNDU1XSxbMTIzMiwxODIsMTM4MF0sWzE3Miw2MTcsMjE0XSxbNTQ3LDY5NCwyNzddLFs1NDIsNTQ3LDI3N10sWzE4NCwyNTgsMjM4XSxbMjYxLDUwMiw0NjVdLFs0NjcsNDc5LDQ2OF0sWzQ4NCw0NTUsNDY5XSxbMTM4MCwxODIsODY0XSxbNDc1LDQ3Niw0NjZdLFs4MCw0NDcsNDc2XSxbNDY2LDQ3Niw0NDddLFs0MTUsNDI5LDQzOV0sWzQ3OSw0ODcsNDY4XSxbNDg3LDI4Nyw0NjhdLFs0OTIsMzkzLDQ2OF0sWzI2MCw0NjksNDYxXSxbNDgxLDM2NSw0ODRdLFs1MzEsNDczLDkzMV0sWzY5MiwzNjAsMzE5XSxbNzI2LDQ5NSw0NzRdLFs0NjgsMjg3LDQ5Ml0sWzQ4MCw0NjQsMTAyOV0sWzI2MCw0NjEsNDY0XSxbNDk0LDQ4MSw0ODRdLFs3NCw0NzIsNDgyXSxbMTc0LDI0MCwyMTJdLFsyMjMsMTA2LDYxNF0sWzQ4Niw0NzcsNDg1XSxbNDc4LDQ5Niw0NThdLFs0OTEsNDg3LDQ3OV0sWzEyMyw0MDIsMTc3XSxbNDg4LDQ2OSwyNjBdLFs0ODgsNDg0LDQ2OV0sWzI2NSwyMzksMzQ4XSxbMjQ4LDIxNSwyODVdLFs0NzQsNDkwLDQ3NV0sWzQ3Nyw0ODYsNDc4XSxbNDU4LDQ5Niw0NzldLFsyMzksNDkxLDQ3OV0sWzE1ODQsMTE0NywxMzM0XSxbNDg4LDQ5NCw0ODRdLFs0MDEsMTIzLDUwNl0sWzQ5NSw0OTAsNDc0XSxbNDkwLDE3Myw0NzVdLFs4MCw0NzYsMjY0XSxbNDkxLDI4Nyw0ODddLFs0ODAsMTAyOSwxMDA0XSxbNDgwLDIwNSw0NjRdLFsxNzMsNDc2LDQ3NV0sWzQ4NSwxOTQsNDg2XSxbNDg2LDE4Myw0NzhdLFs0NzgsMTgzLDQ5Nl0sWzQ5NiwyMzksNDc5XSxbODQ4LDExNjYsNjBdLFsyNjgsMjYyLDg1NV0sWzIwNSwyNjAsNDY0XSxbMjYwLDIwMyw0ODhdLFsyMDMsMTMxLDQ4OF0sWzI0NiwyNjQsNDc2XSxbMTk0LDQ4NSwyNjRdLFsxMDAyLDMxMCwxNjY0XSxbMzExLDUxNSw0OTddLFs1MTUsMzU5LDQ5N10sWzU2NSwzNTksNTE1XSxbMTI1MCwxMjM2LDMwMV0sWzczNiw0NTYsMTUxXSxbNjU0LDE3NCw1NjddLFs1NzcsNTM0LDY0OF0sWzUxOSw1MDUsNjQ1XSxbNzI1LDU2NSw1MDhdLFsxNTAsMTcyMywxNDhdLFs1ODQsNTAyLDUwNV0sWzU4NCw1MjYsNTAyXSxbNTAyLDUyNiw4NF0sWzYwNywxOTEsNjgyXSxbNTYwLDQ5OSw2NjBdLFs2MDcsNTE3LDE5MV0sWzEwMzgsNzExLDEyNF0sWzk1MSw2NzIsOTcxXSxbNzE2LDUwNywzNTZdLFs4NjgsNTEzLDExOThdLFs2MTUsNzk0LDYwOF0sWzY4MiwxOTEsMTc0XSxbMTMxMyw5MjgsMTIxMV0sWzYxNywyNDEsMjE0XSxbNTExLDcxLDkxXSxbNDA4LDgwMCw3OTJdLFsxOTIsMjg2LDUyNV0sWzgwLDQ4NSw0NDddLFs5MSw5NywxMzBdLFsxNjc1LDMyNCw4ODhdLFsyMDcsNzU2LDUzMl0sWzU4MiwxMDk3LDExMjRdLFszMTEsNDk3LDE1Nl0sWzUxMCwxMzAsMTQ2XSxbNTIzLDUxMSw1MTBdLFs2MDgsNzA4LDYxNl0sWzU0Niw2OTAsNjUwXSxbNTExLDUyNywzNThdLFs1MzYsMTQ2LDUxOF0sWzQ2NSw0MTgsNTUwXSxbNDE4LDcwOSw3MzVdLFs1MjAsNTE0LDUwMF0sWzU4NCw1MDUsNTE5XSxbNTM2LDUxOCw1MDldLFsxNDYsNTM2LDUxMF0sWzUzOCw1MjcsNTExXSxbODc2LDI2Myw2NjldLFs2NDYsNTI0LDYwNV0sWzUxMCw1MzYsNTIzXSxbNTI3LDE3NSwzNThdLFs3MjQsODc2LDY2OV0sWzcyMSw3MjQsNjc0XSxbNTI0LDY4Myw4MzRdLFs1NTgsNTA5LDUyMl0sWzU1OCw1MzYsNTA5XSxbNTIzLDUzOCw1MTFdLFs2MTEsMjQzLDU3NF0sWzUyOCw3MDYsNTU2XSxbNjY4LDU0MSw0OThdLFs1MjMsNTM3LDUzOF0sWzUyNyw1NDAsMTc1XSxbNTMyLDc1Niw1MzNdLFsxMDEzLDYwLDc0N10sWzU1MSw2OTgsNjk5XSxbOTIsNTIwLDUwMF0sWzUzNSw1MzYsNTU4XSxbNTM2LDU2OSw1MjNdLFs1MzgsNTQwLDUyN10sWzUzOSw1NDgsMTc1XSxbNTY3LDIxMiwxNDVdLFs0MDEsODk2LDI5M10sWzUzNCw2NzUsNjM5XSxbMTUxMCw1OTUsMTUwN10sWzU1Nyw1NDUsNTMwXSxbNTY5LDUzNiw1MzVdLFs1MzcsNTQwLDUzOF0sWzU0MCw1MzksMTc1XSxbNTY5LDUzNyw1MjNdLFsxMTM1LDcxOCw0N10sWzU4Nyw2ODEsNjI2XSxbNTgwLDUzNSw1NThdLFs5OSw3NDcsMjc4XSxbNzAxLDU2NSw3MjVdLFs2NjUsMTMyLDUxNF0sWzY2NSw1MTQsNTc1XSxbMTMyLDU0OSw2NTNdLFsxNzYsNjUxLDE4OV0sWzY1LDQ3LDI2Nl0sWzU5Nyw1NjksNTM1XSxbNTY5LDU4MSw1MzddLFs1MzcsNTgxLDU0MF0sWzU2Myw1MzksNTQwXSxbNTM5LDU2NCw1NDhdLFsxNTA5LDEyMzMsMTQzNF0sWzEzMiw2NTMsNzQwXSxbNTUwLDcxMCwxNTVdLFs3MTQsNzIxLDY0NF0sWzQxMCwxMDExLDE4OF0sWzczMiw1MzQsNTg2XSxbNTYwLDU2Miw3MjldLFs1NTUsNTU3LDIyMl0sWzU4MCw1NTgsNTQ1XSxbNTk3LDUzNSw1ODBdLFs1ODEsNTYzLDU0MF0sWzUsODIxLDE2NzZdLFs1NzYsMjE1LDEzNl0sWzY0OSw0NTcsNzQxXSxbNTY0LDUzOSw1NjNdLFsxMjQsNzExLDIyNF0sWzU1MCw2NjgsNzEwXSxbNTUwLDU0MSw2NjhdLFs1NjUsNzAxLDY3M10sWzU2MCw2MTMsNDk5XSxbMjMzLDUzMiw2MjVdLFs1NDUsNTU1LDU4MF0sWzYwMSw1ODEsNTY5XSxbNTk0LDkwNCw1NDhdLFsxNDYzLDE0MjUsNDM0XSxbMTg1LDE0OSwxNDU0XSxbNzIxLDY3NCw2NDRdLFsxODUsMzgwLDE0OV0sWzU3Nyw0MjQsNTg2XSxbNDYyLDU4Niw1NTldLFs1OTcsNjAxLDU2OV0sWzU5NCw1NDgsNTY0XSxbNTY2LDYwMyw1NzRdLFsxNjUsNTQzLDU0NF0sWzQ1Nyw4OSwxMjFdLFs1ODYsNDI0LDE5NV0sWzcyNSw1ODcsNjA2XSxbMTA3OCw1ODIsMTEyNF0sWzU4OCw5MjUsODY2XSxbNDYyLDU1OSw1OTNdLFsxODksODc4LDU5MF0sWzU1NSwyMjksNTgwXSxbNjAyLDU2Myw1ODFdLFs5MDQsNTk0LDk1Nl0sWzQzNCwxNDI1LDE0MzhdLFsxMDI0LDExMiw4MjFdLFs1NzIsNTg3LDYyNl0sWzYwMCw1OTcsNTgwXSxbNTk5LDU5MSw2NTZdLFs2MDAsNTgwLDIyOV0sWzYwMSw2MjIsNTgxXSxbNTgxLDYyMiw2MDJdLFs2MDIsNTY0LDU2M10sWzYwMiw1OTQsNTY0XSxbNjAzLDYxMSw1NzRdLFs0OTgsNTI5LDU0Nl0sWzY5NywxMTQ1LDcwXSxbNTkyLDYyOCw2MjZdLFs2MTAsNTk3LDYwMF0sWzU5Nyw2MTAsNjAxXSxbMjIyLDU1NywxNzFdLFs2MDQsNzY1LDc5OV0sWzU3Myw0NjIsNTkzXSxbMTMzLDIwMCwxNzZdLFs3MjksNjA3LDYyN10sWzEwMTEsNjkyLDE4OF0sWzUxOCwxNDYsMTMwXSxbNTg1LDY4Nyw2MDldLFs2ODIsNjI3LDYwN10sWzE3MTIsNTk5LDY1Nl0sWzU2Miw1OTIsNjA3XSxbNjQzLDY1Niw2NTRdLFsyNTcsNjAwLDIyOV0sWzYwMSw2MzMsNjIyXSxbNjIzLDU5NCw2MDJdLFsxNzQsMjEyLDU2N10sWzcyNSw2MDYsNzAxXSxbNjA5LDcwMSw2MDZdLFs2MTAsNjMzLDYwMV0sWzYzMyw2NDIsNjIyXSxbMzgwLDIxNiwzMjRdLFsxNDIsMTQzLDEyNDldLFs1MDEsNzMyLDU4Nl0sWzUzNCw1NzcsNTg2XSxbNjQ4LDEyMzUsNTc3XSxbNjEwLDY0MSw2MzNdLFszMTAsMTAwMiwxODMxXSxbNjE4LDMzNCw2MDRdLFsxNzEwLDE0NSwyNjldLFs3MDcsNDk4LDY1OV0sWzUwMSw1ODYsNDYyXSxbNjI1LDUwMSw0NjJdLFs3MjYsNjYzLDY5MV0sWzMwMCw2MDAsMjU3XSxbNjQxLDYxMCw2MDBdLFs2MjIsNjI5LDYwMl0sWzYwMiw2MjksNjIzXSxbNTUsNjkyLDQ0NF0sWzUxOCw3NDgsNTA5XSxbOTI5LDE1MTUsMTQxMV0sWzYyMCw1NzgsMjY3XSxbNzEsNTExLDM1OF0sWzcwNyw2NjgsNDk4XSxbNjUwLDY4Nyw1ODVdLFs2MDAsMzAwLDY0MV0sWzY0MSw2NTcsNjMzXSxbMTY3NSw4ODgsMTY2OV0sWzYyMiw2MzYsNjI5XSxbNTA1LDUwMiwzNzVdLFs1NDEsNTI5LDQ5OF0sWzMzMiw0MjAsMTA1M10sWzYzNyw1NTEsNjM4XSxbNTM0LDYzOSw2NDhdLFs2OSw2MjMsODczXSxbMzAwLDUxMiw2NDFdLFs2MzMsNjU3LDY0Ml0sWzU2Miw2NjAsNTc5XSxbNjg3LDYzNyw2MzhdLFs3MDksNjQ2LDYwNV0sWzc3NSw3MzgsODg1XSxbNTU5LDU0OSwxMzJdLFs2NDYsNjgzLDUyNF0sWzY0MSw1MTIsNjU3XSxbMjY2LDg5Nyw5NDldLFsxNzEyLDY0MywxNjU3XSxbMTg0LDcyNywyNThdLFs2NzQsNzI0LDY2OV0sWzY5OSw3MTQsNjQ3XSxbNjI4LDY1OSw1NzJdLFs2NTcsNjYyLDY0Ml0sWzU3MSw4ODEsNjUxXSxbNTE3LDYwNyw1MDRdLFs1OTgsNzA2LDUyOF0sWzU5OCw2OTQsNTQ3XSxbNjQwLDU1Miw1NjBdLFs2NTUsNjkzLDY5OF0sWzY5OCw2OTMsNzIxXSxbOTEsNTEwLDUxMV0sWzE0NCwzMDEsMTEzNl0sWzMyNCwyMTYsODg4XSxbODcwLDc2NCwxNjgxXSxbNTc1LDUxNCw1MjBdLFsyNzYsNTQ0LDU0M10sWzY1OCwxNzUsNDRdLFs2NDUsNTA1LDcxMV0sWzY1OSw1NDYsNTcyXSxbNzAwLDUyNCw2NTVdLFs2MDUsNzAwLDUyOV0sWzI2Niw4NjcsODk3XSxbMTY5NSwxNTI2LDc2NF0sWzU3OSw2NTksNjI4XSxbNjU0LDU5MSw2ODJdLFs1ODYsNTQ5LDU1OV0sWzY5OCw3MjEsNzE0XSxbODk2LDQwMSw1MDZdLFs2NDAsNzM0LDU5OV0sWzY2NCw2NjUsNTc1XSxbNjIxLDYyOSw2MzZdLFsxNzEyLDY1Niw2NDNdLFs1NDcsNjQ0LDU5OF0sWzcxMCw2NjgsNzA3XSxbNjQwLDU2MCw3MzRdLFs2NTUsNjk4LDU1MV0sWzY5NCw1MjgsMjc3XSxbNTEyLDY2Miw2NTddLFs1MDQsNTkyLDYyNl0sWzY4OCw1ODQsNTE5XSxbMTUyLDI0MSw2MTddLFs1ODcsNzI1LDY4MV0sWzU5OCw2NjksNzA2XSxbNTI2LDY3MCw4NF0sWzU5OCw1MjgsNjk0XSxbNzEwLDcwNyw0OTldLFs1NzksNTkyLDU2Ml0sWzY2MCw2NTksNTc5XSxbMzIzLDMyNCwxMTM0XSxbMzI2LDg5NSw0NzNdLFsxOTUsMjksNjUzXSxbODQsNjcwLDkxNV0sWzU2MCw2NjAsNTYyXSxbNTA0LDYyNiw2ODFdLFs3MTEsNTA1LDIyNF0sWzY1MSw4ODEsMTE0XSxbMjE2LDYyMCw4ODldLFsxMzYyLDY3OCwxOTddLFs0OTMsOTksNDhdLFsxNjU5LDY5MSw2ODBdLFs1MjksNjkwLDU0Nl0sWzQzMCw4NDMsNzA5XSxbNjU1LDUyNCw2OTNdLFsxNzQsMTkxLDEwNV0sWzY3NCw2NjksNTk4XSxbOTgsNzEyLDgyXSxbNTcyLDU0Niw1ODVdLFs3Miw2MSw3MV0sWzkxMiw5MTEsODk0XSxbMTA2LDIyMywxODRdLFs2NjQsMTMyLDY2NV0sWzg0Myw2NDYsNzA5XSxbNjM1LDY5OSwxMzZdLFs2OTksNjk4LDcxNF0sWzU5MywxMzIsNjY0XSxbNjg4LDUyNiw1ODRdLFsxODUsMTc3LDYyMF0sWzUzMyw2NzUsNTM0XSxbNjg3LDYzOCw2MzVdLFsxNjUyLDg5LDQ1N10sWzg5Niw1MDYsOTEyXSxbMTMyLDc0MCw1MTRdLFs2ODksNjg1LDI4Ml0sWzY5MSw0NDksNjgwXSxbNDgsNDM2LDQ5M10sWzEzNiw2OTksNjQ3XSxbNzM5LDY0MCw1NTRdLFs1NDksNTg2LDY1M10sWzUzMiw1MzMsNjI1XSxbMTUzMCw2OTUsNjQ5XSxbNjUzLDM4MSw2MTldLFs3MzYsMTUxLDUzMV0sWzE4OCw2OTIsMjQxXSxbMTc3LDQwMiw1NzhdLFszMyw2ODksODY3XSxbNjg5LDMzLDY4NV0sWzU5Myw1NTksMTMyXSxbOTQ5LDY1LDI2Nl0sWzcxMSwxMDM4LDY2MV0sWzkzOSw0ODAsMTAwNF0sWzYwOSwzNjksNzAxXSxbNjE2LDU1Miw2MTVdLFs2MTksMzYxLDc0MF0sWzE1MSw0NjMsNTE2XSxbNTEzLDUyMSwxMTddLFs2OTEsNjYzLDQ0OV0sWzE4NiwyNTEsMTk2XSxbMzMzLDMwMiwzMjddLFs2MTMsNTYwLDU1Ml0sWzYxNiw2MTMsNTUyXSxbNjkwLDU1MSw2MzddLFs2NjAsNzA3LDY1OV0sWzcwNCwyMDgsMTIwM10sWzQxOCw3MzUsNTUwXSxbMTYzLDcwOCwxMjRdLFs1MjQsODM0LDY5M10sWzU1NCw2NDAsNTk5XSxbMjQ1LDM0MSwxNjVdLFs1NjUsNjczLDM1OV0sWzE1NSw3MTAsNzA4XSxbMTA1LDE5MSw1MTddLFsxNTE1LDE5OCwxNDExXSxbMTcwOSw1NTQsNTk5XSxbNjAsMjg5LDc4Nl0sWzgzOCwxMjk1LDEzOTldLFs1MzMsNTM0LDYyNV0sWzcxMCw0OTksNzA4XSxbNTU2LDYzMiw0MTBdLFsyMTcsNjIwLDIxNl0sWzU5MSw2MjcsNjgyXSxbNTA0LDUwMywyMjNdLFs2NDMsNjU0LDU2N10sWzY5MCw2MzcsNjUwXSxbNTQ1LDU1Nyw1NTVdLFsxNzQsNjU0LDY4Ml0sWzcxOSw2OTEsMTY1OV0sWzcyNyw2ODEsNTA4XSxbNjQ1LDcxMSw2NjFdLFs3OTQsNjE1LDczOV0sWzU2NSw1MTUsNTA4XSxbMjgyLDY4NSwzMDJdLFsxMTUwLDM5NywxMTQ5XSxbNjM4LDY5OSw2MzVdLFs1NDQsNjg1LDMzXSxbNzE5LDcyNiw2OTFdLFsxNzQyLDExMjYsMTczM10sWzE3MjQsMTQ3NSwxNDhdLFs1NTYsNDEwLDQwM10sWzE4NSwyMTcsMzgwXSxbNTAzLDUwNCw2ODFdLFsyNzcsNTU2LDQwM10sWzMyLDExNzgsMTU4XSxbMTcxMiwxNzA5LDU5OV0sWzYwNSw1MjksNTQxXSxbNjM1LDEzNiwzNjldLFs2ODcsNjM1LDM2OV0sWzUyOSw3MDAsNjkwXSxbNzAwLDU1MSw2OTBdLFs4OSwzMDQsNTczXSxbNjI1LDUzNCw3MzJdLFs3MzAsMzAyLDY4NV0sWzUwMyw2ODEsNzI3XSxbNzAyLDY3Myw3MDFdLFs3MzAsMzI3LDMwMl0sWzMyNywzNTMsMzMzXSxbNTk2LDY2NCw1NzVdLFs2NjAsNDk5LDcwN10sWzU4NSw1NDYsNjUwXSxbNTYwLDcyOSw3MzRdLFs3MDAsNjU1LDU1MV0sWzE3Niw1NzEsNjUxXSxbNTE3LDUwNCwyMjNdLFs3MzAsNjg1LDU0NF0sWzE2NjEsMTY4Miw3MjZdLFsxNjgyLDQ5NSw3MjZdLFsxMjUwLDMwMSw5MTddLFs2MDUsNTI0LDcwMF0sWzYwOSw2ODcsMzY5XSxbNTE2LDM4OSw4OTVdLFsxNTUzLDY4NiwxMDI3XSxbNjczLDcwMiwxNjRdLFs2NTYsNTkxLDY1NF0sWzUyMCw1OTYsNTc1XSxbNDAyLDEyMyw0MDFdLFs4MjgsNDU2LDcyOF0sWzE2NDUsNjc3LDE2NTNdLFs1MjgsNTU2LDI3N10sWzYzOCw1NTEsNjk5XSxbMTkwLDQ5NywzNTldLFsyNzYsNzMwLDU0NF0sWzExMTcsMTUyNSw5MzNdLFsxMDI3LDY4NiwxMzA2XSxbMTU1LDcwOCwxNjNdLFs3MDksNjA1LDU0MV0sWzY0Nyw2NDQsNTQ3XSxbNjUwLDYzNyw2ODddLFs1OTksNzM0LDU5MV0sWzU3OCwyOTMsMjY3XSxbMTY4MiwzNTcsNDk1XSxbNTEwLDkxLDEzMF0sWzczNCw3MjksNjI3XSxbNTc2LDU0MiwyMTVdLFs3MDksNTQxLDczNV0sWzczNSw1NDEsNTUwXSxbMjc2LDUwMCw3MzBdLFs1MDAsMzI3LDczMF0sWzY1Myw2MTksNzQwXSxbNDE0LDg1MSw0NTRdLFs3MzQsNjI3LDU5MV0sWzcyOSw1NjIsNjA3XSxbNjE1LDU1Miw2NDBdLFs1MjUsMTgxLDE5Ml0sWzMwOCw1MTIsMzAwXSxbMjIzLDUwMyw3MjddLFsyNjYsMTY1LDMzXSxbOTIsNTAwLDI3Nl0sWzMyMSwxMDQ2LDEwMzNdLFs1ODUsNjA5LDYwNl0sWzEyMDAsMTU1OSw4Nl0sWzYyOCw1NzIsNjI2XSxbMzAxLDQzNiw4MDNdLFs3MTQsNjQ0LDY0N10sWzcwOCw0OTksNjEzXSxbNzIxLDY5Myw3MjRdLFs1MTQsMzUzLDMyN10sWzM1Myw3NDAsMzYxXSxbMzQ0LDE1OCw3OF0sWzcwOCw2MTMsNjE2XSxbNjE1LDY0MCw3MzldLFs1MDAsNTE0LDMyN10sWzUxNCw3NDAsMzUzXSxbMTQ0OSwxNzcsMTg1XSxbNDYyLDIzMyw2MjVdLFs4NTEsNDA1LDExNjNdLFs2MDgsNjE2LDYxNV0sWzY0Nyw1NDIsNTc2XSxbNjI1LDczMiw1MDFdLFsxMDk3LDU4MiwxMzExXSxbMTIzNSw0MjQsNTc3XSxbNTc5LDYyOCw1OTJdLFs2MDcsNTkyLDUwNF0sWzI0LDQzMiw0NzBdLFsxMDUsNjE0LDI0N10sWzEwNCw3NDIsNDcxXSxbNTQyLDI1OSwyMTVdLFszNjUsMTk2LDQ1NV0sWzE0MjAsNDcsNjVdLFsyMjMsNzI3LDE4NF0sWzU0Nyw1NDIsNjQ3XSxbNTcyLDU4NSw2MDZdLFs1ODcsNTcyLDYwNl0sWzI2Miw3ODAsMTM3MF0sWzY0Nyw1NzYsMTM2XSxbNjQ0LDY3NCw1OThdLFsyNzEsNTMsNzVdLFs3MjcsNTA4LDI1OF0sWzQ3MSw3NDIsMTQyXSxbNTA1LDM3NSwyMjRdLFszNTcsMTcxMCwyNjldLFs3MjUsNTA4LDY4MV0sWzY1OSw0OTgsNTQ2XSxbNzQzLDExNzgsMzJdLFsxMTk1LDYzNCwyMzFdLFsxMTc2LDI0LDQ3MF0sWzc0MywxMTEwLDExNzhdLFsxMzUsODA5LDg1N10sWzYzLDc0Niw0MDddLFs2MzQsMTE3Niw0NzBdLFsxNTksMTExMiwyN10sWzExNzYsMTY4NSwyNF0sWzM5OSw0NTAsNzc5XSxbMTE3OCw4NTYsODc1XSxbNzUxLDc0NCw1NF0sWzQzNiw0OCw3NzJdLFs2MzQsMTEwOCwxMjEwXSxbNzY5LDEyODUsMTI4Nl0sWzc1MSwyOTgsNzU1XSxbNzQ2LDE2ODQsNzU0XSxbNzU0LDkyNCw4N10sWzcyMiwxNjI1LDc1Nl0sWzg3LDgzOSwxNTNdLFs0ODksNzk1LDgyMF0sWzc1OCw4MDgsMTUxOF0sWzgzOSw4NDAsMTUzXSxbODMxLDExMTEsOTU5XSxbMTExMSw3NDksOTU5XSxbODEwLDEyNTMsMTM2M10sWzEyNDcsMTM5NCw3MTNdLFsxMzg4LDEzMjksMTIwMV0sWzEyNDIsMTIwLDc2MV0sWzg1Nyw3OTEsMzg0XSxbNzU4LDE1MjMsODA4XSxbMjk2LDc2NCwxNTA0XSxbNzAsMTY1Miw4OTFdLFsyMDcsMjMzLDE2MzhdLFsxMzQ4LDU3LDI4XSxbODU4LDQyMCwzMzJdLFs5NjQsMTM3OSwxMjc4XSxbNDIwLDExOTQsODE2XSxbNzg0LDEwNzYsMTE4Nl0sWzEwNzYsMjEsMTE4Nl0sWzE3MTAsNzY3LDFdLFs4NDksODIyLDc3OF0sWzgwNiwxMzcsNzg3XSxbNzg2LDc5MCw3NDRdLFs3OTAsNTQsNzQ0XSxbNzcxLDYzLDQwN10sWzc4NSw4NTIsODE4XSxbNzc0LDE4MjMsMjcyXSxbODk1LDE1MSw1MTZdLFsxMzUsMTAyMiw4MDldLFs5OSw4MjYsNDhdLFs0OCw4MjYsNzU1XSxbODA4LDcwNSw0MDhdLFs4MzMsNDQxLDcxNl0sWzE3MzMsNzQzLDMyXSxbMTM4NSw4MzYsODUyXSxbNzcyLDgyNyw3MzddLFsxMDA1LDQ5LDc4MV0sWzc5MywxNjk3LDgxM10sWzE1MTgsNDQxLDE1MzddLFsxMTM5LDExMzIsODU5XSxbNzgyLDgwMSw3NzBdLFsxNTEwLDE1MzAsNjc2XSxbNzcwLDgxNCw4MzVdLFsyMzEsNzg3LDgyNV0sWzIwNyw3MjIsNzU2XSxbMjYsNzcxLDc5OF0sWzc4Miw4NjMsODY1XSxbODMyLDU0LDc5MF0sWzg2NSw4NDIsNTA3XSxbNzk5LDc2NSw5NF0sWzExNzUsMTI2MSwxMzUzXSxbODAwLDQwOCw4MDVdLFsyNjIsOTg2LDIwMF0sWzc5Miw4MDAsODE0XSxbODAxLDc5Miw3NzBdLFs3MDQsMTIwMywxMTQ4XSxbMzU2LDE1MTQsODIyXSxbMTY1LDU0NCwzM10sWzU2MSw3NzYsMTEzXSxbMTA0Myw3MzgsNzc1XSxbODE1LDgzMSw4MjBdLFs3NzMsNzkyLDgwMV0sWzc3Miw0OCw5MTRdLFs3NzIsNzM3LDgwM10sWzQzNiw3NzIsODAzXSxbODA4LDgxNyw3MDVdLFsxNjI0LDgyMiwxNTI3XSxbNTg4LDExNDQsNzg4XSxbNzk5LDc2Miw2MDRdLFs4MjEsMTUyMCwxNjc2XSxbODU0LDgwMyw2NjZdLFs4MjgsNDgyLDQ3Ml0sWzQ0NSw3NCw0NjNdLFs4MzEsNDg5LDgyMF0sWzgyOCw4MzYsNDgyXSxbNzE2LDc4Miw3NjNdLFszMzQsODE1LDc2Nl0sWzgxNSw4MjMsNzY2XSxbMzM0LDc2Niw3NjVdLFs4MTksODA1LDgzN10sWzE3MTYsMTUyMSwxNDEyXSxbMTY4NCw5MjQsNzU0XSxbODAwLDgwNSw4MTldLFsxNzA5LDgyOSw1NTRdLFs4MDYsMTM0OSwxMzddLFs5OSwxMDEzLDc0N10sWzM0MSw1OTUsMjc2XSxbODE3LDgxMCw4MThdLFsxMTc2LDE2OTEsMTY4NV0sWzc2Myw3ODIsODY1XSxbODMwLDg0NiwxMDUyXSxbODY1LDE0OTksODQyXSxbOTgyLDg0NiwxMDUzXSxbODQ3LDgzMiw3OTBdLFsxMTc4LDg3NSwxNThdLFs4MTcsODE4LDcwNV0sWzEzMDIsMTM5Miw0NV0sWzk2LDQxNywyODRdLFsyMjMsNjE0LDUxN10sWzM1Niw1MDcsMTUxNF0sWzExNjYsODQ4LDExNzldLFsxMzQ5LDQzMiwyNl0sWzcxNyw5MiwyNzZdLFs3NzAsODM1LDg2M10sWzUyMiw1MDksMTc0NV0sWzg0Nyw4NDEsODMyXSxbODMyLDg0MSw0Nl0sWzgyOSw3MzksNTU0XSxbODAyLDgyNCwzOV0sWzM5NywxMDQzLDc3NV0sWzE1NjcsODQ5LDc3OF0sWzEzODUsNDgzLDg1NV0sWzEzNDksMjYsMTM0Nl0sWzQ0MSw4MDEsNzgyXSxbNDAyLDQwMSwyOTNdLFsxMDQzLDY2Nyw3MzhdLFs3NTksNzk4LDEwMDddLFs4MTksODM3LDcyOF0sWzcyOCw4MzcsODI4XSxbODM3LDg1Miw4MjhdLFsxNTM3LDQ0MSw4MzNdLFsxNDgsMTQ3NSwxNDddLFs4MDUsNzA1LDgzN10sWzcxNiw0NDEsNzgyXSxbNDgzLDEzNzEsNzgwXSxbODE0LDgxOSw4NDRdLFs4NDUsNzUzLDEzMzZdLFsxNjYxLDcxOSw0XSxbODYyLDg0Nyw3OTBdLFs3MzcsODI3LDY2Nl0sWzIwMSw0Niw4NDFdLFs4MTAsNzg1LDgxOF0sWzQwOCw3MDUsODA1XSxbMTU2MCwxNTM2LDg0OV0sWzE1ODUsODUzLDE3ODZdLFs3LDE2NjgsODA3XSxbNyw4MDcsOF0sWzgyMiwxNTE0LDE1MjddLFs4MDAsODE5LDgxNF0sWzg0Nyw4NjIsODQxXSxbOTkxLDg1Nyw3NjBdLFs3MDUsODE4LDgzN10sWzgwOCw0MDgsNzczXSxbNDAyLDI5Myw1NzhdLFs3OTEsODU4LDMzMl0sWzE0ODAsMTIyOCwxMjQwXSxbODE0LDg0NCw4MzVdLFs3ODUsMTM4NSw4NTJdLFsxMTMyLDEyMCw4NTldLFsxNzQzLDE3MjYsNjg0XSxbMTcwNCw3ODMsMTI3OV0sWzE2MjMsMTY5NCwxNzMxXSxbOTU5LDQ4OSw4MzFdLFsxNTE4LDgwOCw3NzNdLFs4NjIsODcyLDg0MV0sWzQ0MSw3NzMsODAxXSxbMzMxLDUxMiwzMDhdLFszODAsMjE3LDIxNl0sWzg0MSw4NzIsMjAxXSxbODE4LDg1Miw4MzddLFs0NDgsMTQ4MCwxMjQwXSxbODU2LDExMDgsMTE5NV0sWzE1MjcsMTUxNCwxNTI2XSxbODE5LDE4MiwxMjMyXSxbODcxLDcyNCw2OTNdLFs4NTIsODM2LDgyOF0sWzc3MCw3OTIsODE0XSxbODAzLDczNyw2NjZdLFs3NTEsODI2LDI3OF0sWzE2NzQsMTcyNywxNjk5XSxbODQ5LDM1Niw4MjJdLFs4NzEsNjkzLDgzNF0sWzUwNyw4NDIsMTUxNF0sWzE0MDYsMTA5Nyw4NjldLFsxMzI4LDEzNDksMTM0Nl0sWzgyMyw4MTUsNzk1XSxbNzQ0LDc1MSwyNzhdLFsxMTEwLDg1NiwxMTc4XSxbNTIwLDcxNywzMTZdLFs4NzEsODM0LDY4M10sWzg4NCw4NzYsNzI0XSxbMTY1LDI2Niw0N10sWzcxNiw3NjMsNTA3XSxbMjE2LDg4OSw4ODhdLFs4NTMsMTU4NSwxNTcwXSxbMTUzNiw3MTYsMzU2XSxbODg2LDg3Myw2MjNdLFs3ODIsNzcwLDg2M10sWzQzMiwyNCwyNl0sWzY4Myw4ODIsODcxXSxbODg0LDcyNCw4NzFdLFsxMTQsODc2LDg4NF0sWzUxNiw1OTAsMzg5XSxbMTEsMTIxOCwxNjI4XSxbODYyLDExMyw4NzJdLFs4ODYsNjIzLDYyOV0sWzgzMCwxMDUyLDExMjBdLFs3NjIsMTUzLDYwNF0sWzc3Myw0MDgsNzkyXSxbNzYzLDg2NSw1MDddLFsxNTMsODQwLDYwNF0sWzg4Miw4ODQsODcxXSxbNTMxLDE1MSwzMjZdLFs4ODYsODkwLDg3M10sWzEzMywyNjIsMjAwXSxbODE5LDEyMzIsODQ0XSxbNjIxLDYzNiwxMjJdLFs2NDUsODkyLDUxOV0sWzExMzAsMTA3Niw3ODRdLFsxMTQsMjYzLDg3Nl0sWzE2NzAsMTAsMTY2M10sWzkxMSw2NzAsODk0XSxbNDUyLDg4NSw4NzJdLFs4NzIsODg1LDIwMV0sWzg4Nyw4ODIsNjgzXSxbODc4LDg4NCw4ODJdLFs1OTAsODc4LDg4Ml0sWzg5MCw4NjcsNjg5XSxbODk3LDYyOSw2MjFdLFs4OTcsODg2LDYyOV0sWzgxOSw3MjgsMTgyXSxbNTE5LDg5Myw2ODhdLFs4OTQsNjcwLDUyNl0sWzg5OCw4OTQsNTI2XSxbMTUzNiwzNTYsODQ5XSxbODEwLDEzNjMsNzg1XSxbODc4LDExNCw4ODRdLFs4NzksODg4LDg5Ml0sWzg5Miw4ODksODkzXSxbODkzLDg5OCw2ODhdLFs4OTUsNjgzLDg0M10sWzg5NSw4ODcsNjgzXSxbODg5LDYyMCwyNjddLFs1OTAsODgyLDM4OV0sWzQxOCw0NjUsODRdLFs5NDksODk3LDYyMV0sWzg5Nyw4OTAsODg2XSxbODg5LDI2Nyw4OTNdLFs4OTgsMjY3LDg5Nl0sWzUzMSwzMjYsNDczXSxbMTg5LDY1MSw4NzhdLFs4NDMsNjgzLDY0Nl0sWzg5Nyw4NjcsODkwXSxbODg4LDg4OSw4OTJdLFs4OTMsMjY3LDg5OF0sWzg5Niw4OTQsODk4XSxbNDczLDg5NSw4NDNdLFs4OTUsMzg5LDg4N10sWzk3NCw3MDYsNjY5XSxbNTEzLDExMTUsNTIxXSxbMzI2LDE1MSw4OTVdLFs4MDksNzkxLDg1N10sWzIxMSwyNjIsMTMzXSxbOTIwLDkyMyw5NDddLFs5MjMsOTAsOTQ3XSxbOTAsMjUsOTQ3XSxbMjUsOTcyLDkzNV0sWzY0LDQzMSw4OTldLFs1Miw4OTksOTAxXSxbOTAzLDkwNSw1OV0sWzQzNyw5NjcsNzNdLFs4MzksMTI0Miw3NjFdLFs5MDQsOTc1LDQ0XSxbOTE3LDMwMSwxNDRdLFs5MTUsNjcwLDkxMV0sWzkwNSwyMDEsODg1XSxbMTY4NCw2MywxNjg1XSxbMTAzMywxMTk0LDI4OF0sWzk1MCw5MTMsNzU1XSxbOTEyLDkxOCw5MTFdLFs5NTAsOTE0LDkxM10sWzUwNiw5MTgsOTEyXSxbOTIyLDkxOSw5MTVdLFs5MTEsOTIyLDkxNV0sWzEwMDQsNDUxLDQ5Ml0sWzEyNjMsNTUzLDYzOV0sWzkyMiw5MTEsOTE4XSxbNjMwLDkyMCw5NDddLFs5MTYsNTA2LDkyNl0sWzkxNiw5MTgsNTA2XSxbNTIxLDExMTUsMTA5OF0sWzkxNiw5MjIsOTE4XSxbOTE5LDQxOCw5MTVdLFs4MywzOCw3NV0sWzI0LDE2ODUsNzcxXSxbMTEwLDEyMzAsMTIxM10sWzcxMiw4LDE4MzddLFs5MjIsOTMwLDkxOV0sWzkxOSw0MzAsNDE4XSxbMTM5NSwxNDAyLDExODddLFs5MzAsOTIyLDkxNl0sWzU5NCw2MjMsNjldLFszNSw0MzEsOTY4XSxbMzUsOTY4LDk2OV0sWzg2Niw5MjQsMTY4NF0sWzE2MjUsMTI2Myw2NzVdLFs2MzEsNjMwLDUyXSxbOTMwLDkzMSw5MTldLFs0MzAsNzA5LDQxOF0sWzMwMiwzMzMsNDldLFsxNDQ2LDk3OCwxMTM4XSxbNzk5LDEwMDcsNzk4XSxbOTMxLDg0Myw5MTldLFs5NDcsMjUsNjRdLFs4ODUsNzM4LDY2N10sWzEyNjIsOTYzLDk2NF0sWzg5OSw5NzAsOTAxXSxbMTQwMSw5NDYsOTM4XSxbMTExNyw5MzMsMTA5MV0sWzE2ODUsNjMsNzcxXSxbOTA1LDk0OCwyMDFdLFs5NzksOTM3LDk4MF0sWzk1MSw5NTMsOTUwXSxbOTM3LDI3MCw0NDNdLFsxMTU0LDkwMyw1OV0sWzExOTQsOTU0LDEwNjddLFs5MDksNDA1LDkwN10sWzg1MCwxMTUxLDU5XSxbMTc2OSw4MTEsMTQzMl0sWzc2LDIwNiwyNTBdLFs5MzgsOTQ2LDk2Nl0sWzk2NSw5MjcsOTQyXSxbOTM4LDk2Niw5NTddLFs5NTUsOTc1LDkwNF0sWzkyNyw5NjUsOTM0XSxbNTIsNTEsNjMxXSxbNTksOTA1LDY2N10sWzQzMSw5MzUsOTY4XSxbNzg2LDI4OSw1NjFdLFsyNTIsMTIyLDY3MV0sWzQ4MSw0OTQsMTA3XSxbOTU0LDE4MTcsMTA2N10sWzc5NSwyNSw5MF0sWzk1OCw5NjUsOTQ1XSxbNzk1LDk3MiwyNV0sWzkwMiw5ODMsOTU1XSxbOTcyLDQ4OSw5NDRdLFsxMjU2LDI5LDQyNF0sWzY3MSwzMzEsOTQ1XSxbOTQ2LDk1OCw5NjNdLFs5NTYsOTU1LDkwNF0sWzkwMiw5NTUsOTU2XSxbNjcxLDUxMiwzMzFdLFs5NDUsMzMxLDk2MV0sWzY2Miw2NzEsMTIyXSxbNjcxLDY2Miw1MTJdLFs5MzQsNjUsOTI3XSxbNjMwLDk0Nyw1Ml0sWzY2Niw2MzEsOTEwXSxbODUwLDU5LDY2N10sWzk2MSwzMzEsMjM0XSxbMTAyNCw0MTEsMTA0Ml0sWzg5MCw2OSw4NzNdLFsyNTIsNjcxLDk0NV0sWzk3NSwyOTAsOTQwXSxbMjgzLDE4NiwxOTZdLFszMCwyODMsMzY1XSxbOTUwLDc1NSwyOThdLFs5NDYsOTY1LDk1OF0sWzk4NSwyOTAsOTc1XSxbOTY5LDI5MCw5ODVdLFs0MDUsODUxLDIwNl0sWzkzNSw0MzEsNjRdLFs5NDEsMTQyMywxNDIwXSxbOTY0LDk2MywxNjddLFs5NDIsMjUyLDk0NV0sWzc4LDc1Nyw1N10sWzQ5LDEwMDUsNjZdLFs5MzcsOTc5LDI3MF0sWzYzMSw2NjYsODI3XSxbOTgwLDkzNyw0NDNdLFs2Niw2ODksMjgyXSxbNDIxLDkwMiw5NTZdLFs5NDcsNjQsNTJdLFszNSw5NzksODk5XSxbOTUxLDk3MSw5NTNdLFs3NjIsODcsMTUzXSxbMjcsMzEsMzgxXSxbOTI0LDgzOSw4N10sWzk0Niw5NjMsOTY2XSxbMzMxLDMwOCwzNDBdLFs5NTcsOTY2LDEyNjJdLFs0NzMsODQzLDkzMV0sWzk1Myw5NzEsOTIwXSxbMjcwLDk2OSw5MDJdLFs5MzUsOTYyLDk2OF0sWzUxLDEwMDUsNzgxXSxbOTY5LDk4Myw5MDJdLFs0MzcsNzMsOTQwXSxbNjksNDIxLDk1Nl0sWzc2MSwyNDksODQwXSxbMjYzLDk3NCw2NjldLFs5NjIsOTQ0LDk2N10sWzk2Miw0MzcsMjkwXSxbOTg1LDk3NSw5NTVdLFs5MDcsNDA1LDk0OF0sWzcyMCw5NTcsMTI2Ml0sWzI1LDkzNSw2NF0sWzE3NiwyMDAsNTcxXSxbMTA4LDk0NSw1MF0sWzI1MCw4NTEsNDE0XSxbMjAwLDk4Niw1NzFdLFs4ODEsOTc0LDI2M10sWzgyNyw3NzIsOTUzXSxbOTcwLDg5OSw5ODBdLFsyOSwxNTksMjddLFsyMzQsMzMxLDM0MF0sWzk0OCw0MDUsMjA2XSxbOTgwLDg5OSw5NzldLFs5ODYsOTg0LDU3MV0sWzU3MSw5ODQsODgxXSxbOTkwLDcwNiw5NzRdLFs5NDYsOTM0LDk2NV0sWzk3MCw5ODAsNjZdLFsxMTEzLDE0ODYsMTU1NF0sWzk4NCw5ODEsODgxXSxbODgxLDk4Nyw5NzRdLFs2ODksNjYsNDQzXSxbMTAwNSw5MDEsNjZdLFs5ODMsOTg1LDk1NV0sWzE2NSw0Nyw3MThdLFs5ODcsOTkwLDk3NF0sWzEzNzAsOTg2LDI2Ml0sWzkwMSw5NzAsNjZdLFs1MSw5MDEsMTAwNV0sWzk4MSw5ODcsODgxXSxbOTg4LDcwNiw5OTBdLFs5NDIsOTQ1LDk2NV0sWzI5MCw0MzcsOTQwXSxbNjQsODk5LDUyXSxbOTg4LDU1Niw3MDZdLFs5NDEsOTM0LDk0Nl0sWzQzMSwzNSw4OTldLFs5OTYsOTg5LDk4NF0sWzk4NCw5ODksOTgxXSxbOTgxLDk4OSw5ODddLFszNSw5NjksMjcwXSxbMTM3MCw5OTUsOTg2XSxbOTg2LDk5NSw5ODRdLFs5ODksOTk5LDk4N10sWzk4Nyw5OTIsOTkwXSxbOTkyLDk4OCw5OTBdLFs5NjIsOTY3LDQzN10sWzk1MSw5NTAsOTc2XSxbOTc5LDM1LDI3MF0sWzQyMSwyNzAsOTAyXSxbOTk4LDk5NSwxMzcwXSxbOTg3LDk5OSw5OTJdLFs5ODgsMzY0LDU1Nl0sWzk2OSw5ODUsOTgzXSxbNjg5LDQ0Myw4OTBdLFs5OTUsMTAwMCw5ODRdLFsyMTksOTU4LDEwOF0sWzk5OCwxMDAwLDk5NV0sWzk5OSw5OTcsOTkyXSxbOTE0LDk1Myw3NzJdLFs4NDUsMTMzNiw3NDVdLFs4MDYsNzg3LDIzMV0sWzEwMDAsOTk2LDk4NF0sWzk4OSw5OTYsOTk5XSxbNTAsOTQ1LDk2MV0sWzQ0Myw0MjEsNjldLFs3OTcsMTU4LDc3OV0sWzEwOTgsMTQ2Myw0MzRdLFs5OTYsMTAwOSw5OTldLFsxMDAxLDk4OCw5OTJdLFsxMDAxLDM2NCw5ODhdLFs5MDMsOTA3LDkwNV0sWzI2LDc1OSw5NzNdLFs5OTcsMTAwMSw5OTJdLFs2MzIsMzY0LDEwMDFdLFsxMzQ2LDI2LDk3M10sWzk5OCwxMDA4LDEwMDBdLFsxMDAwLDEwMDksOTk2XSxbNTMxLDkzMSw3MzZdLFsyNTIsOTQ5LDYyMV0sWzI4NiwzODgsNTI1XSxbMTE3NCwxMDA4LDk5OF0sWzEwMDksMTAxMCw5OTldLFs5OTksMTAxMCw5OTddLFsxMDE0LDEwMDEsOTk3XSxbNjE0LDEwNSw1MTddLFs5NTgsOTQ1LDEwOF0sWzUyNSwxMDA0LDI0Ml0sWzk2Myw5NTgsMjE5XSxbMjMzLDQyNiwzMDRdLFsxMDAwLDEwMDgsMTAwOV0sWzEwMTAsMTAxNCw5OTddLFsxMDAxLDEwMDYsNjMyXSxbODI0LDQxMywzOV0sWzY0Miw2MzYsNjIyXSxbNDgwLDM4OCwyMDVdLFsyOCw3NTcsNzk3XSxbMTAxNCwxMDA2LDEwMDFdLFsxMDA2LDQxMCw2MzJdLFs5NzUsOTQwLDQ0XSxbMTIzNCw0MjAsODU4XSxbNTQsODMyLDQ2XSxbMTAwOSwxMDEyLDEwMTBdLFsxNjcsOTYzLDIxOV0sWzQxLDQ4MSwxMDddLFsxMDE3LDEwMTAsMTAxMl0sWzEyMiw2MzYsNjYyXSxbOTM5LDUyNSwzODhdLFs1MjUsOTM5LDEwMDRdLFs5NTAsOTUzLDkxNF0sWzgyOSwxNzM1LDczOV0sWzEwMDgsODgwLDEwMTVdLFsxMDA4LDEwMTUsMTAwOV0sWzEyNjMsNjM5LDY3NV0sWzk1Niw1OTQsNjldLFs3OTUsOTAsMTM0N10sWzExNzksODQ4LDEwMTNdLFs3NTksMTAwNyw5NzNdLFsxMDA5LDEwMTUsMTAxMl0sWzEwMTIsMTAxNiwxMDE3XSxbMTAxNywxMDE0LDEwMTBdLFsxMDE5LDEwMTEsMTAwNl0sWzkyNyw2NSw5NDldLFs2NDksMzE2LDU5NV0sWzkxMyw0OCw3NTVdLFs5NzYsOTUwLDI5OF0sWzEwMDMsMTAxNSw4ODBdLFsxMDE4LDEwMDYsMTAxNF0sWzEwMjEsMTAxOCwxMDE0XSxbNDQ0LDY5MiwxMDExXSxbNDUxLDEwMjksMTA2M10sWzExODUsODUxLDExNjNdLFsyOSwyNywzODFdLFsxODEsNTI1LDI0Ml0sWzEwMjEsMTAxNCwxMDE3XSxbMTAxNiwxMDIxLDEwMTddLFsxMDE4LDEwMTksMTAwNl0sWzEwMTksNDQ0LDEwMTFdLFs5MjcsOTQ5LDk0Ml0sWzQ1MSwzOTMsNDkyXSxbOTAzLDExNTQsOTA3XSxbMzkxLDEwMSw1N10sWzk0LDc2NSw1OF0sWzQxOSwxMDE2LDEwMTJdLFs5NDksMjUyLDk0Ml0sWzkwNywxMDIwLDkwOV0sWzc2NSw0NDIsNThdLFs5NCw0MDYsOTA4XSxbMTAwNyw5NCw5MDhdLFszNCwxMDEyLDEwMTVdLFszNCw0MTksMTAxMl0sWzQxOSwxMDIxLDEwMTZdLFs0NTEsMTA1NywzOTNdLFs5MDcsOTQ4LDkwNV0sWzEwMzQsMTA3MywxMDM5XSxbMTA2MSw5MDYsMTYxOV0sWzEwNjgsOTYwLDEwMzRdLFs0NzEsMTI0OSwxMDRdLFsxMTIsMTAyNCwxMDQyXSxbMzcyLDM3OSwxMjVdLFszNDEsNTQzLDE2NV0sWzE0MSwxMDk0LDE3MF0sWzU2NiwyNDMsMTA2MV0sWzM5OCwxMDM0LDEwMzldLFszMjUsMzE3LDE4MjNdLFsxNDkzLDI5NiwxNzI0XSxbODUwLDY2NywxMDQzXSxbMTA1NCwyOTcsMTA2NV0sWzE2MTksMTM1LDEwNzRdLFsxMDYxLDI0Myw5MDZdLFs2ODAsMTAyNCw4MjFdLFsxMTAzLDk2LDEyNDVdLFsxNDQwLDExMjMsMTQ5MV0sWzEwNDcsMTAyNSwxMDQ0XSxbNjcyLDQ1NCwxMjMxXSxbMTQ4NCw2OTcsMTUzMF0sWzk5Myw2NzIsMTIzMV0sWzE3OCwxNTQsMTA4OF0sWzEwNDQsMTA0MSwxMDY2XSxbMTEyLDEwNjIsMTA1OF0sWzE1MzAsNjQ5LDY3Nl0sWzE3OCwxMDg4LDEwNDBdLFsxMDQ2LDMyOCw5NTRdLFsyNDMsMjQ0LDEwMjJdLFs5NTQsMTE5NCwxMDMzXSxbMTA0Miw0MTEsMTAzMl0sWzk3MSw5OTMsMTA1Nl0sWzk2MCwxMDkzLDEwMzRdLFsxNzU0LDEzMzgsMjMyXSxbMzg1LDEwNjQsNDEyXSxbMTA1NywxMDYzLDExMV0sWzc0OCwxMDcxLDE0NDddLFsxNTMwLDY5Nyw2OTVdLFs5NzEsMTA1NiwxMjcwXSxbOTc3LDEwNTksMTIxMV0sWzY0OSw3NDEsMzE2XSxbMTA2MCwxNDUyLDEwMzBdLFszNTMsMzU0LDEzMjNdLFs2OTUsNzY4LDY0OV0sWzM5OCw0MDQsMTAzNF0sWzU5NiwzMTYsNzQxXSxbMTgzNiwxMTksMTNdLFsxNTEzLDExMTUsMTUyOF0sWzg4MywxMDgxLDE2NTJdLFsxMDM5LDEwNzMsMTA0OF0sWzQ2Miw0MjYsMjMzXSxbMzEsMTI5NiwzNTRdLFsxMDU1LDEwNDcsMTA2Nl0sWzEwMzIsMTA1NCwxMDQ1XSxbMTUyMSwzMTAsMTIyNF0sWzExOSw4NjEsMTNdLFsxMTk0LDEyMzQsMjg4XSxbMTEwOSwxNzcxLDEwNzBdLFsxMTY2LDExNjAsNzc2XSxbMTA0NCwxMDM1LDEwNDFdLFsxMDI2LDk2MCwxMDY0XSxbMTA1MCwxMDMyLDEwNDVdLFsxMDQ5LDEwNDEsMzg3XSxbMTE1LDEwMTMsOTldLFsxMDQ2LDk1NCwxMDMzXSxbMTMyMSw5MjAsOTcxXSxbNjExLDEwNTgsMzQ1XSxbMTA0OCwxMDY2LDEwNDldLFsxMDIzLDEwNTUsMTA3M10sWzEwMjksNDUxLDEwMDRdLFsxMTgsMTA5NCwxNDFdLFsxMDk0LDEwODAsMTcwXSxbMTA0MiwxMDMyLDEwNTBdLFsxMDI2LDEwNjQsMzg1XSxbMTUsMTYsMTA4NF0sWzEwOTYsMTA3OSw2MV0sWzEwNzUsMTA3MSw3NDhdLFszMjUsMTgxNywzMjhdLFs5MDksMTE2Myw0MDVdLFsxMDIyLDEyMzQsODA5XSxbMzc0LDM5OCwxMDUxXSxbMTA4Miw3Miw4MV0sWzEwMjMsMTAzNCwxMDkzXSxbMTgxNywxNzk0LDEwNjddLFs4NiwxNDQ1LDE0MDBdLFsxNTA3LDE1MzUsMTUxMF0sWzEwNzksMTA5NiwxMDc1XSxbNTY4LDE0NzgsMTEwNF0sWzEwNzAsMTc4LDEwNDBdLFsxMDM0LDEwMjMsMTA3M10sWzc3NiwxMTU1LDExM10sWzExMDMsMTQzLDE0Ml0sWzExNDAsODEsNzNdLFsxMDgyLDgxLDExNDBdLFsxMDYwLDEwMzAsOTM2XSxbMTA0MCwxMDg2LDExMDldLFszNzAsMTA2NSwzODVdLFs2MSw3MiwxMDgyXSxbMTA4NywxMDk2LDExNDRdLFsxMDQwLDEwODgsMTA4Nl0sWzE2NTEsODEyLDc1Ml0sWzEwNjIsMTA1MCwxMDQ1XSxbMTg3LDE1NCwxNzhdLFsxNzksMTg3LDE3OF0sWzEwOTksMTM0NCwxMTAxXSxbMTY2OCwxMDU4LDgwN10sWzEwNzMsMTA1NSwxMDQ4XSxbMTA5OSwxMzM2LDEzNDRdLFsxMjgzLDk0MywxMTIzXSxbMTA0OSwzODcsMTA1MV0sWzEwMjQsNjgwLDQ0OV0sWzYxLDEwODIsMTEwMF0sWzk2Nyw3NDksMTExMV0sWzE0MzksMTAzNyw4OF0sWzc0MiwxNTA1LDE0Ml0sWzM5OCwxMDM5LDEwNTFdLFsxMTA3LDEzMzYsMTA5OV0sWzEzNDQsMTU0MiwxMTAxXSxbMTQyLDE1MDUsMTEwM10sWzQ3NywxMDkzLDQ0N10sWzQ3NywxMDIzLDEwOTNdLFs0NzEsMTQyLDEyNDldLFsxMDQxLDEwMzUsMzk0XSxbMTMyOCw1NjgsMTEwNF0sWzYxLDExMDAsMTA5Nl0sWzE1NCwxMDkyLDEwODhdLFsxMTIsMTA0MiwxMDUwXSxbMTU0LDE4NywxNjhdLFs0MzUsMjM1LDQ1XSxbMTA3NSwxMDk2LDEwODddLFs5NywxMDc1LDc0OF0sWzEwNDksMTA2NiwxMDQxXSxbODE2LDEwNjcsMTAyOF0sWzg0Niw5ODIsMTE0Ml0sWzEyNDUsOTYsMjg0XSxbMTA5MiwxNTQsMTA4MF0sWzEwNTcsNDUxLDEwNjNdLFszODcsMzc3LDEwNTFdLFsxMDU1LDEwMjUsMTA0N10sWzEwNzUsMTA4NywxMDg5XSxbMTEwNiwxMTA4LDg1Nl0sWzEwNjgsMTAzNCw0MDRdLFsxNDgwLDE1NDUsODY4XSxbOTA2LDEzNSwxNjE5XSxbMTA3NCw5OTEsMTA5NV0sWzU3MCw1NjYsMTA2MV0sWzEwMjUsNDUzLDEwNDRdLFs3NDUsMTMzNiwxMTA3XSxbMTAzNSwxMDU3LDQxNl0sWzEwOTIsMTEwMiwxMTI5XSxbMTA3NCwxMzUsOTkxXSxbMTEwNSw3NDUsMTEwN10sWzQ0NywxMDI2LDQ0Nl0sWzM5NCwzODcsMTA0MV0sWzczLDgxLDk0MF0sWzExMTgsMTEwOCwxMTA2XSxbMTIxMCwxMTA4LDg3NF0sWzI0MywxMDIyLDkwNl0sWzQxMiwxMDY0LDEwNjhdLFsxMjgwLDYxMSw2MDNdLFs5NjAsNDQ3LDEwOTNdLFsxMDUxLDEwMzksMTA0OV0sWzEwNDAsMTEwOSwxMDcwXSxbMTQ3MSwxMDM3LDE0MzldLFs2OSw4OTAsNDQzXSxbMTM3Nyw3MDMsMTM3NF0sWzEwOTIsMTA4MCwxMTAyXSxbMTA5NiwxMTAwLDc4OF0sWzEwOTYsNzg4LDExNDRdLFsxMTE0LDk2NywxMTExXSxbNDQ2LDEwMjYsMjk3XSxbNzAsMTExMiw4ODNdLFs0NTMsMzkzLDEwNTddLFsxMTE4LDg3NCwxMTA4XSxbMTA1NCwzNzAsMTA0NV0sWzEwODAsMTA5NCwxMTAyXSxbMTAzOSwxMDQ4LDEwNDldLFs0MjgsNzUzLDg0NV0sWzEwNDcsMTA0NCwxMDY2XSxbMTA0NCw0NTMsMTAzNV0sWzE0NzIsNzMxLDE1MTJdLFsxMTI2LDExMjEsNzQzXSxbNzQzLDExMjEsMTExMF0sWzEwMzIsMjk3LDEwNTRdLFsxNDgwLDg2OCwxMjE2XSxbNzEsMzU4LDcyXSxbMTEzMyw5NjcsMTExNF0sWzExMDUsMTExOSw3NDVdLFsxMDM1LDQ1MywxMDU3XSxbMTAyNiw0NDcsOTYwXSxbNDU0LDg1MSwxMTkwXSxbMTAzMCwxNDc3LDY1Ml0sWzU4OSw4MTYsMTAyOF0sWzExMTAsMTEyMSwxMTA2XSxbMTEyMiwxMTE4LDExMDZdLFsxMTE2LDg3NCwxMTE4XSxbMTA0OCwxMDU1LDEwNjZdLFsxMTk0LDEwNjcsODE2XSxbNzQ0LDI3OCw3NDddLFs3NDUsMTEyMCw4NDVdLFs4NDUsMTA1Miw0MjhdLFsxMTA1LDE3ODAsMTExOV0sWzEwNjUsMjk3LDM4NV0sWzEwOTgsMTUyOSwxNDYzXSxbNzMxLDEwNjAsOTM2XSxbMjM1LDQzNCw4MTJdLFsxNDQ1LDE1MjUsMTExN10sWzExMDYsMTEyMSwxMTIyXSxbMTEyMiwxMTI3LDExMThdLFsxMTI3LDExMTYsMTExOF0sWzEwOTQsMTE4LDE3MzJdLFsxMTE5LDExMjAsNzQ1XSxbMTQwNiwxMTI0LDEwOTddLFs0MzUsMTE3LDIzNV0sWzE0NjIsMTQ0MCwxMDM3XSxbMTEyNiwxMTI5LDExMjFdLFsxMDg4LDEwOTIsMTEyOV0sWzExMzMsNzMsOTY3XSxbMTEyMCwxMDUyLDg0NV0sWzgxMiw0MzQsNzUyXSxbMTQ0MSwxNTU5LDEyMDBdLFsxMTMxLDU4OCw0MTNdLFsxMDU0LDEwNjUsMzcwXSxbMjM1LDEwOTgsNDM0XSxbMTA1MiwxMTQyLDQyOF0sWzE3MzcsNDI4LDExNDJdLFsxNDk2LDE0NDYsMTQ4M10sWzExODIsMTA4MywxNjU0XSxbMTEyMSwxMTI5LDExMjJdLFsxNzMyLDExMTYsMTEyN10sWzc2OCw0NTcsNjQ5XSxbNzYxLDExMTQsMjQ5XSxbMTA2NCw5NjAsMTA2OF0sWzExMzUsMTQ4MSwxMTM2XSxbMTEyNiw5NTIsMTEyOV0sWzEwODcsNTg4LDExMzFdLFsxMDg3LDExNDQsNTg4XSxbODU5LDc4OCwxMTM5XSxbMTE0MCwxMTMzLDExMzJdLFsxMTMzLDExNDAsNzNdLFsxODIyLDU3MCwxMDYxXSxbMzk0LDEwMzUsNDE2XSxbMTA1NSwxMDIzLDQ1OV0sWzgwLDI2NCw0ODVdLFsxMTE5LDExMjgsMTEyMF0sWzE0NSwxNjU4LDU2N10sWzY5NSw4OTEsNzY4XSxbMTEyOSwxMTAyLDExMjJdLFsxMTIyLDExMDIsMTEyN10sWzE0MTYsMTA3NywxNDEzXSxbMjk3LDEwMjYsMzg1XSxbMTA1Miw4NDYsMTE0Ml0sWzE0NDUsMTExNywxNDAwXSxbOTUyLDEwODYsMTEyOV0sWzE3MTQsMTA4OSwxMTMxXSxbMTEzMSwxMDg5LDEwODddLFsxMTAwLDExMzksNzg4XSxbMTEyLDEwNTAsMTA2Ml0sWzEzMjMsMzU0LDEyOTZdLFs0OSwzMzMsMTE0MV0sWzExNDIsOTgyLDE3MzddLFs3OSwxNDU3LDEwOTFdLFsxMDg4LDExMjksMTA4Nl0sWzExMDIsMTA5NCwxMTI3XSxbMTEyNywxMDk0LDE3MzJdLFsxMTAwLDEwODIsMTEzOV0sWzEwODIsMTEzMiwxMTM5XSxbMTA4MiwxMTQwLDExMzJdLFsxMTUwLDEwNDMsMzk3XSxbNjAsMTE2NiwyODldLFsxNjk2LDExNDYsMTY5OF0sWzEyOTcsMTIwMiwxMzEzXSxbNDA5LDEyOTcsMTMxM10sWzEyMzQsMTE5NCw0MjBdLFsxNDA4LDEzOTEsMTM5NF0sWzQyNCwxMjM1LDEyNDNdLFsxMjAzLDMwOSwxMTQ4XSxbNDg1LDQ3Nyw0NDddLFsxMTUyLDExNTYsODUwXSxbMTE1MywxMTQ5LDExNTVdLFsxMTUzLDExNTcsMTE0OV0sWzExNDksMTE1MiwxMTUwXSxbMTE1NiwxMTU0LDExNTFdLFs3NzYsMTE1MywxMTU1XSxbMTE1NywxMTUyLDExNDldLFsxMjE3LDEzOTMsMTIwOF0sWzExNTYsMTE1OSwxMTU0XSxbMTE1MywxMTY1LDExNTddLFsxMTY1LDExNTIsMTE1N10sWzExNTksMTAyMCwxMTU0XSxbMTE2MSwxMTUzLDc3Nl0sWzExNjEsMTE2NSwxMTUzXSxbMTE2NSwxMTU4LDExNTJdLFsxMTUyLDExNTgsMTE1Nl0sWzExNTgsMTE1OSwxMTU2XSxbMTE2Niw3NzYsNTYxXSxbMTE2MCwxMTYxLDc3Nl0sWzExNjEsMTE2NCwxMTY1XSxbMTE2MSwxMTYwLDExNjRdLFsxMTU4LDExNjIsMTE1OV0sWzExNTksMTE2MiwxMDIwXSxbMTI3MCwxMzIxLDk3MV0sWzExNjQsMTE3MCwxMTY1XSxbMTE2NSwxMTYyLDExNThdLFsxMTYyLDExNjMsMTAyMF0sWzU4OCw3ODgsOTI1XSxbMTE2NiwxMTY3LDExNjBdLFsxMTY1LDExNzAsMTE2Ml0sWzExNjAsMTE2NywxMTY0XSxbMTE2MiwxMTcwLDExNjNdLFsxMTc5LDExNjcsMTE2Nl0sWzExNjcsMTE2OCwxMTY0XSxbMTE2NCwxMTY4LDExNzBdLFsxMTY4LDExNjksMTE3MF0sWzEyMzQsMTAyMiwyODhdLFs4MDIsMzksODY2XSxbMTE3OSwxMTY4LDExNjddLFsxMTY5LDExNzMsMTE3MF0sWzExNzAsMTE3MywxMTYzXSxbMTE3MywxMTg1LDExNjNdLFsxMzYwLDEyNjcsMTM2NF0sWzExNjksMTE4NSwxMTczXSxbNjExLDI0NCwyNDNdLFs5MDAsMTIyNiwxMzc2XSxbMTI2MCwxNDA4LDEzNTBdLFs2MTgsODQwLDgzMV0sWzExODEsMTE4MywxMTc5XSxbMTE3OSwxMTg0LDExNjhdLFsxMjA4LDEyNzQsMTI5MV0sWzExODMsMTE4NCwxMTc5XSxbMTE2OCwxMTg0LDExNjldLFsxMzg3LDEzOTUsMTI1NF0sWzEyMDgsMTIwNCwxMTcyXSxbMTE4MiwxMTk3LDEwODNdLFsxMTg3LDEwODMsMTE5N10sWzEyMTMsMTE4MywxMTgxXSxbMTE2OSwxMjA3LDExODVdLFsxMzUsODU3LDk5MV0sWzEwMTMsMTIxMywxMTgxXSxbMTE4OSwxMTgzLDEyMTNdLFsxMTgzLDExODksMTE4NF0sWzExNjksMTE4NCwxMjA3XSxbMTIwNywxMTkwLDExODVdLFsxMTgwLDEzODksMTI4OF0sWzExOTEsMTE5MiwxNjQwXSxbMTY0MCwxMTkyLDEwOTBdLFsxMDkwLDEyMDUsMTY1NF0sWzE2NTQsMTIwNSwxMTgyXSxbMTE4OCwxMzk1LDExODddLFsxMTI2LDc0MywxNzMzXSxbNzg4LDg1OSw5MjVdLFs4MDksMTIzNCwxMTcxXSxbMTE5MywxMTk3LDExODJdLFsxMTg5LDExOTksMTE4NF0sWzE2MzksMTE5MSwxNjM3XSxbMTYzOSwxMjEyLDExOTFdLFsxMjA1LDExOTMsMTE4Ml0sWzExOTgsMTE4NywxMTk3XSxbMTE5OSwxMjA3LDExODRdLFszMzIsMTA1Myw4NDZdLFsxMDkwLDExOTIsMTIwNV0sWzExNywxMTg4LDExODddLFs0MzUsMTE4OCwxMTddLFs0MzUsMTIwNiwxMTg4XSxbMTE5OSwxMTg5LDEyMTNdLFs0MjAsODE2LDEwNTNdLFsxMjEyLDEyMTUsMTE5MV0sWzExNywxMTg3LDExOThdLFs0NSwxMjA2LDQzNV0sWzEyMCwxMTMyLDExMzNdLFs4NzQsMTExNiwxMjEwXSxbMTE5MSwxMjE1LDExOTJdLFsxMTkzLDEyMTYsMTE5N10sWzEyMTYsMTE5OCwxMTk3XSxbMTE5OSwxMjE0LDEyMDddLFsxMTcsNTIxLDIzNV0sWzEyMjAsMTMxMSwxMDc4XSxbMTIyMCw5MDAsMTMxMV0sWzE2NTMsMTIxNSwxMjEyXSxbMTE5MiwxMjI1LDEyMDVdLFsxMjA1LDEyMDksMTE5M10sWzEyMDksMTIxNiwxMTkzXSxbMTM4OSwxMjE3LDExNzJdLFsxMjA3LDEyMTQsNDU0XSxbMTcxLDU1NywxNzQ3XSxbMTgwNSwxMDc4LDE3ODddLFsxODA1LDEyMTksMTA3OF0sWzExOTgsMTIxNiw4NjhdLFs2NjYsOTEwLDg1NF0sWzEyMzAsMTIzMSwxMjEzXSxbMTIxMywxMjMxLDExOTldLFsxMTk5LDEyMzEsMTIxNF0sWzEyMTksMTIyMCwxMDc4XSxbMTIxNSwxMjIxLDExOTJdLFsxMTkyLDEyMjEsMTIyNV0sWzEyMjUsMTIyOCwxMjA1XSxbMTIwNSwxMjI4LDEyMDldLFsxMjA5LDEyMjgsMTIxNl0sWzE0NjQsMTMyNSwxMjIzXSxbMTIxNSwxMjI3LDEyMjFdLFsxMjI4LDE0ODAsMTIxNl0sWzEyMjYsMTY1MywxMzc2XSxbMTY1MywxMjQ5LDEyMTVdLFsxMjIxLDEyNDAsMTIyNV0sWzEyMjUsMTI0MCwxMjI4XSxbODM5LDc2MSw4NDBdLFsxMjM4LDEyMTksMTgwNV0sWzEyMzgsMTIyMCwxMjE5XSxbMTIzMiwxMzgwLDEzNzVdLFsxMjI2LDEyNDksMTY1M10sWzEyMjEsMTIyNywxMjQwXSxbMjMzLDIwNyw1MzJdLFsxMTAsMTIzNiwxMjMwXSxbMTI0OCwxMjMxLDEyMzBdLFsxMjMxLDQ1NCwxMjE0XSxbMTI0OSwxMjI3LDEyMTVdLFsxMjQ4LDEwNTYsMTIzMV0sWzQ4OSw5NTksOTQ0XSxbNDQ4LDEyNDAsMjg0XSxbOTI1LDg1OSwxMjQyXSxbMTgwNSwxMjQ0LDEyMzhdLFsxMjUyLDEyMjAsMTIzOF0sWzEyNTIsOTIxLDEyMjBdLFsxMjM2LDEyNTEsMTIzMF0sWzEyMzAsMTI1MSwxMjQ4XSxbMTA1Niw5OTMsMTIzMV0sWzEwMzEsMTI2NCwxMjYzXSxbNjgsMTE4NiwxNTddLFsxMjI3LDEyNDUsMTI0MF0sWzExMDMsMTI0NSwxNDNdLFsxMjQzLDEyMzUsNjEyXSxbMTI1Miw5NSw5MjFdLFsxMjQ5LDEyMjYsMTIzN10sWzEzOTAsMTM4NywxMjU0XSxbMTEyMCwzODQsODMwXSxbODMwLDMzMiw4NDZdLFsxMjI3LDE0MywxMjQ1XSxbMTMxNSwxMzY5LDEzNThdLFsxMzU2LDEyNjksMTM4Nl0sWzk3Miw3OTUsNDg5XSxbMTgzMSwxMjI0LDMxMF0sWzEyNTAsMTI1NSwxMjUxXSxbMTI1MSwxMDU2LDEyNDhdLFsxMjU2LDEyNDMsMTAzXSxbNjU4LDM1OCwxNzVdLFsxNjIwLDEyMzgsMTI0NF0sWzE2MjAsMTI1MiwxMjM4XSxbMTUwNiw5NSwxMjUyXSxbMTA0LDEyNDksMTIzN10sWzEyNDksMTQzLDEyMjddLFsxMjY4LDE0MTksMTMyOV0sWzYzNCw4MDYsMjMxXSxbNjE4LDgzMSw4MTVdLFs5MjQsMTI0Miw4MzldLFsxMjU1LDEyNzAsMTI1MV0sWzEyNTEsMTI3MCwxMDU2XSxbODY2LDkyNSwxMjQyXSxbMTAzLDI5LDEyNTZdLFs0MjQsMTI0MywxMjU2XSxbMTM0LDE2NTEsNzUyXSxbMTI1MCw5MTcsMTI1NV0sWzExNzIsMTIwNCwxMjYwXSxbMTM1MiwxMDM2LDEyNzZdLFsxMjY1LDEyMDEsMTMyOV0sWzgwNCwxMjgyLDEyNTldLFsxMjU5LDEyOTQsNzIzXSxbMzM1LDEzMzAsMTMwNV0sWzQwNyw3NjIsNzk5XSxbODc1LDg1NiwxMTk1XSxbMzIsMTU4LDM0NF0sWzk2Nyw5NDQsNzQ5XSxbMzcyLDEyNSw0Ml0sWzExNzUsMTM1NCwxMjYxXSxbNTUzLDYxMiwxMjM1XSxbMTI1OSwxMjczLDEyOTRdLFsxMjk0LDEyODMsNzIzXSxbNzU3LDc4LDE1OF0sWzQwNyw3OTksNzk4XSxbOTAxLDUxLDUyXSxbMTM5LDEzODYsMTM4OV0sWzEzODYsMTI2OSwxMzg5XSxbMTM4OSwxMjY5LDEyMTddLFsxMTQ4LDE1OTAsMTI2OF0sWzE0MjgsMTQ0OSwxNDUwXSxbODA0LDEyODEsMTI4Ml0sWzEyNzMsMTI1OSwxMjgyXSxbMTU4LDM5OSw3NzldLFs3NzEsNDA3LDc5OF0sWzUyMSwxMDk4LDIzNV0sWzkxNywxMzEyLDEyNTVdLFsxMzEyLDEyNzAsMTI1NV0sWzEyMTcsMTI2OSwxMzkzXSxbMTE5NSwxMTA4LDYzNF0sWzExMTAsMTEwNiw4NTZdLFsxMjEwLDE2OTEsMTE3Nl0sWzI3LDExMTIsMTE0NV0sWzEyOTYsMjcsMTE0NV0sWzExNzEsODU4LDc5MV0sWzcwNCwxMTQ4LDEyOTBdLFsxNDMwLDE0MzYsMTQzN10sWzEyODIsMTMwOCwxMjczXSxbMTMwMCw5NDMsMTI4M10sWzEzOTMsMTM1NSwxMjc0XSxbNzIwLDEyNzgsNzY5XSxbMTI4NywxMDU5LDEzOTldLFsxMzEwLDEzODgsMTI3Ml0sWzEzMTIsMTMyMSwxMjcwXSxbODUxLDExODUsMTE5MF0sWzEyOTYsMTE0NSwxMzA0XSxbMjYsMjQsNzcxXSxbNTEsOTEwLDYzMV0sWzEzMjksMTI5MCwxMjY4XSxbMTI5MCwxMTQ4LDEyNjhdLFsxMjk4LDEyOTMsNzMzXSxbMTI4MSwxMjkzLDEyODJdLFsxMjgyLDEyOTMsMTMwOF0sWzEzMDgsMTI5OSwxMjczXSxbMTMwMCwxMjgzLDEyOTRdLFsxMzQwLDk0MywxMzAwXSxbMTM0MCwxMzAxLDk0M10sWzQwNyw3NTQsNzYyXSxbMTI4NywxMzk5LDEyOTVdLFszNCwxMzksMTI4XSxbMTI4OCwxMTcyLDEyNjBdLFsxMjAsMTEzMywxMTE0XSxbMTMwNiwxMTEzLDE1MTFdLFsxNDY0LDEyMjMsMTI5Ml0sWzEyOTksMTI5NCwxMjczXSxbMTI5OSwxMzAwLDEyOTRdLFsxMjg2LDEyOTUsODM4XSxbMTI4NSwxMjQ3LDEyODZdLFsxMjQ3LDcxMywxMjg2XSxbMTIwMSwxMjY1LDEzOTBdLFsxMzc4LDEzNjgsMTM1N10sWzE0ODIsMTMyMCw5MTddLFs5MTcsMTMyMCwxMzEyXSxbODUwLDExNTYsMTE1MV0sWzU4OCwzOSw0MTNdLFsxMzI0LDEzMDYsNjg2XSxbNzg5LDEzNjUsOTI4XSxbMTIyMywxMzI2LDEyOTJdLFsxMjkyLDEzMjYsMTI5OF0sWzg2OSwxMDk3LDEzMTFdLFs3OTAsNzg2LDU2MV0sWzEzMjMsMTMwNCw5MzJdLFsxMzIzLDEyOTYsMTMwNF0sWzEzMTcsMTMyNCw2ODZdLFsxMzA2LDM2OCwxMTEzXSxbMTMyNSwxMzQyLDEyMjNdLFsxMzI2LDEzNDgsMTI5OF0sWzEyOTMsMTMyNywxMzA4XSxbMTMwOCwxMzE4LDEyOTldLFs3MDQsMTI5MCwxMjU4XSxbMTMyMCwxMzIxLDEzMTJdLFs3NjEsMTIwLDExMTRdLFsxNjg0LDgwMiw4NjZdLFsxNjc0LDYsMTcyN10sWzEzMTYsMTMyMyw5MzJdLFsxMzM1LDEzMzcsMTMwNV0sWzEzNDgsMTMyNywxMjkzXSxbMTI5OCwxMzQ4LDEyOTNdLFsxMzMzLDEzMDAsMTI5OV0sWzEzMzMsMTM0MywxMzAwXSxbMTMyOCwxMzAxLDEzNDBdLFsxMzI4LDEzMTQsMTMwMV0sWzgzOCwxMzk5LDEzMTldLFs5MjEsMTIzNyw5MDBdLFs0MDksMTM5MSwxNDA4XSxbMTM3NiwxNjUzLDY3N10sWzEyODEsODA0LDE0NThdLFsxMzMxLDEzMjQsMTMxN10sWzEzMjQsMzY4LDEzMDZdLFszNjgsMTMzOCwxMzA3XSxbMTMyNyw3OTcsMTMwOF0sWzc5NywxMzQ1LDEzMDhdLFsxMzA4LDEzNDUsMTMxOF0sWzEzMTgsMTMzMywxMjk5XSxbMTM0MSwxMTQ3LDE1NzJdLFs5MjMsMTMyMSwxMzIwXSxbOTIzLDkyMCwxMzIxXSxbMzksNTg4LDg2Nl0sWzExNDEsMTMyMywxMzE2XSxbMTMzMCwxMzM1LDEzMDVdLFsxMzM3LDEzMzUsMTMzNl0sWzEzMzksMTMzMiwxMzI1XSxbMTIyMywxMzQyLDEzMjZdLFsxMzQyLDEzNDgsMTMyNl0sWzEzNDgsNzk3LDEzMjddLFsxMzQ1LDEzMzMsMTMxOF0sWzEzNDMsMTM0MCwxMzAwXSxbMTQxOSwxMjY1LDEzMjldLFsxMzQ3LDEzMjAsMTU4NF0sWzE1MzUsMTE0MSwxMzE2XSxbMTA3OCwxMzExLDU4Ml0sWzEzNDQsMTMzNSwxMzMwXSxbNzUzLDEzMzEsMTMzN10sWzM2OCwxMzI0LDEzMzFdLFs3NTMsMzY4LDEzMzFdLFsxMzMyLDE0ODUsMTMyNV0sWzEzMjUsMTQ4NSwxMzQyXSxbNzg3LDEzNDMsMTMzM10sWzEzNywxMzI4LDEzNDBdLFs5NzMsMTM0MSwxNDc5XSxbNDA2LDExNDcsMTM0MV0sWzExNzEsMTIzNCw4NThdLFsxMTQxLDE1MzUsMTMyMl0sWzQ5LDExNDEsMTMyMl0sWzEzNDQsMTMzNiwxMzM1XSxbOTczLDkwOCwxMzQxXSxbNzY2LDEzNDcsMTU4NF0sWzEzNDcsOTIzLDEzMjBdLFs3ODEsNDksMTMyMl0sWzM2OCwyMzIsMTMzOF0sWzc4NywxMzQwLDEzNDNdLFs3ODcsMTM3LDEzNDBdLFs1NjgsMTM0Niw5NzNdLFs1OCwxMTQ3LDQwNl0sWzQ0MiwxMzM0LDExNDddLFs1OCw0NDIsMTE0N10sWzQ0Miw3NjYsMTMzNF0sWzkwLDkyMywxMzQ3XSxbNDI4LDM2OCw3NTNdLFs3NzksMTMzMywxMzQ1XSxbODI1LDc4NywxMzMzXSxbMTM3LDEzNDksMTMyOF0sWzEzMjgsMTM0Niw1NjhdLFs5MDgsNDA2LDEzNDFdLFs5MjQsODY2LDEyNDJdLFsxMzM2LDc1MywxMzM3XSxbNDI4LDIzMiwzNjhdLFsxMTE1LDc3NywxMDk4XSxbMTM0OCwyOCw3OTddLFs3OTcsNzc5LDEzNDVdLFs3NzksODI1LDEzMzNdLFsxMDA3LDkwOCw5NzNdLFs1ODMsMTM1MSw4ODBdLFsxMzY1LDEyNDYsOTc3XSxbMTY1OCwxNDUsMTcxMF0sWzEzMTAsNzk2LDEzODhdLFs3MTgsMjQ1LDE2NV0sWzEzMDIsMTI3MiwxMjU0XSxbMTE3NCwxMzUxLDU4M10sWzExNzQsNzE1LDEzNTFdLFsxMzU4LDEyNjAsMTIwNF0sWzEzNzQsMTM3MywxMjc2XSxbMTM3NywxMzc0LDEyNzZdLFs2NzgsMTM2MiwxMzgyXSxbMTM3NywxMjc2LDI1NF0sWzEzOSwzNCw0MF0sWzEwMDgsMTE3NCw1ODNdLFsxMzk2LDEyODYsMTMxOV0sWzc2OCw4OTEsNDU3XSxbMTMxNiw5MzIsMTUzNV0sWzEyODksMTM3MSwxMzYwXSxbMTgyLDczNiw4NjRdLFsxMzU1LDEzNjQsMTI3NF0sWzg2MCwxMzY3LDEzNTRdLFsxMzYyLDEyMjIsMTM4Ml0sWzEzNzYsODY5LDEzMTFdLFsxNTkwLDE0MTEsMTk4XSxbMTIzMiwxMzc1LDg3N10sWzEzOTQsMTI5NSwxMjg2XSxbODgwLDEzNTYsMTM4Nl0sWzg4MCwxMzUxLDEzNTZdLFsxMjExLDEwNTksMTI4N10sWzE5Nyw2NzgsMTQwNV0sWzg4MCwxMzg2LDEwMDNdLFsxMzY4LDEyNTMsMTM1N10sWzEzNTcsMTI1MywxMDM2XSxbNzE1LDEyODksMTM2NF0sWzEzNTQsMTM2Nyw3MDNdLFsxMzgzLDg3NywxMzc1XSxbMTI2NiwxMjg4LDEyNjBdLFsxMzczLDEzNzQsNzAzXSxbMTM3MiwxMjg5LDExNzRdLFsxMzAzLDEzNjYsMTM3OF0sWzEzNTEsNzE1LDEzNTVdLFsxNjY1LDE2NjYsNjI0XSxbMTMwOSwxMzU3LDEwMzZdLFs5MDAsMTIzNywxMjI2XSxbMTE3NCwxMjg5LDcxNV0sWzEzMzcsMTMzMSwxMzE3XSxbMTM2MCwxMzAzLDEzNTldLFsxMjY3LDEzNTQsMTE3NV0sWzEyNDEsMTI4NCwxNDE0XSxbMTM3NywyNTQsOTI5XSxbMTM4NSw4NTUsODM2XSxbMTM5NiwxMzE5LDE0MzZdLFsxMzYxLDEzNjYsMTMwM10sWzEzODEsMTM2OCwxMzc4XSxbMTMxMywxMjExLDEzOTFdLFsxMzY4LDEzODUsMTM2M10sWzgxMyw4Miw4NjFdLFsxMDU4LDEyODAsODA3XSxbODkzLDUxOSw4OTJdLFsxMzU5LDEzMDMsODYwXSxbMTM4MiwxMzUwLDEyNDddLFsxMzcxLDEzMDMsMTM2MF0sWzEyNjcsMTE3NSwxMjcxXSxbNzY5LDEyODYsMTM5Nl0sWzcxMiwxODM3LDgyXSxbMTM2NiwxMzg1LDEzODFdLFsxMzY1LDc5NiwxMzEwXSxbMTAwMywxMzg2LDQwXSxbNzgwLDEzNzEsMTM3MF0sWzU2MSw4NjIsNzkwXSxbMTI4NCwxMzgwLDg2NF0sWzE0NDksMTQyOCwxNzddLFs2MTEsMTI4MCwxMDU4XSxbMTI4NCwxMzc1LDEzODBdLFs5MjYsNTA2LDEyNDFdLFsxMzA1LDEzMzcsMTMxN10sWzMwOSwxMjAzLDIwOF0sWzEzODgsMTIwMSwxMzkwXSxbMTMwOSwxMDM2LDEzNTJdLFsxMzc3LDkyOSwxNDExXSxbMTM5OSwxMDU5LDEyNTddLFsxMTEyLDcwLDExNDVdLFsyODksMTE2Niw1NjFdLFsxMjg4LDEzODksMTE3Ml0sWzEzNjIsMzcsMTE4MF0sWzcxMywxMzk0LDEyODZdLFsxMzU1LDEzOTMsMTI2OV0sWzE0MDEsMTQyMyw5NDFdLFsxMjc0LDEyNzEsMTM4NF0sWzg2MCwxMzc4LDEzNjddLFs3MTUsMTM2NCwxMzU1XSxbNjc3LDE0MDYsODY5XSxbMTI5NywxMzU4LDEyMDJdLFsxMzg4LDEyNTgsMTMyOV0sWzExODAsMTI4OCwxMjY2XSxbMTAwOCw1ODMsODgwXSxbMTUyNCwxNDI1LDE0NjNdLFsxMzkwLDE0MDMsMTM4N10sWzEyNzgsMTM3OSwxMjQ3XSxbMTI3OCwxMjQ3LDEyODVdLFs5NjQsMTI3OCwxMjYyXSxbMTM1OCwxMzY5LDEyMDJdLFsxNzE1LDE2OTksMTcyNl0sWzkyNiwxMjQxLDE0MTRdLFsxMzQxLDE1NzIsMTQ3OV0sWzkyNiw5MzAsOTE2XSxbMTM5Nyw1MSw3ODFdLFs0MDksMTM1OCwxMjk3XSxbMTIzNiw0MzYsMzAxXSxbMTM3Niw2NzcsODY5XSxbMTM1MSwxMzU1LDEzNTZdLFs3NTgsMTUzNCwxNTIzXSxbMTM3OCwxMzU3LDEzNjddLFs5NzcsMTIxMSwxMzY1XSxbMTEzNSwxMTM2LDg1NF0sWzEzOTQsMTM5MSwxMjk1XSxbMTI2NiwxMjYwLDEyMjJdLFsxMzY1LDEzMDIsMTI0Nl0sWzEyMzIsODc3LDg0NF0sWzczNiw5MzAsODY0XSxbMTQwOCwxMzU4LDQwOV0sWzE1MDgsODE3LDE1MjNdLFsxMzgxLDEzODUsMTM2OF0sWzcxOCw4NTQsOTEwXSxbODU0LDcxOCwxMTM1XSxbMTM4MiwxMjIyLDEzNTBdLFsxMzkxLDEyMTEsMTI4N10sWzEzOTEsMTI4NywxMjk1XSxbMTI1NywxNjUxLDEzNF0sWzE0MTQsMTI4NCw4NjRdLFsxMjkxLDEzNjksMTMxNV0sWzEyMDIsOTI4LDEzMTNdLFs4NiwxNDAwLDE0MTNdLFsxNDEzLDEyMDAsODZdLFsxMjYzLDE2MjUsMTAzMV0sWzE0MTMsMTQwMCwxNDA0XSxbMTAwMiwxNjY0LDE4MzRdLFs5MzAsOTI2LDE0MTRdLFsxMzk5LDEyNTcsMTM0XSxbNTIwLDMxNiw1OTZdLFsxMzkzLDEyNzQsMTIwOF0sWzE2NTcsMTY1NSwxNzEyXSxbMTQwNywxNDA0LDE0MDBdLFsxNDA0LDE0MTAsMTQxM10sWzE2NDksMTIyOSwxNDA2XSxbMTM2MiwxMjY2LDEyMjJdLFsxMzg0LDEyNzEsMTE3NV0sWzkwMCwxMzc2LDEzMTFdLFsxMjc0LDEzODQsMTI5MV0sWzEyOTEsMTM4NCwxNDMxXSxbMTQzMywxMzk2LDE0MzZdLFsxMjY3LDEzNTksMTM1NF0sWzMwOSwxMzUzLDcwM10sWzgzOCwxMzE5LDEyODZdLFsxNDA3LDE0MTAsMTQwNF0sWzQ0MSwxNTE4LDc3M10sWzEyNDEsMTIzLDE0MjhdLFsxNjIyLDE1MjEsMTIyNF0sWzEyMTcsMTIwOCwxMTcyXSxbMTEzMCw3OTMsMTA3Nl0sWzQyNSwxNDA5LDE0ODFdLFsxNDgxLDE0MDksMTUzM10sWzEzMDMsMTM3OCw4NjBdLFsxMzUwLDE0MDgsMTM5NF0sWzEyNDYsMTY1MSw5NzddLFsxMjg5LDEzNjAsMTM2NF0sWzE3MjcsMTY5NCwxNjIzXSxbMTQxNywxNDA3LDE1MzNdLFsxNDE3LDE0MTAsMTQwN10sWzE0MDYsMTY1MCwxNjQ5XSxbMTMxOSwxMzQsMTQzN10sWzE0MTQsODY0LDkzMF0sWzE0MDYsMTIyOSwxMTI0XSxbMTM1NCwxMzU5LDg2MF0sWzE0MzMsNzY5LDEzOTZdLFsxNDE3LDE1MzMsMTQwOV0sWzE0MTYsMTQxMywxNDEwXSxbMTQxNSwxNDE2LDE0MTBdLFs5NSwxMjM3LDkyMV0sWzEzOTIsMTI1NCwxMzk1XSxbMTM2MCwxMzU5LDEyNjddLFsxMjU4LDEyOTAsMTMyOV0sWzExODAsMTI4LDEzODldLFsxNDIwLDE0MDksNDI1XSxbMTQxNywxNDE4LDE0MTBdLFsxNDE4LDE0MTUsMTQxMF0sWzE0MjIsMTA3NywxNDE2XSxbMTI0NywxMzUwLDEzOTRdLFszNyw0MywxMTgwXSxbMTIwNCwxMzE1LDEzNThdLFsxNDI4LDEzODMsMTM3NV0sWzEzNTYsMTM1NSwxMjY5XSxbMTQwOSwxNDE4LDE0MTddLFsxMzAyLDQ1LDEyNDZdLFsxNDIxLDE0MTYsMTQxNV0sWzE0MjEsMTQyMiwxNDE2XSxbMTQyMiwxNDk0LDEwNzddLFs5NTcsNzIwLDkzOF0sWzE0MjMsMTQwOSwxNDIwXSxbMTQyMywxNDE4LDE0MDldLFs3NTIsNDM0LDE0MzhdLFsxMjYwLDEzNTgsMTQwOF0sWzEzNjMsMTM4NSw3ODVdLFsxNDIzLDE0MjYsMTQxOF0sWzE0MjYsMTQyNCwxNDE4XSxbMTIyOSwxNjQ5LDExMjRdLFsxMjIyLDEyNjAsMTM1MF0sWzE1MDgsMTUyMywxMTM3XSxbMTI3OCwxMjg1LDc2OV0sWzE0ODIsOTE3LDE0NF0sWzE0MTgsMTQyNCwxNDE1XSxbMTQyNSwxNDIyLDE0MjFdLFsxNDI1LDE1MjQsMTQyMl0sWzEyNzIsMTM4OCwxMzkwXSxbMTM5MSw0MDksMTMxM10sWzEzNzgsMTM2NiwxMzgxXSxbMTM3MSw0ODMsMTM2MV0sWzcyMCwxMjYyLDEyNzhdLFsyOSwxMDMsMTU5XSxbMTI3MSwxMzY0LDEyNjddLFsxNDI0LDE0MjcsMTQxNV0sWzE1MzcsMTUyMiwxNTE4XSxbMTM0LDc1MiwxNDM4XSxbMTQyMCw5MzQsOTQxXSxbMTQyOCwxMzc1LDEyODRdLFsxMjc3LDEyMjQsMTgzMV0sWzEzNjIsMTE4MCwxMjY2XSxbMTQwMSwxNDI2LDE0MjNdLFsxNTc3LDEzNjksMTI5MV0sWzI2OCw0ODMsMjYyXSxbMTM4MywxNDUwLDE0NTZdLFsxMzg0LDExNzUsMTQzMV0sWzE0MzAsMTQxNSwxNDI3XSxbMTQzMCwxNDIxLDE0MTVdLFsxNDMwLDE0MjUsMTQyMV0sWzEzNzksMTM4MiwxMjQ3XSxbMTI1MiwxNTUzLDE0MjldLFsxMjA2LDEzOTIsMTM5NV0sWzE0MzMsMTQzMCwxNDI3XSxbMzA5LDIwOCwxMzUzXSxbMTI3MiwxMzkwLDEyNTRdLFsxMzYxLDQ4MywxMzY2XSxbMTUyMyw4MTcsODA4XSxbMTMwMiwxMjU0LDEzOTJdLFsxMzcxLDEzNjEsMTMwM10sWzE0MjYsMTQzNSwxNDI0XSxbMTQzNSwxNDMzLDE0MjRdLFsxNDMzLDE0MjcsMTQyNF0sWzcyMCw3NjksMTQzM10sWzc5NiwxMjU4LDEzODhdLFsxNTkwLDE0MTksMTI2OF0sWzEyODksMTM3MiwxMzcxXSxbMTMwNSwxMzE3LDE1MDldLFs5OTgsMTM3MiwxMTc0XSxbNDAsMTM4NiwxMzldLFsxMjYxLDEzNTQsNzAzXSxbMTM2NCwxMjcxLDEyNzRdLFsxMzQsMTQzOCwxNDM3XSxbMTQzNiwxMzE5LDE0MzddLFsxMzE3LDY4NiwxNTA5XSxbMTQ4NCw5MzIsMTMwNF0sWzE0MzQsMTQzMiwxNTA5XSxbMTQyMCw2NSw5MzRdLFs5MzEsOTMwLDczNl0sWzEzNjcsMTM1NywxMzA5XSxbMTM3MiwxMzcwLDEzNzFdLFsxMjA0LDEyMDgsMTMxNV0sWzE0MjYsOTM4LDE0MzVdLFsxMzY4LDEzNjMsMTI1M10sWzEyMDcsNDU0LDExOTBdLFsxMzAyLDEzMTAsMTI3Ml0sWzMwOSwxMzc3LDM5MF0sWzM5MCwxMzc3LDE0MTFdLFsxMzcwLDEzNzIsOTk4XSxbMTQxMSwxNTkwLDExNDhdLFs3MjAsMTQzMywxNDM1XSxbMTQ1MCwxMzgzLDE0MjhdLFsxMzc5LDY3OCwxMzgyXSxbMTQwNSw2NzgsMTM3OV0sWzEyMDgsMTI5MSwxMzE1XSxbMTM5OSwxMzQsMTMxOV0sWzEzNjcsMTMwOSwxMzczXSxbMTM3MywxMzUyLDEyNzZdLFs1OTYsNzQxLDU5M10sWzU1MywxMjY0LDYxMl0sWzE0MzMsMTQzNiwxNDMwXSxbMTQzNywxNDM4LDE0MzBdLFs5NjQsMTQwNSwxMzc5XSxbMTM3MywxMzA5LDEzNTJdLFsxMjY1LDE0MDMsMTM5MF0sWzEyMzMsMTYxOCwxNDM0XSxbMTM2NSwxMzEwLDEzMDJdLFs3ODksNzk2LDEzNjVdLFs3MjAsMTQzNSw5MzhdLFsxMjgsMTM5LDEzODldLFsxNDY2LDkzMywxNTI1XSxbMTE5MSwxNjQwLDE2MzddLFsxMzE0LDE0NDIsOTQzXSxbMTE0MSwzNTMsMTMyM10sWzE0ODksMTEzOCwxNDc0XSxbMTQ2MiwxNDc3LDE0NDBdLFsxNDc0LDExMzgsMTQ4OF0sWzE0NDIsMTMxNCwxNDQzXSxbMTQ0NiwxMDMwLDE1NDZdLFsxNDg0LDExNDUsNjk3XSxbMTU0OSwxNDQzLDE0NDVdLFsxNDcwLDE1NzIsMTQ2OF0sWzEzOTcsMTIzOSwxNTA3XSxbMTY0OSwxODI1LDE4MjRdLFsxMjU5LDE0NDAsMTQ3N10sWzE0NTEsMTQ1MCwxNDQ5XSxbOTc4LDE0NDYsNjUyXSxbMTQ1NCwxNDU2LDE0NTFdLFsxNDUxLDE0NTYsMTQ1MF0sWzM0MSwxNTA3LDU5NV0sWzkzMywxNTQ3LDc5XSxbODA0LDE0NTIsMTA2MF0sWzE0NTQsMTQ1NSwxNDU2XSxbMTM5OCwxNDYwLDE0NTRdLFsxNDU1LDg3NywxNDU2XSxbMTI3NywxODMxLDE4MjVdLFs4MDQsMTA2MCwxNDU4XSxbMTMzOSwxNDU5LDE1OTVdLFsxMzE0LDExMDQsMTQ0M10sWzkzMywxNDQ4LDE1NDddLFsxNDcsMTQ2MCwxMzk4XSxbMTQ2MCwxNDYxLDE0NTRdLFsxNDU0LDE0NjEsMTQ1NV0sWzEyOTIsMTEyNSwxNDY0XSxbNDE3LDE1MzEsMTQ4MF0sWzE0NTksMTMzOSwxMzI1XSxbODExLDE3NTYsMzM1XSxbMTUxMiw5MzYsMTQ5MF0sWzc3NywxNTI5LDEwOThdLFsxNDcsMTQ3NSwxNDYwXSxbMTQ2NCwyNTMsMTQ1OV0sWzgzNiw4NTUsNDgyXSxbMTQ4NywxNDg2LDEzMDddLFsxMTA0LDE1MDEsMTQ0M10sWzE0MzksMTIwMCwxNTMyXSxbMTQ3NSwxNDY5LDE0NjBdLFsxNDYwLDE0NjksMTQ2MV0sWzEzMjUsMTQ2NCwxNDU5XSxbMTI3NywxODI1LDE2NDldLFsxNTMyLDEyMDAsMTA3N10sWzg0NCw4NzcsMTQ1NV0sWzE1NzIsOTMzLDE0NjZdLFsxNDc5LDU2OCw5NzNdLFsxNTA5LDMzNSwxMzA1XSxbMTMzOSwxNTk1LDE3NTldLFsxNDY5LDE0NzYsMTQ2MV0sWzE0NjEsMTQ3NiwxNDU1XSxbMTEwNCwxNDcwLDE0NjhdLFsxNDY0LDE0NzIsMjUzXSxbMTExNywxMDkxLDE0MDddLFsxNzU2LDE1NDIsMzM1XSxbMTIwNiwxMzk1LDExODhdLFszMzUsMTU0MiwxMzMwXSxbODM1LDg0NCwxNDU1XSxbMTQ3MSwxNTk4LDE0NjJdLFsxNDkxLDE0NDIsMTQ0MV0sWzgzNSwxNDU1LDE0NzZdLFsxNDQxLDE0NDIsMTQ0M10sWzE0ODksMTQ3NCwxNDczXSxbMTI1MSwxMjM2LDEyNTBdLFsxMDMwLDE0NTIsMTQ3N10sWzE1OTgsMTQzOSwxNTMyXSxbOTc4LDE1OTgsMTQ5Ml0sWzE0MjYsMTQwMSw5MzhdLFsxNDQ4LDE1ODQsMTQ4Ml0sWzE3MjQsMTQ5NywxNDc1XSxbMTQ3NSwxNDk3LDE0NjldLFsxNDg0LDE1MzUsOTMyXSxbMTMwNywxNDg2LDExMTNdLFsxNDg3LDY5NiwxNDk1XSxbMTAzNywxNDkxLDE0NDFdLFsxMDMwLDE0NDYsOTM2XSxbMTQ1MywxNDg3LDE0OTVdLFs2OTYsMTQ2NywxNDk1XSxbMTEzOCwxNDg5LDE0ODNdLFsxNDk3LDExNDMsMTQ2OV0sWzE0NjksMTE0MywxNDc2XSxbNjUyLDE1OTgsOTc4XSxbODUwLDEwNDMsMTE1MF0sWzE0ODIsMTU4NCwxMzIwXSxbMTczMSw5OCwxNjk3XSxbMTExMywxNTU0LDE1NzNdLFsxNTI0LDE1MzIsMTQ5NF0sWzE0OTYsMTQ2Nyw2OTZdLFsxNDUyLDEyNTksMTQ3N10sWzI5NiwxNTA0LDE0OTddLFsxNTA0LDExNDMsMTQ5N10sWzExNDMsMTQ5OSwxNDc2XSxbNzE4LDkxMCwxNDk4XSxbODY4LDE1NDAsMTUyOF0sWzgxNywxMjUzLDgxMF0sWzE0OTAsNjk2LDE0ODddLFsxNDQwLDE0OTEsMTAzN10sWzE1MTAsNjc2LDU5NV0sWzE0ODgsMTQ5MiwxNTE3XSxbNzgxLDEyMzksMTM5N10sWzE0NjcsMTUxOSwxNTAzXSxbMTUwMCwxMzA3LDE3NTldLFsxMTQ5LDM5Nyw0NTJdLFsxNTA0LDE1MTQsMTE0M10sWzE1MTQsODQyLDExNDNdLFsxMTI1LDczMywxNDU4XSxbMTUwMywxNTMxLDE1NTVdLFsxMjc2LDEwMzYsMTEzN10sWzE0NDAsNzIzLDExMjNdLFsxMDM2LDE1MDgsMTEzN10sWzgxNywxNTA4LDEyNTNdLFsxMDMsODgzLDExMTJdLFsxNDU4LDczMSwxNDcyXSxbMTUxMiwxNDkwLDE0ODddLFsxNDg3LDE0NTMsMTQ4Nl0sWzExMzgsOTc4LDE0ODhdLFsxMDM2LDEyNTMsMTUwOF0sWzEzOTgsMTQ5LDE0N10sWzE0NzQsMTUxNywxNTEzXSxbMTEyNSwxNDU4LDE0NzJdLFsxNDg2LDE0NTMsMTU1NF0sWzE1MTgsMTUzNCw3NThdLFszNDUsMTA1OCwxMDYyXSxbOTI4LDEyMDIsMTM2OV0sWzE1NTQsMTU0MSwxNTA1XSxbMTQ2NCwxMTI1LDE0NzJdLFsxNTA0LDc2NCwxNTE0XSxbMzA0LDQyNiw1NzNdLFsxNTA1LDc0MiwxNTA2XSxbMTQ3OSwxNTcyLDE0NzhdLFsxNTE5LDE0ODMsMTQ4OV0sWzgzMyw3MTYsMTA2OV0sWzE1MjIsMTUzNCwxNTE4XSxbMTExNSwxNTEzLDc3N10sWzgxMSwzMzUsMTQzMl0sWzE1OTEsMTUzMywxNDA3XSxbNzc3LDE1MTcsMTUyOV0sWzE1MTMsMTUxNyw3NzddLFsxNDk4LDkxMCwxMzk3XSxbMTA2OSwxNTM5LDgzM10sWzgzMywxNTM5LDE1MzddLFsxNTIyLDE1NTEsMTUzNF0sWzE1MzQsMTU1MSwxNTIzXSxbMTUzOCwxMTM3LDE1MjNdLFs5MTAsNTEsMTM5N10sWzEzNjcsMTM3Myw3MDNdLFsxNDY2LDE1MjUsMTQ2OF0sWzE1NywxMTg2LDE4MzJdLFsxNDI5LDE1MTEsMTUwNl0sWzE1NzMsMTUwNSwxNTA2XSxbMTI1OSwxNDUyLDgwNF0sWzE1MDMsMTQ5NSwxNDY3XSxbMjYyLDQ4Myw3ODBdLFsxNTcyLDE0NjYsMTQ2OF0sWzE1MzYsMTU1Niw3MTZdLFs3MTYsMTU1NiwxMDY5XSxbMTU0NCwxNTIzLDE1NTFdLFsxNTQ0LDE1MzgsMTUyM10sWzE1MTEsMTU3MywxNTA2XSxbOTMzLDE1NzIsMTQ0OF0sWzE1NDMsMTUzNywxNTM5XSxbMTUzNywxNTQzLDE1MjJdLFsxMDkxLDkzMyw3OV0sWzE1MTksMTU0MCwxNTQ1XSxbMTU0OSwxNDQ1LDg2XSxbMTA2OSwxNTQ4LDE1MzldLFsxNTQ4LDE1NDMsMTUzOV0sWzE1NDMsMTU1MSwxNTIyXSxbMTUwMCwxNDg3LDEzMDddLFs2OCw3ODQsMTE4Nl0sWzE1NTIsMTU0NCwxNTUxXSxbMTU1MCwxNTM4LDE1NDRdLFsxNTM4LDE1NTAsMTEzN10sWzE1MTksMTQ3MywxNTQwXSxbMTU0NywxNDQ4LDE0ODJdLFsxNTYwLDE1NjMsMTUzNl0sWzE1MzYsMTU2MywxNTU2XSxbMTU1NiwxNTQ4LDEwNjldLFsxNTQzLDE1NTgsMTU1MV0sWzExMzcsMTU1MCwxMjc2XSxbMTQ1MywxNDk1LDE1NTVdLFsxNTYxLDE1NDMsMTU0OF0sWzE1NDMsMTU2MSwxNTU4XSxbMTU1OCwxNTY2LDE1NTFdLFsxNTUyLDE1NTAsMTU0NF0sWzE1NjksMTU1NywxNTUwXSxbMTU1NywxMjc2LDE1NTBdLFsxMjc2LDE1NTcsMjU0XSxbMTUzMSwxNTAzLDE0ODBdLFsxNTM1LDE1MzAsMTUxMF0sWzE1NDUsMTUwMywxNTE5XSxbMTU0NywxNDgyLDc5XSxbMTU2NiwxNTUyLDE1NTFdLFsxNTUyLDE1NjksMTU1MF0sWzE1MDMsMTU0NSwxNDgwXSxbNzAzLDEzNzcsMzA5XSxbMTYyNSw2NzUsNzU2XSxbMTAzNywxNDQxLDg4XSxbOTI5LDI1NCwxNTU3XSxbODQ5LDE1NjcsMTU2MF0sWzE1NTYsMTU2NCwxNTQ4XSxbMTQ5MiwxNTI5LDE1MTddLFsxMjUyLDE0MjksMTUwNl0sWzE1NTMsMTAyNywxNDI5XSxbMTQ1MywxNTU1LDE1NDFdLFsxNTU0LDE0NTMsMTU0MV0sWzEyMzMsNjg2LDE1NTNdLFsxMzI4LDExMDQsMTMxNF0sWzE1NjQsMTU3NiwxNTQ4XSxbMTU0OCwxNTc2LDE1NjFdLFsxNTU3LDE1NjIsOTI5XSxbMTUyMCwxMTIsMTY2OF0sWzE0ODMsMTQ0NiwxMTM4XSxbNzc4LDE1NzAsMTU2N10sWzE1NjMsMTU2NCwxNTU2XSxbMTU2MSwxNTY1LDE1NThdLFsxNTY1LDE1NjYsMTU1OF0sWzE1NjksMTU1MiwxNTY2XSxbMTU2MiwxNTU3LDE1NjldLFsxNTMwLDE1MzUsMTQ4NF0sWzEzODcsMTQwMiwxMzk1XSxbMTYyMSwxNjM0LDEzODddLFsxNTY3LDE1NjgsMTU2MF0sWzE1NjAsMTU2OCwxNTYzXSxbMTU3MSwxNTY5LDE1NjZdLFsxMzQ0LDEzMzAsMTU0Ml0sWzE1NzcsMTQzMSwxMzUzXSxbMTYzOCwyMzMsMzA0XSxbMTUyNCwxNDYzLDE1MjldLFsxMzUzLDE0MzEsMTE3NV0sWzEwNzcsMTIwMCwxNDEzXSxbMTQ3OCwxNDcwLDExMDRdLFsxNTY4LDE1NzUsMTU2M10sWzE1NjMsMTU3NSwxNTY0XSxbMTU3NSwxNTc2LDE1NjRdLFsxNTYxLDE1NzYsMTU2NV0sWzE1NjUsMTU3NCwxNTY2XSxbMTU2MiwxNTE1LDkyOV0sWzE1NTUsOTYsMTU0MV0sWzE1MzEsNDE3LDk2XSxbMTU1NSwxNTMxLDk2XSxbMTI0Niw0NSwxNjUxXSxbMjA4LDE1NzcsMTM1M10sWzE1ODYsMTU2OCwxNTY3XSxbMTU3NCwxNTcxLDE1NjZdLFsxNTcxLDE1ODMsMTU2OV0sWzE0NzQsMTUxMywxNTI4XSxbMTIzOSwxMzIyLDE1MzVdLFsxNDc4LDE1NzIsMTQ3MF0sWzE1NzAsMTU4NiwxNTY3XSxbMTQ4OCwxNTE3LDE0NzRdLFs4LDE4MzMsMTgzN10sWzExMjMsMTQ0MiwxNDkxXSxbMTU4OSwxNTY4LDE1ODZdLFsxNTc2LDE1OTQsMTU2NV0sWzE1NjUsMTU5NCwxNTc0XSxbMTU2MiwxOTgsMTUxNV0sWzE1NTksMTQ0MSwxNTQ5XSxbMTQ0MSwxNDQzLDE1NDldLFsxMTM1LDQyNSwxNDgxXSxbMTIzOSwxNTM1LDE1MDddLFsxNTk1LDE0ODcsMTUwMF0sWzE1NzAsMTU4NSwxNTg2XSxbMTU4OSwxNTc4LDE1NjhdLFsxNTY4LDE1NzgsMTU3NV0sWzE1NzksMTU2OSwxNTgzXSxbMTE3NywxNTc3LDIwOF0sWzExNSwxMjM2LDExMF0sWzE1NzgsMTU5MywxNTc1XSxbMTU4NywxNTc2LDE1NzVdLFsxNTc2LDE1ODEsMTU5NF0sWzE1NzEsMTU4MiwxNTgzXSxbMTU4OCwxNTc5LDE1ODNdLFsxNTc5LDE1ODAsMTU2Ml0sWzE1NjksMTU3OSwxNTYyXSxbMTU2MiwxNTgwLDE5OF0sWzEwMjcsMTUxMSwxNDI5XSxbMTU4OSwxNTkzLDE1NzhdLFsxNTg3LDE1ODEsMTU3Nl0sWzE1ODIsMTU3NCwxNTk0XSxbMTU3NCwxNTgyLDE1NzFdLFsxNTc1LDE1OTMsMTU4N10sWzE1ODMsMTU4MiwxNTg4XSxbMTU4MCwxNTkwLDE5OF0sWzE1ODcsMTU5MywxNTgxXSxbMTUwNSwxNTQxLDk2XSxbMTM2OSwxNTc3LDExNzddLFsxNTczLDE1NTQsMTUwNV0sWzE0NzksMTQ3OCw1NjhdLFsxNTg1LDE1ODksMTU4Nl0sWzEzNjksMTE3Nyw3MDRdLFs3NjYsMTU4NCwxMzM0XSxbOTc3LDEyNTcsMTA1OV0sWzEwOTEsMTU5MSwxNDA3XSxbMTU5MSwxMDkxLDE0NTddLFsxNTg1LDE2MDQsMTU4OV0sWzE1ODEsMTU5MiwxNTk0XSxbMTYwMiwxNTgyLDE1OTRdLFsxNTgyLDE2MDgsMTU4OF0sWzE2MDgsMTU3OSwxNTg4XSxbMTU3OSwxNTk3LDE1ODBdLFsxNDE5LDE1OTAsMTU4MF0sWzE1OTcsMTQxOSwxNTgwXSxbMTQzMSwxNTc3LDEyOTFdLFsxNTg5LDE2MDQsMTU5M10sWzE2MDEsMTU5NiwxNTkzXSxbMTU5MywxNTk2LDE1ODFdLFsxMzA2LDE1MTEsMTAyN10sWzE1MTEsMTExMywxNTczXSxbMTc4NiwxNDEyLDE1ODVdLFsxNDEyLDE2MDQsMTU4NV0sWzE1ODEsMTU5NiwxNTkyXSxbMTU5MiwxNjAyLDE1OTRdLFsxNjA4LDE1OTksMTU3OV0sWzE1OTksMTYxMSwxNTc5XSxbMTU3OSwxNjExLDE1OTddLFsxNTEyLDE0ODcsMjUzXSxbMTUxOSwxNDg5LDE0NzNdLFsxNTQ1LDE1NDAsODY4XSxbMTA4MywxMTg3LDE0MDJdLFsxMTE3LDE0MDcsMTQwMF0sWzEyOTIsNzMzLDExMjVdLFsyODQsMTI0MCwxMjQ1XSxbMTYwNCwxNjAwLDE1OTNdLFsxNjAwLDE2MDEsMTU5M10sWzE1ODIsMTYwNywxNjA4XSxbNzg5LDEzNjksNzA0XSxbMTQ2NywxNDgzLDE1MTldLFsxNjAxLDE2MTMsMTU5Nl0sWzE1OTYsMTYxMywxNTkyXSxbMTYwMiwxNjA3LDE1ODJdLFsxNjIwLDE1NTMsMTI1Ml0sWzE2MDEsMTYwNSwxNjEzXSxbMTU5MiwxNjEzLDE2MDJdLFsxNjAyLDE2MDYsMTYwN10sWzE2MDgsMTYwOSwxNTk5XSxbMTU5OSwxNjA5LDE2MTFdLFsxNjAzLDE1OTcsMTYxMV0sWzEyNjUsMTQxOSwxNTk3XSxbMTYwMywxMjY1LDE1OTddLFsxMzkyLDEyMDYsNDVdLFs5MjgsMTM2OSw3ODldLFsxNDc0LDE1MjgsMTQ3M10sWzExMDQsMTQ2OCwxNTAxXSxbMTQxMiwxNTIxLDE2MDRdLFsxNjEzLDE2MzEsMTYwMl0sWzE2MDcsMTYxMCwxNjA4XSxbMTYwOCwxNjEwLDE2MDldLFsxNDc2LDg2Myw4MzVdLFsxNDk1LDE1MDMsMTU1NV0sWzE0OTgsMTM5Nyw3MThdLFsxNTIwLDE2NjgsN10sWzE2MDQsMTYxNSwxNjAwXSxbMTYwNSwxNjAxLDE2MDBdLFsxNjAyLDE2MzEsMTYwNl0sWzE2MDYsMTYxMCwxNjA3XSxbMTc1OSwxNTk1LDE1MDBdLFsxMjkyLDEyOTgsNzMzXSxbMTYxNSwxNjA0LDE1MjFdLFsxNjA5LDE2MDMsMTYxMV0sWzY1MiwxNDYyLDE1OThdLFsxNDY4LDE1MjUsMTQ0NV0sWzE0NDMsMTUwMSwxNDQ1XSxbMTEzNCwxNzIzLDE1MF0sWzE1MjEsMTYyMiwxNjE1XSxbMTYxNSwxNjE2LDE2MDBdLFsxNjE2LDE2MDUsMTYwMF0sWzE2MDUsMTYxNiwxNjEyXSxbMTYwNSwxNjEyLDE2MTNdLFsxNjEyLDE2MTcsMTYxM10sWzE2MTMsMTYxNywxNjMxXSxbMTYwNiwxNjE0LDE2MTBdLFsxMjY1LDE2MDMsMTQwM10sWzQ0OCw0MTcsMTQ4MF0sWzE1OTUsMjUzLDE0ODddLFsxNTAxLDE0NjgsMTQ0NV0sWzEzODMsMTQ1Niw4NzddLFsxNDkwLDE0OTYsNjk2XSxbMTYxMCwxNjI3LDE2MDldLFsxNjI3LDE2MjEsMTYwOV0sWzE1OTEsMTQ4MSwxNTMzXSxbMTU5OCwxNDcxLDE0MzldLFsxMzUzLDEyNjEsNzAzXSxbMTYwNiwxNjMxLDE2MTRdLFsxNjA5LDE2MjEsMTQwM10sWzE1MzIsMTA3NywxNDk0XSxbMTUyOCwxMTE1LDUxM10sWzE1NDYsNjUyLDE0NDZdLFsxMjExLDkyOCwxMzY1XSxbMTU0MCwxNDczLDE1MjhdLFsxMDc4LDE1MDIsMTc4N10sWzE0MjUsMTQzMCwxNDM4XSxbMTYxNywxNjMwLDE2MzFdLFs5NTksNzQ5LDk0NF0sWzU2Niw1NzAsNjAzXSxbMTcxNiwzMTAsMTUyMV0sWzc3NSw0NTIsMzk3XSxbMTYxNSwxNjM2LDE2MTZdLFsxNjE2LDE2MzYsMTYxMl0sWzE2MTAsMTYzMiwxNjI3XSxbNzg5LDcwNCwxMjU4XSxbMTQ1NywxNDgxLDE1OTFdLFsxNzY5LDE3NTYsODExXSxbMjA3LDE2MjksNzIyXSxbMTYyOSwxNjI1LDcyMl0sWzEyMjQsMTI3NywxNjIyXSxbMTYyMiwxNjM2LDE2MTVdLFsxNjM2LDE2NDYsMTYxMl0sWzE2MTIsMTYzMCwxNjE3XSxbMTYzMSwxNjI2LDE2MTRdLFsxNjE0LDE2MzIsMTYxMF0sWzE1MDYsMTA0LDk1XSxbMTQ4MSwxNDU3LDExMzZdLFsxMTIzLDk0MywxNDQyXSxbOTM2LDE0NDYsMTQ5Nl0sWzE0OTksODYzLDE0NzZdLFsxNjI5LDEwMzEsMTYyNV0sWzEyMzMsMTUwOSw2ODZdLFsxNjMzLDE2MzQsMTYyMV0sWzE2MjEsMTM4NywxNDAzXSxbMTQ3MiwxNTEyLDI1M10sWzExNzcsMjA4LDcwNF0sWzEyNzcsMTYzNiwxNjIyXSxbMTYyNiwxNjMyLDE2MTRdLFsxNjI3LDE2MzMsMTYyMV0sWzkzNiwxNDk2LDE0OTBdLFsxODUsMTQ1NCwxNDUxXSxbNzMxLDkzNiwxNTEyXSxbMTYzOCwxNjM1LDIwN10sWzU1MywxMjYzLDEyNjRdLFsxNjUzLDEyMTIsMTYzOV0sWzE2MzMsMTYyNywxNjMyXSxbMTYzMywxMzg3LDE2MzRdLFsxNDU4LDEwNjAsNzMxXSxbMzY4LDEzMDcsMTExM10sWzEyNjQsMTAzMSwxNjI5XSxbMTE1Miw4NTAsMTE1MF0sWzEyNzcsMTY0NCwxNjM2XSxbMTY0NiwxNjM3LDE2MTJdLFsxNjM3LDE2MzAsMTYxMl0sWzE2NDcsMTYzMSwxNjMwXSxbMTY0NywxNjI2LDE2MzFdLFsxNDIyLDE1MjQsMTQ5NF0sWzEwMzAsNjUyLDE1NDZdLFsxNjM1LDE2MjksMjA3XSxbMTYzNSwxMjY0LDE2MjldLFsxNjM5LDE2NDYsMTYzNl0sWzE2MzcsMTY0MCwxNjMwXSxbMTY0MSwxNjMyLDE2MjZdLFsxNjMyLDE2NDIsMTYzM10sWzE2MzMsMTY0MywxMzg3XSxbODQyLDE0OTksMTE0M10sWzg2NSw4NjMsMTQ5OV0sWzE1MTYsOTc4LDE0OTJdLFs2NywxMTMwLDc4NF0sWzExMDMsMTUwNSw5Nl0sWzg4LDE0NDEsMTIwMF0sWzE2NDQsMTYzOSwxNjM2XSxbMTY0MCwxNjQ3LDE2MzBdLFsxNjQ3LDE2NDEsMTYyNl0sWzE2MzMsMTY0OCwxNjQzXSxbMTQ5MiwxNTMyLDE1MjRdLFsxNDg4LDE1MTYsMTQ5Ml0sWzEwMzcsMTQ3MSwxNDYyXSxbNjEyLDEyNjQsMTYzNV0sWzE1MDIsMTA3OCwxMTI0XSxbMTY0MSwxNjQyLDE2MzJdLFsxNjQ4LDE2MzMsMTY0Ml0sWzE1MjgsNTEzLDg2OF0sWzE0OTIsMTU5OCwxNTMyXSxbMTA5NSw5OTEsNzYwXSxbNjc5LDE1NywxNjY0XSxbNzYwLDExMjgsMTc4NV0sWzEyNzcsMTY1MCwxNjQ0XSxbMzIwLDEwMjIsMjQ0XSxbMTU1OSwxNTQ5LDg2XSxbMTY3NiwxNTIwLDddLFsxNDg4LDk3OCwxNTE2XSxbMTA5NSw3NjAsMTc4NV0sWzExMjgsMzg0LDExMjBdLFszMDQsMzEyLDE2MzhdLFsxMDgxLDE2MzgsMzEyXSxbMTA4MSwxNjM1LDE2MzhdLFsxMDMsNjEyLDE2MzVdLFs2NTIsMTQ3NywxNDYyXSxbMTY1MCwxNjQ1LDE2NDRdLFsxNjQ1LDE2MzksMTY0NF0sWzE2MzksMTYzNywxNjQ2XSxbMTY0MCwxMDkwLDE2NDddLFsxNjU0LDE2NDEsMTY0N10sWzE2NTQsMTY0MiwxNjQxXSxbMTY1NCwxNjQ4LDE2NDJdLFsxNjQzLDE0MDIsMTM4N10sWzE0MzIsMzM1LDE1MDldLFszODQsMTEyOCw3NjBdLFsxNjUyLDMxMiwzMDRdLFsxMDMsMTI0Myw2MTJdLFsxMjc3LDE2NDksMTY1MF0sWzEwOTAsMTY1NCwxNjQ3XSxbMTY0MywxNjQ4LDE0MDJdLFsxMTM0LDMyNCwxNjc1XSxbNjc5LDY4LDE1N10sWzE2NTIsMTA4MSwzMTJdLFsxMTM2LDMwMSw4MDNdLFsxNjUzLDE2MzksMTY0NV0sWzcyMywxNDQwLDEyNTldLFs4MDMsODU0LDExMzZdLFsxMDQsMTUwNiw3NDJdLFsxMTEyLDE1OSwxMDNdLFsxNjU0LDEwODMsMTY0OF0sWzk3NywxNjUxLDEyNTddLFsxMzk3LDE1MDcsNzE4XSxbMTA4MSwxMDMsMTYzNV0sWzE2NTAsNjc3LDE2NDVdLFsxMDgzLDE0MDIsMTY0OF0sWzE3MDYsMTY1NSwxNjcxXSxbMTYyNCwxNzA0LDE3MTFdLFs3NjcsMiwxXSxbNjA4LDc5NCwyOTRdLFsxNjc4LDE2ODMsMTY4Nl0sWzc2NywxNjgyLDJdLFsxNjY5LDE2OTIsMTY3NV0sWzI5NiwxNjgxLDc2NF0sWzE2NzEsMTY1NiwxNjcyXSxbMTcsMTY3MywxNjc5XSxbMTcwNiwxNjcxLDE2NzNdLFsxNjYyLDE2NzQsMTY5OV0sWzE2NTUsMTY1NywxNjU2XSxbNDE4LDg0LDkxNV0sWzE1MjYsMTUxNCw3NjRdLFsxNjU4LDE2NTcsNTY3XSxbODcwLDE2OTUsNzY0XSxbODEzLDE2OTcsOThdLFsxNjU5LDgyMSw1XSxbNjAsMTAxMyw4NDhdLFsxMDEzLDExMCwxMjEzXSxbNjYxLDEwMzgsMTY5Ml0sWzE2NjAsMTcwMywxN10sWzE2OTMsMTY3MywxN10sWzE2NjMsMTcxNSwxNzQzXSxbMTAxMywxMTUsMTEwXSxbMzQ0LDE3MzMsMzJdLFsxNjcwLDE2NjMsMTc0M10sWzE2NzAsMTc0MywxNzM4XSxbMTY3NywxNjcwLDE3MzhdLFsxNjYxLDQsM10sWzEwODQsMTY4MywxNjc4XSxbMTcyOCw3OTMsMTEzMF0sWzE2ODMsMTc2NywxMTk2XSxbMTY3NywxNzM4LDExOTZdLFsxMjc5LDE3ODYsODUzXSxbMjk0LDEwMzgsNjA4XSxbMTI3OSwxNjg5LDE3ODZdLFs4NzAsMTgsMTcwOF0sWzg3MCwxNjgwLDE2OTVdLFsxNzA1LDEwLDE2NzBdLFsxMDg0LDE3NjcsMTY4M10sWzExOTYsMTczOCwxNjg2XSxbMTc1MCw4NzAsMTY4MV0sWzE3NTAsMTgsODcwXSxbMTc3MywxNzAzLDE2NjBdLFsxMTM1LDQ3LDQyNV0sWzE1MCwzMjMsMTEzNF0sWzE3MDcsMTY1NSwxNzA2XSxbMTc0MSwzNDQsMTY4N10sWzE2ODUsMTY5MSwxNjg0XSxbMTY4NCwxNjkxLDgwMl0sWzE2NzIsMTY1NiwwXSxbMTAzOCwxMjQsNjA4XSxbMTY3MSwxNjcyLDE2OTBdLFsxNjI4LDEyMTgsMTc2N10sWzE2ODYsMTI3NSwxNjY3XSxbMTQ5MywxNzUwLDE2ODFdLFsxNzczLDE4LDE3NTBdLFsxNzczLDE2NjAsMThdLFsxNjc5LDE2NzEsMTZdLFsxNzM1LDE3MDYsMTY3M10sWzE2NjcsMTY3OCwxNjg2XSxbMTY4OCwxNjU4LDFdLFsxNjU2LDE2ODgsMF0sWzEyOTMsMTI4MSwxNDU4XSxbMTY5OCwxNjc4LDE2NjddLFsxNjk2LDExMzAsMTcyMl0sWzE2OTgsMTY2NywxNjk2XSxbMTcxNSwxNjYyLDE2OTldLFsxNjkyLDEwMzgsMjk0XSxbMTY4Miw3NjcsMzU3XSxbMTY2OSw2NjEsMTY5Ml0sWzgwMiwxNzAyLDgyNF0sWzEwMjgsMTA2NywxNzg0XSxbODIyLDE2MjQsNzc4XSxbMTE5LDgxMyw4NjFdLFsxMjE4LDE2NzAsMTY3N10sWzE3MDMsMTY5MywxN10sWzE2NTgsMTcxMCwxXSxbNzUwLDE3MzAsMTcyOV0sWzE3MDEsNzUwLDE3MjldLFsxNjkzLDE3MzUsMTY3M10sWzE3MzEsMTY5NCw5OF0sWzE2OTEsMTcwMiw4MDJdLFs3ODMsMTcyOSwxNzE5XSxbMTY4MCw4NzAsMTcwOF0sWzE3MDcsMTcwOSwxNjU1XSxbNTMzLDc1Niw2NzVdLFsxNjkxLDEyMTAsMTcwMl0sWzExLDE3MDUsMTY3MF0sWzE3NjcsMTIxOCwxMTk2XSxbMTIxOCwxNjc3LDExOTZdLFsxNjY0LDE3MTYsMTcyMV0sWzE3MjksMTcyNSwxNzE5XSxbMTcyOSwxMDcyLDE3MjVdLFsxMjEwLDExMTYsMTcwMl0sWzE3MDIsMTcyMCw4MjRdLFsxNjgyLDE2NjEsMl0sWzE3MTMsMTcxOSwxNzIxXSxbMTcxNiwxNzg2LDE3MTNdLFsxNzMwLDE3MjIsMTA3Ml0sWzI5NCwxNzE3LDE4MTFdLFsxNjkyLDI5NCwxNjY2XSxbMTY1OSw2ODAsODIxXSxbODI0LDE3MjAsMTcxNF0sWzE3MjYsMTczMSwxNzE4XSxbMzQ1LDEwNjIsMTA0NV0sWzE3MzgsMTc0MywxMjc1XSxbMTA3NSwxMDg5LDEwNzFdLFs3ODMsMTcxOSwxNjg5XSxbMTI3NSw2ODQsMTcyOF0sWzE2OTIsMTY2NiwxNjY1XSxbMTY3NSwxNjkyLDE2NjVdLFsyOTQsMTgxMSwxNjY2XSxbMTcxNiwxNjY0LDMxMF0sWzE2NzgsMTY5OCwxNzAwXSxbNiw5LDE3MjddLFs2NzYsNjQ5LDU5NV0sWzM4MSwzMSwzNjFdLFsxNzIzLDE4MDQsMTc3Ml0sWzE3MjcsOSwxNjk0XSxbMTcyMCwxMDg5LDE3MTRdLFsxNzg2LDE3MTYsMTQxMl0sWzE2ODMsMTE5NiwxNjg2XSxbMTcxOCwxNjk3LDEwODVdLFsxMTE2LDE3MzksMTcwMl0sWzE3MzksMTczNCwxNzIwXSxbMTcwMiwxNzM5LDE3MjBdLFsxMDg5LDE3MjAsMTczNF0sWzUwOSw3NDgsMTc0NV0sWzE3NDMsMTcxNSwxNzI2XSxbMTcxNywyOTQsNzk0XSxbMTExNiwxNzMyLDE3MzldLFsxNzE4LDE3MzEsMTY5N10sWzE2OTYsMTY2NywxMTMwXSxbMTEzNCwxNjY1LDE3MjNdLFsxNjk0LDcxMiw5OF0sWzEwMSwxNjg3LDEwMl0sWzM5MSwxNzM2LDEwMV0sWzY2Miw2MzYsNjQyXSxbMTczNCwxNDQ3LDEwODldLFsxMDg5LDE0NDcsMTA3MV0sWzQzNiw5OSw0OTNdLFsxNjg5LDEyNzksNzgzXSxbMTQ4NSwxNDY1LDEzNDJdLFsxNzM2LDE2ODcsMTAxXSxbMzQ0LDE3NDEsMTczM10sWzE3NDEsMTc0MiwxNzMzXSxbMTczNSw4MjksMTcwNl0sWzgyOSwxNzA3LDE3MDZdLFsxNDg1LDEzMzIsMTQ2NV0sWzk1MiwxMTI2LDE3NDJdLFsxNzQ3LDE0NDcsMTczNF0sWzg3OSw4OTIsNjQ1XSxbMTczMCwxMTQ2LDE2OTZdLFs4MjksMTcwOSwxNzA3XSxbMTcwOSwxNzEyLDE2NTVdLFsxMTgsMTczOSwxNzMyXSxbMTMzMiwxNzQ0LDE0NjVdLFsxNjg3LDE3NDksMTc0MV0sWzE3NDEsMTc1OCwxNzQyXSxbNjc5LDEwNzIsNjhdLFsxMDcyLDE3MjIsNjhdLFsxMTgsMTc0NywxNzM5XSxbMTc0NywxNzM0LDE3MzldLFsxNDY1LDE3NDQsMTczNl0sWzE3MzYsMTc0MCwxNjg3XSxbMTcwNCwxNzAxLDc4M10sWzE2NjUsNjI0LDE3MjNdLFsxNzIyLDExMzAsNjddLFsxMDI1LDEwNTUsNDY3XSxbMTQ0NCwxNCwxNzAxXSxbNTU4LDUyMiw1MzBdLFsxNjU3LDE2NTgsMTY4OF0sWzEzMzksMTc0NiwxMzMyXSxbMTMzMiwxNzQ4LDE3NDRdLFsxNjg3LDE3NDAsMTc0OV0sWzE3NDEsMTc0OSwxNzU4XSxbMTEwOSw5NTIsMTc0Ml0sWzE3NDcsMTE4LDE0MV0sWzE2NzEsMTY5MCwxNjI4XSxbMTY3MSwxNjI4LDE2XSxbMTY1NywxNjg4LDE2NTZdLFsxNzQ1LDc0OCwxNDQ3XSxbMzU3LDc2NywxNzEwXSxbMTc0NiwxNzQ4LDEzMzJdLFsxMTQ2LDE3MDAsMTY5OF0sWzE3NTksMTMwNywxMzM4XSxbMTIzOSw3ODEsMTMyMl0sWzE3NDUsMTQ0NywxNzQ3XSxbNTIyLDE3NDUsMTc0N10sWzMxNiw3MTcsNTk1XSxbMTQ4LDE0OTMsMTcyNF0sWzE3NTgsMTEwOSwxNzQyXSxbMTcyNSwxMDcyLDY3OV0sWzcyNiw3MTksMTY2MV0sWzE2OTUsMTY4MCwxNTI2XSxbMTc3MiwxNzUwLDE0OTNdLFsxNDgsMTc3MiwxNDkzXSxbMTU0MiwxNzUxLDExMDFdLFs5NTIsMTEwOSwxMDg2XSxbMTc0NCwxNzUyLDE3MzZdLFsxNzM2LDE3NTIsMTc0MF0sWzE3NTMsMTc1NSwxNzQwXSxbMzkxLDEzNDIsMTczNl0sWzgyMSwxMTIsMTUyMF0sWzU1Nyw1MzAsMTc0N10sWzUzMCw1MjIsMTc0N10sWzk5NCw4NzksNjQ1XSxbMTU0MiwxNzU2LDE3NTFdLFsxODEzLDE2OTMsMTcwM10sWzE3NDYsMTc1NCwxNzQ4XSxbMTc0OCwxNzY0LDE3NDRdLFsxNzUyLDE3NTcsMTc0MF0sWzE3NDAsMTc1NywxNzUzXSxbMTc0OSwxNzQwLDE3NTVdLFsxNzU1LDE3NjMsMTc0OV0sWzE3NjMsMTc1OCwxNzQ5XSxbMTI3NSwxNzQzLDY4NF0sWzE4MTMsMTczNSwxNjkzXSxbMTEwNywxMDk5LDExMDFdLFsxNzIzLDYyNCwxODA0XSxbMTQwMywxNjAzLDE2MDldLFsxNzQ4LDE3NTQsMTc2NF0sWzE3NDQsMTc1NywxNzUyXSxbMTc2MCwxMTA5LDE3NThdLFsxNDY1LDE3MzYsMTM0Ml0sWzQzNiwxMTUsOTldLFsxNjg2LDE3MzgsMTI3NV0sWzE3NTEsMTc2NiwxMTAxXSxbMTc1OSwxNzU0LDE3NDZdLFsxNzU1LDE3NTMsMTc2M10sWzE1NzAsMTI3OSw4NTNdLFsxNzAxLDExNDYsNzUwXSxbMTY1NSwxNjU2LDE2NzFdLFsxMSwxNjcwLDEyMThdLFsxNzYxLDE3NTEsMTc1Nl0sWzE3NjYsMTEwNywxMTAxXSxbMTcyNiwxNjIzLDE3MzFdLFsxNzExLDE3MDQsMTI3OV0sWzY3LDc4NCw2OF0sWzU1OCw1MzAsNTQ1XSxbMTYyMCwxNjE4LDEyMzNdLFsxNzY5LDE3NjEsMTc1Nl0sWzEwMiwxNjg3LDM0NF0sWzEzMzgsMTc1NCwxNzU5XSxbMTc1NCwyMzIsMTc2NF0sWzE3NDQsMTc2NSwxNzU3XSxbMTc1NywxNzYzLDE3NTNdLFsxNzYyLDE3NjAsMTc1OF0sWzE3NjAsMTc3MSwxMTA5XSxbMTMzOSwxNzU5LDE3NDZdLFsxNjc1LDE2NjUsMTEzNF0sWzE3MzAsMTY5NiwxNzIyXSxbMTc3NCwxNzUxLDE3NjFdLFsxNzY2LDE3ODAsMTEwN10sWzE3ODAsMTEwNSwxMTA3XSxbMTc2NCwxNzY1LDE3NDRdLFsxNzYzLDE3NjIsMTc1OF0sWzE3NzIsMTc3MywxNzUwXSxbMTgxMSwxODEzLDE3MDNdLFsxNDM0LDE3NjksMTQzMl0sWzE3ODAsMTc2NiwxNzUxXSxbMjMyLDE3ODEsMTc2NF0sWzE3MTEsMTI3OSwxNTcwXSxbMTY4OCwxLDBdLFsxNzc0LDE3ODAsMTc1MV0sWzE3NjQsMTc4MSwxNzY1XSxbMTc2NSwxNzY4LDE3NTddLFsxNzU3LDE3NjgsMTc2M10sWzE3NzcsMTc4MiwxNzYwXSxbMTc2MiwxNzc3LDE3NjBdLFsxNzY5LDE3NzQsMTc2MV0sWzE3NjMsMTc3NywxNzYyXSxbMTc2MCwxNzgyLDE3NzFdLFsyMzIsMTczNywxNzgxXSxbMTc2OCwxNzc2LDE3NjNdLFsyNzIsMjU1LDc3NF0sWzE2NjksOTk0LDY2MV0sWzE2MTgsMTc2OSwxNDM0XSxbMTc2NSw1ODksMTc2OF0sWzE3NzAsMTc3NywxNzYzXSxbMTcwMSwxNzI5LDc4M10sWzE3ODMsMTc3NCwxNzY5XSxbMTc4OSwxNzgwLDE3NzRdLFs1ODksMTc3NSwxNzY4XSxbMTc3NiwxNzcwLDE3NjNdLFsxNzgyLDE3NzgsMTc3MV0sWzE3NzEsMTc3OCwxMDcwXSxbNjI0LDE3MDMsMTc3M10sWzYyNCwxODExLDE3MDNdLFsxNjIwLDEyNDQsMTYxOF0sWzE3NzksMTc2OSwxNjE4XSxbMTc3OSwxNzgzLDE3NjldLFs3MzksMTczNSwxODEzXSxbMTc3NSwxNzc2LDE3NjhdLFsxNzkwLDE3NzcsMTc3MF0sWzE3NzcsMTc3OCwxNzgyXSxbMTcyNSw2NzksMTcyMV0sWzczMywxMjkzLDE0NThdLFsxODAyLDE2MTgsMTI0NF0sWzE4MDIsMTc3OSwxNjE4XSxbMTc4OCwxNzgzLDE3NzldLFsxNzg5LDE3NzQsMTc4M10sWzE3OTYsMTc4MCwxNzg5XSxbMTc5NiwxMTE5LDE3ODBdLFsxODIzLDE4MTcsMzI1XSxbMTY5OSwxNzI3LDE2MjNdLFs3NTAsMTE0NiwxNzMwXSxbMTQ5NywxNzI0LDI5Nl0sWzExMjgsMTExOSwxNzk2XSxbNjEsNjIsNzFdLFsxMTMxLDQxMyw4MjRdLFsxMTE0LDExMTEsMjQ5XSxbMTc4NCwxNzc2LDE3NzVdLFsxMTIzLDcyMywxMjgzXSxbMTc5MSwxNzg4LDE3NzldLFsxNzg4LDE3ODksMTc4M10sWzEwOTUsMTc5NywxMDc0XSxbMTAyOCwxNzg0LDE3NzVdLFsxNzg0LDE3NzAsMTc3Nl0sWzE3NzcsMTc5MCwxNzc4XSxbMTc5MywxNzk3LDEwOTVdLFsxNzk3LDE4MDAsMTA3NF0sWzE3OTgsMTc5MCwxNzcwXSxbMTgwNSwxODAyLDEyNDRdLFsxODAyLDE3OTEsMTc3OV0sWzE3OTIsMTc4OSwxNzg4XSxbMTc5MywxNzg1LDExMjhdLFsxNzkzLDEwOTUsMTc4NV0sWzEwNzQsMTgwMCwxNjE5XSxbNzQxLDQ1Nyw1OTNdLFsxNzk4LDE3NzAsMTc4NF0sWzE3OTgsMTc5NCwxNzkwXSxbMTc4NiwxNjg5LDE3MTNdLFs2ODQsMTcyNiwxNzE4XSxbMTcyOCwxMDg1LDc5M10sWzE3OTUsMTc4NywxNTAyXSxbMTgwNiwxODAyLDE4MDVdLFsxODE5LDE3ODgsMTc5MV0sWzEwNjcsMTc5OCwxNzg0XSxbMTc5MCwxNzk0LDE3NzhdLFsxNzk1LDE1MDIsMTEyNF0sWzE4MDEsMTgwNSwxNzg3XSxbMTgwNywxNzkxLDE4MDJdLFsxODA3LDE4MTksMTc5MV0sWzE4MTksMTc5MiwxNzg4XSxbMTc5OSwxMTI4LDE3OTZdLFs5OTQsNjQ1LDY2MV0sWzY4NCwxMDg1LDE3MjhdLFs2ODQsMTcxOCwxMDg1XSxbMTY5OSwxNjIzLDE3MjZdLFsxODAxLDE3ODcsMTc5NV0sWzE4MDgsMTc4OSwxNzkyXSxbMTgwOCwxNzk2LDE3ODldLFsxNzk5LDE3OTMsMTEyOF0sWzE4MDksMTc5NywxNzkzXSxbMTgwOSwxODAzLDE3OTddLFsxODAzLDE4MDAsMTc5N10sWzEwNjcsMTc5NCwxNzk4XSxbNzc0LDI1NSwxNzc4XSxbMTY3MywxNjcxLDE2NzldLFs4NzksMTY2OSw4ODhdLFsxOSwxODA3LDE4MDJdLFsxODEwLDE2MTksMTgwMF0sWzg3OSw5OTQsMTY2OV0sWzE3OTQsNzc0LDE3NzhdLFsxNzIzLDE3NzIsMTQ4XSxbMTgwNCwxNzczLDE3NzJdLFsxODE0LDE3OTUsMTEyNF0sWzE2NDksMTgxNCwxMTI0XSxbMTgxNCwxODAxLDE3OTVdLFsxODEyLDE4MDYsMTgwNV0sWzE5LDE4MDIsMTgwNl0sWzE5LDE4MTksMTgwN10sWzE4MTAsMTgwMCwxODAzXSxbMTgwNCw2MjQsMTc3M10sWzE3MTQsMTEzMSw4MjRdLFsxODAxLDE4MTIsMTgwNV0sWzE4MTIsMTksMTgwNl0sWzE4MDgsMTc5MiwxODE5XSxbMTc5OSwxODA5LDE3OTNdLFsxODIxLDE4MTAsMTgwM10sWzE3MTcsNzM5LDE4MTNdLFsxMDYxLDE2MTksMTgyMl0sWzE3OTQsMTgxNyw3NzRdLFs3OSwxNDgyLDE0NF0sWzE4MTUsMTgwMSwxODE0XSxbMjMsMTgxOSwxOV0sWzU4OSwxMDI4LDE3NzVdLFsxODE3LDE4MjMsNzc0XSxbMTY4OSwxNzE5LDE3MTNdLFsxODI0LDE4MTQsMTY0OV0sWzE4MjcsMTgxOCwxODAxXSxbMTgxOCwxODEyLDE4MDFdLFsxODE4LDE5LDE4MTJdLFsxODE4LDIwLDE5XSxbMTgxNiwxODA5LDE3OTldLFsxODIxLDE4MDMsMTgwOV0sWzE4MjIsMTYxOSwxODEwXSxbMTI0LDcwOCw2MDhdLFsxNjYzLDEwLDE3MTVdLFsxODE1LDE4MjcsMTgwMV0sWzE4MjAsMTgwOCwxODE5XSxbMjMsMTgyMCwxODE5XSxbNjAzLDE4MTAsMTgyMV0sWzYwMywxODIyLDE4MTBdLFsxMDg1LDE2OTcsNzkzXSxbMTYyOCwxNjkwLDExXSxbMTUyNywxNzA0LDE2MjRdLFsxNzMwLDEwNzIsMTcyOV0sWzE1MjYsMTQ0NCwxNzA0XSxbMTUyNiwxNjgwLDE0NDRdLFsxNzA0LDE0NDQsMTcwMV0sWzE4MTYsMTgyMSwxODA5XSxbMTcyMiw2Nyw2OF0sWzMxNywyNzIsMTgyM10sWzE3MTYsMTcxMywxNzIxXSxbMTYsMTYyOCwxNzY3XSxbMTUyNywxNTI2LDE3MDRdLFsxODI0LDE4MjYsMTgxNF0sWzE4MTQsMTgyNiwxODE1XSxbMTgxOCwyMSwyMF0sWzE4MzUsMTgwOCwxODIwXSxbNjAzLDU3MCwxODIyXSxbMjI2LDEwNzAsMTc3OF0sWzEwMTMsMTE4MSwxMTc5XSxbMTcyMSw2NzksMTY2NF0sWzE3MTcsMTgxMywxODExXSxbMTgyOCwxODI3LDE4MTVdLFsyMiwxODIwLDIzXSxbMjIsMTgzNSwxODIwXSxbMTgzMCw2MDMsMTgyMV0sWzcxOSwxNjU5LDVdLFs2NDMsNTY3LDE2NTddLFsxNzE3LDc5NCw3MzldLFsxODI1LDE4MjYsMTgyNF0sWzE4MjgsMTgxNSwxODI2XSxbMTgyOSwyMSwxODE4XSxbMTgwOCwxODM1LDEzXSxbNCw3MTksNV0sWzEwLDE2NjIsMTcxNV0sWzE4MjgsMTgzMiwxODI3XSxbMTgzMiwxODE4LDE4MjddLFsxMiwxODMzLDE4MTZdLFsxODMzLDE4MjEsMTgxNl0sWzE4MzMsMTgzMCwxODIxXSxbMTQsMTE0NiwxNzAxXSxbMTE4NiwxODI5LDE4MThdLFsxMjgwLDYwMywxODMwXSxbMTQsMTcwMCwxMTQ2XSxbMTY2NywxNzI4LDExMzBdLFsxODI1LDE4MzQsMTgyNl0sWzE4MzQsMTgyOCwxODI2XSxbMTgzMiwxMTg2LDE4MThdLFsxODM2LDEzLDE4MzVdLFsxNjI0LDE3MTEsMTU3MF0sWzc3OCwxNjI0LDE1NzBdLFsxNzE5LDE3MjUsMTcyMV0sWzEwMDIsMTgyNSwxODMxXSxbMTAwMiwxODM0LDE4MjVdLFsxODM0LDE4MzIsMTgyOF0sWzExODYsMjEsMTgyOV0sWzE4MzYsMTgzNSwyMl0sWzE4MzcsMTgzMywxMl0sWzEyODAsMTgzMCwxODMzXSxbMTY2NywxMjc1LDE3MjhdLFsxNiwxNzY3LDEwODRdLFs1ODksMTc2NSwxODM4XSxbMTc2NSwxNzgxLDE4MzhdLFsxNzgxLDE3MzcsMTgzOF0sWzE3MzcsOTgyLDE4MzhdLFs5ODIsMTA1MywxODM4XSxbMTA1Myw4MTYsMTgzOF0sWzgxNiw1ODksMTgzOF1dXG4iLCJtb2R1bGUuZXhwb3J0cyA9IGFkam9pbnQ7XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgYWRqdWdhdGUgb2YgYSBtYXQ0XG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgc291cmNlIG1hdHJpeFxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiBhZGpvaW50KG91dCwgYSkge1xuICAgIHZhciBhMDAgPSBhWzBdLCBhMDEgPSBhWzFdLCBhMDIgPSBhWzJdLCBhMDMgPSBhWzNdLFxuICAgICAgICBhMTAgPSBhWzRdLCBhMTEgPSBhWzVdLCBhMTIgPSBhWzZdLCBhMTMgPSBhWzddLFxuICAgICAgICBhMjAgPSBhWzhdLCBhMjEgPSBhWzldLCBhMjIgPSBhWzEwXSwgYTIzID0gYVsxMV0sXG4gICAgICAgIGEzMCA9IGFbMTJdLCBhMzEgPSBhWzEzXSwgYTMyID0gYVsxNF0sIGEzMyA9IGFbMTVdO1xuXG4gICAgb3V0WzBdICA9ICAoYTExICogKGEyMiAqIGEzMyAtIGEyMyAqIGEzMikgLSBhMjEgKiAoYTEyICogYTMzIC0gYTEzICogYTMyKSArIGEzMSAqIChhMTIgKiBhMjMgLSBhMTMgKiBhMjIpKTtcbiAgICBvdXRbMV0gID0gLShhMDEgKiAoYTIyICogYTMzIC0gYTIzICogYTMyKSAtIGEyMSAqIChhMDIgKiBhMzMgLSBhMDMgKiBhMzIpICsgYTMxICogKGEwMiAqIGEyMyAtIGEwMyAqIGEyMikpO1xuICAgIG91dFsyXSAgPSAgKGEwMSAqIChhMTIgKiBhMzMgLSBhMTMgKiBhMzIpIC0gYTExICogKGEwMiAqIGEzMyAtIGEwMyAqIGEzMikgKyBhMzEgKiAoYTAyICogYTEzIC0gYTAzICogYTEyKSk7XG4gICAgb3V0WzNdICA9IC0oYTAxICogKGExMiAqIGEyMyAtIGExMyAqIGEyMikgLSBhMTEgKiAoYTAyICogYTIzIC0gYTAzICogYTIyKSArIGEyMSAqIChhMDIgKiBhMTMgLSBhMDMgKiBhMTIpKTtcbiAgICBvdXRbNF0gID0gLShhMTAgKiAoYTIyICogYTMzIC0gYTIzICogYTMyKSAtIGEyMCAqIChhMTIgKiBhMzMgLSBhMTMgKiBhMzIpICsgYTMwICogKGExMiAqIGEyMyAtIGExMyAqIGEyMikpO1xuICAgIG91dFs1XSAgPSAgKGEwMCAqIChhMjIgKiBhMzMgLSBhMjMgKiBhMzIpIC0gYTIwICogKGEwMiAqIGEzMyAtIGEwMyAqIGEzMikgKyBhMzAgKiAoYTAyICogYTIzIC0gYTAzICogYTIyKSk7XG4gICAgb3V0WzZdICA9IC0oYTAwICogKGExMiAqIGEzMyAtIGExMyAqIGEzMikgLSBhMTAgKiAoYTAyICogYTMzIC0gYTAzICogYTMyKSArIGEzMCAqIChhMDIgKiBhMTMgLSBhMDMgKiBhMTIpKTtcbiAgICBvdXRbN10gID0gIChhMDAgKiAoYTEyICogYTIzIC0gYTEzICogYTIyKSAtIGExMCAqIChhMDIgKiBhMjMgLSBhMDMgKiBhMjIpICsgYTIwICogKGEwMiAqIGExMyAtIGEwMyAqIGExMikpO1xuICAgIG91dFs4XSAgPSAgKGExMCAqIChhMjEgKiBhMzMgLSBhMjMgKiBhMzEpIC0gYTIwICogKGExMSAqIGEzMyAtIGExMyAqIGEzMSkgKyBhMzAgKiAoYTExICogYTIzIC0gYTEzICogYTIxKSk7XG4gICAgb3V0WzldICA9IC0oYTAwICogKGEyMSAqIGEzMyAtIGEyMyAqIGEzMSkgLSBhMjAgKiAoYTAxICogYTMzIC0gYTAzICogYTMxKSArIGEzMCAqIChhMDEgKiBhMjMgLSBhMDMgKiBhMjEpKTtcbiAgICBvdXRbMTBdID0gIChhMDAgKiAoYTExICogYTMzIC0gYTEzICogYTMxKSAtIGExMCAqIChhMDEgKiBhMzMgLSBhMDMgKiBhMzEpICsgYTMwICogKGEwMSAqIGExMyAtIGEwMyAqIGExMSkpO1xuICAgIG91dFsxMV0gPSAtKGEwMCAqIChhMTEgKiBhMjMgLSBhMTMgKiBhMjEpIC0gYTEwICogKGEwMSAqIGEyMyAtIGEwMyAqIGEyMSkgKyBhMjAgKiAoYTAxICogYTEzIC0gYTAzICogYTExKSk7XG4gICAgb3V0WzEyXSA9IC0oYTEwICogKGEyMSAqIGEzMiAtIGEyMiAqIGEzMSkgLSBhMjAgKiAoYTExICogYTMyIC0gYTEyICogYTMxKSArIGEzMCAqIChhMTEgKiBhMjIgLSBhMTIgKiBhMjEpKTtcbiAgICBvdXRbMTNdID0gIChhMDAgKiAoYTIxICogYTMyIC0gYTIyICogYTMxKSAtIGEyMCAqIChhMDEgKiBhMzIgLSBhMDIgKiBhMzEpICsgYTMwICogKGEwMSAqIGEyMiAtIGEwMiAqIGEyMSkpO1xuICAgIG91dFsxNF0gPSAtKGEwMCAqIChhMTEgKiBhMzIgLSBhMTIgKiBhMzEpIC0gYTEwICogKGEwMSAqIGEzMiAtIGEwMiAqIGEzMSkgKyBhMzAgKiAoYTAxICogYTEyIC0gYTAyICogYTExKSk7XG4gICAgb3V0WzE1XSA9ICAoYTAwICogKGExMSAqIGEyMiAtIGExMiAqIGEyMSkgLSBhMTAgKiAoYTAxICogYTIyIC0gYTAyICogYTIxKSArIGEyMCAqIChhMDEgKiBhMTIgLSBhMDIgKiBhMTEpKTtcbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IGNsb25lO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgbWF0NCBpbml0aWFsaXplZCB3aXRoIHZhbHVlcyBmcm9tIGFuIGV4aXN0aW5nIG1hdHJpeFxuICpcbiAqIEBwYXJhbSB7bWF0NH0gYSBtYXRyaXggdG8gY2xvbmVcbiAqIEByZXR1cm5zIHttYXQ0fSBhIG5ldyA0eDQgbWF0cml4XG4gKi9cbmZ1bmN0aW9uIGNsb25lKGEpIHtcbiAgICB2YXIgb3V0ID0gbmV3IEZsb2F0MzJBcnJheSgxNik7XG4gICAgb3V0WzBdID0gYVswXTtcbiAgICBvdXRbMV0gPSBhWzFdO1xuICAgIG91dFsyXSA9IGFbMl07XG4gICAgb3V0WzNdID0gYVszXTtcbiAgICBvdXRbNF0gPSBhWzRdO1xuICAgIG91dFs1XSA9IGFbNV07XG4gICAgb3V0WzZdID0gYVs2XTtcbiAgICBvdXRbN10gPSBhWzddO1xuICAgIG91dFs4XSA9IGFbOF07XG4gICAgb3V0WzldID0gYVs5XTtcbiAgICBvdXRbMTBdID0gYVsxMF07XG4gICAgb3V0WzExXSA9IGFbMTFdO1xuICAgIG91dFsxMl0gPSBhWzEyXTtcbiAgICBvdXRbMTNdID0gYVsxM107XG4gICAgb3V0WzE0XSA9IGFbMTRdO1xuICAgIG91dFsxNV0gPSBhWzE1XTtcbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IGNvcHk7XG5cbi8qKlxuICogQ29weSB0aGUgdmFsdWVzIGZyb20gb25lIG1hdDQgdG8gYW5vdGhlclxuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xuZnVuY3Rpb24gY29weShvdXQsIGEpIHtcbiAgICBvdXRbMF0gPSBhWzBdO1xuICAgIG91dFsxXSA9IGFbMV07XG4gICAgb3V0WzJdID0gYVsyXTtcbiAgICBvdXRbM10gPSBhWzNdO1xuICAgIG91dFs0XSA9IGFbNF07XG4gICAgb3V0WzVdID0gYVs1XTtcbiAgICBvdXRbNl0gPSBhWzZdO1xuICAgIG91dFs3XSA9IGFbN107XG4gICAgb3V0WzhdID0gYVs4XTtcbiAgICBvdXRbOV0gPSBhWzldO1xuICAgIG91dFsxMF0gPSBhWzEwXTtcbiAgICBvdXRbMTFdID0gYVsxMV07XG4gICAgb3V0WzEyXSA9IGFbMTJdO1xuICAgIG91dFsxM10gPSBhWzEzXTtcbiAgICBvdXRbMTRdID0gYVsxNF07XG4gICAgb3V0WzE1XSA9IGFbMTVdO1xuICAgIHJldHVybiBvdXQ7XG59OyIsIm1vZHVsZS5leHBvcnRzID0gY3JlYXRlO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgaWRlbnRpdHkgbWF0NFxuICpcbiAqIEByZXR1cm5zIHttYXQ0fSBhIG5ldyA0eDQgbWF0cml4XG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZSgpIHtcbiAgICB2YXIgb3V0ID0gbmV3IEZsb2F0MzJBcnJheSgxNik7XG4gICAgb3V0WzBdID0gMTtcbiAgICBvdXRbMV0gPSAwO1xuICAgIG91dFsyXSA9IDA7XG4gICAgb3V0WzNdID0gMDtcbiAgICBvdXRbNF0gPSAwO1xuICAgIG91dFs1XSA9IDE7XG4gICAgb3V0WzZdID0gMDtcbiAgICBvdXRbN10gPSAwO1xuICAgIG91dFs4XSA9IDA7XG4gICAgb3V0WzldID0gMDtcbiAgICBvdXRbMTBdID0gMTtcbiAgICBvdXRbMTFdID0gMDtcbiAgICBvdXRbMTJdID0gMDtcbiAgICBvdXRbMTNdID0gMDtcbiAgICBvdXRbMTRdID0gMDtcbiAgICBvdXRbMTVdID0gMTtcbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IGRldGVybWluYW50O1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGRldGVybWluYW50IG9mIGEgbWF0NFxuICpcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgc291cmNlIG1hdHJpeFxuICogQHJldHVybnMge051bWJlcn0gZGV0ZXJtaW5hbnQgb2YgYVxuICovXG5mdW5jdGlvbiBkZXRlcm1pbmFudChhKSB7XG4gICAgdmFyIGEwMCA9IGFbMF0sIGEwMSA9IGFbMV0sIGEwMiA9IGFbMl0sIGEwMyA9IGFbM10sXG4gICAgICAgIGExMCA9IGFbNF0sIGExMSA9IGFbNV0sIGExMiA9IGFbNl0sIGExMyA9IGFbN10sXG4gICAgICAgIGEyMCA9IGFbOF0sIGEyMSA9IGFbOV0sIGEyMiA9IGFbMTBdLCBhMjMgPSBhWzExXSxcbiAgICAgICAgYTMwID0gYVsxMl0sIGEzMSA9IGFbMTNdLCBhMzIgPSBhWzE0XSwgYTMzID0gYVsxNV0sXG5cbiAgICAgICAgYjAwID0gYTAwICogYTExIC0gYTAxICogYTEwLFxuICAgICAgICBiMDEgPSBhMDAgKiBhMTIgLSBhMDIgKiBhMTAsXG4gICAgICAgIGIwMiA9IGEwMCAqIGExMyAtIGEwMyAqIGExMCxcbiAgICAgICAgYjAzID0gYTAxICogYTEyIC0gYTAyICogYTExLFxuICAgICAgICBiMDQgPSBhMDEgKiBhMTMgLSBhMDMgKiBhMTEsXG4gICAgICAgIGIwNSA9IGEwMiAqIGExMyAtIGEwMyAqIGExMixcbiAgICAgICAgYjA2ID0gYTIwICogYTMxIC0gYTIxICogYTMwLFxuICAgICAgICBiMDcgPSBhMjAgKiBhMzIgLSBhMjIgKiBhMzAsXG4gICAgICAgIGIwOCA9IGEyMCAqIGEzMyAtIGEyMyAqIGEzMCxcbiAgICAgICAgYjA5ID0gYTIxICogYTMyIC0gYTIyICogYTMxLFxuICAgICAgICBiMTAgPSBhMjEgKiBhMzMgLSBhMjMgKiBhMzEsXG4gICAgICAgIGIxMSA9IGEyMiAqIGEzMyAtIGEyMyAqIGEzMjtcblxuICAgIC8vIENhbGN1bGF0ZSB0aGUgZGV0ZXJtaW5hbnRcbiAgICByZXR1cm4gYjAwICogYjExIC0gYjAxICogYjEwICsgYjAyICogYjA5ICsgYjAzICogYjA4IC0gYjA0ICogYjA3ICsgYjA1ICogYjA2O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IGZyb21RdWF0O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBtYXRyaXggZnJvbSBhIHF1YXRlcm5pb24gcm90YXRpb24uXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgbWF0NCByZWNlaXZpbmcgb3BlcmF0aW9uIHJlc3VsdFxuICogQHBhcmFtIHtxdWF0NH0gcSBSb3RhdGlvbiBxdWF0ZXJuaW9uXG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIGZyb21RdWF0KG91dCwgcSkge1xuICAgIHZhciB4ID0gcVswXSwgeSA9IHFbMV0sIHogPSBxWzJdLCB3ID0gcVszXSxcbiAgICAgICAgeDIgPSB4ICsgeCxcbiAgICAgICAgeTIgPSB5ICsgeSxcbiAgICAgICAgejIgPSB6ICsgeixcblxuICAgICAgICB4eCA9IHggKiB4MixcbiAgICAgICAgeXggPSB5ICogeDIsXG4gICAgICAgIHl5ID0geSAqIHkyLFxuICAgICAgICB6eCA9IHogKiB4MixcbiAgICAgICAgenkgPSB6ICogeTIsXG4gICAgICAgIHp6ID0geiAqIHoyLFxuICAgICAgICB3eCA9IHcgKiB4MixcbiAgICAgICAgd3kgPSB3ICogeTIsXG4gICAgICAgIHd6ID0gdyAqIHoyO1xuXG4gICAgb3V0WzBdID0gMSAtIHl5IC0geno7XG4gICAgb3V0WzFdID0geXggKyB3ejtcbiAgICBvdXRbMl0gPSB6eCAtIHd5O1xuICAgIG91dFszXSA9IDA7XG5cbiAgICBvdXRbNF0gPSB5eCAtIHd6O1xuICAgIG91dFs1XSA9IDEgLSB4eCAtIHp6O1xuICAgIG91dFs2XSA9IHp5ICsgd3g7XG4gICAgb3V0WzddID0gMDtcblxuICAgIG91dFs4XSA9IHp4ICsgd3k7XG4gICAgb3V0WzldID0genkgLSB3eDtcbiAgICBvdXRbMTBdID0gMSAtIHh4IC0geXk7XG4gICAgb3V0WzExXSA9IDA7XG5cbiAgICBvdXRbMTJdID0gMDtcbiAgICBvdXRbMTNdID0gMDtcbiAgICBvdXRbMTRdID0gMDtcbiAgICBvdXRbMTVdID0gMTtcblxuICAgIHJldHVybiBvdXQ7XG59OyIsIm1vZHVsZS5leHBvcnRzID0gZnJvbVJvdGF0aW9uVHJhbnNsYXRpb247XG5cbi8qKlxuICogQ3JlYXRlcyBhIG1hdHJpeCBmcm9tIGEgcXVhdGVybmlvbiByb3RhdGlvbiBhbmQgdmVjdG9yIHRyYW5zbGF0aW9uXG4gKiBUaGlzIGlzIGVxdWl2YWxlbnQgdG8gKGJ1dCBtdWNoIGZhc3RlciB0aGFuKTpcbiAqXG4gKiAgICAgbWF0NC5pZGVudGl0eShkZXN0KTtcbiAqICAgICBtYXQ0LnRyYW5zbGF0ZShkZXN0LCB2ZWMpO1xuICogICAgIHZhciBxdWF0TWF0ID0gbWF0NC5jcmVhdGUoKTtcbiAqICAgICBxdWF0NC50b01hdDQocXVhdCwgcXVhdE1hdCk7XG4gKiAgICAgbWF0NC5tdWx0aXBseShkZXN0LCBxdWF0TWF0KTtcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCBtYXQ0IHJlY2VpdmluZyBvcGVyYXRpb24gcmVzdWx0XG4gKiBAcGFyYW0ge3F1YXQ0fSBxIFJvdGF0aW9uIHF1YXRlcm5pb25cbiAqIEBwYXJhbSB7dmVjM30gdiBUcmFuc2xhdGlvbiB2ZWN0b3JcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xuZnVuY3Rpb24gZnJvbVJvdGF0aW9uVHJhbnNsYXRpb24ob3V0LCBxLCB2KSB7XG4gICAgLy8gUXVhdGVybmlvbiBtYXRoXG4gICAgdmFyIHggPSBxWzBdLCB5ID0gcVsxXSwgeiA9IHFbMl0sIHcgPSBxWzNdLFxuICAgICAgICB4MiA9IHggKyB4LFxuICAgICAgICB5MiA9IHkgKyB5LFxuICAgICAgICB6MiA9IHogKyB6LFxuXG4gICAgICAgIHh4ID0geCAqIHgyLFxuICAgICAgICB4eSA9IHggKiB5MixcbiAgICAgICAgeHogPSB4ICogejIsXG4gICAgICAgIHl5ID0geSAqIHkyLFxuICAgICAgICB5eiA9IHkgKiB6MixcbiAgICAgICAgenogPSB6ICogejIsXG4gICAgICAgIHd4ID0gdyAqIHgyLFxuICAgICAgICB3eSA9IHcgKiB5MixcbiAgICAgICAgd3ogPSB3ICogejI7XG5cbiAgICBvdXRbMF0gPSAxIC0gKHl5ICsgenopO1xuICAgIG91dFsxXSA9IHh5ICsgd3o7XG4gICAgb3V0WzJdID0geHogLSB3eTtcbiAgICBvdXRbM10gPSAwO1xuICAgIG91dFs0XSA9IHh5IC0gd3o7XG4gICAgb3V0WzVdID0gMSAtICh4eCArIHp6KTtcbiAgICBvdXRbNl0gPSB5eiArIHd4O1xuICAgIG91dFs3XSA9IDA7XG4gICAgb3V0WzhdID0geHogKyB3eTtcbiAgICBvdXRbOV0gPSB5eiAtIHd4O1xuICAgIG91dFsxMF0gPSAxIC0gKHh4ICsgeXkpO1xuICAgIG91dFsxMV0gPSAwO1xuICAgIG91dFsxMl0gPSB2WzBdO1xuICAgIG91dFsxM10gPSB2WzFdO1xuICAgIG91dFsxNF0gPSB2WzJdO1xuICAgIG91dFsxNV0gPSAxO1xuICAgIFxuICAgIHJldHVybiBvdXQ7XG59OyIsIm1vZHVsZS5leHBvcnRzID0gZnJ1c3R1bTtcblxuLyoqXG4gKiBHZW5lcmF0ZXMgYSBmcnVzdHVtIG1hdHJpeCB3aXRoIHRoZSBnaXZlbiBib3VuZHNcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCBtYXQ0IGZydXN0dW0gbWF0cml4IHdpbGwgYmUgd3JpdHRlbiBpbnRvXG4gKiBAcGFyYW0ge051bWJlcn0gbGVmdCBMZWZ0IGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge051bWJlcn0gcmlnaHQgUmlnaHQgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7TnVtYmVyfSBib3R0b20gQm90dG9tIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge051bWJlcn0gdG9wIFRvcCBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtOdW1iZXJ9IG5lYXIgTmVhciBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtOdW1iZXJ9IGZhciBGYXIgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xuZnVuY3Rpb24gZnJ1c3R1bShvdXQsIGxlZnQsIHJpZ2h0LCBib3R0b20sIHRvcCwgbmVhciwgZmFyKSB7XG4gICAgdmFyIHJsID0gMSAvIChyaWdodCAtIGxlZnQpLFxuICAgICAgICB0YiA9IDEgLyAodG9wIC0gYm90dG9tKSxcbiAgICAgICAgbmYgPSAxIC8gKG5lYXIgLSBmYXIpO1xuICAgIG91dFswXSA9IChuZWFyICogMikgKiBybDtcbiAgICBvdXRbMV0gPSAwO1xuICAgIG91dFsyXSA9IDA7XG4gICAgb3V0WzNdID0gMDtcbiAgICBvdXRbNF0gPSAwO1xuICAgIG91dFs1XSA9IChuZWFyICogMikgKiB0YjtcbiAgICBvdXRbNl0gPSAwO1xuICAgIG91dFs3XSA9IDA7XG4gICAgb3V0WzhdID0gKHJpZ2h0ICsgbGVmdCkgKiBybDtcbiAgICBvdXRbOV0gPSAodG9wICsgYm90dG9tKSAqIHRiO1xuICAgIG91dFsxMF0gPSAoZmFyICsgbmVhcikgKiBuZjtcbiAgICBvdXRbMTFdID0gLTE7XG4gICAgb3V0WzEyXSA9IDA7XG4gICAgb3V0WzEzXSA9IDA7XG4gICAgb3V0WzE0XSA9IChmYXIgKiBuZWFyICogMikgKiBuZjtcbiAgICBvdXRbMTVdID0gMDtcbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IGlkZW50aXR5O1xuXG4vKipcbiAqIFNldCBhIG1hdDQgdG8gdGhlIGlkZW50aXR5IG1hdHJpeFxuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIGlkZW50aXR5KG91dCkge1xuICAgIG91dFswXSA9IDE7XG4gICAgb3V0WzFdID0gMDtcbiAgICBvdXRbMl0gPSAwO1xuICAgIG91dFszXSA9IDA7XG4gICAgb3V0WzRdID0gMDtcbiAgICBvdXRbNV0gPSAxO1xuICAgIG91dFs2XSA9IDA7XG4gICAgb3V0WzddID0gMDtcbiAgICBvdXRbOF0gPSAwO1xuICAgIG91dFs5XSA9IDA7XG4gICAgb3V0WzEwXSA9IDE7XG4gICAgb3V0WzExXSA9IDA7XG4gICAgb3V0WzEyXSA9IDA7XG4gICAgb3V0WzEzXSA9IDA7XG4gICAgb3V0WzE0XSA9IDA7XG4gICAgb3V0WzE1XSA9IDE7XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSB7XG4gIGNyZWF0ZTogcmVxdWlyZSgnLi9jcmVhdGUnKVxuICAsIGNsb25lOiByZXF1aXJlKCcuL2Nsb25lJylcbiAgLCBjb3B5OiByZXF1aXJlKCcuL2NvcHknKVxuICAsIGlkZW50aXR5OiByZXF1aXJlKCcuL2lkZW50aXR5JylcbiAgLCB0cmFuc3Bvc2U6IHJlcXVpcmUoJy4vdHJhbnNwb3NlJylcbiAgLCBpbnZlcnQ6IHJlcXVpcmUoJy4vaW52ZXJ0JylcbiAgLCBhZGpvaW50OiByZXF1aXJlKCcuL2Fkam9pbnQnKVxuICAsIGRldGVybWluYW50OiByZXF1aXJlKCcuL2RldGVybWluYW50JylcbiAgLCBtdWx0aXBseTogcmVxdWlyZSgnLi9tdWx0aXBseScpXG4gICwgdHJhbnNsYXRlOiByZXF1aXJlKCcuL3RyYW5zbGF0ZScpXG4gICwgc2NhbGU6IHJlcXVpcmUoJy4vc2NhbGUnKVxuICAsIHJvdGF0ZTogcmVxdWlyZSgnLi9yb3RhdGUnKVxuICAsIHJvdGF0ZVg6IHJlcXVpcmUoJy4vcm90YXRlWCcpXG4gICwgcm90YXRlWTogcmVxdWlyZSgnLi9yb3RhdGVZJylcbiAgLCByb3RhdGVaOiByZXF1aXJlKCcuL3JvdGF0ZVonKVxuICAsIGZyb21Sb3RhdGlvblRyYW5zbGF0aW9uOiByZXF1aXJlKCcuL2Zyb21Sb3RhdGlvblRyYW5zbGF0aW9uJylcbiAgLCBmcm9tUXVhdDogcmVxdWlyZSgnLi9mcm9tUXVhdCcpXG4gICwgZnJ1c3R1bTogcmVxdWlyZSgnLi9mcnVzdHVtJylcbiAgLCBwZXJzcGVjdGl2ZTogcmVxdWlyZSgnLi9wZXJzcGVjdGl2ZScpXG4gICwgcGVyc3BlY3RpdmVGcm9tRmllbGRPZlZpZXc6IHJlcXVpcmUoJy4vcGVyc3BlY3RpdmVGcm9tRmllbGRPZlZpZXcnKVxuICAsIG9ydGhvOiByZXF1aXJlKCcuL29ydGhvJylcbiAgLCBsb29rQXQ6IHJlcXVpcmUoJy4vbG9va0F0JylcbiAgLCBzdHI6IHJlcXVpcmUoJy4vc3RyJylcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IGludmVydDtcblxuLyoqXG4gKiBJbnZlcnRzIGEgbWF0NFxuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xuZnVuY3Rpb24gaW52ZXJ0KG91dCwgYSkge1xuICAgIHZhciBhMDAgPSBhWzBdLCBhMDEgPSBhWzFdLCBhMDIgPSBhWzJdLCBhMDMgPSBhWzNdLFxuICAgICAgICBhMTAgPSBhWzRdLCBhMTEgPSBhWzVdLCBhMTIgPSBhWzZdLCBhMTMgPSBhWzddLFxuICAgICAgICBhMjAgPSBhWzhdLCBhMjEgPSBhWzldLCBhMjIgPSBhWzEwXSwgYTIzID0gYVsxMV0sXG4gICAgICAgIGEzMCA9IGFbMTJdLCBhMzEgPSBhWzEzXSwgYTMyID0gYVsxNF0sIGEzMyA9IGFbMTVdLFxuXG4gICAgICAgIGIwMCA9IGEwMCAqIGExMSAtIGEwMSAqIGExMCxcbiAgICAgICAgYjAxID0gYTAwICogYTEyIC0gYTAyICogYTEwLFxuICAgICAgICBiMDIgPSBhMDAgKiBhMTMgLSBhMDMgKiBhMTAsXG4gICAgICAgIGIwMyA9IGEwMSAqIGExMiAtIGEwMiAqIGExMSxcbiAgICAgICAgYjA0ID0gYTAxICogYTEzIC0gYTAzICogYTExLFxuICAgICAgICBiMDUgPSBhMDIgKiBhMTMgLSBhMDMgKiBhMTIsXG4gICAgICAgIGIwNiA9IGEyMCAqIGEzMSAtIGEyMSAqIGEzMCxcbiAgICAgICAgYjA3ID0gYTIwICogYTMyIC0gYTIyICogYTMwLFxuICAgICAgICBiMDggPSBhMjAgKiBhMzMgLSBhMjMgKiBhMzAsXG4gICAgICAgIGIwOSA9IGEyMSAqIGEzMiAtIGEyMiAqIGEzMSxcbiAgICAgICAgYjEwID0gYTIxICogYTMzIC0gYTIzICogYTMxLFxuICAgICAgICBiMTEgPSBhMjIgKiBhMzMgLSBhMjMgKiBhMzIsXG5cbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBkZXRlcm1pbmFudFxuICAgICAgICBkZXQgPSBiMDAgKiBiMTEgLSBiMDEgKiBiMTAgKyBiMDIgKiBiMDkgKyBiMDMgKiBiMDggLSBiMDQgKiBiMDcgKyBiMDUgKiBiMDY7XG5cbiAgICBpZiAoIWRldCkgeyBcbiAgICAgICAgcmV0dXJuIG51bGw7IFxuICAgIH1cbiAgICBkZXQgPSAxLjAgLyBkZXQ7XG5cbiAgICBvdXRbMF0gPSAoYTExICogYjExIC0gYTEyICogYjEwICsgYTEzICogYjA5KSAqIGRldDtcbiAgICBvdXRbMV0gPSAoYTAyICogYjEwIC0gYTAxICogYjExIC0gYTAzICogYjA5KSAqIGRldDtcbiAgICBvdXRbMl0gPSAoYTMxICogYjA1IC0gYTMyICogYjA0ICsgYTMzICogYjAzKSAqIGRldDtcbiAgICBvdXRbM10gPSAoYTIyICogYjA0IC0gYTIxICogYjA1IC0gYTIzICogYjAzKSAqIGRldDtcbiAgICBvdXRbNF0gPSAoYTEyICogYjA4IC0gYTEwICogYjExIC0gYTEzICogYjA3KSAqIGRldDtcbiAgICBvdXRbNV0gPSAoYTAwICogYjExIC0gYTAyICogYjA4ICsgYTAzICogYjA3KSAqIGRldDtcbiAgICBvdXRbNl0gPSAoYTMyICogYjAyIC0gYTMwICogYjA1IC0gYTMzICogYjAxKSAqIGRldDtcbiAgICBvdXRbN10gPSAoYTIwICogYjA1IC0gYTIyICogYjAyICsgYTIzICogYjAxKSAqIGRldDtcbiAgICBvdXRbOF0gPSAoYTEwICogYjEwIC0gYTExICogYjA4ICsgYTEzICogYjA2KSAqIGRldDtcbiAgICBvdXRbOV0gPSAoYTAxICogYjA4IC0gYTAwICogYjEwIC0gYTAzICogYjA2KSAqIGRldDtcbiAgICBvdXRbMTBdID0gKGEzMCAqIGIwNCAtIGEzMSAqIGIwMiArIGEzMyAqIGIwMCkgKiBkZXQ7XG4gICAgb3V0WzExXSA9IChhMjEgKiBiMDIgLSBhMjAgKiBiMDQgLSBhMjMgKiBiMDApICogZGV0O1xuICAgIG91dFsxMl0gPSAoYTExICogYjA3IC0gYTEwICogYjA5IC0gYTEyICogYjA2KSAqIGRldDtcbiAgICBvdXRbMTNdID0gKGEwMCAqIGIwOSAtIGEwMSAqIGIwNyArIGEwMiAqIGIwNikgKiBkZXQ7XG4gICAgb3V0WzE0XSA9IChhMzEgKiBiMDEgLSBhMzAgKiBiMDMgLSBhMzIgKiBiMDApICogZGV0O1xuICAgIG91dFsxNV0gPSAoYTIwICogYjAzIC0gYTIxICogYjAxICsgYTIyICogYjAwKSAqIGRldDtcblxuICAgIHJldHVybiBvdXQ7XG59OyIsInZhciBpZGVudGl0eSA9IHJlcXVpcmUoJy4vaWRlbnRpdHknKTtcblxubW9kdWxlLmV4cG9ydHMgPSBsb29rQXQ7XG5cbi8qKlxuICogR2VuZXJhdGVzIGEgbG9vay1hdCBtYXRyaXggd2l0aCB0aGUgZ2l2ZW4gZXllIHBvc2l0aW9uLCBmb2NhbCBwb2ludCwgYW5kIHVwIGF4aXNcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCBtYXQ0IGZydXN0dW0gbWF0cml4IHdpbGwgYmUgd3JpdHRlbiBpbnRvXG4gKiBAcGFyYW0ge3ZlYzN9IGV5ZSBQb3NpdGlvbiBvZiB0aGUgdmlld2VyXG4gKiBAcGFyYW0ge3ZlYzN9IGNlbnRlciBQb2ludCB0aGUgdmlld2VyIGlzIGxvb2tpbmcgYXRcbiAqIEBwYXJhbSB7dmVjM30gdXAgdmVjMyBwb2ludGluZyB1cFxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiBsb29rQXQob3V0LCBleWUsIGNlbnRlciwgdXApIHtcbiAgICB2YXIgeDAsIHgxLCB4MiwgeTAsIHkxLCB5MiwgejAsIHoxLCB6MiwgbGVuLFxuICAgICAgICBleWV4ID0gZXllWzBdLFxuICAgICAgICBleWV5ID0gZXllWzFdLFxuICAgICAgICBleWV6ID0gZXllWzJdLFxuICAgICAgICB1cHggPSB1cFswXSxcbiAgICAgICAgdXB5ID0gdXBbMV0sXG4gICAgICAgIHVweiA9IHVwWzJdLFxuICAgICAgICBjZW50ZXJ4ID0gY2VudGVyWzBdLFxuICAgICAgICBjZW50ZXJ5ID0gY2VudGVyWzFdLFxuICAgICAgICBjZW50ZXJ6ID0gY2VudGVyWzJdO1xuXG4gICAgaWYgKE1hdGguYWJzKGV5ZXggLSBjZW50ZXJ4KSA8IDAuMDAwMDAxICYmXG4gICAgICAgIE1hdGguYWJzKGV5ZXkgLSBjZW50ZXJ5KSA8IDAuMDAwMDAxICYmXG4gICAgICAgIE1hdGguYWJzKGV5ZXogLSBjZW50ZXJ6KSA8IDAuMDAwMDAxKSB7XG4gICAgICAgIHJldHVybiBpZGVudGl0eShvdXQpO1xuICAgIH1cblxuICAgIHowID0gZXlleCAtIGNlbnRlcng7XG4gICAgejEgPSBleWV5IC0gY2VudGVyeTtcbiAgICB6MiA9IGV5ZXogLSBjZW50ZXJ6O1xuXG4gICAgbGVuID0gMSAvIE1hdGguc3FydCh6MCAqIHowICsgejEgKiB6MSArIHoyICogejIpO1xuICAgIHowICo9IGxlbjtcbiAgICB6MSAqPSBsZW47XG4gICAgejIgKj0gbGVuO1xuXG4gICAgeDAgPSB1cHkgKiB6MiAtIHVweiAqIHoxO1xuICAgIHgxID0gdXB6ICogejAgLSB1cHggKiB6MjtcbiAgICB4MiA9IHVweCAqIHoxIC0gdXB5ICogejA7XG4gICAgbGVuID0gTWF0aC5zcXJ0KHgwICogeDAgKyB4MSAqIHgxICsgeDIgKiB4Mik7XG4gICAgaWYgKCFsZW4pIHtcbiAgICAgICAgeDAgPSAwO1xuICAgICAgICB4MSA9IDA7XG4gICAgICAgIHgyID0gMDtcbiAgICB9IGVsc2Uge1xuICAgICAgICBsZW4gPSAxIC8gbGVuO1xuICAgICAgICB4MCAqPSBsZW47XG4gICAgICAgIHgxICo9IGxlbjtcbiAgICAgICAgeDIgKj0gbGVuO1xuICAgIH1cblxuICAgIHkwID0gejEgKiB4MiAtIHoyICogeDE7XG4gICAgeTEgPSB6MiAqIHgwIC0gejAgKiB4MjtcbiAgICB5MiA9IHowICogeDEgLSB6MSAqIHgwO1xuXG4gICAgbGVuID0gTWF0aC5zcXJ0KHkwICogeTAgKyB5MSAqIHkxICsgeTIgKiB5Mik7XG4gICAgaWYgKCFsZW4pIHtcbiAgICAgICAgeTAgPSAwO1xuICAgICAgICB5MSA9IDA7XG4gICAgICAgIHkyID0gMDtcbiAgICB9IGVsc2Uge1xuICAgICAgICBsZW4gPSAxIC8gbGVuO1xuICAgICAgICB5MCAqPSBsZW47XG4gICAgICAgIHkxICo9IGxlbjtcbiAgICAgICAgeTIgKj0gbGVuO1xuICAgIH1cblxuICAgIG91dFswXSA9IHgwO1xuICAgIG91dFsxXSA9IHkwO1xuICAgIG91dFsyXSA9IHowO1xuICAgIG91dFszXSA9IDA7XG4gICAgb3V0WzRdID0geDE7XG4gICAgb3V0WzVdID0geTE7XG4gICAgb3V0WzZdID0gejE7XG4gICAgb3V0WzddID0gMDtcbiAgICBvdXRbOF0gPSB4MjtcbiAgICBvdXRbOV0gPSB5MjtcbiAgICBvdXRbMTBdID0gejI7XG4gICAgb3V0WzExXSA9IDA7XG4gICAgb3V0WzEyXSA9IC0oeDAgKiBleWV4ICsgeDEgKiBleWV5ICsgeDIgKiBleWV6KTtcbiAgICBvdXRbMTNdID0gLSh5MCAqIGV5ZXggKyB5MSAqIGV5ZXkgKyB5MiAqIGV5ZXopO1xuICAgIG91dFsxNF0gPSAtKHowICogZXlleCArIHoxICogZXlleSArIHoyICogZXlleik7XG4gICAgb3V0WzE1XSA9IDE7XG5cbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IG11bHRpcGx5O1xuXG4vKipcbiAqIE11bHRpcGxpZXMgdHdvIG1hdDQnc1xuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7bWF0NH0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xuZnVuY3Rpb24gbXVsdGlwbHkob3V0LCBhLCBiKSB7XG4gICAgdmFyIGEwMCA9IGFbMF0sIGEwMSA9IGFbMV0sIGEwMiA9IGFbMl0sIGEwMyA9IGFbM10sXG4gICAgICAgIGExMCA9IGFbNF0sIGExMSA9IGFbNV0sIGExMiA9IGFbNl0sIGExMyA9IGFbN10sXG4gICAgICAgIGEyMCA9IGFbOF0sIGEyMSA9IGFbOV0sIGEyMiA9IGFbMTBdLCBhMjMgPSBhWzExXSxcbiAgICAgICAgYTMwID0gYVsxMl0sIGEzMSA9IGFbMTNdLCBhMzIgPSBhWzE0XSwgYTMzID0gYVsxNV07XG5cbiAgICAvLyBDYWNoZSBvbmx5IHRoZSBjdXJyZW50IGxpbmUgb2YgdGhlIHNlY29uZCBtYXRyaXhcbiAgICB2YXIgYjAgID0gYlswXSwgYjEgPSBiWzFdLCBiMiA9IGJbMl0sIGIzID0gYlszXTsgIFxuICAgIG91dFswXSA9IGIwKmEwMCArIGIxKmExMCArIGIyKmEyMCArIGIzKmEzMDtcbiAgICBvdXRbMV0gPSBiMCphMDEgKyBiMSphMTEgKyBiMiphMjEgKyBiMyphMzE7XG4gICAgb3V0WzJdID0gYjAqYTAyICsgYjEqYTEyICsgYjIqYTIyICsgYjMqYTMyO1xuICAgIG91dFszXSA9IGIwKmEwMyArIGIxKmExMyArIGIyKmEyMyArIGIzKmEzMztcblxuICAgIGIwID0gYls0XTsgYjEgPSBiWzVdOyBiMiA9IGJbNl07IGIzID0gYls3XTtcbiAgICBvdXRbNF0gPSBiMCphMDAgKyBiMSphMTAgKyBiMiphMjAgKyBiMyphMzA7XG4gICAgb3V0WzVdID0gYjAqYTAxICsgYjEqYTExICsgYjIqYTIxICsgYjMqYTMxO1xuICAgIG91dFs2XSA9IGIwKmEwMiArIGIxKmExMiArIGIyKmEyMiArIGIzKmEzMjtcbiAgICBvdXRbN10gPSBiMCphMDMgKyBiMSphMTMgKyBiMiphMjMgKyBiMyphMzM7XG5cbiAgICBiMCA9IGJbOF07IGIxID0gYls5XTsgYjIgPSBiWzEwXTsgYjMgPSBiWzExXTtcbiAgICBvdXRbOF0gPSBiMCphMDAgKyBiMSphMTAgKyBiMiphMjAgKyBiMyphMzA7XG4gICAgb3V0WzldID0gYjAqYTAxICsgYjEqYTExICsgYjIqYTIxICsgYjMqYTMxO1xuICAgIG91dFsxMF0gPSBiMCphMDIgKyBiMSphMTIgKyBiMiphMjIgKyBiMyphMzI7XG4gICAgb3V0WzExXSA9IGIwKmEwMyArIGIxKmExMyArIGIyKmEyMyArIGIzKmEzMztcblxuICAgIGIwID0gYlsxMl07IGIxID0gYlsxM107IGIyID0gYlsxNF07IGIzID0gYlsxNV07XG4gICAgb3V0WzEyXSA9IGIwKmEwMCArIGIxKmExMCArIGIyKmEyMCArIGIzKmEzMDtcbiAgICBvdXRbMTNdID0gYjAqYTAxICsgYjEqYTExICsgYjIqYTIxICsgYjMqYTMxO1xuICAgIG91dFsxNF0gPSBiMCphMDIgKyBiMSphMTIgKyBiMiphMjIgKyBiMyphMzI7XG4gICAgb3V0WzE1XSA9IGIwKmEwMyArIGIxKmExMyArIGIyKmEyMyArIGIzKmEzMztcbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IG9ydGhvO1xuXG4vKipcbiAqIEdlbmVyYXRlcyBhIG9ydGhvZ29uYWwgcHJvamVjdGlvbiBtYXRyaXggd2l0aCB0aGUgZ2l2ZW4gYm91bmRzXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgbWF0NCBmcnVzdHVtIG1hdHJpeCB3aWxsIGJlIHdyaXR0ZW4gaW50b1xuICogQHBhcmFtIHtudW1iZXJ9IGxlZnQgTGVmdCBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtudW1iZXJ9IHJpZ2h0IFJpZ2h0IGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge251bWJlcn0gYm90dG9tIEJvdHRvbSBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtudW1iZXJ9IHRvcCBUb3AgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7bnVtYmVyfSBuZWFyIE5lYXIgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7bnVtYmVyfSBmYXIgRmFyIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIG9ydGhvKG91dCwgbGVmdCwgcmlnaHQsIGJvdHRvbSwgdG9wLCBuZWFyLCBmYXIpIHtcbiAgICB2YXIgbHIgPSAxIC8gKGxlZnQgLSByaWdodCksXG4gICAgICAgIGJ0ID0gMSAvIChib3R0b20gLSB0b3ApLFxuICAgICAgICBuZiA9IDEgLyAobmVhciAtIGZhcik7XG4gICAgb3V0WzBdID0gLTIgKiBscjtcbiAgICBvdXRbMV0gPSAwO1xuICAgIG91dFsyXSA9IDA7XG4gICAgb3V0WzNdID0gMDtcbiAgICBvdXRbNF0gPSAwO1xuICAgIG91dFs1XSA9IC0yICogYnQ7XG4gICAgb3V0WzZdID0gMDtcbiAgICBvdXRbN10gPSAwO1xuICAgIG91dFs4XSA9IDA7XG4gICAgb3V0WzldID0gMDtcbiAgICBvdXRbMTBdID0gMiAqIG5mO1xuICAgIG91dFsxMV0gPSAwO1xuICAgIG91dFsxMl0gPSAobGVmdCArIHJpZ2h0KSAqIGxyO1xuICAgIG91dFsxM10gPSAodG9wICsgYm90dG9tKSAqIGJ0O1xuICAgIG91dFsxNF0gPSAoZmFyICsgbmVhcikgKiBuZjtcbiAgICBvdXRbMTVdID0gMTtcbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IHBlcnNwZWN0aXZlO1xuXG4vKipcbiAqIEdlbmVyYXRlcyBhIHBlcnNwZWN0aXZlIHByb2plY3Rpb24gbWF0cml4IHdpdGggdGhlIGdpdmVuIGJvdW5kc1xuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IG1hdDQgZnJ1c3R1bSBtYXRyaXggd2lsbCBiZSB3cml0dGVuIGludG9cbiAqIEBwYXJhbSB7bnVtYmVyfSBmb3Z5IFZlcnRpY2FsIGZpZWxkIG9mIHZpZXcgaW4gcmFkaWFuc1xuICogQHBhcmFtIHtudW1iZXJ9IGFzcGVjdCBBc3BlY3QgcmF0aW8uIHR5cGljYWxseSB2aWV3cG9ydCB3aWR0aC9oZWlnaHRcbiAqIEBwYXJhbSB7bnVtYmVyfSBuZWFyIE5lYXIgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7bnVtYmVyfSBmYXIgRmFyIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIHBlcnNwZWN0aXZlKG91dCwgZm92eSwgYXNwZWN0LCBuZWFyLCBmYXIpIHtcbiAgICB2YXIgZiA9IDEuMCAvIE1hdGgudGFuKGZvdnkgLyAyKSxcbiAgICAgICAgbmYgPSAxIC8gKG5lYXIgLSBmYXIpO1xuICAgIG91dFswXSA9IGYgLyBhc3BlY3Q7XG4gICAgb3V0WzFdID0gMDtcbiAgICBvdXRbMl0gPSAwO1xuICAgIG91dFszXSA9IDA7XG4gICAgb3V0WzRdID0gMDtcbiAgICBvdXRbNV0gPSBmO1xuICAgIG91dFs2XSA9IDA7XG4gICAgb3V0WzddID0gMDtcbiAgICBvdXRbOF0gPSAwO1xuICAgIG91dFs5XSA9IDA7XG4gICAgb3V0WzEwXSA9IChmYXIgKyBuZWFyKSAqIG5mO1xuICAgIG91dFsxMV0gPSAtMTtcbiAgICBvdXRbMTJdID0gMDtcbiAgICBvdXRbMTNdID0gMDtcbiAgICBvdXRbMTRdID0gKDIgKiBmYXIgKiBuZWFyKSAqIG5mO1xuICAgIG91dFsxNV0gPSAwO1xuICAgIHJldHVybiBvdXQ7XG59OyIsIm1vZHVsZS5leHBvcnRzID0gcGVyc3BlY3RpdmVGcm9tRmllbGRPZlZpZXc7XG5cbi8qKlxuICogR2VuZXJhdGVzIGEgcGVyc3BlY3RpdmUgcHJvamVjdGlvbiBtYXRyaXggd2l0aCB0aGUgZ2l2ZW4gZmllbGQgb2Ygdmlldy5cbiAqIFRoaXMgaXMgcHJpbWFyaWx5IHVzZWZ1bCBmb3IgZ2VuZXJhdGluZyBwcm9qZWN0aW9uIG1hdHJpY2VzIHRvIGJlIHVzZWRcbiAqIHdpdGggdGhlIHN0aWxsIGV4cGVyaWVtZW50YWwgV2ViVlIgQVBJLlxuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IG1hdDQgZnJ1c3R1bSBtYXRyaXggd2lsbCBiZSB3cml0dGVuIGludG9cbiAqIEBwYXJhbSB7bnVtYmVyfSBmb3YgT2JqZWN0IGNvbnRhaW5pbmcgdGhlIGZvbGxvd2luZyB2YWx1ZXM6IHVwRGVncmVlcywgZG93bkRlZ3JlZXMsIGxlZnREZWdyZWVzLCByaWdodERlZ3JlZXNcbiAqIEBwYXJhbSB7bnVtYmVyfSBuZWFyIE5lYXIgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7bnVtYmVyfSBmYXIgRmFyIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIHBlcnNwZWN0aXZlRnJvbUZpZWxkT2ZWaWV3KG91dCwgZm92LCBuZWFyLCBmYXIpIHtcbiAgICB2YXIgdXBUYW4gPSBNYXRoLnRhbihmb3YudXBEZWdyZWVzICogTWF0aC5QSS8xODAuMCksXG4gICAgICAgIGRvd25UYW4gPSBNYXRoLnRhbihmb3YuZG93bkRlZ3JlZXMgKiBNYXRoLlBJLzE4MC4wKSxcbiAgICAgICAgbGVmdFRhbiA9IE1hdGgudGFuKGZvdi5sZWZ0RGVncmVlcyAqIE1hdGguUEkvMTgwLjApLFxuICAgICAgICByaWdodFRhbiA9IE1hdGgudGFuKGZvdi5yaWdodERlZ3JlZXMgKiBNYXRoLlBJLzE4MC4wKSxcbiAgICAgICAgeFNjYWxlID0gMi4wIC8gKGxlZnRUYW4gKyByaWdodFRhbiksXG4gICAgICAgIHlTY2FsZSA9IDIuMCAvICh1cFRhbiArIGRvd25UYW4pO1xuXG4gICAgb3V0WzBdID0geFNjYWxlO1xuICAgIG91dFsxXSA9IDAuMDtcbiAgICBvdXRbMl0gPSAwLjA7XG4gICAgb3V0WzNdID0gMC4wO1xuICAgIG91dFs0XSA9IDAuMDtcbiAgICBvdXRbNV0gPSB5U2NhbGU7XG4gICAgb3V0WzZdID0gMC4wO1xuICAgIG91dFs3XSA9IDAuMDtcbiAgICBvdXRbOF0gPSAtKChsZWZ0VGFuIC0gcmlnaHRUYW4pICogeFNjYWxlICogMC41KTtcbiAgICBvdXRbOV0gPSAoKHVwVGFuIC0gZG93blRhbikgKiB5U2NhbGUgKiAwLjUpO1xuICAgIG91dFsxMF0gPSBmYXIgLyAobmVhciAtIGZhcik7XG4gICAgb3V0WzExXSA9IC0xLjA7XG4gICAgb3V0WzEyXSA9IDAuMDtcbiAgICBvdXRbMTNdID0gMC4wO1xuICAgIG91dFsxNF0gPSAoZmFyICogbmVhcikgLyAobmVhciAtIGZhcik7XG4gICAgb3V0WzE1XSA9IDAuMDtcbiAgICByZXR1cm4gb3V0O1xufVxuXG4iLCJtb2R1bGUuZXhwb3J0cyA9IHJvdGF0ZTtcblxuLyoqXG4gKiBSb3RhdGVzIGEgbWF0NCBieSB0aGUgZ2l2ZW4gYW5nbGVcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBtYXRyaXggdG8gcm90YXRlXG4gKiBAcGFyYW0ge051bWJlcn0gcmFkIHRoZSBhbmdsZSB0byByb3RhdGUgdGhlIG1hdHJpeCBieVxuICogQHBhcmFtIHt2ZWMzfSBheGlzIHRoZSBheGlzIHRvIHJvdGF0ZSBhcm91bmRcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xuZnVuY3Rpb24gcm90YXRlKG91dCwgYSwgcmFkLCBheGlzKSB7XG4gICAgdmFyIHggPSBheGlzWzBdLCB5ID0gYXhpc1sxXSwgeiA9IGF4aXNbMl0sXG4gICAgICAgIGxlbiA9IE1hdGguc3FydCh4ICogeCArIHkgKiB5ICsgeiAqIHopLFxuICAgICAgICBzLCBjLCB0LFxuICAgICAgICBhMDAsIGEwMSwgYTAyLCBhMDMsXG4gICAgICAgIGExMCwgYTExLCBhMTIsIGExMyxcbiAgICAgICAgYTIwLCBhMjEsIGEyMiwgYTIzLFxuICAgICAgICBiMDAsIGIwMSwgYjAyLFxuICAgICAgICBiMTAsIGIxMSwgYjEyLFxuICAgICAgICBiMjAsIGIyMSwgYjIyO1xuXG4gICAgaWYgKE1hdGguYWJzKGxlbikgPCAwLjAwMDAwMSkgeyByZXR1cm4gbnVsbDsgfVxuICAgIFxuICAgIGxlbiA9IDEgLyBsZW47XG4gICAgeCAqPSBsZW47XG4gICAgeSAqPSBsZW47XG4gICAgeiAqPSBsZW47XG5cbiAgICBzID0gTWF0aC5zaW4ocmFkKTtcbiAgICBjID0gTWF0aC5jb3MocmFkKTtcbiAgICB0ID0gMSAtIGM7XG5cbiAgICBhMDAgPSBhWzBdOyBhMDEgPSBhWzFdOyBhMDIgPSBhWzJdOyBhMDMgPSBhWzNdO1xuICAgIGExMCA9IGFbNF07IGExMSA9IGFbNV07IGExMiA9IGFbNl07IGExMyA9IGFbN107XG4gICAgYTIwID0gYVs4XTsgYTIxID0gYVs5XTsgYTIyID0gYVsxMF07IGEyMyA9IGFbMTFdO1xuXG4gICAgLy8gQ29uc3RydWN0IHRoZSBlbGVtZW50cyBvZiB0aGUgcm90YXRpb24gbWF0cml4XG4gICAgYjAwID0geCAqIHggKiB0ICsgYzsgYjAxID0geSAqIHggKiB0ICsgeiAqIHM7IGIwMiA9IHogKiB4ICogdCAtIHkgKiBzO1xuICAgIGIxMCA9IHggKiB5ICogdCAtIHogKiBzOyBiMTEgPSB5ICogeSAqIHQgKyBjOyBiMTIgPSB6ICogeSAqIHQgKyB4ICogcztcbiAgICBiMjAgPSB4ICogeiAqIHQgKyB5ICogczsgYjIxID0geSAqIHogKiB0IC0geCAqIHM7IGIyMiA9IHogKiB6ICogdCArIGM7XG5cbiAgICAvLyBQZXJmb3JtIHJvdGF0aW9uLXNwZWNpZmljIG1hdHJpeCBtdWx0aXBsaWNhdGlvblxuICAgIG91dFswXSA9IGEwMCAqIGIwMCArIGExMCAqIGIwMSArIGEyMCAqIGIwMjtcbiAgICBvdXRbMV0gPSBhMDEgKiBiMDAgKyBhMTEgKiBiMDEgKyBhMjEgKiBiMDI7XG4gICAgb3V0WzJdID0gYTAyICogYjAwICsgYTEyICogYjAxICsgYTIyICogYjAyO1xuICAgIG91dFszXSA9IGEwMyAqIGIwMCArIGExMyAqIGIwMSArIGEyMyAqIGIwMjtcbiAgICBvdXRbNF0gPSBhMDAgKiBiMTAgKyBhMTAgKiBiMTEgKyBhMjAgKiBiMTI7XG4gICAgb3V0WzVdID0gYTAxICogYjEwICsgYTExICogYjExICsgYTIxICogYjEyO1xuICAgIG91dFs2XSA9IGEwMiAqIGIxMCArIGExMiAqIGIxMSArIGEyMiAqIGIxMjtcbiAgICBvdXRbN10gPSBhMDMgKiBiMTAgKyBhMTMgKiBiMTEgKyBhMjMgKiBiMTI7XG4gICAgb3V0WzhdID0gYTAwICogYjIwICsgYTEwICogYjIxICsgYTIwICogYjIyO1xuICAgIG91dFs5XSA9IGEwMSAqIGIyMCArIGExMSAqIGIyMSArIGEyMSAqIGIyMjtcbiAgICBvdXRbMTBdID0gYTAyICogYjIwICsgYTEyICogYjIxICsgYTIyICogYjIyO1xuICAgIG91dFsxMV0gPSBhMDMgKiBiMjAgKyBhMTMgKiBiMjEgKyBhMjMgKiBiMjI7XG5cbiAgICBpZiAoYSAhPT0gb3V0KSB7IC8vIElmIHRoZSBzb3VyY2UgYW5kIGRlc3RpbmF0aW9uIGRpZmZlciwgY29weSB0aGUgdW5jaGFuZ2VkIGxhc3Qgcm93XG4gICAgICAgIG91dFsxMl0gPSBhWzEyXTtcbiAgICAgICAgb3V0WzEzXSA9IGFbMTNdO1xuICAgICAgICBvdXRbMTRdID0gYVsxNF07XG4gICAgICAgIG91dFsxNV0gPSBhWzE1XTtcbiAgICB9XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSByb3RhdGVYO1xuXG4vKipcbiAqIFJvdGF0ZXMgYSBtYXRyaXggYnkgdGhlIGdpdmVuIGFuZ2xlIGFyb3VuZCB0aGUgWCBheGlzXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgbWF0cml4IHRvIHJvdGF0ZVxuICogQHBhcmFtIHtOdW1iZXJ9IHJhZCB0aGUgYW5nbGUgdG8gcm90YXRlIHRoZSBtYXRyaXggYnlcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xuZnVuY3Rpb24gcm90YXRlWChvdXQsIGEsIHJhZCkge1xuICAgIHZhciBzID0gTWF0aC5zaW4ocmFkKSxcbiAgICAgICAgYyA9IE1hdGguY29zKHJhZCksXG4gICAgICAgIGExMCA9IGFbNF0sXG4gICAgICAgIGExMSA9IGFbNV0sXG4gICAgICAgIGExMiA9IGFbNl0sXG4gICAgICAgIGExMyA9IGFbN10sXG4gICAgICAgIGEyMCA9IGFbOF0sXG4gICAgICAgIGEyMSA9IGFbOV0sXG4gICAgICAgIGEyMiA9IGFbMTBdLFxuICAgICAgICBhMjMgPSBhWzExXTtcblxuICAgIGlmIChhICE9PSBvdXQpIHsgLy8gSWYgdGhlIHNvdXJjZSBhbmQgZGVzdGluYXRpb24gZGlmZmVyLCBjb3B5IHRoZSB1bmNoYW5nZWQgcm93c1xuICAgICAgICBvdXRbMF0gID0gYVswXTtcbiAgICAgICAgb3V0WzFdICA9IGFbMV07XG4gICAgICAgIG91dFsyXSAgPSBhWzJdO1xuICAgICAgICBvdXRbM10gID0gYVszXTtcbiAgICAgICAgb3V0WzEyXSA9IGFbMTJdO1xuICAgICAgICBvdXRbMTNdID0gYVsxM107XG4gICAgICAgIG91dFsxNF0gPSBhWzE0XTtcbiAgICAgICAgb3V0WzE1XSA9IGFbMTVdO1xuICAgIH1cblxuICAgIC8vIFBlcmZvcm0gYXhpcy1zcGVjaWZpYyBtYXRyaXggbXVsdGlwbGljYXRpb25cbiAgICBvdXRbNF0gPSBhMTAgKiBjICsgYTIwICogcztcbiAgICBvdXRbNV0gPSBhMTEgKiBjICsgYTIxICogcztcbiAgICBvdXRbNl0gPSBhMTIgKiBjICsgYTIyICogcztcbiAgICBvdXRbN10gPSBhMTMgKiBjICsgYTIzICogcztcbiAgICBvdXRbOF0gPSBhMjAgKiBjIC0gYTEwICogcztcbiAgICBvdXRbOV0gPSBhMjEgKiBjIC0gYTExICogcztcbiAgICBvdXRbMTBdID0gYTIyICogYyAtIGExMiAqIHM7XG4gICAgb3V0WzExXSA9IGEyMyAqIGMgLSBhMTMgKiBzO1xuICAgIHJldHVybiBvdXQ7XG59OyIsIm1vZHVsZS5leHBvcnRzID0gcm90YXRlWTtcblxuLyoqXG4gKiBSb3RhdGVzIGEgbWF0cml4IGJ5IHRoZSBnaXZlbiBhbmdsZSBhcm91bmQgdGhlIFkgYXhpc1xuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIG1hdHJpeCB0byByb3RhdGVcbiAqIEBwYXJhbSB7TnVtYmVyfSByYWQgdGhlIGFuZ2xlIHRvIHJvdGF0ZSB0aGUgbWF0cml4IGJ5XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIHJvdGF0ZVkob3V0LCBhLCByYWQpIHtcbiAgICB2YXIgcyA9IE1hdGguc2luKHJhZCksXG4gICAgICAgIGMgPSBNYXRoLmNvcyhyYWQpLFxuICAgICAgICBhMDAgPSBhWzBdLFxuICAgICAgICBhMDEgPSBhWzFdLFxuICAgICAgICBhMDIgPSBhWzJdLFxuICAgICAgICBhMDMgPSBhWzNdLFxuICAgICAgICBhMjAgPSBhWzhdLFxuICAgICAgICBhMjEgPSBhWzldLFxuICAgICAgICBhMjIgPSBhWzEwXSxcbiAgICAgICAgYTIzID0gYVsxMV07XG5cbiAgICBpZiAoYSAhPT0gb3V0KSB7IC8vIElmIHRoZSBzb3VyY2UgYW5kIGRlc3RpbmF0aW9uIGRpZmZlciwgY29weSB0aGUgdW5jaGFuZ2VkIHJvd3NcbiAgICAgICAgb3V0WzRdICA9IGFbNF07XG4gICAgICAgIG91dFs1XSAgPSBhWzVdO1xuICAgICAgICBvdXRbNl0gID0gYVs2XTtcbiAgICAgICAgb3V0WzddICA9IGFbN107XG4gICAgICAgIG91dFsxMl0gPSBhWzEyXTtcbiAgICAgICAgb3V0WzEzXSA9IGFbMTNdO1xuICAgICAgICBvdXRbMTRdID0gYVsxNF07XG4gICAgICAgIG91dFsxNV0gPSBhWzE1XTtcbiAgICB9XG5cbiAgICAvLyBQZXJmb3JtIGF4aXMtc3BlY2lmaWMgbWF0cml4IG11bHRpcGxpY2F0aW9uXG4gICAgb3V0WzBdID0gYTAwICogYyAtIGEyMCAqIHM7XG4gICAgb3V0WzFdID0gYTAxICogYyAtIGEyMSAqIHM7XG4gICAgb3V0WzJdID0gYTAyICogYyAtIGEyMiAqIHM7XG4gICAgb3V0WzNdID0gYTAzICogYyAtIGEyMyAqIHM7XG4gICAgb3V0WzhdID0gYTAwICogcyArIGEyMCAqIGM7XG4gICAgb3V0WzldID0gYTAxICogcyArIGEyMSAqIGM7XG4gICAgb3V0WzEwXSA9IGEwMiAqIHMgKyBhMjIgKiBjO1xuICAgIG91dFsxMV0gPSBhMDMgKiBzICsgYTIzICogYztcbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IHJvdGF0ZVo7XG5cbi8qKlxuICogUm90YXRlcyBhIG1hdHJpeCBieSB0aGUgZ2l2ZW4gYW5nbGUgYXJvdW5kIHRoZSBaIGF4aXNcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBtYXRyaXggdG8gcm90YXRlXG4gKiBAcGFyYW0ge051bWJlcn0gcmFkIHRoZSBhbmdsZSB0byByb3RhdGUgdGhlIG1hdHJpeCBieVxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiByb3RhdGVaKG91dCwgYSwgcmFkKSB7XG4gICAgdmFyIHMgPSBNYXRoLnNpbihyYWQpLFxuICAgICAgICBjID0gTWF0aC5jb3MocmFkKSxcbiAgICAgICAgYTAwID0gYVswXSxcbiAgICAgICAgYTAxID0gYVsxXSxcbiAgICAgICAgYTAyID0gYVsyXSxcbiAgICAgICAgYTAzID0gYVszXSxcbiAgICAgICAgYTEwID0gYVs0XSxcbiAgICAgICAgYTExID0gYVs1XSxcbiAgICAgICAgYTEyID0gYVs2XSxcbiAgICAgICAgYTEzID0gYVs3XTtcblxuICAgIGlmIChhICE9PSBvdXQpIHsgLy8gSWYgdGhlIHNvdXJjZSBhbmQgZGVzdGluYXRpb24gZGlmZmVyLCBjb3B5IHRoZSB1bmNoYW5nZWQgbGFzdCByb3dcbiAgICAgICAgb3V0WzhdICA9IGFbOF07XG4gICAgICAgIG91dFs5XSAgPSBhWzldO1xuICAgICAgICBvdXRbMTBdID0gYVsxMF07XG4gICAgICAgIG91dFsxMV0gPSBhWzExXTtcbiAgICAgICAgb3V0WzEyXSA9IGFbMTJdO1xuICAgICAgICBvdXRbMTNdID0gYVsxM107XG4gICAgICAgIG91dFsxNF0gPSBhWzE0XTtcbiAgICAgICAgb3V0WzE1XSA9IGFbMTVdO1xuICAgIH1cblxuICAgIC8vIFBlcmZvcm0gYXhpcy1zcGVjaWZpYyBtYXRyaXggbXVsdGlwbGljYXRpb25cbiAgICBvdXRbMF0gPSBhMDAgKiBjICsgYTEwICogcztcbiAgICBvdXRbMV0gPSBhMDEgKiBjICsgYTExICogcztcbiAgICBvdXRbMl0gPSBhMDIgKiBjICsgYTEyICogcztcbiAgICBvdXRbM10gPSBhMDMgKiBjICsgYTEzICogcztcbiAgICBvdXRbNF0gPSBhMTAgKiBjIC0gYTAwICogcztcbiAgICBvdXRbNV0gPSBhMTEgKiBjIC0gYTAxICogcztcbiAgICBvdXRbNl0gPSBhMTIgKiBjIC0gYTAyICogcztcbiAgICBvdXRbN10gPSBhMTMgKiBjIC0gYTAzICogcztcbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IHNjYWxlO1xuXG4vKipcbiAqIFNjYWxlcyB0aGUgbWF0NCBieSB0aGUgZGltZW5zaW9ucyBpbiB0aGUgZ2l2ZW4gdmVjM1xuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIG1hdHJpeCB0byBzY2FsZVxuICogQHBhcmFtIHt2ZWMzfSB2IHRoZSB2ZWMzIHRvIHNjYWxlIHRoZSBtYXRyaXggYnlcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqKi9cbmZ1bmN0aW9uIHNjYWxlKG91dCwgYSwgdikge1xuICAgIHZhciB4ID0gdlswXSwgeSA9IHZbMV0sIHogPSB2WzJdO1xuXG4gICAgb3V0WzBdID0gYVswXSAqIHg7XG4gICAgb3V0WzFdID0gYVsxXSAqIHg7XG4gICAgb3V0WzJdID0gYVsyXSAqIHg7XG4gICAgb3V0WzNdID0gYVszXSAqIHg7XG4gICAgb3V0WzRdID0gYVs0XSAqIHk7XG4gICAgb3V0WzVdID0gYVs1XSAqIHk7XG4gICAgb3V0WzZdID0gYVs2XSAqIHk7XG4gICAgb3V0WzddID0gYVs3XSAqIHk7XG4gICAgb3V0WzhdID0gYVs4XSAqIHo7XG4gICAgb3V0WzldID0gYVs5XSAqIHo7XG4gICAgb3V0WzEwXSA9IGFbMTBdICogejtcbiAgICBvdXRbMTFdID0gYVsxMV0gKiB6O1xuICAgIG91dFsxMl0gPSBhWzEyXTtcbiAgICBvdXRbMTNdID0gYVsxM107XG4gICAgb3V0WzE0XSA9IGFbMTRdO1xuICAgIG91dFsxNV0gPSBhWzE1XTtcbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IHN0cjtcblxuLyoqXG4gKiBSZXR1cm5zIGEgc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIGEgbWF0NFxuICpcbiAqIEBwYXJhbSB7bWF0NH0gbWF0IG1hdHJpeCB0byByZXByZXNlbnQgYXMgYSBzdHJpbmdcbiAqIEByZXR1cm5zIHtTdHJpbmd9IHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiB0aGUgbWF0cml4XG4gKi9cbmZ1bmN0aW9uIHN0cihhKSB7XG4gICAgcmV0dXJuICdtYXQ0KCcgKyBhWzBdICsgJywgJyArIGFbMV0gKyAnLCAnICsgYVsyXSArICcsICcgKyBhWzNdICsgJywgJyArXG4gICAgICAgICAgICAgICAgICAgIGFbNF0gKyAnLCAnICsgYVs1XSArICcsICcgKyBhWzZdICsgJywgJyArIGFbN10gKyAnLCAnICtcbiAgICAgICAgICAgICAgICAgICAgYVs4XSArICcsICcgKyBhWzldICsgJywgJyArIGFbMTBdICsgJywgJyArIGFbMTFdICsgJywgJyArIFxuICAgICAgICAgICAgICAgICAgICBhWzEyXSArICcsICcgKyBhWzEzXSArICcsICcgKyBhWzE0XSArICcsICcgKyBhWzE1XSArICcpJztcbn07IiwibW9kdWxlLmV4cG9ydHMgPSB0cmFuc2xhdGU7XG5cbi8qKlxuICogVHJhbnNsYXRlIGEgbWF0NCBieSB0aGUgZ2l2ZW4gdmVjdG9yXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgbWF0cml4IHRvIHRyYW5zbGF0ZVxuICogQHBhcmFtIHt2ZWMzfSB2IHZlY3RvciB0byB0cmFuc2xhdGUgYnlcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xuZnVuY3Rpb24gdHJhbnNsYXRlKG91dCwgYSwgdikge1xuICAgIHZhciB4ID0gdlswXSwgeSA9IHZbMV0sIHogPSB2WzJdLFxuICAgICAgICBhMDAsIGEwMSwgYTAyLCBhMDMsXG4gICAgICAgIGExMCwgYTExLCBhMTIsIGExMyxcbiAgICAgICAgYTIwLCBhMjEsIGEyMiwgYTIzO1xuXG4gICAgaWYgKGEgPT09IG91dCkge1xuICAgICAgICBvdXRbMTJdID0gYVswXSAqIHggKyBhWzRdICogeSArIGFbOF0gKiB6ICsgYVsxMl07XG4gICAgICAgIG91dFsxM10gPSBhWzFdICogeCArIGFbNV0gKiB5ICsgYVs5XSAqIHogKyBhWzEzXTtcbiAgICAgICAgb3V0WzE0XSA9IGFbMl0gKiB4ICsgYVs2XSAqIHkgKyBhWzEwXSAqIHogKyBhWzE0XTtcbiAgICAgICAgb3V0WzE1XSA9IGFbM10gKiB4ICsgYVs3XSAqIHkgKyBhWzExXSAqIHogKyBhWzE1XTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBhMDAgPSBhWzBdOyBhMDEgPSBhWzFdOyBhMDIgPSBhWzJdOyBhMDMgPSBhWzNdO1xuICAgICAgICBhMTAgPSBhWzRdOyBhMTEgPSBhWzVdOyBhMTIgPSBhWzZdOyBhMTMgPSBhWzddO1xuICAgICAgICBhMjAgPSBhWzhdOyBhMjEgPSBhWzldOyBhMjIgPSBhWzEwXTsgYTIzID0gYVsxMV07XG5cbiAgICAgICAgb3V0WzBdID0gYTAwOyBvdXRbMV0gPSBhMDE7IG91dFsyXSA9IGEwMjsgb3V0WzNdID0gYTAzO1xuICAgICAgICBvdXRbNF0gPSBhMTA7IG91dFs1XSA9IGExMTsgb3V0WzZdID0gYTEyOyBvdXRbN10gPSBhMTM7XG4gICAgICAgIG91dFs4XSA9IGEyMDsgb3V0WzldID0gYTIxOyBvdXRbMTBdID0gYTIyOyBvdXRbMTFdID0gYTIzO1xuXG4gICAgICAgIG91dFsxMl0gPSBhMDAgKiB4ICsgYTEwICogeSArIGEyMCAqIHogKyBhWzEyXTtcbiAgICAgICAgb3V0WzEzXSA9IGEwMSAqIHggKyBhMTEgKiB5ICsgYTIxICogeiArIGFbMTNdO1xuICAgICAgICBvdXRbMTRdID0gYTAyICogeCArIGExMiAqIHkgKyBhMjIgKiB6ICsgYVsxNF07XG4gICAgICAgIG91dFsxNV0gPSBhMDMgKiB4ICsgYTEzICogeSArIGEyMyAqIHogKyBhWzE1XTtcbiAgICB9XG5cbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IHRyYW5zcG9zZTtcblxuLyoqXG4gKiBUcmFuc3Bvc2UgdGhlIHZhbHVlcyBvZiBhIG1hdDRcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIHRyYW5zcG9zZShvdXQsIGEpIHtcbiAgICAvLyBJZiB3ZSBhcmUgdHJhbnNwb3Npbmcgb3Vyc2VsdmVzIHdlIGNhbiBza2lwIGEgZmV3IHN0ZXBzIGJ1dCBoYXZlIHRvIGNhY2hlIHNvbWUgdmFsdWVzXG4gICAgaWYgKG91dCA9PT0gYSkge1xuICAgICAgICB2YXIgYTAxID0gYVsxXSwgYTAyID0gYVsyXSwgYTAzID0gYVszXSxcbiAgICAgICAgICAgIGExMiA9IGFbNl0sIGExMyA9IGFbN10sXG4gICAgICAgICAgICBhMjMgPSBhWzExXTtcblxuICAgICAgICBvdXRbMV0gPSBhWzRdO1xuICAgICAgICBvdXRbMl0gPSBhWzhdO1xuICAgICAgICBvdXRbM10gPSBhWzEyXTtcbiAgICAgICAgb3V0WzRdID0gYTAxO1xuICAgICAgICBvdXRbNl0gPSBhWzldO1xuICAgICAgICBvdXRbN10gPSBhWzEzXTtcbiAgICAgICAgb3V0WzhdID0gYTAyO1xuICAgICAgICBvdXRbOV0gPSBhMTI7XG4gICAgICAgIG91dFsxMV0gPSBhWzE0XTtcbiAgICAgICAgb3V0WzEyXSA9IGEwMztcbiAgICAgICAgb3V0WzEzXSA9IGExMztcbiAgICAgICAgb3V0WzE0XSA9IGEyMztcbiAgICB9IGVsc2Uge1xuICAgICAgICBvdXRbMF0gPSBhWzBdO1xuICAgICAgICBvdXRbMV0gPSBhWzRdO1xuICAgICAgICBvdXRbMl0gPSBhWzhdO1xuICAgICAgICBvdXRbM10gPSBhWzEyXTtcbiAgICAgICAgb3V0WzRdID0gYVsxXTtcbiAgICAgICAgb3V0WzVdID0gYVs1XTtcbiAgICAgICAgb3V0WzZdID0gYVs5XTtcbiAgICAgICAgb3V0WzddID0gYVsxM107XG4gICAgICAgIG91dFs4XSA9IGFbMl07XG4gICAgICAgIG91dFs5XSA9IGFbNl07XG4gICAgICAgIG91dFsxMF0gPSBhWzEwXTtcbiAgICAgICAgb3V0WzExXSA9IGFbMTRdO1xuICAgICAgICBvdXRbMTJdID0gYVszXTtcbiAgICAgICAgb3V0WzEzXSA9IGFbN107XG4gICAgICAgIG91dFsxNF0gPSBhWzExXTtcbiAgICAgICAgb3V0WzE1XSA9IGFbMTVdO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gb3V0O1xufTsiLCJcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL2xpYi91dGlsL2V4dGVuZCcpXG52YXIgZHluYW1pYyA9IHJlcXVpcmUoJy4vbGliL2R5bmFtaWMnKVxudmFyIHJhZiA9IHJlcXVpcmUoJy4vbGliL3V0aWwvcmFmJylcbnZhciBjbG9jayA9IHJlcXVpcmUoJy4vbGliL3V0aWwvY2xvY2snKVxudmFyIGNyZWF0ZVN0cmluZ1N0b3JlID0gcmVxdWlyZSgnLi9saWIvc3RyaW5ncycpXG52YXIgaW5pdFdlYkdMID0gcmVxdWlyZSgnLi9saWIvd2ViZ2wnKVxudmFyIHdyYXBFeHRlbnNpb25zID0gcmVxdWlyZSgnLi9saWIvZXh0ZW5zaW9uJylcbnZhciB3cmFwTGltaXRzID0gcmVxdWlyZSgnLi9saWIvbGltaXRzJylcbnZhciB3cmFwQnVmZmVycyA9IHJlcXVpcmUoJy4vbGliL2J1ZmZlcicpXG52YXIgd3JhcEVsZW1lbnRzID0gcmVxdWlyZSgnLi9saWIvZWxlbWVudHMnKVxudmFyIHdyYXBUZXh0dXJlcyA9IHJlcXVpcmUoJy4vbGliL3RleHR1cmUnKVxudmFyIHdyYXBSZW5kZXJidWZmZXJzID0gcmVxdWlyZSgnLi9saWIvcmVuZGVyYnVmZmVyJylcbnZhciB3cmFwRnJhbWVidWZmZXJzID0gcmVxdWlyZSgnLi9saWIvZnJhbWVidWZmZXInKVxudmFyIHdyYXBBdHRyaWJ1dGVzID0gcmVxdWlyZSgnLi9saWIvYXR0cmlidXRlJylcbnZhciB3cmFwU2hhZGVycyA9IHJlcXVpcmUoJy4vbGliL3NoYWRlcicpXG52YXIgd3JhcFJlYWQgPSByZXF1aXJlKCcuL2xpYi9yZWFkJylcbnZhciBjcmVhdGVDb3JlID0gcmVxdWlyZSgnLi9saWIvY29yZScpXG5cbnZhciBHTF9DT0xPUl9CVUZGRVJfQklUID0gMTYzODRcbnZhciBHTF9ERVBUSF9CVUZGRVJfQklUID0gMjU2XG52YXIgR0xfU1RFTkNJTF9CVUZGRVJfQklUID0gMTAyNFxuXG52YXIgR0xfQVJSQVlfQlVGRkVSID0gMzQ5NjJcbnZhciBHTF9URVhUVVJFXzJEID0gMHgwREUxXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUCA9IDB4ODUxM1xuXG52YXIgQ09OVEVYVF9MT1NUX0VWRU5UID0gJ3dlYmdsY29udGV4dGxvc3QnXG52YXIgQ09OVEVYVF9SRVNUT1JFRF9FVkVOVCA9ICd3ZWJnbGNvbnRleHRyZXN0b3JlZCdcblxudmFyIERZTl9QUk9QID0gMVxudmFyIERZTl9DT05URVhUID0gMlxudmFyIERZTl9TVEFURSA9IDNcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwUkVHTCAoKSB7XG4gIHZhciBhcmdzID0gaW5pdFdlYkdMKEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cykpXG4gIHZhciBnbCA9IGFyZ3MuZ2xcbiAgdmFyIG9wdGlvbnMgPSBhcmdzLm9wdGlvbnNcblxuICB2YXIgc3RyaW5nU3RvcmUgPSBjcmVhdGVTdHJpbmdTdG9yZSgpXG5cbiAgdmFyIGV4dGVuc2lvblN0YXRlID0gd3JhcEV4dGVuc2lvbnMoZ2wpXG4gIHZhciBleHRlbnNpb25zID0gZXh0ZW5zaW9uU3RhdGUuZXh0ZW5zaW9uc1xuXG4gIHZhciBTVEFSVF9USU1FID0gY2xvY2soKVxuICB2YXIgTEFTVF9USU1FID0gU1RBUlRfVElNRVxuICB2YXIgV0lEVEggPSBnbC5kcmF3aW5nQnVmZmVyV2lkdGhcbiAgdmFyIEhFSUdIVCA9IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHRcblxuICB2YXIgY29udGV4dFN0YXRlID0ge1xuICAgIGNvdW50OiAwLFxuICAgIGRlbHRhVGltZTogMCxcbiAgICB0aW1lOiAwLFxuICAgIHZpZXdwb3J0V2lkdGg6IFdJRFRILFxuICAgIHZpZXdwb3J0SGVpZ2h0OiBIRUlHSFQsXG4gICAgZnJhbWVidWZmZXJXaWR0aDogV0lEVEgsXG4gICAgZnJhbWVidWZmZXJIZWlnaHQ6IEhFSUdIVCxcbiAgICBkcmF3aW5nQnVmZmVyV2lkdGg6IFdJRFRILFxuICAgIGRyYXdpbmdCdWZmZXJIZWlnaHQ6IEhFSUdIVCxcbiAgICBwaXhlbFJhdGlvOiBvcHRpb25zLnBpeGVsUmF0aW9cbiAgfVxuICB2YXIgdW5pZm9ybVN0YXRlID0ge31cbiAgdmFyIGRyYXdTdGF0ZSA9IHtcbiAgICBlbGVtZW50czogbnVsbCxcbiAgICBwcmltaXRpdmU6IDQsIC8vIEdMX1RSSUFOR0xFU1xuICAgIGNvdW50OiAtMSxcbiAgICBvZmZzZXQ6IDAsXG4gICAgaW5zdGFuY2VzOiAtMVxuICB9XG5cbiAgdmFyIGxpbWl0cyA9IHdyYXBMaW1pdHMoZ2wsIGV4dGVuc2lvbnMpXG4gIHZhciBidWZmZXJTdGF0ZSA9IHdyYXBCdWZmZXJzKGdsKVxuICB2YXIgZWxlbWVudFN0YXRlID0gd3JhcEVsZW1lbnRzKGdsLCBleHRlbnNpb25zLCBidWZmZXJTdGF0ZSlcbiAgdmFyIGF0dHJpYnV0ZVN0YXRlID0gd3JhcEF0dHJpYnV0ZXMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMsXG4gICAgYnVmZmVyU3RhdGUsXG4gICAgc3RyaW5nU3RvcmUpXG4gIHZhciBzaGFkZXJTdGF0ZSA9IHdyYXBTaGFkZXJzKGdsLCBzdHJpbmdTdG9yZSlcbiAgdmFyIHRleHR1cmVTdGF0ZSA9IHdyYXBUZXh0dXJlcyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICBwb2xsLFxuICAgIGNvbnRleHRTdGF0ZSlcbiAgdmFyIHJlbmRlcmJ1ZmZlclN0YXRlID0gd3JhcFJlbmRlcmJ1ZmZlcnMoZ2wsIGV4dGVuc2lvbnMsIGxpbWl0cylcbiAgdmFyIGZyYW1lYnVmZmVyU3RhdGUgPSB3cmFwRnJhbWVidWZmZXJzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzLFxuICAgIHRleHR1cmVTdGF0ZSxcbiAgICByZW5kZXJidWZmZXJTdGF0ZSlcbiAgdmFyIHJlYWRQaXhlbHMgPSB3cmFwUmVhZChnbCwgcG9sbCwgY29udGV4dFN0YXRlKVxuXG4gIHZhciBjb3JlID0gY3JlYXRlQ29yZShcbiAgICBnbCxcbiAgICBzdHJpbmdTdG9yZSxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICBidWZmZXJTdGF0ZSxcbiAgICBlbGVtZW50U3RhdGUsXG4gICAgdGV4dHVyZVN0YXRlLFxuICAgIGZyYW1lYnVmZmVyU3RhdGUsXG4gICAgdW5pZm9ybVN0YXRlLFxuICAgIGF0dHJpYnV0ZVN0YXRlLFxuICAgIHNoYWRlclN0YXRlLFxuICAgIGRyYXdTdGF0ZSxcbiAgICBjb250ZXh0U3RhdGUpXG5cbiAgdmFyIG5leHRTdGF0ZSA9IGNvcmUubmV4dFxuICB2YXIgY2FudmFzID0gZ2wuY2FudmFzXG5cbiAgdmFyIHJhZkNhbGxiYWNrcyA9IFtdXG4gIHZhciBhY3RpdmVSQUYgPSAwXG4gIGZ1bmN0aW9uIGhhbmRsZVJBRiAoKSB7XG4gICAgLy8gc2NoZWR1bGUgbmV4dCBhbmltYXRpb24gZnJhbWVcbiAgICBhY3RpdmVSQUYgPSByYWYubmV4dChoYW5kbGVSQUYpXG5cbiAgICAvLyBpbmNyZW1lbnQgZnJhbWUgY291blxuICAgIGNvbnRleHRTdGF0ZS5jb3VudCArPSAxXG5cbiAgICAvLyByZXNldCB2aWV3cG9ydFxuICAgIHZhciB2aWV3cG9ydCA9IG5leHRTdGF0ZS52aWV3cG9ydFxuICAgIHZhciBzY2lzc29yQm94ID0gbmV4dFN0YXRlLnNjaXNzb3JfYm94XG4gICAgdmlld3BvcnRbMF0gPSB2aWV3cG9ydFsxXSA9IHNjaXNzb3JCb3hbMF0gPSBzY2lzc29yQm94WzFdID0gMFxuXG4gICAgY29udGV4dFN0YXRlLnZpZXdwb3J0V2lkdGggPVxuICAgICAgY29udGV4dFN0YXRlLmZyYW1lQnVmZmVyV2lkdGggPVxuICAgICAgY29udGV4dFN0YXRlLmRyYXdpbmdCdWZmZXJXaWR0aCA9XG4gICAgICB2aWV3cG9ydFsyXSA9XG4gICAgICBzY2lzc29yQm94WzJdID0gZ2wuZHJhd2luZ0J1ZmZlcldpZHRoXG4gICAgY29udGV4dFN0YXRlLnZpZXdwb3J0SGVpZ2h0ID1cbiAgICAgIGNvbnRleHRTdGF0ZS5mcmFtZUJ1ZmZlcldpZHRoID1cbiAgICAgIGNvbnRleHRTdGF0ZS5kcmF3aW5nQnVmZmVySGVpZ2h0ID1cbiAgICAgIHZpZXdwb3J0WzNdID1cbiAgICAgIHNjaXNzb3JCb3hbM10gPSBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XG5cbiAgICB2YXIgbm93ID0gY2xvY2soKVxuICAgIGNvbnRleHRTdGF0ZS5kZWx0YVRpbWUgPSAobm93IC0gTEFTVF9USU1FKSAvIDEwMDAuMFxuICAgIGNvbnRleHRTdGF0ZS50aW1lID0gKG5vdyAtIFNUQVJUX1RJTUUpIC8gMTAwMC4wXG4gICAgTEFTVF9USU1FID0gbm93XG5cbiAgICBjb3JlLnByb2NzLnJlZnJlc2goKVxuICAgIHRleHR1cmVTdGF0ZS5wb2xsKClcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmFmQ2FsbGJhY2tzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgY2IgPSByYWZDYWxsYmFja3NbaV1cbiAgICAgIGNiKGNvbnRleHRTdGF0ZSwgbnVsbCwgMClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzdGFydFJBRiAoKSB7XG4gICAgaWYgKCFhY3RpdmVSQUYgJiYgcmFmQ2FsbGJhY2tzLmxlbmd0aCA+IDApIHtcbiAgICAgIGhhbmRsZVJBRigpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc3RvcFJBRiAoKSB7XG4gICAgaWYgKGFjdGl2ZVJBRikge1xuICAgICAgcmFmLmNhbmNlbChoYW5kbGVSQUYpXG4gICAgICBhY3RpdmVSQUYgPSAwXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlQ29udGV4dExvc3MgKGV2ZW50KSB7XG4gICAgLypcbiAgICBzdG9wUkFGKClcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXG4gICAgaWYgKG9wdGlvbnMub25Db250ZXh0TG9zdCkge1xuICAgICAgb3B0aW9ucy5vbkNvbnRleHRMb3N0KClcbiAgICB9XG4gICAgKi9cbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUNvbnRleHRSZXN0b3JlZCAoZXZlbnQpIHtcbiAgICAvKlxuICAgIGdsLmdldEVycm9yKClcbiAgICBleHRlbnNpb25TdGF0ZS5yZWZyZXNoKClcbiAgICBjb3JlLnByb2NzLnJlZnJlc2goKVxuICAgIGJ1ZmZlclN0YXRlLnJlZnJlc2goKVxuICAgIHRleHR1cmVTdGF0ZS5yZWZyZXNoKClcbiAgICByZW5kZXJidWZmZXJTdGF0ZS5yZWZyZXNoKClcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLnJlZnJlc2goKVxuICAgIHNoYWRlclN0YXRlLnJlZnJlc2goKVxuICAgIGlmIChvcHRpb25zLm9uQ29udGV4dFJlc3RvcmVkKSB7XG4gICAgICBvcHRpb25zLm9uQ29udGV4dFJlc3RvcmVkKClcbiAgICB9XG4gICAgaGFuZGxlUkFGKClcbiAgICAqL1xuICB9XG5cbiAgaWYgKGNhbnZhcykge1xuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKENPTlRFWFRfTE9TVF9FVkVOVCwgaGFuZGxlQ29udGV4dExvc3MsIGZhbHNlKVxuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKENPTlRFWFRfUkVTVE9SRURfRVZFTlQsIGhhbmRsZUNvbnRleHRSZXN0b3JlZCwgZmFsc2UpXG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95ICgpIHtcbiAgICBzdG9wUkFGKClcblxuICAgIGlmIChjYW52YXMpIHtcbiAgICAgIGNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKENPTlRFWFRfTE9TVF9FVkVOVCwgaGFuZGxlQ29udGV4dExvc3MpXG4gICAgICBjYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihDT05URVhUX1JFU1RPUkVEX0VWRU5ULCBoYW5kbGVDb250ZXh0UmVzdG9yZWQpXG4gICAgfVxuXG4gICAgc2hhZGVyU3RhdGUuY2xlYXIoKVxuICAgIGZyYW1lYnVmZmVyU3RhdGUuY2xlYXIoKVxuICAgIHJlbmRlcmJ1ZmZlclN0YXRlLmNsZWFyKClcbiAgICB0ZXh0dXJlU3RhdGUuY2xlYXIoKVxuICAgIGJ1ZmZlclN0YXRlLmNsZWFyKClcblxuICAgIGlmIChvcHRpb25zLm9uRGVzdHJveSkge1xuICAgICAgb3B0aW9ucy5vbkRlc3Ryb3koKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXBpbGVQcm9jZWR1cmUgKG9wdGlvbnMpIHtcbiAgICBcbiAgICBcblxuICAgIGZ1bmN0aW9uIGZsYXR0ZW5OZXN0ZWRPcHRpb25zIChvcHRpb25zKSB7XG4gICAgICB2YXIgcmVzdWx0ID0gZXh0ZW5kKHt9LCBvcHRpb25zKVxuICAgICAgZGVsZXRlIHJlc3VsdC51bmlmb3Jtc1xuICAgICAgZGVsZXRlIHJlc3VsdC5hdHRyaWJ1dGVzXG4gICAgICBkZWxldGUgcmVzdWx0LmNvbnRleHRcblxuICAgICAgZnVuY3Rpb24gbWVyZ2UgKG5hbWUpIHtcbiAgICAgICAgaWYgKG5hbWUgaW4gcmVzdWx0KSB7XG4gICAgICAgICAgdmFyIGNoaWxkID0gcmVzdWx0W25hbWVdXG4gICAgICAgICAgZGVsZXRlIHJlc3VsdFtuYW1lXVxuICAgICAgICAgIE9iamVjdC5rZXlzKGNoaWxkKS5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICAgICAgICByZXN1bHRbbmFtZSArICcuJyArIHByb3BdID0gY2hpbGRbcHJvcF1cbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBtZXJnZSgnYmxlbmQnKVxuICAgICAgbWVyZ2UoJ2RlcHRoJylcbiAgICAgIG1lcmdlKCdjdWxsJylcbiAgICAgIG1lcmdlKCdzdGVuY2lsJylcbiAgICAgIG1lcmdlKCdwb2x5Z29uT2Zmc2V0JylcbiAgICAgIG1lcmdlKCdzY2lzc29yJylcbiAgICAgIG1lcmdlKCdzYW1wbGUnKVxuXG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2VwYXJhdGVEeW5hbWljIChvYmplY3QpIHtcbiAgICAgIHZhciBzdGF0aWNJdGVtcyA9IHt9XG4gICAgICB2YXIgZHluYW1pY0l0ZW1zID0ge31cbiAgICAgIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmdW5jdGlvbiAob3B0aW9uKSB7XG4gICAgICAgIHZhciB2YWx1ZSA9IG9iamVjdFtvcHRpb25dXG4gICAgICAgIGlmIChkeW5hbWljLmlzRHluYW1pYyh2YWx1ZSkpIHtcbiAgICAgICAgICBkeW5hbWljSXRlbXNbb3B0aW9uXSA9IGR5bmFtaWMudW5ib3godmFsdWUsIG9wdGlvbilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdGF0aWNJdGVtc1tvcHRpb25dID0gdmFsdWVcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGR5bmFtaWM6IGR5bmFtaWNJdGVtcyxcbiAgICAgICAgc3RhdGljOiBzdGF0aWNJdGVtc1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFRyZWF0IGNvbnRleHQgdmFyaWFibGVzIHNlcGFyYXRlIGZyb20gb3RoZXIgZHluYW1pYyB2YXJpYWJsZXNcbiAgICB2YXIgY29udGV4dCA9IHNlcGFyYXRlRHluYW1pYyhvcHRpb25zLmNvbnRleHQgfHwge30pXG4gICAgdmFyIHVuaWZvcm1zID0gc2VwYXJhdGVEeW5hbWljKG9wdGlvbnMudW5pZm9ybXMgfHwge30pXG4gICAgdmFyIGF0dHJpYnV0ZXMgPSBzZXBhcmF0ZUR5bmFtaWMob3B0aW9ucy5hdHRyaWJ1dGVzIHx8IHt9KVxuICAgIHZhciBvcHRzID0gc2VwYXJhdGVEeW5hbWljKGZsYXR0ZW5OZXN0ZWRPcHRpb25zKG9wdGlvbnMpKVxuXG4gICAgdmFyIGNvbXBpbGVkID0gY29yZS5jb21waWxlKG9wdHMsIGF0dHJpYnV0ZXMsIHVuaWZvcm1zLCBjb250ZXh0KVxuXG4gICAgdmFyIGRyYXcgPSBjb21waWxlZC5kcmF3XG4gICAgdmFyIGJhdGNoID0gY29tcGlsZWQuYmF0Y2hcbiAgICB2YXIgc2NvcGUgPSBjb21waWxlZC5zY29wZVxuXG4gICAgdmFyIEVNUFRZX0FSUkFZID0gW11cbiAgICBmdW5jdGlvbiByZXNlcnZlIChjb3VudCkge1xuICAgICAgd2hpbGUgKEVNUFRZX0FSUkFZLmxlbmd0aCA8IGNvdW50KSB7XG4gICAgICAgIEVNUFRZX0FSUkFZLnB1c2gobnVsbClcbiAgICAgIH1cbiAgICAgIHJldHVybiBFTVBUWV9BUlJBWVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIFJFR0xDb21tYW5kIChhcmdzLCBib2R5KSB7XG4gICAgICB2YXIgaVxuICAgICAgaWYgKHR5cGVvZiBhcmdzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHJldHVybiBzY29wZS5jYWxsKHRoaXMsIG51bGwsIGFyZ3MsIDApXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBib2R5ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGlmICh0eXBlb2YgYXJncyA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgYXJnczsgKytpKSB7XG4gICAgICAgICAgICBzY29wZS5jYWxsKHRoaXMsIG51bGwsIGJvZHksIGkpXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoYXJncykpIHtcbiAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgYXJncy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgc2NvcGUuY2FsbCh0aGlzLCBhcmdzW2ldLCBib2R5LCBpKVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gc2NvcGUuY2FsbCh0aGlzLCBhcmdzLCBib2R5LCAwKVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBhcmdzID09PSAnbnVtYmVyJykge1xuICAgICAgICBpZiAoYXJncyA+IDApIHtcbiAgICAgICAgICByZXR1cm4gYmF0Y2guY2FsbCh0aGlzLCByZXNlcnZlKGFyZ3MgfCAwKSwgYXJncyB8IDApXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShhcmdzKSkge1xuICAgICAgICBpZiAoYXJncy5sZW5ndGgpIHtcbiAgICAgICAgICByZXR1cm4gYmF0Y2guY2FsbCh0aGlzLCBhcmdzLCBhcmdzLmxlbmd0aClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGRyYXcuY2FsbCh0aGlzLCBhcmdzKVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBSRUdMQ29tbWFuZFxuICB9XG5cbiAgZnVuY3Rpb24gcG9sbCAoKSB7XG4gICAgY29yZS5wcm9jcy5wb2xsKClcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyIChvcHRpb25zKSB7XG4gICAgdmFyIGNsZWFyRmxhZ3MgPSAwXG5cbiAgICBwb2xsKClcblxuICAgIHZhciBjID0gb3B0aW9ucy5jb2xvclxuICAgIGlmIChjKSB7XG4gICAgICBnbC5jbGVhckNvbG9yKCtjWzBdIHx8IDAsICtjWzFdIHx8IDAsICtjWzJdIHx8IDAsICtjWzNdIHx8IDApXG4gICAgICBjbGVhckZsYWdzIHw9IEdMX0NPTE9SX0JVRkZFUl9CSVRcbiAgICB9XG4gICAgaWYgKCdkZXB0aCcgaW4gb3B0aW9ucykge1xuICAgICAgZ2wuY2xlYXJEZXB0aCgrb3B0aW9ucy5kZXB0aClcbiAgICAgIGNsZWFyRmxhZ3MgfD0gR0xfREVQVEhfQlVGRkVSX0JJVFxuICAgIH1cbiAgICBpZiAoJ3N0ZW5jaWwnIGluIG9wdGlvbnMpIHtcbiAgICAgIGdsLmNsZWFyU3RlbmNpbChvcHRpb25zLnN0ZW5jaWwgfCAwKVxuICAgICAgY2xlYXJGbGFncyB8PSBHTF9TVEVOQ0lMX0JVRkZFUl9CSVRcbiAgICB9XG5cbiAgICBcbiAgICBnbC5jbGVhcihjbGVhckZsYWdzKVxuICB9XG5cbiAgZnVuY3Rpb24gZnJhbWUgKGNiKSB7XG4gICAgcmFmQ2FsbGJhY2tzLnB1c2goY2IpXG5cbiAgICBmdW5jdGlvbiBjYW5jZWwgKCkge1xuICAgICAgdmFyIGluZGV4ID0gcmFmQ2FsbGJhY2tzLmZpbmQoZnVuY3Rpb24gKGl0ZW0pIHtcbiAgICAgICAgcmV0dXJuIGl0ZW0gPT09IGNiXG4gICAgICB9KVxuICAgICAgaWYgKGluZGV4IDwgMCkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIHJhZkNhbGxiYWNrcy5zcGxpY2UoaW5kZXgsIDEpXG4gICAgICBpZiAocmFmQ2FsbGJhY2tzLmxlbmd0aCA8PSAwKSB7XG4gICAgICAgIHN0b3BSQUYoKVxuICAgICAgfVxuICAgIH1cblxuICAgIHN0YXJ0UkFGKClcblxuICAgIHJldHVybiB7XG4gICAgICBjYW5jZWw6IGNhbmNlbFxuICAgIH1cbiAgfVxuXG4gIGNvcmUucHJvY3MucmVmcmVzaCgpXG5cbiAgcmV0dXJuIGV4dGVuZChjb21waWxlUHJvY2VkdXJlLCB7XG4gICAgLy8gQ2xlYXIgY3VycmVudCBGQk9cbiAgICBjbGVhcjogY2xlYXIsXG5cbiAgICAvLyBTaG9ydCBjdXRzIGZvciBkeW5hbWljIHZhcmlhYmxlc1xuICAgIHByb3A6IGR5bmFtaWMuZGVmaW5lLmJpbmQobnVsbCwgRFlOX1BST1ApLFxuICAgIGNvbnRleHQ6IGR5bmFtaWMuZGVmaW5lLmJpbmQobnVsbCwgRFlOX0NPTlRFWFQpLFxuICAgIHRoaXM6IGR5bmFtaWMuZGVmaW5lLmJpbmQobnVsbCwgRFlOX1NUQVRFKSxcblxuICAgIC8vIGV4ZWN1dGVzIGFuIGVtcHR5IGRyYXcgY29tbWFuZFxuICAgIGRyYXc6IGNvbXBpbGVQcm9jZWR1cmUoe30pLFxuXG4gICAgLy8gUmVzb3VyY2VzXG4gICAgZWxlbWVudHM6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICByZXR1cm4gZWxlbWVudFN0YXRlLmNyZWF0ZShvcHRpb25zKVxuICAgIH0sXG4gICAgYnVmZmVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIGJ1ZmZlclN0YXRlLmNyZWF0ZShvcHRpb25zLCBHTF9BUlJBWV9CVUZGRVIpXG4gICAgfSxcbiAgICB0ZXh0dXJlOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIHRleHR1cmVTdGF0ZS5jcmVhdGUob3B0aW9ucywgR0xfVEVYVFVSRV8yRClcbiAgICB9LFxuICAgIGN1YmU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gNikge1xuICAgICAgICByZXR1cm4gdGV4dHVyZVN0YXRlLmNyZWF0ZShcbiAgICAgICAgICBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpLFxuICAgICAgICAgIEdMX1RFWFRVUkVfQ1VCRV9NQVApXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdGV4dHVyZVN0YXRlLmNyZWF0ZShvcHRpb25zLCBHTF9URVhUVVJFX0NVQkVfTUFQKVxuICAgICAgfVxuICAgIH0sXG4gICAgcmVuZGVyYnVmZmVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIHJlbmRlcmJ1ZmZlclN0YXRlLmNyZWF0ZShvcHRpb25zKVxuICAgIH0sXG4gICAgZnJhbWVidWZmZXI6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICByZXR1cm4gZnJhbWVidWZmZXJTdGF0ZS5jcmVhdGUob3B0aW9ucylcbiAgICB9LFxuICAgIGZyYW1lYnVmZmVyQ3ViZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIFxuICAgIH0sXG5cbiAgICAvLyBFeHBvc2UgY29udGV4dCBhdHRyaWJ1dGVzXG4gICAgYXR0cmlidXRlczogZ2wuZ2V0Q29udGV4dEF0dHJpYnV0ZXMoKSxcblxuICAgIC8vIEZyYW1lIHJlbmRlcmluZ1xuICAgIGZyYW1lOiBmcmFtZSxcblxuICAgIC8vIFN5c3RlbSBsaW1pdHNcbiAgICBsaW1pdHM6IGxpbWl0cyxcblxuICAgIC8vIFJlYWQgcGl4ZWxzXG4gICAgcmVhZDogcmVhZFBpeGVscyxcblxuICAgIC8vIERlc3Ryb3kgcmVnbCBhbmQgYWxsIGFzc29jaWF0ZWQgcmVzb3VyY2VzXG4gICAgZGVzdHJveTogZGVzdHJveSxcblxuICAgIC8vIERpcmVjdCBHTCBzdGF0ZSBtYW5pcHVsYXRpb25cbiAgICBfZ2w6IGdsLFxuICAgIF9yZWZyZXNoOiBmdW5jdGlvbiAoKSB7XG4gICAgICBjb3JlLnByb2NzLnJlZnJlc2goKVxuICAgIH1cbiAgfSlcbn1cbiJdfQ==
