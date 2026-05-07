import { redirect } from "next/navigation";

/**
 * Home page — redirects to the builds list-detail surface (D25).
 */
export default function Home() {
  redirect("/builds");
}
