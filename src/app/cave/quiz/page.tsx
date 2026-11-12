import { redirect } from "next/navigation";

/** Le quiz vins a rejoint le menu Quiz (12/11/2026) */
export default function Page() {
  redirect("/quiz?theme=vins");
}
