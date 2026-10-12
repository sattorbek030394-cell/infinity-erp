import { redirect, notFound } from "next/navigation";
import { z } from "zod";
import { currentUser, AccessDeniedError } from "../../../lib/auth";
import { readSettings } from "../../../lib/settings";
import { SettingsForms } from "./settings-forms";
import type { SearchParams } from "../../../lib/filters";
export const dynamic = "force-dynamic";
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!(await currentUser())) redirect("/login");
  const query = await searchParams;
  const branch = typeof query.branch === "string" ? query.branch : "";
  if (!z.uuid().safeParse(branch).success) notFound();
  let data: Awaited<ReturnType<typeof readSettings>>;
  try {
    data = await readSettings(branch);
  } catch (e) {
    if (e instanceof AccessDeniedError) notFound();
    throw e;
  }
  return (
    <>
      <header>
        <strong>∞ Infinity ERP</strong>
        <span>{data.branch.name}</span>
        <form action="/api/logout" method="post">
          <button>Chiqish</button>
        </form>
      </header>
      <main>
        <a href={"/erp?branch=" + branch}>← Dashboardga</a>
        <h1>Filial va xodimlar</h1>
        <p>
          Sozlamalar faqat tanlangan filialga tegishli. Xodimning boshqa
          filiallardagi huquqlari alohida boshqariladi.
        </p>
        <SettingsForms
          branchId={branch}
          name={data.branch.name}
          members={data.members}
          available={data.available}
          actorId={data.actorId}
          minMarginBp={data.minMarginBp}
          sellerBonusBp={data.sellerBonusBp}
        />
      </main>
    </>
  );
}
