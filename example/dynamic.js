/*
  tags: basic

  <p> This example shows how to pass props to draw commands </p>
*/

const regl = require('regl')()

const draw = regl({
  frag: `
    precision mediump float;
    uniform vec4 color;
    void main() {
      gl_FragColor = color;
    }`,

  vert: `
    precision mediump float;
    attribute vec2 position;
    uniform float angle;
    void main() {
      gl_Position = vec4(
        cos(angle) * position.x + sin(angle) * position.y,
        -sin(angle) * position.x + cos(angle) * position.y, 0, 1);
    }`,

  attributes: {
    position: [
      -1, 0,
      0, -1,
      1, 1]
  },

  uniforms: {
    color: regl.prop('color'),
    angle: ({tick}) => 0.01 * tick
  },

  depth: {
    enable: false
  },

  count: 3
})

regl.frame(({tick}) => {
  regl.clear({
    color: [0, 0, 0, 1]
  })

  draw({
    color: [
      Math.sin(0.02 * (0.001 * tick)),
      Math.cos(0.02 * (0.02 * tick)),
      Math.sin(0.02 * (0.3 * tick)),
      1
    ]
  })
})
