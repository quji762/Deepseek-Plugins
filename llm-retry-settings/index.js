/**
 * Host half of the llm-retry-settings bundle.
 *
 * The plugin is browser-only: its Client half contributes a Settings section
 * that edits the `retryPolicy` of every `llm-pi-ai` provider route through the
 * shared settings document, so retry tuning no longer means hand-editing
 * `cordis.patch.yml`. Nothing needs to run on the Host, but a mounted entry is
 * what makes the client module discoverable — `dsh-client-modules` resolves
 * `./client` from the package behind each mounted loader row.
 */

/** Cordis plugin entry point: no host-side behaviour. */
export function apply() {}
