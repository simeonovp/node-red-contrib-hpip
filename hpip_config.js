module.exports = function (RED) {
  'use strict'
  const fs = require('fs');
  const path = require('path');
  const soap = require('soap');
  const http = require('http');

//scan client keys:
//_events,_eventsCount,_maxListeners,wsdl,streamAllowed,returnSaxStream,normalizeNames,overridePromiseSuffix,
//CreateScanJob,CreateScanJobAsync,
//RetrieveImage,RetrieveImageAsync,
//CancelJob,CancelJobAsync,
//ValidateScanTicket,ValidateScanTicketAsync,
//GetScannerElements,GetScannerElementsAsync,
//GetJobElements,GetJobElementsAsync,
//GetActiveJobs,GetActiveJobsAsync,
//GetJobHistory,GetJobHistoryAsync,
//ScanAvailableEvent,ScanAvailableEventAsync,
//ScannerElementsChangeEvent,ScannerElementsChangeEventAsync,
//ScannerStatusSummaryEvent,ScannerStatusSummaryEventAsync,
//ScannerStatusConditionEvent,ScannerStatusConditionEventAsync,
//ScannerStatusConditionClearedEvent,ScannerStatusConditionClearedEventAsync,
//JobStatusEvent,JobStatusEventAsync,
//JobEndStateEvent,JobEndStateEventAsync,
//ScannerService,
//httpClient
  
  class HpDeviceConfigNode {
    constructor(config) {
      RED.nodes.createNode(this, config);
  
      this.config = config;
      this.ip = config.ip;
      this.port = parseInt(config.port);
      if (isNaN(this.port)) {
        this.error('No port for soap server node!');
        this.setStatus('not listening');
        return this.error('Service port not configured');
      }
      this.devIp = '192.168.193.209'; //TODO
      this.devPort = 8018; //TODO
      this.scanEndpoint = `http://${this.devIp}:${this.devPort}/wsd/scan`;
      
      //---
      // const wsdlPath = config.wsdlPath || path.join(__dirname, 'schema', 'HPIP.wsdl');
      // const wsdl = config.wsdl || fs.existsSync(wsdlPath) && fs.readFileSync(wsdlPath, 'utf8') || '';
      // if (!wsdl) return this.error('Service dscription (WSDL) can\'t be loaded');

      this.printWsdl = config.printWsdl || path.join(__dirname, 'schema', 'PrintService', 'WSDPrinterService.wsdl'); 
      if (!this.printWsdl) return this.error('Printer service dscription (WSDL) can\'t be loaded');
      this.scanWsdl = config.scanWsdl || path.join(__dirname, 'schema', 'ScanService', 'WSDScannerService.wsdl'); 
      if (!this.scanWsdl) return this.error('Scanner service dscription (WSDL) can\'t be loaded');
      this.eventWsdl = config.eventWsdl || path.join(__dirname, 'schema', 'ScanService', 'event.wsdl'); 
      if (!this.eventWsdl) return this.error('Eventing service dscription (WSDL) can\'t be loaded');

      this.on('close', this.onClose.bind(this));

      const printerService = {
        PrinterService: {
          PrinterServiceBinding: {
            // handler function for an incoming SOAP request
            // <operation name="PrinterElementsChangeEvent">
            //     <wsoap12:operation
            //         soapAction="http://schemas.microsoft.com/windows/2006/08/wdp/print/PrinterElementsChangeEvent"
            //         soapActionRequired="true" />
            //     <output>
            //         <wsoap12:body use="literal" />
            //     </output>
            // </operation>
            PrinterElementsChangeEvent: function(args, soapResponseCallback) {
              const ElementChanges = args.ElementChanges;
              const PrinterConfiguration = ElementChanges && PrinterConfiguration;
              this.send({
                payload,
                soapResponseCallback
              });
            }
          }
        }
      }
  
      //???
      // const scanAvailableEvent = {
      //   ScanAvailableEvent: {
      //     ClientContext: 'Scan',
      //     ScanIdentifier: '583ea42a-8ab2-be4b-22b4-a7a46877aef5',
      //     InputSource: 'Platen'
      //   }
      // }
  
      this.status = '';
      this.scanServer;
      this.startScanServer();
      this.log('HPIP server crated');
    }

    startScanServer() {
      const path = 'scannerService'; //'/84e50873-9d2b-4d90-837c-31daeff8396f';
      const scannerService = {
      }
      //--this.scanServer = new HPIPServer(port, scanWsdl, scannerService);
      this.scanServer = http.createServer((request, response) => {
        this.log('-- HTTP server request');
        response.end('404: Not found: ' + request.url);
      });
  
      soap.listen(this.scanServer, path, scannerService, this.scanWsdl);
      
      // Start listening on the HTTP port.
      //++ this.scanServer.listen(this.port); // Error: listen EACCES: permission denied 0.0.0.0:5357
      this.setStatus('listening');
    }
  
    onClose(done) {
      this.setStatus('stopping');
      this.scanServer && this.scanServer.close(done) || done();
      this.removeAllListeners('hpip_status');
    }

    setStatus(status) {
      this.log('setStatus: ' + status);
      this.status = status;
      this.emit('hpip_status', status);
    }

    _messageId() {
      return Date.now().toString();
    }

    soapRequest({wsdl, operation, soapHeader, soapBody, options}, cb) {
      //createClient(url, options, callback);
      return new Promise((resolve, reject) => {
        options = options || { endpoint:this.scanEndpoint, forceSoap12Headers: true };
        soap.createClient(wsdl, options, (err, client) => {
          if (err) return reject(err);
          try {
            soapHeader = {
              To: '',
              Action: '',
              MessageID: this._messageId(),
              ReplyTo: { Address: 'http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous' },
              From: { Address: this.config.id },
              ...soapHeader
            };
            client.addSoapHeader(soapHeader, '', 'wsa');
            const service = client[operation];
            if (!service) return reject('service is ' + service + ' for operation ' + operation);
            service(soapBody, (err, res) => {
              if (err) {
                return reject(`SOAP client error on ${operation}: ${JSON.stringify(err.root || err, null, 2)}`);
              }
              this.log('-- SOAP response: ' + JSON.stringify(res, null, 2));
              cb(res);
              resolve(res);
            });
          } 
          catch (err) {
            this.log('client keys:' + Object.keys(client));
            reject(err);
          }
        });
      });
    }

  }

  // ======================= Register ======================= 

  RED.nodes.registerType('hpip-config', HpDeviceConfigNode);
}
