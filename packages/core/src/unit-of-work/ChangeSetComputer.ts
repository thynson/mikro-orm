import { Configuration, Utils } from '../utils';
import { MetadataStorage } from '../metadata';
import { AnyEntity, EntityData, EntityProperty, HelperType } from '../typings';
import { ChangeSet, ChangeSetType } from './ChangeSet';
import { Collection, EntityValidator } from '../entity';
import { Platform } from '../platforms';
import { ReferenceType } from '../enums';
import { EntityComparator } from '../utils/EntityComparator';

export class ChangeSetComputer {

  private readonly comparator = new EntityComparator(this.metadata, this.platform);

  constructor(private readonly validator: EntityValidator,
              private readonly collectionUpdates: Set<Collection<AnyEntity>>,
              private readonly removeStack: Set<AnyEntity>,
              private readonly metadata: MetadataStorage,
              private readonly platform: Platform,
              private readonly config: Configuration) { }

  computeChangeSet<T extends AnyEntity<T>>(entity: T): ChangeSet<T> | null {
    const changeSet = { entity } as ChangeSet<T>;
    const meta = this.metadata.find(entity.constructor.name)!;

    if (meta.readonly) {
      return null;
    }

    changeSet.name = meta.name!;
    changeSet.type = entity[HelperType]!.__originalEntityData ? ChangeSetType.UPDATE : ChangeSetType.CREATE;
    changeSet.collection = meta.collection;
    changeSet.payload = this.computePayload(entity);

    if (changeSet.type === ChangeSetType.UPDATE) {
      changeSet.originalEntity = entity[HelperType]!.__originalEntityData;
    }

    if (this.config.get('validate')) {
      this.validator.validate<T>(changeSet.entity, changeSet.payload, meta);
    }

    for (const prop of meta.relations) {
      this.processProperty(changeSet, prop);
    }

    if (changeSet.type === ChangeSetType.UPDATE && Object.keys(changeSet.payload).length === 0) {
      return null;
    }

    return changeSet;
  }

  private computePayload<T extends AnyEntity<T>>(entity: T): EntityData<T> {
    const data = this.comparator.prepareEntity(entity);

    if (entity[HelperType]!.__originalEntityData) {
      return Utils.diff(entity[HelperType]!.__originalEntityData!, data);
    }

    return data;
  }

  private processProperty<T extends AnyEntity<T>>(changeSet: ChangeSet<T>, prop: EntityProperty<T>): void {
    const target = changeSet.entity[prop.name];

    if (Utils.isCollection(target)) { // m:n or 1:m
      this.processToMany(prop, changeSet);
    } else if (prop.reference !== ReferenceType.SCALAR && target) { // m:1 or 1:1
      this.processToOne(prop, changeSet);
    }
  }

  private processToOne<T extends AnyEntity<T>>(prop: EntityProperty<T>, changeSet: ChangeSet<T>): void {
    const pks = this.metadata.find(prop.type)!.primaryKeys;
    const entity = changeSet.entity[prop.name] as unknown as T;
    const isToOneOwner = prop.reference === ReferenceType.MANY_TO_ONE || (prop.reference === ReferenceType.ONE_TO_ONE && prop.owner);

    if (isToOneOwner && pks.length === 1 && !Utils.isDefined(entity[pks[0]], true)) {
      changeSet.payload[prop.name] = entity[HelperType]!.__identifier;
    }
  }

  private processToMany<T extends AnyEntity<T>>(prop: EntityProperty<T>, changeSet: ChangeSet<T>): void {
    const target = changeSet.entity[prop.name] as unknown as Collection<any>;

    // remove items from collection based on removeStack
    if (target.isInitialized()) {
      target.getItems()
        .filter(item => this.removeStack.has(item))
        .forEach(item => target.remove(item));
    }

    if (!target.isDirty()) {
      return;
    }

    if (prop.owner || target.getItems(false).filter(item => !item[HelperType]!.__initialized).length > 0) {
      this.collectionUpdates.add(target);
    } else {
      target.setDirty(false); // inverse side with only populated items, nothing to persist
    }
  }

}
