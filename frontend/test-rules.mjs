import RuleEngine from './services/RuleEngine.js';

const mockFields = [
    { fieldKey: 'field1', label: 'Field 1', fieldType: 'text', fieldOrder: 1 },
    {
        fieldKey: 'group_abc123',
        fieldType: 'field_group',
        fieldOrder: 2,
        rulesJson: JSON.stringify({
            combinator: "AND",
            conditions: [{ fieldKey: "field1", operator: "equals", value: "test" }],
            actions: [{ type: "show" }]
        })
    }
];

const processed = RuleEngine.withParsedRules(mockFields);
const state1 = RuleEngine.applyRules(processed, { field1: '' });
console.log('State with empty field1:', state1);

const state2 = RuleEngine.applyRules(processed, { field1: 'test' });
console.log('State with field1 = test:', state2);
