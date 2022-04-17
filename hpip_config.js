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

//eventing client keys:
//_events,_eventsCount,_maxListeners,wsdl,streamAllowed,returnSaxStream,normalizeNames,overridePromiseSuffix,httpClient,soapHeaders

  class HpDeviceConfigNode {
    constructor(config) {
      RED.nodes.createNode(this, config);
  
      this.config = config;
      this.srvIp = config.srvIp;
      if (!this.srvIp) {
        //TODO recognise
        return this.error('Service ip not configured');
      }
      this.srvPort = config.srvPort && parseInt(config.srvPort) || 5357;
      this.devIp = config.devIp;
      if (!this.devIp) return this.error('Device ip not configured');
      this.devPort = config.devPort && parseInt(config.devPort) || 8018;
     
      this.printWsdl = config.printWsdl || path.join(__dirname, 'schema', 'PrintService', 'WSDPrinterService.wsdl'); 
      if (!this.printWsdl) return this.error('Printer service dscription (WSDL) can\'t be loaded');
      this.scanWsdl = config.scanWsdl || path.join(__dirname, 'schema', 'ScanService', 'WSDScannerService.wsdl'); 
      if (!this.scanWsdl) return this.error('Scanner service dscription (WSDL) can\'t be loaded');
      this.cacheWSDLs();

      this.on('close', this.onClose.bind(this));

      this.status = '';
      this.httpServer;
      this.startScanServer();
      this.log('HPIP server crated');
    }

    get serviceUrl() { return this.srvIp && this.srvPort && `http://${this.srvIp}:${this.srvPort}/` || ''; }
    get deviceUrl() { return `http://${this.devIp}:${this.devPort}/`; }

    cacheWSDLs() {
      //TODO cache WSDL objects and reuse in SOAP clients
      // const WSDL = soap.WSDL;
      // if (WSDL) {
      //   this.log('-- WSDL keys: ' + Object.keys(WSDL));
      //   const options = {};
      //   WSDL.open(this.scanWsdl, options, (err, wsdl) => {
      //     this.warn('ervice dscription (WSDL) loaded from ' + this.scanWsdl);
      //   });
      // }
    }

    startScanServer() {
      const path = '/IPToolService/'; //'/84e50873-9d2b-4d90-837c-31daeff8396f';
      this.httpServer = http.createServer();
      this.httpServer.listen(this.srvPort); // Error on Windows for ports lower then 10000: listen EACCES: permission denied 0.0.0.0:5357

      const ScanAvailableEvent = (args, methodCallback, headers, req) => { //methodCallback(error, result)
        this.log(`-- enter ScanAvailableEvent: ${JSON.stringify(args)}`); //sip--
        // args = {
        //   ClientContext: 'Scan',
        //   ScanIdentifier: '583ea42a-8ab2-be4b-22b4-a7a46877aef5',
        //   InputSource: 'Platen'
        // };
      };
      const ScannerStatusSummaryEvent = (args) => { };
      const ScannerStatusConditionClearedEvent = (args) => { };
      const ScannerStatusConditionEvent = (args) => { };

      // method = services[serviceName][portName][methodName];
      const services = {
        IPToolService: {
          IPToolPort: {
            ScanAvailableEvent,
            ScannerStatusSummaryEvent,
            ScannerStatusConditionClearedEvent,
            ScannerStatusConditionEvent
          }
        }
      }
  
      //Usage:
      //1. listen(server: ServerType, path: string, services: IServices, wsdl: string, callback?: (err: any, res: any) => void): Server;
      //2. listen(server: ServerType, options: IServerOptions): Server;
      fs.readFile(this.scanWsdl, 'utf8', (err, xml) => {
        if (err) return this.error(`Error on open WSDL in startScanServer: ${err}`);
        const options = { path, services, xml, uri: this.scanWsdl };
        const server = soap.listen(this.httpServer, options);
        server.log = console.log; //--
        this.setStatus('listening');
      });        
    }

    onClose(done) {
      this.setStatus('stopping');
      this.httpServer && this.httpServer.close(done) || done();
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
            //srvIp TODO
            client.on('request', (xml, eid)=>{
              this.log(`-- on request, xml: ${xml}, eid: ${eid}`);
            });
            // client.on('response', (body, response, eid)=>{});
            // client.on('message', (message, eid)=>{});
            // client.on('soapError', (error, eid)=>{});
            const service = client[operation];
            if (!service) {
              this.log('client keys:' + Object.keys(client));
              return reject('service is ' + service + ' for operation ' + operation);
            }
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
