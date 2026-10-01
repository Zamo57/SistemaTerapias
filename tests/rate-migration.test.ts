import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/007_fixed_rates.sql", "utf8");
async function legacyDb(a: unknown, b: unknown) {
  const db = new PGlite();
  await db.exec(`create role authenticated;
    create table rates(id integer primary key,name text,prices jsonb);
    insert into rates values(1,'Tarifa 1','${JSON.stringify(a)}'),(2,'Tarifa 2','${JSON.stringify(b)}');
    create table visits(rate_name text check(rate_name in ('Tarifa 1','Tarifa 2','Tarifa modificable')));
    create table profiles(id uuid,active boolean,permissions text[]);
    create table therapies(id uuid,active boolean,name text);
    create table visit_therapies(visit_id uuid,therapy_id uuid,therapy_name text);
    create function allowed(text) returns boolean language sql as $$select false$$;
  `);
  return db;
}

it("preserva importes compatibles y aborta ante una matriz antigua ambigua", async () => {
  const compatible = await legacyDb({ 30: 3100000 }, { 60: 6100000 });
  await compatible.exec(migration);
  expect((await compatible.query("select minutes,amount from rates order by id")).rows)
    .toEqual([{ minutes: 30, amount: 3100000 }, { minutes: 60, amount: 6100000 }]);
  await compatible.close();

  const ambiguous = await legacyDb({ 30: 3100000, 60: 5700000 }, { 30: 3300000, 60: 6100000 });
  await expect(ambiguous.exec(migration)).rejects.toThrow("Tarifas incompatibles");
  await ambiguous.exec("rollback");
  expect((await ambiguous.query("select prices from rates order by id")).rows)
    .toEqual([{ prices: { 30: 3100000, 60: 5700000 } }, { prices: { 30: 3300000, 60: 6100000 } }]);
  await ambiguous.close();
});
