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
  kassir = randomUUID(),
  outsider = randomUUID();
const pool = new Pool({ connectionString: connection });
let server: ChildProcess | undefined;
let cookie = "";
let viewerCookie = "";
let outsiderCookie = "";
const extraUsers: string[] = [];
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
    [kassir, "kassir"],
    [outsider, "outsider"],
  ])
    await pool.query("INSERT INTO users VALUES($1,$2,$3)", [
      id,
      id + "@example.invalid",
      passwordHash,
    ]);
  await pool.query(
    "INSERT INTO memberships VALUES($1,$2,$3,'admin'),($1,$2,$4,'admin'),($5,$2,$3,'viewer'),($6,$7,$8,'admin'),($9,$2,$3,'cashier')",
    [admin, tenant, b1, b2, viewer, outsider, otherTenant, b3, kassir],
  );
  // Kassir PAY-06 sinovlari uchun: naqdni tasdiqlaydi, P2P/bankni yo'q.
  extraUsers.push(kassir);
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
    // Tartib muhim: bola jadval ota jadvaldan oldin o'chadi.
    for (const table of [
      "audit_events",
      "investor_shares",
      "investor_months",
      "investor_entries",
      "cash_entries",
      "monthly_targets",
      "cash_closing_lines",
      "cash_closings",
      "supplier_settlements",
      "supplier_obligations",
      "device_controls",
      "contract_closures",
      "customer_advances",
      "payments",
      "cash_sales",
      "cash_operations",
      "cash_wallets",
      "installments",
      "contracts",
      "customers",
      "inventory",
      "investors",
      "suppliers",
      "exchange_rates",
      "memberships",
      "nasiya_settings",
      "branches",
    ]) {
      if (table === "cash_closing_lines")
        await pool.query(
          "DELETE FROM cash_closing_lines WHERE closing_id IN (SELECT id FROM cash_closings WHERE tenant_id IN ($1,$2))",
          [tenant, otherTenant],
        );
      else if (table === "installments")
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
    for (const id of extraUsers) {
      await pool.query("DELETE FROM sessions WHERE user_id=$1", [id]);
      await pool.query(
        "DELETE FROM login_attempts WHERE email IN (SELECT email FROM users WHERE id=$1)",
        [id],
      );
      await pool.query("DELETE FROM users WHERE id=$1", [id]);
    }
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
    // Parallel ikki to'lov: ikkisi ham qoplanadi, lekin biror so'm
    // yo'qolmaydi yoki ikki marta sanalmaydi (qarz 700 edi).
    const raced = await Promise.all([
      post("payments", { ...payment, amount: 250, requestKey: randomUUID() }),
      post("payments", { ...payment, amount: 250, requestKey: randomUUID() }),
    ]);
    assert.deepEqual(raced.map((r) => r.status).sort(), [200, 200]);
    assert.equal(
      Number(
        (
          await pool.query(
            `SELECT c.total-c.down_payment-COALESCE((SELECT sum(p.amount) FROM payments p
 WHERE p.contract_id=c.id AND p.status='approved' AND p.voided_at IS NULL),0) balance
 FROM contracts c WHERE c.id=$1`,
            [contract],
          )
        ).rows[0].balance,
      ),
      200,
      "parallel to'lovlar aniq qo'shiladi",
    );
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
    for (const tab of [
      "dashboard",
      "inventory",
      "contracts",
      "payments",
      "arrears",
    ])
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
    const today = (
      await pool.query(
        "SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text today",
      )
    ).rows[0].today;
    const cash = async (
      data: Record<string, unknown>,
      auth = cookie,
      source = origin,
    ) =>
      fetch(origin + "/api/cash", {
        method: "POST",
        headers: {
          cookie: auth,
          origin: source,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          branchId: b1,
          requestKey: randomUUID(),
          wallet: "cash_uzs",
          date: today,
          amount: "100",
          action: "entry",
          direction: "in",
          category: "Boshqa kirim",
          ...data,
        }),
      });
    for (const auth of ["", viewerCookie, outsiderCookie])
      assert.equal((await cash({}, auth)).status, 403);
    assert.equal((await cash({ branchId: b3 })).status, 403);
    assert.equal((await cash({}, cookie, "https://evil.invalid")).status, 400);
    assert.equal((await cash({ tenantId: tenant })).status, 400);
    const initial = (
      await pool.query(
        "SELECT count(*) n,sum(amount_minor) amount FROM cash_entries WHERE tenant_id=$1 AND branch_id=$2",
        [tenant, b1],
      )
    ).rows[0];
    assert.equal(Number(initial.n), 3);
    assert.equal(
      Number(initial.amount),
      800,
      "automatic receipts are posted once, inside financial transaction",
    );
    assert.ok(
      (await get(base + "&tab=cash", viewerCookie)).includes("Qoldiq noma’lum"),
    );
    const opening = {
      action: "opening",
      direction: undefined,
      category: undefined,
      amount: "1000",
      requestKey: randomUUID(),
    };
    assert.equal((await cash(opening)).status, 200);
    assert.equal((await cash(opening)).status, 200);
    assert.equal(
      (await cash({ ...opening, requestKey: randomUUID() })).status,
      400,
    );
    const balance = async (wallet = "cash_uzs") =>
      Number(
        (
          await pool.query(
            "SELECT w.opening_minor+coalesce(sum(e.amount_minor),0) balance FROM cash_wallets w LEFT JOIN cash_entries e ON e.tenant_id=w.tenant_id AND e.branch_id=w.branch_id AND e.wallet=w.wallet AND e.entry_date>=w.opening_date AND e.entry_date<=$3::date WHERE w.tenant_id=$1 AND w.branch_id=$2 AND w.wallet=$4 GROUP BY w.opening_minor",
            [tenant, b1, today, wallet],
          )
        ).rows[0].balance,
      );
    assert.equal(await balance(), 1800);
    const expense = {
      direction: "out",
      amount: "300",
      requestKey: randomUUID(),
    };
    assert.equal((await cash(expense)).status, 200);
    assert.equal((await cash(expense)).status, 200);
    assert.equal(await balance(), 1500);
    assert.equal((await cash({ ...expense, amount: "301" })).status, 400);
    for (const amount of ["", "1e3", "-1", "1.50", "0"])
      assert.equal((await cash({ amount })).status, 400);
    assert.equal((await cash({ date: "2099-01-01" })).status, 400);
    assert.equal((await cash({ date: today + "T12:00:00" })).status, 400);
    assert.equal(
      (
        await cash({
          ...opening,
          wallet: "cash_usd",
          amount: "100.25",
          requestKey: randomUUID(),
        })
      ).status,
      200,
    );
    assert.equal(
      (await cash({ wallet: "cash_usd", amount: "0.01" })).status,
      200,
    );
    assert.equal(await balance("cash_usd"), 10026);
    const transfer = {
      action: "transfer",
      direction: undefined,
      category: undefined,
      destination: "card_uzs",
      amount: "100",
      requestKey: randomUUID(),
    };
    assert.equal((await cash(transfer)).status, 200);
    assert.equal((await cash(transfer)).status, 200);
    assert.equal(await balance(), 1400);
    assert.equal(
      Number(
        (
          await pool.query(
            "SELECT sum(amount_minor) amount,count(*) n FROM cash_entries WHERE operation_id=$1",
            [transfer.requestKey],
          )
        ).rows[0].amount,
      ),
      0,
    );
    assert.equal(
      Number(
        (
          await pool.query(
            "SELECT count(*) n FROM cash_entries WHERE operation_id=$1",
            [transfer.requestKey],
          )
        ).rows[0].n,
      ),
      2,
    );
    assert.equal(
      (
        await cash({
          ...transfer,
          requestKey: randomUUID(),
          destination: "cash_usd",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await cash({
          ...transfer,
          requestKey: randomUUID(),
          destination: "cash_uzs",
        })
      ).status,
      400,
    );
    assert.equal((await cash({ ...expense, branchId: b2 })).status, 400);
    assert.ok(
      !(await get("/erp?branch=" + b2 + "&tab=cash")).includes(
        "Nasiya • avtomatik",
      ),
    );
    // A separate synthetic branch reproduces the user's complete cash example.
    for (const [wallet, amount] of [
      ["cash_uzs", "1000000"],
      ["card_uzs", "0"],
    ])
      assert.equal(
        (
          await cash({
            ...opening,
            branchId: b2,
            wallet,
            amount,
            requestKey: randomUUID(),
          })
        ).status,
        200,
      );
    const checkExample = async (expected: number) =>
      assert.equal(
        Number(
          (
            await pool.query(
              "SELECT w.opening_minor+coalesce(sum(e.amount_minor),0) n FROM cash_wallets w LEFT JOIN cash_entries e ON e.tenant_id=w.tenant_id AND e.branch_id=w.branch_id AND e.wallet=w.wallet WHERE w.branch_id=$1 AND w.wallet='cash_uzs' GROUP BY w.opening_minor",
              [b2],
            )
          ).rows[0].n,
        ),
        expected,
      );
    assert.equal((await cash({ branchId: b2, amount: "200000" })).status, 200);
    await checkExample(1200000);
    const exampleExpense = randomUUID();
    assert.equal(
      (
        await cash({
          branchId: b2,
          direction: "out",
          amount: "150000",
          requestKey: exampleExpense,
        })
      ).status,
      200,
    );
    await checkExample(1050000);
    const exampleTransfer = randomUUID();
    assert.equal(
      (
        await cash({
          ...transfer,
          branchId: b2,
          amount: "300000",
          requestKey: exampleTransfer,
        })
      ).status,
      200,
    );
    await checkExample(750000);
    assert.equal(
      Number(
        (
          await pool.query(
            "SELECT sum(amount_minor) n FROM cash_entries WHERE branch_id=$1 AND wallet='card_uzs'",
            [b2],
          )
        ).rows[0].n,
      ),
      300000,
    );
    const entryId = (
      await pool.query(
        "SELECT id FROM cash_entries WHERE operation_id=$1 LIMIT 1",
        [exampleExpense],
      )
    ).rows[0].id;
    const reverse = async (
      data: Record<string, unknown>,
      auth = cookie,
      source = origin,
    ) =>
      fetch(origin + "/api/cash/reverse", {
        method: "POST",
        headers: {
          cookie: auth,
          origin: source,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          branchId: b2,
          entryId,
          requestKey: randomUUID(),
          reason: "Sun’iy xato tuzatish",
          ...data,
        }),
      });
    for (const auth of ["", viewerCookie, outsiderCookie])
      assert.equal((await reverse({}, auth)).status, 403);
    assert.equal(
      (await reverse({}, cookie, "https://evil.invalid")).status,
      400,
    );
    assert.equal((await reverse({ reason: " " })).status, 400);
    assert.equal((await reverse({ branchId: b1 })).status, 400);
    const receipt = (
      await pool.query(
        "SELECT id FROM cash_entries WHERE branch_id=$1 AND payment_id IS NOT NULL LIMIT 1",
        [b1],
      )
    ).rows[0].id;
    assert.equal(
      (await reverse({ branchId: b1, entryId: receipt })).status,
      400,
      "automatic receipt cannot be reversed independently of contract",
    );
    const reversalKey = randomUUID();
    const results = await Promise.all([
      reverse({ requestKey: reversalKey }),
      reverse({ requestKey: reversalKey }),
    ]);
    assert.deepEqual(
      results.map((r) => r.status),
      [200, 200],
    );
    await checkExample(900000);
    assert.equal(
      (await reverse({ requestKey: reversalKey, reason: "Changed reason" }))
        .status,
      400,
    );
    assert.equal(
      (await reverse({})).status,
      400,
      "new key cannot reverse again",
    );
    const reversalEntry = (
      await pool.query("SELECT id FROM cash_entries WHERE reversal_of=$1", [
        entryId,
      ])
    ).rows[0].id;
    assert.equal(
      (await reverse({ entryId: reversalEntry })).status,
      400,
      "cannot reverse a reversal",
    );
    const transferEntry = (
      await pool.query(
        "SELECT id FROM cash_entries WHERE operation_id=$1 LIMIT 1",
        [exampleTransfer],
      )
    ).rows[0].id;
    const race = await Promise.all([
      reverse({ entryId: transferEntry }),
      reverse({ entryId: transferEntry }),
    ]);
    assert.deepEqual(race.map((r) => r.status).sort(), [200, 400]);
    await checkExample(1200000);
    assert.equal(
      Number(
        (
          await pool.query(
            "SELECT sum(amount_minor) n FROM cash_entries WHERE branch_id=$1 AND wallet='card_uzs'",
            [b2],
          )
        ).rows[0].n,
      ),
      0,
    );
    assert.ok(
      (await get("/erp?branch=" + b2 + "&tab=cash")).includes("Bekor qilingan"),
    );
    for (const [branchId, auth] of [
      [b1, outsiderCookie],
      [b2, viewerCookie],
      [b1, ""],
    ]) {
      const deniedExport = await fetch(
        origin + "/api/export?branch=" + branchId,
        { headers: { cookie: auth } },
      );
      assert.equal(deniedExport.status, 403);
      assert.ok(!(await deniedExport.text()).includes(input.imei));
    }
    assert.equal(
      (await fetch(origin + "/api/export?branch=bad", { headers: { cookie } }))
        .status,
      400,
    );
    const exportResponse = await fetch(origin + "/api/export?branch=" + b1, {
      headers: { cookie: viewerCookie },
    });
    assert.equal(exportResponse.status, 200);
    assert.equal(
      exportResponse.headers.get("cache-control"),
      "private, no-store",
    );
    assert.ok(
      exportResponse.headers.get("content-disposition")?.includes(".xlsx"),
    );
    const exported = Buffer.from(await exportResponse.arrayBuffer());
    assert.equal(exported.readUInt32LE(0), 0x04034b50);
    assert.ok(exported.includes(Buffer.from(input.imei)));
    assert.ok(exported.includes(Buffer.from("Kassa qoldiqlari")));
    assert.ok(exported.includes(Buffer.from("Kassa daftari")));
    assert.ok(
      !exported.includes(Buffer.from(entryId)),
      "other branch cash must not leak into export",
    );
    const cashExport = await fetch(origin + "/api/export?branch=" + b2, {
      headers: { cookie },
    });
    assert.equal(cashExport.status, 200);
    const cashBytes = Buffer.from(await cashExport.arrayBuffer());
    assert.ok(cashBytes.includes(Buffer.from(entryId)));
    assert.ok(cashBytes.includes(Buffer.from(reversalEntry)));
    assert.ok(cashBytes.includes(Buffer.from("Bekor qilingan")));
    assert.ok(cashBytes.includes(Buffer.from("Bekor qilish yozuvi")));
    const arrearsHtml = await get(
      base + "&tab=arrears&status=all",
      viewerCookie,
    );
    assert.ok(body(arrearsHtml).includes(input.imei));
    assert.ok(arrearsHtml.includes("eng eski oylikdan"));
    assert.ok(
      !body(
        await get(base + "&tab=arrears&q=absent-debtor", viewerCookie),
      ).includes(input.imei),
    );
    assert.ok(
      !body(
        await get("/erp?branch=" + b2 + "&tab=arrears&status=all"),
      ).includes(input.imei),
    );
    const unauthorizedArrears = await fetch(origin + base + "&tab=arrears", {
      headers: { cookie: outsiderCookie },
    });
    assert.ok(!(await unauthorizedArrears.text()).includes(input.imei));
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
    const fullExport = await fetch(
      origin +
        "/api/export?branch=" +
        b1 +
        "&q=missing&method=transfer&page=999",
      { headers: { cookie: viewerCookie } },
    );
    assert.equal(fullExport.status, 200);
    const fullBytes = Buffer.from(await fullExport.arrayBuffer()).toString();
    const paymentSheet = fullBytes.match(
      /<worksheet[^>]*>[\s\S]*?<t xml:space="preserve">To‘lov ID<\/t>[\s\S]*?<\/worksheet>/,
    )?.[0];
    assert.ok(paymentSheet);
    // Match the sheet body after the payment header, excluding preceding worksheets.
    const paymentRows =
      paymentSheet.slice(paymentSheet.indexOf("To‘lov ID")).match(/<row r=/g) ??
      [];
    assert.equal(
      paymentRows.length,
      109,
      "all payment rows exported, ignoring screen filters and pagination",
    );
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
    // Immediate sales reserve stock and write exactly one linked cash receipt.
    const sellItemResponse = await post("inventory", {
      ...input,
      imei: "666666666666666",
    });
    assert.equal(sellItemResponse.status, 200);
    const sellItem = (await sellItemResponse.json()).id;
    const saleInput = {
      branchId: b1,
      inventoryId: sellItem,
      amount: 500000,
      method: "card",
      requestKey: randomUUID(),
      customerLabel: "SYNTHETIC CASH SALE",
    };
    const sell = async (
      data: Record<string, unknown> = {},
      auth = cookie,
      source = origin,
    ) =>
      fetch(origin + "/api/sales", {
        method: "POST",
        headers: {
          cookie: auth,
          origin: source,
          "content-type": "application/json",
        },
        body: JSON.stringify({ ...saleInput, ...data }),
      });
    for (const auth of ["", viewerCookie, outsiderCookie])
      assert.equal((await sell({}, auth)).status, 403);
    assert.equal((await sell({ branchId: b3 })).status, 403);
    assert.equal((await sell({ branchId: b2 })).status, 400);
    assert.equal((await sell({}, cookie, "https://evil.invalid")).status, 400);
    assert.equal((await sell({ tenantId: tenant })).status, 400);
    for (const amount of [true, "1e3", 0, -1, 1.5])
      assert.equal((await sell({ amount })).status, 400);
    const saleReplay = await Promise.all([sell(), sell()]);
    assert.deepEqual(
      saleReplay.map((r) => r.status),
      [200, 200],
    );
    const saleId = (await saleReplay[0].json()).id;
    assert.equal((await saleReplay[1].json()).id, saleId);
    assert.equal((await sell({ amount: 500001 })).status, 400);
    assert.equal((await sell({ requestKey: randomUUID() })).status, 400);
    assert.equal(
      (await post("contracts", { ...terms, inventoryId: sellItem })).status,
      400,
      "sold cash item cannot become installment contract",
    );
    assert.equal(
      (await pool.query("SELECT status FROM inventory WHERE id=$1", [sellItem]))
        .rows[0].status,
      "sold",
    );
    const saleReceipt = (
      await pool.query("SELECT * FROM cash_entries WHERE sale_id=$1", [saleId])
    ).rows;
    assert.equal(saleReceipt.length, 1);
    assert.equal(saleReceipt[0].wallet, "card_uzs");
    assert.equal(Number(saleReceipt[0].amount_minor), 500000);
    assert.equal(
      (await reverse({ branchId: b1, entryId: saleReceipt[0].id })).status,
      400,
      "cash sale receipt cannot be cancelled as a manual journal entry",
    );
    const salesHtml = await get(
      base + "&tab=sales&q=666666666666666",
      viewerCookie,
    );
    assert.ok(body(salesHtml).includes("SYNTHETIC CASH SALE"));
    assert.ok(!salesHtml.includes("Sotish va Kassaga yozish"));
    assert.ok(
      !body(await get("/erp?branch=" + b2 + "&tab=sales")).includes(
        "666666666666666",
      ),
    );
    assert.ok(
      body(
        await get(base + "&tab=sales&q=666666666666666&method=cash"),
      ).includes("Savdo topilmadi"),
    );
    assert.ok(
      body(
        await get(base + "&tab=sales&q=666666666666666&to=2020-01-01"),
      ).includes("Savdo topilmadi"),
    );
    const salesExport = await fetch(origin + "/api/export?branch=" + b1, {
      headers: { cookie: viewerCookie },
    });
    assert.equal(salesExport.status, 200);
    const saleBytes = Buffer.from(await salesExport.arrayBuffer());
    assert.ok(saleBytes.includes(Buffer.from("Naqd savdo")));
    assert.ok(saleBytes.includes(Buffer.from(saleId)));
    const raceItemResponse = await post("inventory", {
      ...input,
      imei: "888888888888888",
    });
    assert.equal(raceItemResponse.status, 200);
    const raceItem = (await raceItemResponse.json()).id;
    const reservationRace = await Promise.all([
      sell({ inventoryId: raceItem, requestKey: randomUUID() }),
      post("contracts", { ...terms, inventoryId: raceItem }),
    ]);
    assert.deepEqual(reservationRace.map((r) => r.status).sort(), [200, 400]);
    assert.equal(
      Number(
        (
          await pool.query(
            "SELECT (SELECT count(*) FROM cash_sales WHERE inventory_id=$1)+(SELECT count(*) FROM contracts WHERE inventory_id=$1) n",
            [raceItem],
          )
        ).rows[0].n,
      ),
      1,
      "only one type of sale can reserve a device",
    );
    // Corrections must update debt and the linked cash receipt together.
    const correctionItemResponse = await post("inventory", {
      ...input,
      imei: "777777777777777",
    });
    assert.equal(correctionItemResponse.status, 200);
    const correctionContractResponse = await post("contracts", {
      ...terms,
      inventoryId: (await correctionItemResponse.json()).id,
      customerLabel: "SYNTHETIC CORRECTION",
      total: 1000000,
      downPayment: 0,
      months: 2,
    });
    assert.equal(correctionContractResponse.status, 200);
    const correctionContract = (await correctionContractResponse.json()).id;
    const payCorrection = async (amount: number, method = "card") =>
      post("payments", {
        contractId: correctionContract,
        amount,
        method,
        requestKey: randomUUID(),
      });
    const firstResponse = await payCorrection(200000),
      secondResponse = await payCorrection(300000);
    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 200);
    const correctionFirst = (await firstResponse.json()).id,
      correctionSecond = (await secondResponse.json()).id;
    const voidPay = async (
      data: Record<string, unknown>,
      auth = cookie,
      source = origin,
    ) =>
      fetch(origin + "/api/payments/void", {
        method: "POST",
        headers: {
          cookie: auth,
          origin: source,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          branchId: b1,
          paymentId: correctionFirst,
          requestKey: randomUUID(),
          reason: "Sun’iy xato summa",
          ...data,
        }),
      });
    for (const auth of ["", viewerCookie, outsiderCookie])
      assert.equal((await voidPay({}, auth)).status, 403);
    assert.equal((await voidPay({ branchId: b2 })).status, 400);
    assert.equal(
      (await voidPay({}, cookie, "https://evil.invalid")).status,
      400,
    );
    assert.equal((await voidPay({ reason: " " })).status, 400);
    assert.equal((await voidPay({ tenantId: tenant })).status, 400);
    const legacyPayment = (
      await pool.query(
        "SELECT p.id FROM payments p WHERE p.contract_id=$1 AND NOT EXISTS(SELECT 1 FROM cash_entries e WHERE e.payment_id=p.id) LIMIT 1",
        [contract],
      )
    ).rows[0].id;
    assert.equal(
      (await voidPay({ paymentId: legacyPayment })).status,
      400,
      "legacy missing cash link is not silently corrected",
    );
    const correctionKey = randomUUID();
    const corrected = await Promise.all([
      voidPay({ requestKey: correctionKey }),
      voidPay({ requestKey: correctionKey }),
    ]);
    assert.deepEqual(
      corrected.map((r) => r.status),
      [200, 200],
    );
    assert.equal(
      (await voidPay({ requestKey: correctionKey, reason: "Different reason" }))
        .status,
      400,
    );
    assert.equal((await voidPay({})).status, 400);
    const activePaid = async () =>
      Number(
        (
          await pool.query(
            "SELECT coalesce(sum(amount),0) paid FROM payments WHERE contract_id=$1 AND voided_at IS NULL",
            [correctionContract],
          )
        ).rows[0].paid,
      );
    assert.equal(await activePaid(), 300000);
    const sourceEntry = (
      await pool.query("SELECT id FROM cash_entries WHERE payment_id=$1", [
        correctionFirst,
      ])
    ).rows[0].id;
    assert.equal(
      Number(
        (
          await pool.query(
            "SELECT sum(amount_minor) n FROM cash_entries WHERE id=$1 OR reversal_of=$1",
            [sourceEntry],
          )
        ).rows[0].n,
      ),
      0,
    );
    const correctionDetail =
      "/erp/contracts/" + correctionContract + "?branch=" + b1;
    assert.ok((await get(correctionDetail)).includes("Bekor qilingan"));
    assert.ok(
      !(await get(correctionDetail, viewerCookie)).includes(
        "To‘lovni bekor qilish",
      ),
    );
    const correctedArrears = await get(
      base + "&tab=arrears&status=all&q=SYNTHETIC%20CORRECTION",
    );
    assert.ok(correctedArrears.includes("SYNTHETIC CORRECTION"));
    const correctionExport = await fetch(origin + "/api/export?branch=" + b1, {
      headers: { cookie },
    });
    assert.equal(correctionExport.status, 200);
    const correctionBytes = Buffer.from(await correctionExport.arrayBuffer());
    assert.ok(correctionBytes.includes(Buffer.from("Sun’iy xato summa")));
    const reportRows =
      correctionBytes.toString().match(/<row r="\d+">[\s\S]*?<\/row>/g) ?? [];
    const correctionRows = reportRows.filter(
      (row) =>
        row.includes(correctionContract) &&
        row.includes("SYNTHETIC CORRECTION"),
    );
    assert.ok(
      correctionRows.some((row) =>
        /<c r="H\d+" s="2" t="n"><v>700000<\/v>/.test(row),
      ),
      "Nasiya export uses active payments only",
    );
    assert.ok(
      correctionRows.some((row) =>
        /<c r="F\d+" s="2" t="n"><v>700000<\/v>/.test(row),
      ),
      "arrears export recomputes overdue after cancellation",
    );
    assert.ok(
      correctionBytes.includes(
        Buffer.from("Bekor qilingan — hisobga kirmaydi"),
      ),
    );
    const simultaneous = await Promise.all([
      voidPay({ paymentId: correctionSecond }),
      payCorrection(700000, "cash"),
    ]);
    assert.deepEqual(
      simultaneous.map((r) => r.status),
      [200, 200],
    );
    assert.equal(
      await activePaid(),
      700000,
      "contract row lock serializes repayment and cancellation",
    );
    assert.equal((await payCorrection(300001)).status, 400);
    const settled = await payCorrection(300000);
    assert.equal(settled.status, 200);
    assert.equal(await activePaid(), 1000000);
    const settledPayment = (await settled.json()).id;
    const doubleVoid = await Promise.all([
      voidPay({ paymentId: settledPayment }),
      voidPay({ paymentId: settledPayment }),
    ]);
    assert.deepEqual(doubleVoid.map((r) => r.status).sort(), [200, 400]);
    assert.equal(await activePaid(), 700000);
    const settings = async (
      data: Record<string, unknown>,
      auth = cookie,
      source = origin,
    ) =>
      fetch(origin + "/api/settings", {
        method: "POST",
        headers: {
          cookie: auth,
          origin: source,
          "content-type": "application/json",
        },
        body: JSON.stringify({ branchId: b1, ...data }),
      });
    assert.ok(
      (await get("/erp/settings?branch=" + b1)).includes("Xodimlar ruxsatlari"),
    );
    for (const auth of [viewerCookie, outsiderCookie]) {
      const page = await fetch(origin + "/erp/settings?branch=" + b1, {
        headers: { cookie: auth },
      });
      const text = await page.text();
      assert.ok(text.includes("Sozlamalarga ruxsat yo‘q"));
      assert.ok(!text.includes(admin + "@example.invalid"));
      assert.equal(
        (await settings({ action: "rename", name: "forbidden" }, auth)).status,
        403,
      );
    }
    assert.equal(
      (await settings({ action: "rename", name: "forbidden" }, "")).status,
      403,
    );
    assert.equal(
      (
        await settings(
          { action: "rename", name: "forbidden" },
          cookie,
          "https://evil.invalid",
        )
      ).status,
      400,
    );
    assert.equal(
      (await settings({ action: "rename", branchId: b3, name: "forbidden" }))
        .status,
      403,
    );
    assert.equal(
      (await settings({ action: "rename", name: "Second" })).status,
      400,
    );
    assert.equal(
      (await settings({ action: "rename", name: "Infinity test renamed" }))
        .status,
      200,
    );
    assert.equal(
      (await pool.query("SELECT name FROM branches WHERE id=$1", [b1])).rows[0]
        .name,
      "Infinity test renamed",
    );
    assert.equal(
      (await settings({ action: "role", userId: admin, role: "viewer" }))
        .status,
      400,
      "self demotion must not lock out the administrator",
    );
    assert.equal(
      (await settings({ action: "grant", userId: outsider, role: "admin" }))
        .status,
      403,
      "cannot attach unrelated tenant accounts",
    );
    assert.equal(
      (
        await settings({
          action: "create",
          email: outsider + "@example.invalid",
          password,
          role: "cashier",
        })
      ).status,
      400,
    );
    await login(outsider + "@example.invalid");
    const staffEmail = randomUUID() + "@example.invalid";
    assert.equal(
      (
        await settings({
          action: "create",
          email: staffEmail,
          password: "short",
          role: "cashier",
        })
      ).status,
      400,
    );
    const created = await settings({
      action: "create",
      email: staffEmail,
      password,
      role: "cashier",
    });
    assert.equal(created.status, 200);
    const staff = (await created.json()).id;
    extraUsers.push(staff);
    const staffCookie = await login(staffEmail);
    const staffSellItemResponse = await post(
      "inventory",
      { ...input, imei: "999999999999999" },
      b1,
      staffCookie,
    );
    assert.equal(staffSellItemResponse.status, 200);
    const staffSellItem = (await staffSellItemResponse.json()).id;
    assert.equal(
      (
        await sell(
          {
            inventoryId: staffSellItem,
            method: "transfer",
            requestKey: randomUUID(),
          },
          staffCookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await voidPay({ paymentId: correctionSecond }, staffCookie)).status,
      403,
      "cashier cannot cancel payments",
    );
    assert.equal(
      (
        await cash(
          { ...opening, requestKey: randomUUID(), wallet: "bank_uzs" },
          staffCookie,
        )
      ).status,
      403,
    );
    assert.equal((await cash({}, staffCookie)).status, 200);
    assert.equal(
      (
        await settings(
          { action: "rename", name: "cashier forbidden" },
          staffCookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await post(
          "inventory",
          { ...input, imei: "333333333333333" },
          b1,
          staffCookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await post(
          "inventory",
          { ...input, imei: "444444444444444" },
          b2,
          staffCookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await settings({
          action: "grant",
          branchId: b2,
          userId: staff,
          role: "viewer",
        })
      ).status,
      200,
    );
    assert.equal(
      (await settings({ action: "role", userId: staff, role: "viewer" }))
        .status,
      200,
    );
    assert.equal(
      (
        await post(
          "inventory",
          { ...input, imei: "555555555555555" },
          b1,
          staffCookie,
        )
      ).status,
      400,
      "existing session must obey downgraded role immediately",
    );
    assert.equal(
      (await settings({ action: "role", userId: staff, role: "disabled" }))
        .status,
      200,
    );
    const blocked = await get(base + "&tab=inventory", staffCookie);
    assert.equal(
      (await sell({ requestKey: randomUUID() }, staffCookie)).status,
      403,
    );
    assert.equal((await cash({}, staffCookie)).status, 403);
    assert.equal(
      (
        await fetch(origin + "/api/export?branch=" + b1, {
          headers: { cookie: staffCookie },
        })
      ).status,
      403,
      "disabled branch membership cannot export",
    );
    assert.ok(blocked.includes("Filialga ruxsat yo‘q"));
    assert.ok(!blocked.includes(input.imei));
    assert.equal(
      (
        await fetch(origin + "/erp?branch=" + b2 + "&tab=inventory", {
          headers: { cookie: staffCookie },
        })
      ).status,
      200,
      "other branch access survives deactivation",
    );
    assert.ok((await get("/erp/settings?branch=" + b1)).includes(staffEmail));
    assert.equal(
      (await settings({ action: "role", userId: staff, role: "cashier" }))
        .status,
      200,
    );
    assert.equal(
      (
        await post(
          "inventory",
          { ...input, imei: "555555555555555" },
          b1,
          staffCookie,
        )
      ).status,
      200,
      "deactivated staff can be restored without changing password",
    );
    assert.ok(
      Number(
        (
          await pool.query(
            "SELECT count(*) n FROM audit_events WHERE tenant_id=$1 AND action LIKE 'membership.%'",
            [tenant],
          )
        ).rows[0].n,
      ) >= 4,
    );
    assert.equal(
      (await settings({ action: "role", userId: staff, role: "admin" })).status,
      200,
    );
    const adminRace = await Promise.all([
      settings({ action: "role", userId: staff, role: "viewer" }),
      settings({ action: "role", userId: admin, role: "viewer" }, staffCookie),
    ]);
    assert.deepEqual(
      adminRace.map((r) => r.status).sort(),
      [200, 403],
      "serialized reauthorization must stop mutually demoting admins",
    );
    assert.equal(
      Number(
        (
          await pool.query(
            "SELECT count(*) n FROM memberships WHERE tenant_id=$1 AND branch_id=$2 AND role='admin'",
            [tenant, b1],
          )
        ).rows[0].n,
      ),
      1,
    );
    await pool.query(
      "INSERT INTO inventory(id,tenant_id,branch_id,imei,model,cost) SELECT gen_random_uuid(),$1,$2,lpad(g::text,15,'0'),'SYNTHETIC EXPORT LIMIT',0 FROM generate_series(1,10001) g",
      [tenant, b2],
    );
    const oversizedExport = await fetch(origin + "/api/export?branch=" + b2, {
      headers: { cookie },
    });
    assert.equal(
      oversizedExport.status,
      422,
      "oversized report rejected instead of silently truncating",
    );
    assert.ok((await oversizedExport.text()).includes("10 000"));
    await pool.query(
      "WITH ops AS (INSERT INTO cash_operations(id,tenant_id,branch_id,input_hash) SELECT gen_random_uuid(),$1,$2,'synthetic limit' FROM generate_series(1,10001) RETURNING id) INSERT INTO cash_entries(id,tenant_id,branch_id,wallet,entry_date,amount_minor,category,user_id,operation_id) SELECT gen_random_uuid(),$1,$2,'cash_uzs',CURRENT_DATE,1,'SYNTHETIC LIMIT',$3,id FROM ops",
      [tenant, b1, admin],
    );
    assert.equal(
      (
        await fetch(origin + "/api/export?branch=" + b1, {
          headers: { cookie },
        })
      ).status,
      422,
      "cash ledger limit rejects entire report instead of truncating",
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

test(
  "HTTP: ustama hisobi, mijoz kartochkasi va chop etiladigan shartnoma",
  { skip: !connection },
  async () => {
    const auth = await login(admin + "@example.invalid");
    const device = async (imei: string) =>
      (
        await (
          await post(
            "inventory",
            { imei, model: "SYNTHETIC nasiya phone", cost: 9_000_000 },
            b1,
            auth,
          )
        ).json()
      ).id as string;
    const pnfl = "5" + String(Date.now()).slice(-13);
    const terms = {
      inventoryId: await device("333333333333333"),
      customerName: "SYNTHETIC Mijoz Testovich",
      pnfl,
      passport: "AD1234567",
      passportIssuer: "SYNTHETIC IIB",
      passportDate: "2021-03-12",
      birthDate: "1994-03-04",
      phone1: "+998 90 000 00 00",
      phone2: "",
      address: "SYNTHETIC manzil",
      icloudAccount: "",
      icloudPhone: "",
      priceUzs: 17_028_900,
      downPayment: 3_570_000,
      months: 6,
      monthlyRateBp: 500,
      startDate: "2026-09-25",
    };
    const created = await post("contracts", terms, b1, auth);
    assert.equal(created.status, 200);
    const contract = (await created.json()).id;
    const row = (
      await pool.query("SELECT * FROM contracts WHERE id=$1", [contract])
    ).rows[0];
    // 13 458 900 * 5% * 6 oy = 4 037 670
    assert.equal(Number(row.principal), 13_458_900);
    assert.equal(Number(row.markup), 4_037_670);
    assert.equal(Number(row.total), 3_570_000 + 13_458_900 + 4_037_670);
    assert.equal(Number(row.monthly_rate_bp), 500);
    assert.ok(Number(row.number) >= 1, "shartnomaga raqam berildi");
    assert.ok(row.customer_id, "mijoz kartochkasi ulandi");
    assert.equal(
      Number(
        (
          await pool.query(
            "SELECT sum(amount) jami FROM installments WHERE contract_id=$1",
            [contract],
          )
        ).rows[0].jami,
      ),
      13_458_900 + 4_037_670,
      "jadval asosiy qarz va ustamani to‘liq qoplaydi",
    );
    const customer = (
      await pool.query("SELECT * FROM customers WHERE id=$1", [row.customer_id])
    ).rows[0];
    assert.equal(customer.full_name, "SYNTHETIC Mijoz Testovich");
    assert.equal(customer.passport_issuer, "SYNTHETIC IIB");
    assert.equal(customer.phone2, "", "bo‘sh maydon xato bermaydi");

    // Hisob kelishmasa saqlanmaydi, jim tuzatilmaydi.
    assert.equal(
      (
        await post(
          "contracts",
          {
            ...terms,
            inventoryId: await device("344444444444444"),
            total: 1_000_000,
          },
          b1,
          auth,
        )
      ).status,
      400,
    );
    // PNFL bir xil bo'lsa ikkinchi shartnoma o'sha mijozga yoziladi.
    const second = await post(
      "contracts",
      {
        ...terms,
        inventoryId: await device("355555555555555"),
        phone2: "+998 91 111 11 11",
        priceUzs: 9_000_000,
        downPayment: 1_000_000,
        months: 3,
      },
      b1,
      auth,
    );
    assert.equal(second.status, 200);
    const secondRow = (
      await pool.query("SELECT * FROM contracts WHERE id=$1", [
        (await second.json()).id,
      ])
    ).rows[0];
    assert.equal(secondRow.customer_id, row.customer_id);
    assert.equal(Number(secondRow.number), Number(row.number) + 1);
    assert.equal(
      (
        await pool.query("SELECT phone2 FROM customers WHERE id=$1", [
          row.customer_id,
        ])
      ).rows[0].phone2,
      "+998 91 111 11 11",
      "yangi ma'lumot qo‘shiladi",
    );

    const print = (id: string, auth?: string) =>
      fetch(origin + "/erp/contracts/" + id + "/shartnoma?branch=" + b1, {
        headers: auth ? { cookie: auth } : {},
      });
    const printed = await print(contract, auth);
    assert.equal(printed.status, 200);
    const html = await printed.text();
    for (const kerak of [
      row.number + " - сонли",
      "SYNTHETIC Mijoz Testovich",
      pnfl,
      "333333333333333",
      "12.03.2021",
      "1-илова",
    ])
      assert.ok(html.includes(kerak), "shartnomada yo‘q: " + kerak);
    assert.doesNotMatch(html, /\{\{|undefined|NaN/);
    assert.equal(
      (await print(contract, await login(viewer + "@example.invalid"))).status,
      200,
      "viewer shartnomani ko‘ra oladi",
    );
    assert.equal(
      (await print(contract, await login(outsider + "@example.invalid")))
        .status,
      403,
    );
    assert.equal((await print(contract)).status, 403);
    assert.equal((await print(randomUUID(), auth)).status, 404);
  },
);

test(
  "HTTP: PAY-06 to'lovni rol bo'yicha tasdiqlash",
  { skip: !connection },
  async () => {
    const auth = await login(admin + "@example.invalid");
    const kassirAuth = await login(kassir + "@example.invalid");
    const koruvchi = await login(viewer + "@example.invalid");
    const begona = await login(outsider + "@example.invalid");
    const item = (
      await (
        await post(
          "inventory",
          { imei: "366666666666666", model: "SYNTHETIC PAY-06", cost: 5_000_000 },
          b1,
          auth,
        )
      ).json()
    ).id;
    const contract = (
      await (
        await post(
          "contracts",
          {
            inventoryId: item,
            customerName: "SYNTHETIC PAY-06 mijoz",
            priceUzs: 9_000_000,
            downPayment: 1_000_000,
            months: 4,
            monthlyRateBp: 500,
            startDate: "2026-09-25",
          },
          b1,
          auth,
        )
      ).json()
    ).id;
    // 8 000 000 asosiy qarz + 1 600 000 ustama
    const qarz = async () =>
      Number(
        (
          await pool.query(
            `SELECT c.total-c.down_payment-COALESCE((SELECT sum(p.amount) FROM payments p
 WHERE p.contract_id=c.id AND p.status='approved' AND p.voided_at IS NULL),0) balance
 FROM contracts c WHERE c.id=$1`,
            [contract],
          )
        ).rows[0].balance,
      );
    const hamyon = async (wallet: string) =>
      Number(
        (
          await pool.query(
            "SELECT COALESCE(sum(amount_minor),0) n FROM cash_entries WHERE branch_id=$1 AND wallet=$2",
            [b1, wallet],
          )
        ).rows[0].n,
      );
    assert.equal(await qarz(), 9_600_000);

    // Kassir naqd qabul qiladi: o'zi javobgar, darhol hisobga kiradi (AT-25).
    const naqdBefore = await hamyon("cash_uzs");
    const naqd = await post(
      "payments",
      {
        contractId: contract,
        amount: 600_000,
        method: "cash",
        requestKey: randomUUID(),
      },
      b1,
      kassirAuth,
    );
    assert.equal(naqd.status, 200);
    assert.equal(await qarz(), 9_000_000);
    assert.equal(await hamyon("cash_uzs"), naqdBefore + 600_000);

    // Karta tushumi: kassir kiritadi, lekin tasdiqlay olmaydi (AT-23).
    const kartaBefore = await hamyon("card_uzs");
    const karta = (
      await (
        await post(
          "payments",
          {
            contractId: contract,
            amount: 1_000_000,
            method: "card",
            evidence: "SYNTHETIC P2P 12345",
            requestKey: randomUUID(),
          },
          b1,
          kassirAuth,
        )
      ).json()
    ).id;
    assert.equal(
      (await pool.query("SELECT status FROM payments WHERE id=$1", [karta]))
        .rows[0].status,
      "pending",
    );
    assert.equal(await qarz(), 9_000_000, "tasdiqsiz summa qarzni kamaytirmaydi");
    assert.equal(await hamyon("card_uzs"), kartaBefore, "hamyonga ham kirmaydi");

    const decide = (body: Record<string, unknown>, cookie = auth) =>
      fetch(origin + "/api/payments/approve", {
        method: "POST",
        headers: { cookie, origin, "content-type": "application/json" },
        body: JSON.stringify({ branchId: b1, ...body }),
      });
    // AT-24: kassir P2Pni tasdiqlashga urinadi - server rad etadi.
    assert.equal(
      (await decide({ paymentId: karta, decision: "approve" }, kassirAuth))
        .status,
      403,
    );
    assert.equal(await qarz(), 9_000_000);
    // Boshqa filial va tashqi foydalanuvchi ham tegmaydi.
    assert.equal(
      (await decide({ paymentId: karta, decision: "approve" }, begona)).status,
      403,
    );

    // Rahbar tasdiqlaydi: qarz kamayadi va karta hamyoniga kirim tushadi.
    assert.equal((await decide({ paymentId: karta, decision: "approve" })).status, 200);
    assert.equal(await qarz(), 8_000_000);
    assert.equal(await hamyon("card_uzs"), kartaBefore + 1_000_000);
    const tasdiq = (
      await pool.query(
        "SELECT status,decided_by,decided_at,created_by FROM payments WHERE id=$1",
        [karta],
      )
    ).rows[0];
    assert.equal(tasdiq.status, "approved");
    assert.equal(tasdiq.decided_by, admin, "tasdiqlovchi saqlanadi");
    assert.equal(tasdiq.created_by, kassir, "kirituvchi saqlanadi");
    assert.ok(tasdiq.decided_at);
    // Takroriy tasdiq ikkinchi marta pul yaratmaydi.
    assert.equal((await decide({ paymentId: karta, decision: "approve" })).status, 200);
    assert.equal(await hamyon("card_uzs"), kartaBefore + 1_000_000);
    assert.equal(
      (await decide({ paymentId: karta, decision: "reject", reason: "boshqa qaror" }))
        .status,
      400,
      "tasdiqlangandan keyin rad etib bo'lmaydi",
    );

    // AT-27: rahbar rad etadi - sabab majburiy, pul va qarz o'zgarmaydi.
    const rad = (
      await (
        await post(
          "payments",
          {
            contractId: contract,
            amount: 500_000,
            method: "transfer",
            requestKey: randomUUID(),
          },
          b1,
          kassirAuth,
        )
      ).json()
    ).id;
    const bankBefore = await hamyon("bank_uzs");
    assert.equal((await decide({ paymentId: rad, decision: "reject" })).status, 400);
    assert.equal(
      (await decide({ paymentId: rad, decision: "reject", reason: "qisq" })).status,
      400,
    );
    assert.equal(
      (
        await decide({
          paymentId: rad,
          decision: "reject",
          reason: "Bankda tushum ko'rinmadi",
        })
      ).status,
      200,
    );
    assert.equal(await qarz(), 8_000_000);
    assert.equal(await hamyon("bank_uzs"), bankBefore);
    assert.equal(
      (await pool.query("SELECT decided_reason FROM payments WHERE id=$1", [rad]))
        .rows[0].decided_reason,
      "Bankda tushum ko'rinmadi",
    );

    // Tasdiq kutayotgan tushum bekor qilinmaydi - rad etiladi.
    const kutayotgan = (
      await (
        await post(
          "payments",
          {
            contractId: contract,
            amount: 300_000,
            method: "card",
            requestKey: randomUUID(),
          },
          b1,
          kassirAuth,
        )
      ).json()
    ).id;
    const bekor = await fetch(origin + "/api/payments/void", {
      method: "POST",
      headers: { cookie: auth, origin, "content-type": "application/json" },
      body: JSON.stringify({
        branchId: b1,
        paymentId: kutayotgan,
        requestKey: randomUUID(),
        reason: "SYNTHETIC void attempt",
      }),
    });
    assert.equal(bekor.status, 400);

    // Tasdiq ekranida faqat o'z usuli ko'rinadi.
    const ekran = async (cookie: string) =>
      await (
        await fetch(origin + "/erp?branch=" + b1 + "&tab=approvals", {
          headers: { cookie },
        })
      ).text();
    const rahbarEkran = await ekran(auth);
    assert.ok(rahbarEkran.includes("SYNTHETIC PAY-06 mijoz"));
    assert.ok(
      (await ekran(koruvchi)).includes("tasdiqlash huquqi yo‘q"),
      "ko'ruvchiga tasdiqlash ro'yxati ko'rsatilmaydi",
    );
  },
);

test(
  "HTTP: PAY-04 qarzdan ortiq tushum mijoz avansi bo'ladi",
  { skip: !connection },
  async () => {
    const auth = await login(admin + "@example.invalid");
    const device = async (imei: string) =>
      (
        await (
          await post(
            "inventory",
            { imei, model: "SYNTHETIC AVANS", cost: 1_000_000 },
            b1,
            auth,
          )
        ).json()
      ).id as string;
    const shartnoma = async (imei: string) =>
      (
        await (
          await post(
            "contracts",
            {
              inventoryId: await device(imei),
              customerLabel: "SYNTHETIC AVANS",
              total: 1_000_000,
              downPayment: 200_000,
              months: 2,
              startDate: "2026-09-25",
            },
            b1,
            auth,
          )
        ).json()
      ).id as string;
    const holat = async (id: string) =>
      (
        await pool.query(
          `SELECT c.total-c.down_payment-COALESCE((SELECT sum(p.amount) FROM payments p
 WHERE p.contract_id=c.id AND p.status='approved' AND p.voided_at IS NULL),0) balance,
 COALESCE((SELECT sum(a.amount) FROM customer_advances a
   WHERE a.contract_id=c.id AND a.voided_at IS NULL),0) avans
 FROM contracts c WHERE c.id=$1`,
          [id],
        )
      ).rows[0];
    const pay = (contractId: string, amount: number, extra = {}) =>
      post(
        "payments",
        { contractId, amount, method: "cash", requestKey: randomUUID(), ...extra },
        b1,
        auth,
      );

    // AT-11: qarz 800 000, mijoz 1 000 000 beradi.
    const bitta = await shartnoma("411111111111111");
    assert.equal((await pay(bitta, 1_000_000)).status, 200);
    let n = await holat(bitta);
    assert.equal(Number(n.balance), 0, "qarz manfiy bo'lmaydi");
    assert.equal(Number(n.avans), 200_000, "ortig'i avansga tushadi");
    // Kassaga haqiqatda olingan pul tushadi: qarzga 800 000 ketgan bo'lsa
    // ham to'lov yozuvi 1 000 000.
    assert.equal(
      Number(
        (
          await pool.query(
            `SELECT COALESCE(sum(e.amount_minor),0) n FROM cash_entries e
 WHERE e.payment_id IN (SELECT id FROM payments WHERE contract_id=$1)`,
            [bitta],
          )
        ).rows[0].n,
      ),
      1_000_000,
    );
    // Qarzi yopilgan shartnomaga yangi to'lov kiritilmaydi.
    assert.equal((await pay(bitta, 1000)).status, 400);

    // Parallel ikki to'lov qarzdan oshsa: ikkisi ham qabul qilinadi,
    // qarz aniq nolga tushadi, ortig'i avansda.
    const ikki = await shartnoma("422222222222222");
    const parallel = await Promise.all([pay(ikki, 500_000), pay(ikki, 500_000)]);
    assert.deepEqual(parallel.map((r) => r.status).sort(), [200, 200]);
    n = await holat(ikki);
    assert.equal(Number(n.balance), 0);
    assert.equal(Number(n.avans), 200_000);

    // Tasdiq kutayotgan to'lovda taqsimot tasdiq paytida hisoblanadi:
    // kutish davomida qarz naqd to'lov bilan yopilsa, hamma pul avansga
    // tushadi va qarz manfiy bo'lmaydi.
    const kassirAuth = await login(kassir + "@example.invalid");
    const uch = await shartnoma("433333333333333");
    const kutayotgan = (
      await (
        await post(
          "payments",
          {
            contractId: uch,
            amount: 800_000,
            method: "card",
            requestKey: randomUUID(),
          },
          b1,
          kassirAuth,
        )
      ).json()
    ).id;
    assert.equal(Number((await holat(uch)).balance), 800_000);
    assert.equal((await pay(uch, 800_000)).status, 200);
    assert.equal(Number((await holat(uch)).balance), 0);
    const qaror = await fetch(origin + "/api/payments/approve", {
      method: "POST",
      headers: { cookie: auth, origin, "content-type": "application/json" },
      body: JSON.stringify({
        branchId: b1,
        paymentId: kutayotgan,
        decision: "approve",
      }),
    });
    assert.equal(qaror.status, 200);
    n = await holat(uch);
    assert.equal(Number(n.balance), 0, "qarz manfiy bo'lmaydi");
    assert.equal(Number(n.avans), 800_000, "hammasi avansga tushadi");
    assert.equal(
      Number(
        (
          await pool.query(
            "SELECT amount,advance_amount FROM payments WHERE id=$1",
            [kutayotgan],
          )
        ).rows[0].amount,
      ),
      0,
    );
    // Shunday to'lovni bekor qilganda avans ham amaldan chiqadi.
    assert.equal(
      (
        await fetch(origin + "/api/payments/void", {
          method: "POST",
          headers: { cookie: auth, origin, "content-type": "application/json" },
          body: JSON.stringify({
            branchId: b1,
            paymentId: kutayotgan,
            requestKey: randomUUID(),
            reason: "SYNTHETIC avans bekor",
          }),
        })
      ).status,
      200,
    );
    n = await holat(uch);
    assert.equal(Number(n.avans), 0, "bekor qilinganda avans ham chiqadi");
    assert.equal(Number(n.balance), 0);
  },
);

test(
  "HTTP: PAY-02 dollardagi to'lov kurs bilan so'mga aylanadi",
  { skip: !connection },
  async () => {
    const auth = await login(admin + "@example.invalid");
    const item = (
      await (
        await post(
          "inventory",
          { imei: "455555555555555", model: "SYNTHETIC USD", cost: 5_000_000 },
          b1,
          auth,
        )
      ).json()
    ).id;
    const contract = (
      await (
        await post(
          "contracts",
          {
            inventoryId: item,
            customerLabel: "SYNTHETIC USD mijoz",
            total: 20_000_000,
            downPayment: 0,
            months: 4,
            startDate: "2026-09-25",
          },
          b1,
          auth,
        )
      ).json()
    ).id;
    const pay = (body: Record<string, unknown>) =>
      post(
        "payments",
        { contractId: contract, requestKey: randomUUID(), ...body },
        b1,
        auth,
      );
    // AT-10: kursi yo'q USD to'lov saqlanmaydi.
    assert.equal(
      (await pay({ method: "cash_usd", usdAmount: "100.50" })).status,
      400,
    );
    assert.equal((await pay({ method: "cash_usd", rate: 12_800 })).status, 400);

    const usdBefore = Number(
      (
        await pool.query(
          "SELECT COALESCE(sum(amount_minor),0) n FROM cash_entries WHERE branch_id=$1 AND wallet='cash_usd'",
          [b1],
        )
      ).rows[0].n,
    );
    const tolov = await pay({
      method: "cash_usd",
      usdAmount: "100.50",
      rate: 12_800,
    });
    assert.equal(tolov.status, 200);
    const id = (await tolov.json()).id;
    const row = (await pool.query("SELECT * FROM payments WHERE id=$1", [id]))
      .rows[0];
    // 100.50 USD * 12 800 = 1 286 400 so'm
    assert.equal(Number(row.amount), 1_286_400);
    assert.equal(Number(row.usd_cents), 10_050);
    assert.equal(Number(row.rate), 12_800);
    assert.equal(row.status, "approved");
    // Naqd USD hamyoniga dollar tushadi, so'm emas.
    assert.equal(
      Number(
        (
          await pool.query(
            "SELECT COALESCE(sum(amount_minor),0) n FROM cash_entries WHERE branch_id=$1 AND wallet='cash_usd'",
            [b1],
          )
        ).rows[0].n,
      ),
      usdBefore + 10_050,
    );
    // Qarz so'mda kamayadi.
    assert.equal(
      Number(
        (
          await pool.query(
            `SELECT c.total-c.down_payment-COALESCE((SELECT sum(p.amount) FROM payments p
 WHERE p.contract_id=c.id AND p.status='approved' AND p.voided_at IS NULL),0) balance
 FROM contracts c WHERE c.id=$1`,
            [contract],
          )
        ).rows[0].balance,
      ),
      20_000_000 - 1_286_400,
    );
    // Bekor qilishda dollar hamyondan chiqadi.
    assert.equal(
      (
        await fetch(origin + "/api/payments/void", {
          method: "POST",
          headers: { cookie: auth, origin, "content-type": "application/json" },
          body: JSON.stringify({
            branchId: b1,
            paymentId: id,
            requestKey: randomUUID(),
            reason: "SYNTHETIC usd bekor",
          }),
        })
      ).status,
      200,
    );
    assert.equal(
      Number(
        (
          await pool.query(
            "SELECT COALESCE(sum(amount_minor),0) n FROM cash_entries WHERE branch_id=$1 AND wallet='cash_usd'",
            [b1],
          )
        ).rows[0].n,
      ),
      usdBefore,
    );
  },
);

test(
  "HTTP: PAY-07/08/09 muddatidan oldin yopish",
  { skip: !connection },
  async () => {
    const auth = await login(admin + "@example.invalid");
    const kassirAuth = await login(kassir + "@example.invalid");
    // Shartnoma sanasi: bugundan 70 kun oldin - aynan 2 to'liq oy o'tadi.
    const boshlanish = (
      await pool.query(
        "SELECT ((now() AT TIME ZONE 'Asia/Tashkent')::date - 70)::text d",
      )
    ).rows[0].d;
    const item = (
      await (
        await post(
          "inventory",
          { imei: "466666666666666", model: "SYNTHETIC YOPISH", cost: 9_000_000 },
          b1,
          auth,
        )
      ).json()
    ).id;
    // TZ 11.1: D = 8 400 000, M = 2 520 000, oylik 1 820 000.
    const contract = (
      await (
        await post(
          "contracts",
          {
            inventoryId: item,
            customerName: "SYNTHETIC YOPISH mijoz",
            priceUzs: 12_000_000,
            downPayment: 3_600_000,
            months: 6,
            monthlyRateBp: 500,
            startDate: boshlanish,
          },
          b1,
          auth,
        )
      ).json()
    ).id;
    const qarz = async () =>
      Number(
        (
          await pool.query(
            `SELECT c.total-c.down_payment
 -COALESCE((SELECT sum(p.amount) FROM payments p WHERE p.contract_id=c.id AND p.status='approved' AND p.voided_at IS NULL),0)
 -COALESCE((SELECT sum(x.markup_cancelled) FROM contract_closures x WHERE x.contract_id=c.id AND x.status='completed'),0) balance
 FROM contracts c WHERE c.id=$1`,
            [contract],
          )
        ).rows[0].balance,
      );
    const pay = (amount: number, method = "cash", cookie = auth) =>
      post(
        "payments",
        { contractId: contract, amount, method, requestKey: randomUUID() },
        b1,
        cookie,
      );
    const yopish = (action: string, cookie = auth) =>
      fetch(origin + "/api/closures", {
        method: "POST",
        headers: { cookie, origin, "content-type": "application/json" },
        body: JSON.stringify({ branchId: b1, contractId: contract, action }),
      });

    assert.equal(await qarz(), 10_920_000);
    for (let i = 0; i < 2; i++) assert.equal((await pay(1_820_000)).status, 200);
    assert.equal(await qarz(), 7_280_000);

    // AT-28: hisob - 1 680 000 ustama bekor, yopish summasi 5 600 000.
    const hisob = await yopish("quote");
    assert.equal(hisob.status, 200);
    const h = await hisob.json();
    assert.equal(h.kind, "early");
    assert.equal(h.periods, 2);
    assert.equal(h.markupCancelled, 1_680_000);
    assert.equal(h.closeAmount, 5_600_000);
    assert.equal(h.markupKept, 840_000);
    // Hisobning o'zi qarzni o'zgartirmaydi.
    assert.equal(await qarz(), 7_280_000);
    // To'lamasdan yakunlab bo'lmaydi.
    const erta = await yopish("complete");
    assert.equal(erta.status, 400);
    assert.ok((await erta.json()).error.includes("5 600 000"));

    assert.equal((await pay(5_600_000)).status, 200);
    assert.equal(await qarz(), 1_680_000);

    // AT-29: tasdiq kutayotgan tushum bo'lsa yopilmaydi.
    const kutayotgan = (
      await (await pay(100_000, "card", kassirAuth)).json()
    ).id;
    const bloklangan = await yopish("complete");
    assert.equal(bloklangan.status, 400);
    assert.ok((await bloklangan.json()).error.includes("Tasdiq kutayotgan"));
    assert.equal(
      (
        await fetch(origin + "/api/payments/approve", {
          method: "POST",
          headers: { cookie: auth, origin, "content-type": "application/json" },
          body: JSON.stringify({
            branchId: b1,
            paymentId: kutayotgan,
            decision: "reject",
            reason: "Yopish hisobidan ortiqcha",
          }),
        })
      ).status,
      200,
    );

    // AT-30: barcha tasdiqlar bajarilgan - shartnoma yopiladi.
    assert.equal((await yopish("complete")).status, 200);
    assert.equal(await qarz(), 0, "qarz aynan nolga tushadi");
    const yozuv = (
      await pool.query(
        "SELECT * FROM contract_closures WHERE contract_id=$1 AND status='completed'",
        [contract],
      )
    ).rows[0];
    assert.equal(yozuv.kind, "early");
    assert.equal(Number(yozuv.markup_cancelled), 1_680_000);
    assert.equal(Number(yozuv.close_amount), 5_600_000);
    assert.equal(yozuv.decided_by, admin);
    // Ikkinchi marta yopib bo'lmaydi.
    assert.equal((await yopish("quote")).status, 400);
    // Yopish tuzatishi kassaga kirim yaratmaydi.
    assert.equal(
      Number(
        (
          await pool.query(
            "SELECT count(*) n FROM cash_entries WHERE branch_id=$1 AND category='Nasiya to‘lovi' AND payment_id IN (SELECT id FROM payments WHERE contract_id=$2)",
            [b1, contract],
          )
        ).rows[0].n,
      ),
      3,
      "faqat uchta haqiqiy to'lov kassada",
    );

    // PAY-09 hisoboti
    const hisobot = await (
      await fetch(origin + "/erp?branch=" + b1 + "&tab=closures", {
        headers: { cookie: auth },
      })
    ).text();
    assert.ok(hisobot.includes("SYNTHETIC YOPISH mijoz"));
    assert.ok(hisobot.includes("1 680 000"));

    // AT-32: yopish to'lovini qaytarish yopishni ham teskari qiladi.
    const oxirgi = (
      await pool.query(
        "SELECT id FROM payments WHERE contract_id=$1 AND amount=5600000 AND voided_at IS NULL",
        [contract],
      )
    ).rows[0].id;
    assert.equal(
      (
        await fetch(origin + "/api/payments/void", {
          method: "POST",
          headers: { cookie: auth, origin, "content-type": "application/json" },
          body: JSON.stringify({
            branchId: b1,
            paymentId: oxirgi,
            requestKey: randomUUID(),
            reason: "SYNTHETIC yopishni qaytarish",
          }),
        })
      ).status,
      200,
    );
    assert.equal(await qarz(), 7_280_000, "qarz va ustama qaytadi");
    assert.equal(
      (
        await pool.query(
          "SELECT status FROM contract_closures WHERE id=$1",
          [yozuv.id],
        )
      ).rows[0].status,
      "reversed",
    );
    assert.ok(
      !(
        await (
          await fetch(origin + "/erp?branch=" + b1 + "&tab=closures", {
            headers: { cookie: auth },
          })
        ).text()
      ).includes("SYNTHETIC YOPISH mijoz"),
      "teskari qilingan yopish hisobotdan chiqadi",
    );
  },
);

test(
  "HTTP: qarzdorlar ro'yxatida eslatma matni va telefon",
  { skip: !connection },
  async () => {
    const auth = await login(admin + "@example.invalid");
    const item = (
      await (
        await post(
          "inventory",
          { imei: "477777777777777", model: "SYNTHETIC ESLATMA", cost: 1_000_000 },
          b1,
          auth,
        )
      ).json()
    ).id;
    assert.equal(
      (
        await post(
          "contracts",
          {
            inventoryId: item,
            customerName: "SYNTHETIC ESLATMA mijoz",
            phone1: "+998 90 777 77 77",
            priceUzs: 3_000_000,
            downPayment: 1_000_000,
            months: 3,
            monthlyRateBp: 500,
            startDate: "2026-01-15",
          },
          b1,
          auth,
        )
      ).status,
      200,
    );
    const html = await (
      await fetch(origin + "/erp?branch=" + b1 + "&tab=arrears&status=all", {
        headers: { cookie: auth },
      })
    ).text();
    assert.ok(html.includes("SYNTHETIC ESLATMA mijoz"));
    assert.ok(html.includes("+998 90 777 77 77"), "telefon ro‘yxatda ko‘rinadi");
    assert.ok(html.includes("Eslatma matni"));
    assert.ok(
      html.includes("Infinity do‘konidan eslatma"),
      "eslatma matni tayyorlanadi",
    );
  },
);

test(
  "HTTP: qora ro'yxat va mijoz limiti",
  { skip: !connection },
  async () => {
    const auth = await login(admin + "@example.invalid");
    const kassirAuth = await login(kassir + "@example.invalid");
    const device = async (imei: string) =>
      (
        await (
          await post(
            "inventory",
            { imei, model: "SYNTHETIC LIMIT", cost: 9_000_000 },
            b1,
            auth,
          )
        ).json()
      ).id as string;
    const pnfl = "6" + String(Date.now()).slice(-13);
    const mijoz = {
      customerName: "SYNTHETIC LIMIT mijoz",
      pnfl,
      downPayment: 0,
      months: 6,
      monthlyRateBp: 500,
      startDate: "2026-09-25",
    };
    const shartnoma = (priceUzs: number, extra: Record<string, unknown>) =>
      post("contracts", { ...mijoz, priceUzs, ...extra }, b1, auth);
    // Birinchi ikkita shartnoma chegara ichida: har biri 5 mln narx,
    // ustama bilan 6.5 mln qarz - jami 13 mln, chegara 25 mln.
    for (const imei of ["511111111111111", "522222222222222"])
      assert.equal(
        (await shartnoma(5_000_000, { inventoryId: await device(imei) }))
          .status,
        200,
      );
    const customerId = (
      await pool.query("SELECT id FROM customers WHERE pnfl=$1", [pnfl])
    ).rows[0].id;
    // Uchinchisi faol shartnoma chegarasidan oshadi.
    const uchinchi = await shartnoma(5_000_000, {
      inventoryId: await device("533333333333333"),
    });
    assert.equal(uchinchi.status, 400);
    // Rahbar sabab yozsa o'tadi va shartnomada kim ruxsat bergani qoladi.
    const ruxsat = await shartnoma(5_000_000, {
      inventoryId: await device("544444444444444"),
      limitOverrideReason: "Eski mijoz, hamma to‘lovni vaqtida qilgan",
    });
    assert.equal(ruxsat.status, 200);
    const uchinchiRow = (
      await pool.query("SELECT * FROM contracts WHERE id=$1", [
        (await ruxsat.json()).id,
      ])
    ).rows[0];
    assert.equal(uchinchiRow.limit_override_by, admin);
    assert.ok(uchinchiRow.limit_override_reason.includes("Eski mijoz"));

    // Qora ro'yxat: faqat rahbar qo'sha oladi.
    const block = (body: Record<string, unknown>, cookie = auth) =>
      fetch(origin + "/api/customers/block", {
        method: "POST",
        headers: { cookie, origin, "content-type": "application/json" },
        body: JSON.stringify({ branchId: b1, customerId, ...body }),
      });
    assert.equal(
      (await block({ action: "block", reason: "Sinov" })).status,
      400,
      "sabab kamida 5 belgi",
    );
    assert.equal(
      (
        await block(
          { action: "block", reason: "To‘lovni uzoq kechiktirdi" },
          await login(viewer + "@example.invalid"),
        )
      ).status,
      403,
    );
    assert.equal(
      (await block({ action: "block", reason: "To‘lovni uzoq kechiktirdi" }))
        .status,
      200,
    );
    // Qora ro'yxatdagi mijozga nasiya berilmaydi - rahbar ham bera olmaydi.
    const bloklangan = await shartnoma(5_000_000, {
      inventoryId: await device("555555555555555"),
      limitOverrideReason: "Baribir beramiz",
    });
    assert.equal(bloklangan.status, 400);
    // Ro'yxatdan chiqarilsa yana ishlaydi.
    assert.equal((await block({ action: "unblock" })).status, 200);
    assert.equal(
      (
        await shartnoma(5_000_000, {
          inventoryId: await device("566666666666666"),
          limitOverrideReason: "Ro‘yxatdan chiqarildi, davom etamiz",
        })
      ).status,
      200,
    );
    // Kassir limitdan oshira olmaydi.
    assert.equal(
      (
        await post(
          "contracts",
          {
            ...mijoz,
            inventoryId: await device("577777777777777"),
            priceUzs: 5_000_000,
            limitOverrideReason: "Kassir o‘zi ruxsat bermoqchi",
          },
          b1,
          kassirAuth,
        )
      ).status,
      400,
    );
    // Qarzdorlar ekranida kechikish guruhlari va zaxira ko'rinadi.
    const html = await (
      await fetch(origin + "/erp?branch=" + b1 + "&tab=arrears&status=all", {
        headers: { cookie: auth },
      })
    ).text();
    for (const k of ["1-30 kun", "31-60 kun", "61-90 kun", "91+ kun", "Zaxira (5%)"])
      assert.ok(html.includes(k), "topilmadi: " + k);
  },
);

test(
  "HTTP: qurilma nazorati va inkassatsiya ko'rsatkichi",
  { skip: !connection },
  async () => {
    const auth = await login(admin + "@example.invalid");
    const kassirAuth = await login(kassir + "@example.invalid");
    const item = (
      await (
        await post(
          "inventory",
          { imei: "588888888888888", model: "SYNTHETIC NAZORAT", cost: 5_000_000 },
          b1,
          auth,
        )
      ).json()
    ).id;
    const contract = (
      await (
        await post(
          "contracts",
          {
            inventoryId: item,
            customerName: "SYNTHETIC NAZORAT mijoz",
            priceUzs: 6_000_000,
            downPayment: 1_000_000,
            months: 3,
            monthlyRateBp: 500,
            startDate: "2026-09-25",
          },
          b1,
          auth,
        )
      ).json()
    ).id;
    const control = (body: Record<string, unknown>, cookie = auth) =>
      fetch(origin + "/api/devices/control", {
        method: "POST",
        headers: { cookie, origin, "content-type": "application/json" },
        body: JSON.stringify({ branchId: b1, contractId: contract, ...body }),
      });
    const holat = async () =>
      (
        await pool.query("SELECT control_state FROM contracts WHERE id=$1", [
          contract,
        ])
      ).rows[0].control_state;
    assert.equal(await holat(), "none");
    // O'rnatmasdan bloklab bo'lmaydi.
    assert.equal(
      (await control({ action: "block", reason: "Kechikdi juda" })).status,
      400,
    );
    assert.equal((await control({ action: "install" })).status, 200);
    assert.equal(await holat(), "installed");
    // Bloklashda sabab majburiy.
    assert.equal((await control({ action: "block" })).status, 400);
    assert.equal(
      (await control({ action: "block", reason: "45 kun kechikdi, aloqa yo‘q" }))
        .status,
      200,
    );
    assert.equal(await holat(), "blocked");
    // Faqat ko'ruvchi rolida nazoratga tegib bo'lmaydi.
    assert.equal(
      (
        await control(
          { action: "unblock" },
          await login(viewer + "@example.invalid"),
        )
      ).status,
      403,
    );
    assert.equal((await control({ action: "unblock" })).status, 200);
    assert.equal(await holat(), "installed");
    // Hujjat qolgan: sabab, kechikish va qarz yozilgan.
    const log = (
      await pool.query(
        "SELECT action,reason,debt FROM device_controls WHERE contract_id=$1 ORDER BY created_at",
        [contract],
      )
    ).rows;
    assert.deepEqual(
      log.map((r) => r.action),
      ["install", "block", "unblock"],
    );
    assert.ok(log[1].reason.includes("45 kun"));
    assert.equal(Number(log[1].debt), 5_750_000);
    // Shartnoma sahifasida holat va tarix ko'rinadi.
    const sahifa = await (
      await fetch(origin + "/erp/contracts/" + contract + "?branch=" + b1, {
        headers: { cookie: auth },
      })
    ).text();
    assert.ok(sahifa.includes("Qurilma nazorati"));
    assert.ok(sahifa.includes("45 kun kechikdi"));
    assert.ok(sahifa.includes("Nazoratda"));

    // Inkassatsiya: kassir kiritgan naqd tushum kassa qoldig'iga kirmaydi,
    // lekin dashboardda "undiruvchi qo'lida" bo'lib ko'rinadi.
    const undiruvchi = randomUUID();
    extraUsers.push(undiruvchi);
    await pool.query("INSERT INTO users VALUES($1,$2,$3)", [
      undiruvchi,
      undiruvchi + "@example.invalid",
      (
        await pool.query("SELECT password_hash FROM users WHERE id=$1", [admin])
      ).rows[0].password_hash,
    ]);
    await pool.query(
      "INSERT INTO memberships VALUES($1,$2,$3,'collector')",
      [undiruvchi, tenant, b1],
    );
    const undiruvchiAuth = await login(undiruvchi + "@example.invalid");
    const naqd = await post(
      "payments",
      {
        contractId: contract,
        amount: 500_000,
        method: "cash",
        requestKey: randomUUID(),
      },
      b1,
      undiruvchiAuth,
    );
    assert.equal(naqd.status, 200);
    assert.equal(
      (
        await pool.query("SELECT status FROM payments WHERE id=$1", [
          (await naqd.json()).id,
        ])
      ).rows[0].status,
      "pending",
      "undiruvchi naqd pulni o'zi tasdiqlay olmaydi",
    );
    const dash = await (
      await fetch(origin + "/erp?branch=" + b1 + "&tab=dashboard", {
        headers: { cookie: auth },
      })
    ).text();
    assert.ok(dash.includes("Undiruvchi qo‘lida"));
    // Kassir tasdiqlaganda pul kassaga kiradi.
    assert.equal(
      (
        await fetch(origin + "/api/payments/approve", {
          method: "POST",
          headers: {
            cookie: kassirAuth,
            origin,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            branchId: b1,
            paymentId: (
              await pool.query(
                "SELECT id FROM payments WHERE contract_id=$1 AND status='pending'",
                [contract],
              )
            ).rows[0].id,
            decision: "approve",
          }),
        })
      ).status,
      200,
    );
  },
);

test(
  "HTTP: Kirim kartochkasi to'liq saqlanadi va shartnomada ko'rinadi",
  { skip: !connection },
  async () => {
    const auth = await login(admin + "@example.invalid");
    const kirim = await post(
      "inventory",
      {
        imei: "356789012345678",
        imei2: "356789012345678/1",
        brand: "Iphone",
        model: "17 Pro Max",
        memory: "256",
        simType: "sim+esim",
        color: "silver",
        region: "HX/A",
        condition: "Yangi",
        battery: "100",
        purchaseDate: "2026-10-01",
        costUsd: "850.50",
        costRate: 12_800,
        expectedPrice: 12_000_000,
        supplier: "SYNTHETIC Bahodir aka",
        receivedBy: "Jamoliddin",
        purchaseMethod: "cash_usd",
      },
      b1,
      auth,
    );
    assert.equal(kirim.status, 200);
    const item = (await kirim.json()).id;
    const row = (await pool.query("SELECT * FROM inventory WHERE id=$1", [item]))
      .rows[0];
    // 850.50 USD * 12 800 = 10 886 400 so'm
    assert.equal(Number(row.cost), 10_886_400);
    assert.equal(Number(row.cost_usd_cents), 85_050);
    assert.equal(Number(row.cost_rate), 12_800);
    assert.equal(row.brand, "Iphone");
    assert.equal(row.memory, "256");
    assert.equal(row.sim_type, "sim+esim");
    assert.equal(row.battery, "100");
    assert.equal(row.purchase_method, "cash_usd");
    assert.equal(row.received_by, "Jamoliddin");
    assert.ok(row.supplier_id, "yetkazib beruvchi yaratildi");
    assert.equal(
      (
        await pool.query("SELECT name FROM suppliers WHERE id=$1", [
          row.supplier_id,
        ])
      ).rows[0].name,
      "SYNTHETIC Bahodir aka",
    );
    // Ikkinchi kirim o'sha yetkazib beruvchiga bog'lanadi, dublikat chiqmaydi.
    const ikkinchi = await post(
      "inventory",
      {
        imei: "J4RMVWVXVV",
        brand: "Macbook",
        model: "Air 13",
        cost: 9_000_000,
        supplier: "SYNTHETIC Bahodir aka",
      },
      b1,
      auth,
    );
    assert.equal(ikkinchi.status, 200, "Apple seriya raqami ham qabul qilinadi");
    assert.equal(
      (
        await pool.query(
          "SELECT count(*) n FROM suppliers WHERE tenant_id=$1 AND name=$2",
          [tenant, "SYNTHETIC Bahodir aka"],
        )
      ).rows[0].n,
      "1",
    );
    // Tannarxsiz kirim qabul qilinmaydi.
    assert.equal(
      (await post("inventory", { imei: "356789012345679", model: "x" }, b1, auth))
        .status,
      400,
    );
    // Ombor ekranida tavsif va qidiruv ishlaydi.
    const ombor = await (
      await fetch(origin + "/erp?branch=" + b1 + "&tab=inventory&q=silver", {
        headers: { cookie: auth },
      })
    ).text();
    assert.ok(ombor.includes("Iphone 17 Pro Max 256 silver"));
    assert.ok(ombor.includes("batareyka 100%"));
    assert.ok(ombor.includes("356789012345678/1"));
    // Shartnoma chop etilganda tovar nomi to'liq chiqadi.
    const contract = (
      await (
        await post(
          "contracts",
          {
            inventoryId: item,
            customerName: "SYNTHETIC KIRIM mijoz",
            priceUzs: 12_000_000,
            downPayment: 2_000_000,
            months: 6,
            monthlyRateBp: 500,
            startDate: "2026-10-01",
          },
          b1,
          auth,
        )
      ).json()
    ).id;
    const html = await (
      await fetch(
        origin + "/erp/contracts/" + contract + "/shartnoma?branch=" + b1,
        { headers: { cookie: auth } },
      )
    ).text();
    assert.ok(html.includes("17 Pro Max 256 silver"), "tovar nomi to‘liq");
  },
);

test(
  "HTTP: kirimning pul tomoni va yetkazib beruvchi qarzi",
  { skip: !connection },
  async () => {
    const auth = await login(admin + "@example.invalid");
    const hamyon = async (wallet: string) =>
      Number(
        (
          await pool.query(
            "SELECT COALESCE(sum(amount_minor),0) n FROM cash_entries WHERE branch_id=$1 AND wallet=$2",
            [b1, wallet],
          )
        ).rows[0].n,
      );
    const kirim = (body: Record<string, unknown>) =>
      post("inventory", { model: "SYNTHETIC SUP", ...body }, b1, auth);

    // 1. Naqd USD xarid: dollar hamyonidan chiqadi.
    const usdBefore = await hamyon("cash_usd");
    const naqd = await kirim({
      imei: "611111111111111",
      costUsd: "800.00",
      costRate: 12_500,
      supplier: "SYNTHETIC Olim aka",
      purchaseMethod: "cash_usd",
    });
    assert.equal(naqd.status, 200);
    assert.equal(await hamyon("cash_usd"), usdBefore - 80_000);
    // Naqd xarid qarz yaratmaydi.
    assert.equal(
      Number(
        (await pool.query("SELECT count(*) n FROM supplier_obligations"))
          .rows[0].n,
      ),
      0,
    );

    // 2. Qarzga xarid: kassada harakat yo'q, majburiyat paydo bo'ladi.
    const uzsBefore = await hamyon("cash_uzs");
    const qarzga = await kirim({
      imei: "622222222222222",
      cost: 10_000_000,
      supplier: "SYNTHETIC Olim aka",
      purchaseMethod: "debt",
    });
    assert.equal(qarzga.status, 200);
    assert.equal(await hamyon("cash_uzs"), uzsBefore, "qarzga xarid pul chiqarmaydi");
    const supplierId = (
      await pool.query("SELECT id FROM suppliers WHERE name=$1", [
        "SYNTHETIC Olim aka",
      ])
    ).rows[0].id;
    assert.equal(
      Number(
        (
          await pool.query(
            "SELECT sum(amount) n FROM supplier_obligations WHERE supplier_id=$1",
            [supplierId],
          )
        ).rows[0].n,
      ),
      10_000_000,
    );
    // Yetkazib beruvchisiz qarzga xarid qabul qilinmaydi.
    assert.equal(
      (
        await kirim({
          imei: "633333333333333",
          cost: 1_000_000,
          purchaseMethod: "debt",
        })
      ).status,
      400,
    );

    // 3. Investor tovari: na chiqim, na qarz - lekin kapital daftariga
    // tannarx bo'yicha kirim yoziladi.
    const investorId = (
      await (
        await fetch(origin + "/api/investors", {
          method: "POST",
          headers: { cookie: auth, origin, "content-type": "application/json" },
          body: JSON.stringify({
            branchId: b1,
            action: "investor",
            name: "SYNTHETIC INV TOVAR",
          }),
        })
      ).json()
    ).id as string;
    // Investorni tanlamasa qabul qilinmaydi.
    assert.equal(
      (
        await kirim({
          imei: "644444444444441",
          costUsd: "583.33",
          costRate: 12_000,
          purchaseMethod: "investor",
        })
      ).status,
      400,
    );
    // So'mdagi tannarx ham yetmaydi: kapital dollarda yuritiladi.
    assert.equal(
      (
        await kirim({
          imei: "644444444444442",
          cost: 7_000_000,
          purchaseMethod: "investor",
          investorId,
        })
      ).status,
      400,
    );
    const investor = await kirim({
      imei: "644444444444444",
      costUsd: "583.33",
      costRate: 12_000,
      purchaseDate: "2026-09-20",
      supplier: "SYNTHETIC Olim aka",
      purchaseMethod: "investor",
      investorId,
    });
    assert.equal(investor.status, 200);
    assert.equal(await hamyon("cash_uzs"), uzsBefore);
    const kapital = (
      await pool.query(
        `SELECT e.day::text,e.kind,e.form,e.cents,e.inventory_id
 FROM investor_entries e WHERE e.investor_id=$1`,
        [investorId],
      )
    ).rows;
    assert.equal(kapital.length, 1, "kirim bitta kapital yozuvi yaratadi");
    assert.equal(kapital[0].day, "2026-09-20", "omborga kirgan kun bilan");
    assert.equal(kapital[0].kind, "capital");
    assert.equal(kapital[0].form, "goods");
    assert.equal(Number(kapital[0].cents), 58_333, "tannarx dollarda");
    assert.equal(kapital[0].inventory_id, (await investor.json()).id);

    // 4. Qarz to'lovi: majburiyat kamayadi, kassadan pul chiqadi.
    const pay = (body: Record<string, unknown>) =>
      fetch(origin + "/api/suppliers/pay", {
        method: "POST",
        headers: { cookie: auth, origin, "content-type": "application/json" },
        body: JSON.stringify({
          branchId: b1,
          supplierId,
          wallet: "cash_uzs",
          requestKey: randomUUID(),
          ...body,
        }),
      });
    // Qarzdan ortiq to'lov o'tmaydi.
    assert.equal((await pay({ amount: 11_000_000 })).status, 400);
    const kalit = randomUUID();
    const birinchi = await pay({ amount: 4_000_000, requestKey: kalit });
    assert.equal(birinchi.status, 200);
    assert.equal(await hamyon("cash_uzs"), uzsBefore - 4_000_000);
    // Takroriy so'rov ikkinchi to'lov yaratmaydi.
    assert.equal((await pay({ amount: 4_000_000, requestKey: kalit })).status, 200);
    assert.equal(await hamyon("cash_uzs"), uzsBefore - 4_000_000);
    assert.equal(
      Number(
        (
          await pool.query(
            "SELECT count(*) n FROM supplier_settlements WHERE supplier_id=$1",
            [supplierId],
          )
        ).rows[0].n,
      ),
      1,
    );
    // USD hamyonidan to'lovda kurs saqlanadi.
    const usdPay = await pay({
      wallet: "cash_usd",
      usdAmount: "400.00",
      rate: 12_500,
    });
    assert.equal(usdPay.status, 200);
    assert.equal(await hamyon("cash_usd"), usdBefore - 80_000 - 40_000);
    const settlement = (
      await pool.query(
        "SELECT * FROM supplier_settlements WHERE wallet='cash_usd' AND supplier_id=$1",
        [supplierId],
      )
    ).rows[0];
    assert.equal(Number(settlement.amount), 5_000_000);
    assert.equal(Number(settlement.rate), 12_500);
    // Qarz to'liq yopildi: yangi to'lov qabul qilinmaydi.
    assert.equal((await pay({ amount: 1_000_000 })).status, 400);

    // 5. Ekranda qarz va jamilar ko'rinadi.
    const html = await (
      await fetch(origin + "/erp?branch=" + b1 + "&tab=suppliers", {
        headers: { cookie: auth },
      })
    ).text();
    assert.ok(html.includes("SYNTHETIC Olim aka"));
    assert.ok(html.includes("Jami qarzimiz"));
  },
);

test(
  "HTTP: kun yopish va chiqimlar hisoboti (CASH-04)",
  { skip: !connection },
  async () => {
    const auth = await login(admin + "@example.invalid");
    const kassirAuth = await login(kassir + "@example.invalid");
    const bugun = (
      await pool.query(
        "SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text d",
      )
    ).rows[0].d;
    const yopish = (body: Record<string, unknown>, cookie = auth) =>
      fetch(origin + "/api/cash/close", {
        method: "POST",
        headers: { cookie, origin, "content-type": "application/json" },
        body: JSON.stringify({ branchId: b2, day: bugun, ...body }),
      });
    const sanalgan = {
      cash_uzs: "0",
      cash_usd: "0",
      card_uzs: "0",
      bank_uzs: "0",
    };
    // Boshlang'ich qoldiq belgilanmagan hamyon bilan kun yopilmaydi.
    const bosh = await yopish({ counted: sanalgan });
    assert.equal(bosh.status, 400);
    assert.ok((await bosh.json()).error.includes("boshlang‘ich"));
    // Boshlang'ich qoldiqni admin belgilaydi.
    for (const [wallet, amount] of [
      ["cash_uzs", "1000000"],
      ["cash_usd", "100.00"],
      ["card_uzs", "0"],
      ["bank_uzs", "0"],
    ])
      assert.equal(
        (
          await fetch(origin + "/api/cash", {
            method: "POST",
            headers: { cookie: auth, origin, "content-type": "application/json" },
            body: JSON.stringify({
              branchId: b2,
              requestKey: randomUUID(),
              action: "opening",
              wallet,
              date: bugun,
              amount,
            }),
          })
        ).status,
        200,
        wallet,
      );
    // Xarajat yozamiz: ijara 300 000 so'm.
    assert.equal(
      (
        await fetch(origin + "/api/cash", {
          method: "POST",
          headers: { cookie: auth, origin, "content-type": "application/json" },
          body: JSON.stringify({
            branchId: b2,
            requestKey: randomUUID(),
            action: "entry",
            wallet: "cash_uzs",
            date: bugun,
            amount: "300000",
            direction: "out",
            category: "Ijara",
            note: "SYNTHETIC ijara",
          }),
        })
      ).status,
      200,
    );
    // Kassir kunni yopadi: 700 000 qoldiq kutiladi, 690 000 sanaldi.
    const yopildi = await yopish(
      {
        counted: { ...sanalgan, cash_uzs: "690000", cash_usd: "100.00" },
        note: "SYNTHETIC kun yopish",
      },
      kassirAuth,
    );
    assert.equal(yopildi.status, 200);
    const satr = (
      await pool.query(
        `SELECT l.wallet,l.computed_minor,l.counted_minor FROM cash_closing_lines l
 JOIN cash_closings x ON x.id=l.closing_id WHERE x.branch_id=$1 AND x.day=$2::date
 ORDER BY l.wallet`,
        [b2, bugun],
      )
    ).rows;
    const naqd = satr.find((r) => r.wallet === "cash_uzs");
    assert.equal(Number(naqd.computed_minor), 700_000);
    assert.equal(Number(naqd.counted_minor), 690_000);
    assert.equal(
      Number(satr.find((r) => r.wallet === "cash_usd").computed_minor),
      10_000,
      "USD sentda hisoblanadi",
    );
    // Ikkinchi marta yopib bo'lmaydi.
    assert.equal((await yopish({ counted: sanalgan })).status, 400);
    // Yopilgan kunga yangi yozuv kirmaydi.
    const kech = await fetch(origin + "/api/cash", {
      method: "POST",
      headers: { cookie: auth, origin, "content-type": "application/json" },
      body: JSON.stringify({
        branchId: b2,
        requestKey: randomUUID(),
        action: "entry",
        wallet: "cash_uzs",
        date: bugun,
        amount: "50000",
        direction: "out",
        category: "Transport",
      }),
    });
    assert.equal(kech.status, 400);
    assert.ok((await kech.json()).error.includes("yopilgan"));
    // Kassir qayta ocholmaydi, rahbar ochadi - sabab majburiy.
    assert.equal(
      (await yopish({ action: "reopen", reason: "Sanoqda xato" }, kassirAuth))
        .status,
      403,
    );
    assert.equal((await yopish({ action: "reopen", reason: "xato" })).status, 400);
    assert.equal(
      (await yopish({ action: "reopen", reason: "Sanoqda xato bo‘ldi" })).status,
      200,
    );
    // Qayta ochilgandan keyin yozuv o'tadi.
    assert.equal(
      (
        await fetch(origin + "/api/cash", {
          method: "POST",
          headers: { cookie: auth, origin, "content-type": "application/json" },
          body: JSON.stringify({
            branchId: b2,
            requestKey: randomUUID(),
            action: "entry",
            wallet: "cash_uzs",
            date: bugun,
            amount: "50000",
            direction: "out",
            category: "Transport",
          }),
        })
      ).status,
      200,
    );
    // Chiqimlar hisoboti kategoriya bo'yicha ko'rinadi.
    const html = await (
      await fetch(origin + "/erp?branch=" + b2 + "&tab=cash", {
        headers: { cookie: auth },
      })
    ).text();
    assert.ok(html.includes("Shu oyning chiqimlari"));
    assert.ok(html.includes("Ijara"));
    assert.ok(html.includes("Sanoqda xato bo‘ldi"), "qayta ochish sababi tarixda");
  },
);

test(
  "HTTP: oylik foyda hisoboti (TZ 6.9)",
  { skip: !connection },
  async () => {
    const auth = await login(admin + "@example.invalid");
    const oy = (
      await pool.query(
        "SELECT to_char((now() AT TIME ZONE 'Asia/Tashkent')::date,'YYYY-MM') oy",
      )
    ).rows[0].oy;
    const bugun = (
      await pool.query(
        "SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text d",
      )
    ).rows[0].d;
    // Tannarxi 8 mln qurilma, narxi 10 mln: marja 2 mln.
    const item = (
      await (
        await post(
          "inventory",
          { imei: "711111111111111", model: "SYNTHETIC FOYDA", cost: 8_000_000 },
          b3,
          outsiderCookie,
        )
      ).json()
    ).id;
    // Boshqa tenant (b3) - o'z filialida hisoblansin.
    const contract = (
      await (
        await post(
          "contracts",
          {
            inventoryId: item,
            customerName: "SYNTHETIC FOYDA mijoz",
            priceUzs: 10_000_000,
            downPayment: 2_000_000,
            months: 4,
            monthlyRateBp: 500,
            startDate: bugun,
          },
          b3,
          outsiderCookie,
        )
      ).json()
    ).id;
    // Ustama: 8 mln * 5% * 4 = 1.6 mln. To'lov 2 400 000 dan ustama ulushi:
    // 2 400 000 * 1 600 000 / 9 600 000 = 400 000.
    assert.equal(
      (
        await post(
          "payments",
          {
            contractId: contract,
            amount: 2_400_000,
            method: "cash",
            requestKey: randomUUID(),
          },
          b3,
          outsiderCookie,
        )
      ).status,
      200,
    );
    // Xarajat: 500 000 so'm ijara.
    assert.equal(
      (
        await fetch(origin + "/api/cash", {
          method: "POST",
          headers: {
            cookie: outsiderCookie,
            origin,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            branchId: b3,
            requestKey: randomUUID(),
            action: "entry",
            wallet: "cash_uzs",
            date: bugun,
            amount: "500000",
            direction: "out",
            category: "Ijara",
          }),
        })
      ).status,
      200,
    );
    const html = await (
      await fetch(origin + "/erp?branch=" + b3 + "&tab=profit&oy=" + oy, {
        headers: { cookie: outsiderCookie },
      })
    ).text();
    // Marja 2 mln, nasiya daromadi 400 ming, xarajat 500 ming,
    // sof foyda 1 900 000.
    for (const kutilgan of ["2 000 000", "400 000", "500 000", "1 900 000"])
      assert.ok(
        html.includes(kutilgan),
        "foyda hisobotida topilmadi: " + kutilgan,
      );
    assert.ok(html.includes("Sof foyda"));
    assert.ok(html.includes("boshqaruv hisobi"));

    // Erta yopish allaqachon tan olingan daromadni o'zgartirmaydi.
    // Qarz 7 200 000, o'tgan davr 0 -> 1 200 000 ustama bekor qilinadi,
    // yopish summasi 6 000 000. Mijoz jami 8 400 000 to'laydi: asosiy
    // 8 000 000 + ishlab olingan ustama 400 000. Hisobotdagi nasiya
    // daromadi shuning uchun 400 000 bo'lib qolishi kerak - yopish
    // to'lovi ustamani proporsional tan olgani uchun ortiqcha tan
    // olingan 1 000 000 aynan shuncha tuzatiladi, 1 200 000 emas.
    const yopishB3 = (action: string) =>
      fetch(origin + "/api/closures", {
        method: "POST",
        headers: {
          cookie: outsiderCookie,
          origin,
          "content-type": "application/json",
        },
        body: JSON.stringify({ branchId: b3, contractId: contract, action }),
      });
    const h3 = await (await yopishB3("quote")).json();
    assert.equal(h3.markupCancelled, 1_200_000);
    assert.equal(h3.closeAmount, 6_000_000);
    assert.equal(h3.markupKept, 400_000);
    assert.equal(
      (
        await post(
          "payments",
          {
            contractId: contract,
            amount: 6_000_000,
            method: "cash",
            requestKey: randomUUID(),
          },
          b3,
          outsiderCookie,
        )
      ).status,
      200,
    );
    assert.equal((await yopishB3("complete")).status, 200);
    const keyin = await (
      await fetch(origin + "/erp?branch=" + b3 + "&tab=profit&oy=" + oy, {
        headers: { cookie: outsiderCookie },
      })
    ).text();
    for (const kutilgan of ["2 000 000", "400 000", "500 000", "1 900 000"])
      assert.ok(
        keyin.includes(kutilgan),
        "erta yopishdan keyin foyda o'zgarmasligi kerak: " + kutilgan,
      );
    assert.ok(
      keyin.includes("1 200 000") && keyin.includes("bekor qilingan"),
      "bekor qilingan ustama alohida ko'rsatilsin",
    );

    // Tafsilot: har raqamning ichi ochiladi va yig'indisi hisobotdagi
    // songa teng chiqadi.
    const tafsil = async (kind: string) =>
      (
        await fetch(
          origin +
            "/erp?branch=" +
            b3 +
            "&tab=profit&oy=" +
            oy +
            "&tafsil=" +
            kind,
          { headers: { cookie: outsiderCookie } },
        )
      ).text();
    const marjaIchi = await tafsil("marja");
    assert.ok(marjaIchi.includes("Sotuv marjasi —"));
    assert.ok(marjaIchi.includes("SYNTHETIC FOYDA"), "sotuv qatori ko'rinsin");
    for (const n of ["10 000 000", "8 000 000", "2 000 000"])
      assert.ok(marjaIchi.includes(n), "marja tafsilotida yo'q: " + n);
    // Ustama: to'lovlardan 400 000 + 1 000 000, erta yopish tuzatishi
    // −1 000 000. Yig'indi 400 000 - hisobotdagi son bilan bir xil.
    const ustamaIchi = await tafsil("ustama");
    assert.ok(ustamaIchi.includes("erta yopish"), "yopish tuzatishi ko'rinsin");
    assert.ok(ustamaIchi.includes("400 000"));
    const xarajatIchi = await tafsil("xarajat");
    assert.ok(
      xarajatIchi.includes("Ijara") && xarajatIchi.includes("500 000"),
    );
    // Noto'g'ri tur so'ralsa marja ko'rsatiladi, xato bermaydi.
    assert.ok((await tafsil("yoq")).includes("Sotuv marjasi —"));

    // Noto'g'ri oy so'ralsa hozirgi oy ko'rsatiladi, xato bermaydi.
    const yomon = await fetch(
      origin + "/erp?branch=" + b3 + "&tab=profit&oy=notdate",
      { headers: { cookie: outsiderCookie } },
    );
    assert.equal(yomon.status, 200);
  },
);

test(
  "HTTP: oylik reja — plan, fakt, foiz va kunlik norma",
  { skip: !connection },
  async () => {
    const auth = await login(admin + "@example.invalid");
    const oy = (
      await pool.query(
        "SELECT to_char((now() AT TIME ZONE 'Asia/Tashkent')::date,'YYYY-MM') oy",
      )
    ).rows[0].oy;
    const reja = (body: Record<string, unknown>, cookie = auth) =>
      fetch(origin + "/api/targets", {
        method: "POST",
        headers: { cookie, origin, "content-type": "application/json" },
        body: JSON.stringify({ branchId: b3, month: oy, ...body }),
      });
    // Ko'ruvchi reja belgilay olmaydi.
    assert.equal(
      (
        await reja(
          { values: { sof_foyda: 1 } },
          await login(viewer + "@example.invalid"),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await reja(
          {
            values: {
              sotuv_dona_nasiya: 10,
              sotuv_summa_nasiya: 100_000_000,
              sof_foyda: 5_000_000,
            },
          },
          outsiderCookie,
        )
      ).status,
      200,
    );
    const html = await (
      await fetch(origin + "/erp?branch=" + b3 + "&tab=profit&oy=" + oy, {
        headers: { cookie: outsiderCookie },
      })
    ).text();
    assert.ok(html.includes("Oylik reja"));
    assert.ok(html.includes("Sof foyda"));
    // Oldingi sinovda 1 ta nasiya sotuvi bo'lgan: 10 dan 1 tasi = 10%.
    assert.ok(html.includes("10%"), "bajarilish foizi ko‘rinadi");
    // Nol plan o'chiriladi va foiz hisoblanmaydi.
    assert.equal(
      (await reja({ values: { sotuv_dona_nasiya: 0 } }, outsiderCookie)).status,
      200,
    );
    assert.equal(
      Number(
        (
          await pool.query(
            "SELECT count(*) n FROM monthly_targets WHERE branch_id=$1 AND metric='sotuv_dona_nasiya'",
            [b3],
          )
        ).rows[0].n,
      ),
      0,
    );
  },
);

test(
  "HTTP: sotuvchi va kanal natijalari, ombor va portfel",
  { skip: !connection },
  async () => {
    const oy = (
      await pool.query(
        "SELECT to_char((now() AT TIME ZONE 'Asia/Tashkent')::date,'YYYY-MM') oy",
      )
    ).rows[0].oy;
    const bugun = (
      await pool.query(
        "SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text d",
      )
    ).rows[0].d;
    // b3 filialida: tannarx 4 mln, prognoz 6 mln qurilma.
    const item = (
      await (
        await post(
          "inventory",
          {
            imei: "722222222222222",
            model: "SYNTHETIC KANAL",
            cost: 4_000_000,
            expectedPrice: 6_000_000,
          },
          b3,
          outsiderCookie,
        )
      ).json()
    ).id;
    // Nasiya sotuvi: sotuvchi va kanal bilan.
    assert.equal(
      (
        await post(
          "contracts",
          {
            inventoryId: item,
            customerName: "SYNTHETIC KANAL mijoz",
            priceUzs: 5_000_000,
            downPayment: 1_000_000,
            months: 4,
            monthlyRateBp: 500,
            startDate: bugun,
            seller: "SYNTHETIC Jahongir",
            channel: "Instagram",
          },
          b3,
          outsiderCookie,
        )
      ).status,
      200,
    );
    const row = (
      await pool.query(
        "SELECT seller,channel FROM contracts WHERE inventory_id=$1",
        [item],
      )
    ).rows[0];
    assert.equal(row.seller, "SYNTHETIC Jahongir");
    assert.equal(row.channel, "Instagram");
    const html = await (
      await fetch(origin + "/erp?branch=" + b3 + "&tab=profit&oy=" + oy, {
        headers: { cookie: outsiderCookie },
      })
    ).text();
    assert.ok(html.includes("Sotuvchilar"));
    assert.ok(html.includes("SYNTHETIC Jahongir"));
    assert.ok(html.includes("Sotuv kanallari"));
    assert.ok(html.includes("Instagram"));
    assert.ok(html.includes("Ombordagi tovar"));
    assert.ok(html.includes("Nasiya portfeli"));
    // Sotuvchi ko'rsatilmagan sotuv ham ro'yxatda ko'rinadi.
    assert.ok(html.includes("ko‘rsatilmagan"));
  },
);

test(
  "HTTP: Telegram uchun tayyor matn",
  { skip: !connection },
  async () => {
    const oy = (
      await pool.query(
        "SELECT to_char((now() AT TIME ZONE 'Asia/Tashkent')::date,'YYYY-MM') oy",
      )
    ).rows[0].oy;
    const html = await (
      await fetch(origin + "/erp?branch=" + b3 + "&tab=profit&oy=" + oy, {
        headers: { cookie: outsiderCookie },
      })
    ).text();
    assert.ok(html.includes("Telegram uchun tayyor matn"));
    assert.ok(html.includes("Matnni nusxalash"));
    for (const satr of [
      "Infinity —",
      "Sotuv:",
      "Sof foyda:",
      "Bugungi to&#x27;lovlar:",
      "Nasiya qoldig&#x27;i:",
      "Kechikkan:",
      "Omborda:",
    ])
      assert.ok(html.includes(satr), "matnda yo‘q: " + satr);
    // Reja qo'yilgan bo'lsa bajarilish foizi ham matnga kiradi.
    assert.ok(html.includes("rejasi:"));
  },
);

test(
  "HTTP: qarzga sotish - dollardagi qarz, bir necha hamyon (TZ SALE-02)",
  { skip: !connection },
  async () => {
    const auth = await login(admin + "@example.invalid");
    const kassirAuth = await login(kassir + "@example.invalid");
    const item = (
      await (
        await post(
          "inventory",
          {
            imei: "733333333333333",
            model: "SYNTHETIC QARZ",
            cost: 12_000_000,
          },
          b1,
          auth,
        )
      ).json()
    ).id;
    // Kassirda qarzga sotish huquqi yo'q: ustamasiz qarz berish - pul
    // qarori, uni faqat rahbar va administrator qiladi.
    assert.equal(
      (
        await post(
          "qarz",
          {
            inventoryId: item,
            customerName: "SYNTHETIC QARZ mijoz",
            priceUsd: "1050",
            rate: 12_000,
            dueDate: "2026-12-01",
            tolovlar: [{ method: "cash", amount: 1_000_000 }],
          },
          b1,
          kassirAuth,
        )
      ).status,
      400,
    );
    // Kurs 12 000, narx 1050 $, mijoz 500 $ naqd + 2 000 000 so'm naqd +
    // 400 000 so'm karta to'laydi: qolgani 350 $ = 4 200 000 so'm.
    const sotuv = await post(
      "qarz",
      {
        inventoryId: item,
        customerName: "SYNTHETIC QARZ mijoz",
        phone1: "90-000-00-11",
        priceUsd: "1050",
        rate: 12_000,
        dueDate: "2026-12-01",
        seller: "SYNTHETIC sotuvchi",
        tolovlar: [
          { method: "cash_usd", amount: 50_000 },
          { method: "cash", amount: 2_000_000 },
          { method: "card", amount: 400_000 },
        ],
      },
      b1,
      auth,
    );
    assert.equal(sotuv.status, 200);
    const contract = (await sotuv.json()).id;
    const row = (
      await pool.query("SELECT * FROM contracts WHERE id=$1", [contract])
    ).rows[0];
    assert.equal(row.kind, "qarz");
    assert.equal(Number(row.total), 12_600_000);
    assert.equal(Number(row.down_payment), 8_400_000);
    assert.equal(Number(row.total_cents), 105_000);
    assert.equal(Number(row.down_cents), 70_000);
    assert.equal(Number(row.sale_rate), 12_000);
    assert.equal(Number(row.markup), 0);
    // Har hamyon o'z birligida kassaga tushadi.
    const kassa = (
      await pool.query(
        "SELECT wallet,amount_minor FROM cash_entries WHERE contract_id=$1 ORDER BY wallet",
        [contract],
      )
    ).rows.map((r) => [r.wallet, Number(r.amount_minor)]);
    assert.deepEqual(kassa, [
      ["card_uzs", 400_000],
      ["cash_usd", 50_000],
      ["cash_uzs", 2_000_000],
    ]);
    const qoldiq = async () =>
      Number(
        (
          await pool.query(
            `SELECT c.total_cents-c.down_cents
 -COALESCE((SELECT sum(p.applied_cents) FROM payments p WHERE p.contract_id=c.id
   AND p.status='approved' AND p.voided_at IS NULL),0) sent
 FROM contracts c WHERE c.id=$1`,
            [contract],
          )
        ).rows[0].sent,
      );
    assert.equal(await qoldiq(), 35_000, "qolgan qarz 350 $");

    // So'mda to'lov: kurs bilan dollarga o'tkaziladi.
    const tolov = async (data: Record<string, unknown>) =>
      post(
        "payments",
        { contractId: contract, requestKey: randomUUID(), ...data },
        b1,
        auth,
      );
    assert.equal((await tolov({ amount: 2_000_000, method: "cash" })).status, 400,
      "kurssiz to‘lov qabul qilinmaydi");
    assert.equal(
      (await tolov({ amount: 2_000_000, method: "cash", rate: 12_000 })).status,
      200,
    );
    assert.equal(await qoldiq(), 18_333, "2 mln so‘m 166,67 $ ni yopadi");

    // Kurs ko'tarildi: qolgan 183,33 $ endi ko'proq so'm turadi, lekin
    // dollardagi qarz o'sha-o'sha va aynan nolga tushadi.
    assert.equal(
      (await tolov({ amount: 2_291_625, method: "cash", rate: 12_500 })).status,
      200,
    );
    assert.equal(await qoldiq(), 0, "qarz aynan nolga tushadi");
    const somQoldiq = Number(
      (
        await pool.query(
          "SELECT " +
            "(CASE WHEN c.kind='qarz' THEN round((c.total_cents-c.down_cents" +
            "-COALESCE((SELECT sum(p.applied_cents) FROM payments p WHERE p.contract_id=c.id" +
            " AND p.status='approved' AND p.voided_at IS NULL),0))*c.sale_rate/100.0)::bigint" +
            " ELSE 0 END) q FROM contracts c WHERE c.id=$1",
          [contract],
        )
      ).rows[0].q,
    );
    assert.equal(somQoldiq, 0, "so‘mdagi qoldiq ham nol");

    // Foyda hisobotida qarzga sotish alohida qatorda sanaladi, "nasiya"
    // raqamiga qo'shib yuborilmaydi.
    const oy = (
      await pool.query(
        "SELECT to_char((now() AT TIME ZONE 'Asia/Tashkent')::date,'YYYY-MM') oy",
      )
    ).rows[0].oy;
    const html = await (
      await fetch(origin + "/erp?branch=" + b1 + "&tab=profit&oy=" + oy, {
        headers: { cookie: auth },
      })
    ).text();
    assert.ok(
      html.includes("qarzga 1"),
      "foyda hisobotida qarzga sotish alohida ko‘rinsin",
    );
    assert.ok(html.includes("Qarzga sotish qoldig‘i"));
    // Kurs farqi: 2-to'lov 12 500 kursda tushdi, qarzning so'mdagi
    // kitob qiymati esa 12 000 sotuv kursida. Farq daromadga yoziladi.
    //   1-to'lov: 2 000 000 − 16 667 sent × 120 = −40
    //   2-to'lov: 2 291 625 − 18 333 sent × 120 = +91 665
    assert.ok(
      html.includes("91 625"),
      "kurs farqi foyda hisobotida ko‘rinsin",
    );
    assert.ok(html.includes("Kurs farqi"));
  },
);

test(
  "HTTP: investor kapitali va oylik taqsimot (TZ 6.10)",
  { skip: !connection },
  async () => {
    const auth = await login(admin + "@example.invalid");
    const kassirAuth = await login(kassir + "@example.invalid");
    const inv = (body: Record<string, unknown>, cookie = auth) =>
      fetch(origin + "/api/investors", {
        method: "POST",
        headers: { cookie, origin, "content-type": "application/json" },
        body: JSON.stringify({ branchId: b1, ...body }),
      });
    // Kassirda investor hisobiga yozish huquqi yo'q.
    assert.equal(
      (
        await inv(
          { action: "investor", name: "SYNTHETIC INV rad" },
          kassirAuth,
        )
      ).status,
      403,
    );
    const qosh = async (name: string) =>
      (await (await inv({ action: "investor", name })).json()).id as string;
    const a = await qosh("SYNTHETIC INV A");
    const b = await qosh("SYNTHETIC INV B");
    const kirim = (
      investorId: string,
      day: string,
      amount: string,
      kind = "capital",
      form = "cash",
    ) => inv({ action: "entry", investorId, day, amount, kind, form });
    // A: 1000 $ 1-iyundan. B: 1000 $ 16-iyundan (15 kun ishlaydi).
    assert.equal((await kirim(a, "2026-06-01", "1000")).status, 200);
    assert.equal((await kirim(b, "2026-06-16", "1000")).status, 200);
    // Qoldiqdan ortiq chiqarib bo'lmaydi.
    assert.equal(
      (await kirim(b, "2026-06-20", "5000", "return")).status,
      400,
    );

    // Pul harakati kassaga ham tushadi: ikkinchi marta kiritish kerak
    // emas. Dollarda kirgani naqd USD hamyoniga sentda tushadi.
    const kassaYozuv = (
      await pool.query(
        `SELECT k.wallet,k.amount_minor,k.category,k.entry_date::text
 FROM cash_entries k JOIN investor_entries e ON e.id=k.investor_entry_id
 WHERE e.investor_id=$1`,
        [a],
      )
    ).rows;
    assert.equal(kassaYozuv.length, 1);
    assert.equal(kassaYozuv[0].wallet, "cash_usd");
    assert.equal(Number(kassaYozuv[0].amount_minor), 100_000);
    assert.equal(kassaYozuv[0].category, "Investor kapitali");
    assert.equal(kassaYozuv[0].entry_date, "2026-06-01");
    // Kassaga tushgan yozuv bekor qilinmaydi - teskari yozuv kerak.
    const pulYozuv = (
      await pool.query(
        "SELECT id FROM investor_entries WHERE investor_id=$1 LIMIT 1",
        [a],
      )
    ).rows[0].id;
    assert.equal(
      (
        await inv({
          action: "void",
          entryId: pulYozuv,
          reason: "Kassaga tushgan yozuvni urinib ko‘ramiz",
        })
      ).status,
      400,
    );
    // So'mdagi harakatda kurs majburiy.
    assert.equal(
      (
        await inv({
          action: "entry",
          investorId: b,
          day: "2026-06-18",
          kind: "capital",
          amount: "100",
          wallet: "cash_uzs",
        })
      ).status,
      400,
    );

    // Iyunni kunlik o'rtacha kapital bilan yopamiz: 300 $ taqsimlanadi.
    // A ning kapital-kunlari 30 kun x 1000 $, B ning 15 kun x 1000 $ -
    // nisbat 2:1, demak 200 $ va 100 $.
    assert.equal(
      (
        await inv({
          action: "close",
          month: "2026-06",
          rule: "daily",
          profit: "300",
          rate: 12_000,
        })
      ).status,
      400,
      "sababsiz qo‘lda raqam qabul qilinmaydi",
    );
    assert.equal(
      (
        await inv({
          action: "close",
          month: "2026-06",
          rule: "daily",
          profit: "300",
          rate: 12_000,
          overrideReason: "Iyun hisoboti qo‘lda tekshirildi",
        })
      ).status,
      200,
    );
    // Hisoblashning o'zi ham muzlatiladi: nimadan chiqqani qoladi.
    const muzlatilgan = (
      await pool.query(
        `SELECT rule,profit_cents,rate,share_bp,override_reason
 FROM investor_months WHERE branch_id=$1 AND month='2026-06-01'`,
        [b1],
      )
    ).rows[0];
    assert.equal(muzlatilgan.rule, "daily");
    assert.equal(Number(muzlatilgan.profit_cents), 30_000);
    assert.equal(Number(muzlatilgan.rate), 12_000);
    assert.equal(Number(muzlatilgan.share_bp), 8000);
    assert.ok(muzlatilgan.override_reason.includes("qo‘lda tekshirildi"));
    const ulush = (
      await pool.query(
        `SELECT i.name,s.capital_days,s.cents FROM investor_shares s
 JOIN investors i ON i.id=s.investor_id
 WHERE s.branch_id=$1 AND s.month='2026-06-01' ORDER BY i.name`,
        [b1],
      )
    ).rows.map((r) => [r.name, Number(r.capital_days), Number(r.cents)]);
    assert.deepEqual(ulush, [
      ["SYNTHETIC INV A", 3_000_000, 20_000],
      ["SYNTHETIC INV B", 1_500_000, 10_000],
    ]);
    // Reinvestitsiya: ulush kapitalga qo'shiladi va KEYINGI oydan ishlaydi.
    const hisoblangan = (
      await pool.query(
        `SELECT i.name,e.day::text,e.kind,e.cents FROM investor_entries e
 JOIN investors i ON i.id=e.investor_id
 WHERE e.branch_id=$1 AND e.form='accrual' ORDER BY i.name`,
        [b1],
      )
    ).rows.map((r) => [r.name, r.day, r.kind, Number(r.cents)]);
    assert.deepEqual(hisoblangan, [
      ["SYNTHETIC INV A", "2026-07-01", "profit", 20_000],
      ["SYNTHETIC INV B", "2026-07-01", "profit", 10_000],
    ]);
    // Bir oy ikki marta yopilmaydi.
    assert.equal(
      (
        await inv({
          action: "close",
          month: "2026-06",
          rule: "daily",
          profit: "300",
          rate: 12_000,
          overrideReason: "Takroriy yopishga urinish",
        })
      ).status,
      400,
    );
    // Hisoblangan yozuvni bekor qilib bo'lmaydi - oy muzlatilgan.
    const accrual = (
      await pool.query(
        "SELECT id FROM investor_entries WHERE branch_id=$1 AND form='accrual' LIMIT 1",
        [b1],
      )
    ).rows[0].id;
    assert.equal(
      (
        await inv({
          action: "void",
          entryId: accrual,
          reason: "Shunchaki urinib ko‘ramiz",
        })
      ).status,
      400,
    );
    // Zarar ham xuddi shu formulada: kapitaldan ayriladi.
    assert.equal(
      (
        await inv({
          action: "close",
          month: "2026-05",
          rule: "daily",
          profit: "-60",
          rate: 12_000,
          overrideReason: "Mayda kapital yo‘qligini tekshiramiz",
        })
      ).status,
      400,
      "mayda ishlagan kapital yo‘q edi",
    );
    const html = await (
      await fetch(origin + "/erp?branch=" + b1 + "&tab=investors&oy=2026-06", {
        headers: { cookie: auth },
      })
    ).text();
    assert.ok(html.includes("SYNTHETIC INV A"));
    assert.ok(html.includes("Oy ichida kunlik o‘rtacha"));
    // Ko'rish huquqi yo'q rol bo'limni ochmaydi.
    const yopiq = await (
      await fetch(origin + "/erp?branch=" + b1 + "&tab=investors", {
        headers: { cookie: await login(viewer + "@example.invalid") },
      })
    ).text();
    assert.ok(yopiq.includes("huquqi yo‘q"));
  },
);
