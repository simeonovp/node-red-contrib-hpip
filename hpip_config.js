module.exports = function (RED) {
  'use strict'
  const fs = require('fs');
  const path = require('path');
  const request = require('request');
  const jp = require('jsonpath');
  const { config } = require('process');
  
  class HpDeviceConfigNode {
    constructor(config) {
      RED.nodes.createNode(this, config);
    }
  }

  // ======================= Register ======================= 

  RED.nodes.registerType('hpip-config', HpDeviceConfigNode);
}
