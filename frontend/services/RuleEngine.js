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
 * ══════════════════════════════════════════════════════════════════════════
 */

export const MAX_PASSES     = 5;
export const MAX_NEST_DEPTH = 3;

/** Operators that need no value input in the condition row */
export const NO_VALUE_OPS = new Set([
  'is empty', 'is not empty', 'is true', 'is false',
  'is today', 'is past', 'is future', 'is uploaded', 'is not uploaded',
]);

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
  const actual    = rawActual == null ? '' : String(rawActual).trim();
  const expected  = ruleVal   == null ? '' : String(ruleVal).trim();

  switch (operator) {
    // ── Universal ─────────────────────────────────────────────────────────
    case 'equals':
    case '=':            return actual === expected;
    case 'not equals':
    case '!=':           return actual !== expected;
    case 'is empty':     return actual === '';
    case 'is not empty': return actual !== '';

    // ── Number (7 operators) ──────────────────────────────────────────────
    case '>':   return Number(actual) >  Number(expected);
    case '>=':  return Number(actual) >= Number(expected);
    case '<':   return Number(actual) <  Number(expected);
    case '<=':  return Number(actual) <= Number(expected);
    case 'between': {
      const parts = expected.split(',');
      const lo = Number(parts[0]?.trim());
      const hi = Number(parts[1]?.trim());
      const n  = Number(actual);
      return !isNaN(n) && !isNaN(lo) && !isNaN(hi) && n >= lo && n <= hi;
    }

    // ── Text (8 operators) ────────────────────────────────────────────────
    case 'contains':     return actual.toLowerCase().includes(expected.toLowerCase());
    case 'not contains': return !actual.toLowerCase().includes(expected.toLowerCase());
    case 'starts with':  return actual.toLowerCase().startsWith(expected.toLowerCase());
    case 'ends with':    return actual.toLowerCase().endsWith(expected.toLowerCase());

    // ── Date (7 operators) ────────────────────────────────────────────────
    case 'before':    return actual !== '' && expected !== '' && actual < expected;
    case 'after':     return actual !== '' && expected !== '' && actual > expected;
    case 'is today':  return actual === new Date().toISOString().slice(0, 10);
    case 'is past':   return actual !== '' && actual < new Date().toISOString().slice(0, 10);
    case 'is future': return actual !== '' && actual > new Date().toISOString().slice(0, 10);

    // ── Boolean (2 operators) ─────────────────────────────────────────────
    case 'is true':  return rawActual === true  || rawActual === 'true';
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
    case 'is uploaded':     return actual !== '' && rawActual != null;
    case 'is not uploaded': return actual === '' || rawActual == null;

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
 * @returns {{ [fieldKey]: { visible: bool, required: bool, disabled: bool, setValue: string|null } }}
 *
 * Evaluation order: ascending fieldOrder → deterministic conflict resolution.
 * Cascading setValue: triggers re-evaluation, capped at MAX_PASSES.
 * Convergence: exits early when state stops changing between passes.
 */
export function applyRules(fields, formValues) {
  // Sort by fieldOrder — deterministic priority (higher order = later eval = wins conflicts)
  const ordered = [...fields].sort((a, b) => (a.fieldOrder ?? 0) - (b.fieldOrder ?? 0));

  /**
   * Determine the default visibility for each field BEFORE rules run.
   *
   * Rule: if a field's rule contains ANY 'show' action, it means the admin
   * intends "only show this field when the condition is true".
   * Therefore the field must START hidden and become visible only when the
   * condition passes.
   *
   * If the rule contains only 'hide' actions (no 'show'), the field starts
   * visible and gets hidden when the condition passes — which is the
   * classic "hide when X" use case.
   *
   * Fields with no rule at all always start visible.
   */
  function hasShowAction(rule) {
    if (!rule || !Array.isArray(rule.actions)) return false;
    return rule.actions.some(a => a.type === 'show');
  }

  function makeBaseState() {
    return Object.fromEntries(fields.map(f => [f.fieldKey, {
      // If field has a 'show' action in its rule → start hidden (shown only when condition passes)
      // Otherwise → start visible (normal default)
      visible:  f._parsedRule && hasShowAction(f._parsedRule) ? false : true,
      required: !!f.required,
      disabled: false,
      setValue: null,   // null = no override from rules
    }]));
  }

  let workingValues = { ...formValues };
  let prevStateJson = '';

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const state = makeBaseState();

    for (const field of ordered) {
      if (!field._parsedRule) continue;

      if (!evaluateGroup(field._parsedRule, workingValues)) continue;

      // Apply actions — last action of each type wins within this field's rule
      for (const action of (field._parsedRule.actions || [])) {
        switch (action.type) {
          case 'show':         state[field.fieldKey].visible  = true;  break;
          case 'hide':         state[field.fieldKey].visible  = false; break;
          case 'makeRequired': state[field.fieldKey].required = true;  break;
          case 'makeOptional': state[field.fieldKey].required = false; break;
          case 'enable':       state[field.fieldKey].disabled = false; break;
          case 'disable':      state[field.fieldKey].disabled = true;  break;
          case 'setValue':
            state[field.fieldKey].setValue = action.setValue ?? '';
            break;
          case 'clearValue':
            state[field.fieldKey].setValue = '';
            break;
          default: break;
        }
      }
    }

    // Propagate setValue into workingValues for the next pass (cascading)
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
      switch (action.type) {
        case 'show':         finalState[field.fieldKey].visible  = true;  break;
        case 'hide':         finalState[field.fieldKey].visible  = false; break;
        case 'makeRequired': finalState[field.fieldKey].required = true;  break;
        case 'makeOptional': finalState[field.fieldKey].required = false; break;
        case 'enable':       finalState[field.fieldKey].disabled = false; break;
        case 'disable':      finalState[field.fieldKey].disabled = true;  break;
        case 'setValue':     finalState[field.fieldKey].setValue = action.setValue ?? ''; break;
        case 'clearValue':   finalState[field.fieldKey].setValue = ''; break;
        default: break;
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
  MAX_PASSES,
  MAX_NEST_DEPTH,
  NO_VALUE_OPS,
};

export default RuleEngine;
