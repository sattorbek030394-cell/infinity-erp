-- Oylik natija qo'lda emas, foyda hisobotidan olinadi (TZ 6.9 + 6.10).
--
-- Avval "investorlarga tegishli summa" qo'lda yozilardi. Pul hisobida
-- qo'lda kiritilgan raqam eng xavfli joy: bir marta xato yozilsa, oy
-- muzlatilgandan keyin tuzatish ham qiyin. Endi dastur sof foydani
-- hisobotdan oladi, oy kursi bilan dollarga o'tkazadi va ulush foizini
-- qo'llaydi; administrator ustidan o'zgartirishi mumkin, lekin nimadan
-- chiqqani yozib qolinadi.

-- Investorlar ulushi: sof foydaning qancha foizi. 8000 bp = 80%.
ALTER TABLE nasiya_settings ADD COLUMN investor_share_bp int NOT NULL DEFAULT 8000
  CHECK (investor_share_bp BETWEEN 0 AND 10000);

-- Yopilgan oyda hisoblashning o'zi ham muzlatiladi: qaysi sof foydadan,
-- qaysi kurs va qaysi foiz bilan chiqqani. Shu uchta raqam bo'lmasa
-- keyin "bu summa qayerdan keldi" degan savolga javob yo'q.
ALTER TABLE investor_months
  ADD COLUMN net_cents bigint,
  ADD COLUMN share_bp int CHECK (share_bp IS NULL OR share_bp BETWEEN 0 AND 10000),
  -- Administrator hisoblangan summani o'zgartirsa - sababi bilan.
  ADD COLUMN override_reason text
    CHECK (override_reason IS NULL OR length(btrim(override_reason)) BETWEEN 5 AND 160);
