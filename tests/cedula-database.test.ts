import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
const user = "00000000-0000-0000-0000-000000000001",
  other = "00000000-0000-0000-0000-000000000002";
let db: PGlite;
const query = async (sql: string, args: unknown[] = []) =>
  (await db.query<any>(sql, args)).rows;
const reserve = async (c = "000000000", u = user, poll = false) =>
  (
    await query("select cedula_reserve($1,$2,gen_random_uuid(),$3) as result", [
      c,
      u,
      poll,
    ])
  )[0].result;
describe("GoMeta: PostgreSQL privado y cuotas persistentes", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(
      "create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to authenticated;",
    );
    for (const f of [
      "001_core",
      "002_import_and_hardening",
      "003_validation",
      "004_snapshot",
      "005_integrity",
      "006_cedula_lookup",
    ])
      await db.exec(readFileSync(`supabase/migrations/${f}.sql`, "utf8"));
    await query("insert into auth.users values($1),($2)", [user, other]);
    await query(
      "insert into profiles(id,name,permissions) values($1,'FICTICIO',array['reception']),($2,'FICTICIO',array['clinical'])",
      [user, other],
    );
  }, 60000);
  afterAll(async () => db.close());
  beforeEach(async () => {
    await db.exec(
      "delete from cedula_usage;delete from cedula_flights;delete from cedula_cache;update cedula_gate set blocked_until=null;",
    );
  });
  it("caché vigente no reserva cupo externo; vencida sí", async () => {
    await db.exec(
      "insert into cedula_cache values('000000000','FICTICIO','EJEMPLO','PRUEBA','GoMeta',now())",
    );
    expect((await reserve()).state).toBe("cached");
    expect(
      (
        await query(
          "select count(*)::int n from cedula_usage where kind='external'",
        )
      )[0].n,
    ).toBe(0);
    await db.exec(
      "update cedula_cache set consulted_at=now()-interval '30 days'",
    );
    expect((await reserve()).state).toBe("owner");
  });
  it("ventana deslizante comparte 20 cupos entre usuarios", async () => {
    for (let i = 0; i < 20; i++)
      expect(
        (await reserve(String(i).padStart(9, "0"), i % 2 ? user : other)).state,
      ).toBe("owner");
    expect((await reserve("000000020")).state).toBe("limited");
    await db.exec("update cedula_usage set at=now()-interval '5 minutes'");
    expect((await reserve("000000020")).state).toBe("owner");
  });
  it("límite por usuario independiente del cupo del proveedor", async () => {
    for (let i = 0; i < 20; i++)
      expect(
        (await query("select cedula_user_limit($1) as ok", [user]))[0].ok,
      ).toBe(true);
    expect(
      (await query("select cedula_user_limit($1) as ok", [user]))[0].ok,
    ).toBe(false);
    expect(
      (await query("select cedula_user_limit($1) as ok", [other]))[0].ok,
    ).toBe(true);
  });
  it("reserva concurrente agrupa cédula y un poll no consume otro cupo", async () => {
    const results = await Promise.all([reserve(), reserve()]);
    expect(results.map((x) => x.state).sort()).toEqual(["owner", "waiting"]);
    expect((await reserve("000000000", user, true)).state).toBe("waiting");
    expect(
      (
        await query(
          "select count(*)::int n from cedula_usage where kind='external'",
        )
      )[0].n,
    ).toBe(1);
  });
  it("429 bloquea futuras consultas y no crea caché de error", async () => {
    await reserve();
    const token = (await query("select token from cedula_flights"))[0].token;
    await query("select cedula_finish('000000000',$1,'limited',null,600)", [
      token,
    ]);
    expect((await reserve("000000001")).state).toBe("limited");
    expect((await query("select count(*)::int n from cedula_cache"))[0].n).toBe(
      0,
    );
  });
  it("RLS y privilegios impiden enumerar caché o manipular contadores", async () => {
    await db.exec("set role authenticated");
    try {
      await expect(query("select * from cedula_cache")).rejects.toThrow();
      await expect(
        query("select cedula_user_limit($1)", [user]),
      ).rejects.toThrow();
      await expect(
        query("update cedula_gate set blocked_until=null"),
      ).rejects.toThrow();
    } finally {
      await db.exec("reset role");
    }
  });
});
