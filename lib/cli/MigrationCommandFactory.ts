import { Arguments, Argv, CommandModule } from 'yargs';
import chalk from 'chalk';
import { CLIHelper } from './CLIHelper';

export class MigrationCommandFactory {

  static readonly DESCRIPTIONS = {
    create: 'Create new migration with current schema diff',
    up: 'Migrate up to the latest version',
    down: 'Migrate one step down',
    list: 'List all executed migrations',
    pending: 'List all pending migrations',
  };

  static readonly SUCCESS_MESSAGES = {
    create: (name?: string) => `${name} successfully created`,
    up: (name?: string) => `Successfully migrated up to ${name ? `version ${name}` : 'latest version'}`,
    down: (name?: string) => `Successfully migrated down to ${name ? `version ${name}` : 'first version'}`,
  };

  static create<U extends Options = Options>(command: 'create' | 'up' | 'down' | 'list' | 'pending'): CommandModule<{}, U> & { builder: (args: Argv) => Argv<U>; handler: (args: Arguments<U>) => Promise<void> } {
    return {
      command: `migration:${command}`,
      describe: MigrationCommandFactory.DESCRIPTIONS[command],
      builder: (args: Argv) => MigrationCommandFactory.configureMigrationCommand(args, command) as Argv<U>,
      handler: (args: Arguments<U>) => MigrationCommandFactory.handleMigrationCommand(args, command),
    };
  }

  static configureMigrationCommand(args: Argv, method: 'create' | 'up' | 'down' | 'list' | 'pending') {
    if (method === 'create') {
      args.option('b', {
        alias: 'blank',
        type: 'boolean',
        desc: 'Create blank migration',
      });
      args.option('d', {
        alias: 'dump',
        type: 'boolean',
        desc: 'Dumps all queries to console',
      });
      args.option('disable-fk-checks', {
        type: 'boolean',
        desc: 'Do not skip foreign key checks',
      });
      args.option('p', {
        alias: 'path',
        type: 'string',
        desc: 'Sets path to directory where to save entities',
      });
    }

    if (['up', 'down'].includes(method)) {
      args.option('t', {
        alias: 'to',
        type: 'string',
        desc: `Migrate ${method} to specific version`,
      });
      args.option('f', {
        alias: 'from',
        type: 'string',
        desc: 'Start migration from specific version',
      });
      args.option('o', {
        alias: 'only',
        type: 'string',
        desc: 'Migrate only specified versions',
      });
    }

    return args;
  }

  static async handleMigrationCommand(args: Arguments<Options>, method: 'create' | 'up' | 'down' | 'list' | 'pending') {
    const successMessage = MigrationCommandFactory.SUCCESS_MESSAGES[method];
    const orm = await CLIHelper.getORM();
    const migrator = orm.getMigrator();

    switch (method) {
      case 'create':
        const ret = await migrator.createMigration(args.path, args.blank);

        if (args.dump) {
          CLIHelper.dump(chalk.green('Creating migration with following queries:'));
          CLIHelper.dump(ret[1].map(sql => '  ' + sql).join('\n'), orm.config, 'sql');
        }

        CLIHelper.dump(chalk.green(successMessage(args.target)));
        break;
      case 'list':
        const executed = await migrator.getExecutedMigrations();

        CLIHelper.dumpTable({
          columns: ['Name', 'Executed at'],
          rows: executed.map(row => [row.name.replace(/\.[jt]s$/, ''), row.executed_at.toISOString()]),
          empty: 'No migrations executed yet',
        });
        break;
      case 'pending':
        const pending = await migrator.getPendingMigrations();
        CLIHelper.dumpTable({
          columns: ['Name'],
          rows: pending.map(row => [row.file.replace(/\.[jt]s$/, '')]),
          empty: 'No pending migrations',
        });
        break;
      case 'up':
      case 'down':
        await migrator[method as 'up' | 'down'](MigrationCommandFactory.getUpDownOptions(args) as string[]);
        CLIHelper.dump(chalk.green(successMessage()));
    }

    await orm.close(true);
  }

  private static getUpDownOptions(flags: Arguments<Options>) {
    if (!flags.to && !flags.from && flags.only) {
      return flags.only.split(/[, ]+/);
    }

    if (flags.from === '0') {
      flags.from = 0;
    }

    if (flags.to === '0') {
      flags.to = 0;
    }

    return flags;
  }

}

export type Options = { dump: boolean; blank: boolean; path: string; target: string; disableFkChecks: boolean; to: string | number; from: string | number; only: string };
