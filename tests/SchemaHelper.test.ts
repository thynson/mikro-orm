import { SchemaHelper } from '../lib/schema';

class SchemaHelperTest extends SchemaHelper { }

describe('SchemaHelper', () => {

  test('default schema helpers', async () => {
    const helper = new SchemaHelperTest();
    expect(helper.getSchemaBeginning()).toBe('');
    expect(helper.getSchemaEnd()).toBe('');
    expect(helper.getTypeDefinition({ type: 'test' } as any)).toBe('test');
    expect(() => helper.getListTablesSQL()).toThrowError('Not supported by given driver');
    expect(() => helper.getForeignKeysSQL('table')).toThrowError('Not supported by given driver');
    await expect(helper.getColumns({} as any, 'table')).rejects.toThrowError('Not supported by given driver');
    await expect(helper.getIndexes({} as any, 'table')).rejects.toThrowError('Not supported by given driver');
  });

});
