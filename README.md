gl-mesh
=======
WebGL class for rendering static indexed geometry

**WORK IN PROGRESS**

# Example

```javascript
var shell = require("gl-now")()
var createMesh = require("gl-mesh")
var simple2DShader = require("simple-2d-shader")

var mesh, shader

shell.on("gl-init", function() {
  var gl = shell.gl
  
  shader = simple2DShader(gl)

  mesh = createMesh(gl,
      [[0, 1, 2], 
       [1, 2, 3]],
      { "position": [[0,0],     [1, 0],    [1,1],     [-1,1]],
        "color":    [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1]] })
})

shell.on("gl-render", function(t) {
  shader.bind()
  mesh.bind(shader)
  mesh.draw()
  mesh.unbind()
})
```

# Install

Use [npm](https://npmjs.org/) to install it locally:

    npm install gl-mesh
    
Then you can build/run the client using any tool that compiles CommonJS modules, for example [browserify](https://github.com/substack/node-browserify) or [beefy](https://github.com/chrisdickinson/beefy).

# API

```javascript
var createMesh = require("gl-mesh")
```

## Constructor

### `var mesh = createMesh(gl, cells, attributes)`
Creates a mesh


## Methods

### `mesh.bind(shader)`

### `mesh.draw()`

### `mesh.unbind()`

### `mesh.dispose()`

# Credits
(c) 2013 Mikola Lysenko. MIT License