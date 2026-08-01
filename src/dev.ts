import 'dotenv/config';

const printCrash = (label: string, reason: unknown) => {
  const stack = reason instanceof Error ? reason.stack || reason.message : String(reason);
  process.stderr.write(`\n${label}\n${stack}\n`);
};

process.once('uncaughtException', (error) => {
  printCrash('Uncaught server error:', error);
  process.exit(1);
});

process.once('unhandledRejection', (reason) => {
  printCrash('Unhandled server rejection:', reason);
  process.exit(1);
});

import('./index').catch((error) => {
  printCrash('Server failed to start:', error);
  process.exit(1);
});
