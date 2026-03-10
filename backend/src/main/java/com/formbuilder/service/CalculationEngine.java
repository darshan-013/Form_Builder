package com.formbuilder.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * CalculationEngine — backend formula evaluator for calculated form fields.
 *
 * ✅ NO eval() / reflection / Script engine
 * ✅ Custom tokenizer + recursive-descent parser
 * ✅ Arithmetic: + - * / ()
 * ✅ String concatenation (null → "")
 * ✅ Date subtraction (LocalDate.of → days)
 * ✅ Divide-by-zero → null
 * ✅ Cascading calculated fields (MAX_PASSES = 10)
 * ✅ Precision applied only to numeric results
 *
 * FUTURE: add SUM(), AVG(), ROUND() by extending parsePrimary().
 */
@Slf4j
@Service
public class CalculationEngine {

    // ═════════════════════════════════════════════════════════════════════
    // TOKEN TYPES
    // ═════════════════════════════════════════════════════════════════════

    private enum TokenType {
        NUMBER, STRING, KEY, OP
    }

    private record Token(TokenType type, String raw, double numVal) {
        static Token num(double v) {
            return new Token(TokenType.NUMBER, String.valueOf(v), v);
        }

        static Token str(String s) {
            return new Token(TokenType.STRING, s, 0);
        }

        static Token key(String k) {
            return new Token(TokenType.KEY, k, 0);
        }

        static Token op(char c) {
            return new Token(TokenType.OP, String.valueOf(c), 0);
        }
    }

    // Sentinel: marks a field value that was present but empty/null
    private static final Object MISSING = new Object() {
        @Override
        public String toString() {
            return "MISSING";
        }
    };

    // ═════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═════════════════════════════════════════════════════════════════════

    /**
     * Recalculates all calculated fields in the submitted data map.
     * Mutates and returns the same map with overridden values.
     * Uses iterative passes to handle cascading dependencies.
     *
     * @param fieldRows All field rows from DB (need field_key, is_calculated,
     *                  formula_expression, calc_precision columns)
     * @param data      Current submission data map (mutated in-place)
     */
    public Map<String, Object> recalculate(List<Map<String, Object>> fieldRows, Map<String, Object> data) {
        // Filter to only calculated fields that have a formula
        List<Map<String, Object>> calcFields = fieldRows.stream()
                .filter(r -> Boolean.TRUE.equals(r.get("is_calculated"))
                        && r.get("formula_expression") != null
                        && !r.get("formula_expression").toString().isBlank())
                .toList();

        if (calcFields.isEmpty())
            return data;

        Map<String, Object> values = new LinkedHashMap<>(data);
        boolean changed = true;
        int passes = 0;
        final int MAX_PASSES = 10;

        while (changed && passes < MAX_PASSES) {
            changed = false;
            passes++;

            for (Map<String, Object> row : calcFields) {
                String fieldKey = (String) row.get("field_key");
                String formula = (String) row.get("formula_expression");
                Object rawPrec = row.get("calc_precision");
                int prec = (rawPrec instanceof Number n) ? n.intValue() : 2;

                Object result;
                try {
                    result = evaluateFormula(formula, values);
                } catch (Exception e) {
                    log.warn("CalculationEngine: error evaluating formula '{}' for field '{}': {}", formula, fieldKey,
                            e.getMessage());
                    result = null;
                }

                // Apply precision to numeric results
                if (result instanceof Number num) {
                    result = roundTo(num.doubleValue(), prec);
                }

                // Normalise for comparison
                String prevStr = normalise(values.get(fieldKey));
                String nextStr = normalise(result);

                if (!prevStr.equals(nextStr)) {
                    values.put(fieldKey, result);
                    changed = true;
                }
            }
        }

        if (changed) {
            log.warn("CalculationEngine: formulas did not stabilize after {} passes — check for circular dependencies",
                    MAX_PASSES);
        }

        return values;
    }

    /**
     * Evaluates a single formula expression against the provided values map.
     *
     * @return Double (numeric result), String (text result), null (missing / error)
     */
    public Object evaluateFormula(String formula, Map<String, Object> values) {
        if (formula == null || formula.isBlank())
            return null;

        List<Token> tokens = tokenize(formula);
        if (tokens.isEmpty())
            return null;

        int[] pos = { 0 }; // boxed for lambda access

        // ── forward-declared via array for mutual recursion ────────────
        @SuppressWarnings("unchecked")
        java.util.function.Supplier<Object>[] parseExpr = new java.util.function.Supplier[1];
        @SuppressWarnings("unchecked")
        java.util.function.Supplier<Object>[] parseAdd = new java.util.function.Supplier[1];
        @SuppressWarnings("unchecked")
        java.util.function.Supplier<Object>[] parseMul = new java.util.function.Supplier[1];
        @SuppressWarnings("unchecked")
        java.util.function.Supplier<Object>[] parsePrim = new java.util.function.Supplier[1];

        // parsePrimary: NUMBER | STRING | KEY | ( expr )
        parsePrim[0] = () -> {
            if (pos[0] >= tokens.size())
                return MISSING;
            Token t = tokens.get(pos[0]++);
            if (t.type() == TokenType.NUMBER)
                return t.numVal();
            if (t.type() == TokenType.STRING)
                return t.raw();
            if (t.type() == TokenType.KEY) {
                Object v = values.get(t.raw());
                if (v == null || v.toString().isBlank())
                    return MISSING;

                // If value is a numeric string, convert to double to avoid "2+3=23" problem
                // (parity with JS)
                if (v instanceof String s && s.matches("^-?\\d+(\\.\\d+)?$")) {
                    try {
                        return Double.parseDouble(s);
                    } catch (NumberFormatException e) {
                        return v;
                    }
                }
                return v;
            }
            if (t.type() == TokenType.OP && "(".equals(t.raw())) {
                Object val = parseExpr[0].get();
                if (pos[0] < tokens.size() && ")".equals(tokens.get(pos[0]).raw()))
                    pos[0]++;
                return val;
            }
            return MISSING;
        };

        // parseMultiplication: left (* | /) right
        parseMul[0] = () -> {
            Object left = parsePrim[0].get();
            while (pos[0] < tokens.size()) {
                String op = tokens.get(pos[0]).raw();
                if (!"*".equals(op) && !"/".equals(op))
                    break;
                pos[0]++;
                Object right = parsePrim[0].get();

                if (left == MISSING || right == MISSING) {
                    left = null;
                    continue;
                }
                if (left == null || right == null) {
                    left = null;
                    continue;
                }

                double l = toDouble(left);
                double r = toDouble(right);

                if ("*".equals(op)) {
                    left = l * r;
                } else {
                    if (r == 0.0) {
                        log.warn("CalculationEngine: divide by zero in formula '{}'", formula);
                        left = null;
                    } else {
                        left = l / r;
                    }
                }
            }
            return left;
        };

        // parseAddition: left (+ | -) right — with string concat & date math
        parseAdd[0] = () -> {
            Object left = parseMul[0].get();
            while (pos[0] < tokens.size()) {
                String op = tokens.get(pos[0]).raw();
                if (!"+".equals(op) && !"-".equals(op))
                    break;
                pos[0]++;
                Object right = parseMul[0].get();

                if ("+".equals(op)) {
                    // Rule §6: if either operand is string → concatenation, null → ""
                    if (isString(left) || isString(right) || left == MISSING || right == MISSING) {
                        String l = (left == MISSING || left == null) ? "" : left.toString();
                        String r = (right == MISSING || right == null) ? "" : right.toString();
                        left = l + r;
                    } else if (left == null || right == null) {
                        left = null;
                    } else {
                        // Numeric addition
                        left = toDouble(left) + toDouble(right);
                    }
                } else {
                    // Subtraction — date math if both are date-like strings
                    if (isDateLike(left) && isDateLike(right)) {
                        try {
                            LocalDate d1 = LocalDate.parse(left.toString().substring(0, 10));
                            LocalDate d2 = LocalDate.parse(right.toString().substring(0, 10));
                            left = (double) ChronoUnit.DAYS.between(d2, d1);
                        } catch (Exception e) {
                            left = null;
                        }
                    } else {
                        // Strict check: if either is MISSING or null or not numeric after parsePrimary
                        if (left == MISSING || right == MISSING || left == null || right == null ||
                                !(left instanceof Number) || !(right instanceof Number)) {
                            left = null;
                        } else {
                            left = toDouble(left) - toDouble(right);
                        }
                    }
                }
            }
            if (left instanceof Double d && d.isNaN())
                return null;
            return left;
        };

        parseExpr[0] = parseAdd[0];

        Object result = parseExpr[0].get();
        if (result == MISSING || result == null)
            return null;
        return result;
    }

    // ═════════════════════════════════════════════════════════════════════
    // TOKENIZER
    // ═════════════════════════════════════════════════════════════════════

    List<Token> tokenize(String formula) {
        List<Token> tokens = new ArrayList<>();
        int i = 0;
        while (i < formula.length()) {
            char ch = formula.charAt(i);

            // Whitespace
            if (Character.isWhitespace(ch)) {
                i++;
                continue;
            }

            // String literals
            if (ch == '"' || ch == '\'') {
                char q = ch;
                StringBuilder sb = new StringBuilder();
                i++;
                while (i < formula.length() && formula.charAt(i) != q) {
                    if (formula.charAt(i) == '\\')
                        i++; // simple escape
                    if (i < formula.length())
                        sb.append(formula.charAt(i));
                    i++;
                }
                tokens.add(Token.str(sb.toString()));
                i++; // closing quote
                continue;
            }

            // Numbers
            if (Character.isDigit(ch)) {
                StringBuilder sb = new StringBuilder();
                int dots = 0;
                while (i < formula.length() && (Character.isDigit(formula.charAt(i)) || formula.charAt(i) == '.')) {
                    if (formula.charAt(i) == '.') {
                        dots++;
                        if (dots > 1)
                            throw new IllegalArgumentException("Invalid number near: " + sb);
                    }
                    sb.append(formula.charAt(i));
                    i++;
                }
                tokens.add(Token.num(Double.parseDouble(sb.toString())));
                continue;
            }

            // Identifiers / field keys
            if (Character.isLetter(ch) || ch == '_') {
                StringBuilder sb = new StringBuilder();
                while (i < formula.length()
                        && (Character.isLetterOrDigit(formula.charAt(i)) || formula.charAt(i) == '_')) {
                    sb.append(formula.charAt(i));
                    i++;
                }
                tokens.add(Token.key(sb.toString()));
                continue;
            }

            // Operators
            if ("+-*/()".indexOf(ch) >= 0) {
                tokens.add(Token.op(ch));
                i++;
                continue;
            }

            // Unknown
            throw new IllegalArgumentException("Unexpected character: '" + ch + "'");
        }
        return tokens;
    }

    // ═════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═════════════════════════════════════════════════════════════════════

    private double toDouble(Object v) {
        if (v instanceof Number n)
            return n.doubleValue();
        try {
            return Double.parseDouble(v.toString());
        } catch (Exception e) {
            return 0.0;
        }
    }

    private boolean isString(Object v) {
        return v instanceof String;
    }

    private boolean isDateLike(Object v) {
        if (!(v instanceof String s))
            return false;
        return s.length() >= 10 && s.matches("\\d{4}-\\d{2}-\\d{2}.*");
    }

    private double roundTo(double value, int precision) {
        if (Double.isNaN(value) || Double.isInfinite(value))
            return value;
        double factor = Math.pow(10, precision);
        return Math.round(value * factor) / factor;
    }

    private String normalise(Object v) {
        if (v == null || v == MISSING)
            return "";
        return v.toString();
    }
}
