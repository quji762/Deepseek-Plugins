/**
 * Host half of the code-typer bundle.
 *
 * Two sources feed the Client's terminal window:
 *
 * 1. LIVE — the process-local `agent/assistant-stream` event delivers
 *    `tool-call-delta` chunks while the model is still generating. This half
 *    accumulates a code-writing tool's raw JSON arguments and serves the
 *    partially-typed `content` / `new_string` / `input` value on a loopback
 *    route, so the window fills in as the model types rather than after the
 *    call commits.
 * 2. DURABLE — a session projection folds committed `tool/call` events, so a
 *    reload still shows the last write.
 *
 * Nothing here appends session events; both values are derived.
 */

/** Tool names whose arguments carry source code worth surfacing. */
const CODE_TOOLS = new Set(['write', 'edit', 'apply_patch']);

/** Documentation and plain-text extensions this window deliberately ignores. */
const DOC_EXTENSIONS = new Set(['md', 'markdown', 'mdx', 'txt', 'rst', 'adoc', 'org', 'textile']);

/** Whether a path names a documentation file rather than code. */
function isDocPath(path) {
  const match = /\.([a-z0-9]+)$/iu.exec(path);
  return match === null ? false : DOC_EXTENSIONS.has(match[1].toLowerCase());
}

/** JSON field per tool that holds the code being typed. */
const CODE_FIELD = { write: 'content', edit: 'new_string', apply_patch: 'input' };

/** Route the Client polls for the live draft. */
const LIVE_PATH = '/code-typer/live';

/** Cap on retained draft text, so one huge file cannot grow the payload unboundedly. */
const MAX_CODE = 48000;

/** Idle time after which an unchanged draft is reported as settled. */
const SETTLE_MS = 1200;

/** Permissive schema stand-in: the registry only calls `.parse`, and this plugin owns its JSON shape. */
const jsonSchema = { parse: (value) => value };

/**
 * Read one string field out of a possibly-incomplete JSON argument blob.
 * A truncated value ends at end-of-input, which is exactly what streaming needs.
 *
 * Only a real JSON key matches: the marker must be followed by `:` and preceded
 * (ignoring whitespace) by `{` or `,`. Without the second test, a `file_path`
 * or `content` literal inside the *code being written* would be mistaken for
 * the tool's own argument — e.g. editing a file that mentions `"new_string"`.
 * @param text - accumulated raw arguments text.
 * @param key - field name to read.
 * @returns the decoded string prefix, or null when the field is absent.
 */
function readStringField(text, key) {
  const marker = `"${key}"`;
  let at = text.indexOf(marker);
  while (at !== -1) {
    // The key must sit at an object-member boundary.
    let before = at - 1;
    while (before >= 0 && /\s/u.test(text[before])) before -= 1;
    if (before >= 0 && (text[before] === '{' || text[before] === ',')) {
      let i = at + marker.length;
      while (i < text.length && /\s/u.test(text[i])) i += 1;
      if (text[i] === ':') break;
    }
    at = text.indexOf(marker, at + marker.length);
  }
  if (at === -1) return null;
  let i = at + marker.length;
  while (i < text.length && /\s/u.test(text[i])) i += 1;
  if (text[i] !== ':') return null;
  i += 1;
  while (i < text.length && /\s/u.test(text[i])) i += 1;
  if (text[i] !== '"') return null;
  i += 1;
  let out = '';
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      const next = text[i + 1];
      if (next === undefined) break;
      if (next === 'n') { out += '\n'; i += 2; continue; }
      if (next === 't') { out += '\t'; i += 2; continue; }
      if (next === 'r') { out += '\r'; i += 2; continue; }
      if (next === 'b') { out += '\b'; i += 2; continue; }
      if (next === 'f') { out += '\f'; i += 2; continue; }
      if (next === '"') { out += '"'; i += 2; continue; }
      if (next === '\\') { out += '\\'; i += 2; continue; }
      if (next === '/') { out += '/'; i += 2; continue; }
      if (next === 'u') {
        const hex = text.slice(i + 2, i + 6);
        if (hex.length < 4 || !/^[0-9a-f]{4}$/iu.test(hex)) break;
        out += String.fromCharCode(Number.parseInt(hex, 16));
        i += 6;
        continue;
      }
      out += next;
      i += 2;
      continue;
    }
    if (ch === '"') break;
    out += ch;
    i += 1;
  }
  return out;
}

/** One synchronous, pure fold over committed session events (the durable fallback). */
function fold(state, event) {
  if (event.type === 'tool/call') {
    const data = event.data;
    if (data === null || typeof data !== 'object') return state;
    const name = data.name;
    if (typeof name !== 'string' || !CODE_TOOLS.has(name)) return state;
    let args = data.arguments;
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch {
        return state;
      }
    }
    if (args === null || typeof args !== 'object') return state;
    const code = args[CODE_FIELD[name]];
    if (typeof code !== 'string' || code.length === 0) return state;
    const path = typeof args.file_path === 'string' ? args.file_path : null;
    if (path !== null && isDocPath(path)) return state;
    const revision = state.revision + 1;
    return {
      payload: { tool: name, path, code: code.slice(0, MAX_CODE), revision, status: 'settled' },
      revision,
    };
  }
  return state;
}

/** The durable projection unit served to the Client through the session projections face. */
const definition = {
  key: 'code-typer',
  stateSchema: jsonSchema,
  stateVersion: 1,
  init: () => ({ payload: null, revision: 0 }),
  apply: fold,
  wire: { viewSchema: jsonSchema, view: (state) => state.payload, summary: false },
};

export const inject = ['sessionProjections', 'webServer'];

/**
 * Install the live stream capture plus its loopback route.
 * @param ctx - plugin context owning the listeners and route.
 */
export function apply(ctx) {
  const drafts = new Map();
  const pending = new Map();
  let revision = 0;
  const settledTimers = new Map();

  const publish = (sessionId, tool, path, code) => {
    revision += 1;
    const draft = {
      tool,
      path,
      code: code.length > MAX_CODE ? code.slice(0, MAX_CODE) : code,
      revision,
      status: 'typing',
      updatedAt: Date.now(),
    };
    drafts.set(sessionId, draft);
    const existing = settledTimers.get(sessionId);
    if (existing !== undefined) clearTimeout(existing);
    const timer = setTimeout(() => {
      settledTimers.delete(sessionId);
      const current = drafts.get(sessionId);
      if (current === undefined || current.revision !== draft.revision) return;
      drafts.set(sessionId, { ...current, status: 'settled' });
    }, SETTLE_MS);
    if (typeof timer.unref === 'function') timer.unref();
    settledTimers.set(sessionId, timer);
  };

  ctx.effect(() => {
    /** Slots for one finished attempt are dropped: nothing can extend them again. */
    const dropAttempt = (agentId) => {
      const prefix = `${agentId}:`;
      for (const key of pending.keys()) {
        if (key.startsWith(prefix)) pending.delete(key);
      }
    };
    const off = ctx.on('agent/assistant-stream', ({ agent, frame }) => {
      if (frame === null || typeof frame !== 'object') return;
      // An attempt that ends (committed, abandoned, or errored) can never grow
      // its tool-call arguments again, so release its accumulated raw text.
      if (frame.type === 'end') {
        dropAttempt(agent.id);
        return;
      }
      if (frame.type !== 'chunk') return;
      const chunk = frame.chunk;
      if (chunk === null || typeof chunk !== 'object' || chunk.type !== 'tool-call-delta') return;
      const id = typeof chunk.id === 'string' ? chunk.id : '';
      if (id.length === 0) return;
      const slotKey = `${agent.id}:${id}`;
      let slot = pending.get(slotKey);
      if (slot === undefined) {
        slot = { name: undefined, raw: '', ignored: false };
        pending.set(slotKey, slot);
      }
      if (typeof chunk.name === 'string' && chunk.name.length > 0) slot.name = chunk.name;
      // Once the tool is known to carry no code, stop accumulating its arguments.
      if (slot.ignored) return;
      const name = slot.name;
      if (name !== undefined && !CODE_TOOLS.has(name)) {
        slot.ignored = true;
        slot.raw = '';
        return;
      }
      if (typeof chunk.argumentsDelta === 'string') slot.raw += chunk.argumentsDelta;
      if (name === undefined) return;
      const code = readStringField(slot.raw, CODE_FIELD[name]);
      let path = readStringField(slot.raw, 'file_path');
      if (path === null && name === 'apply_patch' && code !== null) {
        const header = /\*\*\*\s(?:Update|Add|Delete) File:\s*(.+)$/mu.exec(code);
        if (header !== null) path = header[1].trim();
      }
      // Wait until the target path is known, then ignore documentation files.
      if (path === null || isDocPath(path)) return;
      if (code !== null && code.length > 0) publish(agent.id, name, path, code);
    });
    return () => {
      off();
      pending.clear();
      for (const timer of settledTimers.values()) clearTimeout(timer);
      settledTimers.clear();
    };
  }, 'code-typer: live stream capture');

  // The durable projection keeps the window populated after a reload.
  // Registration errors are surfaced here rather than left as an unobserved
  // rejection, so a schema conflict names the plugin in the log.
  ctx.sessionProjections.register(definition).catch((error) => {
    ctx.logger.warn(`code-typer: durable projection unavailable: ${String(error)}`);
  });

  // webServer comes from the `inject` declaration above, so cordis activates
  // this entry only once the webserver entry has provided the service. Reading
  // it with ctx.get would not work: the two entries are siblings under the
  // profile root, and get searches only the current context and its ancestors.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: LIVE_PATH,
    resource(request) {
      // Cross-site guard. The app fetches this route over its own dsh-app://
      // protocol, and that handler forwards neither sec-fetch-site nor an
      // Origin, so an absent header must be allowed -- requiring it here
      // rejected the app's own polling. What still has to be refused is a page
      // on another origin reaching the loopback port, which does send
      // sec-fetch-site: cross-site.
      const site = request.headers.get('sec-fetch-site');
      if (site === 'cross-site') {
        return new Response(JSON.stringify({ error: 'forbidden' }), {
          status: 403,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        });
      }
      const url = new URL(request.url);
      const sessionId = url.searchParams.get('session') ?? '';
      // The right-sidebar panel is session-agnostic: with no session named, report
      // the most recently updated draft, which is the one on screen.
      let draft = sessionId.length > 0 ? drafts.get(sessionId) ?? null : null;
      if (draft === null) {
        for (const candidate of drafts.values()) {
          if (draft === null || candidate.updatedAt > draft.updatedAt) draft = candidate;
        }
      }
      return new Response(JSON.stringify({ draft }), {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    },
  }), 'code-typer: live route');
}
