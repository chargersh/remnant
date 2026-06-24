import { buttonVariants } from "@remnant/ui/components/button";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-full items-center justify-center px-4 py-16">
      <section className="mx-auto flex max-w-xl flex-col items-center text-center">
        <h1 className="text-balance font-semibold text-3xl tracking-normal sm:text-4xl">
          The homepage is coming soon.
        </h1>
        <Link
          className={buttonVariants({ className: "mt-8", size: "lg" })}
          href="/dashboard"
        >
          Go to dashboard
        </Link>
      </section>
    </main>
  );
}
