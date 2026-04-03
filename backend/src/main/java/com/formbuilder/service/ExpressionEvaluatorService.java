package com.formbuilder.service;

import com.formbuilder.exception.ExpressionEvaluationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * ExpressionEvaluatorService — Safe Recursive Descent Parser for Boolean Expressions.
 * Supports: ==, !=, <, <=, >, >=, &&, ||, !
 * References form fields by fieldKey.
 */
@Slf4j
@Service
public class ExpressionEvaluatorService {

    private enum TokenType {
        NUMBER, STRING, KEY, OP
    }

    private record Token(TokenType type, String raw, double numVal) {
        static Token num(double v) { return new Token(TokenType.NUMBER, String.valueOf(v), v); }
        static Token str(String s) { return new Token(TokenType.STRING, s, 0); }
        static Token key(String k) { return new Token(TokenType.KEY, k, 0); }
        static Token op(String s) { return new Token(TokenType.OP, s, 0); }
    }

    private static final Object MISSING = new Object() {
        @Override
        public String toString() { return "null"; }
    };

    public boolean evaluate(String expression, Map<String, Object> values) {
        if (expression == null || expression.isBlank()) return true;
        
        try {
            List<Token> tokens = tokenize(expression);
            if (tokens.isEmpty()) return true;
            
            Object result = new Parser(tokens, values, expression).parse();
            return toBool(result);
        } catch (ExpressionEvaluationException e) {
            log.warn("Expression evaluation failed: {} | Expression: {}", e.getMessage(), expression);
            // Default to false on evaluation error to be safe, or throw?
            // For validation, an error in expression usually means invalid logic.
            throw e; 
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    // PARSER (Recursive Descent)
    // ═════════════════════════════════════════════════════════════════════

    private class Parser {
        private final List<Token> tokens;
        private final Map<String, Object> values;
        private final String expression;
        private int pos = 0;

        Parser(List<Token> tokens, Map<String, Object> values, String expression) {
            this.tokens = tokens;
            this.values = values;
            this.expression = expression;
        }

        Object parse() {
            Object res = parseLogicalOr();
            if (pos < tokens.size()) throw error("Unexpected token at end of expression: " + tokens.get(pos).raw());
            return res;
        }

        private Object parseLogicalOr() {
            Object left = parseLogicalAnd();
            while (match("||")) {
                Object right = parseLogicalAnd();
                left = toBool(left) || toBool(right);
            }
            return left;
        }

        private Object parseLogicalAnd() {
            Object left = parseEquality();
            while (match("&&")) {
                Object right = parseEquality();
                left = toBool(left) && toBool(right);
            }
            return left;
        }

        private Object parseEquality() {
            Object left = parseComparison();
            while (peekMatch("==", "!=")) {
                String op = tokens.get(pos++).raw();
                Object right = parseComparison();
                int cmp = compare(left, right);
                left = "==".equals(op) ? cmp == 0 : cmp != 0;
            }
            return left;
        }

        private Object parseComparison() {
            Object left = parseAddition();
            while (peekMatch("<", "<=", ">", ">=")) {
                String op = tokens.get(pos++).raw();
                Object right = parseAddition();
                int cmp = compare(left, right);
                left = switch (op) {
                    case "<" -> cmp < 0;
                    case "<=" -> cmp <= 0;
                    case ">" -> cmp > 0;
                    case ">=" -> cmp >= 0;
                    default -> false;
                };
            }
            return left;
        }

        private Object parseAddition() {
            Object left = parseMultiplication();
            while (peekMatch("+", "-")) {
                String op = tokens.get(pos++).raw();
                Object right = parseMultiplication();
                if ("+".equals(op)) {
                    if (left instanceof String || right instanceof String || left == MISSING || right == MISSING) {
                        left = normalise(left) + normalise(right);
                    } else {
                        left = toDouble(left) + toDouble(right);
                    }
                } else {
                    if (isDateLike(left) && isDateLike(right)) {
                        left = dateDiff(left, right);
                    } else {
                        left = toDouble(left) - toDouble(right);
                    }
                }
            }
            return left;
        }

        private Object parseMultiplication() {
            Object left = parseUnary();
            while (peekMatch("*", "/")) {
                String op = tokens.get(pos++).raw();
                Object right = parseUnary();
                double l = toDouble(left);
                double r = toDouble(right);
                if ("*".equals(op)) left = l * r;
                else {
                    if (r == 0) throw error("Division by zero");
                    left = l / r;
                }
            }
            return left;
        }

        private Object parseUnary() {
            if (match("!")) return !toBool(parsePrimary());
            return parsePrimary();
        }

        private Object parsePrimary() {
            if (pos >= tokens.size()) return MISSING;
            Token t = tokens.get(pos++);
            if (t.type == TokenType.NUMBER) return t.numVal();
            if (t.type == TokenType.STRING) return t.raw();
            if (t.type == TokenType.KEY) {
                Object v = values.get(t.raw());
                if (v == null || (v instanceof String s && s.isBlank())) {
                    // Specific check for 'null' keyword if not found in data
                    if ("null".equals(t.raw())) return null;
                    return MISSING;
                }
                // Auto-coerce strings that look like numbers
                if (v instanceof String s && s.matches("^-?\\d+(\\.\\d+)?$")) {
                    try { return Double.parseDouble(s); } catch (NumberFormatException ignored) {}
                }
                return v;
            }
            if (match("(")) {
                Object val = parseLogicalOr();
                if (!match(")")) throw error("Missing closing parenthesis");
                return val;
            }
            throw error("Unexpected token: " + t.raw());
        }

        private boolean match(String val) {
            if (pos < tokens.size() && val.equals(tokens.get(pos).raw())) {
                pos++; return true;
            }
            return false;
        }

        private boolean peekMatch(String... vals) {
            if (pos >= tokens.size()) return false;
            String raw = tokens.get(pos).raw();
            for (String v : vals) if (v.equals(raw)) return true;
            return false;
        }

        private ExpressionEvaluationException error(String msg) {
            return new ExpressionEvaluationException(msg, expression, "custom-validation", values);
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    // TOKENIZER
    // ═════════════════════════════════════════════════════════════════════

    private List<Token> tokenize(String expression) {
        List<Token> tokens = new ArrayList<>();
        int i = 0, n = expression.length();
        while (i < n) {
            char ch = expression.charAt(i);
            if (Character.isWhitespace(ch)) { i++; continue; }
            if (ch == '"' || ch == '\'') {
                char q = ch; StringBuilder sb = new StringBuilder(); i++;
                while (i < n && expression.charAt(i) != q) {
                    if (expression.charAt(i) == '\\' && i + 1 < n) i++;
                    sb.append(expression.charAt(i++));
                }
                tokens.add(Token.str(sb.toString())); i++; continue;
            }
            if (Character.isDigit(ch)) {
                StringBuilder sb = new StringBuilder();
                while (i < n && (Character.isDigit(expression.charAt(i)) || expression.charAt(i) == '.')) sb.append(expression.charAt(i++));
                tokens.add(Token.num(Double.parseDouble(sb.toString()))); continue;
            }
            if (Character.isLetter(ch) || ch == '_') {
                StringBuilder sb = new StringBuilder();
                while (i < n && (Character.isLetterOrDigit(expression.charAt(i)) || expression.charAt(i) == '_')) sb.append(expression.charAt(i++));
                tokens.add(Token.key(sb.toString())); continue;
            }
            if (i+1 < n) {
                String two = expression.substring(i, i+2);
                if (List.of("==", "!=", "<=", ">=", "&&", "||").contains(two)) {
                    tokens.add(Token.op(two)); i += 2; continue;
                }
            }
            if ("+-*/()<>!".indexOf(ch) >= 0) {
                tokens.add(Token.op(String.valueOf(ch))); i++; continue;
            }
            throw new ExpressionEvaluationException("Unexpected character: " + ch, expression, "tokenizer", null);
        }
        return tokens;
    }

    // ═════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═════════════════════════════════════════════════════════════════════

    private boolean toBool(Object v) {
        if (v instanceof Boolean b) return b;
        if (v == null || v == MISSING) return false;
        String s = v.toString().toLowerCase();
        return "true".equals(s) || "1".equals(s) || "yes".equals(s);
    }

    private double toDouble(Object v) {
        if (v instanceof Number n) return n.doubleValue();
        if (v == null || v == MISSING) return 0.0;
        try { return Double.parseDouble(v.toString()); } catch (Exception e) { return 0.0; }
    }

    private int compare(Object l, Object r) {
        if (l == MISSING) l = null; if (r == MISSING) r = null;
        if (l == null && r == null) return 0;
        if (l == null) return -1; if (r == null) return 1;
        
        // If both are numbers (or numeric strings), compare numerically
        if (isNumeric(l) && isNumeric(r)) {
            return Double.compare(toDouble(l), toDouble(r));
        }
        
        // Fallback to string comparison
        return String.valueOf(l).compareToIgnoreCase(String.valueOf(r));
    }

    private boolean isNumeric(Object v) {
        if (v instanceof Number) return true;
        if (v instanceof String s) return s.matches("^-?\\d+(\\.\\d+)?$");
        return false;
    }

    private boolean isDateLike(Object v) {
        return v instanceof String s && s.length() >= 10 && s.matches("\\d{4}-\\d{2}-\\d{2}.*");
    }

    private Double dateDiff(Object d1, Object d2) {
        try {
            LocalDate dt1 = LocalDate.parse(d1.toString().substring(0, 10));
            LocalDate dt2 = LocalDate.parse(d2.toString().substring(0, 10));
            return (double) ChronoUnit.DAYS.between(dt2, dt1);
        } catch (Exception e) { return null; }
    }

    private String normalise(Object v) {
        return (v == null || v == MISSING) ? "" : v.toString();
    }
}
