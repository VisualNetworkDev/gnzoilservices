(function () {
  "use strict";

  if (window.google && window.google.script && window.google.script.run) {
    return;
  }

  var endpoint = window.GNZ_APPS_SCRIPT_ENDPOINT;
  if (!endpoint || /REPLACE_WITH_/.test(endpoint)) {
    window.google = window.google || {};
    window.google.script = window.google.script || {};
    window.google.script.run = createRunner(null, null, function missingEndpoint(fn) {
      return Promise.reject(new Error("Apps Script endpoint is not configured for " + fn + "."));
    });
    return;
  }

  var pending = Object.create(null);
  var counter = 0;
  var timeoutMs = Number(window.GNZ_APPS_SCRIPT_TIMEOUT_MS || 45000);
  var jsonpMethods = {
    obtenerVehiculos: true,
    obtenerMotoresDisponibles: true,
    obtenerAceitesCompatibles: true,
    obtenerDescuentosPublicos: true,
    calcularPrecio: true,
    adminObtenerVehiculos: true,
    adminObtenerCatalogo: true,
    adminObtenerMotoresDisponibles: true,
    adminObtenerAceitesCompatibles: true,
    adminCalcularPrecio: true,
    adminListarReservas: true
  };

  window.addEventListener("message", function (event) {
    var data = event.data || {};
    if (!data || data.source !== "gnz-apps-script-bridge" || !data.requestId) {
      return;
    }

    var request = pending[data.requestId];
    if (!request) return;

    cleanup(data.requestId);

    if (data.ok) {
      request.resolve(data.result);
    } else {
      request.reject(new Error(data.error || "Apps Script request failed."));
    }
  });

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = createRunner(null, null, sendRequest);

  function createRunner(successHandler, failureHandler, transport) {
    return new Proxy({}, {
      get: function (_target, property) {
        if (property === "withSuccessHandler") {
          return function (handler) {
            return createRunner(handler, failureHandler, transport);
          };
        }

        if (property === "withFailureHandler") {
          return function (handler) {
            return createRunner(successHandler, handler, transport);
          };
        }

        if (property === "withUserObject") {
          return function () {
            return createRunner(successHandler, failureHandler, transport);
          };
        }

        return function () {
          var fn = String(property);
          var args = Array.prototype.slice.call(arguments);
          transport(fn, args)
            .then(function (result) {
              if (typeof successHandler === "function") successHandler(result);
            })
            .catch(function (error) {
              if (typeof failureHandler === "function") {
                failureHandler(error);
              } else {
                console.error(error);
              }
            });
        };
      }
    });
  }

  function sendRequest(fn, args) {
    if (jsonpMethods[fn]) {
      return sendJsonpFetchRequest(fn, args)
        .catch(function () {
          return sendJsonpRequest(fn, args);
        })
        .catch(function (jsonpError) {
          return sendPostRequest(fn, args)
            .catch(function () {
              throw jsonpError;
            });
        });
    }

    return sendPostRequest(fn, args);
  }

  function sendPostRequest(fn, args) {
    return new Promise(function (resolve, reject) {
      var requestId = "gnz_" + Date.now() + "_" + (++counter);
      var iframeName = requestId + "_frame";
      var iframe = document.createElement("iframe");
      var form = document.createElement("form");

      iframe.name = iframeName;
      iframe.style.display = "none";
      iframe.setAttribute("aria-hidden", "true");

      form.method = "POST";
      form.action = endpoint;
      form.target = iframeName;
      form.style.display = "none";

      addField(form, "api", "1");
      addField(form, "transport", "postMessage");
      addField(form, "requestId", requestId);
      addField(form, "fn", fn);
      addField(form, "args", JSON.stringify(args || []));

      pending[requestId] = {
        resolve: resolve,
        reject: reject,
        iframe: iframe,
        form: form,
        pollTimer: null,
        timer: window.setTimeout(function () {
          cleanup(requestId);
          reject(new Error("Apps Script request timed out."));
        }, timeoutMs)
      };

      document.body.appendChild(iframe);
      document.body.appendChild(form);
      form.submit();
      pollPostResult(requestId);
    });
  }

  function sendJsonpFetchRequest(fn, args) {
    if (!window.fetch) {
      return Promise.reject(new Error("Fetch transport is not available."));
    }

    return new Promise(function (resolve, reject) {
      var requestId = "gnz_" + Date.now() + "_" + (++counter);
      var callbackName = "__gnzBridgeFetch_" + requestId.replace(/[^a-zA-Z0-9_]/g, "_");
      var query = [
        "api=1",
        "jsonp=1",
        "requestId=" + encodeURIComponent(requestId),
        "fn=" + encodeURIComponent(fn),
        "args=" + encodeURIComponent(JSON.stringify(args || [])),
        "callback=" + encodeURIComponent(callbackName)
      ].join("&");
      var controller = window.AbortController ? new AbortController() : null;
      var completed = false;
      var timer = window.setTimeout(function () {
        completed = true;
        if (controller) controller.abort();
        reject(new Error("Apps Script request timed out."));
      }, timeoutMs);

      fetch(endpoint + (endpoint.indexOf("?") === -1 ? "?" : "&") + query, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        signal: controller ? controller.signal : undefined
      })
        .then(function (response) {
          if (!response.ok) {
            throw new Error("Apps Script request failed with status " + response.status + ".");
          }
          return response.text();
        })
        .then(function (text) {
          if (completed) return;
          completed = true;
          window.clearTimeout(timer);
          handleJsonpPayload(parseJsonpPayload(text, callbackName), resolve, reject);
        })
        .catch(function (error) {
          if (completed) return;
          completed = true;
          window.clearTimeout(timer);
          reject(error);
        });
    });
  }

  function sendJsonpRequest(fn, args) {
    return new Promise(function (resolve, reject) {
      var requestId = "gnz_" + Date.now() + "_" + (++counter);
      var callbackName = "__gnzBridgeJsonp_" + requestId.replace(/[^a-zA-Z0-9_]/g, "_");
      var script = document.createElement("script");
      var query = [
        "api=1",
        "jsonp=1",
        "requestId=" + encodeURIComponent(requestId),
        "fn=" + encodeURIComponent(fn),
        "args=" + encodeURIComponent(JSON.stringify(args || [])),
        "callback=" + encodeURIComponent(callbackName)
      ].join("&");

      window[callbackName] = function (data) {
        cleanupJsonp(callbackName, script, timer);
        handleJsonpPayload(data, resolve, reject);
      };

      var timer = window.setTimeout(function () {
        cleanupJsonp(callbackName, script, null);
        reject(new Error("Apps Script request timed out."));
      }, timeoutMs);

      script.onerror = function () {
        cleanupJsonp(callbackName, script, timer);
        reject(new Error("Apps Script JSONP request failed."));
      };

      script.src = endpoint + (endpoint.indexOf("?") === -1 ? "?" : "&") + query;
      document.body.appendChild(script);
    });
  }

  function parseJsonpPayload(text, callbackName) {
    var source = String(text || "").trim();
    var prefix = callbackName + "(";
    if (source.indexOf(prefix) !== 0 || source.slice(-2) !== ");") {
      throw new Error("Invalid Apps Script response.");
    }

    return JSON.parse(source.slice(prefix.length, -2));
  }

  function handleJsonpPayload(data, resolve, reject) {
    if (data && data.ok) {
      resolve(data.result);
    } else {
      reject(new Error((data && data.error) || "Apps Script request failed."));
    }
  }

  function pollPostResult(requestId) {
    var request = pending[requestId];
    if (!request) return;

    var callbackName = "__gnzBridgePost_" + requestId.replace(/[^a-zA-Z0-9_]/g, "_");
    var script = document.createElement("script");
    var query = [
      "api=1",
      "bridgeResult=1",
      "requestId=" + encodeURIComponent(requestId),
      "callback=" + encodeURIComponent(callbackName)
    ].join("&");

    window[callbackName] = function (data) {
      cleanupJsonp(callbackName, script, null);

      if (!pending[requestId]) return;

      if (data && data.pending) {
        request.pollTimer = window.setTimeout(function () {
          pollPostResult(requestId);
        }, 700);
        return;
      }

      cleanup(requestId);
      if (data && data.ok) {
        request.resolve(data.result);
      } else {
        request.reject(new Error((data && data.error) || "Apps Script request failed."));
      }
    };

    script.onerror = function () {
      cleanupJsonp(callbackName, script, null);
      if (!pending[requestId]) return;
      request.pollTimer = window.setTimeout(function () {
        pollPostResult(requestId);
      }, 1000);
    };

    script.src = endpoint + (endpoint.indexOf("?") === -1 ? "?" : "&") + query;
    document.body.appendChild(script);
  }

  function addField(form, name, value) {
    var input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value == null ? "" : String(value);
    form.appendChild(input);
  }

  function cleanup(requestId) {
    var request = pending[requestId];
    if (!request) return;

    window.clearTimeout(request.timer);
    if (request.pollTimer) window.clearTimeout(request.pollTimer);
    if (request.form && request.form.parentNode) request.form.parentNode.removeChild(request.form);
    if (request.iframe && request.iframe.parentNode) request.iframe.parentNode.removeChild(request.iframe);
    delete pending[requestId];
  }

  function cleanupJsonp(callbackName, script, timer) {
    if (timer) window.clearTimeout(timer);
    try {
      delete window[callbackName];
    } catch (err) {
      window[callbackName] = undefined;
    }
    if (script && script.parentNode) script.parentNode.removeChild(script);
  }
})();
