import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { PROJECTS } from "@/lib/data";

export default function Projects() {
  const featured = PROJECTS.filter((p) => p.featured);
  const other = PROJECTS.filter((p) => !p.featured);

  return (
    <section id="projects" className="section-pad border-y border-zinc-400/40 dark:border-zinc-800">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <div className="mb-12">
          <span className="text-zinc-700 dark:text-zinc-400 text-xs font-bold uppercase tracking-widest">
            Portfolio
          </span>
          <h2 className="text-4xl font-black mt-2 text-zinc-950 dark:text-white">Projects</h2>
          <p className="text-zinc-900 dark:text-zinc-300 mt-3 max-w-xl text-base font-medium">
            A selection of live products, e-commerce stores, AI apps, and automation workflows I&apos;ve built.
          </p>
        </div>

        {/* Featured projects */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {featured.map((project) => (
            <div
              key={project.title}
              className="group relative p-6 rounded-2xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#080808] hover:border-black dark:hover:border-zinc-600 transition-all duration-300 hover:-translate-y-1 flex flex-col shadow-sm hover:shadow-md"
            >
              {/* Featured badge */}
              <span className="absolute top-4 right-4 text-xs px-2.5 py-0.5 rounded-full bg-zinc-200 dark:bg-[#141414] text-black dark:text-white font-bold border border-zinc-400 dark:border-zinc-800">
                Featured
              </span>

              <div className="flex items-center gap-2.5 mb-2 pr-16">
                {project.title === "AutoLearn Spot" && (
                  <div className="relative w-6 h-6 rounded-full overflow-hidden border border-emerald-500/40 shrink-0">
                    <Image
                      src="/autolearn-spot-logo.png"
                      alt="AutoLearn Spot Logo"
                      fill
                      sizes="24px"
                      className="object-contain"
                    />
                  </div>
                )}
                <h3 className="text-lg font-bold text-zinc-950 dark:text-white group-hover:text-black dark:group-hover:text-white transition-colors">
                  {project.title}
                </h3>
              </div>
              <p className="text-sm text-zinc-800 dark:text-zinc-400 leading-relaxed flex-1 font-normal">
                {project.description}
              </p>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 mt-5">
                {project.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-[#121212] text-zinc-900 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-800 font-semibold"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Link */}
              {project.link !== "#" && (
                <a
                  href={project.link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex items-center gap-1.5 text-sm text-black dark:text-white hover:underline font-extrabold"
                >
                  View Project <ExternalLink size={14} />
                </a>
              )}
            </div>
          ))}
        </div>

        {/* Other projects */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {other.map((project) => (
            <div
              key={project.title}
              className="p-5 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#080808] hover:border-black dark:hover:border-zinc-600 transition-all duration-200 group shadow-2xs"
            >
              <h3 className="font-bold mb-1.5 text-zinc-950 dark:text-zinc-100 group-hover:text-black dark:group-hover:text-white transition-colors">
                {project.title}
              </h3>
              <p className="text-sm text-zinc-800 dark:text-zinc-400 leading-relaxed font-normal">
                {project.description}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-4">
                {project.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-white/[0.04] text-zinc-800 dark:text-zinc-400 font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
