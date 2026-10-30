import { Helmet } from "react-helmet-async";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen } from "lucide-react";
import { guides } from "@/data/guides";
import NotFound from "./NotFound";

const SITE = "https://stormcircle.net";

const Guide = () => {
  const { slug } = useParams();
  const guide = guides.find((g) => g.slug === slug);
  if (!guide) return <NotFound />;
  const url = `${SITE}/guides/${guide.slug}`;
  const others = guides.filter((g) => g.slug !== guide.slug);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>{`${guide.title} | StormCircle`}</title>
        <meta name="description" content={guide.description} />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={guide.title} />
        <meta property="og:description" content={guide.description} />
        <meta property="og:url" content={url} />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: guide.title,
            description: guide.description,
            url,
            publisher: { "@type": "Organization", name: "StormCircle", url: SITE },
          })}
        </script>
      </Helmet>
      <article className="max-w-2xl mx-auto px-5 py-10">
        <div className="flex flex-col items-start gap-4 mb-6">
          <Link to="/faq" className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-primary">
            <ArrowLeft className="size-3.5" /> Back to Q&A
          </Link>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-primary/30 bg-primary/10 text-primary rounded-sm">
            <BookOpen className="size-3" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Guide</span>
          </div>
        </div>
        <h1 className="font-mono text-3xl font-bold tracking-tight text-card-foreground mb-3">{guide.title}</h1>
        <p className="text-sm text-muted-foreground leading-relaxed mb-8">{guide.description}</p>
        {guide.sections.map((s) => (
          <section key={s.heading} className="glass-panel p-5 mb-4">
            <h2 className="font-mono text-base font-bold text-primary mb-3">{s.heading}</h2>
            {s.body.map((p) => (
              <p key={p} className="text-sm text-muted-foreground leading-relaxed mb-2 last:mb-0">{p}</p>
            ))}
          </section>
        ))}
        <div className="mt-10 border-t border-border pt-8">
          <Link to="/" className="inline-block px-5 py-2.5 border border-primary/40 bg-primary/10 text-primary font-mono text-sm font-bold rounded-sm hover:bg-primary/20">
            Open StormCircle
          </Link>
          <h2 className="font-mono text-sm font-bold text-card-foreground mt-8 mb-3">More guides</h2>
          <ul className="space-y-2">
            {others.map((g) => (
              <li key={g.slug}>
                <Link to={`/guides/${g.slug}`} className="text-sm text-primary hover:underline">{g.title}</Link>
              </li>
            ))}
            <li><Link to="/faq" className="text-sm text-primary hover:underline">Frequently Asked Questions</Link></li>
          </ul>
        </div>
      </article>
    </div>
  );
};

export default Guide;
