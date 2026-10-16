// The package is `"type": "module"`, so Node would read dist/cjs/*.js as ESM.
// A nested package.json marks that one directory as CommonJS.
import { writeFileSync } from 'node:fs';

writeFileSync(
  new URL('../dist/cjs/package.json', import.meta.url),
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
);
