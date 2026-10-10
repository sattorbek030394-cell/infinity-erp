import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { hash } from "bcryptjs";
const connection = process.env.INTEGRATION_DATABASE_URL;
const origin = "http://localhost:3100";
const password = randomBytes(24).toString("hex");
const tenant = randomUUID(),
  otherTenant = randomUUID(),
  b1 = randomUUID(),
  b2 = randomUUID(),
  b3 = randomUUID(),
  admin = randomUUID(),
  viewer = randomUUID(),
  outsider = randomUUID();
const pool = new Pool({ connectionString: connection });
let server: ChildProcess | undefined;
let cookie = "";
let viewerCookie = "";
let outsiderCookie = "";
async function login(email: string) {
  const r = await fetch(origin + "/api/login", {
    method: "POST",
    redirect: "manual",
    headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password }),
  });
  assert.equal(r.status, 303);
  return r.headers.get("set-cookie")!.split(";")[0];
}
async function post(
  kind: string,
  data: unknown,
  branchId = b1,
  auth = cookie,
  source = origin,
) {
  return fetch(origin + "/api/records", {
    method: "POST",
    headers: {
      cookie: auth,
      origin: source,
      "content-type": "application/json",
    },
    body: JSON.stringify({ branchId, kind, data }),
  });
}
before(async () => {
  if (!connection) return;
  const passwordHash = await hash(password, 12);
  await pool.query("INSERT INTO tenants VALUES($1,$2),($3,$4)", [
    tenant,
    "SYNTHETIC HTTP A",
    otherTenant,
    "SYNTHETIC HTTP B",
  ]);
  await pool.query(
    "INSERT INTO branches VALUES($1,$2,$3),($4,$2,$5),($6,$7,$8)",
    [b1, tenant, "Infinity", b2, "Second", b3, otherTenant, "Other tenant"],
  );
  for (const [id, label] of [
    [admin, "admin"],
    [viewer, "viewer"],
    [outsider, "outsider"],
  ])
    await pool.query("INSERT INTO users VALUES($1,$2,$3)", [
      id,
      id + "@example.invalid",
      passwordHash,
    ]);
  await pool.query(
    "INSERT INTO memberships VALUES($1,$2,$3,'admin'),($1,$2,$4,'admin'),($5,$2,$3,'viewer'),($6,$7,$8,'admin')",
    [admin, tenant, b1, b2, viewer, outsider, otherTenant, b3],
  );
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", "3100"],
    {
      env: {
        ...process.env,
        DATABASE_URL: connection,
        APP_ORIGIN: origin,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: "pipe",
    },
  );
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(origin + "/login");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(ready, "Server startup failed");
  cookie = await login(admin + "@example.invalid");
  viewerCookie = await login(viewer + "@example.invalid");
  outsiderCookie = await login(outsider + "@example.invalid");
});
after(async () => {
  server?.kill();
  if (connection) {
    for (const table of [
      "audit_events",
      "payments",
      "installments",
      "contracts",
      "inventory",
      "memberships",
      "branches",
    ]) {
      if (table === "installments")
        await pool.query(
          "DELETE FROM installments WHERE contract_id IN (SELECT id FROM contracts WHERE tenant_id IN ($1,$2))",
          [tenant, otherTenant],
        );
      else
        await pool.query(
          "DELETE FROM " + table + " WHERE tenant_id IN ($1,$2)",
          [tenant, otherTenant],
        );
    }
    await pool.query("DELETE FROM sessions WHERE user_id IN ($1,$2,$3)", [
      admin,
      viewer,
      outsider,
    ]);
    await pool.query("DELETE FROM users WHERE id IN ($1,$2,$3)", [
      admin,
      viewer,
      outsider,
    ]);
    await pool.query("DELETE FROM tenants WHERE id IN ($1,$2)", [
      tenant,
      otherTenant,
    ]);
    await pool.query("DELETE FROM login_attempts WHERE email IN ($1,$2,$3)", [
      admin + "@example.invalid",
      viewer + "@example.invalid",
      outsider + "@example.invalid",
    ]);
  }
  await pool.end();
});
test(
  "HTTP: login, tenant/branch authorization, transaction rollback, payment replay and concurrent overpayment",
  { skip: !connection },
  async () => {
    const input = {
      imei: "111111111111111",
      model: "SYNTHETIC test phone",
      cost: 1000,
    };
    const rejectedLogin = await fetch(origin + "/api/login", {
      method: "POST",
      headers: {
        origin: "https://evil.invalid",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: admin + "@example.invalid",
        password,
      }),
    });
    assert.equal(rejectedLogin.status, 400);
    assert.equal((await post("inventory", input, b1, "")).status, 400);
    assert.equal(
      (await post("inventory", input, b1, cookie, "https://evil.invalid"))
        .status,
      400,
    );
    assert.equal(
      (await post("inventory", input, b1, viewerCookie)).status,
      400,
    );
    assert.equal((await post("inventory", input, b3)).status, 400);
    assert.equal(
      (await post("inventory", input, b1, outsiderCookie)).status,
      400,
    );
    const itemResponse = await post("inventory", input);
    assert.equal(itemResponse.status, 200);
    const item = (await itemResponse.json()).id;
    assert.equal((await post("inventory", input)).status, 400);
    assert.equal(
      (await post("inventory", input, b3, outsiderCookie)).status,
      200,
      "same IMEI in another tenant is permitted",
    );
    const terms = {
      inventoryId: item,
      customerLabel: "SYNTHETIC contract",
      total: 1000,
      downPayment: 200,
      months: 3,
      startDate: "2026-01-31",
    };
    assert.equal((await post("contracts", terms, b2)).status, 400);
    assert.equal(
      (
        await post("contracts", {
          ...terms,
          total: 2,
          downPayment: 0,
          months: 36,
        })
      ).status,
      400,
    );
    assert.equal(
      (await pool.query("SELECT status FROM inventory WHERE id=$1", [item]))
        .rows[0].status,
      "available",
      "failed schedule rolls back inventory and contract",
    );
    const response = await post("contracts", terms);
    assert.equal(response.status, 200);
    const contract = (await response.json()).id;
    assert.equal((await post("contracts", terms)).status, 400);
    assert.equal(
      Number(
        (
          await pool.query(
            "SELECT sum(amount) n FROM installments WHERE contract_id=$1",
            [contract],
          )
        ).rows[0].n,
      ),
      800,
    );
    const payment = {
      contractId: contract,
      amount: 100,
      method: "cash",
      requestKey: randomUUID(),
    };
    assert.equal((await post("payments", payment, b2)).status, 400);
    const concurrent = await Promise.all([
      post("payments", payment),
      post("payments", payment),
    ]);
    for (const r of concurrent) assert.equal(r.status, 200);
    assert.equal(
      (await post("payments", { ...payment, amount: 101 })).status,
      400,
      "replay payload mismatch blocked",
    );
    assert.equal(
      Number(
        (
          await pool.query(
            "SELECT count(*) n FROM payments WHERE contract_id=$1",
            [contract],
          )
        ).rows[0].n,
      ),
      1,
    );
    const raced = await Promise.all([
      post("payments", { ...payment, amount: 500, requestKey: randomUUID() }),
      post("payments", { ...payment, amount: 500, requestKey: randomUUID() }),
    ]);
    assert.deepEqual(raced.map((r) => r.status).sort(), [200, 400]);
    const view = await fetch(origin + "/erp?branch=" + b2 + "&tab=inventory", {
      headers: { cookie },
    });
    const html = await view.text();
    assert.equal(view.status, 200);
    assert.ok(!html.includes(input.imei), "other branch data must not leak");
    const forbidden = await fetch(
      origin + "/erp?branch=" + b1 + "&tab=inventory",
      { headers: { cookie: outsiderCookie } },
    );
    assert.ok(!(await forbidden.text()).includes(input.imei));
    for (const tab of ["dashboard", "inventory", "contracts", "payments"])
      assert.equal(
        (
          await fetch(origin + "/erp?branch=" + b1 + "&tab=" + tab, {
            headers: { cookie },
          })
        ).status,
        200,
      );
    const get = async (path: string, auth = cookie) => {
      const r = await fetch(origin + path, { headers: { cookie: auth } });
      assert.equal(r.status, 200);
      return r.text();
    };
    const body = (html: string) =>
      html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
    const base = "/erp?branch=" + b1;
    const detail = "/erp/contracts/" + contract + "?branch=" + b1;
    const detailHtml = await get(detail);
    assert.ok(detailHtml.includes(input.imei));
    assert.ok(detailHtml.includes("Oylik jadval"));
    assert.ok(detailHtml.includes("To‘lov tarixi"));
    assert.ok(detailHtml.includes("To‘lov kiritish"));
    assert.ok(!(await get(detail, viewerCookie)).includes("To‘lov kiritish"));
    for (const [path, auth] of [
      [detail, outsiderCookie],
      ["/erp/contracts/" + contract + "?branch=" + b2, cookie],
      ["/erp/contracts/" + randomUUID() + "?branch=" + b1, cookie],
    ]) {
      const r = await fetch(origin + path, { headers: { cookie: auth } });
      const text = await r.text();
      assert.ok(text.includes("Shartnoma topilmadi"));
      assert.ok(!text.includes(input.imei));
    }
    const found = await get(
      base + "&tab=inventory&q=" + input.imei,
      viewerCookie,
    );
    assert.ok(body(found).includes(input.imei));
    assert.ok(
      body(
        await get(base + "&tab=inventory&q=missing-device", viewerCookie),
      ).includes("Qurilma topilmadi"),
    );
    assert.ok(
      !body(
        await get(base + "&tab=inventory&status=available", viewerCookie),
      ).includes(input.imei),
    );
    assert.ok(
      body(
        await get(base + "&tab=contracts&q=" + input.imei, viewerCookie),
      ).includes(terms.customerLabel),
    );
    assert.ok(
      body(
        await get(base + "&tab=contracts&status=paid", viewerCookie),
      ).includes("Shartnoma topilmadi"),
    );
    const dashboard = (html: string) =>
      html.match(/<div class="cards">([\s\S]*?)<\/div>/)?.[1];
    assert.equal(
      dashboard(await get(base + "&tab=dashboard")),
      dashboard(await get(base + "&tab=dashboard&q=missing-device")),
    );
    // Synthetic history fixtures exercise pagination beyond the former 100-row limit.
    await pool.query(
      "INSERT INTO payments(id,tenant_id,branch_id,contract_id,amount,method,request_key,created_at) SELECT gen_random_uuid(),$1,$2,$3,1,CASE WHEN g%2=1 THEN 'card' ELSE 'cash' END,gen_random_uuid(),'2026-06-01T00:00:00Z'::timestamptz FROM generate_series(1,105) g",
      [tenant, b1, contract],
    );
    for (const time of ["2026-05-31T21:00:00Z", "2026-06-01T21:00:00Z"])
      await pool.query(
        "INSERT INTO payments(id,tenant_id,branch_id,contract_id,amount,method,request_key,created_at) VALUES($1,$2,$3,$4,1,'card',$5,$6)",
        [randomUUID(), tenant, b1, contract, randomUUID(), time],
      );
    const clean = (html: string) => html.replace(/<!--[\s\S]*?-->/g, "");
    const last = await get(base + "&tab=payments&page=999", viewerCookie);
    assert.ok(clean(last).includes("109 ta to‘lov topildi."));
    assert.equal((body(last).match(/<tr>/g) ?? []).length, 9);
    const filtered = await get(
      base + "&tab=payments&method=card&from=2026-06-01&to=2026-06-01&page=2",
      viewerCookie,
    );
    assert.ok(
      clean(filtered).includes("54 ta to‘lov topildi."),
      "dates must use inclusive Tashkent calendar boundaries",
    );
    assert.equal((body(filtered).match(/<tr>/g) ?? []).length, 20);
    assert.ok(!body(filtered).includes("Naqd"));
    const contractHistory = await get(detail + "&page=6", viewerCookie);
    assert.ok(clean(contractHistory).includes("109 ta to‘lov topildi."));
    assert.equal(
      (
        body(contractHistory.split("<h2>To‘lov tarixi</h2>")[1] ?? "").match(
          /<tr>/g,
        ) ?? []
      ).length,
      9,
    );
    assert.ok(
      body(await get(base + "&tab=payments&q=%25", viewerCookie)).includes(
        "To‘lov topilmadi",
      ),
    );
    assert.ok(
      body(await get("/erp?branch=" + b2 + "&tab=payments", cookie)).includes(
        "To‘lov topilmadi",
      ),
    );
    for (let i = 0; i < 5; i++) {
      const wrong = await fetch(origin + "/api/login", {
        method: "POST",
        redirect: "manual",
        headers: {
          origin,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          email: viewer + "@example.invalid",
          password: "incorrect-synthetic-password",
        }),
      });
      assert.equal(wrong.status, 401);
    }
    const locked = await fetch(origin + "/api/login", {
      method: "POST",
      redirect: "manual",
      headers: { origin, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        email: viewer + "@example.invalid",
        password,
      }),
    });
    assert.equal(
      locked.status,
      401,
      "correct password cannot bypass temporary lock",
    );
    await pool.query(
      "UPDATE login_attempts SET blocked_until=now()-interval '1 second' WHERE email=$1",
      [viewer + "@example.invalid"],
    );
    await login(viewer + "@example.invalid");
    const logout = await fetch(origin + "/api/logout", {
      method: "POST",
      redirect: "manual",
      headers: { cookie, origin },
    });
    assert.equal(logout.status, 303);
    assert.equal(
      (await post("inventory", { ...input, imei: "222222222222222" })).status,
      400,
    );
  },
);
