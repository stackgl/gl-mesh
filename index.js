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


function MeshAttribute(name, buffer, size, type, normalized) {
  this.name = name
  this.buffer = buffer
  this.size = size
  this.type = type
  this.normalized = normalized
}


function getGLType(gl, array) {

}


function packAttributes(gl, numVertices, attributes) {
  var result = []
  for(var name in attributes) {
    var attr = attributes[name]
    var buffer, type, normalized
    if(attr.length) {
      if(attr.length !== numVertices) {
        throw new Error("Incorrect vertex count for attribute " + name)
      }
      if(typeof attr[0] === "number") {
        var gltype = getGLType(attr)
        if(gltype) {
          //Case: typed array
          type = gltype
          normalized = !(gltype === gl.BYTE || gltype === gl.UNSIGNED_BYTE)
          buffer = createBuffer(gl, attr)
        } else {
          //Case: native array of numbers
          var tmp_buf = pool.mallocFloat32(numVertices)
          for(var i=0; i<numVertices; ++i) {
            tmp_buf[i] = attr[i]
          }
          type = gl.FLOAT
          normalized = false
          buffer = createBuffer(gl, tmp_buf.subarray(0, numVertices))
          pool.freeUint32(tmp_buf)
        }
      } else if(attr[0].length) {
        //Case: native array of arrays
        var d = attr[0].length
        var ptr = 0
        var tmp_buf = pool.mallocFloat32(d * numVertices)
        for(var i=0; i<numVertices; ++i) {
          var vert = attr[i]
          for(var j=0; j<d; ++j) {
            tmp_buf[ptr++] = vert[j]
          }
        }
        type = gl.FLOAT
        normalized = false
        buffer = createBuffer(gl, tmp_buf.subarray(0, ptr))
        pool.freeFloat32(tmp_buf)
      }
    } else if(attr.shape) {
    
    } else {
      throw new Error("Invalid vertex attribute")
    }
  }
  return result
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
  var ext = webglew(gl).OES_vertex_array_object
  if(ext) {
    //Handle vertex array object initialization
    throw new Error("not implemented yet")
  } else {
    return new MeshNoVAO(gl, mode, numElements, elements, attributes)
  }
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