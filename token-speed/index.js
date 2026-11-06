/**
 * Host half of the token-speed bundle: the `tokenSpeed` session projection.
 *
 * The fold turns each model step's durable settlement into one speed sample:
 * `step/start` opens the step, `assistant/message` closes it with the attempt's
 * compact stream (token deltas carry per-chunk timestamps) and the provider's
 * usage, and `step/end`/`turn/end` clear an unsettled step. The wire view the
 * Client renders is the rolling sample window plus the in-flight step, so the
 * browser never folds session events itself.
 *
 * The state is plain JSON and every transition returns the previous reference
 * for events it ignores, which keeps the projection cache checkpoints valid and
 * change notifications quiet. Live per-chunk data stays process-local
 * (`agent/assistant-stream`); this projection deliberately reports at the
 * durable step boundary, the only cadence that survives fork, resume, and
 * replay.
 *
 * @module @local/token-speed
 */

/** Rolling window of generation samples kept in the state and the wire view. */
const WINDOW_STEPS = 48;

/* -------------------------------------------------------------------------- */
/* Schema validators                                                          */
/*                                                                             */
/* The projection registry only ever calls `.parse()` on a unit's schemas      */
/* (state rows read back from the persisted cache, and every computed wire     */
/* view). These duck-typed validators mirror that contract without adding a   */
/* runtime dependency to the bundle: they check the plain-JSON shape this unit */
/* itself writes and return the value unchanged.                               */
/* -------------------------------------------------------------------------- */

function fail(message) {
  throw new TypeError(`tokenSpeed projection: ${message}`);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be a finite number`);
}

function checkCount(value, label) {
  if (!Number.isInteger(value) || value < 0) fail(`${label} must be a non-negative integer`);
}

function checkString(value, label) {
  if (typeof value !== 'string') fail(`${label} must be a string`);
}

function checkSample(value) {
  if (!isRecord(value)) fail('each sample must be an object');
  checkCount(value.turn, 'sample.turn');
  checkCount(value.step, 'sample.step');
  checkNumber(value.t1, 'sample.t1');
  checkNumber(value.decodeMs, 'sample.decodeMs');
  checkNumber(value.tokens, 'sample.tokens');
  checkNumber(value.tokPerSec, 'sample.tokPerSec');
  if (typeof value.interrupted !== 'boolean') fail('sample.interrupted must be a boolean');
}

const stateSchema = {
  parse(value) {
    if (!isRecord(value)) fail('state must be an object');
    if (!Array.isArray(value.steps) || value.steps.length > WINDOW_STEPS) {
      fail(`state.steps must be an array of at most ${String(WINDOW_STEPS)} samples`);
    }
    for (const sample of value.steps) checkSample(sample);
    if (value.open !== null && !isRecord(value.open)) fail('state.open must be null or an object');
    if (value.open !== null) {
      checkCount(value.open.turn, 'state.open.turn');
      checkCount(value.open.step, 'state.open.step');
      checkNumber(value.open.startTime, 'state.open.startTime');
    }
    checkCount(value.totalSteps, 'state.totalSteps');
    checkNumber(value.totalTokens, 'state.totalTokens');
    checkNumber(value.totalDecodeMs, 'state.totalDecodeMs');
    checkNumber(value.peak, 'state.peak');
    checkNumber(value.lastEventTime, 'state.lastEventTime');
    return value;
  },
};

const viewSchema = {
  parse(value) {
    if (!isRecord(value)) fail('view must be an object');
    if (!Array.isArray(value.steps) || value.steps.length > WINDOW_STEPS) {
      fail(`view.steps must be an array of at most ${String(WINDOW_STEPS)} samples`);
    }
    for (const sample of value.steps) checkSample(sample);
    if (value.current !== null && !isRecord(value.current)) fail('view.current must be null or an object');
    if (value.current !== null) {
      checkCount(value.current.turn, 'view.current.turn');
      checkCount(value.current.step, 'view.current.step');
      checkNumber(value.current.startTime, 'view.current.startTime');
    }
    if (!isRecord(value.totals)) fail('view.totals must be an object');
    checkCount(value.totals.steps, 'view.totals.steps');
    checkNumber(value.totals.tokens, 'view.totals.tokens');
    checkNumber(value.totals.decodeMs, 'view.totals.decodeMs');
    checkNumber(value.totals.avgTokPerSec, 'view.totals.avgTokPerSec');
    checkNumber(value.totals.peak, 'view.totals.peak');
    checkNumber(value.serverTime, 'view.serverTime');
    return value;
  },
};

/* -------------------------------------------------------------------------- */
/* Compact-stream readers                                                      */
/*                                                                             */
/* One attempt's stream is the durable record list of `AssistantStream         */
/* Accumulator`: packed delta runs (`text-chunks`, `reasoning-chunks`,         */
/* `tool-call-chunks`, each with per-member `dt` gaps) plus raw `chunk`        */
/* records for block, usage, and finish events. Token deltas are the packed    */
/* run members and the raw delta chunks; the timings below reconstruct member  */
/* times exactly as `expandAssistantStream` does.                              */
/* -------------------------------------------------------------------------- */

/** Whether one raw chunk is a token delta per `isTokenDelta`. */
function isTokenDeltaChunk(chunk) {
  if (!isRecord(chunk)) return false;
  switch (chunk.type) {
    case 'text-delta':
    case 'reasoning-delta':
      return typeof chunk.text === 'string' && chunk.text !== '';
    case 'tool-call-delta':
      return typeof chunk.argumentsDelta === 'string' && chunk.argumentsDelta !== '' || chunk.name !== undefined;
    default:
      return false;
  }
}

/** Whether one packed-run member counts as a token delta. */
function isTokenDeltaMember(record, member) {
  if (record.type === 'tool-call-chunks') return record.name !== undefined || member !== '';
  return member !== '';
}

/**
 * Fold one compact stream into its first token time and token count.
 *
 * The decode window deliberately ends at the assembled message event (the
 * shipped `sessionStats` fold's convention), not at the last delta, so the
 * numbers here read the same as the conversation's own timing overview.
 * @param stream - the `assistant/message` event's compact stream records.
 * @returns `{ firstTokenTime, tokenCount }`, the time null when the stream carries no token.
 */
function streamStats(stream) {
  let firstTokenTime = null;
  let tokenCount = 0;
  if (!Array.isArray(stream)) return { firstTokenTime, tokenCount };
  for (const record of stream) {
    if (!isRecord(record)) continue;
    if (record.type === 'chunk') {
      if (!isTokenDeltaChunk(record.chunk)) continue;
      if (firstTokenTime === null) firstTokenTime = record.time;
      tokenCount += 1;
      continue;
    }
    const members = record.type === 'tool-call-chunks' ? record.args : record.texts;
    if (!Array.isArray(members) || members.length === 0 || !Array.isArray(record.dt)) continue;
    let time = record.time0;
    for (let index = 0; index < members.length; index += 1) {
      if (index > 0) time += record.dt[index - 1];
      if (!isTokenDeltaMember(record, members[index])) continue;
      if (firstTokenTime === null) firstTokenTime = time;
      tokenCount += 1;
    }
  }
  return { firstTokenTime, tokenCount };
}

/** Provider-reported completion tokens, guarded the way the shipped folds guard node usage. */
function outputTokensOf(usage) {
  if (!isRecord(usage)) return null;
  const value = usage.outputTokens;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** The generating model of one assistant message, when it names one. */
function modelOf(message) {
  const model = isRecord(message) && isRecord(message.source) ? message.source.model : undefined;
  return typeof model === 'string' && model !== '' ? model : null;
}

/* -------------------------------------------------------------------------- */
/* The unit                                                                    */
/* -------------------------------------------------------------------------- */

/** The `tokenSpeed` unit registered on `ctx.sessionProjections` (exported for the unit spec). */
const tokenSpeedProjectionDefinition = {
  key: 'tokenSpeed',
  stateVersion: 1,
  stateSchema,
  init: () => ({
    steps: [],
    open: null,
    totalSteps: 0,
    totalTokens: 0,
    totalDecodeMs: 0,
    peak: 0,
    lastEventTime: 0,
  }),
  apply: (state, event) => {
    switch (event.type) {
      case 'step/start':
        return {
          ...state,
          open: { turn: event.data.turn, step: event.data.step, startTime: event.time },
          lastEventTime: event.time,
        };
      case 'assistant/message': {
        const open = state.open;
        if (open === null || open.turn !== event.data.turn || open.step !== event.data.step) return state;
        const settled = { ...state, open: null, lastEventTime: event.time };
        const stats = streamStats(event.data.stream);
        if (stats.firstTokenTime === null) return settled;
        const tokens = outputTokensOf(event.data.usage) ?? stats.tokenCount;
        const decodeMs = Math.max(event.time - stats.firstTokenTime, 1);
        const tokPerSec = Math.round((tokens * 1000) / decodeMs);
        const sample = {
          turn: open.turn,
          step: open.step,
          t1: event.time,
          decodeMs,
          tokens,
          tokPerSec,
          interrupted: event.data.interrupted === true,
        };
        return {
          ...settled,
          steps: [...state.steps, sample].slice(-WINDOW_STEPS),
          totalSteps: state.totalSteps + 1,
          totalTokens: state.totalTokens + tokens,
          totalDecodeMs: state.totalDecodeMs + decodeMs,
          peak: Math.max(state.peak, tokPerSec),
        };
      }
      case 'step/end':
        if (state.open === null || state.open.turn !== event.data.turn || state.open.step !== event.data.step) return state;
        return { ...state, open: null, lastEventTime: event.time };
      case 'turn/end':
        return state.open === null ? state : { ...state, open: null, lastEventTime: event.time };
      default:
        return state;
    }
  },
  wire: {
    viewSchema,
    view: (state) => ({
      steps: state.steps,
      current: state.open === null ? null : {
        turn: state.open.turn,
        step: state.open.step,
        startTime: state.open.startTime,
      },
      totals: {
        steps: state.totalSteps,
        tokens: state.totalTokens,
        decodeMs: state.totalDecodeMs,
        avgTokPerSec: state.totalDecodeMs > 0 ? Math.round((state.totalTokens * 1000) / state.totalDecodeMs) : 0,
        peak: state.peak,
      },
      // Host-clock reading at the last relevant commit; the Client maps it onto
      // its own clock once per view to place samples and the in-flight step.
      serverTime: state.lastEventTime,
    }),
  },
};

/**
 * Register the `tokenSpeed` unit; the registration is an effect on this
 * plugin's fiber, so unloading removes the key.
 * @param ctx - registrant context carrying the projection registry.
 */
export function apply(ctx) {
  ctx.sessionProjections.register(tokenSpeedProjectionDefinition);
}

/** The projection registry is the plugin's whole purpose; without it the fiber stays pending. */
export const inject = ['sessionProjections'];
