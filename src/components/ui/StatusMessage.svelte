<!--
@component
Shows one inline status message. The tone is stated in words as well as colour,
so the meaning does not depend on colour perception.

Remaining attributes such as `id` and `role="alert"` are forwarded to the
container, which lets a control reference the message with `aria-describedby`.
-->
<script lang="ts" module>
  /** Severity communicated by a status message. */
  export type StatusTone = "success" | "warning" | "error";

  const TONE_LABELS: Record<StatusTone, string> = {
    success: "Success",
    warning: "Warning",
    error: "Error",
  };

  // Complete class names, so Tailwind's source scan can detect each preset.
  const TONE_SURFACES: Record<StatusTone, string> = {
    success: "preset-tonal-success",
    warning: "preset-tonal-warning",
    error: "preset-tonal-error",
  };
  const TONE_BADGES: Record<StatusTone, string> = {
    success: "preset-filled-success-950-50",
    warning: "preset-filled-warning-950-50",
    error: "preset-filled-error-950-50",
  };
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** Severity shown as a text label and matching surface. */
    tone: StatusTone;
    /** Safe, user-facing message text. */
    message: string;
  }

  let { tone, message, class: className, ...rest }: Props = $props();
</script>

<div {...rest} class={["flex items-start gap-3 card p-3", TONE_SURFACES[tone], className]}>
  <span class={["mt-0.5 badge shrink-0", TONE_BADGES[tone]]}>{TONE_LABELS[tone]}</span>
  <p>{message}</p>
</div>
