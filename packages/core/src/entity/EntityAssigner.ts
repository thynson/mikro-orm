import { inspect } from 'util';
import { Collection } from './Collection';
import { EntityManager } from '../EntityManager';
import { AnyEntity, EntityData, EntityMetadata, EntityProperty, HelperType, MetadataType, PlatformType } from '../typings';
import { Utils } from '../utils/Utils';
import { Reference } from './Reference';
import { ReferenceType, SCALAR_TYPES } from '../enums';
import { EntityValidator } from './EntityValidator';

const validator = new EntityValidator(false);

export class EntityAssigner {

  static assign<T extends AnyEntity<T>>(entity: T, data: EntityData<T>, options?: AssignOptions): T;
  static assign<T extends AnyEntity<T>>(entity: T, data: EntityData<T>, onlyProperties?: boolean): T;
  static assign<T extends AnyEntity<T>>(entity: T, data: EntityData<T>, onlyProperties: AssignOptions | boolean = false): T {
    const options = (typeof onlyProperties === 'boolean' ? { onlyProperties } : onlyProperties);
    const wrapped = entity[HelperType]!;
    const meta = entity[MetadataType]!;
    const em = options.em || wrapped.__em;
    const props = meta.properties;

    Object.keys(data).forEach(prop => {
      if (options.onlyProperties && !(prop in props)) {
        return;
      }

      /* istanbul ignore next */
      const customType = props[prop]?.customType;
      let value = data[prop as keyof EntityData<T>];

      if (options.convertCustomTypes && customType && props[prop].reference === ReferenceType.SCALAR && !Utils.isEntity(data)) {
        value = props[prop].customType.convertToJSValue(value, entity[PlatformType]);
      }

      if ([ReferenceType.MANY_TO_ONE, ReferenceType.ONE_TO_ONE].includes(props[prop]?.reference) && Utils.isDefined(value, true) && EntityAssigner.validateEM(em)) {
        return EntityAssigner.assignReference<T>(entity, value, props[prop], em!, options);
      }

      if (props[prop] && Utils.isCollection(entity[prop as keyof T], props[prop]) && Array.isArray(value) && EntityAssigner.validateEM(em)) {
        return EntityAssigner.assignCollection<T>(entity, entity[prop as keyof T] as unknown as Collection<AnyEntity>, value, props[prop], em!, options);
      }

      if (props[prop]?.reference === ReferenceType.SCALAR && SCALAR_TYPES.includes(props[prop].type) && (props[prop].setter || !props[prop].getter)) {
        return entity[prop as keyof T] = validator.validateProperty(props[prop], value, entity);
      }

      if (props[prop]?.reference === ReferenceType.EMBEDDED) {
        const Embeddable = props[prop].embeddable;
        entity[props[prop].name] = Object.create(Embeddable.prototype);
        Utils.merge(entity[prop as keyof T], value);
        return;
      }

      if (options.mergeObjects && Utils.isObject(value)) {
        Utils.merge(entity[prop as keyof T], value);
      } else if (!props[prop] || props[prop].setter || !props[prop].getter) {
        entity[prop as keyof T] = value;
      }
    });

    return entity;
  }

  /**
   * auto-wire 1:1 inverse side with owner as in no-sql drivers it can't be joined
   * also makes sure the link is bidirectional when creating new entities from nested structures
   * @internal
   */
  static autoWireOneToOne<T extends AnyEntity<T>>(prop: EntityProperty, entity: T): void {
    if (prop.reference !== ReferenceType.ONE_TO_ONE) {
      return;
    }

    const meta2 = entity[prop.name].__meta! as EntityMetadata;
    const prop2 = meta2.properties[prop.inversedBy || prop.mappedBy];

    if (prop2 && !entity[prop.name][prop2.name]) {
      if (Reference.isReference(entity[prop.name])) {
        entity[prop.name].unwrap()[prop2.name] = Reference.wrapReference(entity, prop2);
      } else {
        entity[prop.name][prop2.name] = Reference.wrapReference(entity, prop2);
      }
    }
  }

  private static validateEM(em?: EntityManager): boolean {
    if (!em) {
      throw new Error(`To use assign() on not managed entities, explicitly provide EM instance: wrap(entity).assign(data, { em: orm.em })`);
    }

    return true;
  }

  private static assignReference<T extends AnyEntity<T>>(entity: T, value: any, prop: EntityProperty, em: EntityManager, options: AssignOptions): void {
    if (Utils.isEntity(value, true)) {
      entity[prop.name] = value;
    } else if (Utils.isPrimaryKey(value, true)) {
      entity[prop.name] = Reference.wrapReference(em.getReference<T>(prop.type, value, false, options.convertCustomTypes), prop);
    } else if (Utils.isObject<T[keyof T]>(value) && options.merge) {
      entity[prop.name] = Reference.wrapReference(em.merge(prop.type, value), prop);
    } else if (Utils.isObject<T[keyof T]>(value)) {
      entity[prop.name] = Reference.wrapReference(em.create(prop.type, value), prop);
    } else {
      const name = entity.constructor.name;
      throw new Error(`Invalid reference value provided for '${name}.${prop.name}' in ${name}.assign(): ${JSON.stringify(value)}`);
    }

    EntityAssigner.autoWireOneToOne(prop, entity);
  }

  private static assignCollection<T extends AnyEntity<T>, U extends AnyEntity<U> = AnyEntity>(entity: T, collection: Collection<U>, value: any[], prop: EntityProperty, em: EntityManager, options: AssignOptions): void {
    const invalid: any[] = [];
    const items = value.map((item: any) => this.createCollectionItem<U>(item, em, prop, invalid, options));

    if (invalid.length > 0) {
      const name = entity.constructor.name;
      throw new Error(`Invalid collection values provided for '${name}.${prop.name}' in ${name}.assign(): ${inspect(invalid)}`);
    }

    collection.hydrate(items, true, !!options.merge);
    collection.setDirty();
  }

  private static createCollectionItem<T extends AnyEntity<T>>(item: any, em: EntityManager, prop: EntityProperty, invalid: any[], options: AssignOptions): T {
    if (Utils.isEntity<T>(item)) {
      return item;
    }

    if (Utils.isPrimaryKey(item)) {
      return em.getReference(prop.type, item);
    }

    if (Utils.isObject<T>(item) && options.merge) {
      return em.merge<T>(prop.type, item);
    }

    if (Utils.isObject<T>(item)) {
      return em.create<T>(prop.type, item);
    }

    invalid.push(item);

    return item;
  }

}

export const assign = EntityAssigner.assign;

export interface AssignOptions {
  onlyProperties?: boolean;
  convertCustomTypes?: boolean;
  mergeObjects?: boolean;
  merge?: boolean;
  em?: EntityManager;
}
