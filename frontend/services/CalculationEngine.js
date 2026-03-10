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

            // ── Whitespace ─────────────────────────────────────────────
            if (/\s/.test(ch)) { i++; continue; }

            // ── String literals: "…" or '…' ────────────────────────────
            if (ch === '"' || ch === "'") {
                const quote = ch;
                let str = '';
                i++;
                while (i < formula.length && formula[i] !== quote) {
                    if (formula[i] === '\\') i++; // ignore escape
                    str += formula[i];
                    i++;
                }
                tokens.push({ type: 'STRING', value: str });
                i++; // consume closing quote
                continue;
            }

            // ── Numbers (integer or decimal) ────────────────────────────
            if (/[0-9]/.test(ch)) {
                let numStr = '';
                let dotCount = 0;
                while (i < formula.length && /[0-9.]/.test(formula[i])) {
                    if (formula[i] === '.') {
                        dotCount++;
                        if (dotCount > 1) {
                            throw new Error(`Invalid number literal near "${numStr}."`);
                        }
                    }
                    numStr += formula[i];
                    i++;
                }
                tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
                continue;
            }

            // ── Identifiers / field keys ────────────────────────────────
            if (/[a-zA-Z_]/.test(ch)) {
                let key = '';
                while (i < formula.length && /[a-zA-Z0-9_]/.test(formula[i])) {
                    key += formula[i];
                    i++;
                }
                tokens.push({ type: 'KEY', value: key });
                continue;
            }

            // ── Operators ───────────────────────────────────────────────
            if ('+-*/()'.includes(ch)) {
                tokens.push({ type: 'OP', value: ch });
                i++;
                continue;
            }

            // ── Unknown character → reject ──────────────────────────────
            throw new Error(`Unexpected character "${ch}" in formula`);
        }

        // ── Post-tokenize: reject illegal consecutive op combos (++ ** etc.) ─
        for (let t = 0; t < tokens.length - 1; t++) {
            const cur = tokens[t];
            const next = tokens[t + 1];
            const bothArithOps = (tk) => tk.type === 'OP' && '+-*/'.includes(tk.value);
            if (bothArithOps(cur) && bothArithOps(next)) {
                throw new Error(`Invalid operator sequence "${cur.value}${next.value}"`);
            }
        }

        return tokens;
    },

    // ══════════════════════════════════════════════════════════════════════
    // 2. DEPENDENCY EXTRACTION
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Returns an array of fieldKey tokens found in the formula.
     * If availableFieldKeys is provided, only returns keys that exist in it.
     */
    extractDependencies(formula, availableFieldKeys = []) {
        if (!formula || typeof formula !== 'string') return [];

        let tokens;
        try { tokens = this.tokenize(formula); }
        catch { return []; }

        const keyTokens = tokens
            .filter(t => t.type === 'KEY')
            .map(t => t.value);

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

    /**
     * Evaluates the formula string against formValues.
     * Returns:
     *   • numeric result (number)
     *   • string result  (string)
     *   • null           (missing operand in arithmetic / invalid date)
     *   • ''             (formula is empty)
     */
    evaluateFormula(formula, formValues) {
        if (!formula || typeof formula !== 'string' || !formula.trim()) return '';

        let tokens;
        try {
            tokens = this.tokenize(formula);
        } catch (err) {
            console.error('CalculationEngine tokenize error:', err.message);
            return 'Error';
        }

        if (tokens.length === 0) return '';

        let pos = 0;

        // ── parseExpression → entry point ──────────────────────────────
        const parseExpression = () => parseAddition();

        // ── parseAddition: handles + and - ─────────────────────────────
        const parseAddition = () => {
            let left = parseMultiplication();

            while (pos < tokens.length && (tokens[pos].value === '+' || tokens[pos].value === '-')) {
                const op = tokens[pos++].value;
                const right = parseMultiplication();

                if (op === '+') {
                    // Rule §6: if either operand is string → concatenation, null → ""
                    if (typeof left === 'string' || typeof right === 'string' ||
                        left === MISSING || right === MISSING) {
                        const l = (left === MISSING || left === null || left === undefined) ? '' : left;
                        const r = (right === MISSING || right === null || right === undefined) ? '' : right;
                        // If both look non-string but one is MISSING treat whole as concat
                        left = String(l) + String(r);
                    } else {
                        // Rule §8: arithmetic: if either operand null/missing → result null
                        if (left === null || right === null) {
                            left = null;
                        } else {
                            left = left + right;
                        }
                    }
                } else {
                    // Rule §17: Subtraction — date math if both are date-like strings (result in days)
                    if (this.isDateLike(left) && this.isDateLike(right)) {
                        try {
                            const d1 = new Date(String(left).substring(0, 10));
                            const d2 = new Date(String(right).substring(0, 10));
                            if (!isNaN(d1) && !isNaN(d2)) {
                                const diffTime = d1 - d2;
                                left = Math.round(diffTime / (1000 * 60 * 60 * 24));
                            } else {
                                left = null;
                            }
                        } catch (e) {
                            left = null;
                        }
                    } else if (typeof left !== 'number' || typeof right !== 'number') {
                        // Strict check: if either is not numeric/MISSING after parsePrimary attempt
                        left = null;
                    } else if (left === null || right === null) {
                        left = null;
                    } else {
                        left = left - right;
                    }
                }
            }
            if (typeof left === 'number' && isNaN(left)) return null;
            return left;
        };

        // ── parseMultiplication: handles * and / ───────────────────────
        const parseMultiplication = () => {
            let left = parsePrimary();

            while (pos < tokens.length && (tokens[pos].value === '*' || tokens[pos].value === '/')) {
                const op = tokens[pos++].value;
                const right = parsePrimary();

                if (op === '*') {
                    if (typeof left !== 'number' || typeof right !== 'number') {
                        left = null;
                    } else if (left === null || right === null) {
                        left = null;
                    } else {
                        left = left * right;
                    }
                } else {
                    const divisor = (right === MISSING || right === null) ? null : right;
                    if (typeof left !== 'number' || typeof divisor !== 'number') {
                        left = null;
                    } else if (left === null || divisor === 0) {
                        left = null;
                    } else {
                        left = left / divisor;
                    }
                }
            }
            if (typeof left === 'number' && isNaN(left)) return null;
            return left;
        };

        // ── parsePrimary: atoms (numbers, strings, keys, parentheses) ──
        const parsePrimary = () => {
            if (pos >= tokens.length) return MISSING;

            const token = tokens[pos++];

            if (token.type === 'NUMBER') return token.value;
            if (token.type === 'STRING') return token.value;

            if (token.type === 'KEY') {
                const raw = formValues[token.value];
                // Distinguish "empty string" from "not filled in"
                if (raw === undefined || raw === null || raw === '') return MISSING;

                // If it looks like a number, parse it so arithmetic works (fix 2+3=23)
                // We only do this for KEY values, not explicit STRING literals ("123")
                if (typeof raw === 'string' && /^-?\d+(\.\d+)?$/.test(raw.trim())) {
                    const n = parseFloat(raw.trim());
                    if (!isNaN(n)) return n;
                }

                return raw;
            }

            if (token.type === 'OP' && token.value === '(') {
                const val = parseExpression();
                if (pos < tokens.length && tokens[pos].value === ')') pos++;
                return val;
            }

            return MISSING;
        };

        try {
            const result = parseExpression();
            if (result === MISSING || result === undefined) return '';
            return result === null ? null : result;
        } catch (err) {
            console.error('CalculationEngine eval error:', err.message);
            return 'Error';
        }
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
