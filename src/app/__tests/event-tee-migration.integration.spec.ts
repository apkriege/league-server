import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { expect, it } from 'vitest';

it('preserves legacy event tees and backfills valid women’s tees during migration', async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  const schema = `tee_migration_${crypto.randomUUID().replaceAll('-', '')}`;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE tee (id INTEGER PRIMARY KEY, course_id INTEGER NOT NULL);
      CREATE TABLE event (
        id INTEGER PRIMARY KEY, course_id INTEGER NOT NULL, tee_id INTEGER NOT NULL,
        route_snapshot JSONB,
        CONSTRAINT event_tee_id_fkey FOREIGN KEY (tee_id) REFERENCES tee(id)
      );
      CREATE INDEX event_tee_id_idx ON event(tee_id);
      CREATE TABLE event_route_segment (
        id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL, course_id INTEGER NOT NULL,
        tee_id INTEGER NOT NULL, position INTEGER NOT NULL,
        CONSTRAINT event_route_segment_tee_id_fkey FOREIGN KEY (tee_id) REFERENCES tee(id)
      );
      CREATE INDEX event_route_segment_tee_id_idx ON event_route_segment(tee_id);
      INSERT INTO tee VALUES (1, 10), (2, 10), (3, 20), (4, 20);
      INSERT INTO event VALUES
        (1, 10, 1, '{"version":1,"segments":[{"position":0,"teeId":1,"womenTeeId":2},{"position":1,"teeId":3,"womenTeeId":4}]}'),
        (2, 10, 1, '{"version":1,"segments":[{"teeId":1}]}'),
        (3, 10, 1, '{"version":1,"segments":[{"womenTeeId":4}]}'),
        (4, 10, 1, NULL);
      INSERT INTO event_route_segment VALUES
        (1, 1, 10, 1, 0), (2, 1, 20, 3, 1), (3, 2, 10, 1, 0), (4, 3, 10, 1, 0);
    `);
    const migration = await readFile('prisma/migrations/20261010000000_gender_specific_event_tees/migration.sql', 'utf8');
    await client.query(migration);
    expect((await client.query('SELECT id, men_tee_id, women_tee_id FROM event ORDER BY id')).rows).toEqual([
      { id: 1, men_tee_id: 1, women_tee_id: 2 },
      { id: 2, men_tee_id: 1, women_tee_id: null },
      { id: 3, men_tee_id: 1, women_tee_id: null },
      { id: 4, men_tee_id: 1, women_tee_id: null },
    ]);
    expect((await client.query('SELECT id, men_tee_id, women_tee_id FROM event_route_segment ORDER BY id')).rows).toEqual([
      { id: 1, men_tee_id: 1, women_tee_id: 2 },
      { id: 2, men_tee_id: 3, women_tee_id: 4 },
      { id: 3, men_tee_id: 1, women_tee_id: null },
      { id: 4, men_tee_id: 1, women_tee_id: null },
    ]);
    expect((await client.query('SELECT route_snapshot FROM event WHERE id = 1')).rows[0].route_snapshot.segments[0].teeId).toBe(1);
  } finally {
    await client.query('ROLLBACK');
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
});
