# Browsing Kubernetes workloads

The Workloads view reads bounded Pod summaries from one explicitly selected
Kubernetes context. Credentials and Kubernetes API clients stay in the native
backend; the view receives only credential labels, session identity, safe
errors, and the documented Pod fields.

## Open a context

1. In Settings, import a kubeconfig with the native file picker. Choose whether
   the credential should be stored in the OS vault or kept for this session.
2. Open Workloads and select **Load saved contexts**. The app does not read
   ambient kube configuration or list contexts until this action.
3. Choose the context label and select **Open Kubernetes session**. The view
   and status bar show the selected label and session ID. The session is owned
   by the application shell and remains open while navigating between views.

## List Pods

1. Set the namespace. The default is `default`; the app never searches other
   namespaces to infer access.
2. Optionally enter Kubernetes label and field selectors. The backend validates
   them before making a request.
3. Select **List Pods**. The backend follows continuation pages for that
   session, namespace, and selector set, and returns one bounded snapshot. The
   renderer shows only name, namespace, UID, resource version, phase, and a
   readiness summary.
4. Select **Close Kubernetes session** when finished. Closing the application
   shell also closes its session.

The view distinguishes an empty namespace, a partial snapshot at a backend
limit, an unsupported Pod API, an unauthorized credential, a forbidden read,
an expired continuation, and other safe request failures. Authentication and
authorization failures are not retried. Changing the session or query hides
the prior snapshot so a late response cannot appear under a different context.

See [application IPC](../protocol/application-ipc.md#kubernetes-credential-handles-and-sessions)
for the backend contract and [Document 02](../plans/foundation-finish/02-f3-kubernetes-list-probe.md)
for its limits and fixture evidence.
