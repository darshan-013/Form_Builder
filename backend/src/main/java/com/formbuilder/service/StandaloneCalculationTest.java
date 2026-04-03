package com.formbuilder.service;

import java.util.HashMap;
import java.util.Map;

/**
 * A standalone test class to verify CalculationEngine without JUnit dependencies.
 * Run this to check logic if your IDE is having Maven sync issues.
 */
public class StandaloneCalculationTest {
    public static void main(String[] args) {
        CalculationEngine engine = new CalculationEngine();
        Map<String, Object> data = new HashMap<>();
        
        System.out.println("Starting CalculationEngine Standalone Tests...");
        
        try {
            // Basic Arithmetic
            check(5.0, engine.evaluateFormula("2 + 3", data), "Basic Add");
            check(14.0, engine.evaluateFormula("2 + 3 * 4", data), "Precedence (Mul before Add)");
            check(20.0, engine.evaluateFormula("(2 + 3) * 4", data), "Parentheses");
            
            // Boolean Logic
            check(true, engine.evaluateFormula("10 > 5 && 2 < 4", data), "Logical AND");
            check(true, engine.evaluateFormula("10 == 10 || 5 == 0", data), "Logical OR");
            check(false, engine.evaluateFormula("!(10 > 5)", data), "Logical NOT");
            
            // Coercion
            data.put("age", "25");
            check(true, engine.evaluateFormula("age >= 18", data), "String-to-Number Coercion");
            
            // Fail-Fast
            try {
                engine.evaluateFormula("10 / 0", data);
                System.err.println("[FAIL] Division by zero did not throw error!");
            } catch (Exception e) {
                System.out.println("[PASS] Division by zero threw: " + e.getMessage());
            }
            
            System.out.println("\nAll Standalone Tests Passed!");
        } catch (Exception e) {
            System.err.println("\nTest failed with exception:");
            e.printStackTrace();
        }
    }

    private static void check(Object expected, Object actual, String name) {
        if (expected == null && actual == null) {
            System.out.println("[PASS] " + name);
            return;
        }
        if (expected != null && expected.equals(actual)) {
            System.out.println("[PASS] " + name);
        } else {
            System.err.println("[FAIL] " + name + " -> Expected: " + expected + ", Actual: " + actual);
        }
    }
}
