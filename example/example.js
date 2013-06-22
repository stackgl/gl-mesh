var shell = require("gl-now")()
var createMesh = require("../index.js")
var simple2DShader = require("simple-2d-shader")

var mesh, shader

shell.on("gl-init", function() {
  var gl = shell.gl
  shader = simple2DShader(gl)
  mesh = createMesh(gl,
      [[0, 1, 2], 
       [2, 1, 3]],
      { "position": [[-1,-1],   [0, 1],    [0, 0],    [1, -1]],
        "color":    [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1]] })
})

shell.on("gl-render", function(t) {
  shader.bind()
  mesh.bind(shader)
  mesh.draw()
  mesh.unbind()
})