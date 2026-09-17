import { useCallback, useState } from 'react';

/* ────────────────────────────────────────────────────────────────────────────
   useNestedForm — single source of truth for dot-path form state.

   Extracted after a copy-pasted update() helper in ContestForm.jsx AND
   ContestDetailsForm.jsx forgot to descend into the cloned child object
   (`ref = ref[k]` was missing), which silently redirected every nested write
   (entry.feeUSD, prize.totalUSD, …) to the top level — fields looked
   read-only. Both forms now share this hook so the fix can never regress
   independently again.

   Usage:
     const { form, setForm, update } = useNestedForm(createEmptyForm);
     update('entry.feeUSD', '25');          // nested — intermediates created/cloned
     update('title', 'ACM Hackathon');      // top-level — identical behavior
     setForm(mapDocToForm(doc));            // whole-form replace (hydrate/reset)
──────────────────────────────────────────────────────────────────────────── */

/**
 * Immutably write `value` at a dot-separated `path` inside `obj`.
 * Intermediate objects are cloned on the way down (never mutated), and are
 * created when missing or non-object. A path traversing an array replaces it
 * with a plain object — deliberate, since every dot-path in this codebase
 * targets object fields only.
 */
export const setAtPath = (obj, path, value) => {
  const next = { ...obj };
  const keys = path.split('.');
  let ref = next;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (ref[k] === null || ref[k] === undefined || typeof ref[k] !== 'object') ref[k] = {};
    ref[k] = { ...ref[k] };
    ref = ref[k]; // descend into the clone — the step the copy-pasted versions were missing
  }
  ref[keys[keys.length - 1]] = value;
  return next;
};

export const useNestedForm = (initial) => {
  const [form, setForm] = useState(initial);

  const update = useCallback(
    (path, value) => {
      setForm((prev) => setAtPath(prev, path, value));
    },
    [] // setForm is stable; no dependencies
  );

  // updateWith: multi-field write in ONE state pass — pass a function that
  // receives the current form and returns the next form (or a falsy value to
  // keep current). Handy for derived fields like filterKeys.domain.
  const updateWith = useCallback(
    (fn) => {
      setForm((prev) => {
        const next = fn(prev);
        return next && typeof next === 'object' ? next : prev;
      });
    },
    []
  );

  return { form, setForm, update, updateWith };
};

export default useNestedForm;
