module.exports = function (RED) {
  'use strict'
  const fs = require('fs');
  const path = require('path');
  
  class HpDeviceNode {
    constructor(config, prefix) {
      RED.nodes.createNode(this, config);

      this.config = config;
      this.cfgNode = config.cfg && RED.nodes.getNode(config.cfg);
      if (!this.cfgNode) return this.error(`cfgNode not defined, config.cfg:${config.cfg}`);

      this.docDir = config.docDir;
      if (this.docDir && !fs.existsSync(this.docDir)) {
        fs.mkdirSync(this.docDir, { recursive: true });
        this.log('Create folder for scanned documents ' + this.docDir);
      }

      this.name = config.name || 'Scan Server';

      this.destinationTokens = {};

      this.on('close', this.onClose.bind(this));
      this.on('input', this.onInput.bind(this));
      this.onStatus(this.cfgNode.status);
      this.cfgNode.addListener('hpip_status', this.onStatus.bind(this));
      this.cfgNode.addListener('hpip_event', this.onEvent.bind(this));
    }

    get scanEvents() { return  [
      'ScanAvailableEvent',  // WDPScan.xsd, Li.177
      'ScannerStatusSummaryEvent', // WDPScan.xsd, Li.208
      'ScannerStatusConditionClearedEvent', // WDPScan.xsd, Li.235
      'ScannerStatusConditionEvent', // WDPScan.xsd, Li.220, 193
      'ScannerElementsChangeEvent',
      'JobStatusEvent',
      'JobEndStateEventMsg'
    ]; }

    get jobInformations() { return ['Scanning in auto mode..', 'Scanning from platen..', 'Scanning from ADF..']; }

    onClose(done) {
      this.cfgNode.removeListener('hpip_event', this.onEvent.bind(this));
      this.cfgNode.removeListener('hpip_status', this.onStatus.bind(this));
      done();
    }

    onInput (msg, send, done) {
      try {
        if (msg.action) {
          return this.onActionAsync(msg)
            .then((res)=> { 
              this.log('-- Action done: ' + msg.action); 
              send(res);
              done();
            })
            .catch(err => {
              this.log(err.stack || err); 
              done(err);
            });
        }
        done();
      }
      catch(err) { 
        this.error('In onInput: ' + (err.stack || err)); 
        done(err.stack || err);
      }
    }

    onActionAsync(msg) {
      this.log('onAction: ' + msg.action);
      switch(msg.action) {
        case 'getScannerDescription': 
          return this.getScannerDescription();
        case 'getDefaultScanTicket':
          return this.getDefaultScanTicket();
        case 'getScannerConfiguration':
          return this.getScannerConfiguration();
        case 'getScannerStatus':
          return this.getScannerStatus();
        case 'scanSubscribe': {
          if (isNaN(msg.par1)) return done('par1 is not a number');
          const idx = parseInt(msg.par1);
          if ((idx < 0) || (idx > this.scanEvents.length)) return done(`par1 is out of range [0..${this.scanEvents.length}]`);
          return this.scanSubscribe(this.scanEvents[idx]);
        }
        case 'scanSubscribeAll': {
          //TODO
        }
        case 'validateScanTicket':
        case 'createScanJob': {
          const inputSources = ['', 'Platen', 'ADF'];
          if (isNaN(msg.par1)) return done('par1 is not a number');
          const idx = parseInt(msg.par1);
          if ((idx < 0) || (idx > inputSources.length)) return done(`par1 is out of range [0..${inputSources.length}]`);
          const ticket = this._getScanTicket(inputSources[idx], this.jobInformations[idx]);
          if (msg.action === 'validateScanTicket') return this.validateScanTicket(ticket);
          return this.createScanJob(ticket, '', '');
        }
        case 'retrieveImageRequest':
          return this.retrieveImageRequest();
        default:
          throw 'Action ' + msg.topic + ' is not supported';
      }
    }

    onStatus(status) {
      switch(status) {
        case 'not listening':
          this.setStatus({fill: 'red', shape: 'ring', text: status});
          break;
        case 'listening':
          this.status({fill: 'green', shape: 'dot', text: status});
          this.initScanService();
          break;
        case 'stopping':
          this.status({fill: 'yellow', shape: 'dot', text: status});
          break;
        default:
          this.status({fill: 'red', shape: 'dot', text: status});
      }
    }

    onEvent(event, data) {
      switch(event) {
        case 'ScanAvailableEvent': return this.onScanAvailableEvent(data);
        case 'ScannerStatusSummaryEvent':
          break;
        case 'ScannerStatusConditionClearedEvent':
          break;
        case 'ScannerStatusConditionEvent':
          break;
      }
      //TODO
    }

    initScanService() {
      if (this.docDir) {
        this.scanSubscribe('ScanAvailableEvent');
      }
    }

    // IPDevice
    getXXX(){
      const devId = 'urn:uuid:16a65700-007c-1000-bb49-508140d0206b'; //???
      const pars = {
        wsdl: '',
        operation: 'Get',
        soapHeader: {
          To: devId,
          Action: 'http://schemas.xmlsoap.org/ws/2004/09/transfer/Get'
        },
        soapBody: {},
        options: { 
          endpoint: this.cfgNode.deviceUrl + 'wsd', 
          forceSoap12Headers: true 
        }
      };
      return this.cfgNode.soapRequest(pars, (res) => {
        const resTemplate = { };
      });
    }

    // Print
    printSubscribe() {
      const service = 'd9529a80-208a-4b89-9317-5881fec6b809';
      const address = this.cfgNode.serviceUrl && (this.cfgNode.serviceUrl + service);
      const urn = 'urn:uuid:7e91ee16-95ad-49da-b410-7d44ba7a64af';
      const endpoint = {
        Address: address,
        ReferenceParameters: {
          Identifier: urn
        }
      };
      const req = {
        Subscribe: {
          EndTo: endpoint,
          Delivery: endpoint,
          Expires: 'PT1H',
          Filter: 'http://schemas.microsoft.com/windows/2006/08/wdp/print/PrinterElementsChangeEvent'
        }
      };
      const res = {
        SubscribeResponse: {
          SubscriptionManager: {
              Address: 'http://192.168.193.209:8018/wsd/print',
              ReferenceParameters: {
                Identifier: urn2
            }
          }
        }
      };
    }

    getPrinterDescription() {
      const req = {
        GetPrinterElementsRequest: {
          RequestedElements: {
            Name: 'pri:PrinterDescription'
          }
        }
      };
      const res = {
        GetPrinterElementsResponse: {
          PrinterElements: {
            ElementData: {
              PrinterDescription: {
                ColorSupported: true,
                DeviceId: 'MFG:HP;CMD:SPLC,URF,FAX,FWV,PIC,RDS,AMPV,PWGRaster,EXT,JPEG;PRN:4ZB97A;MDL:HP Color Laser MFP 178 179;CLS:PRINTER;CID:HPLJPCLMSV1;MODE:FAX3,SCN,SPL5,R000102;',
                MultipleDocumentJobsSupported: false,
                PagesPerMinute: 16,
                PagesPerMinuteColor: 4,
                PrinterName: 'HP508140D0206B(HP Color Laser MFP 178 179)',
                PrinterInfo: 'Administrator',
                PrinterLocation:''
              }
            }
          }
        }
      };
    }

    getPrinterStatus() {
      const req = {
        GetPrinterElementsRequest: {
          RequestedElements: {
            Name: 'pri:PrinterStatus'
          }
        }
      };
      const res = {
        GetPrinterElementsResponse: {
          PrinterElements: {
            ElementData: {
              PrinterStatus: {
                PrinterCurrentTime: '2008-04-09T21:55:45Z',
                PrinterState: 'Idle',
                PrinterPrimaryStateReason: 'None',
                PrinterStateReasons: ['None'],
                QueuedJobCount: 0
              }
            }
          }
        }
      };
    }

    getPrinterConfiguration() {
      const req = {
        GetPrinterElementsRequest: {
          RequestedElements: {
            Name: 'pri:PrinterConfiguration'
          }
        }
      };
      const res = {
        GetPrinterElementsResponse: {
          PrinterElements: {
            ElementData: {
              PrinterConfiguration: {
                PrinterEventRate: 5,
                Consumables: [{
                  Type: '',
                  Level
                }, {
                  Type: '',
                  Level
                }, {
                  Type: '',
                  Level
                }, {
                  Type: '',
                  Level
                }, {
                  Type: '',
                  Level
                }],
                InputBins: [{
                  FeedDirection: 'ShortEdgeFirst',
                  MediaSize: 'na_letter_8.5x11in',
                  Capacity: 150,
                  Level: -1
                }],
                Finishings: {
                  CollationSupported: true,
                  JogOffsetSupported: true,
                  DuplexerInstalled: false,
                  StaplerInstalled: true,
                  HolePunchInstalled: false
                },
                OutputBins: [{
                  Capacity: 50,
                  Level: -1
                }]
              }
            }
          }
        }
      };
    }

    setPrintEventRate(rate = 6) {
      const req = {
        SetEventRateRequest: {
          EventRate: rate
        }
      };
      const res = {
        SetEventRateResponse: undefined
      };
    }

    // Scan
    _scanSoapRequest(operation, soapHeader, soapBody, cb) {
      const endpoint = this.cfgNode.deviceUrl + 'wsd/scan';
      const pars = {
        wsdl: this.cfgNode.scanWsdl,
        operation,
        soapHeader: {
          To: endpoint,
          Action: 'http://schemas.microsoft.com/windows/2006/08/wdp/scan/' + operation,
          ...soapHeader
        },
        soapBody,
        options: { 
          endpoint, 
          // stream: true,
          parseReponseAttachments: true,
          forceSoap12Headers: true
        }
      };

      return this.cfgNode.soapRequest(pars, (res, attachments) => {
        this.send({ output: soapBody, input: res });
        if (cb) cb(res, attachments);
      });
    }

    scanSubscribe(scanEvent) {
      const address = this.cfgNode.serviceUrl && (this.cfgNode.serviceUrl + 'IPToolService');
      const urn = 'serv_' + Date.now().toString(); //'urn:uuid:ea73374e-9162-43ab-ad98-d13381fb5457';
      const endpoint = {
        Address: address,
        ReferenceParameters: {
          Identifier: urn
        }
      };

      // Body.Subscribe.Filter http://schemas.microsoft.com/windows/2006/08/wdp/scan/0 <-- http://schemas.microsoft.com/windows/2006/08/wdp/scan/ScannerStatusSummaryEvent
      // Body.Subscribe.ScanDestinations <-- 5 elements
      
      // Body.Subscribe.Filter http://schemas.microsoft.com/windows/2006/08/wdp/scan/0 <-- http://schemas.microsoft.com/windows/2006/08/wdp/scan/ScannerStatusConditionClearedEvent
      // Body.Subscribe.ScanDestinations <-- undefined
      
      // Body.Subscribe.Filter http://schemas.microsoft.com/windows/2006/08/wdp/scan/0 <-- http://schemas.microsoft.com/windows/2006/08/wdp/scan/ScannerStatusConditionEvent
      // Body.Subscribe.ScanDestinations <-- undefined
      
      // Body.Subscribe.Filter http://schemas.microsoft.com/windows/2006/08/wdp/scan/0 <-- http://schemas.microsoft.com/windows/2006/08/wdp/scan/ScannerElementsChangeEvent
      // Body.Subscribe.ScanDestinations <-- undefined
     
      const SubscribeRequest = {
        EndTo: endpoint,
        Delivery: {
          attributes: {
            Mode: 'http://schemas.xmlsoap.org/ws/2004/08/eventing/DeliveryModes/Push'
          },
          NotifyTo: endpoint
        },
        Expires: 'PT1H',
        Filter: {
          attributes: {
            Dialect: 'http://schemas.xmlsoap.org/ws/2006/02/devprof/Action'
          },
          $value: 'http://schemas.microsoft.com/windows/2006/08/wdp/scan/' + scanEvent
        },
        ScanDestinations: {
          ScanDestination: {
            ClientDisplayName: 'Scan to ' + this.name,
            ClientContext: 'Scan'
          }
        }
      };
      const soapHeader = {
        // To: this.cfgNode.scanEndpoint,
        Action: 'http://schemas.xmlsoap.org/ws/2004/08/eventing/Subscribe' // operations = ['Subscribe', 'DeliveryModes/Push', '']
      };
      this.destinationTokens = {};
      return this._scanSoapRequest('Subscribe', soapHeader, SubscribeRequest, (res) => {
        // this.log('-- enter scanSubscribe callback');
        // const resTemplate = {
        //   "SubscriptionManager": {
        //     "Address": "http://192.168.193.209:8018/wsd/scan",
        //     "ReferenceParameters": {
        //       "Identifier": "uuid:002bf4ca-00fc-100b-b51c-35303a38313a"
        //     }
        //   },
        //   "Expires": "PT1H",
        //   "DestinationResponses": {
        //     "DestinationResponse": {
        //       "ClientContext": "Scan",
        //       "DestinationToken": "Client_9428399574248"
        //     }
        //   }
        // };
        const destResp = res && res.DestinationResponses &&  res.DestinationResponses.DestinationResponse;
        if (destResp && destResp.ClientContext && destResp.DestinationToken) {
          const expires = (res.Expires === 'PT1H') & (Date.now() + (60 * 60 * 1000)) || 0;
          this.destinationTokens[destResp.ClientContext] = { 
            token: destResp.DestinationToken,
            expires //ISO 8601, (npm install iso8601-duration), (import { parse, end, toSeconds, pattern } from "iso8601-duration";), 
        };
          this.log(`Set destination for '${destResp.ClientContext}': ${JSON.stringify(this.destinationTokens[destResp.ClientContext])}`);
        }
      });
    }

    getScannerDescription() {
      const GetScannerElementsRequest = {
        RequestedElements: {
          Name: 'sca:ScannerDescription'
        }
      };

      return this._scanSoapRequest('GetScannerElements', '', GetScannerElementsRequest, (res) => {
        const resTemplate = {
          "ScannerElements": {
            "ElementData": [
              {
                "attributes": {
                  "Valid": "true",
                  "Name": "wscn:ScannerDescription"
                },
                "ScannerDescription": {
                  "ScannerName": [
                    "HP508140D0206B"
                  ],
                  "ScannerInfo": [
                    "Administrator"
                  ]
                }
              }
            ]
          }
        };
      });
    }

    getDefaultScanTicket() {
      const GetScannerElementsRequest = {
        RequestedElements: {
          Name: 'sca:DefaultScanTicket'
        }
      };
      return this._scanSoapRequest('GetScannerElements', '', GetScannerElementsRequest, (res) => {
        const resTemplate = {
          "ScannerElements": {
            "ElementData": [
              {
                "attributes": {
                  "Valid": "true",
                  "Name": "wscn:DefaultScanTicket"
                },
                "DefaultScanTicket": {
                  "JobDescription": {
                    "JobName": "DefaultJobName",
                    "JobOriginatingUserName": "DefaultOrigUserName",
                    "JobInformation": "DefaultJobInfo"
                  },
                  "DocumentParameters": {
                    "Format": "jfif",
                    "CompressionQualityFactor": "1",
                    "ImagesToTransfer": "1",
                    "InputSource": "Platen",
                    "FilmScanMode": "NotApplicable",
                    "ContentType": "Mixed",
                    "InputSize": {
                      "InputMediaSize": {
                        "Width": "0",
                        "Height": "0"
                      }
                    },
                    "Exposure": {
                      "ExposureSettings": {
                        "Contrast": "0",
                        "Brightness": "0",
                        "Sharpness": "0"
                      }
                    },
                    "Scaling": {
                      "ScalingWidth": "100",
                      "ScalingHeight": "100"
                    },
                    "Rotation": "0",
                    "MediaSides": {
                      "MediaFront": {
                        "ScanRegion": {
                          "ScanRegionXOffset": "0",
                          "ScanRegionYOffset": "0",
                          "ScanRegionWidth": "0",
                          "ScanRegionHeight": "0"
                        },
                        "ColorProcessing": "RGB24",
                        "Resolution": {
                          "Width": "200",
                          "Height": "200"
                        }
                      },
                      "MediaBack": {
                        "ScanRegion": {
                          "ScanRegionXOffset": "0",
                          "ScanRegionYOffset": "0",
                          "ScanRegionWidth": "0",
                          "ScanRegionHeight": "0"
                        },
                        "ColorProcessing": "RGB24",
                        "Resolution": {
                          "Width": "200",
                          "Height": "200"
                        }
                      }
                    }
                  }
                }
              }
            ]
          }
        };
      });
    }
    
    getScannerConfiguration() {
      const GetScannerElementsRequest = {
        ScannerElements: {
          RequestedElements: {
            Name: 'sca:ScannerConfiguration'
          }
        }
      };

      return this._scanSoapRequest('GetScannerElements', '', GetScannerElementsRequest, (res) => {
        const resTemplate = {
          "ScannerElements": {
            "ElementData": [
              {
                "attributes": {
                  "Valid": "true",
                  "Name": "wscn:ScannerConfiguration"
                },
                "ScannerConfiguration": {
                  "DeviceSettings": {
                    "FormatsSupported": {
                      "FormatValue": [
                        "jfif",
                        "tiff-single-uncompressed"
                      ]
                    },
                    "CompressionQualityFactorSupported": {
                      "MinValue": "0",
                      "MaxValue": "100"
                    },
                    "ContentTypesSupported": {
                      "ContentTypeValue": [
                        "Auto",
                        "Text",
                        "Photo",
                        "Mixed"
                      ]
                    },
                    "DocumentSizeAutoDetectSupported": false,
                    "AutoExposureSupported": false,
                    "BrightnessSupported": true,
                    "ContrastSupported": true,
                    "ScalingRangeSupported": {
                      "ScalingWidth": {
                        "MinValue": "25",
                        "MaxValue": "400"
                      },
                      "ScalingHeight": {
                        "MinValue": "25",
                        "MaxValue": "400"
                      }
                    },
                    "RotationsSupported": {
                      "RotationValue": [
                        "0",
                        "180"
                      ]
                    }
                  },
                  "Platen": {
                    "PlatenOpticalResolution": {
                      "Width": "300",
                      "Height": "300"
                    },
                    "PlatenResolutions": {
                      "Widths": {
                        "Width": [
                          "75",
                          "100",
                          "150",
                          "200",
                          "300"
                        ]
                      },
                      "Heights": {
                        "Height": [
                          "75",
                          "100",
                          "150",
                          "200",
                          "300"
                        ]
                      }
                    },
                    "PlatenColor": {
                      "ColorEntry": [
                        "BlackAndWhite1",
                        "Grayscale8",
                        "RGB24"
                      ]
                    },
                    "PlatenMinimumSize": {
                      "Width": "10",
                      "Height": "10"
                    },
                    "PlatenMaximumSize": {
                      "Width": "8503",
                      "Height": "11732"
                    }
                  },
                  "ADF": {
                    "ADFSupportsDuplex": false,
                    "ADFFront": {
                      "ADFOpticalResolution": {
                        "Width": "300",
                        "Height": "300"
                      },
                      "ADFResolutions": {
                        "Widths": {
                          "Width": [
                            "75",
                            "100",
                            "150",
                            "200",
                            "300"
                          ]
                        },
                        "Heights": {
                          "Height": [
                            "75",
                            "100",
                            "150",
                            "200",
                            "300"
                          ]
                        }
                      },
                      "ADFColor": {
                        "ColorEntry": [
                          "BlackAndWhite1",
                          "Grayscale8",
                          "RGB24"
                        ]
                      },
                      "ADFMinimumSize": {
                        "Width": "10",
                        "Height": "10"
                      },
                      "ADFMaximumSize": {
                        "Width": "8503",
                        "Height": "11732"
                      }
                    }
                  }
                }
              }
            ]
          }
        };
      });
    }

    getScannerStatus() {
      const GetScannerElementsRequest = {
        RequestedElements: {
          Name: 'sca:ScannerStatus'
        }
      };
      return this._scanSoapRequest('GetScannerElements', '', GetScannerElementsRequest, (res) => {
        const resTemplate = {
          "ScannerElements": {
            "ElementData": [
              {
                "attributes": {
                  "Valid": "true",
                  "Name": "wscn:ScannerStatus"
                },
                "ScannerStatus": {
                  "ScannerCurrentTime": "2008-10-12T14:10:00.000Z",
                  "ScannerState": "Idle",
                  "ActiveConditions": null
                }
              }
            ]
          }
        };
      });
    }

    _getScanTicket(inputSource, jobInformation) {
      const documentParameters = {
        Format: 'jfif',
        ImagesToTransfer: 1,
        InputSource: inputSource,
        InputSize: {
          InputMediaSize: {
            Width: 8503,
            Height: 11732
          }
        },
        Exposure: {
          ExposureSettings: {
            Contrast: 0,
            Brightness: 0
          }
        },
        Scaling: {
          ScalingWidth: 100,
          ScalingHeight: 100
        },
        Rotation: 0,
        MediaSides: {
          MediaFront: {
            ScanRegion: {
              ScanRegionXOffset: 0,
              ScanRegionYOffset: 0,
              ScanRegionWidth: 8500,
              ScanRegionHeight: 11730
            },
            ColorProcessing: 'RGB24',
            Resolution: {
              Width: 200,
              Height: 200
            }
          }
        }
      };
      return {
        JobDescription: {
          JobName: 'Validating scan ticket for current WIA item properties',
          JobOriginatingUserName: 'WIA session run for TATI-LAP\\user on TATI-LAP',
          JobInformation: jobInformation
        },
        DocumentParameters: inputSource && documentParameters || { Format: 'jfif' }
      }
    }

    validateScanTicket(ticket) {
      const ValidateScanTicketRequest = {
        ScanTicket: ticket
      };
      return this._scanSoapRequest('ValidateScanTicket', '', ValidateScanTicketRequest, (res) => {
        const resTemplate = {
          "ValidationInfo": {
            "ValidTicket": true,
            "ImageInformation": {
              "MediaFrontImageInfo": {
                "PixelsPerLine": "1700",
                "NumberOfLines": "2346",
                "BytesPerLine": "0"
              }
            }
          }
        };
      });
    }

    createScanJob(ticket, scanId, token) {
      const CreateScanJobRequest = {
        ScanIdentifier: scanId,
        DestinationToken: token,
        ScanTicket: ticket
      };

      return this._scanSoapRequest('CreateScanJob', '', CreateScanJobRequest, (res) => {
        const resTemplate = {
          "JobId": "49",
          "JobToken": "ScanJob1",
          "ImageInformation": {
            "MediaFrontImageInfo": {
              "PixelsPerLine": "1700",
              "NumberOfLines": "2346",
              "BytesPerLine": "0"
            }
          },
          "DocumentFinalParameters": {
            "Format": "jfif",
            "CompressionQualityFactor": "0",
            "ImagesToTransfer": "1",
            "InputSource": "Platen",
            "ContentType": null,
            "InputSize": {
              "InputMediaSize": {
                "Width": "8503",
                "Height": "11732"
              }
            },
            "Exposure": {
              "ExposureSettings": {
                "Contrast": "0",
                "Brightness": "0",
                "Sharpness": "0"
              }
            },
            "Scaling": {
              "ScalingWidth": "100",
              "ScalingHeight": "100"
            },
            "Rotation": "0",
            "MediaSides": {
              "MediaFront": {
                "ScanRegion": {
                  "ScanRegionXOffset": "0",
                  "ScanRegionYOffset": "0",
                  "ScanRegionWidth": "8500",
                  "ScanRegionHeight": "11730"
                },
                "ColorProcessing": "RGB24",
                "Resolution": {
                  "Width": "200",
                  "Height": "200"
                }
              }
            }
          }
        };
      });
    }
  
    retrieveImageRequest(job) {
      const RetrieveImageRequest = {
        JobId: '',
        JobToken: '',
        DocumentDescription: {
          DocumentName: 'Scanned document for the ' + this.name,
        },
        ...job
      };
      return this._scanSoapRequest('RetrieveImage', '', RetrieveImageRequest, (res, att) => {
        if (att && att.parts && Array.isArray(att.parts) && att.parts.length) {
          //keys:body,headers
          const headersRef = {
            "content-type": "application/binary",
            "content-id": "<1c696bd7-005a-48d9-9ee9-9adca11f8892@uuid>",
            "content-transfer-encoding": "binary"
          }
          
          if (att.parts[0].body) {
            const img = att.parts[0].body;
            //this.log(`-- img.length:${img.length}`);
            const ts = new Date().toISOString().split(/\-|\:/).join('').replace("T", "_").substring(2, 15);
            const docPath = path.join(this.cfgNode.cachePath, ts + '.jpg');
            fs.createWriteStream(docPath).write(img, err => {
              if (err) return this.error(`Save image failed:` + err);
              this.log(`-- imgage saved to ${docPath}`);
              this.flushCache(this.cfgNode.cachePath);
            });
          }
        }

        const resTemplate = {
          "ScanData": { 
            "Include": { 
              "attributes": { 
                "href": "cid:1c696bd7-005a-48d9-9ee9-9adca11f8892@uuid"
              }
            }
          }
        };
      });
    }

    flushCache(cache) {
      if (!this.docDir || !fs.existsSync(this.docDir)) return;
      fs.readdir(cache, (err, files) => {
        if (err) return this.error('Could not list the cache, ' + err);
      
        files.forEach((file, index) => {
          const fromPath = path.join(cache, file);
          const toPath = path.join(this.docDir, file);
      
          fs.stat(fromPath, (error, stat) => {
            if (error) return this.error('Error get file state, ' + error);
            if (stat.isDirectory()) return this.log(`"${fromPath}" is a directory.'`);
      
            if (fs.existsSync(toPath)) return this.warn(`Target file "${toPath}" already exists`);
            fs.rename(fromPath, toPath, (error) => {
              if (error) return this.error('File moving error, ' + error);
              this.log(`Moved file "${fromPath}" to "${toPath}"`);
            });
          });
        });
      });
    }

    onScanAvailableEvent(data) {
      // data = {
      //   ClientContext: 'Scan',
      //   ScanIdentifier: '583ea42a-8ab2-be4b-22b4-a7a46877aef5',
      //   InputSource: 'Platen'
      // };
      if (!data) return this.error(`ScanAvailableEvent contains no data '${data}'`);
      if (!data.InputSource) return  this.error(`Missing 'InputSource' in ScanAvailableEvent data, ${JSON.stringify(data)}`);
      if (!data.ScanIdentifier) return  this.error(`Missing 'ScanIdentifier' in ScanAvailableEvent data, ${JSON.stringify(data)}`);
      if (!data.ClientContext) return  this.error(`Missing 'ClientContext' in ScanAvailableEvent data, ${JSON.stringify(data)}`);
      const token = this.destinationTokens[data.ClientContext];
      if (!token) return this.error(`No DestinationToken token for ClientContext '${data.ClientContext}' found`);
      
      //TODO use this.jobInformations
      const ticket = this._getScanTicket(data.InputSource, data.InputSource && `Scanning from ${data.InputSource}..` || 'Scanning in auto mode..');
      
      this.validateScanTicket(ticket)
        .then((data) => {
          if (!data) return this.error(`ValidateScanTicket response contains no data '${data}'`);
          if (!data.ValidationInfo) return  this.error(`Missing 'ValidationInfo' in ValidateScanTicket response, ${JSON.stringify(data)}`);
          if (!data.ValidationInfo.ValidTicket) return  this.error(`Invalid ticket in ValidateScanTicket response, ${JSON.stringify(data)}`);
          return this.createScanJob(ticket, data.ScanIdentifier, token);
        })
        .then((data) => {
          if (!data) return this.error(`CreateScanJob response contains no data '${data}'`);
          if (!data.JobId) return  this.error(`Missing 'JobId' in CreateScanJob response, ${JSON.stringify(data)}`);
          if (!data.JobToken) return  this.error(`Missing 'JobToken' in CreateScanJob response, ${JSON.stringify(data)}`);
          return this.retrieveImageRequest({ JobId: data.JobId, JobToken: data.JobToken });
        })
        .catch(err => {
          this.log(err.stack || err); 
        });
    }
  }

  RED.nodes.registerType('hpip-server', HpDeviceNode);
}
