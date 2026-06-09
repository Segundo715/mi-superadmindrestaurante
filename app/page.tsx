// Único propósito: redirigir / → /sa-login en el servidor.
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/sa-login");
}
