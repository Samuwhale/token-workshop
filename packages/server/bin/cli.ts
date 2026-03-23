#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { startServer } from '../src/index.js';

const { values } = parseArgs({
  options: {
    dir: { type: 'string', default: './tokens' },
    port: { type: 'string', default: '9400' },
    host: { type: 'string', default: 'localhost' },
  },
});

startServer({
  tokenDir: values.dir!,
  port: parseInt(values.port!, 10),
  host: values.host!,
});
