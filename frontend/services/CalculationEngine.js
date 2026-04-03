/**
 * CalculationEngine — Production-grade, safe formula evaluator for the Form Builder.
 *
 * ✅ No eval() / new Function()
 * ✅ Custom tokenizer + recursive descent parser
 * ✅ Arithmetic: + - * / ()
 * ✅ String concatenation (null → "")
 * ✅ Date subtraction → days
 * ✅ Divide-by-zero protection
 * ✅ Null / missing value rules (arithmetic → null, concat → "")
 * ✅ Cascading calculations (MAX_PASSES = 10)
 * ✅ Circular dependency detection via DFS
 * ✅ Precision applied only to numeric results
 */

// ─── SENTINEL so arithmetic can distinguish "missing" from numeric 0 ─────────
const MISSING = Symbol('MISSING');

const CalculationEngine = {

    // ══════════════════════════════════════════════════════════════════════
    // 1. TOKENIZER
    // ══════════════════════════════════════════════════════════════════════

    /**
     * convert formula string → token array.
     * Token: { type: 'NUMBER'|'STRING'|'KEY'|'OP', value: any }
     *
     * Rejects:
     *   • multi-decimal numbers like 12.3.4  → throws
     *   • unknown characters                 → throws
     */
    tokenize(formula) {
        if (typeof formula !== 'string' || !formula.trim()) return [];

        const tokens = [];
        let i = 0;

        while (i < formula.length) {
            const ch = formula[i];

            if (/\s/.test(ch)) { i++; continue; }

            if (ch === '"' || ch === "'") {
                const quote = ch;
                let str = ''; i++;
                while (i < formula.length && formula[i] !== quote) {
                    if (formula[i] === '\\') i++;
                    str += formula[i++];
                }
                tokens.push({ type: 'STRING', value: str });
                i++; continue;
            }

            if (/[0-9]/.test(ch)) {
                let numStr = '';
                let dotCount = 0;
                while (i < formula.length && /[0-9.]/.test(formula[i])) {
                    if (formula[i] === '.') {
                        dotCount++;
                        if (dotCount > 1) throw new Error(`Invalid number literal near "${numStr}."`);
                    }
                    numStr += formula[i++];
                }
                tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
                continue;
            }

            if (/[a-zA-Z_]/.test(ch)) {
                let key = '';
                while (i < formula.length && /[a-zA-Z0-9_]/.test(formula[i])) {
                    key += formula[i++];
                }
                tokens.push({ type: 'KEY', value: key });
                continue;
            }

            // Multi-char operators
            const two = formula.slice(i, i + 2);
            if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) {
                tokens.push({ type: 'OP', value: two });
                i += 2; continue;
            }

            if ('+-*/()<>!'.includes(ch)) {
                tokens.push({ type: 'OP', value: ch });
                i++; continue;
            }

            throw new Error(`Unexpected character "${ch}" in formula`);
        }
        return tokens;
    },

    // ══════════════════════════════════════════════════════════════════════
    // 2. DEPENDENCY EXTRACTION
    // ══════════════════════════════════════════════════════════════════════

    extractDependencies(formula, availableFieldKeys = []) {
        if (!formula || typeof formula !== 'string') return [];
        let tokens;
        try { tokens = this.tokenize(formula); } catch { return []; }
        const keyTokens = tokens.filter(t => t.type === 'KEY').map(t => t.value);
        const unique = [...new Set(keyTokens)];
        if (availableFieldKeys.length > 0) {
            const allowed = new Set(availableFieldKeys);
            return unique.filter(k => allowed.has(k));
        }
        return unique;
    },

    // ══════════════════════════════════════════════════════════════════════
    // 3. SAFE EXPRESSION PARSER  (recursive descent)
    // ══════════════════════════════════════════════════════════════════════

    evaluateFormula(formula, formValues) {
        if (!formula || typeof formula !== 'string' || !formula.trim()) return '';

        let tokens = this.tokenize(formula);

        if (tokens.length === 0) return '';
        let pos = 0;

        const toBool = (v) => {
            if (typeof v === 'boolean') return v;
            if (v === null || v === undefined || v === MISSING) return false;
            const s = String(v).toLowerCase();
            return s === 'true' || s === '1' || s === 'yes';
        };

        const compare = (l, r) => {
            const left = l === MISSING ? null : l;
            const right = r === MISSING ? null : r;
            if (left === null && right === null) return 0;
            if (left === null) return -1;
            if (right === null) return 1;

            if (typeof left === 'number' && typeof right === 'number') {
                return left - right;
            }
            // Auto-coercion
            if (typeof left === 'number' || typeof right === 'number') {
                const nl = parseFloat(left);
                const nr = parseFloat(right);
                if (!isNaN(nl) && !isNaN(nr)) return nl - nr;
            }
            return String(left).localeCompare(String(right), undefined, { sensitivity: 'base' });
        };

        const parseLogicalOr = () => {
            let left = parseLogicalAnd();
            while (pos < tokens.length && tokens[pos].value === '||') {
                pos++;
                const right = parseLogicalAnd();
                left = toBool(left) || toBool(right);
            }
            return left;
        };

        const parseLogicalAnd = () => {
            let left = parseEquality();
            while (pos < tokens.length && tokens[pos].value === '&&') {
                pos++;
                const right = parseEquality();
                left = toBool(left) && toBool(right);
            }
            return left;
        };

        const parseEquality = () => {
            let left = parseComparison();
            while (pos < tokens.length && (tokens[pos].value === '==' || tokens[pos].value === '!=')) {
                const op = tokens[pos++].value;
                const right = parseComparison();
                left = (op === '==') ? compare(left, right) === 0 : compare(left, right) !== 0;
            }
            return left;
        };

        const parseComparison = () => {
            let left = parseAddition();
            while (pos < tokens.length && ['<', '<=', '>', '>='].includes(tokens[pos].value)) {
                const op = tokens[pos++].value;
                const right = parseAddition();
                const cmp = compare(left, right);
                left = op === '<' ? cmp < 0 : op === '<=' ? cmp <= 0 : op === '>' ? cmp > 0 : cmp >= 0;
            }
            return left;
        };

        const parseAddition = () => {
            let left = parseMultiplication();
            while (pos < tokens.length && (tokens[pos].value === '+' || tokens[pos].value === '-')) {
                const op = tokens[pos++].value;
                const right = parseMultiplication();
                if (op === '+') {
                    if (typeof left === 'string' || typeof right === 'string' || left === MISSING || right === MISSING) {
                        const l = (left === MISSING || left === null) ? '' : left;
                        const r = (right === MISSING || right === null) ? '' : right;
                        left = String(l) + String(r);
                    } else {
                        left = (left === null || right === null) ? null : Number(left) + Number(right);
                    }
                } else {
                    if (this.isDateLike(left) && this.isDateLike(right)) {
                        const d1 = new Date(String(left).substring(0, 10));
                        const d2 = new Date(String(right).substring(0, 10));
                        left = (!isNaN(d1) && !isNaN(d2)) ? Math.round((d1 - d2) / (1000 * 60 * 60 * 24)) : null;
                    } else {
                        left = (typeof left !== 'number' || typeof right !== 'number') ? null : left - right;
                    }
                }
            }
            return left;
        };

        const parseMultiplication = () => {
            let left = parseUnary();
            while (pos < tokens.length && (tokens[pos].value === '*' || tokens[pos].value === '/')) {
                const op = tokens[pos++].value;
                const right = parseUnary();
                if (left === null || right === null || left === MISSING || right === MISSING) {
                    left = null;
                } else if (op === '*') {
                    left = Number(left) * Number(right);
                } else {
                    if (Number(right) === 0) throw new Error(`Division by zero in formula: "${formula}"`);
                    left = Number(left) / Number(right);
                }
            }
            return left;
        };

        const parseUnary = () => {
            if (pos < tokens.length && tokens[pos].value === '!') {
                pos++;
                return !toBool(parsePrimary());
            }
            return parsePrimary();
        };

        const parsePrimary = () => {
            if (pos >= tokens.length) return MISSING;
            const t = tokens[pos++];
            if (t.type === 'NUMBER' || t.type === 'STRING') return t.value;
            if (t.type === 'KEY') {
                const raw = formValues[t.value];
                if (raw === undefined || raw === null || raw === '') return MISSING;
                if (typeof raw === 'string' && /^-?\d+(\.\d+)?$/.test(raw.trim())) {
                    const n = parseFloat(raw.trim());
                    if (!isNaN(n)) return n;
                }
                return raw;
            }
            if (t.type === 'OP' && t.value === '(') {
                const val = parseLogicalOr();
                if (pos < tokens.length && tokens[pos].value === ')') pos++;
                else throw new Error(`Missing closing parenthesis in formula: "${formula}"`);
                return val;
            }
            throw new Error(`Unexpected token "${t.value}" in formula: "${formula}"`);
        };

        const result = parseLogicalOr();
        if (pos < tokens.length) throw new Error(`Unexpected trailing tokens in formula: "${formula}"`);
        return result === MISSING ? '' : result;
    },

    // ── Helper: Detect ISO-like date strings ───────────────────────────
    isDateLike(v) {
        if (typeof v !== 'string') return false;
        return v.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(v);
    },

    // ══════════════════════════════════════════════════════════════════════
    // 4. RECALCULATE ALL CALCULATED FIELDS  (cascading, stabilized)
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Iteratively recalculates all calculated fields.
     * Stops when no values change between passes (stabilization) or MAX_PASSES reached.
     *
     * Rule §13: hidden fields are still updated (engine doesn't check visibility).
     */
    recalculateCalculatedFields(fields, formValues) {
        const calculatedFields = (fields || []).filter(f => f.isCalculated && f.formulaExpression);
        if (calculatedFields.length === 0) return formValues;

        const values = { ...formValues };
        const MAX_PASSES = 10;
        let changed = true;
        let passes = 0;

        while (changed && passes < MAX_PASSES) {
            changed = false;
            passes++;

            for (const field of calculatedFields) {
                let raw = this.evaluateFormula(field.formulaExpression, values);

                // ── Rule §10: apply precision only to numeric results ───
                if (typeof raw === 'number' && !isNaN(raw)) {
                    const p = (field.precision !== null && field.precision !== undefined)
                        ? field.precision
                        : 2;
                    raw = parseFloat(raw.toFixed(p));
                    // Remove unnecessary trailing zeros from integer results
                    if (raw % 1 === 0 && p > 0) raw = raw;
                }

                // ── Null / empty normalisation for comparison ─────────
                const prev = values[field.fieldKey];
                const prevStr = (prev === null || prev === undefined || (typeof prev === 'number' && isNaN(prev))) ? '' : String(prev).trim();
                const nextStr = (raw === null || raw === undefined || (typeof raw === 'number' && isNaN(raw))) ? '' : String(raw).trim();

                if (prevStr !== nextStr) {
                    values[field.fieldKey] = (raw === null || (typeof raw === 'number' && isNaN(raw))) ? null : raw;
                    changed = true;
                }
            }
        }

        if (changed && passes >= MAX_PASSES) {
            console.warn('CalculationEngine: formulas did not stabilize after', MAX_PASSES, 'passes. Check for circular dependencies.');
        }

        return values;
    },

    // ══════════════════════════════════════════════════════════════════════
    // 5. FORMULA VALIDATION  (for FieldConfigModal save guard)
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Returns null if valid, or an error string describing what failed.
     *
     * Checks:
     *   • Non-empty
     *   • Parseable (tokenizer doesn't throw)
     *   • All KEY tokens resolve to known fields
     *   • Self-dependency
     *   • Circular dependency (DFS)
     */
    validateFormula(fieldKey, formula, allFields) {
        if (!formula || !formula.trim()) return 'Formula cannot be empty.';

        // Tokenizer validation
        let tokens;
        try {
            tokens = this.tokenize(formula);
        } catch (err) {
            return `Syntax error: ${err.message}`;
        }

        const availableKeys = new Set((allFields || []).map(f => f.fieldKey));
        const referencedKeys = tokens.filter(t => t.type === 'KEY').map(t => t.value);

        // Check all referenced keys exist
        for (const k of referencedKeys) {
            if (!availableKeys.has(k)) {
                return `Unknown field "${k}". Available: ${[...availableKeys].join(', ')}`;
            }
        }

        // Self-dependency check
        if (referencedKeys.includes(fieldKey)) {
            return `Field "${fieldKey}" cannot reference itself.`;
        }

        // ── Circular dependency check (DFS) ───────────────────────────
        // Build adjacency: for each calculated field (plus the one being saved) list its deps
        const adj = {};
        for (const f of (allFields || [])) {
            if (f.fieldKey === fieldKey) {
                // Use the NEW formula to check
                adj[f.fieldKey] = referencedKeys.filter(k => availableKeys.has(k));
            } else if (f.isCalculated && f.formulaExpression) {
                adj[f.fieldKey] = this.extractDependencies(f.formulaExpression, [...availableKeys]);
            } else {
                adj[f.fieldKey] = [];
            }
        }

        const visited = new Set();
        const inStack = new Set();

        const hasCycle = (node) => {
            if (inStack.has(node)) return true;
            if (visited.has(node)) return false;
            visited.add(node);
            inStack.add(node);
            for (const neighbor of (adj[node] || [])) {
                if (hasCycle(neighbor)) return true;
            }
            inStack.delete(node);
            return false;
        };

        if (hasCycle(fieldKey)) {
            return 'Circular dependency detected. This formula creates a cycle.';
        }

        return null; // ✅ valid
    },
};

export default CalculationEngine;
