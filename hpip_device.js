module.exports = function (RED) {
  'use strict'
  const path = require('path');
  const fs = require('fs');
  //const request = require('request');
  const { throws } = require('assert');
  const { object } = require('assert-plus');
  const spawn = require('child_process').spawn;
  
  class HpDeviceNode {
    constructor(config, prefix) {
      RED.nodes.createNode(this, config);

      this.config = config;
      this.cfgNode = config.cfg && RED.nodes.getNode(config.cfg);
    }
  }

  RED.nodes.registerType('hpip-server', HpDeviceNode);
}
