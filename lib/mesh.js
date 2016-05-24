"use strict"

function Mesh(gl, mode, numElements, vao, elements, attributes, attributeNames) {
  this.gl = gl
  this.mode = mode
  this.numElements = numElements
  this.vao = vao
  this.elements = elements
  this.attributes = attributes
  this.attributeNames = attributeNames
}

Mesh.prototype.bind = function(shader) {
  this.vao.bind()
  var attributeNames = this.attributeNames
  var nattribs = attributeNames.length
  for(var i=0; i<nattribs; ++i) {
    var sattrib = shader.attributes[attributeNames[i]]
    if(sattrib) {
      sattrib.location = i
    }
  }
}

Mesh.prototype.unbind = function() {
  this.vao.unbind()
}

Mesh.prototype.dispose = function() {
  this.vao.dispose()
  if(this.elements) {
    this.elements.dispose()
  }
  var attributes = this.attributes
  var n = attributes.length
  for(var i=0; i<n; ++i) {
    var attrib = attributes[i]
    if(attrib.buffer) {
      attrib.buffer.dispose()
    }
  }  
}

Mesh.prototype.draw = function() {
  if (this.numElements === 0) return;
  if(this.elements) {
    this.elements.draw(this.mode, this.numElements)
  } else {
    this.gl.drawArrays(this.mode, 0, this.numElements)
  }
}

module.exports = Mesh