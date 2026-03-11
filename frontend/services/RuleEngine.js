/**
 * ══════════════════════════════════════════════════════════════════════════
 * RuleEngine.js  —  Enterprise Conditional Rule Engine (Frontend-Only)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ARCHITECTURAL DECISIONS
 * ───────────────────────
 * 1. RULE PRIORITY — Deterministic, fieldOrder-based:
 *    Fields are evaluated in ascending fieldOrder.
 *    Higher fieldOrder = evaluated later = wins conflicts.
 *    e.g. Field A (order 0) hides B, Field C (order 2) shows B → C wins.
 *
 * 2. SECURITY — Frontend rules are UI-only:
 *    Hidden/disabled fields: values are KEPT in state (not cleared).
 *    Hidden fields are EXCLUDED from frontend validation only.
 *    All values are sent to backend regardless of visibility.
 *    Backend validates its own required constraints independently.
 *
 * 3. PERFORMANCE — Pre-parsed rules + dependency map:
 *    withParsedRules() parses rulesJson once per field load, not per keystroke.
 *    buildDependencyMap() maps source→target so only affected fields re-eval.
 *
 * 4. CIRCULAR DEPENDENCY — Pass cap + convergence detection:
 *    Max 5 passes. Stops early if state stops changing.
 *    A→B→C→A oscillates then stabilises after 5 passes.
 *
 * 5. CONFLICT RESOLUTION — Last matching rule wins (by fieldOrder):
 *    Multiple rules affecting same field: higher-order source wins.
 *    Documented in RuleBuilder UI help text.
 *
 * 6. SUBMISSION DATA CONSISTENCY:
 *    Hidden field values preserved in state (enterprise standard).
 *    Excluded from validation only — included in backend payload.
 *
 * 7. SET VALUE BEHAVIOUR:
 *    setValue overrides working values → triggers re-evaluation next pass.
 *    Does NOT auto-lock field — add "disable" action explicitly.
 *    Capped at MAX_PASSES to prevent infinite cascades.
 *
 * 8. NESTING — Capped at MAX_NEST_DEPTH = 3:
 *    Deeper groups treated as true. RuleBuilder UI prevents adding more.
 *
 * NEW ADDITIONS (v2)
 * ──────────────────
 * Operators : 'matches regex', 'not matches regex',
 *             'length >', 'length <', 'length =',
 *             'count selected >', 'count selected <', 'count selected =',
 *             'changed'
 * Actions   : 'copyValue'      — copy live value from another field
 *             'filterOptions'  — restrict dropdown/radio/checkbox options
 *             'setMin'         — dynamic minimum for number/date fields
 *             'setMax'         — dynamic maximum for number/date fields
 *             'setLabel'       — override the field's visible label
 *             'setPlaceholder' — override the field's placeholder text
 * ══════════════════════════════════════════════════════════════════════════
 */

export const MAX_PASSES = 5;
export const MAX_NEST_DEPTH = 3;

/** Operators that need no value input in the condition row */
export const NO_VALUE_OPS = new Set([
  'is empty', 'is not empty', 'is true', 'is false',
  'is today', 'is past', 'is future', 'is uploaded', 'is not uploaded',
  'changed', // NEW (v2) — no comparison value needed
]);

// ─── Default values snapshot (for 'changed' operator) ────────────────────────

/**
 * Module-level snapshot of initial/default field values.
 * Call setDefaultValues() once when the form loads with its initial values.
 * Required for the 'changed' operator to correctly detect user modification.
 *
 * @param {{ [fieldKey: string]: any }} defaults
 */
const _defaultValues = {};
export function setDefaultValues(defaults) {
  Object.assign(_defaultValues, defaults);
}

// ─── Step 1: Pre-parse rulesJson once per field load ─────────────────────────

/**
 * Attaches `_parsedRule` to each field object by parsing rulesJson once.
 * Returns a new array — original fields are not mutated.
 * Call this inside useMemo() keyed to the fields array.
 */
export function withParsedRules(fields) {
  return fields.map(f => {
    if (!f.rulesJson) return { ...f, _parsedRule: null };
    try {
      return { ...f, _parsedRule: JSON.parse(f.rulesJson) };
    } catch {
      console.warn(`[RuleEngine] Invalid rulesJson on field "${f.fieldKey}" — skipping`);
      return { ...f, _parsedRule: null };
    }
  });
}

// ─── Step 2: Build dependency map ────────────────────────────────────────────

/**
 * Returns { [sourceFieldKey]: Set<targetFieldKey> }
 * "When source changes, which target fields need re-evaluation?"
 * Used with getAffectedTargets() to skip unrelated re-evaluations.
 */
export function buildDependencyMap(fields) {
  const map = {};
  for (const f of fields) {
    if (!f._parsedRule) continue;
    for (const src of extractSourceKeys(f._parsedRule)) {
      if (!map[src]) map[src] = new Set();
      map[src].add(f.fieldKey);
    }
  }
  return map;
}

function extractSourceKeys(node) {
  if (!node) return [];
  if (Array.isArray(node.conditions)) {
    return node.conditions.flatMap(c => extractSourceKeys(c));
  }
  if (node.fieldKey) return [node.fieldKey];
  return [];
}

/**
 * Returns array of target fieldKeys affected when `changedKey` changes.
 * Pass result to applyRules selectively for large forms.
 */
export function getAffectedTargets(depMap, changedKey) {
  return Array.from(depMap[changedKey] || []);
}

// ─── Step 3: Condition evaluation ────────────────────────────────────────────

/**
 * Evaluate a single leaf condition against current form values.
 * Operator set covers all 7 field types defined in the spec.
 */
export function evaluateCondition(condition, formValues) {
  const { fieldKey, operator, value: ruleVal } = condition;
  const rawActual = formValues[fieldKey];
  const actual = rawActual == null ? '' : String(rawActual).trim();
  const expected = ruleVal == null ? '' : String(ruleVal).trim();

  switch (operator) {
    // ── Universal ─────────────────────────────────────────────────────────
    case 'equals':
    case '=': return actual === expected;
    case 'not equals':
    case '!=': return actual !== expected;
    case 'is empty': return actual === '';
    case 'is not empty': return actual !== '';

    // ── Number (7 operators) ──────────────────────────────────────────────
    case '>': return Number(actual) > Number(expected);
    case '>=': return Number(actual) >= Number(expected);
    case '<': return Number(actual) < Number(expected);
    case '<=': return Number(actual) <= Number(expected);
    case 'between': {
      const parts = expected.split(',');
      const lo = Number(parts[0]?.trim());
      const hi = Number(parts[1]?.trim());
      const n = Number(actual);
      return !isNaN(n) && !isNaN(lo) && !isNaN(hi) && n >= lo && n <= hi;
    }

    // ── Text (8 operators) ────────────────────────────────────────────────
    case 'contains': return actual.toLowerCase().includes(expected.toLowerCase());
    case 'not contains': return !actual.toLowerCase().includes(expected.toLowerCase());
    case 'starts with': return actual.toLowerCase().startsWith(expected.toLowerCase());
    case 'ends with': return actual.toLowerCase().endsWith(expected.toLowerCase());

    // ── Date (7 operators) ────────────────────────────────────────────────
    case 'before': return actual !== '' && expected !== '' && actual < expected;
    case 'after': return actual !== '' && expected !== '' && actual > expected;
    case 'is today': return actual === new Date().toISOString().slice(0, 10);
    case 'is past': return actual !== '' && actual < new Date().toISOString().slice(0, 10);
    case 'is future': return actual !== '' && actual > new Date().toISOString().slice(0, 10);

    // ── Boolean (2 operators) ─────────────────────────────────────────────
    case 'is true': return rawActual === true || rawActual === 'true';
    case 'is false': return rawActual === false || rawActual === 'false' || rawActual === '' || rawActual == null;

    // ── Dropdown / Radio (4 operators) ────────────────────────────────────
    case 'in list': {
      const list = expected.split(',').map(s => s.trim()).filter(Boolean);
      return list.includes(actual);
    }
    case 'not in list': {
      const list = expected.split(',').map(s => s.trim()).filter(Boolean);
      return !list.includes(actual);
    }

    // ── File (2 operators) ────────────────────────────────────────────────
    case 'is uploaded': return actual !== '' && rawActual != null;
    case 'is not uploaded': return actual === '' || rawActual == null;

    // ── NEW (v2): Regex ───────────────────────────────────────────────────
    // Use case: IF email matches regex "^.+@company\.com$" THEN show employee_section
    case 'matches regex':
      try { return new RegExp(expected).test(actual); }
      catch { console.warn(`[RuleEngine] Invalid regex: "${expected}"`); return false; }

    case 'not matches regex':
      try { return !new RegExp(expected).test(actual); }
      catch { console.warn(`[RuleEngine] Invalid regex: "${expected}"`); return false; }

    // ── NEW (v2): String length ───────────────────────────────────────────
    // Use case: IF description length > 100 THEN show summary_field
    case 'length >': return actual.length > Number(expected);
    case 'length <': return actual.length < Number(expected);
    case 'length =': return actual.length === Number(expected);

    // ── NEW (v2): Multi-checkbox / comma-list count ───────────────────────
    // Use case: IF skills count selected > 3 THEN show experience_level
    case 'count selected >': return actual.split(',').filter(Boolean).length > Number(expected);
    case 'count selected <': return actual.split(',').filter(Boolean).length < Number(expected);
    case 'count selected =': return actual.split(',').filter(Boolean).length === Number(expected);

    // ── NEW (v2): Changed from default ────────────────────────────────────
    // Use case: IF phone changed THEN show verify_phone
    // Requires setDefaultValues() to be called on form load.
    case 'changed': {
      const def = _defaultValues[fieldKey] ?? '';
      return actual !== '' && actual !== String(def).trim();
    }

    default:
      console.warn(`[RuleEngine] Unknown operator: "${operator}"`);
      return false;
  }
}

/**
 * Evaluate a condition group recursively.
 * Supports AND / OR combinators and nested groups up to MAX_NEST_DEPTH.
 */
export function evaluateGroup(group, formValues, depth = 0) {
  if (!group || !Array.isArray(group.conditions) || group.conditions.length === 0) {
    return true; // empty group = no condition = always passes
  }
  if (depth > MAX_NEST_DEPTH) {
    console.warn('[RuleEngine] Max nesting depth exceeded — treating as true');
    return true;
  }
  const combinator = (group.combinator || 'AND').toUpperCase();
  const results = group.conditions.map(cond =>
    Array.isArray(cond.conditions)
      ? evaluateGroup(cond, formValues, depth + 1)
      : evaluateCondition(cond, formValues)
  );
  return combinator === 'OR' ? results.some(Boolean) : results.every(Boolean);
}

// ─── Step 4: Apply all rules — main public API ────────────────────────────────

/**
 * Evaluate all conditional rules and return per-field state overrides.
 *
 * @param {Array}  fields      — fields with _parsedRule attached (use withParsedRules first)
 * @param {object} formValues  — current { fieldKey: value } map
 *
 * @returns {{
 *   [fieldKey]: {
 *     visible:       boolean,
 *     required:      boolean,
 *     disabled:      boolean,
 *     setValue:      string | null,
 *     copyValue:     string | null,   // NEW (v2) — value copied from sourceKey field
 *     filterOptions: string[] | null, // NEW (v2) — allowed options (null = all)
 *     min:           number | null,   // NEW (v2) — dynamic min bound
 *     max:           number | null,   // NEW (v2) — dynamic max bound
 *     label:         string | null,   // NEW (v2) — label override
 *     placeholder:   string | null,   // NEW (v2) — placeholder override
 *   }
 * }}
 *
 * Evaluation order: ascending fieldOrder → deterministic conflict resolution.
 * Cascading setValue: triggers re-evaluation, capped at MAX_PASSES.
 * Convergence: exits early when state stops changing between passes.
 */
export function applyRules(fields, formValues) {
  // Sort by fieldOrder — deterministic priority (higher order = later eval = wins conflicts)
  const ordered = [...fields].sort((a, b) => (a.fieldOrder ?? 0) - (b.fieldOrder ?? 0));

  function hasShowAction(rule) {
    if (!rule || !Array.isArray(rule.actions)) return false;
    return rule.actions.some(a => a.type === 'show');
  }

  function makeBaseState() {
    return Object.fromEntries(fields.map(f => [f.fieldKey, {
      visible: f._parsedRule && hasShowAction(f._parsedRule) ? false : true,
      required: !!f.required,
      disabled: !!f.disabled || !!f.readOnly,
      setValue: null,
      // ── NEW (v2) defaults ─────────────────────────────────────────────
      copyValue: null,   // null = no copy override
      filterOptions: null,   // null = show all options
      min: null,   // null = use field's own min
      max: null,   // null = use field's own max
      label: null,   // null = use field's own label
      placeholder: null,   // null = use field's own placeholder
    }]));
  }

  /**
   * Apply a single action onto state[field.fieldKey].
   * Extracted to avoid duplicating the switch in both the pass loop and final pass.
   */
  function applyAction(action, state, field, workingValues) {
    const key = field.fieldKey;
    switch (action.type) {
      // ── Existing actions ─────────────────────────────────────────────────
      case 'show': state[key].visible = true; break;
      case 'hide': state[key].visible = false; break;
      case 'makeRequired': state[key].required = true; break;
      case 'makeOptional': state[key].required = false; break;
      case 'enable': state[key].disabled = false; break;
      case 'disable': state[key].disabled = true; break;
      case 'setValue': state[key].setValue = action.setValue ?? ''; break;
      case 'clearValue': state[key].setValue = ''; break;

      // ── NEW (v2): copyValue ───────────────────────────────────────────────
      // Copies the live value of another field into this field.
      // action shape: { type: 'copyValue', sourceKey: 'shipping_address' }
      // Use case: Auto-fill billing address from shipping address.
      case 'copyValue': {
        const src = action.sourceKey;
        if (src && workingValues[src] !== undefined) {
          state[key].copyValue = String(workingValues[src] ?? '');
        } else {
          console.warn(`[RuleEngine] copyValue: sourceKey "${src}" not found in formValues`);
        }
        break;
      }

      // ── NEW (v2): filterOptions ───────────────────────────────────────────
      // Restricts visible options in a dropdown / radio / checkbox field.
      // action shape: { type: 'filterOptions', options: ['Option A', 'Option B'] }
      // Use case: IF country == "India" THEN filter state dropdown to Indian states.
      // Consumer: render only options whose value is in filterOptions. null = all.
      case 'filterOptions':
        state[key].filterOptions = Array.isArray(action.options) ? action.options : [];
        break;

      // ── NEW (v2): setMin ──────────────────────────────────────────────────
      // Sets a dynamic minimum bound for number or date fields.
      // action shape: { type: 'setMin', min: 18 }
      // Use case: IF employment == "Full-time" THEN setMin of hours to 30.
      case 'setMin':
        state[key].min = action.min != null ? Number(action.min) : null;
        break;

      // ── NEW (v2): setMax ──────────────────────────────────────────────────
      // Sets a dynamic maximum bound for number or date fields.
      // action shape: { type: 'setMax', max: 65 }
      // Use case: IF age < 18 THEN setMax of loan_amount to 0.
      case 'setMax':
        state[key].max = action.max != null ? Number(action.max) : null;
        break;

      // ── NEW (v2): setLabel ────────────────────────────────────────────────
      // Overrides the visible label text of the field at runtime.
      // action shape: { type: 'setLabel', label: 'Company Name' }
      // Use case: IF user_type == "Company" THEN setLabel of name → "Company Name".
      case 'setLabel':
        state[key].label = action.label ?? null;
        break;

      // ── NEW (v2): setPlaceholder ──────────────────────────────────────────
      // Overrides the placeholder/hint text of the field at runtime.
      // action shape: { type: 'setPlaceholder', placeholder: 'Enter company name...' }
      // Use case: Change contextual hint text based on other selections.
      case 'setPlaceholder':
        state[key].placeholder = action.placeholder ?? null;
        break;

      default: break;
    }
  }

  let workingValues = { ...formValues };
  let prevStateJson = '';

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const state = makeBaseState();

    for (const field of ordered) {
      if (!field._parsedRule) continue;
      if (!evaluateGroup(field._parsedRule, workingValues)) continue;
      for (const action of (field._parsedRule.actions || [])) {
        applyAction(action, state, field, workingValues);
      }
    }

    // Propagate setValue AND copyValue into workingValues for cascading next pass
    let anyValueChanged = false;
    for (const [key, st] of Object.entries(state)) {
      if (st.setValue !== null) {
        const newStr = String(st.setValue);
        const oldStr = String(workingValues[key] ?? '');
        if (newStr !== oldStr) {
          workingValues = { ...workingValues, [key]: st.setValue };
          anyValueChanged = true;
        }
      }
      // NEW (v2): copyValue also cascades so downstream rules see the copied value
      if (st.copyValue !== null) {
        const newStr = String(st.copyValue);
        const oldStr = String(workingValues[key] ?? '');
        if (newStr !== oldStr) {
          workingValues = { ...workingValues, [key]: st.copyValue };
          anyValueChanged = true;
        }
      }
    }

    // Convergence check — stop early if nothing changed
    const stateJson = JSON.stringify(state);
    const converged = !anyValueChanged && stateJson === prevStateJson;
    prevStateJson = stateJson;
    if (converged) break;
    if (!anyValueChanged) break; // no cascade needed
  }

  // Final pass with converged working values
  const finalState = makeBaseState();
  for (const field of ordered) {
    if (!field._parsedRule) continue;
    if (!evaluateGroup(field._parsedRule, workingValues)) continue;
    for (const action of (field._parsedRule.actions || [])) {
      applyAction(action, finalState, field, workingValues);
    }
  }

  // ── NEW: Propagation Logic for Field Groups ──────────────────────────
  // If a parent group is hidden, all its children must also be hidden.
  // We do this in-place on finalState.
  for (const field of ordered) {
    const parentKey = field.groupId || field.parentGroupKey;
    if (parentKey && finalState[parentKey]) {
      if (finalState[parentKey].visible === false) {
        finalState[field.fieldKey].visible = false;
      }
      if (finalState[parentKey].disabled === true) {
        finalState[field.fieldKey].disabled = true;
      }
    }
  }

  return finalState;
}

const RuleEngine = {
  withParsedRules,
  buildDependencyMap,
  getAffectedTargets,
  evaluateCondition,
  evaluateGroup,
  applyRules,
  setDefaultValues,
  MAX_PASSES,
  MAX_NEST_DEPTH,
  NO_VALUE_OPS,
};

export default RuleEngine;
