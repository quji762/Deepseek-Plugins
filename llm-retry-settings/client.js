window.__ModuleLoader__.load({
  id: '@local/llm-retry-settings',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this plugin. */
    const NS = 'llm-retry-settings';

    /** Settings namespace of the multi-provider LLM adapter this page edits. */
    const PROVIDERS_NS = 'llm-pi-ai';

    /** Slot id of the settings section contributed by this plugin. */
    const SECTION_ID = 'llm-retry';

    /** Node's maximum setTimeout delay; the host rejects larger values. */
    const MAX_DELAY_MS = 2147483647;

    /** Largest delay expressible through the seconds inputs. */
    const MAX_DELAY_SECONDS = MAX_DELAY_MS / 1000;

    /** Defaults mirrored from @deepseek-ai/dsh-llm `retry-policy.js`. */
    const DEFAULT_POLICY = {
      mode: 'normal',
      maxRetries: 5,
      initialDelayMs: 500,
      maxDelayMs: 10000,
      jitterRatio: 0.1,
    };

    const EN = {
      'nav': 'Retry',
      'title': 'Model request retry',
      'intro': 'Retry policy is configured per provider route and applies to every model on that route. '
        + 'Retries re-run a failed step inside the same agent turn; each retry is another billed provider request. '
        + 'By default only rate limits, server errors, timeouts, transport errors and empty responses are retried — '
        + 'authentication, quota and invalid-request failures are not.',
      'loading': 'Loading provider routes…',
      'noProviders': 'No provider routes are configured. Add one under Settings → Models first.',
      'default': 'Default',
      'customized': 'Customized',
      'mode': 'Mode',
      'modeNormal': 'Bounded (normal)',
      'modeAlways': 'Unlimited (always)',
      'maxRetries': 'Max retries',
      'firstDelay': 'First delay (s)',
      'maxDelay': 'Max delay (s)',
      'jitter': 'Jitter (0–1)',
      'hint': 'Equal first and maximum delay with zero jitter gives a fixed interval.',
      'save': 'Save',
      'reset': 'Reset to default',
      'saved': 'Saved.',
      'busy': 'Saving…',
      'readOnly': 'A higher configuration layer overrides this profile patch, so retry settings are read-only here.',
      'errors.maxRetries': 'Max retries must be a whole number of 0 or more.',
      'errors.delay': 'Delays must be numbers greater than 0 seconds.',
      'errors.delayMax': 'Delays must not exceed 2147483 seconds.',
      'errors.delayRange': 'The first delay must not exceed the maximum delay.',
      'errors.jitter': 'Jitter must be between 0 and 1.',
      'errors.conflict': 'Settings changed elsewhere and the card reloaded. Review the values and save again.',
      'errors.failed': 'The host refused this change.',
    };

    const ZH = {
      'nav': '重试',
      'title': '模型请求重试',
      'intro': '重试策略按提供方路由配置，对该路由下的所有模型生效。重试会在同一个 agent 轮次内重跑失败步骤，'
        + '每次重试都是一次新的计费请求。默认只重试限流、服务端错误、超时、传输错误与空响应，'
        + '认证、配额与无效请求等永久性失败不会重试。',
      'loading': '正在加载提供方路由…',
      'noProviders': '尚未配置任何提供方路由，请先在「设置 → 模型」中添加。',
      'default': '默认',
      'customized': '自定义',
      'mode': '模式',
      'modeNormal': '有界重试（normal）',
      'modeAlways': '不限次数（always）',
      'maxRetries': '重试次数',
      'firstDelay': '首次间隔（秒）',
      'maxDelay': '最长间隔（秒）',
      'jitter': '抖动（0–1）',
      'hint': '首次间隔与最长间隔填相同值、抖动为 0，即为固定重试间隔。',
      'save': '保存',
      'reset': '恢复默认',
      'saved': '已保存。',
      'busy': '保存中…',
      'readOnly': '有更高层级的配置覆盖了此 profile，重试设置在此处为只读。',
      'errors.maxRetries': '重试次数必须是 0 或更大的整数。',
      'errors.delay': '间隔必须是大于 0 秒的数字。',
      'errors.delayMax': '间隔不能超过 2147483 秒。',
      'errors.delayRange': '首次间隔不能大于最长间隔。',
      'errors.jitter': '抖动必须在 0 和 1 之间。',
      'errors.conflict': '设置已在别处更改，卡片已重新加载；请确认数值后再次保存。',
      'errors.failed': '宿主拒绝了此次更改。',
    };

    const CSS = [
      '.lrs_section{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex}',
      '.lrs_title{color:var(--dsw-alias-label-primary);margin:0;font-size:16px;font-weight:500;line-height:24px}',
      '.lrs_intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:14px;line-height:22px;white-space:pre-wrap}',
      '.lrs_rows{flex-direction:column;gap:8px;margin:12px 0 0;padding:0;list-style:none;display:flex}',
      '.lrs_card{border:.5px solid var(--dsw-alias-settings-card-stroke);background:var(--dsw-alias-settings-card-fill);border-radius:var(--dsw-radius-xl);flex-direction:column;gap:12px;padding:12px 14px;display:flex}',
      '.lrs_head{align-items:center;gap:10px;min-width:0;display:flex}',
      '.lrs_name{color:var(--dsw-alias-label-primary);min-width:0;font-size:14px;font-weight:500;line-height:22px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.lrs_tag{border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-xs);color:var(--dsw-alias-label-secondary);flex:none;padding:1px 6px;font-size:11px;line-height:16px}',
      '.lrs_fields{flex-wrap:wrap;align-items:flex-end;gap:12px;display:flex}',
      '.lrs_field{flex-direction:column;gap:4px;min-width:0;display:flex}',
      '.lrs_label{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
      '.lrs_input{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);width:100%;height:32px;font:inherit;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:0 10px;font-size:14px;line-height:22px}',
      '.lrs_input:focus{border-color:var(--dsw-alias-state-business-primary);outline:none}',
      'select.lrs_input{cursor:pointer;max-width:220px}',
      '.lrs_input:disabled{opacity:.6;cursor:default}',
      '.lrs_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:18px}',
      '.lrs_actions{align-items:center;gap:8px;margin-left:auto;display:inline-flex}',
      '.lrs_primary{box-sizing:border-box;border-radius:var(--dsw-radius-md);height:36px;font:inherit;cursor:pointer;border:none;justify-content:center;align-items:center;gap:4px;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}',
      '.lrs_primary:disabled{opacity:.4;cursor:default}',
      '.lrs_ghost{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);height:36px;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;background:0 0;border:none;justify-content:center;align-items:center;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}',
      '.lrs_ghost:disabled{opacity:.4;cursor:default}',
      '.lrs_primary:focus-visible,.lrs_ghost:focus-visible,.lrs_input:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline:none}',
      '.lrs_error{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;line-height:18px}',
      '.lrs_saved{color:var(--dsw-alias-state-success-primary);margin:0;font-size:12px;line-height:18px}',
    ].join('\n');

    /** Translate one key through the bound `t`, falling back to English. */
    function translate(t, key) {
      if (typeof t === 'function') {
        const value = t(key);
        if (typeof value === 'string' && value.length > 0) return value;
      }
      return EN[key] ?? key;
    }

    /** Milliseconds to whole or half seconds, as shown in the inputs. */
    function msToSeconds(ms) {
      const seconds = ms / 1000;
      return Number.isInteger(seconds) ? String(seconds) : String(Math.round(seconds * 100) / 100);
    }

    /** The editable draft for one route, prefilled from its live policy. */
    function draftOf(policy) {
      return {
        mode: policy?.mode ?? DEFAULT_POLICY.mode,
        maxRetries: String(policy?.maxRetries ?? DEFAULT_POLICY.maxRetries),
        firstDelay: msToSeconds(policy?.backoff?.initialDelayMs ?? DEFAULT_POLICY.initialDelayMs),
        maxDelay: msToSeconds(policy?.backoff?.maxDelayMs ?? DEFAULT_POLICY.maxDelayMs),
        jitter: String(policy?.backoff?.jitterRatio ?? DEFAULT_POLICY.jitterRatio),
      };
    }

    /** Parse one numeric input; blank or non-finite input yields null. */
    function parseNumber(text) {
      const trimmed = String(text).trim();
      if (trimmed.length === 0) return null;
      const value = Number(trimmed);
      return Number.isFinite(value) ? value : null;
    }

    /**
     * Validate a draft against the host's `resolveRetryPolicy` rules, so a
     * refused save is the exception rather than the rule.
     * @returns an error message key, or null when the draft is acceptable.
     */
    function validateDraft(draft) {
      const first = parseNumber(draft.firstDelay);
      const max = parseNumber(draft.maxDelay);
      const jitter = parseNumber(draft.jitter);
      if (first === null || first <= 0) return 'errors.delay';
      if (max === null || max <= 0) return 'errors.delay';
      if (first > MAX_DELAY_SECONDS || max > MAX_DELAY_SECONDS) return 'errors.delayMax';
      if (first > max) return 'errors.delayRange';
      if (jitter === null || jitter < 0 || jitter > 1) return 'errors.jitter';
      if (draft.mode === 'normal') {
        const retries = parseNumber(draft.maxRetries);
        if (retries === null || !Number.isInteger(retries) || retries < 0) return 'errors.maxRetries';
      }
      return null;
    }

    /** Build the `retryPolicy` object the host schema expects. */
    function buildPolicy(draft) {
      const backoff = {
        initialDelayMs: Math.round(parseNumber(draft.firstDelay) * 1000),
        maxDelayMs: Math.round(parseNumber(draft.maxDelay) * 1000),
        jitterRatio: parseNumber(draft.jitter),
      };
      if (draft.mode === 'always') return { mode: 'always', backoff };
      return {
        mode: 'normal',
        maxRetries: Math.trunc(parseNumber(draft.maxRetries)),
        backoff,
      };
    }

    /** Whether the draft still matches the policy stored on the host. */
    function isDirty(draft, policy) {
      return JSON.stringify(buildPolicy(draft)) !== JSON.stringify(buildPolicy(draftOf(policy)));
    }

    /** Subscribe a component to one external snapshot store. */
    function useStore(getSnapshot, subscribe) {
      const [value, setValue] = React.useState(getSnapshot);
      React.useEffect(() => {
        setValue(getSnapshot());
        return subscribe(() => setValue(getSnapshot()));
      }, [getSnapshot, subscribe]);
      return value;
    }

    /** One provider route's retry editor. */
    function RetryCard(props) {
      const { route, provider, policy, userPolicy, overridden, writable, onSave, onReset, t } = props;
      const liveKey = JSON.stringify(buildPolicy(draftOf(policy)));
      const [draft, setDraft] = React.useState(() => draftOf(policy));
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState(null);
      const [saved, setSaved] = React.useState(false);
      /** Canonical policy this card last saved, so its echo keeps the confirmation. */
      const lastSaved = React.useRef(null);

      // An external change to the stored policy (a file edit, or another
      // browser) replaces the draft; in-progress typing is untouched. The host
      // echoes saved values with schema defaults filled in, so the comparison
      // runs on the canonical form both sides share.
      React.useEffect(() => {
        setDraft(draftOf(policy));
        setError(null);
        if (lastSaved.current !== liveKey) setSaved(false);
      }, [liveKey]);

      const dirty = isDirty(draft, policy);
      const invalid = validateDraft(draft);
      /** What the actions row explains: a refused write, else the draft's own problem. */
      const problem = error ?? invalid;
      const fieldId = (name) => `${route}-${name}`;

      const submit = async () => {
        if (invalid !== null) {
          setError(invalid);
          return;
        }
        setBusy(true);
        setError(null);
        setSaved(false);
        // A `set` op replaces the whole retryPolicy object, so start from the
        // profile's own value: fields this card does not edit (a hand-written
        // `retryableCodes`, for instance) survive the save.
        const saved = { ...(userPolicy ?? {}), ...buildPolicy(draft) };
        const failure = await onSave(route, saved);
        setBusy(false);
        if (failure === null) {
          lastSaved.current = JSON.stringify(buildPolicy(draft));
          setSaved(true);
        } else setError(failure);
      };

      const reset = async () => {
        setBusy(true);
        setError(null);
        setSaved(false);
        const failure = await onReset(route);
        setBusy(false);
        if (failure !== null) setError(failure);
      };

      const name = typeof provider?.displayName === 'string' && provider.displayName.length > 0
        ? provider.displayName
        : route;

      return h('div', { className: 'lrs_card' },
        h('div', { className: 'lrs_head' },
          h('span', { className: 'lrs_name', title: name }, name),
          h('span', { className: 'lrs_tag' }, route),
          h('span', { className: 'lrs_tag' }, overridden ? t('customized') : t('default'))
        ),
        h('div', { className: 'lrs_fields' },
          h('label', { className: 'lrs_field', htmlFor: fieldId('mode') },
            h('span', { className: 'lrs_label' }, t('mode')),
            h('select', {
              id: fieldId('mode'),
              className: 'lrs_input',
              value: draft.mode,
              disabled: busy || !writable,
              onChange: (event) => setDraft({ ...draft, mode: event.target.value }),
            },
              h('option', { value: 'normal' }, t('modeNormal')),
              h('option', { value: 'always' }, t('modeAlways'))
            )
          ),
          draft.mode === 'normal'
            ? h('label', { className: 'lrs_field', htmlFor: fieldId('maxRetries') },
                h('span', { className: 'lrs_label' }, t('maxRetries')),
                h('input', {
                  id: fieldId('maxRetries'),
                  className: 'lrs_input',
                  type: 'number',
                  min: '0',
                  step: '1',
                  inputMode: 'numeric',
                  value: draft.maxRetries,
                  disabled: busy || !writable,
                  onChange: (event) => setDraft({ ...draft, maxRetries: event.target.value }),
                })
              )
            : null,
          h('label', { className: 'lrs_field', htmlFor: fieldId('firstDelay') },
            h('span', { className: 'lrs_label' }, t('firstDelay')),
            h('input', {
              id: fieldId('firstDelay'),
              className: 'lrs_input',
              type: 'number',
              min: '0',
              step: '0.1',
              inputMode: 'decimal',
              value: draft.firstDelay,
              disabled: busy || !writable,
              onChange: (event) => setDraft({ ...draft, firstDelay: event.target.value }),
            })
          ),
          h('label', { className: 'lrs_field', htmlFor: fieldId('maxDelay') },
            h('span', { className: 'lrs_label' }, t('maxDelay')),
            h('input', {
              id: fieldId('maxDelay'),
              className: 'lrs_input',
              type: 'number',
              min: '0',
              step: '0.1',
              inputMode: 'decimal',
              value: draft.maxDelay,
              disabled: busy || !writable,
              onChange: (event) => setDraft({ ...draft, maxDelay: event.target.value }),
            })
          ),
          h('label', { className: 'lrs_field', htmlFor: fieldId('jitter') },
            h('span', { className: 'lrs_label' }, t('jitter')),
            h('input', {
              id: fieldId('jitter'),
              className: 'lrs_input',
              type: 'number',
              min: '0',
              max: '1',
              step: '0.05',
              inputMode: 'decimal',
              value: draft.jitter,
              disabled: busy || !writable,
              onChange: (event) => setDraft({ ...draft, jitter: event.target.value }),
            })
          )
        ),
        h('p', { className: 'lrs_hint' }, t('hint')),
        h('div', { className: 'lrs_actions' },
          // The save button is disabled while the draft is invalid, so the
          // reason has to be visible without a click: a write failure when
          // there is one, otherwise the live validation result.
          problem === null ? null : h('p', { className: 'lrs_error', role: 'alert' }, translate(t, problem)),
          saved ? h('p', { className: 'lrs_saved', role: 'status' }, t('saved')) : null,
          overridden
            ? h('button', {
                type: 'button',
                className: 'lrs_ghost',
                disabled: busy || !writable,
                onClick: reset,
              }, t('reset'))
            : null,
          h('button', {
            type: 'button',
            className: 'lrs_primary',
            disabled: busy || !writable || !dirty || invalid !== null,
            onClick: submit,
          }, busy ? t('busy') : t('save'))
        )
      );
    }

    /** The Retry settings section: one card per provider route. */
    function RetrySection(props) {
      const { getSnapshot, subscribe, onSave, onReset } = props;
      const t = (key) => translate(props.t, key);
      const snapshot = useStore(getSnapshot, subscribe);

      if (snapshot.status === 'loading') {
        return h('div', { className: 'lrs_section' }, h('p', { className: 'lrs_intro' }, t('loading')));
      }
      if (snapshot.status !== 'ready') return null;

      const providers = snapshot.value?.providers ?? {};
      const userProviders = snapshot.user?.providers ?? {};
      const routes = Object.keys(providers);
      const writable = snapshot.writable !== false;

      return h(React.Fragment, null,
        h('style', { key: 'llm-retry-settings-css', dangerouslySetInnerHTML: { __html: CSS } }),
        h('div', { className: 'lrs_section' },
          h('h2', { className: 'lrs_title' }, t('title')),
          h('p', { className: 'lrs_intro' }, t('intro')),
          writable ? null : h('p', { className: 'lrs_intro' }, t('readOnly')),
          routes.length === 0
            ? h('p', { className: 'lrs_intro' }, t('noProviders'))
            : h('div', { className: 'lrs_rows' }, routes.map((route) => h(RetryCard, {
                key: route,
                route,
                provider: providers[route],
                policy: providers[route]?.retryPolicy,
                userPolicy: userProviders[route]?.retryPolicy,
                overridden: userProviders[route]?.retryPolicy !== undefined,
                writable,
                onSave,
                onReset,
                t,
              })))
        )
      );
    }

    /** Required services (cordis fiber inject). */
    const inject = ['slots', 'locale', 'configForms'];

    /**
     * Contribute the Retry settings section while the Host serves the
     * `llm-pi-ai` namespace, and write through the shared settings document.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'llm-retry-settings: dictionaries');
      const t = ctx.locale.bind(NS);

      const form = ctx.configForms.get(PROVIDERS_NS);
      const getSnapshot = () => form.getSnapshot();
      const subscribe = (listener) => form.subscribe(listener);

      /** Write one settings mutation, returning a message key or null on success. */
      const write = async (ops) => {
        // The shared form controller queues writes, carries the revision the
        // host last accepted, folds the answer into the mirror, and reloads
        // after a refusal — a raw remote call would race its own echo.
        const before = form.getSnapshot().revision;
        const accepted = await form.mutate(ops);
        if (accepted) return null;
        return form.getSnapshot().revision !== before ? 'errors.conflict' : 'errors.failed';
      };

      const onSave = (route, policy) => write([{
        op: 'set',
        path: ['providers', route, 'retryPolicy'],
        value: policy,
      }]);

      const onReset = (route) => write([{
        op: 'unset',
        path: ['providers', route, 'retryPolicy'],
      }]);

      const injected = () => ({
        getSnapshot,
        subscribe,
        onSave,
        onReset,
        hooks: { snapshot: form.store },
      });

      ctx.effect(() => ctx.configForms.whileServed([PROVIDERS_NS], () => ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: SECTION_ID,
        order: 15,
        label: () => t('nav'),
        locale: NS,
        inject: injected,
      }, RetrySection))), 'llm-retry-settings: section');
    }

    return { apply, inject };
  },
});
