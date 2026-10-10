import "./style.css";
export const metadata = {
  title: "Infinity ERP",
  description: "Filiallar uchun ombor va nasiya hisobi",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz">
      <body>{children}</body>
    </html>
  );
}
