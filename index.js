"use strict"

var webglew = require("webglew")
var createBuffer = require("gl-buffer")
var createVAO = require("gl-vao")
var ndarray = require("ndarray")
var ops = require("ndarray-ops")
var pool = require("typedarray-pool")

var Mesh = require("./lib/mesh.js")

function EmptyMesh(gl) {
  this.gl = gl
  this.mode = gl.POINTS
  this.numElements = 0
  this.elements = null
  this.attributes = {}
}
EmptyMesh.prototype.dispose = function() {}
EmptyMesh.prototype.bind = function() {}
EmptyMesh.prototype.unbind = function() {}
EmptyMesh.prototype.draw = function() {}


function MeshAttribute(buffer, size, type, normalized) {
  this.buffer = buffer
  this.size = size
  this.type = type
  this.normalized = normalized
}

function getGLType(gl, array) {
  if((array instanceof Uint8Array) ||
     (array instanceof Uint8ClampedArray)) {
    return gl.UNSIGNED_BYTE
  } else if(array instanceof Int8Array) {
    return gl.BYTE
  } else if(array instanceof Uint16Array) {
    return gl.UNSIGNED_SHORT
  } else if(array instanceof Int16Array) {
    return gl.SHORT
  } else if(array instanceof Uint32Array) {
    return gl.UNSIGNED_INT
  } else if(array instanceof Int32Array) {
    return gl.INT
  } else if(array instanceof Float32Array) {
    return gl.FLOAT
  }
  return 0
}

function createTmpArray(gl, type, n) {
  if(type === gl.UNSIGNED_BYTE) {
    return pool.mallocUint8(n)
  } else if(type === gl.BYTE) {
    return pool.mallocInt8(n)
  } else if(type === gl.UNSIGNED_SHORT) {
    return pool.mallocUint16(n)
  } else if(type === gl.SHORT) {
    return pool.mallocInt16(n)
  } else if(type === gl.UNSIGNED_INT) {
    return pool.mallocUint32(n)
  } else if(type === gl.INT) {
    return pool.mallocInt32(n)
  }
  return pool.mallocFloat32(n)
}

function packAttributes(gl, numVertices, attributes) {
  var attrNames = []
  var attrBuffers = []
  for(var name in attributes) {
    var attr = attributes[name]
    var buffer, type, normalized, size
    if(attr.length) {
      if(attr.length !== numVertices) {
        throw new Error("Incorrect vertex count for attribute " + name)
      }
      if(typeof attr[0] === "number") {
        var gltype = getGLType(attr)
        if(gltype) {
          //Case: typed array
          size = 1
          type = gltype
          normalized = (gltype === gl.BYTE || gltype === gl.UNSIGNED_BYTE)
          buffer = createBuffer(gl, attr)
        } else {
          //Case: native array of numbers
          var tmp_buf = pool.mallocFloat32(numVertices)
          for(var i=0; i<numVertices; ++i) {
            tmp_buf[i] = attr[i]
          }
          size = 1
          type = gl.FLOAT
          normalized = false
          buffer = createBuffer(gl, tmp_buf.subarray(0, numVertices))
          pool.freeUint32(tmp_buf)
        }
      } else if(attr[0].length) {
        //Case: native array of arrays
        size = attr[0].length|0
        var ptr = 0
        var tmp_buf = pool.mallocFloat32(size * numVertices)
        for(var i=0; i<numVertices; ++i) {
          var vert = attr[i]
          for(var j=0; j<size; ++j) {
            tmp_buf[ptr++] = vert[j]
          }
        }
        type = gl.FLOAT
        normalized = false
        buffer = createBuffer(gl, tmp_buf.subarray(0, ptr))
        pool.freeFloat32(tmp_buf)
      }
    } else if(attr.shape) {
      if(attr.shape[0] !== numVertices) {
        throw new Error("Invalid shape for attribute " + name)
      }
      //Check if type is compatible
      var packed = true
      type = getGLType(gl, attr.data)
      if(!type) {
        packed = false
        type = gl.FLOAT
      }
      if(stride[0] !== 1 || (shape[1] > 1 && stride[1] !== 1)) {
        packed = false
      }
      //Check if array has to be normalized
      normalized = (type === gl.BYTE || type === gl.UNSIGNED_BYTE)
      size = attr.shape[1]
      if(packed) {
        //Case: packed ndarray, directly blit into buffer
        if(attr.offset === 0 && attr.data.length === size*numVertices) {
          buffer = createBuffer(gl, attr.data)
        } else {
          buffer = createBuffer(gl, attr.data.subarray(0, size*numVertices))
        }
      } else {
        //Case: unpacked ndarray, create new array and blit
        var tmp_buf = createTmpArray(gl, type, size*numVertices)
        var tmp = ndarray(tmp_buf, attr.shape)
        ops.assign(tmp, attr)
        buffer = createBuffer(gl, tmp.data.subarray(0, size*numVertices))
        pool.free(tmp_buf)
      }
    } else {
      throw new Error("Invalid vertex attribute " + name)
    }
    attrNames.push(name)
    attrVals.push(new MeshAttribute(buffer, size, type, normalized))
  }
  return {
    names: attrNames,
    values: attrVals
  }
}

function packAttributesFromNDArray(gl, numVertices, attributes, elements) {
  var n = elements.shape[0]|0
  var d = elements.shape[1]|0
  var numElements = (n*d)|0
  
}

function packAttributesFrom1DArray(gl, numVertices, attributes, elements) {
  var n = elements.length|0
  var buf = pool.mallocUint32(n)
  for(var i=0; i<n; ++i) {
    buf[i] = elements[i]
  }
  var result = packAttributesFromNDArray(gl, numVertices, attributes, ndarray(buf, [n, 1]))
  pool.freeUint32(buf)
  return result
}

function packAttributesFromArray(gl, numVertices, attributes, elements) {
  var n = elements.length|0
  var d = elements[0].length|)
  var ptr = 0
  var buf = pool.mallocUint32(n*d)
  for(var i=0; i<n; ++i) {
    var list = elements[i]
    for(var j=0; j<d; ++j) {
      buf[ptr++] = list[j]
    }
  }
  var result = packAttributesFromNDArray(gl, numVertices, attributes, ndarray(buf, [n, d]))
  pool.freeUint32(buf)
  return result
}

//Builds the actual mesh object, selecting appropriate implementation depending on if vertex attribute objects are supported
function buildMeshObject(gl, mode, numElements, elements, attributes) {
  if(numElements === 0) {
    return new EmptyMesh(gl)
  }
  var vao = createVAO(gl, elements, attributes.values)
  return new Mesh(gl, mode, numElements, vao, elements, attributes.values, attributes.names)
}

//Creates a mesh
function createMesh(gl, elements, attributes) {

  //Special case: handle object with cells/positions/etc. for attributes
  if(arguments.length === 2) {
    if(elements.cells) {
      attributes = {}
      for(var id in elements) {
        if(id === "cells") {
          continue
        }
        attributes[id] = elements[id]
      }
      elements = elements.cells
    }
  }
  
  //First figure out what mode we are using (POINTS, LINES or TRIANGLES)
  var mode
  if(attributes === undefined) {
    //Special case for point clouds
    attributes = elements
    elements = undefined
    mode = gl.POINTS
  } else if(elements instanceof Array) {
    if(elements.length === 0) {
      //Empty array, return empty mesh
      return buildMeshObject(gl, gl.POINTS, 0, null, [])
    } else if(typeof elements[0] === "number" || elements[0].length === 1) {
      mode = gl.POINTS
    } else if(elements[0].length === 2) {
      mode = gl.LINES
    } else if(elements[0].length === 3) {
      mode = gl.TRIANGLES
    } else {
      throw new Error("Invalid shape for element array")
    }
  } else if(elements.shape) {
    if(elements.shape.length === 1) {
      mode = gl.POINTS
      //Special case: convert to 2d element array for point cloud automatically to simplify things later on
      elements = ndarray(elements.data, [elements.shape[0], 1], [elements.stride[0], 1], elements.offset)
    } else if(elements.shape.length !== 2) {
      throw new Error("Invalid shape for element array")
    } else if(elements.shape[1] === 1) {
      mode = gl.POINTS
    } else if(elements.shape[1] === 2) {
      mode = gl.LINES
    } else if(elements.shape[1] === 3) {
      mode = gl.TRIANGLES
    } else {
      throw new Error("Invalid shape for elment array")
    }
    //Special case for empty meshes
    if(elements.shape[0] === 0) {
      return buildMeshObject(gl, mode, 0, null, [])
    }
  } else {
    throw new Error("Invalid data type for element array")
  }
  
  //Next figure out how many vertices we are using
  var attr_names = Object.keys(attributes)
  if(attr_names.length < 1) {
    throw new Error("Invalid number of vertex attributes")
  }
  var numVertices, attr0 = attributes[attr_names[0]]
  if(attr0.length) {
    numVertices = attr0.length
  } else if(attr0.shape) {
    numVertices = attr0.shape[0]
  } else {
    throw new Error("Invalid vertex attribute: " + attr_names[0])
  }
  
  //We now have three basic cases:
  if(elements === undefined) {
    //First special case is a point cloud: this is easy
    return buildMeshObject(gl, gl.POINTS, numVertices, null, packAttributes(gl, numVertices, attributes))
    
  } else if((numVertices <= 1<<16) && mode !== gl.POINTS) {
    //Indices fit in 16-bit unsigned int, so we can use gl.drawElements
  
    //First thing is to repackage element buffer
    var element_buffer, element_count
    if(elements instanceof Array) {
    //    1a. elements is array    => coerce to ndarray
      if(typeof elements[0] === "number") {
        //Special case: point cloud
        element_count = elements.length|0
        var point_buf = pool.mallocUint16(element_count)
        for(var i=0; i<element_count; ++i) {
          point_buf[i] = elements[i]
        }
        element_buffer = createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, point_buf.subarray(0, element_count))
        pool.freeUint16(point_buf)
      } else {
        //Otherwise we pack data into a uint16 array
        var n = elements.length|0
        var d = elements[0].length|0
        var ptr = 0
        element_count = (n*d)|0
        var packed_buf = pool.mallocUint16(element_count)
        for(var i=0; i<n; ++i) {
          var prim = elements[i]
          for(var j=0; j<d; ++j) {
            packed_buf[ptr++] = prim[j]
          }
        }
        element_buffer = createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, packed_buf.subarray(0, element_count))
        pool.freeUint16(packed_buf)
      }
    } else {
      element_count = elements.shape[0] * elements.shape[1]
    //    1b. elements is ndarray  => check packing:
      if(elements.stride[1] === 1 &&
         elements.stride[0] === elements.shape[1] &&
         elements.data instanceof Uint16Array) {
      //        1b.1  array is packed   => use directly
        if(elements.offset === 0 &&
           elements.data.length === element_count) {
          element_buffer = createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, elements.data)
        } else {
          element_buffer = createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, elements.data.subarray(elements.offset, elements.offset + element_count))
        }
      } else {
      //        1b.2  array not packed  => copy to packed array
        var packed_buf = pool.mallocUint16(element_count)
        var packed_view = ndarray(packed_buf, elements.shape)
        ops.assign(packed_view, elements)
        element_buffer = createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, packed_buf.subarray(0, element_count))
        pool.freeUint16(packed_buf)
      }
    }
    
    //Finally we are done
    return buildMeshObject(gl, mode, element_count, element_buffer, packAttributes(gl, numVertices, attributes))
    
  } else {
    //Otherwise we use gl.drawArrays
    if(elements instanceof Array) {
      if(typeof elements[0] === "number") {
        return buildMeshObject(gl, mode, elements.length, null, packAttributesFrom1DArray(gl, numVertices, attributes, elements))
      } else {
        return buildMeshObject(gl, mode, elements.length * elements[0].length, null, packAttributesFromArray(gl, numVertices, attributes, elements))
      }
    } else {
      return buildMeshObject(gl, mode, elements.shape[0] * elements.shape[1], null, packAttributesFromNDArray(gl, numVertices, attributes, elements))
    }
  }
  throw new Error("Error building mesh object")
}

module.exports = createMesh