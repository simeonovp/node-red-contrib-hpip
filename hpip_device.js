module.exports = function (RED) {
  'use strict'
  
  class HpDeviceNode {
    constructor(config, prefix) {
      RED.nodes.createNode(this, config);

      this.config = config;
      this.cfgNode = config.cfg && RED.nodes.getNode(config.cfg);
      if (!this.cfgNode) return this.error(`cfgNode not defined, config.cfg:${config.cfg}`);

      this.on('close', this.onClose.bind(this));
      this.on('input', this.onInput.bind(this));
      this.onStatus(this.cfgNode.status);
      this.cfgNode.addListener('hpip_status', this.onStatus.bind(this));
    }

    onClose(done) {
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
        this.log(err.stack || err); 
        done(err.stack || err);
      }
    }

    onAction(msg) {
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
          const scanEvents = [
            'ScanAvailableEvent',  // WDPScan.xsd, Li.177
            'ScannerStatusSummaryEvent', // WDPScan.xsd, Li.208
            'ScannerStatusConditionClearedEvent', // WDPScan.xsd, Li.235
            'ScannerStatusConditionEvent' // WDPScan.xsd, Li.220, 193
          ];
          if (isNaN(msg.par1)) return done('par1 is not a number');
          const idx = parseInt(msg.par1);
          if ((idx < 0) || (idx > scanEvents.length)) return done(`par1 is out of range [0..${scanEvents.length}]`);
          return this.scanSubscribe(scanEvents[idx]);
        }
        case 'validateScanTicket':
        case 'createScanJob': {
          const inputSources = ['', 'Platen', 'ADF'];
          const jobInformations = ['Scanning in auto mode..', 'Scanning from platen..', 'Scanning from ADF..'];
          if (isNaN(msg.par1)) return done('par1 is not a number');
          const idx = parseInt(msg.par1);
          if ((idx < 0) || (idx > inputSources.length)) return done(`par1 is out of range [0..${inputSources.length}]`);
          const ticket = this._getScanTicket(inputSources[idx], jobInformations[idx]);
          if (msg.action === 'validateScanTicket') return this.validateScanTicket(ticket);
          return this.createScanJob(ticket);
        }
        case 'retrieveImageRequest':
          return this.retrieveImageRequest();
        default:
          throw 'Action ' + msg.topic + ' is not supported';
      }
    }


    onStatus(status) {
      this.log('-- onStatus: ' + status);
      switch(status) {
        case 'not listening':
          this.setStatus({fill: 'red', shape: 'ring', text: status});
          break;
        case 'listening':
          this.status({fill: 'green', shape: 'dot', text: status});
          break;
        case 'stopping':
          this.status({fill: 'yellow', shape: 'dot', text: status});
          break;
        default:
          this.status({fill: 'red', shape: 'dot', text: status});
      }
    }

    getXXX(){
      const devId = 'urn:uuid:16a65700-007c-1000-bb49-508140d0206b';
      const wsdl = '';
      const soapHeader = {
        To: devId,
        Action: 'http://schemas.xmlsoap.org/ws/2004/09/transfer/Get' + operation
      };
      const soapBody = {};
      return this.cfgNode.soapRequest({ wsdl, operation: 'Get', soapHeader, soapBody }, (res) => {
        this.log('-- getXXX');
        const resTemplate = { };
      });
    }
    // Pritnt
    printSubscribe() {
      const service = 'd9529a80-208a-4b89-9317-5881fec6b809';
      const address = `http://${this.cfgNode.ip}:${this.cfgNode.port}/${service}`;
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
      soapHeader = soapHeader || {
        To: this.cfgNode.scanEndpoint,
        Action: 'http://schemas.microsoft.com/windows/2006/08/wdp/scan/' + operation
      };
      const wsdl = this.cfgNode.scanWsdl;
      return this.cfgNode.soapRequest({ wsdl, operation, soapHeader, soapBody}, cb);
    }

    scanSubscribe(scanEvent) {
      const address = `http://${this.cfgNode.ip}:${this.cfgNode.port}/${scanEvent}`;
      const urn = 'urn:uuid:ea73374e-9162-43ab-ad98-d13381fb5457';
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
        ScanDestinations: [{
          ClientDisplayName: 'Scan to RPi',
          ClientContext: 'Scan'
        }]
      };
      // const req = {
      //   Subscribe: {
      //     EndTo: endpoint,
      //     Delivery: endpoint,
      //     Expires: 'PT1H',
      //     Filter: 'http://schemas.microsoft.com/windows/2006/08/wdp/scan/ScanAvailableEvent',
      //     ScanDestinations: [{
      //       ClientDisplayName: 'Scan to tati-lap',
      //       ClientContext: 'Scan'
      //     }, {
      //       ClientDisplayName: 'Scan for Print to tati-lap',
      //       ClientContext: 'ScanToPrint'
      //     }, {
      //       ClientDisplayName: 'Scan for E-mail to tati-lap',
      //       ClientContext: 'ScanToEmailv'
      //     }]
      //   }
      // };
      // const res = {
      //   SubscribeResponse: {
      //     SubscriptionManager: {
      //         Address: 'http://192.168.193.209:8018/wsd/print',
      //         ReferenceParameters: {
      //           Identifier: urn2
      //       }
      //     },
      //     Expires: 'PT1H',
      //     DestinationResponses: [{
      //       ClientContext: 'Scan',
      //       DestinationToken: 'Client_2297848483138'
      //     }, {
      //       ClientContext: 'ScanToPrint',
      //       DestinationToken: 'Client_5523260015893'
      //     }, {
      //       ClientContext: 'ScanToEmail',
      //       DestinationToken: 'Client_9164573940189'
      //     }, {
      //       ClientContext: 'ScanToFax',
      //       DestinationToken: 'Client_9691540273539'
      //     }, {
      //       ClientContext: 'ScanToOCR',
      //       DestinationToken: 'Client_9035465982348'
      //     }]
      //   }
      // };
      const soapHeader = {
        To: this.cfgNode.scanEndpoint,
        Action: 'http://schemas.xmlsoap.org/ws/2004/08/eventing/Subscribe' // operations = ['Subscribe', 'DeliveryModes/Push', '']
      };
      return this._scanSoapRequest('Subscribe', soapHeader, SubscribeRequest, (res) => {
        this.log('-- enter scanSubscribe callback');
        const resTemplate = {
          "SubscriptionManager": {
            "Address": "http://192.168.193.209:8018/wsd/scan",
            "ReferenceParameters": {
              "Identifier": "uuid:0121e81d-004f-1001-af4b-35303a38313a"
            }
          },
          "Expires": "PT1H"
        };
      });
    }

    getScannerDescription() {
      const GetScannerElementsRequest = {
        RequestedElements: {
          Name: 'sca:ScannerDescription'
        }
      };

      return this._scanSoapRequest('GetScannerElements', '', GetScannerElementsRequest, (res) => {
        this.log('-- enter getScannerDescription callback');
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
        this.log('-- enter getDefaultScanTicket callback');
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
        this.log('-- enter getScannerConfiguration callback');
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
        this.log('-- enter getScannerStatus callback');
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
        this.log('-- enter getScannerStatus callback');
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

    createScanJob(ticket) {
      const scanId = '583ea42a-8ab2-be4b-22b4-a7a46877aef5'; // from scan ScanAvailableEvent
      const CreateScanJobRequest = {
        ScanIdentifier: scanId,
        DestinationToken: 'Client_2297848483138',
        ScanTicket: ticket
      };

      // const res = {
      //   CreateScanJobResponse: {
      //     JobId: 42,
      //     JobToken: 'ScanJob1',
      //     ImageInformation: {
      //       MediaFrontImageInfo: {
      //         PixelsPerLine: 1700,
      //         NumberOfLines: 2346,
      //         BytesPerLine: 0
      //       }
      //     },
      //     DocumentFinalParameters: {
      //       Format: 'jfif</wscn:Format',
      //       CompressionQualityFactor: 0,
      //       ImagesToTransfer: 1,
      //       InputSource: 'Platen',
      //       ContentType: '',
      //       InputSize: {
      //         InputMediaSize: {
      //           Width: 8503,
      //           Height: 11732
      //         }
      //       },
      //       Exposure: {
      //         ExposureSettings: {
      //           Contrast: 0,
      //           Brightness: 0,
      //           Sharpness: 0
      //         }
      //       },
      //       Scaling: {
      //         ScalingWidth: 100,
      //         ScalingHeight: 100,
      //       },
      //       Rotation: 0,
      //       MediaSides: {
      //         MediaFront: {
      //           ScanRegion: {
      //             ScanRegionXOffset: 0,
      //             ScanRegionYOffset: 0,
      //             ScanRegionWidth: 8500,
      //             ScanRegionHeight: 11730
      //           },
      //           ColorProcessing: 'RGB24',
      //           Resolution: {
      //             Width: 200,
      //             Height: 200
      //           }
      //         }
      //       }
      //     }
      //   }
      // };
      return this._scanSoapRequest('CreateScanJob', '', CreateScanJobRequest, (res) => {
        this.log('-- enter getScannerStatus callback');
        const resTemplate = {
        };
      });
    }

    retrieveImageRequest() {
      const req = {
        RetrieveImageRequest: {
          JobId: 42,
          JobToken: ScanJob1,
          DocumentDescription: {
            DocumentName: 'Scanned image file for the WSD Scan Driver',
          }
        }
      };
      const res = {
      };
    }
  }

  RED.nodes.registerType('hpip-server', HpDeviceNode);
}
