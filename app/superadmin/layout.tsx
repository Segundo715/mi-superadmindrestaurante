import "./superadmin.css";

export const metadata = {
  title: "Super Admin — NICHO",
  description: "Panel de control para administradores de plataforma",
};

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
