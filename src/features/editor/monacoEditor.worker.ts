// Side-effect entry for Monaco's own editor worker. Vite bundles this module as
// a same-origin worker when it sees `new Worker(new URL(...))`; the packaged CSP
// therefore needs no `blob:` or remote worker source.
import "monaco-editor/editor/editor.worker";
