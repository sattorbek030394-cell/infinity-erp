"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
type Member = { id: string; email: string; role: string };
const roles = [
  ["admin", "Administrator"],
  ["manager", "Rahbar"],
  ["cashier", "Kassir"],
  ["seller", "Sotuvchi"],
  ["warehouse", "Omborchi"],
  ["collector", "Undiruvchi"],
  ["accountant", "Hisobchi"],
  ["viewer", "Faqat ko‘rish"],
];
export function SettingsForms({
  branchId,
  name,
  members,
  available,
  actorId,
}: {
  branchId: string;
  name: string;
  members: Member[];
  available: { id: string; email: string }[];
  actorId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    if (
      fields.role === "disabled" &&
      !window.confirm("Bu xodimning tanlangan filialga kirishini o‘chirasizmi?")
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, branchId }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setMessage("Saqlandi");
      if (fields.action === "create") form.reset();
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ulanish xatosi");
    } finally {
      setBusy(false);
    }
  }
  const roleSelect = (
    value = "cashier",
    disabled = false,
    includeDisabled = false,
  ) => (
    <select name="role" defaultValue={value} disabled={disabled} required>
      {roles.map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
      {includeDisabled ? (
        <option value="disabled">Kirish o‘chirilgan</option>
      ) : null}
    </select>
  );
  return (
    <>
      <p role="status">{message}</p>
      <fieldset disabled={busy} className="settingsfield">
        <section className="detailsection">
          <h2>Filial nomi</h2>
          <form className="entry" onSubmit={submit}>
            <input type="hidden" name="action" value="rename" />
            <label>
              Nomi
              <input name="name" defaultValue={name} required maxLength={80} />
            </label>
            <button>Nomni saqlash</button>
          </form>
        </section>
        <section className="detailsection">
          <h2>Xodimlar ruxsatlari</h2>
          <p>
            Administrator — filial va xodimlarni boshqaradi; kassir — ombor,
            nasiya va to‘lovlarni yozadi; faqat ko‘rish — o‘qiydi. Kirish
            o‘chirilgan xodim bu filial ma’lumotlarini ocha olmaydi.
          </p>
          {members.map((m) => (
            <form key={m.id + ":" + m.role} className="entry" onSubmit={submit}>
              <input type="hidden" name="action" value="role" />
              <input type="hidden" name="userId" value={m.id} />
              <label>
                {m.email}
                {roleSelect(m.role, m.id === actorId, true)}
              </label>
              <button disabled={m.id === actorId}>Rolni saqlash</button>
              {m.id === actorId ? (
                <small>Sizning administrator huquqingiz himoyalangan.</small>
              ) : null}
            </form>
          ))}
        </section>
        <section className="detailsection">
          <h2>Yangi xodim</h2>
          <p>
            Yangi hisob faqat shu filialga biriktiriladi. Dastlabki parolni
            xodimga o‘zingiz yetkazing; u bu ekranda qayta ko‘rsatilmaydi.
            Parolni tiklash hali qo‘shilmagan.
          </p>
          <form className="entry" onSubmit={submit}>
            <input type="hidden" name="action" value="create" />
            <label>
              Email
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="off"
              />
            </label>
            <label>
              Dastlabki parol
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={72}
                autoComplete="new-password"
              />
            </label>
            <label>Rol{roleSelect()}</label>
            <button>Hisob yaratish</button>
          </form>
        </section>
        <section className="detailsection">
          <h2>Mavjud xodimni filialga qo‘shish</h2>
          <p>
            Bu ro‘yxatda siz administrator bo‘lgan filiallardagi xodimlar bor.
            Boshqa tashkilot hisobi qo‘shilmaydi; uning paroli o‘zgartirilmaydi.
          </p>
          {available.length ? (
            <form className="entry" onSubmit={submit}>
              <input type="hidden" name="action" value="grant" />
              <label>
                Xodim
                <select name="userId" required>
                  <option value="">Tanlang</option>
                  {available.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email}
                    </option>
                  ))}
                </select>
              </label>
              <label>Rol{roleSelect()}</label>
              <button>Filialga qo‘shish</button>
            </form>
          ) : (
            <p>
              Qo‘shish mumkin bo‘lgan boshqa xodim yo‘q. Kirishi o‘chirilgan
              xodimni yuqoridagi ro‘yxatdan qayta yoqing.
            </p>
          )}
        </section>
      </fieldset>
    </>
  );
}
