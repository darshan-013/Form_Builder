import CalculationEngine from './CalculationEngine';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * RuleEngine.js  —  Unified Boolean Expression Rule Engine
 * ══════════════════════════════════════════════════════════════════════════
 */

export const MAX_PASSES = 5;
export const MAX_NEST_DEPTH = 3;

export const NO_VALUE_OPS = new Set([
  'is empty', 'is not empty', 'is true', 'is false',
  'is today', 'is past', 'is future', 'is uploaded', 'is not uploaded',
  'changed',
]);

const _defaultValues = {};
export function setDefaultValues(defaults) {
  Object.assign(_defaultValues, defaults);
}

/**
 * Attaches `_parsedRule` to each field.
 * If rulesJson is valid JSON, it parses it.
 * If it's a raw string, it wraps it in a default 'show' action.
 */
export function withParsedRules(fields) {
  return (fields || []).map(f => {
    if (!f.rulesJson || !f.rulesJson.trim()) return { ...f, _parsedRule: null };
    try {
      const parsed = JSON.parse(f.rulesJson);
      return { ...f, _parsedRule: parsed };
    } catch {
      // Treat as a raw expression string for visibility
      return { 
        ...f, 
        _parsedRule: { 
          expression: f.rulesJson, 
          actions: [{ type: 'show' }] 
        } 
      };
    }
  });
}

/**
 * Returns { [sourceFieldKey]: Set<targetFieldKey> }
 */
export function buildDependencyMap(fields) {
  const map = {};
  for (const f of (fields || [])) {
    if (!f._parsedRule) continue;
    
    // Extract deps from either new 'expression' or legacy 'conditions'
    const deps = f._parsedRule.expression 
      ? CalculationEngine.extractDependencies(f._parsedRule.expression)
      : extractLegacySourceKeys(f._parsedRule);
      
    for (const src of deps) {
      if (!map[src]) map[src] = new Set();
      map[src].add(f.fieldKey);
    }
  }
  return map;
}

function extractLegacySourceKeys(node) {
  if (!node) return [];
  if (Array.isArray(node.conditions)) {
    return node.conditions.flatMap(c => extractLegacySourceKeys(c));
  }
  if (node.fieldKey) return [node.fieldKey];
  return [];
}

export function getAffectedTargets(depMap, changedKey) {
  return Array.from(depMap[changedKey] || []);
}

/**
 * Evaluates a boolean expression using CalculationEngine.
 */
export function evaluateConditionExpression(expression, formValues) {
  if (!expression) return true;
  try {
    const result = CalculationEngine.evaluateFormula(expression, formValues);
    if (typeof result === 'boolean') return result;
    if (typeof result === 'number') return result !== 0;
    if (typeof result === 'string') return result.trim().length > 0;
    return !!result;
  } catch (err) {
    console.warn(`[RuleEngine] Evaluation failed for "${expression}":`, err.message);
    return false; // Fail-safe for visibility: hide if formula is broken
  }
}

/**
 * Main Entry Point: Evaluates all rules and returns field states.
 */
export function applyRules(fields, formValues) {
  const ordered = [...(fields || [])].sort((a, b) => (a.fieldOrder ?? 0) - (b.fieldOrder ?? 0));

  function hasShowAction(rule) {
    if (!rule || !Array.isArray(rule.actions)) return false;
    return rule.actions.some(a => a.type === 'show');
  }

  function makeBaseState() {
    return Object.fromEntries(ordered.map(f => [f.fieldKey, {
      visible: f._parsedRule && hasShowAction(f._parsedRule) ? false : true,
      required: !!f.required,
      disabled: !!f.disabled || !!f.readOnly,
      setValue: null,
      copyValue: null,
      filterOptions: null,
      min: null,
      max: null,
      label: null,
      placeholder: null,
    }]));
  }

  function applyAction(action, state, field, workingValues) {
    const key = field.fieldKey;
    switch (action.type) {
      case 'show': state[key].visible = true; break;
      case 'hide': state[key].visible = false; break;
      case 'makeRequired': state[key].required = true; break;
      case 'makeOptional': state[key].required = false; break;
      case 'enable': state[key].disabled = false; break;
      case 'disable': state[key].disabled = true; break;
      case 'setValue': state[key].setValue = action.setValue ?? ''; break;
      case 'clearValue': state[key].setValue = ''; break;
      case 'copyValue': {
        const src = action.sourceKey;
        if (src && workingValues[src] !== undefined) {
          state[key].copyValue = String(workingValues[src] ?? '');
        }
        break;
      }
      case 'filterOptions':
        state[key].filterOptions = Array.isArray(action.options) ? action.options : null;
        break;
      case 'setMin':
        state[key].min = action.min != null ? Number(action.min) : null;
        break;
      case 'setMax':
        state[key].max = action.max != null ? Number(action.max) : null;
        break;
      case 'setLabel':
        state[key].label = action.label ?? null;
        break;
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
      const rule = field._parsedRule;
      if (!rule) continue;

      let isMatch = false;
      if (rule.expression) {
        isMatch = evaluateConditionExpression(rule.expression, workingValues);
      } else if (Array.isArray(rule.conditions)) {
        // Legacy JSON support fallback
        isMatch = true; 
      }

      if (isMatch) {
        for (const action of (rule.actions || [])) {
          applyAction(action, state, field, workingValues);
        }
      }
    }

    let anyValueChanged = false;
    for (const [key, st] of Object.entries(state)) {
      const newVal = st.setValue !== null ? st.setValue : st.copyValue;
      if (newVal !== null) {
        if (String(newVal) !== String(workingValues[key] ?? '')) {
          workingValues[key] = newVal;
          anyValueChanged = true;
        }
      }
    }

    const stateJson = JSON.stringify(state);
    if (!anyValueChanged && stateJson === prevStateJson) break;
    prevStateJson = stateJson;
  }

  // Final propagation for groups
  const finalState = makeBaseState();
  // ... run one last pass to build finalState ...
  for (const field of ordered) {
      const rule = field._parsedRule;
      if (!rule) continue;
      const isMatch = rule.expression ? evaluateConditionExpression(rule.expression, workingValues) : true;
      if (isMatch) {
          for (const action of (rule.actions || [])) {
              applyAction(action, finalState, field, workingValues);
          }
      }
  }

  // Group nesting logic
  for (const field of ordered) {
    const parentKey = field.groupId || field.parentGroupKey;
    if (parentKey && finalState[parentKey]) {
      if (finalState[parentKey].visible === false) finalState[field.fieldKey].visible = false;
      if (finalState[parentKey].disabled === true) finalState[field.fieldKey].disabled = true;
    }
  }

  return finalState;
}

const RuleEngine = {
  withParsedRules,
  buildDependencyMap,
  getAffectedTargets,
  evaluateConditionExpression,
  applyRules,
  setDefaultValues,
  MAX_PASSES,
  MAX_NEST_DEPTH,
  NO_VALUE_OPS,
};

export default RuleEngine;
