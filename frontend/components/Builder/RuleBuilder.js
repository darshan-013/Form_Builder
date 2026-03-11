import { useState } from 'react';
import { NO_VALUE_OPS, MAX_NEST_DEPTH } from '../../services/RuleEngine';

/**
 * RuleBuilder — Visual IF/THEN conditional rule editor.
 *
 * Props:
 *   fields    [{fieldKey, label, fieldType, options:[{label,value}]}]  all sibling fields
 *   rulesJson string | null   current saved rulesJson for this field
 *   onChange  (string | null) => void  called whenever rule changes
 *
 * rulesJson output structure:
 * {
 *   combinator: "AND" | "OR",
 *   conditions: [ leafCondition | nestedGroup ],
 *   actions:    [ { type: string, setValue?: string } ]
 * }
 *
 * leafCondition = { fieldKey: string, operator: string, value: string }
 * nestedGroup   = { combinator: "AND"|"OR", conditions: [...] }
 *
 * Nesting is capped at MAX_NEST_DEPTH (3) both in UI and in RuleEngine.
 */

// ─── Operator definitions per field type ─────────────────────────────────────
const OPERATORS = {
  text: [
    'equals', 'not equals', 'contains', 'not contains', 'starts with', 'ends with',
    'is empty', 'is not empty',
    // NEW (v2)
    'matches regex', 'not matches regex', 'length >', 'length <', 'length =', 'changed',
  ],
  number: ['=', '!=', '>', '>=', '<', '<=', 'between',
    // NEW (v2)
    'changed',
  ],
  date: ['equals', 'before', 'after', 'between', 'is today', 'is past', 'is future',
    // NEW (v2)
    'changed',
  ],
  boolean: ['is true', 'is false'],
  dropdown: ['equals', 'not equals', 'in list', 'not in list',
    // NEW (v2)
    'changed',
  ],
  radio: ['equals', 'not equals', 'in list', 'not in list',
    // NEW (v2)
    'changed',
  ],
  multiple_choice: ['equals', 'not equals', 'in list', 'not in list',
    // NEW (v2)
    'changed',
  ],
  linear_scale: ['=', '!=', '>', '>=', '<', '<=', 'between', 'changed'],
  // Star Rating: fixed 1-5, use numeric operators
  star_rating: ['=', '!=', '>', '>=', '<', '<=', 'changed'],
  file: ['is uploaded', 'is not uploaded'],
  // Grid: conditions apply to row-level values stored as JSON {"Row":"Col"}
  // Use 'equals'/'not equals' with value = "Row:Col" or just the column value
  multiple_choice_grid: ['equals', 'not equals', 'is empty', 'is not empty', 'changed'],
  // Checkbox Grid: per-row multi-select values stored as JSON arrays
  checkbox_grid: ['contains', 'not contains', 'is empty', 'is not empty', 'changed'],
};

const ACTION_TYPES = [
  { value: 'show', label: '👁 Show Field' },
  { value: 'hide', label: '🙈 Hide Field' },
  { value: 'makeRequired', label: '* Make Required' },
  { value: 'makeOptional', label: '○ Make Optional' },
  { value: 'enable', label: '✓ Enable Field' },
  { value: 'disable', label: '⊘ Disable Field' },
  { value: 'setValue', label: '✏ Set Value' },
  { value: 'clearValue', label: '✕ Clear Value' },
  // NEW (v2)
  { value: 'copyValue', label: '📋 Copy Value From Field' },
  { value: 'filterOptions', label: '🔽 Filter Options' },
  { value: 'setMin', label: '⬇ Set Min Value' },
  { value: 'setMax', label: '⬆ Set Max Value' },
  { value: 'setLabel', label: '🏷 Set Label' },
  { value: 'setPlaceholder', label: '💬 Set Placeholder' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function opsForType(fieldType) {
  return OPERATORS[fieldType] || OPERATORS.text;
}

function emptyLeaf(fields) {
  const f = fields[0] || {};
  const ops = opsForType(f.fieldType || 'text');
  return { fieldKey: f.fieldKey || '', operator: ops[0], value: '' };
}

function emptyGroup(fields) {
  return { combinator: 'AND', conditions: [emptyLeaf(fields)] };
}

function emptyAction() {
  return { type: 'show', setValue: '' };
}

function safeParseRule(rulesJson, fields) {
  try {
    const r = rulesJson ? JSON.parse(rulesJson) : null;
    if (r && Array.isArray(r.conditions) && r.conditions.length > 0) {
      if (!r.actions || r.actions.length === 0) r.actions = [emptyAction()];
      return r;
    }
  } catch { /* fall through */ }
  return { ...emptyGroup(fields), actions: [emptyAction()] };
}

// ─── ValueInput ───────────────────────────────────────────────────────────────
function ValueInput({ fieldType, operator, options, value, onChange }) {
  if (NO_VALUE_OPS.has(operator)) return null;
  if (fieldType === 'boolean') return null;

  const style = { flex: 1, minWidth: 80 };

  // NEW (v2): regex operators — plain text input with pattern hint
  if (operator === 'matches regex' || operator === 'not matches regex') {
    return (
      <input className="form-input" style={style} value={value}
        placeholder="regex e.g. ^[A-Z].+"
        onChange={e => onChange(e.target.value)} />
    );
  }

  // NEW (v2): length operators — numeric input
  if (operator === 'length >' || operator === 'length <' || operator === 'length =') {
    return (
      <input type="number" className="form-input" style={style} value={value}
        placeholder="character count" min={0}
        onChange={e => onChange(e.target.value)} />
    );
  }

  // NEW (v2): count selected operators — numeric input
  if (operator === 'count selected >' || operator === 'count selected <' || operator === 'count selected =') {
    return (
      <input type="number" className="form-input" style={style} value={value}
        placeholder="count e.g. 3" min={0}
        onChange={e => onChange(e.target.value)} />
    );
  }

  // Dropdown/radio/multiple_choice — select from options list (unless in/not-in which needs csv text)
  if ((fieldType === 'dropdown' || fieldType === 'radio' || fieldType === 'multiple_choice') &&
    operator !== 'in list' && operator !== 'not in list') {
    if (!options || options.length === 0) {
      return (
        <input className="form-input" style={style} value={value}
          placeholder="type option value…"
          onChange={e => onChange(e.target.value)} />
      );
    }
    return (
      <select className="form-input" style={style} value={value}
        onChange={e => onChange(e.target.value)}>
        <option value="">— select —</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }

  if (fieldType === 'date' && operator !== 'between') {
    return (
      <input type="date" className="form-input" style={style} value={value}
        onChange={e => onChange(e.target.value)} />
    );
  }

  if (fieldType === 'number' && operator !== 'between') {
    return (
      <input type="number" className="form-input" style={style} value={value}
        onChange={e => onChange(e.target.value)} />
    );
  }

  const placeholder =
    operator === 'between'
      ? (fieldType === 'date' ? 'YYYY-MM-DD, YYYY-MM-DD' : 'min, max  e.g. 10,50')
      : (operator === 'in list' || operator === 'not in list')
        ? 'val1, val2, val3'
        : 'value';

  return (
    <input className="form-input" style={style} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)} />
  );
}

// ─── ConditionRow ─────────────────────────────────────────────────────────────
function ConditionRow({ cond, fields, onChange, onRemove, canRemove }) {
  const meta = fields.find(f => f.fieldKey === cond.fieldKey) || fields[0] || {};
  const fType = meta.fieldType || 'text';
  const ops = opsForType(fType);

  const handleFieldChange = fk => {
    const m = fields.find(f => f.fieldKey === fk) || {};
    const typ = m.fieldType || 'text';
    const op = opsForType(typ)[0];
    onChange({ fieldKey: fk, operator: op, value: '' });
  };

  const handleOpChange = op => {
    // Clear value when switching to a no-value operator
    onChange({ ...cond, operator: op, value: NO_VALUE_OPS.has(op) ? '' : cond.value });
  };

  return (
    <div className="rule-condition-row">
      <select className="form-input rule-field-select" value={cond.fieldKey}
        onChange={e => handleFieldChange(e.target.value)}>
        {fields.map(f => (
          <option key={f.fieldKey} value={f.fieldKey}>{f.label}</option>
        ))}
      </select>

      <select className="form-input rule-op-select" value={cond.operator}
        onChange={e => handleOpChange(e.target.value)}>
        {ops.map(op => (
          <option key={op} value={op}>{op}</option>
        ))}
      </select>

      <ValueInput
        fieldType={fType}
        operator={cond.operator}
        options={meta.options}
        value={cond.value || ''}
        onChange={v => onChange({ ...cond, value: v })}
      />

      {canRemove && (
        <button type="button" className="rule-remove-btn" onClick={onRemove}
          title="Remove condition">×</button>
      )}
    </div>
  );
}

// ─── ConditionGroup (recursive) ───────────────────────────────────────────────
function ConditionGroup({ group, fields, onChange, onRemove, depth }) {
  const setCombinator = c => onChange({ ...group, combinator: c });

  const updateChild = (i, child) =>
    onChange({ ...group, conditions: group.conditions.map((x, j) => j === i ? child : x) });

  const removeChild = i => {
    if (group.conditions.length <= 1) return;
    onChange({ ...group, conditions: group.conditions.filter((_, j) => j !== i) });
  };

  const addLeaf = () =>
    onChange({ ...group, conditions: [...group.conditions, emptyLeaf(fields)] });

  const addSubGroup = () => {
    if (depth >= MAX_NEST_DEPTH) return;
    onChange({ ...group, conditions: [...group.conditions, emptyGroup(fields)] });
  };

  return (
    <div className={`rule-group rule-group-depth-${Math.min(depth, 3)}`}>
      <div className="rule-group-header">
        <button type="button"
          className={`rule-combinator-btn${group.combinator === 'AND' ? ' active' : ''}`}
          onClick={() => setCombinator('AND')}>AND</button>
        <button type="button"
          className={`rule-combinator-btn${group.combinator === 'OR' ? ' active' : ''}`}
          onClick={() => setCombinator('OR')}>OR</button>
        <span className="rule-group-label">
          {depth === 0 ? 'all conditions must match' : 'nested group'}
        </span>
        {onRemove && (
          <button type="button" className="rule-remove-btn" style={{ marginLeft: 'auto' }}
            onClick={onRemove}>Remove Group</button>
        )}
      </div>

      <div className="rule-group-body">
        {group.conditions.map((child, i) => (
          Array.isArray(child.conditions) ? (
            <ConditionGroup
              key={i}
              group={child}
              fields={fields}
              depth={depth + 1}
              onChange={g => updateChild(i, g)}
              onRemove={group.conditions.length > 1 ? () => removeChild(i) : null}
            />
          ) : (
            <ConditionRow
              key={i}
              cond={child}
              fields={fields}
              onChange={c => updateChild(i, c)}
              onRemove={() => removeChild(i)}
              canRemove={group.conditions.length > 1}
            />
          )
        ))}
      </div>

      <div className="rule-group-footer">
        <button type="button" className="btn btn-secondary btn-sm rule-add-btn"
          onClick={addLeaf}>+ Condition</button>
        {depth < MAX_NEST_DEPTH && (
          <button type="button" className="btn btn-secondary btn-sm rule-add-btn"
            onClick={addSubGroup}>+ Group</button>
        )}
      </div>
    </div>
  );
}

// ─── ActionRow ────────────────────────────────────────────────────────────────
function ActionRow({ action, onChange, onRemove, canRemove, allFields, typeOptions = ACTION_TYPES }) {
  return (
    <div className="rule-condition-row">
      <select className="form-input" style={{ flex: '0 0 210px' }}
        value={action.type}
        onChange={e => onChange({ ...action, type: e.target.value })}>
        {typeOptions.map(a => (
          <option key={a.value} value={a.value}>{a.label}</option>
        ))}
      </select>

      {/* Existing: setValue */}
      {action.type === 'setValue' && (
        <input className="form-input" style={{ flex: 1 }}
          placeholder="Value to set on this field"
          value={action.setValue || ''}
          onChange={e => onChange({ ...action, setValue: e.target.value })} />
      )}

      {/* NEW (v2): copyValue — pick source field from dropdown */}
      {action.type === 'copyValue' && (
        <select className="form-input" style={{ flex: 1 }}
          value={action.sourceKey || ''}
          onChange={e => onChange({ ...action, sourceKey: e.target.value })}>
          <option value="">— select source field —</option>
          {allFields.map(f => (
            <option key={f.fieldKey} value={f.fieldKey}>{f.label}</option>
          ))}
        </select>
      )}

      {/* NEW (v2): filterOptions — comma-separated list of allowed values */}
      {action.type === 'filterOptions' && (
        <input className="form-input" style={{ flex: 1 }}
          placeholder="Allowed options e.g. Option A, Option B"
          value={Array.isArray(action.options) ? action.options.join(', ') : (action.options || '')}
          onChange={e => onChange({
            ...action,
            options: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
          })} />
      )}

      {/* NEW (v2): setMin */}
      {action.type === 'setMin' && (
        <input type="number" className="form-input" style={{ flex: 1 }}
          placeholder="Min value e.g. 18"
          value={action.min ?? ''}
          onChange={e => onChange({ ...action, min: e.target.value })} />
      )}

      {/* NEW (v2): setMax */}
      {action.type === 'setMax' && (
        <input type="number" className="form-input" style={{ flex: 1 }}
          placeholder="Max value e.g. 65"
          value={action.max ?? ''}
          onChange={e => onChange({ ...action, max: e.target.value })} />
      )}

      {/* NEW (v2): setLabel */}
      {action.type === 'setLabel' && (
        <input className="form-input" style={{ flex: 1 }}
          placeholder="New label text e.g. Company Name"
          value={action.label || ''}
          onChange={e => onChange({ ...action, label: e.target.value })} />
      )}

      {/* NEW (v2): setPlaceholder */}
      {action.type === 'setPlaceholder' && (
        <input className="form-input" style={{ flex: 1 }}
          placeholder="New placeholder text e.g. Enter company name..."
          value={action.placeholder || ''}
          onChange={e => onChange({ ...action, placeholder: e.target.value })} />
      )}

      {canRemove && (
        <button type="button" className="rule-remove-btn" onClick={onRemove}>×</button>
      )}
    </div>
  );
}

// ─── RuleBuilder (main export) ────────────────────────────────────────────────
export default function RuleBuilder({ fields, rulesJson, onChange, isGroup = false }) {
  const [enabled, setEnabled] = useState(!!rulesJson);
  const [rule, setRule] = useState(() => safeParseRule(rulesJson, fields));

  // Need at least 2 fields (this field + one source to condition on)
  if (fields.length === 0) {
    return (
      <p className="form-help" style={{ paddingTop: 4 }}>
        Add at least one other field to the form before configuring conditional rules.
      </p>
    );
  }

  const commit = updated => {
    setRule(updated);
    onChange(JSON.stringify(updated));
  };

  const toggle = on => {
    setEnabled(on);
    if (!on) {
      onChange(null); // clears rulesJson on the field
    } else {
      const fresh = safeParseRule(rulesJson, fields);
      setRule(fresh);
      onChange(JSON.stringify(fresh));
    }
  };

  const updateConditionGroup = g =>
    commit({ ...rule, combinator: g.combinator, conditions: g.conditions });

  const updateAction = (i, a) =>
    commit({ ...rule, actions: rule.actions.map((x, j) => j === i ? a : x) });

  const removeAction = i =>
    commit({ ...rule, actions: rule.actions.filter((_, j) => j !== i) });

  const addAction = () =>
    commit({ ...rule, actions: [...(rule.actions || []), emptyAction()] });

  return (
    <div className="rule-builder">
      {/* Enable toggle */}
      <label className="form-checkbox-row compact" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={enabled} onChange={e => toggle(e.target.checked)} />
        <span>Enable conditional rules for this {isGroup ? 'section' : 'field'}</span>
      </label>

      {!enabled && (
        <p className="form-help">
          When enabled, this {isGroup ? 'section\'s' : 'field\'s'} visibility and state change automatically based on
          values entered in other fields. Note: Section rules apply to all nested fields.
        </p>
      )}

      {enabled && (
        <>
          {/* IF — conditions */}
          <div className="rule-section">
            <div className="rule-section-label">🔍 IF (conditions)</div>
            <ConditionGroup
              group={{ combinator: rule.combinator, conditions: rule.conditions }}
              fields={fields}
              depth={0}
              onRemove={null}
              onChange={updateConditionGroup}
            />
          </div>

          {/* THEN — actions */}
          <div className="rule-section" style={{ marginTop: 10 }}>
            <div className="rule-section-label">⚡ THEN (actions on this {isGroup ? 'section' : 'field'})</div>

            {(rule.actions || []).map((action, i) => (
              <ActionRow
                key={i}
                action={action}
                onChange={a => updateAction(i, a)}
                onRemove={() => removeAction(i)}
                canRemove={(rule.actions || []).length > 1}
                allFields={fields}
                isGroup={isGroup}
                typeOptions={isGroup ? [
                  { value: 'show', label: '👁 Show Section' },
                  { value: 'hide', label: '🙈 Hide Section' },
                  { value: 'makeRequired', label: '* Make All Fields Required' },
                  { value: 'makeOptional', label: '○ Make All Fields Optional' },
                  { value: 'enable', label: '✓ Enable Section' },
                  { value: 'disable', label: '⊘ Disable Section' },
                ] : ACTION_TYPES}
              />
            ))}

            <button type="button" className="btn btn-secondary btn-sm rule-add-btn"
              style={{ marginTop: 6 }} onClick={addAction}>
              + Add Action
            </button>
          </div>

          {/* Help */}
          <div className="rule-info-box">
            <strong>Priority:</strong> Fields are evaluated top-to-bottom by their order in the form.
            If two rules conflict (e.g. one hides and one shows this field), the rule from
            the <em>lower field</em> wins. Use Preview to test behaviour before publishing.
            Cascading <em>Set Value</em> actions re-evaluate up to 5 times.
          </div>
        </>
      )}
    </div>
  );
}
