# REF IMAGE Delete Investigation Report

## Scope

- Target: Lab page `REF IMAGE` section
- Target file: `src/routes/lab/+page.svelte`
- Investigation only. No application code was changed.
- Baseline: current working tree, with `HEAD` behavior compared where relevant

## Executive Summary

The `REF IMAGE` cards are rendered directly from the Svelte state array
`referenceImages`.

The remove button is wired to `removeReferenceImage(i)`, and the current
working-tree implementation removes the indexed item with
`referenceImages.splice(i, 1)`.

No current code reloads `referenceImages` from localStorage. Character Registry
loading updates the separate `characterRegistry` state and does not automatically
restore an item into `referenceImages`.

Therefore, the current working-tree flow contains no code path that should
immediately restore a removed card.

The strongest identified cause is a difference between the code currently in the
working tree and the code in `HEAD` or an already-running application bundle.
The `HEAD` implementation first calls `DELETE /api/characters/:id` for Registry
references. If that request fails, the function returns before removing the item
from `referenceImages`. In that version, the X button appears ineffective when
the Registry deletion fails.

The current remove function has no entry/exit logging, so static inspection alone
cannot prove that the click handler ran in the user's browser. Runtime confirmation
requires a browser session or temporary instrumentation.

## 1. REF IMAGE Render State

The state is declared at:

```ts
let referenceImages = $state<ReferenceImage[]>([]);
```

Location:

- `src/routes/lab/+page.svelte:549`

The `REF IMAGE` section is conditionally displayed from the same state:

```svelte
{#if referenceImages.length > 0}
  ...
  {#each referenceImages as ref, i}
    ...
  {/each}
{/if}
```

Locations:

- Section condition: `src/routes/lab/+page.svelte:7084`
- Card iteration: `src/routes/lab/+page.svelte:7087`

Conclusion:

- The visible REF IMAGE card array is `referenceImages`.
- `characterRegistry`, `characterAnalyzeImages`, and `mangaContinueImages` are
  not the direct render source for this section.

## 2. X Button Handler

The button is:

```svelte
<button
  class="ref-img-remove"
  onclick={() => removeReferenceImage(i)}
  title="現在のREF選択から外す"
>✕</button>
```

Location:

- `src/routes/lab/+page.svelte:7104`

The called function is:

```ts
async function removeReferenceImage(i: number): Promise<void> {
  const removed = referenceImages[i];
  referenceImages.splice(i, 1);
  characterAnalyzeImages = characterAnalyzeImages.filter((ref) => ref !== removed);
  mangaContinueImages = mangaContinueImages.filter((ref) => ref !== removed);
  characterBible = null;
  characterBibleSource = null;
  visionContext = '';
}
```

Locations:

- Function entry: `src/routes/lab/+page.svelte:2261`
- Render-state mutation: `src/routes/lab/+page.svelte:2263`

## 3. Is the Function Actually Called?

Static result:

- The DOM event is correctly connected to `removeReferenceImage(i)`.
- The button is a native `button`.
- It is not inside a `form`, so an implicit submit is not involved.
- The button is not disabled.
- The relevant CSS does not set `pointer-events: none` on the button, card, or
  strip.

Unconfirmed runtime point:

- `removeReferenceImage` contains no console log, breakpoint hook, or other
  observable entry marker.
- No development server was reachable at `127.0.0.1:5173` during this
  investigation.
- Browser automation was unavailable in the investigation session.

Conclusion:

- The source code wiring is correct.
- Whether the browser currently executes this exact function cannot be proven
  from the existing logs.
- A stale running bundle remains possible.

## 4. Does the State Update?

The current implementation performs:

```ts
referenceImages.splice(i, 1);
```

`referenceImages` is a Svelte 5 `$state` array. Array mutation through `splice`
is tracked by the deep state proxy, so this is a reactive state mutation.

The same array is then read by:

```svelte
{#if referenceImages.length > 0}
{#each referenceImages as ref, i}
```

Expected result:

1. The indexed item is removed.
2. The `#each` block updates.
3. If the last item is removed, the surrounding `#if` becomes false and the
   entire REF IMAGE section disappears.

No assignment later in `removeReferenceImage` restores `referenceImages`.

## 5. Reload Paths After the Update

All current write sites for `referenceImages` are:

| Location | Operation | Purpose |
| --- | --- | --- |
| Line 549 | Initialize to `[]` | Initial state |
| Line 2207 | Replace with old items plus uploaded files | Manual REF IMAGE upload |
| Line 2241 | Replace with old items plus Registry item | Explicit `USE AS REF` |
| Line 2263 | `splice(i, 1)` | X-button removal |
| Line 6281 | Reset to `[]` | Page mount |

There is no effect, timer, subscription, or post-delete callback that reloads
`referenceImages`.

The route-specific arrays:

- `characterAnalyzeImages`
- `mangaContinueImages`

are filtered when an item is removed, but they do not render the REF IMAGE card
list.

## 6. localStorage and Character Registry

### localStorage

No localStorage key stores or restores the Lab page's `referenceImages`.

On mount, the code explicitly resets it:

```ts
referenceImages = [];
```

Location:

- `src/routes/lab/+page.svelte:6281`

The nearby `LS_STORY_REFS` localStorage handling is for Story YAML references,
not REF IMAGE cards.

Conclusion:

- A deleted REF IMAGE card is not restored from localStorage by the current code.

### Character Registry

Registry loading calls:

```ts
const res = await fetch('/api/characters');
characterRegistry = ...
```

Locations:

- Function: `src/routes/lab/+page.svelte:1928`
- Registry state assignment: `src/routes/lab/+page.svelte:1935`

It does not assign to `referenceImages`. The existing diagnostic explicitly
records:

```ts
restoredIntoReferenceImages: false
```

Location:

- `src/routes/lab/+page.svelte:1949`

A Registry image enters `referenceImages` only through the explicit
`USE AS REF` action:

- Button: `src/routes/lab/+page.svelte:7072`
- Function: `src/routes/lab/+page.svelte:2230`
- State assignment: `src/routes/lab/+page.svelte:2241`

Conclusion:

- Character Registry does not automatically resurrect a removed card in the
  current working tree.

## End-to-End Flow

```text
X button
  -> onclick={() => removeReferenceImage(i)}
  -> removed = referenceImages[i]
  -> referenceImages.splice(i, 1)
  -> remove the same object from route snapshot arrays
  -> clear Character Bible / vision context
  -> Svelte reacts to referenceImages length/content
  -> {#each referenceImages} rerenders
  -> removed card disappears
```

Current code has no automatic reload after this flow.

## Identified Version-Specific Failure

The `HEAD` version of `removeReferenceImage` differs from the current working
tree. It contains:

```ts
const ref = referenceImages[i];
if (ref?.characterId) {
  try {
    const res = await fetch(`/api/characters/${encodeURIComponent(ref.characterId)}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Character delete HTTP ${res.status}`);
    }
  } catch (error) {
    console.warn('[CHARACTER_REGISTRY_DELETE_ERROR]', error);
    return;
  }
}
referenceImages.splice(i, 1);
```

Failure flow in that version:

```text
X button
  -> removeReferenceImage(i)
  -> Registry DELETE request
  -> request fails or returns an unexpected status
  -> catch
  -> return
  -> referenceImages.splice is never executed
  -> card remains visible
```

This exactly produces an "X button does nothing" symptom for Registry-derived
cards.

## Root Cause Assessment

### Most likely

The displayed application is running the `HEAD` or another stale bundle where
Registry deletion is attempted before local state removal. A failed Registry
request prevents `referenceImages` from being updated.

### Not supported by the current code

- Restoration from localStorage
- Automatic restoration from Character Registry
- Rendering from a different array
- Replacement from `characterAnalyzeImages` or `mangaContinueImages`
- CSS explicitly disabling pointer events on the remove button

### Remaining uncertainty

The current source has no runtime marker inside `removeReferenceImage`, so it is
not possible to distinguish these two cases without runtime observation:

1. The browser never dispatches the click to the handler.
2. The browser is executing an older handler that returns before state removal.

## Final Finding

The delete-to-render state flow in the current working tree is internally
consistent and contains no resurrection path. The concrete failure mechanism
found in repository history is the old Character Registry DELETE dependency:
when that request fails, local state deletion is skipped.

The mismatch between the current working tree and the running application is
therefore the primary cause candidate.
