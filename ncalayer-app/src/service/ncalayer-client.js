((exports, WebSocket, window) => {
  class NCALayerError extends Error {
    constructor(message, canceledByUser) {
      super(message);
      this.name = "NCALayerError";
      this.canceledByUser = canceledByUser;
    }
  }

  class NCALayerClient {
    constructor(url = "wss://127.0.0.1:13579", allowKmdHttpApi = true) {
      this.url = url;
      this.wsConnection = null;
      this.responseProcessed = false;
      this.isKmd = false; //  KAZTOKEN/mobile/desktop
      this.isMultisignAvailable = false;
      this.allowKmdHttpApi = allowKmdHttpApi;
      this.kmdHttpApiUrl = "https://127.0.0.1:24680/";
      this.isKmdHttpApiAvailable = false;
      this.onRequestReady = null;
      this.onResponseReady = null;
    }

    async connect() {
      if (this.wsConnection) {
        throw new NCALayerError("Подключение уже выполнено.");
      }

      this.wsConnection = new WebSocket(this.url);

      return new Promise((resolve, reject) => {
        this.responseProcessed = false;
        this.setHandlers(resolve, reject);

        this.wsConnection.onmessage = async (msg) => {
          if (this.responseProcessed) {
            return;
          }
          this.responseProcessed = true;

          if (this.onResponseReady) {
            this.onResponseReady(msg.data);
          }

          const response = JSON.parse(msg.data);

          if (!response.result || !response.result.version) {
            reject(new NCALayerError("Ошибка взаимодействия с NCALayer."));
            return;
          }

          try {
            const request = {
              module: "kz.digiflow.mobile.extensions",
              method: "getVersion",
            };

            this.sendRequest(request);

            await new Promise((resolveInner, rejectInner) => {
              this.setHandlers(resolveInner, rejectInner);
            });
            this.isKmd = true;
            this.isMultisignAvailable = true;
          } catch (err) {}

          (async () => {
            try {
              const httpResponse = await fetch(this.kmdHttpApiUrl);

              if (httpResponse.ok) {
                this.isKmdHttpApiAvailable = true;
                this.isMultisignAvailable = true;
              }
            } catch (err) {}
          })();

          resolve(response.result.version);
        };
      });
    }

    static get basicsStorageAll() {
      return null;
    }

    static get basicsCMSParams() {
      return {};
    }

    static get basicsSignerAny() {
      return {
        extKeyUsageOids: [],
      };
    }

    async basicsSign(
      allowedStorages,
      format,
      data,
      signingParams,
      signerParams,
      locale
    ) {
      const request = {
        module: "kz.gov.pki.knca.basics",
        method: "sign",
        args: {
          allowedStorages,
          format,
          data,
          signingParams,
          signerParams,
          locale,
        },
      };

      this.sendRequest(request);

      return new Promise((resolve, reject) => {
        this.setHandlers(resolve, reject);
      });
    }

    async basicsSignCMS(
      allowedStorages,
      data,
      signingParams,
      signerParams,
      locale = "ru"
    ) {
      if (Array.isArray(data) && !this.isMultisignAvailable) {
        if (!this.isKmd) {
          throw new NCALayerError(
            "Функция мультиподписания доступна при использовании приложений KAZTOKEN mobile/desktop вместо NCALayer."
          );
        }

        throw new NCALayerError("Функция мультиподписания недоступна.");
      }

      if (this.allowKmdHttpApi && this.isKmdHttpApiAvailable) {
        try {
          const documents = Array.isArray(data) ? data : [data];
          const base64 = typeof documents[0] === "string";

          let response = await fetch(this.kmdHttpApiUrl, {
            method: "POST",
            mode: "cors",
            credentials: "include",
            body: JSON.stringify({
              numberOfDocuments: documents.length,
              base64,
              encapsulateContent: signingParams.encapsulate,
            }),
          });
          if (!response) {
            throw new NCALayerError(
              "Ошибка взаимодействия с KAZTOKEN mobile/desktop."
            );
          }
          if (!response.ok) {
            if (response.status === 409) {
              throw new NCALayerError("Операция отменена пользователем", true);
            }
            throw new NCALayerError(
              `KAZTOKEN mobile/desktop вернул ошибку '${response.status}: ${response.statusText}'`
            );
          }
          const operationId = await response.text();
          const signatures = [];
          // eslint-disable-next-line no-restricted-syntax
          for (const document of documents) {
            // eslint-disable-next-line no-await-in-loop
            response = await fetch(`${this.kmdHttpApiUrl}${operationId}`, {
              method: "POST",
              mode: "cors",
              credentials: "include",
              body: document,
            });

            if (!response) {
              throw new NCALayerError(
                "Ошибка взаимодействия с KAZTOKEN mobile/desktop."
              );
            }

            if (!response.ok) {
              if (response.status === 401) {
                throw new NCALayerError(
                  "Операция отменена пользователем",
                  true
                );
              }
              throw new NCALayerError(
                `KAZTOKEN mobile/desktop вернул ошибку '${response.status}: ${response.statusText}'`
              );
            }

            let signature = "";
            if (base64) {
              // eslint-disable-next-line no-await-in-loop
              signature = await response.text();
            } else {
              // eslint-disable-next-line no-await-in-loop
              const signatureBytes = await response.arrayBuffer();
              signature = NCALayerClient.arrayBufferToB64(signatureBytes);
            }

            signatures.push(signature);
          }

          return Array.isArray(data) ? signatures : signatures[0];
        } catch (err) {
          throw new NCALayerError(
            `Ошибка взаимодействия с KAZTOKEN mobile/desktop: ${err}`
          );
        }
      }

      return this.basicsSign(
        allowedStorages,
        "cms",
        await NCALayerClient.normalizeDataToSign(data),
        signingParams,
        signerParams,
        locale
      );
    }

    async basicsSignXML(
      allowedStorages,
      data,
      signingParams,
      signerParams,
      locale = "ru"
    ) {
      return this.basicsSign(
        allowedStorages,
        "xml",
        data,
        signingParams,
        signerParams,
        locale
      );
    }

    sendRequest(request) {
      if (!this.wsConnection) {
        throw new NCALayerError("Подключение к NCALayer не установлено.");
      }

      const jsonRequest = JSON.stringify(request);
      if (this.onRequestReady) {
        this.onRequestReady(jsonRequest);
      }

      this.wsConnection.send(jsonRequest);
    }

    setHandlers(resolve, reject) {
      this.responseProcessed = false;

      this.wsConnection.onerror = () => {
        if (this.responseProcessed) {
          return;
        }
        this.responseProcessed = true;

        reject(
          new NCALayerError(
            "Ошибка взаимодействия с NCALayer. В том случае, если на вашем компьютере не установлен NCALayer, пожалуйста установите его c портала НУЦ РК (https://ncl.pki.gov.kz/). Если же NCALayer установлен, но портал выдает ошибку, свяжитесь, пожалуйста, с нашей технической поддержкой."
          )
        );
      };

      this.wsConnection.onclose = () => {
        if (this.responseProcessed) {
          return;
        }
        this.responseProcessed = true;

        reject(new NCALayerError("NCALayer закрыл соединение."));
      };

      this.wsConnection.onmessage = (msg) => {
        if (this.responseProcessed) {
          return;
        }

        this.responseProcessed = true;

        if (this.onResponseReady) {
          this.onResponseReady(msg.data);
        }

        const response = JSON.parse(msg.data);

        if (response.hasOwnProperty("status")) {
          // eslint-disable-line no-prototype-builtins
          if (!response.status) {
            reject(
              new NCALayerError(
                `${response.code}: ${response.message} (${response.details})`
              )
            );
            return;
          }

          if (!response.body.hasOwnProperty("result")) {
            // eslint-disable-line no-prototype-builtins
            reject(new NCALayerError("cancelled by user", true));
            return;
          }

          resolve(response.body.result);
          return;
        }

        if (response.code !== "200") {
          reject(new NCALayerError(`${response.code}: ${response.message}`));
          return;
        }

        resolve(response.responseObject);
      };
    }

    static arrayBufferToB64(arrayBuffer) {
      let binary = "";
      const bytes = new Uint8Array(arrayBuffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i += 1) {
        binary += String.fromCharCode(bytes[i]);
      }
      return window.btoa(binary);
    }

    static async normalizeDataToSign(data) {
      const normalizeDataBlock = async (dataBlock) => {
        if (typeof dataBlock === "string") {
          return dataBlock;
        }

        let dataBlockArrayBuffer = dataBlock;
        if (dataBlock instanceof Blob) {
          dataBlockArrayBuffer = await dataBlock.arrayBuffer();
        }

        return NCALayerClient.arrayBufferToB64(dataBlockArrayBuffer);
      };

      if (Array.isArray(data)) {
        return Promise.all(data.map(normalizeDataBlock));
      }

      return normalizeDataBlock(data);
    }
  }

  exports.NCALayerClient = NCALayerClient;
})(
  typeof exports === "undefined" ? this : exports,
  typeof WebSocket === "undefined" ? require("ws") : WebSocket,
  typeof window === "undefined"
    ? {
        btoa(x) {
          return x;
        },
      }
    : window
);
