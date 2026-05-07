import Link from "next/link";

export default function Home() {
  return (
    <div className="flex items-center justify-center h-full">
      <Link
        href="/character/demo"
        style={{ color: "var(--accent)", textDecoration: "none" }}
        className="hover:underline"
      >
        View demo character
      </Link>
    </div>
  );
}
