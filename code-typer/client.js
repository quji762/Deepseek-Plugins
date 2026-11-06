window.__ModuleLoader__.load({
  id: '@local/code-typer',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this plugin. */
    const NS = 'code-typer';

    /** Tab-type identity: unique across the sidebar's tab registry. */
    const ID = '@local/code-typer';

    /** Kind the sidebar records for this page type. */
    const KIND = 'code-typer';

    /** Route served by the Host half for the in-flight draft. */
    const LIVE_PATH = '/code-typer/live';

    /** Poll cadence; the model streams faster than this, so it reads as typing. */
    const POLL_MS = 130;

    /** Minimum gap between automatic panel opens, so a manual close is respected. */
    const AUTO_OPEN_GAP_MS = 2500;

    const EN = {
      'title': 'code typer',
      'aria': 'Code the agent is writing',
      'status.typing': 'typing',
      'status.settled': 'done',
      'untitled': 'untitled',
      'waiting': 'waiting for the agent to write code',
      'action.close': 'Close the code window',
    };

    const ZH = {
      'title': '代码键入',
      'aria': 'Agent 正在写入的代码',
      'status.typing': '键入中',
      'status.settled': '已完成',
      'untitled': '未命名文件',
      'waiting': '等待 Agent 写入代码',
      'action.close': '关闭代码窗口',
    };

    const CSS = [
      '.codeTyper_pane{--ct-bg:#0a1410;--ct-bar:#12281c;--ct-bar2:#0d1d13;--ct-frame:#1d4029;--ct-green:#4ade80;--ct-green-dim:#2c7a4d;--ct-cyan:#5eead4;box-sizing:border-box;display:flex;flex-direction:column;height:100%;min-height:0;background:var(--ct-bg);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace}',
      '.codeTyper_bar{display:flex;align-items:center;gap:8px;box-sizing:border-box;flex:none;height:30px;padding:0 8px;background:linear-gradient(180deg,var(--ct-bar),var(--ct-bar2));border-bottom:1px solid var(--ct-frame)}',
      '.codeTyper_dots{display:inline-flex;flex:none;gap:5px}',
      '.codeTyper_dots i{display:block;width:8px;height:8px;border-radius:999px;background:var(--ct-green-dim)}',
      '.codeTyper_dots i:nth-child(1){background:#f87171}',
      '.codeTyper_dots i:nth-child(2){background:#fbbf24}',
      '.codeTyper_dots i:nth-child(3){background:var(--ct-green)}',
      '.codeTyper_title{flex:1;min-width:0;overflow:hidden;color:var(--ct-cyan);font-size:11px;line-height:16px;white-space:nowrap;text-overflow:ellipsis}',
      '.codeTyper_status{flex:none;color:var(--ct-green-dim);font-size:10px;letter-spacing:.08em;text-transform:uppercase}',
      '.codeTyper_status[data-live="true"]{color:var(--ct-green)}',
      '.codeTyper_stage{position:relative;flex:1;min-height:0;display:flex}',
      '.codeTyper_screen{flex:1;min-height:0;overflow:auto;padding:8px 12px 12px;--dsh-scrollbar-thumb:var(--ct-green-dim);--dsh-scrollbar-thumb-hover:var(--ct-green);scrollbar-width:thin}',
      '.codeTyper_prompt{margin:0 0 6px;color:var(--ct-green-dim);font-size:11px;line-height:16px;white-space:pre-wrap;overflow-wrap:anywhere}',
      '.codeTyper_code{margin:0;color:var(--ct-green);font-size:12px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;text-shadow:0 0 8px rgba(74,222,128,.22)}',
      '.codeTyper_pane[data-status="settled"] .codeTyper_code{opacity:.72}',
      '.codeTyper_cursor{display:inline-block;width:.58em;height:1.05em;margin-left:1px;vertical-align:text-bottom;background:var(--ct-green);animation:codeTyperBlink 1.1s steps(1) infinite}',
      '@keyframes codeTyperBlink{50%{opacity:0}}',
      '.codeTyper_scan{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(180deg,rgba(255,255,255,.04) 0 1px,rgba(0,0,0,0) 1px 3px)}',
      '.codeTyper_waiting{margin:0;padding:14px 12px;color:var(--ct-green-dim);font-size:12px;line-height:1.6}',
      '@media (prefers-reduced-motion:reduce){.codeTyper_cursor{animation:none}}',
    ].join('\n');

    /** Translate one key through the locale-bound `t`, falling back to English. */
    function translate(t, key) {
      if (typeof t === 'function') {
        const value = t(key);
        if (typeof value === 'string' && value.length > 0) return value;
      }
      return EN[key] ?? key;
    }

    /** Last path segment of a POSIX or Windows path. */
    function basename(path) {
      const parts = String(path).split(/[\\/]+/);
      return parts[parts.length - 1] || String(path);
    }

    /** Poll the Host's latest live draft (the model's partially-typed code). */
    function useLiveDraft(poll) {
      const [draft, setDraft] = React.useState(null);
      let warned = false;
      React.useEffect(() => {
        if (!poll) return undefined;
        let disposed = false;
        let timer = 0;
        let controller = null;
        const schedule = () => {
          if (!disposed) timer = setTimeout(tick, POLL_MS);
        };
        const tick = async () => {
          if (disposed) return;
          if (typeof document !== 'undefined' && document.hidden) {
            schedule();
            return;
          }
          controller = typeof AbortController === 'function' ? new AbortController() : null;
          try {
            const response = await fetch(LIVE_PATH, {
              cache: 'no-store',
              credentials: 'same-origin',
              ...(controller === null ? {} : { signal: controller.signal }),
            });
            if (!response.ok) {
              // 404 means the Host route is not registered (plugin inactive or
              // a stale module generation); keep polling, it may appear.
              if (response.status === 404) {
                if (!warned) {
                  warned = true;
                  console.warn('[code-typer] live route returned 404; the Host half is not serving /code-typer/live');
                }
              } else {
                console.warn('[code-typer] live route status', response.status);
              }
              schedule();
              return;
            }
            const body = await response.json();
            if (disposed) return;
            // Keep the last reference when nothing changed: a fresh object each
            // poll would re-render the whole pane about eight times a second.
            const next = body !== null && typeof body === 'object' ? body.draft ?? null : null;
            setDraft((previous) => {
              if (previous === next) return previous;
              if (previous === null || next === null) return next;
              return previous.revision === next.revision
                && previous.updatedAt === next.updatedAt
                && previous.status === next.status
                ? previous
                : next;
            });
          } catch {
            /* transient: retry on the next tick, keep the last draft */
          }
          schedule();
        };
        schedule();
        return () => {
          disposed = true;
          if (timer !== 0) clearTimeout(timer);
          if (controller !== null) controller.abort();
        };
      }, [poll]);
      return draft;
    }

    /** The terminal window itself, rendered inside a right-sidebar tab. */
    function CodeTyperView({ draft, t }) {
      const screenRef = React.useRef(null);
      const code = draft !== null && typeof draft.code === 'string' ? draft.code : '';
      const isTyping = draft !== null && draft.status === 'typing';

      React.useEffect(() => {
        const element = screenRef.current;
        if (element !== null) element.scrollTop = element.scrollHeight;
      }, [code]);

      const path = draft !== null && typeof draft.path === 'string' && draft.path.length > 0 ? draft.path : null;
      const tool = draft !== null && typeof draft.tool === 'string' && draft.tool.length > 0 ? draft.tool : 'write';

      return h('div', {
        className: 'codeTyper_pane',
        role: 'group',
        'aria-label': t('aria'),
        'data-code-typer': '',
        'data-status': isTyping ? 'typing' : 'settled',
      },
        h('div', { className: 'codeTyper_bar' },
          h('span', { className: 'codeTyper_dots', 'aria-hidden': true }, h('i', null), h('i', null), h('i', null)),
          h('span', { className: 'codeTyper_title', title: path ?? t('untitled') },
            `${t('title')} — ${path !== null ? basename(path) : t('untitled')}`),
          h('span', { className: 'codeTyper_status', 'data-live': isTyping ? 'true' : 'false' },
            isTyping ? t('status.typing') : t('status.settled'))
        ),
        h('div', { className: 'codeTyper_stage' },
          h('div', { className: 'codeTyper_screen', ref: screenRef },
            draft === null
              ? h('p', { className: 'codeTyper_waiting' }, t('waiting'))
              : h(React.Fragment, null,
                  h('div', { className: 'codeTyper_prompt' }, `$ ${tool}${path !== null ? ` ${path}` : ''}`),
                  h('pre', { className: 'codeTyper_code' }, code,
                    h('span', { className: 'codeTyper_cursor', 'aria-hidden': true }))
                )
          ),
          h('div', { className: 'codeTyper_scan', 'aria-hidden': true })
        )
      );
    }

    /** Tab body seat of the right sidebar. */
    function CodeTyperPane(props) {
      const draft = useLiveDraft(true);
      const t = (key) => translate(props.t, key);
      return h(React.Fragment, null,
        h('style', { key: 'code-typer-css', dangerouslySetInnerHTML: { __html: CSS } }),
        h(CodeTyperView, { draft, t })
      );
    }

    /**
     * Headless watcher: opens the right-side tab when the model starts typing code,
     * throttled so a manual close is respected until the next burst.
     */
    function createAutoOpen(sidebarRight) {
      return function CodeTyperAutoOpen() {
        const draft = useLiveDraft(true);
        const lastOpen = React.useRef(0);
        React.useEffect(() => {
          if (draft === null || draft.status !== 'typing') return;
          const now = Date.now();
          if (now - lastOpen.current < AUTO_OPEN_GAP_MS) return;
          lastOpen.current = now;
          try {
            sidebarRight.openTab(KIND);
          } catch (error) {
            console.warn('[code-typer] openTab failed:', error);
          }
        }, [draft]);
        return null;
      };
    }

    return {
      inject: ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'code-typer: dictionaries');

        // The tab chip's text is captured when the tab opens, so bind the
        // namespace once and read it live: it follows a later language switch.
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: ID,
          kind: KIND,
          title: () => t('title'),
        }), 'code-typer: tab type');

        // `t` is bound once above; the pane body also reads the framework's
        // locale-bound `t` when the slot supplies one.
        ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: ID,
          locale: NS,
        }, CodeTyperPane));

        const AutoOpen = createAutoOpen(ctx.sidebarRight);
        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock',
          id: 'code-typer-autoopen',
          order: 0,
        }, AutoOpen));
      },
    };
  },
});
