import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
const admin = "00000000-0000-0000-0000-000000000001",
  reception = "00000000-0000-0000-0000-000000000002",
  clinical = "00000000-0000-0000-0000-000000000003";
let db: PGlite;
let patient: string;
let therapy: string;
let visit: string;
async function q(sql: string, params: any[] = []) {
  return db.query<any>(sql, params);
}
async function as(id: string, sql: string, params: any[] = []) {
  await q("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
  try {
    return await q(sql, params);
  } finally {
    await db.exec("reset role");
  }
}
describe("PostgreSQL: etapas 1, 2 y 3", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth,public to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    await db.exec(readFileSync("supabase/migrations/001_core.sql", "utf8"));
    await db.exec(
      readFileSync("supabase/migrations/002_import_and_hardening.sql", "utf8"),
    );
    await db.exec(
      readFileSync("supabase/migrations/003_validation.sql", "utf8"),
    );
    await db.exec(readFileSync("supabase/migrations/004_snapshot.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/005_integrity.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/007_fixed_rates.sql", "utf8"));
    await q("insert into auth.users values($1),($2),($3)", [
      admin,
      reception,
      clinical,
    ]);
    await q(
      `insert into profiles(id,name,permissions) values($1,'Admin',array['admin']),($2,'Recepción',array['reception','finance']),($3,'Terapeuta',array['clinical'])`,
      [admin, reception, clinical],
    );
    patient = (
      await as(
        reception,
        `insert into patients(document_type,document,name) values('Cédula','1-0999-0999','Paciente ficticio') returning id`,
      )
    ).rows[0].id;
    therapy = (
      await as(
        admin,
        `insert into therapies(name) values('Terapia ficticia') returning id`,
      )
    ).rows[0].id;
  }, 60000);
  afterAll(async () => {
    await db.close();
  });
  it("etapa 1: encuentra por cédula normalizada y bloquea duplicados", async () => {
    expect(
      (await as(reception, "select * from patients where document='109990999'"))
        .rows,
    ).toHaveLength(1);
    await expect(
      as(
        reception,
        `insert into patients(document_type,document,name) values('Cédula','109990999','Duplicado')`,
      ),
    ).rejects.toThrow();
  });
  it("etapa 1: antecedentes restringidos aunque tenga administración", async () => {
    await as(
      clinical,
      "insert into backgrounds(patient_id,body) values($1,$2)",
      [patient, "Antecedente ficticio"],
    );
    expect((await as(admin, "select * from backgrounds")).rows).toHaveLength(0);
    expect(
      (await as(reception, "select * from backgrounds")).rows,
    ).toHaveLength(0);
    expect((await as(clinical, "select * from backgrounds")).rows).toHaveLength(
      1,
    );
  });
  it("etapa 2: tarifas fijas validan duración y conservan snapshot", async () => {
    await expect(
      as(
        reception,
        `select create_visit($1,$2,60,'Tarifa 1',2850000,false,null,array[$3::uuid])`,
        [patient, clinical, therapy],
      ),
    ).rejects.toThrow("duración");
    visit = (
      await as(
        reception,
        `select create_visit($1,$2,30,'Tarifa 1',2850000,false,null,array[$3::uuid],'2026-09-30T10:00:00-06:00') id`,
        [patient, clinical, therapy],
      )
    ).rows[0].id;
    await as(
      reception,
      `select create_visit($1,$2,60,'Tarifa 2',5700000,false,null,array[$3::uuid])`,
      [patient, clinical, therapy],
    );
    await as(
      clinical,
      `select create_visit($1,$2,30,'Tarifa modificable',0,true,'Ficticio',array[$3::uuid],'2025-09-30T10:00:00-06:00')`,
      [patient, clinical, therapy],
    );
    await as(admin, `update rates set amount=3000000 where id=1`);
    expect((await q("select amount from rates where id=1")).rows[0].amount).toBe(3000000);
    expect((await q("select amount from rates where id=2")).rows[0].amount).toBe(5700000);
    expect(
      (await as(reception, "select amount from visits where id=$1", [visit]))
        .rows[0].amount,
    ).toBe(2850000);
    expect(
      (
        await as(
          reception,
          "select * from visits where attended_at<'2026-01-01'",
        )
      ).rows,
    ).toHaveLength(1);
    expect((await as(reception, "select * from patients")).rows).toHaveLength(
      1,
    );
  });
  it("etapa 2: temporizador persistente, conflictos y finalizar sin cobro", async () => {
    await expect(as(reception,`select create_visit($1,$2,30,'Tarifa modificable',10000,true,null,array[$3::uuid])`,[patient,clinical,therapy])).rejects.toThrow();
    await as(reception, "select timer_action($1,1,'start')", [visit]);
    let v = (await as(reception, "select * from visits where id=$1", [visit]))
      .rows[0];
    expect(v.status).toBe("running");
    expect(v.minutes).toBe(30);
    expect(v.expected_end).not.toBeNull();
    expect(v.started_at).toBeTruthy();
    expect(v.expected_end).toBeTruthy();
    await expect(
      as(reception, "select timer_action($1,1,'pause')", [visit]),
    ).rejects.toThrow("Otra persona");
    await as(clinical, "select timer_action($1,2,'pause')", [visit]);
    await as(clinical, "select timer_action($1,3,'resume')", [visit]);
    await as(clinical, "select timer_action($1,4,'finish')", [visit]);
    expect((await q("select * from payments")).rows).toHaveLength(0);
    v = (await q("select * from visits where id=$1", [visit])).rows[0];
    expect(v.created_by).toBe(reception);
    expect(v.therapist_id).toBe(clinical);
    expect(v.status).toBe("completed");
  });
  it("etapa 1: notas mantienen versión y motivo; sin lectura administrativa", async () => {
    await as(
      clinical,
      "select save_note($1,0,'Motivo','Síntoma','Nota ficticia','Respuesta',true,null)",
      [visit],
    );
    await expect(
      as(clinical, "select save_note($1,1,'','','Corregida','',true,null)", [
        visit,
      ]),
    ).rejects.toThrow("motivo");
    await as(
      clinical,
      "select save_note($1,1,'','','Corregida','',true,'Corrección de texto')",
      [visit],
    );
    expect((await as(clinical, "select * from notes")).rows).toHaveLength(2);
    expect((await as(admin, "select * from notes")).rows).toHaveLength(0);
    await expect(
      as(reception, "select save_note($1,2,'','','Intrusión','',true,'x')", [
        visit,
      ]),
    ).rejects.toThrow("permiso");
  });
  it("etapa 2: abonos, reintentos, SINPE pendiente, verificación y exceso", async () => {
    const request = "10000000-0000-0000-0000-000000000001";
    await as(
      reception,
      "select record_payment($1,$2,2000000,'Efectivo',true,null,null)",
      [request, visit],
    );
    await as(
      reception,
      "select record_payment($1,$2,2000000,'Efectivo',true,null,null)",
      [request, visit],
    );
    expect((await q("select * from payments")).rows).toHaveLength(1);
    await expect(as(reception,`select record_payment($1,$2,1000000,'Efectivo',true,null,null)`,[request,visit])).rejects.toThrow('diferente');
    const receiver = (
      await as(
        admin,
        "insert into sinpe_numbers(label,phone) values('Principal','88880000') returning id",
      )
    ).rows[0].id;
    const payment = (
      await as(
        reception,
        "select record_payment('10000000-0000-0000-0000-000000000002',$1,850000,'SINPE',false,$2,'Referencia') id",
        [visit, receiver],
      )
    ).rows[0].id;
    expect(
      (
        await q(
          "select sum(amount)::integer total from payments where status='confirmed'",
        )
      ).rows[0].total,
    ).toBe(2000000);
    await as(reception, "select confirm_payment($1)", [payment]);
    await as(reception, "select confirm_payment($1)", [payment]);
    expect(
      (
        await q(
          "select sum(amount)::integer total from payments where status='confirmed'",
        )
      ).rows[0].total,
    ).toBe(2850000);
    await expect(
      as(
        reception,
        "select record_payment('10000000-0000-0000-0000-000000000003',$1,1,'Efectivo',true,null,null)",
        [visit],
      ),
    ).rejects.toThrow("excede");
    await as(admin, "update sinpe_numbers set phone='88880001' where id=$1", [
      receiver,
    ]);
    expect(
      (await q("select sinpe_phone from payments where id=$1", [payment]))
        .rows[0].sinpe_phone,
    ).toBe("88880000");
  });
  it("etapa 2: devolución enlazada reabre saldo y queda auditada", async () => {
    const original = (await q("select * from payments where method='Efectivo'"))
      .rows[0];
    await as(
      reception,
      "select record_payment('10000000-0000-0000-0000-000000000004',$1,500000,'Efectivo',true,null,null,$2,'Devolución ficticia')",
      [visit, original.id],
    );
    expect(
      (
        await q(
          "select sum(case when kind='refund' then -amount else amount end)::integer total from payments where status='confirmed'",
        )
      ).rows[0].total,
    ).toBe(2350000);
    expect(
      (await as(admin, "select * from audit where table_name='payments'")).rows
        .length,
    ).toBeGreaterThan(0);
    await expect(
      as(reception, "update payments set amount=1"),
    ).rejects.toThrow();
  });
  it("etapa 3: importación atómica, fechas y reintento idempotente", async () => {
    const rows = [
      {
        document_type: "Pasaporte",
        document: "X 0123",
        name: "Importado ficticio",
        original_date: "2025-04-11",
      },
    ];
    const request = "20000000-0000-0000-0000-000000000001";
    await as(admin, "select import_patients($1,$2,$3::jsonb)", [
      request,
      "CSV ficticio",
      JSON.stringify(rows),
    ]);
    await as(admin, "select import_patients($1,$2,$3::jsonb)", [
      request,
      "CSV ficticio",
      JSON.stringify(rows),
    ]);
    expect(
      (
        await q(
          "select *,original_date::text original_date from patients where document='X0123'",
        )
      ).rows[0].original_date,
    ).toBe("2025-04-11");
    await expect(
      as(
        admin,
        "select import_patients('20000000-0000-0000-0000-000000000002','CSV',$1::jsonb)",
        [
          JSON.stringify([
            { document_type: "Cédula", document: "222222222", name: "Nuevo" },
            {
              document_type: "Cédula",
              document: "109990999",
              name: "Duplicado",
            },
          ]),
        ],
      ),
    ).rejects.toThrow();
    expect(
      (await q("select * from patients where document='222222222'")).rows,
    ).toHaveLength(0);
  });
  it("etapa 3: citas superpuestas se rechazan", async () => {
    await as(
      reception,
      "insert into appointments(patient_id,therapist_id,starts_at,minutes) values($1,$2,'2026-10-01T10:00:00-06:00',60)",
      [patient, clinical],
    );
    await expect(
      as(
        reception,
        "insert into appointments(patient_id,therapist_id,starts_at,minutes) values($1,$2,'2026-10-01T10:30:00-06:00',30)",
        [patient, clinical],
      ),
    ).rejects.toThrow("otra cita");
  });
  it("snapshot consistente respeta RLS y no expone notas a finanzas", async () => {
    const receptionSnapshot = (
      await as(reception, "select workspace_snapshot() data")
    ).rows[0].data;
    expect(receptionSnapshot.notes).toHaveLength(0);
    expect(receptionSnapshot.backgrounds).toHaveLength(0);
    expect(receptionSnapshot.payments).toHaveLength(3);
    const clinicalSnapshot = (
      await as(clinical, "select workspace_snapshot() data")
    ).rows[0].data;
    expect(clinicalSnapshot.notes).toHaveLength(2);
    expect(clinicalSnapshot.payments).toHaveLength(0);
  });
  it("tarifas validan montos, último precio histórico y campos protegidos", async () => {
    await expect(
      as(admin, `update rates set amount=-5 where id=1`),
    ).rejects.toThrow();
    await expect(
      as(admin, `update rates set name='Otra tarifa' where id=1`),
    ).rejects.toThrow();
    expect(
      (await as(reception, "select amount from visits where id=$1", [visit]))
        .rows[0].amount,
    ).toBe(2850000);
  });
  it("notas finalizadas no pueden volver a borrador y conflictos preservan revisión", async () => {
    await as(
      clinical,
      `select save_note($1,2,'','','Corrección 2','',false,'Motivo nuevo')`,
      [visit],
    );
    expect(
      (await as(clinical, "select * from notes order by revision desc limit 1"))
        .rows[0].finalized,
    ).toBe(true);
    await expect(
      as(
        clinical,
        `select save_note($1,2,'','','Conflicto','',true,'Motivo')`,
        [visit],
      ),
    ).rejects.toThrow("Conflicto");
  });
  it("devolución exige motivo y autoría de paciente no se puede alterar", async () => {
    const original = (
      await q(
        `select * from payments where method='Efectivo' and kind='payment'`,
      )
    ).rows[0];
    await expect(
      as(
        reception,
        `select record_payment('10000000-0000-0000-0000-000000000005',$1,1,'Efectivo',true,null,null,$2,null)`,
        [visit, original.id],
      ),
    ).rejects.toThrow();
    await expect(
      as(reception, "update patients set created_by=$1 where id=$2", [
        clinical,
        patient,
      ]),
    ).rejects.toThrow("autoría");
    const p = (
      await as(reception, "select * from patients where id=$1", [patient])
    ).rows[0];
    await as(
      reception,
      "update patients set phone=$1 where id=$2 and version=$3",
      ["88880000", patient, p.version],
    );
    expect(
      (
        await as(
          clinical,
          "update patients set phone=$1 where id=$2 and version=$3 returning id",
          ["88880001", patient, p.version],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("respaldo de prueba restaura tablas, notas y movimientos PostgreSQL", async () => {
    const dump = await db.dumpDataDir();
    const restored = await PGlite.create({ loadDataDir: dump });
    try {
      expect((await restored.query("select * from patients")).rows.length).toBe(
        (await q("select * from patients")).rows.length,
      );
      expect((await restored.query("select * from notes")).rows).toHaveLength(
        3,
      );
      expect(
        (await restored.query("select * from payments")).rows,
      ).toHaveLength(3);
    } finally {
      await restored.close();
    }
  }, 60000);
  it("desactivar restringe acceso inmediatamente y conserva autoría", async () => {
    await as(admin, "update profiles set active=false where id=$1", [
      reception,
    ]);
    expect((await as(reception, "select * from patients")).rows).toHaveLength(
      0,
    );
    expect(
      (await as(clinical, "select * from visits where id=$1", [visit])).rows[0]
        .created_by,
    ).toBe(reception);
    await expect(
      as(admin, "update profiles set active=false where id=$1", [admin]),
    ).rejects.toThrow("al menos");
  });
});
