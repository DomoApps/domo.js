import { 
  isFilter, 
  isFilterArray, 
  guardAgainstInvalidFilters 
} from './filter';
import { FilterDataTypes, FilterOperatorsString, FilterOperatorsNumeric } from '../models/interfaces/filter';

describe('Filter Utilities', () => {
  describe('isFilter', () => {
    it('should return true for valid Filter objects', () => {
      const validFilters = [
        { column: 'name', operator: FilterOperatorsString.IN, values: ['test'], dataType: FilterDataTypes.STRING as FilterDataTypes.STRING },
        { column: 'age', operator: FilterOperatorsNumeric.GREATER_THAN, values: [18], dataType: FilterDataTypes.NUMERIC as FilterDataTypes.NUMERIC },
        { column: 'date', operator: FilterOperatorsNumeric.BETWEEN, values: [new Date(), new Date()], dataType: FilterDataTypes.DATE as FilterDataTypes.DATE }
      ];

      for (const filter of validFilters) {
        expect(isFilter(filter)).toBe(true);
      }
    });

    it('should return true for legacy operand property', () => {
      const legacyFilter = { column: 'name', operand: 'IN', values: ['test'], dataType: 'STRING' };
      expect(isFilter(legacyFilter)).toBe(true);
    });

    it('should accept both operator and operand properties for the same filter', () => {
      const baseFilter = { column: 'category', values: ['A', 'B'], dataType: 'STRING' };
      
      // Test with operator
      const filterWithOperator = { ...baseFilter, operator: 'IN' };
      expect(isFilter(filterWithOperator)).toBe(true);
      
      // Test with operand (legacy)
      const filterWithOperand = { ...baseFilter, operand: 'IN' };
      expect(isFilter(filterWithOperand)).toBe(true);
      
      // Test with both (should still work - operator takes precedence)
      const filterWithBoth = { ...baseFilter, operator: 'IN', operand: 'NOT_IN' };
      expect(isFilter(filterWithBoth)).toBe(true);
    });

    it('should return true for case-insensitive dataType and operator values', () => {
      const caseInsensitiveFilters = [
        { column: 'name', operator: 'in', values: ['test'], dataType: 'string' },
        { column: 'age', operator: 'greater_than', values: [18], dataType: 'numeric' },
        { column: 'date', operator: 'BETWEEN', values: [new Date(), new Date()], dataType: 'date' },
        { column: 'category', operand: 'contains', values: ['test'], dataType: 'STRING' },
        { column: 'amount', operator: 'Great_Than_Equals_To', values: [100], dataType: 'Numeric' }
      ];

      for (const filter of caseInsensitiveFilters) {
        expect(isFilter(filter)).toBe(true);
      }
    });

    it('should return false for invalid Filter objects', () => {
      const invalidFilters = [
        null,
        undefined,
        'string',
        123,
        {},
        { column: 'name' }, // missing required properties
        { operator: FilterOperatorsString.IN, values: ['test'], dataType: FilterDataTypes.STRING }, // missing column
        { column: 'name', values: ['test'], dataType: FilterDataTypes.STRING }, // missing operator/operand
        { column: 'name', operator: FilterOperatorsString.IN, dataType: FilterDataTypes.STRING }, // missing values
        { column: 'name', operator: FilterOperatorsString.IN, values: ['test'] }, // missing dataType
        { column: 123, operator: FilterOperatorsString.IN, values: ['test'], dataType: FilterDataTypes.STRING }, // column not string
        { column: 'name', operator: 'INVALID_OP', values: ['test'], dataType: FilterDataTypes.STRING }, // invalid operator
        { column: 'name', operator: FilterOperatorsString.IN, values: 'not-array', dataType: FilterDataTypes.STRING }, // values not array
        { column: 'name', operator: FilterOperatorsString.IN, values: ['test'], dataType: 'INVALID_TYPE' } // invalid dataType
      ];

      for (const filter of invalidFilters) {
        expect(isFilter(filter)).toBe(false);
      }
    });
  });

  describe('isFilterArray', () => {
    it('should return true for valid Filter arrays', () => {
      const validArray = [
        { column: 'name', operator: FilterOperatorsString.IN, values: ['test'], dataType: FilterDataTypes.STRING as FilterDataTypes.STRING },
        { column: 'age', operator: FilterOperatorsNumeric.GREATER_THAN, values: [18], dataType: FilterDataTypes.NUMERIC as FilterDataTypes.NUMERIC }
      ];
      expect(isFilterArray(validArray)).toBe(true);
    });

    it('should return true for empty arrays', () => {
      expect(isFilterArray([])).toBe(true);
    });

    it('should return false for non-arrays', () => {
      expect(isFilterArray(null)).toBe(false);
      expect(isFilterArray(undefined)).toBe(false);
      expect(isFilterArray('string')).toBe(false);
      expect(isFilterArray({})).toBe(false);
    });

    it('should return false for arrays with invalid filters', () => {
      const invalidArray = [
        { column: 'name', operator: FilterOperatorsString.IN, values: ['test'], dataType: FilterDataTypes.STRING as FilterDataTypes.STRING }, // valid
        { column: 'invalid' } // invalid - missing required properties
      ];
      expect(isFilterArray(invalidArray)).toBe(false);
    });
  });

  describe('guardAgainstInvalidFilters', () => {
    it('should not throw for valid Filter arrays', () => {
      const validFilters = [
        { column: 'name', operator: FilterOperatorsString.IN, values: ['test'], dataType: FilterDataTypes.STRING as FilterDataTypes.STRING }
      ];
      expect(() => guardAgainstInvalidFilters(validFilters)).not.toThrow();
    });

    it('should not throw for null', () => {
      expect(() => guardAgainstInvalidFilters(null)).not.toThrow();
    });

    it('should throw TypeError for non-arrays', () => {
      const invalidInputs = ['string', 123, {}, true, undefined];
      for (const input of invalidInputs) {
        expect(() => guardAgainstInvalidFilters(input as any)).toThrow(TypeError);
        expect(() => guardAgainstInvalidFilters(input as any)).toThrow(/Filters must be provided as a Filter array or null/);
      }
    });

    it('should not throw for empty arrays (used to clear filters)', () => {
      expect(() => guardAgainstInvalidFilters([])).not.toThrow();
    });

    it('should throw TypeError for arrays with invalid filters', () => {
      const invalidFilters = [
        { column: 'name' } // missing required properties
      ];
      expect(() => guardAgainstInvalidFilters(invalidFilters as any)).toThrow(TypeError);
      expect(() => guardAgainstInvalidFilters(invalidFilters as any)).toThrow(/All filters must be valid Filter objects/);
    });

    it('should provide helpful error messages', () => {
      expect(() => guardAgainstInvalidFilters('invalid' as any)).toThrow(/Filter array or null.*column.*operator.*values.*dataType/);
      expect(() => guardAgainstInvalidFilters([{}] as any)).toThrow(/valid Filter objects.*column.*operator.*values.*dataType/);
    });
  });
});