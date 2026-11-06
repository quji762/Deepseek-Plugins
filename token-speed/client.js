/**
 * Client half of the token-speed bundle: a right-Sidebar tab type whose body
 * draws the session's per-step generation speed as a live curve.
 *
 * Two data paths feed one picture. The durable path is the `tokenSpeed`
 * session projection (Host-folded, survives fork/resume/replay): one settled
 * point per generation step. The live path is the Session's event feed, which
 * publishes `assistant/live-chunk` transient frames while a step generates, so
 * the curve's leading point moves during generation instead of waiting for the
 * step to settle. The Host never folds live data and the Client never folds
 * durable events.
 *
 * All copy flows through the `tokenSpeed` locale namespace, all colors through
 * `--dsw-alias-*` theme tokens, and component-local styles render as React
 * elements so unmounting removes them.
 *
 * @module @local/token-speed/client
 */
window.__ModuleLoader__.load({
  id: '@local/token-speed',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** This package's copy namespace. */
    const NS = 'tokenSpeed';
    /** Tab type identity: the registry id doubles as the keyed slot's entry key. */
    const TYPE_ID = '@local/token-speed';
    /** The tab kind this package owns. */
    const KIND = 'token-speed';
    /** Projection key whose wire view this tab renders. */
    const PROJECTION_KEY = 'tokenSpeed';
    /** Visible time window of the curve, in milliseconds. */
    const WINDOW_MS = 180000;
    /** Minimum visible span, so a quiet session still reads as a curve. */
    const MIN_SPAN_MS = 30000;

    /* ---------------------------------------------------------------------- */
    /* Dictionaries                                                            */
    /* ---------------------------------------------------------------------- */

    /** Simplified Chinese dictionary and key-set source of truth. */
    const zh = {
      'type.label': 'Token 速度',
      'guide.title': 'Token 速度',
      'guide.description': '每一步生成的实时速度曲线',
      'hero.current': '当前速度',
      'hero.live': '生成中',
      'hero.idle': '空闲',
      'stat.average': '平均',
      'stat.peak': '峰值',
      'stat.total': '累计',
      unit: 'tok/s',
      now: '现在',
      loading: '正在读取会话数据…',
      empty: '这个会话还没有生成记录',
      'empty.hint': '发送消息后，这里会画出每一步的生成速度。',
      lastSteps: '最近 {count} 步',
      totalTokens: '共 {count} tokens',
      'chart.aria': '最近生成过程的速度曲线，纵轴为每秒 token 数',
      'tip.position': '第 {turn} 轮 · 第 {step} 步',
      'tip.speed': '{speed} tok/s',
      'tip.meta': '{tokens} tokens · 解码 {decode}',
      'point.title': '第 {turn} 轮第 {step} 步：{speed} tok/s，{tokens} tokens，解码 {decode}',
      interrupted: '已中断',
    };

    /** English dictionary, checked against the Chinese key set. */
    const en = {
      'type.label': 'Token Speed',
      'guide.title': 'Token Speed',
      'guide.description': 'Live per-step generation speed',
      'hero.current': 'Current speed',
      'hero.live': 'Generating',
      'hero.idle': 'Idle',
      'stat.average': 'Average',
      'stat.peak': 'Peak',
      'stat.total': 'Total',
      unit: 'tok/s',
      now: 'now',
      loading: 'Reading session data…',
      empty: 'No generation recorded yet',
      'empty.hint': 'Send a message and each step’s speed will be drawn here.',
      lastSteps: 'last {count} steps',
      totalTokens: '{count} tokens total',
      'chart.aria': 'Recent generation speed curve, tokens per second',
      'tip.position': 'Turn {turn} · Step {step}',
      'tip.speed': '{speed} tok/s',
      'tip.meta': '{tokens} tokens · {decode} decode',
      'point.title': 'Turn {turn}, step {step}: {speed} tok/s, {tokens} tokens, {decode} decode',
      interrupted: 'interrupted',
    };

    /* ---------------------------------------------------------------------- */
    /* Artwork and formatting                                                  */
    /* ---------------------------------------------------------------------- */

    /** The rising-curve glyph on `currentColor`, for the guide capsule and the tab chip. */
    function SpeedGlyph({ size = 16, className }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
        'aria-hidden': true, focusable: 'false', className,
      },
      h('path', {
        d: 'M2 12.2 L6 7.6 L9.4 10 L13.8 4.6',
        stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
      }),
      h('path', {
        d: 'M2 13.6 H14', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', opacity: 0.55,
      }),
      h('circle', { cx: 13.8, cy: 4.6, r: 1.7, fill: 'currentColor' }));
    }

    /** Round a positive value up to a readable axis maximum. */
    function niceCeil(value) {
      const safe = Math.max(value, 1);
      const power = Math.pow(10, Math.floor(Math.log10(safe)));
      for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
        const candidate = step * power;
        if (candidate >= safe) return candidate;
      }
      return 10 * power;
    }

    const formatInt = (value) => Math.round(value).toLocaleString();

    /** Duration in milliseconds as a short human string. */
    function formatDuration(ms) {
      const safe = Math.max(ms, 0);
      if (safe >= 60000) {
        const minutes = Math.floor(safe / 60000);
        const seconds = Math.round((safe % 60000) / 1000);
        return `${String(minutes)}m ${String(seconds)}s`;
      }
      return `${(safe / 1000).toFixed(1)}s`;
    }

    /** Elapsed milliseconds as a short axis suffix. */
    function formatAgo(ms) {
      const seconds = Math.round(Math.max(ms, 0) / 1000);
      if (seconds < 60) return `${String(seconds)}s`;
      const minutes = Math.round(seconds / 60);
      if (minutes < 60) return `${String(minutes)}m`;
      return `${Math.round(minutes / 60)}h`;
    }

    /** Whether one stream chunk is a token delta, per the Host fold's rule. */
    function isTokenDeltaChunk(chunk) {
      if (typeof chunk !== 'object' || chunk === null) return false;
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

    /* ---------------------------------------------------------------------- */
    /* Curve geometry                                                          */
    /* ---------------------------------------------------------------------- */

    /** Fritsch-Carlson monotone tangents: smooth without overshooting the data. */
    function monotoneTangents(points) {
      const count = points.length;
      const slope = new Array(Math.max(count - 1, 0));
      for (let index = 0; index < count - 1; index += 1) {
        const run = points[index + 1].x - points[index].x;
        slope[index] = run === 0 ? 0 : (points[index + 1].y - points[index].y) / run;
      }
      const tangent = new Array(count).fill(0);
      for (let index = 1; index < count - 1; index += 1) {
        if (slope[index - 1] * slope[index] <= 0) continue;
        const wide = 2 * (points[index + 1].x - points[index].x) + (points[index].x - points[index - 1].x);
        const narrow = (points[index + 1].x - points[index].x) + 2 * (points[index].x - points[index - 1].x);
        tangent[index] = (wide + narrow) / (wide / slope[index - 1] + narrow / slope[index]);
      }
      if (count > 1) {
        tangent[0] = slope[0];
        tangent[count - 1] = slope[count - 2];
      }
      return tangent;
    }

    /** SVG path through the points as a monotone cubic curve. */
    function monotonePath(points) {
      if (points.length === 0) return '';
      if (points.length < 3) {
        return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
      }
      const tangent = monotoneTangents(points);
      let path = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
      for (let index = 0; index < points.length - 1; index += 1) {
        const from = points[index];
        const to = points[index + 1];
        const first = from.x + (to.x - from.x) / 3;
        const second = to.x - (to.x - from.x) / 3;
        path += ` C${first.toFixed(2)},${(from.y + tangent[index] * (first - from.x)).toFixed(2)}`
          + ` ${second.toFixed(2)},${(to.y + tangent[index + 1] * (second - to.x)).toFixed(2)}`
          + ` ${to.x.toFixed(2)},${to.y.toFixed(2)}`;
      }
      return path;
    }

    /* ---------------------------------------------------------------------- */
    /* Live speed source                                                       */
    /*                                                                        */
    /* Folds the Session event feed's transient `assistant/live-chunk` frames  */
    /* into the in-flight step's token count and timing. The feed publishes    */
    /* synchronously; the source attaches only while a component observes it.  */
    /* ---------------------------------------------------------------------- */

    /** Empty in-flight state shared by every source variant. */
    const IDLE_LIVE = null;

    function createLiveSpeedSource(eventSource) {
      let state = IDLE_LIVE;
      let attached;
      const listeners = new Set();

      const publish = () => {
        for (const listener of listeners) listener();
      };

      const foldChunk = (entry) => {
        const data = entry.event.data;
        const previous = state !== null && state.attemptId === data.attemptId ? state : {
          attemptId: data.attemptId,
          turn: data.turn,
          step: data.step,
          firstTime: entry.event.time,
          lastTime: entry.event.time,
          tokens: 0,
        };
        if (!isTokenDeltaChunk(data.chunk)) {
          if (previous === state) return;
          state = previous;
          publish();
          return;
        }
        state = { ...previous, lastTime: entry.event.time, tokens: previous.tokens + 1 };
        publish();
      };

      const scan = (entries) => {
        let next = IDLE_LIVE;
        for (const entry of entries) {
          if (entry.type !== 'transient' || entry.event.type !== 'assistant/live-chunk') continue;
          const data = entry.event.data;
          const previous = next !== null && next.attemptId === data.attemptId ? next : {
            attemptId: data.attemptId,
            turn: data.turn,
            step: data.step,
            firstTime: entry.event.time,
            lastTime: entry.event.time,
            tokens: 0,
          };
          next = isTokenDeltaChunk(data.chunk)
            ? { ...previous, lastTime: entry.event.time, tokens: previous.tokens + 1 }
            : previous;
        }
        if (next === state) return;
        state = next;
        publish();
      };

      const applyChange = (change) => {
        switch (change.kind) {
          case 'replace':
            scan(change.entries);
            return;
          case 'append':
            for (const entry of change.entries) {
              if (entry.type === 'transient' && entry.event.type === 'assistant/live-chunk') foldChunk(entry);
              else if (entry.event?.type === 'assistant/message' || entry.event?.type === 'step/end') {
                if (state !== null) {
                  state = IDLE_LIVE;
                  publish();
                }
              }
            }
            return;
          case 'settle-assistant':
            if (state !== null) {
              state = IDLE_LIVE;
              publish();
            }
            return;
          default:
            return;
        }
      };

      return {
        getSnapshot: () => state,
        subscribe(listener) {
          listeners.add(listener);
          if (attached === undefined && eventSource !== undefined) {
            const feed = eventSource;
            const onChange = () => applyChange(feed.getSnapshot().change);
            scan(feed.getSnapshot().entries);
            attached = feed.subscribe(onChange);
          }
          return () => {
            listeners.delete(listener);
            if (listeners.size === 0 && attached !== undefined) {
              attached();
              attached = undefined;
            }
          };
        },
      };
    }

    /* ---------------------------------------------------------------------- */
    /* The curve                                                               */
    /* ---------------------------------------------------------------------- */

    /**
     * The speed curve: one settled point per generation step at its commit
     * time, a monotone cubic through them, a sliding time window on x, tokens
     * per second on y, and a dashed live segment while a step generates.
     */
    function Curve({ samples, peak, width, height, hostNow, live, t }) {
      const gradientId = React.useId();
      const [hover, setHover] = React.useState(null);
      const padLeft = 40;
      const padRight = 14;
      const padTop = 12;
      const padBottom = 22;
      const plotWidth = Math.max(width - padLeft - padRight, 10);
      const plotHeight = Math.max(height - padTop - padBottom, 10);
      const baseline = padTop + plotHeight;

      const settled = samples.filter((sample) => sample.t1 <= hostNow + 1);
      const liveTime = live === null ? 0 : live.lastTime;
      const lastTime = settled.length > 0 ? settled[settled.length - 1].t1 : (live === null ? hostNow : liveTime);
      const end = Math.max(hostNow, lastTime);
      const firstTime = settled.length > 0 ? settled[0].t1 : end - WINDOW_MS;
      const start = Math.max(firstTime, end - WINDOW_MS);
      const span = Math.max(end - start, MIN_SPAN_MS);
      const origin = end - span;
      const xOf = (time) => padLeft + ((time - origin) / span) * plotWidth;

      const max = niceCeil(Math.max(peak, live === null ? 0 : liveSpeedOf(live), 10));
      const yOf = (value) => padTop + plotHeight * (1 - value / max);

      const visible = settled.filter((sample) => sample.t1 >= origin);
      const points = visible.map((sample) => ({ x: xOf(sample.t1), y: yOf(sample.tokPerSec) }));
      const line = monotonePath(points);
      const area = points.length > 1
        ? `${line} L${points[points.length - 1].x.toFixed(2)},${String(baseline)} L${points[0].x.toFixed(2)},${String(baseline)} Z`
        : '';

      const livePoint = live === null
        ? null
        : {
          x: xOf(live.lastTime),
          y: yOf(liveSpeedOf(live)),
          from: points.length > 0 ? points[points.length - 1] : null,
        };

      const hovered = hover !== null && hover < visible.length ? visible[hover] : null;
      const onMove = (event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - bounds.left;
        let best = null;
        let distance = Infinity;
        for (let index = 0; index < visible.length; index += 1) {
          const gap = Math.abs(xOf(visible[index].t1) - x);
          if (gap < distance) {
            distance = gap;
            best = index;
          }
        }
        setHover(best);
      };

      const children = [];
      for (const value of [max, max / 2, 0]) {
        const y = yOf(value);
        children.push(h('line', {
          key: `grid-${String(value)}`,
          x1: padLeft, x2: width - padRight, y1: y, y2: y,
          stroke: value === 0 ? 'var(--dsw-alias-border-l2)' : 'var(--dsw-alias-border-l1)',
          strokeWidth: 1,
          ...value === 0 ? {} : { strokeDasharray: '2 4' },
        }));
        children.push(h('text', {
          key: `y-label-${String(value)}`,
          className: 'tsc-axisLabel',
          x: padLeft - 8, y: y + 3.5, 'text-anchor': 'end',
        }, formatInt(value)));
      }
      const xTicks = [origin, origin + span / 2, end];
      const anchors = ['start', 'middle', 'end'];
      for (let index = 0; index < xTicks.length; index += 1) {
        children.push(h('text', {
          key: `x-label-${String(index)}`,
          className: 'tsc-axisLabel',
          x: xOf(xTicks[index]), y: height - 6, 'text-anchor': anchors[index],
        }, index === 2 ? t('now') : `-${formatAgo(end - xTicks[index])}`));
      }
      if (area !== '') {
        children.push(h('path', { key: 'area', d: area, fill: `url(#${gradientId})` }));
      }
      if (line !== '') {
        children.push(h('path', {
          key: 'line', d: line, fill: 'none', stroke: 'var(--dsw-alias-brand-primary)',
          strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round',
        }));
      }
      if (livePoint !== null && livePoint.from !== null) {
        children.push(h('path', {
          key: 'live-segment',
          d: `M${livePoint.from.x.toFixed(2)},${livePoint.from.y.toFixed(2)} L${livePoint.x.toFixed(2)},${livePoint.y.toFixed(2)}`,
          fill: 'none', stroke: 'var(--dsw-alias-state-success-primary)',
          strokeWidth: 2, strokeDasharray: '3 4', strokeLinecap: 'round',
        }));
      }
      for (let index = 0; index < visible.length; index += 1) {
        const sample = visible[index];
        const isLast = index === visible.length - 1;
        const isHover = hovered === sample;
        children.push(h('g', { key: `point-${String(sample.turn)}-${String(sample.step)}` },
          isLast
            ? h('circle', { cx: xOf(sample.t1), cy: yOf(sample.tokPerSec), r: 7, fill: 'var(--dsw-alias-brand-primary)', fillOpacity: 0.16 })
            : null,
          isHover
            ? h('circle', { cx: xOf(sample.t1), cy: yOf(sample.tokPerSec), r: 6, fill: 'var(--dsw-alias-brand-primary)', fillOpacity: 0.18 })
            : null,
          h('circle', {
            cx: xOf(sample.t1), cy: yOf(sample.tokPerSec),
            r: isHover ? 4 : isLast ? 3.4 : 2.2,
            fill: 'var(--dsw-alias-brand-primary)',
          })));
      }
      if (hovered !== null) {
        children.push(h('line', {
          key: 'crosshair',
          x1: xOf(hovered.t1), x2: xOf(hovered.t1), y1: padTop, y2: baseline,
          stroke: 'var(--dsw-alias-border-l2)', strokeWidth: 1,
        }));
      }
      if (livePoint !== null) {
        children.push(h('g', { key: 'live-point', className: 'tsc-live' },
          h('line', {
            x1: livePoint.x, x2: livePoint.x, y1: livePoint.y, y2: baseline,
            stroke: 'var(--dsw-alias-state-success-primary)', strokeWidth: 1, strokeDasharray: '2 4', opacity: 0.6,
          }),
          h('circle', {
            cx: livePoint.x, cy: livePoint.y, r: 5.5,
            fill: 'none', stroke: 'var(--dsw-alias-state-success-primary)', strokeWidth: 1.8,
          })));
      }

      const tip = hovered === null ? null : h('div', {
        className: 'tsc-tip',
        'data-side': xOf(hovered.t1) > width * 0.62 ? 'end' : 'start',
        'data-place': yOf(hovered.tokPerSec) < 64 ? 'below' : 'above',
        style: {
          left: `${xOf(hovered.t1).toFixed(1)}px`,
          top: `${yOf(hovered.tokPerSec).toFixed(1)}px`,
        },
      },
      h('div', { className: 'tsc-tipPosition' }, t('tip.position', {
        turn: formatInt(hovered.turn),
        step: formatInt(hovered.step),
      })),
      h('div', { className: 'tsc-tipSpeed' }, t('tip.speed', { speed: formatInt(hovered.tokPerSec) })),
      h('div', { className: 'tsc-tipMeta' }, t('tip.meta', {
        tokens: formatInt(hovered.tokens),
        decode: formatDuration(hovered.decodeMs),
      })),
      hovered.interrupted ? h('div', { className: 'tsc-tipInterrupted' }, t('interrupted')) : null);

      return h(React.Fragment, null,
        h('svg', {
          width, height, viewBox: `0 0 ${String(width)} ${String(height)}`,
          role: 'img', 'aria-label': t('chart.aria'),
          onMouseMove: onMove, onMouseLeave: () => setHover(null),
        },
        h('defs', null, h('linearGradient', { id: gradientId, x1: '0', y1: '0', x2: '0', y2: '1' },
          h('stop', { offset: '0%', stopColor: 'var(--dsw-alias-brand-primary)', stopOpacity: 0.2 }),
          h('stop', { offset: '100%', stopColor: 'var(--dsw-alias-brand-primary)', stopOpacity: 0 }))),
        children),
        tip);
    }

    /** Cumulative average speed of the in-flight step, in tokens per second. */
    function liveSpeedOf(live) {
      const decode = Math.max(live.lastTime - live.firstTime, 1);
      return Math.round((live.tokens * 1000) / decode);
    }

    /* ---------------------------------------------------------------------- */
    /* The tab body                                                            */
    /* ---------------------------------------------------------------------- */

    /** Component-local styles; rendered as an element so unmounting removes them. */
    const CSS = [
      '.tsc-root{box-sizing:border-box;flex-direction:column;gap:14px;height:100%;min-height:0;padding:16px;display:flex;color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:1.5}',
      '.tsc-axisLabel{font-size:10px;fill:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.tsc-hero{justify-content:space-between;align-items:flex-start;gap:12px;display:flex}',
      '.tsc-heroLabel{color:var(--dsw-alias-label-secondary);font-size:11px;letter-spacing:.02em}',
      '.tsc-heroValue{font-size:28px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.15;display:flex;align-items:baseline;gap:5px}',
      '.tsc-heroUnit{font-size:12px;font-weight:400;color:var(--dsw-alias-label-secondary)}',
      '.tsc-badge{align-items:center;gap:7px;height:24px;padding:0 10px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap;display:inline-flex}',
      '.tsc-badge[data-live=true]{color:var(--dsw-alias-state-success-primary)}',
      '.tsc-badgeDot{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}',
      '.tsc-badge[data-live=true] .tsc-badgeDot{animation:tsc-pulse 1.2s ease-in-out infinite}',
      '@keyframes tsc-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.68)}}',
      '.tsc-stats{border-top:.5px solid var(--dsw-alias-border-l3);border-bottom:.5px solid var(--dsw-alias-border-l3);display:flex}',
      '.tsc-stat{flex-direction:column;flex:1;gap:2px;padding:10px 4px;display:flex}',
      '.tsc-stat+.tsc-stat{border-left:.5px solid var(--dsw-alias-border-l3)}',
      '.tsc-statLabel{color:var(--dsw-alias-label-secondary);font-size:11px}',
      '.tsc-statValue{font-size:14px;font-weight:500;font-variant-numeric:tabular-nums}',
      '.tsc-chart{flex:auto;min-height:168px;position:relative}',
      '.tsc-chart svg{display:block;overflow:visible}',
      '.tsc-live circle{animation:tsc-breathe 1.6s ease-in-out infinite}',
      '@keyframes tsc-breathe{0%,100%{opacity:1}50%{opacity:.45}}',
      '.tsc-tip{position:absolute;z-index:2;pointer-events:none;background:var(--dsw-alias-bg-overlay);border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);box-shadow:var(--dsw-shadow-lv2);padding:7px 10px;white-space:nowrap;transform:translate(8px,calc(-100% - 12px))}',
      '.tsc-tip[data-side=end]{transform:translate(calc(-100% - 8px),calc(-100% - 12px))}',
      '.tsc-tip[data-place=below]{transform:translate(8px,14px)}',
      '.tsc-tip[data-side=end][data-place=below]{transform:translate(calc(-100% - 8px),14px)}',
      '.tsc-tipPosition{color:var(--dsw-alias-label-secondary);font-size:10px}',
      '.tsc-tipSpeed{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.45}',
      '.tsc-tipMeta{color:var(--dsw-alias-label-secondary);font-size:10px}',
      '.tsc-tipInterrupted{color:var(--dsw-alias-state-warn-primary);font-size:10px}',
      '.tsc-empty{flex-direction:column;justify-content:center;align-items:center;gap:8px;height:100%;min-height:168px;text-align:center;display:flex}',
      '.tsc-emptyGlyph{color:var(--dsw-alias-label-secondary);opacity:.45}',
      '.tsc-emptyText{color:var(--dsw-alias-label-secondary);font-size:13px}',
      '.tsc-emptyHint{color:var(--dsw-alias-label-secondary);font-size:11px;opacity:.8}',
      '.tsc-loading{justify-content:center;align-items:center;height:100%;min-height:168px;color:var(--dsw-alias-label-secondary);font-size:12px;display:flex}',
      '.tsc-footer{justify-content:space-between;gap:12px;color:var(--dsw-alias-label-secondary);font-size:11px;display:flex}',
    ].join('');

    /** The tab body: hero speed, aggregate stats, the curve, and the session totals. */
    function TokenSpeedBody({ useProjection, useLiveSpeed, t }) {
      const view = typeof useProjection === 'function' ? useProjection(PROJECTION_KEY) : undefined;
      const live = typeof useLiveSpeed === 'function' ? useLiveSpeed((state) => state) : null;
      const loaded = view !== undefined && view !== null;
      const generating = live !== null || (loaded && view.current !== null);

      // Re-render on a slow cadence only while a step is generating, so the
      // elapsed badge and the "now" marker keep moving.
      const [, setTick] = React.useState(0);
      React.useEffect(() => {
        if (!generating) return undefined;
        const id = setInterval(() => setTick((value) => value + 1), 500);
        return () => clearInterval(id);
      }, [generating]);

      // The view's serverTime is a Host-clock reading at the last relevant
      // commit; anchoring it once per view maps the browser clock onto it.
      const serverTime = loaded ? view.serverTime : 0;
      const clock = React.useMemo(
        () => (serverTime > 0 ? { server: serverTime, at: Date.now() } : null),
        [serverTime],
      );
      const hostNow = clock === null ? Date.now() : clock.server + (Date.now() - clock.at);

      const chartRef = React.useRef(null);
      const [size, setSize] = React.useState({ width: 0, height: 0 });
      React.useEffect(() => {
        const node = chartRef.current;
        if (node === null) return undefined;
        const measure = () => setSize({ width: node.clientWidth, height: node.clientHeight });
        measure();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        return () => observer.disconnect();
      }, []);

      const samples = loaded ? view.steps : [];
      const totals = loaded ? view.totals : null;
      const last = samples.length > 0 ? samples[samples.length - 1] : null;
      const currentSpeed = live !== null ? liveSpeedOf(live) : (last === null ? null : last.tokPerSec);
      const startedAt = loaded && view.current !== null
        ? view.current.startTime
        : (live === null ? null : live.firstTime);
      const elapsed = generating && startedAt !== null
        ? Math.max(hostNow - startedAt, live === null ? 0 : live.lastTime - live.firstTime)
        : null;

      return h('div', { className: 'tsc-root' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('div', { className: 'tsc-hero' },
          h('div', null,
            h('div', { className: 'tsc-heroLabel' }, t('hero.current')),
            h('div', { className: 'tsc-heroValue' },
              h('span', null, currentSpeed === null ? '—' : formatInt(currentSpeed)),
              h('span', { className: 'tsc-heroUnit' }, t('unit')))),
          h('span', { className: 'tsc-badge', 'data-live': generating || undefined },
            generating ? h('span', { className: 'tsc-badgeDot' }) : null,
            generating ? `${t('hero.live')} ${formatDuration(elapsed ?? 0)}` : t('hero.idle'))),
        totals !== null
          ? h('div', { className: 'tsc-stats' },
              h('div', { className: 'tsc-stat' },
                h('span', { className: 'tsc-statLabel' }, t('stat.average')),
                h('span', { className: 'tsc-statValue' }, formatInt(totals.avgTokPerSec))),
              h('div', { className: 'tsc-stat' },
                h('span', { className: 'tsc-statLabel' }, t('stat.peak')),
                h('span', { className: 'tsc-statValue' }, formatInt(totals.peak))),
              h('div', { className: 'tsc-stat' },
                h('span', { className: 'tsc-statLabel' }, t('stat.total')),
                h('span', { className: 'tsc-statValue' }, formatInt(totals.tokens))))
          : null,
        h('div', { className: 'tsc-chart', ref: chartRef },
          !loaded
            ? h('div', { className: 'tsc-loading' }, t('loading'))
            : samples.length === 0 && live === null
              ? h('div', { className: 'tsc-empty' },
                  h('span', { className: 'tsc-emptyGlyph' }, h(SpeedGlyph, { size: 34 })),
                  h('span', { className: 'tsc-emptyText' }, t('empty')),
                  h('span', { className: 'tsc-emptyHint' }, t('empty.hint')))
              : h(Curve, {
                  samples, peak: totals.peak, width: size.width, height: size.height,
                  hostNow, live, t,
                })),
        totals !== null
          ? h('div', { className: 'tsc-footer' },
              h('span', null, t('lastSteps', { count: formatInt(samples.length) })),
              h('span', null, t('totalTokens', { count: formatInt(totals.tokens) })))
          : null);
    }

    /** The title as the chip and a floating panel's header show it. */
    function TokenSpeedTitle({ useTabInfo }) {
      const { tab } = useTabInfo();
      return h(React.Fragment, null, h(SpeedGlyph, { size: 16 }), tab.title);
    }

    /* ---------------------------------------------------------------------- */
    /* Plugin body                                                             */
    /* ---------------------------------------------------------------------- */

    /**
     * Client plugin body: register the type, its dictionaries, its body, and
     * its chip title.
     * @param ctx - client root context carrying the tab registry, slots, and copy.
     */
    function apply(ctx) {
      const t = ctx.locale.bind(NS);
      const sessions = ctx.sessions;
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'token-speed: dictionaries');
      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: TYPE_ID,
        kind: KIND,
        priority: 'extension',
        title: () => t('type.label'),
        guide: [{
          id: 'token-speed',
          order: 40,
          title: () => t('guide.title'),
          description: () => t('guide.description'),
          icon: SpeedGlyph,
        }],
      }), 'token-speed: tab type');
      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: TYPE_ID,
        locale: NS,
        inject: (sessionId) => {
          // The live path: the Session's event feed, shared with the open
          // conversation, publishes per-chunk frames while a step generates.
          const binding = sessions.binding(sessionId);
          return { hooks: { liveSpeed: createLiveSpeedSource(binding?.eventSource) } };
        },
      }, TokenSpeedBody)), 'token-speed: tab body');
      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab.title',
        key: TYPE_ID,
      }, TokenSpeedTitle)), 'token-speed: tab title');
    }

    return {
      inject: ['slots', 'locale', 'sessions', 'sidebarRightTabs'],
      apply,
    };
  },
});
