import { Container } from "@/components/landing/Container";
import { Footer } from "@/components/landing/Footer";
import { SiteMenu } from "@/components/landing/SiteMenu";
import { Wordmark } from "@/components/ui/Wordmark";

// Shell for the public content pages (/faq, /about): the landing header and
// footer around a readable column. Always light, like the landing page.
export function ContentPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div data-theme="light" className="flex flex-1 flex-col bg-background">
      <header>
        <Container className="flex items-center justify-between gap-4 py-6 sm:py-8">
          <Wordmark size={28} href="/" mark />
          <SiteMenu />
        </Container>
      </header>
      <main className="flex-auto">
        <Container>
          <article className="mx-auto max-w-[680px] pb-16">
            <h1 className="font-display text-large-title text-label">{title}</h1>
            <div className="mt-6">{children}</div>
          </article>
        </Container>
      </main>
      <Footer />
    </div>
  );
}
