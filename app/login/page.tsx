export default function Login() {
  return (
    <main className="login">
      <h1>Infinity ERP</h1>
      <p>Filialingiz hisobiga xavfsiz kirish</p>
      <form action="/api/login" method="post">
        <label>
          Email
          <input name="email" type="email" required autoComplete="username" />
        </label>
        <label>
          Parol
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        <button>Kirish</button>
      </form>
      <p>
        Demo hisob: demo@example.invalid. Parolni tizimni sozlagan kishi beradi.
      </p>
    </main>
  );
}
