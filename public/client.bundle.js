// node_modules/agents/dist/utils.js
var INTERNAL_JS_STUB_PROPS = /* @__PURE__ */ new Set([
  "toJSON",
  "then",
  "catch",
  "finally",
  "valueOf",
  "toString",
  "constructor",
  "prototype",
  "$$typeof",
  "@@toStringTag",
  "asymmetricMatch",
  "nodeType"
]);
function isInternalJsStubProp(prop) {
  return typeof prop === "symbol" || INTERNAL_JS_STUB_PROPS.has(prop);
}
function camelCaseToKebabCase(str) {
  if (str === str.toUpperCase() && str !== str.toLowerCase()) return str.toLowerCase().replace(/_/g, "-");
  let kebabified = str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  kebabified = kebabified.startsWith("-") ? kebabified.slice(1) : kebabified;
  return kebabified.replace(/_/g, "-").replace(/-$/, "");
}

// node_modules/partysocket/dist/ws.js
if (!globalThis.EventTarget || !globalThis.Event)
  console.error(`
  PartySocket requires a global 'EventTarget' class to be available!
  You can polyfill this global by adding this to your code before any partysocket imports: 
  
  \`\`\`
  import 'partysocket/event-target-polyfill';
  \`\`\`
  Please file an issue at https://github.com/partykit/partykit if you're still having trouble.
`);
var ErrorEvent = class extends Event {
  message;
  error;
  constructor(error, target) {
    super("error", target);
    this.message = error.message;
    this.error = error;
  }
};
var CloseEvent = class extends Event {
  code;
  reason;
  wasClean = true;
  constructor(code = 1e3, reason = "", target) {
    super("close", target);
    this.code = code;
    this.reason = reason;
  }
};
var Events = {
  Event,
  ErrorEvent,
  CloseEvent
};
function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}
function cloneEventBrowser(e) {
  return new e.constructor(e.type, e);
}
function cloneEventNode(e) {
  if ("data" in e) return new MessageEvent(e.type, e);
  if ("code" in e || "reason" in e)
    return new CloseEvent(e.code || 1999, e.reason || "unknown reason", e);
  if ("error" in e) return new ErrorEvent(e.error, e);
  return new Event(e.type, e);
}
var isNode = typeof process !== "undefined" && typeof process.versions?.node !== "undefined";
var isReactNative = typeof navigator !== "undefined" && navigator.product === "ReactNative";
var cloneEvent = isNode || isReactNative ? cloneEventNode : cloneEventBrowser;
var DEFAULT = {
  maxReconnectionDelay: 1e4,
  minReconnectionDelay: 3e3,
  minUptime: 5e3,
  reconnectionDelayGrowFactor: 1.3,
  connectionTimeout: 4e3,
  maxRetries: Number.POSITIVE_INFINITY,
  maxEnqueuedMessages: Number.POSITIVE_INFINITY,
  startClosed: false,
  debug: false
};
var didWarnAboutMissingWebSocket = false;
function absorbError() {
}
var ReconnectingWebSocket = class ReconnectingWebSocket2 extends EventTarget {
  _ws;
  _retryCount = -1;
  _uptimeTimeout;
  _connectTimeout;
  _shouldReconnect = true;
  _connectLock = false;
  _binaryType = "blob";
  _closeCalled = false;
  _didWarnAboutClosedSend = false;
  _messageQueue = [];
  _debugLogger = console.log.bind(console);
  _url;
  _protocols;
  _options;
  constructor(url, protocols, options = {}) {
    super();
    this._url = url;
    this._protocols = protocols;
    this._options = options;
    if (this._options.startClosed) this._shouldReconnect = false;
    if (this._options.debugLogger)
      this._debugLogger = this._options.debugLogger;
    this._connect();
  }
  static get CONNECTING() {
    return 0;
  }
  static get OPEN() {
    return 1;
  }
  static get CLOSING() {
    return 2;
  }
  static get CLOSED() {
    return 3;
  }
  get CONNECTING() {
    return ReconnectingWebSocket2.CONNECTING;
  }
  get OPEN() {
    return ReconnectingWebSocket2.OPEN;
  }
  get CLOSING() {
    return ReconnectingWebSocket2.CLOSING;
  }
  get CLOSED() {
    return ReconnectingWebSocket2.CLOSED;
  }
  get binaryType() {
    return this._ws ? this._ws.binaryType : this._binaryType;
  }
  set binaryType(value) {
    this._binaryType = value;
    if (this._ws) this._ws.binaryType = value;
  }
  /**
   * Returns the number or connection retries
   */
  get retryCount() {
    return Math.max(this._retryCount, 0);
  }
  /**
   * The number of bytes of data that have been queued using calls to send() but not yet
   * transmitted to the network. This value resets to zero once all queued data has been sent.
   * This value does not reset to zero when the connection is closed; if you keep calling send(),
   * this will continue to climb. Read only
   */
  get bufferedAmount() {
    return this._messageQueue.reduce((acc, message) => {
      if (typeof message === "string") acc += message.length;
      else if (message instanceof Blob) acc += message.size;
      else acc += message.byteLength;
      return acc;
    }, 0) + (this._ws ? this._ws.bufferedAmount : 0);
  }
  /**
   * The extensions selected by the server. This is currently only the empty string or a list of
   * extensions as negotiated by the connection
   */
  get extensions() {
    return this._ws ? this._ws.extensions : "";
  }
  /**
   * A string indicating the name of the sub-protocol the server selected;
   * this will be one of the strings specified in the protocols parameter when creating the
   * WebSocket object
   */
  get protocol() {
    return this._ws ? this._ws.protocol : "";
  }
  /**
   * The current state of the connection; this is one of the Ready state constants
   */
  get readyState() {
    if (this._closeCalled) return ReconnectingWebSocket2.CLOSED;
    if (this._ws) return this._ws.readyState;
    return this._options.startClosed ? ReconnectingWebSocket2.CLOSED : ReconnectingWebSocket2.CONNECTING;
  }
  /**
   * The URL as resolved by the constructor
   */
  get url() {
    return this._ws ? this._ws.url : "";
  }
  /**
   * Whether the websocket object is now in reconnectable state
   */
  get shouldReconnect() {
    return this._shouldReconnect;
  }
  /**
   * An event listener to be called when the WebSocket connection's readyState changes to CLOSED
   */
  onclose = null;
  /**
   * An event listener to be called when an error occurs
   */
  onerror = null;
  /**
   * An event listener to be called when a message is received from the server
   */
  onmessage = null;
  /**
   * An event listener to be called when the WebSocket connection's readyState changes to OPEN;
   * this indicates that the connection is ready to send and receive data
   */
  onopen = null;
  /**
   * Closes the WebSocket connection or connection attempt, if any. If the connection is already
   * CLOSED or CLOSING, this method does nothing.
   *
   * The `close` event is dispatched synchronously (mirroring how
   * `reconnect()` dispatches its synthetic close). This guarantees
   * consumers observe a terminal event for every explicit close, even
   * if their listeners are detached right after this call — previously
   * the real (asynchronous) browser close event could fire after
   * listeners were removed and go unobserved entirely.
   */
  close(code = 1e3, reason) {
    this._closeCalled = true;
    this._shouldReconnect = false;
    this._clearTimeouts();
    if (!this._ws) {
      this._debug("close enqueued: no ws instance");
      return;
    }
    if (this._ws.readyState === this.CLOSED || this._ws.readyState === this.CLOSING) {
      this._debug("close: already closing or closed");
      return;
    }
    this._disconnect(code, reason);
  }
  /**
   * Closes the WebSocket connection or connection attempt and connects again.
   * Resets retry counter;
   */
  reconnect(code, reason) {
    this._shouldReconnect = true;
    this._closeCalled = false;
    this._didWarnAboutClosedSend = false;
    this._retryCount = -1;
    if (!this._ws || this._ws.readyState === this.CLOSED || this._ws.readyState === this.CLOSING)
      this._connect();
    else {
      this._disconnect(code, reason);
      this._connect();
    }
  }
  /**
   * Enqueue specified data to be transmitted to the server over the WebSocket connection.
   *
   * @returns `true` if the message was transmitted immediately over an open
   * connection; `false` if it was buffered (sent when the connection next
   * opens — the buffer is always flushed before the `open` event is
   * dispatched) or dropped because `maxEnqueuedMessages` was reached.
   */
  send(data) {
    if (this._ws && this._ws.readyState === this.OPEN) {
      this._debug("send", data);
      this._ws.send(data);
      return true;
    }
    if (this._closeCalled && !this._didWarnAboutClosedSend) {
      this._didWarnAboutClosedSend = true;
      console.warn(
        "ReconnectingWebSocket: send() was called after close(). The message has been buffered, but it will only be delivered if reconnect() is called on this socket. If this socket has been discarded, the message is lost \u2014 this usually means a stale socket reference is being used."
      );
    }
    const { maxEnqueuedMessages = DEFAULT.maxEnqueuedMessages } = this._options;
    if (this._messageQueue.length < maxEnqueuedMessages) {
      this._debug("enqueue", data);
      this._messageQueue.push(data);
    }
    return false;
  }
  /**
   * Removes and returns all messages that were passed to send() but never
   * transmitted (they were buffered while the connection wasn't open).
   *
   * Useful when a socket is being discarded and replaced (e.g. the React
   * hooks recreate the socket when connection options change): the
   * replacement socket can re-send these messages, instead of them being
   * silently lost with the old instance.
   */
  drainQueuedMessages() {
    const queue = this._messageQueue;
    this._messageQueue = [];
    return queue;
  }
  _debug(...args) {
    if (this._options.debug) this._debugLogger("RWS>", ...args);
  }
  _getNextDelay() {
    const {
      reconnectionDelayGrowFactor = DEFAULT.reconnectionDelayGrowFactor,
      minReconnectionDelay = DEFAULT.minReconnectionDelay,
      maxReconnectionDelay = DEFAULT.maxReconnectionDelay
    } = this._options;
    let delay = 0;
    if (this._retryCount > 0) {
      delay = minReconnectionDelay * reconnectionDelayGrowFactor ** (this._retryCount - 1);
      if (delay > maxReconnectionDelay) delay = maxReconnectionDelay;
    }
    this._debug("next delay", delay);
    return delay;
  }
  _wait() {
    return new Promise((resolve) => {
      setTimeout(resolve, this._getNextDelay());
    });
  }
  _getNextProtocols(protocolsProvider) {
    if (!protocolsProvider) return Promise.resolve(null);
    if (typeof protocolsProvider === "string" || Array.isArray(protocolsProvider))
      return Promise.resolve(protocolsProvider);
    if (typeof protocolsProvider === "function") {
      const protocols = protocolsProvider();
      if (!protocols) return Promise.resolve(null);
      if (typeof protocols === "string" || Array.isArray(protocols))
        return Promise.resolve(protocols);
      if (protocols.then) return protocols;
    }
    throw Error("Invalid protocols");
  }
  _getNextUrl(urlProvider) {
    if (typeof urlProvider === "string") return Promise.resolve(urlProvider);
    if (typeof urlProvider === "function") {
      const url = urlProvider();
      if (typeof url === "string") return Promise.resolve(url);
      if (url.then) return url;
    }
    throw Error("Invalid URL");
  }
  _connect() {
    if (this._connectLock || !this._shouldReconnect) return;
    this._connectLock = true;
    const {
      maxRetries = DEFAULT.maxRetries,
      connectionTimeout = DEFAULT.connectionTimeout
    } = this._options;
    if (this._retryCount >= maxRetries) {
      this._debug("max retries reached", this._retryCount, ">=", maxRetries);
      this._connectLock = false;
      return;
    }
    this._retryCount++;
    this._debug("connect", this._retryCount);
    this._removeListeners();
    this._wait().then(
      () => Promise.all([
        this._getNextUrl(this._url),
        this._getNextProtocols(this._protocols || null)
      ])
    ).then(([url, protocols]) => {
      if (this._closeCalled) {
        this._connectLock = false;
        return;
      }
      if (!this._options.WebSocket && typeof WebSocket === "undefined" && !didWarnAboutMissingWebSocket) {
        console.error(`\u203C\uFE0F No WebSocket implementation available. You should define options.WebSocket. 

For example, if you're using node.js, run \`npm install ws\`, and then in your code:

import PartySocket from 'partysocket';
import WS from 'ws';

const partysocket = new PartySocket({
  host: "127.0.0.1:1999",
  room: "test-room",
  WebSocket: WS
});

`);
        didWarnAboutMissingWebSocket = true;
      }
      const WS = this._options.WebSocket || WebSocket;
      this._debug("connect", {
        url,
        protocols
      });
      this._ws = protocols ? new WS(url, protocols) : new WS(url);
      this._ws.binaryType = this._binaryType;
      this._connectLock = false;
      this._addListeners();
      this._connectTimeout = setTimeout(
        () => this._handleTimeout(),
        connectionTimeout
      );
    }).catch((err) => {
      this._connectLock = false;
      this._handleError(new Events.ErrorEvent(Error(err.message), this));
    });
  }
  _handleTimeout() {
    this._debug("timeout event");
    this._handleError(new Events.ErrorEvent(Error("TIMEOUT"), this));
  }
  _disconnect(code = 1e3, reason) {
    this._clearTimeouts();
    if (!this._ws) return;
    this._removeListeners();
    try {
      if (this._ws.readyState === this.OPEN || this._ws.readyState === this.CONNECTING)
        this._ws.close(code, reason);
      this._handleClose(new Events.CloseEvent(code, reason, this));
    } catch (_error) {
    }
  }
  _acceptOpen() {
    this._debug("accept open");
    this._retryCount = 0;
  }
  _handleOpen = (event) => {
    this._debug("open event");
    const { minUptime = DEFAULT.minUptime } = this._options;
    clearTimeout(this._connectTimeout);
    this._uptimeTimeout = setTimeout(() => this._acceptOpen(), minUptime);
    assert(this._ws, "WebSocket is not defined");
    this._ws.binaryType = this._binaryType;
    this._messageQueue.forEach((message) => {
      this._ws?.send(message);
    });
    this._messageQueue = [];
    if (this.onopen) this.onopen(event);
    this.dispatchEvent(cloneEvent(event));
  };
  _handleMessage = (event) => {
    this._debug("message event");
    if (this.onmessage) this.onmessage(event);
    this.dispatchEvent(cloneEvent(event));
  };
  _handleError = (event) => {
    this._debug("error event", event.message);
    this._disconnect(void 0, event.message === "TIMEOUT" ? "timeout" : void 0);
    if (this.onerror) this.onerror(event);
    this._debug("exec error listeners");
    this.dispatchEvent(cloneEvent(event));
    this._connect();
  };
  _handleClose = (event) => {
    this._debug("close event");
    this._clearTimeouts();
    if (this._options.shouldReconnectOnClose && !this._options.shouldReconnectOnClose(event))
      this._shouldReconnect = false;
    if (this._shouldReconnect) this._connect();
    if (this.onclose) this.onclose(event);
    this.dispatchEvent(cloneEvent(event));
  };
  _removeListeners() {
    if (!this._ws) return;
    this._debug("removeListeners");
    this._ws.removeEventListener("open", this._handleOpen);
    this._ws.removeEventListener("close", this._handleClose);
    this._ws.removeEventListener("message", this._handleMessage);
    this._ws.removeEventListener("error", this._handleError);
    this._ws.addEventListener("error", absorbError);
  }
  _addListeners() {
    if (!this._ws) return;
    this._debug("addListeners");
    this._ws.addEventListener("open", this._handleOpen);
    this._ws.addEventListener("close", this._handleClose);
    this._ws.addEventListener("message", this._handleMessage);
    this._ws.addEventListener("error", this._handleError);
  }
  _clearTimeouts() {
    clearTimeout(this._connectTimeout);
    clearTimeout(this._uptimeTimeout);
  }
};

// node_modules/partysocket/dist/index.js
var valueIsNotNil = (keyValuePair) => keyValuePair[1] !== null && keyValuePair[1] !== void 0;
function generateUUID() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  let d = Date.now();
  let d2 = performance?.now && performance.now() * 1e3 || 0;
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    let r = Math.random() * 16;
    if (d > 0) {
      r = (d + r) % 16 | 0;
      d = Math.floor(d / 16);
    } else {
      r = (d2 + r) % 16 | 0;
      d2 = Math.floor(d2 / 16);
    }
    return (c === "x" ? r : r & 3 | 8).toString(16);
  });
}
function getPartyInfo(partySocketOptions, defaultProtocol, defaultParams = {}) {
  const {
    host: rawHost,
    path: rawPath,
    protocol: rawProtocol,
    room,
    party,
    basePath,
    prefix,
    query
  } = partySocketOptions;
  let host = rawHost.replace(/^(http|https|ws|wss):\/\//, "");
  if (host.endsWith("/")) host = host.slice(0, -1);
  if (rawPath?.startsWith("/"))
    throw new Error("path must not start with a slash");
  const name = party ?? "main";
  const path = rawPath ? `/${rawPath}` : "";
  const protocol = rawProtocol || (host.startsWith("localhost:") || host.startsWith("127.0.0.1:") || host.startsWith("192.168.") || host.startsWith("10.") || host.startsWith("172.") && host.split(".")[1] >= "16" && host.split(".")[1] <= "31" || host.startsWith("[::ffff:7f00:1]:") ? defaultProtocol : `${defaultProtocol}s`);
  const baseUrl = `${protocol}://${host}/${basePath || `${prefix || "parties"}/${name}/${room}`}${path}`;
  const makeUrl = (query2 = {}) => `${baseUrl}?${new URLSearchParams([...Object.entries(defaultParams), ...Object.entries(query2).filter(valueIsNotNil)])}`;
  const urlProvider = typeof query === "function" ? async () => makeUrl(await query()) : makeUrl(query);
  return {
    host,
    path,
    room,
    name,
    protocol,
    partyUrl: baseUrl,
    urlProvider
  };
}
var PartySocket = class extends ReconnectingWebSocket {
  _pk;
  _pkurl;
  name;
  room;
  host;
  path;
  basePath;
  constructor(partySocketOptions) {
    const wsOptions = getWSOptions(partySocketOptions);
    super(wsOptions.urlProvider, wsOptions.protocols, wsOptions.socketOptions);
    this.partySocketOptions = partySocketOptions;
    this.setWSProperties(wsOptions);
    if (!partySocketOptions.startClosed && !this.room && !this.basePath) {
      this.close();
      throw new Error(
        "Either room or basePath must be provided to connect. Use startClosed: true to create a socket and set them via updateProperties before calling reconnect()."
      );
    }
    if (!partySocketOptions.disableNameValidation) {
      if (partySocketOptions.party?.includes("/"))
        console.warn(
          `PartySocket: party name "${partySocketOptions.party}" contains forward slash which may cause routing issues. Consider using a name without forward slashes or set disableNameValidation: true to bypass this warning.`
        );
      if (partySocketOptions.room?.includes("/"))
        console.warn(
          `PartySocket: room name "${partySocketOptions.room}" contains forward slash which may cause routing issues. Consider using a name without forward slashes or set disableNameValidation: true to bypass this warning.`
        );
    }
  }
  updateProperties(partySocketOptions) {
    const wsOptions = getWSOptions({
      ...this.partySocketOptions,
      ...partySocketOptions,
      host: partySocketOptions.host ?? this.host,
      room: partySocketOptions.room ?? this.room,
      path: partySocketOptions.path ?? this.path,
      basePath: partySocketOptions.basePath ?? this.basePath
    });
    this._url = wsOptions.urlProvider;
    this._protocols = wsOptions.protocols;
    this._options = wsOptions.socketOptions;
    this.setWSProperties(wsOptions);
  }
  setWSProperties(wsOptions) {
    const { _pk, _pkurl, name, room, host, path, basePath } = wsOptions;
    this._pk = _pk;
    this._pkurl = _pkurl;
    this.name = name;
    this.room = room;
    this.host = host;
    this.path = path;
    this.basePath = basePath;
  }
  reconnect(code, reason) {
    if (!this.host)
      throw new Error(
        "The host must be set before connecting, use `updateProperties` method to set it or pass it to the constructor."
      );
    if (!this.room && !this.basePath)
      throw new Error(
        "The room (or basePath) must be set before connecting, use `updateProperties` method to set it or pass it to the constructor."
      );
    super.reconnect(code, reason);
  }
  get id() {
    return this._pk;
  }
  /**
   * Exposes the static PartyKit room URL without applying query parameters.
   * To access the currently connected WebSocket url, use PartySocket#url.
   */
  get roomUrl() {
    return this._pkurl;
  }
  static async fetch(options, init) {
    const party = getPartyInfo(options, "http");
    const url = typeof party.urlProvider === "string" ? party.urlProvider : await party.urlProvider();
    return (options.fetch ?? fetch)(url, init);
  }
};
function getWSOptions(partySocketOptions) {
  const {
    id,
    host: _host,
    path: _path,
    party: _party,
    room: _room,
    protocol: _protocol,
    query: _query,
    protocols,
    ...socketOptions
  } = partySocketOptions;
  const _pk = id || generateUUID();
  const party = getPartyInfo(partySocketOptions, "ws", { _pk });
  return {
    _pk,
    _pkurl: party.partyUrl,
    name: party.name,
    room: party.room,
    host: party.host,
    path: party.path,
    basePath: partySocketOptions.basePath,
    protocols,
    socketOptions,
    urlProvider: party.urlProvider
  };
}

// node_modules/agents/dist/client.js
var AgentConnectionError = class extends Error {
  constructor(event) {
    const reason = event.reason || `WebSocket closed with code ${event.code}`;
    super(`Agent connection closed: ${reason}`);
    this.name = "AgentConnectionError";
    this.code = event.code;
    this.reason = event.reason;
    this.wasClean = event.wasClean;
  }
};
function isTerminalCloseEvent(event) {
  return event.code === 1008 || event.code >= 4e3 && event.code <= 4999;
}
function createStubProxy(call) {
  return new Proxy({}, { get: (_target, method) => {
    if (isInternalJsStubProp(method)) return;
    return (...args) => call(method, args);
  } });
}
var AgentClient = class extends PartySocket {
  /**
  * @deprecated Use agentFetch instead
  */
  static fetch(_opts) {
    throw new Error("AgentClient.fetch is not implemented, use agentFetch instead");
  }
  /**
  * Promise that resolves when identity has been received from the server.
  * Useful for waiting before making calls that depend on knowing the instance.
  * Resets on connection close so it can be awaited again after reconnect.
  */
  get ready() {
    return this._readyPromise;
  }
  _resetReady() {
    this._readyPromise = new Promise((resolve) => {
      this._resolveReady = resolve;
    });
  }
  constructor(options) {
    const agentNamespace = camelCaseToKebabCase(options.agent);
    const shouldReconnectOnClose = options.shouldReconnectOnClose;
    const classifyReconnect = (event) => (shouldReconnectOnClose?.(event) ?? true) && !isTerminalCloseEvent(event);
    const socketOptions = options.basePath ? {
      basePath: options.basePath,
      path: options.path,
      ...options,
      shouldReconnectOnClose: classifyReconnect
    } : {
      party: agentNamespace,
      prefix: "agents",
      room: options.name || "default",
      path: options.path,
      ...options,
      shouldReconnectOnClose: classifyReconnect
    };
    super(socketOptions);
    this.state = void 0;
    this.identified = false;
    this.connectionError = null;
    this._pendingCalls = /* @__PURE__ */ new Map();
    this._previousName = null;
    this._previousAgent = null;
    this.agent = agentNamespace;
    this.name = options.name || "default";
    this.options = options;
    this._resetReady();
    this.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        let parsedMessage;
        try {
          parsedMessage = JSON.parse(event.data);
        } catch (_error) {
          return;
        }
        if (parsedMessage.type === "cf_agent_identity") {
          const oldName = this._previousName;
          const oldAgent = this._previousAgent;
          const newName = parsedMessage.name;
          const newAgent = parsedMessage.agent;
          this.identified = true;
          this._resolveReady();
          if (oldName !== null && oldAgent !== null && (oldName !== newName || oldAgent !== newAgent)) if (this.options.onIdentityChange) this.options.onIdentityChange(oldName, newName, oldAgent, newAgent);
          else {
            const agentChanged = oldAgent !== newAgent;
            const nameChanged = oldName !== newName;
            let changeDescription = "";
            if (agentChanged && nameChanged) changeDescription = `agent "${oldAgent}" \u2192 "${newAgent}", instance "${oldName}" \u2192 "${newName}"`;
            else if (agentChanged) changeDescription = `agent "${oldAgent}" \u2192 "${newAgent}"`;
            else changeDescription = `instance "${oldName}" \u2192 "${newName}"`;
            console.warn(`[agents] Identity changed on reconnect: ${changeDescription}. This can happen with server-side routing (e.g., basePath with getAgentByName) where the instance is determined by auth/session. Provide onIdentityChange callback to handle this explicitly, or ignore if this is expected for your routing pattern.`);
          }
          this._previousName = newName;
          this._previousAgent = newAgent;
          this.name = newName;
          this.agent = newAgent;
          this.options.onIdentity?.(newName, newAgent);
          return;
        }
        if (parsedMessage.type === "cf_agent_state") {
          this.state = parsedMessage.state;
          this.options.onStateUpdate?.(parsedMessage.state, "server");
          return;
        }
        if (parsedMessage.type === "cf_agent_state_error") {
          this.options.onStateUpdateError?.(parsedMessage.error);
          return;
        }
        if (parsedMessage.type === "rpc") {
          const response = parsedMessage;
          const pending = this._pendingCalls.get(response.id);
          if (!pending) {
            console.warn(`[AgentClient] Discarded an RPC response with no matching pending call (id "${response.id}"). The call likely timed out or was rejected when its connection closed before the response arrived.`);
            return;
          }
          if (!response.success) {
            pending.reject(new Error(response.error));
            this._pendingCalls.delete(response.id);
            pending.stream?.onError?.(response.error);
            return;
          }
          if ("done" in response) if (response.done) {
            pending.resolve(response.result);
            this._pendingCalls.delete(response.id);
            pending.stream?.onDone?.(response.result);
          } else pending.stream?.onChunk?.(response.result);
          else {
            pending.resolve(response.result);
            this._pendingCalls.delete(response.id);
          }
        }
      }
    });
    this.addEventListener("open", () => {
      this.connectionError = null;
      for (const pending of this._pendingCalls.values()) pending.transmitted = true;
    });
    this.addEventListener("close", (event) => {
      const terminalClose = isTerminalCloseEvent(event);
      this.identified = false;
      this._resetReady();
      if (this.shouldReconnect) this._rejectPendingCalls("Connection closed", { onlyTransmitted: true });
      else {
        this._rejectPendingCalls("Connection closed");
        if (terminalClose) {
          const error = new AgentConnectionError(event);
          this.connectionError = error;
          this.options.onConnectionError?.(error);
        }
      }
    });
    this.call = this._callImpl.bind(this);
    this.stub = createStubProxy((method, args) => this._callImpl(method, args));
  }
  /**
  * Reject pending RPC calls with the given reason.
  * With `onlyTransmitted`, calls still sitting in the send buffer are
  * kept pending (they'll be flushed on reconnect).
  */
  _rejectPendingCalls(reason, { onlyTransmitted = false } = {}) {
    const error = new Error(reason);
    for (const [id, pending] of this._pendingCalls) {
      if (onlyTransmitted && !pending.transmitted) continue;
      this._pendingCalls.delete(id);
      pending.reject(error);
      pending.stream?.onError?.(reason);
    }
  }
  setState(state) {
    this.send(JSON.stringify({
      state,
      type: "cf_agent_state"
    }));
    this.state = state;
    this.options.onStateUpdate?.(state, "client");
  }
  /**
  * Close the connection and immediately reject all pending RPC calls.
  * This provides immediate feedback on intentional close rather than
  * waiting for the WebSocket close handshake to complete.
  *
  * Note: Any calls made after `close()` will be rejected when the
  * underlying WebSocket close event fires.
  */
  close(code, reason) {
    this._rejectPendingCalls("Connection closed");
    super.close(code, reason);
  }
  /**
  * Call a method on the Agent.
  * When AgentT is provided, method names are inferred from the agent's methods.
  * Falls back to untyped string-based calls when AgentT is not provided.
  */
  async _callImpl(method, args = [], options) {
    if (this.connectionError && this.readyState === this.CLOSED) throw new Error("Connection closed");
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      let timeoutId;
      const isLegacyFormat = options && ("onChunk" in options || "onDone" in options || "onError" in options);
      const streamOptions = isLegacyFormat ? options : options?.stream;
      const timeout = isLegacyFormat ? void 0 : options?.timeout;
      const effectiveTimeout = timeout !== void 0 ? timeout : streamOptions ? void 0 : this.options.defaultCallTimeout ?? 3e4;
      if (effectiveTimeout) timeoutId = setTimeout(() => {
        const pending = this._pendingCalls.get(id);
        this._pendingCalls.delete(id);
        const errorMessage = `RPC call to ${method} timed out after ${effectiveTimeout}ms`;
        pending?.stream?.onError?.(errorMessage);
        reject(new Error(errorMessage));
      }, effectiveTimeout);
      this._pendingCalls.set(id, {
        reject: (e) => {
          if (timeoutId) clearTimeout(timeoutId);
          reject(e);
        },
        resolve: (value) => {
          if (timeoutId) clearTimeout(timeoutId);
          resolve(value);
        },
        stream: streamOptions,
        transmitted: this.readyState === this.OPEN
      });
      const request = {
        args,
        id,
        method,
        type: "rpc"
      };
      this.send(JSON.stringify(request));
    });
  }
};

// src/frontend/main.ts
var statusEl = document.getElementById("status");
var reportEl = document.getElementById("report");
var connEl = document.getElementById("conn");
var findingsInputEl = document.getElementById("findingsInput");
var chatLogEl = document.getElementById("chatLog");
var hasRestoredInput = false;
function render(state) {
  if (!state) return;
  statusEl.textContent = state.status;
  if (state.status === "error") {
    reportEl.textContent = `Error: ${state.errorMessage}`;
  } else if (state.report) {
    reportEl.textContent = state.report;
  } else {
    reportEl.textContent = "No report yet.";
  }
  if (!hasRestoredInput) {
    hasRestoredInput = true;
    if (state.cbomInput) {
      findingsInputEl.value = state.cbomInput;
    }
  }
}
var client;
try {
  client = new AgentClient({
    agent: "CryptoRiskAgent",
    name: "default-session",
    // fixed session id for this single-user scaffold
    host: window.location.host,
    // same origin — Worker serves both the UI and the WS route
    onStateUpdate: (state) => render(state),
    onConnectionError: (err) => {
      connEl.textContent = "connection error: " + err.message;
      connEl.style.color = "crimson";
    }
  });
  client.addEventListener("open", () => {
    connEl.textContent = "connected";
    connEl.style.color = "green";
  });
  client.addEventListener("error", (e) => {
    connEl.textContent = "socket error (see console)";
    connEl.style.color = "crimson";
    console.error("AgentClient socket error:", e);
  });
} catch (err) {
  connEl.textContent = "failed to create client: " + err.message;
  connEl.style.color = "crimson";
  console.error(err);
}
document.getElementById("submitFindings").addEventListener("click", async () => {
  if (!client) return;
  const cbomJson = findingsInputEl.value;
  try {
    await client.ready;
    const result = await client.call("ingestCBOM", [cbomJson]);
    if (result.warnings.length > 0) {
      console.warn("CBOM parse warnings:", result.warnings);
    }
    chatLogEl.replaceChildren();
  } catch (err) {
    reportEl.textContent = "Request failed: " + err.message;
    console.error(err);
  }
});
document.getElementById("sendChat").addEventListener("click", async () => {
  if (!client) return;
  const input = document.getElementById("chatInput");
  const question = input.value.trim();
  if (!question) return;
  const q = document.createElement("div");
  q.className = "msg-q";
  q.textContent = "Q: " + question;
  chatLogEl.appendChild(q);
  input.value = "";
  try {
    await client.ready;
    const answer = await client.call("askQuestion", [question]);
    const a = document.createElement("div");
    a.className = "msg-a";
    a.textContent = String(answer);
    chatLogEl.appendChild(a);
  } catch (err) {
    const a = document.createElement("div");
    a.className = "msg-a";
    a.style.color = "crimson";
    a.textContent = "Request failed: " + err.message;
    chatLogEl.appendChild(a);
    console.error(err);
  }
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
});
