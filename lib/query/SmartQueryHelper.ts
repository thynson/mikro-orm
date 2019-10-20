import { QueryBuilderHelper } from './QueryBuilderHelper';
import { AnyEntity, EntityMetadata, FilterQuery } from '../types';
import { Reference } from '../entity';
import { Utils } from '../utils';

export class SmartQueryHelper {

  static readonly SUPPORTED_OPERATORS = ['>', '<', '<=', '>=', '!', '!=', ':in', ':nin', ':gt', ':gte', ':lt', ':lte', ':ne', ':not'];

  static processParams(params: any, root?: boolean): any {
    if (params instanceof Reference) {
      params = params.unwrap();
    }

    if (Utils.isEntity(params)) {
      return SmartQueryHelper.processEntity(params, root);
    }

    if (params === undefined) {
      return null;
    }

    if (Array.isArray(params)) {
      return params.map(item => SmartQueryHelper.processParams(item, true));
    }

    if (Utils.isObject(params)) {
      Object.keys(params).forEach(k => {
        params[k] = SmartQueryHelper.processParams(params[k], !!k);
      });
    }

    return params;
  }

  static processWhere<T extends AnyEntity<T>>(where: FilterQuery<T>, entityName: string, meta?: EntityMetadata<T>): FilterQuery<T> {
    where = SmartQueryHelper.processParams(where) || {};
    const rootPrimaryKey = meta ? meta.primaryKey : entityName;

    if (Array.isArray(where)) {
      return { [rootPrimaryKey]: { $in: (where as FilterQuery<T>[]).map(sub => SmartQueryHelper.processWhere(sub, entityName, meta)) } } as FilterQuery<T>;
    }

    if (!Utils.isObject(where) || Utils.isPrimaryKey(where)) {
      return where as FilterQuery<T>;
    }

    return Object.keys(where).reduce((o, key) => {
      const value = where[key];

      if (key in QueryBuilderHelper.GROUP_OPERATORS) {
        o[key] = value.map((sub: any) => SmartQueryHelper.processWhere(sub, entityName, meta));
        return o;
      }

      if (Array.isArray(value) && !SmartQueryHelper.isSupported(key) && !key.includes('?')) {
        o[key] = { $in: value };
        return o;
      }

      if (!SmartQueryHelper.isSupported(key)) {
        o[key] = where[key as keyof typeof where];
      } else if (key.includes(':')) {
        const [k, expr] = key.split(':');
        o[k] = SmartQueryHelper.processExpression(expr, value);
      } else {
        const m = key.match(/([\w-]+) ?([<>=!]+)$/)!;
        o[m[1]] = SmartQueryHelper.processExpression(m[2], value);
      }

      return o;
    }, {} as FilterQuery<T>);
  }

  private static processEntity(entity: AnyEntity, root?: boolean): any {
    if (root) {
      return entity.__primaryKey;
    }

    return { [entity.__primaryKeyField]: entity.__primaryKey };
  }

  private static processExpression<T>(expr: string, value: T): Record<string, T> {
    switch (expr) {
      case '>': return { $gt: value };
      case '<': return { $lt: value };
      case '>=': return { $gte: value };
      case '<=': return { $lte: value };
      case '!=': return { $ne: value };
      case '!': return { $not: value };
      default: return { ['$' + expr]: value };
    }
  }

  private static isSupported(key: string): boolean {
    return !!SmartQueryHelper.SUPPORTED_OPERATORS.find(op => key.includes(op));
  }

}
