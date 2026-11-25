import 'fake-indexeddb/auto';
import { beforeEach } from 'vitest';
import { resetDBConnection } from '../db/database';

beforeEach(() => {
  localStorage.clear();
  resetDBConnection();
});
