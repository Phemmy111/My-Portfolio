import { SERVICES } from "@/lib/data";

export default function Services() {
  return (
    <section id="services" className="section-pad">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <div className="mb-14 text-center">
          <span className="text-zinc-700 dark:text-zinc-400 text-xs font-bold uppercase tracking-widest">
            What I Do
          </span>
          <h2 className="text-4xl font-black mt-2 text-zinc-950 dark:text-zinc-100">Services</h2>
          <p className="text-zinc-900 dark:text-zinc-300 mt-3 max-w-xl mx-auto text-base font-medium">
            From web development to AI automation — I deliver end-to-end solutions that actually work.
          </p>
        </div>

        {/* Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {SERVICES.map((service) => (
            <div
              key={service.title}
              className="group p-6 rounded-2xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#080808] hover:border-black dark:hover:border-zinc-600 hover:-translate-y-1 transition-all duration-300 shadow-sm hover:shadow-md"
            >
              <div className="text-4xl mb-4">{service.icon}</div>
              <h3 className="text-lg font-bold mb-2 text-zinc-950 dark:text-white group-hover:text-black dark:group-hover:text-white transition-colors">
                {service.title}
              </h3>
              <p className="text-sm text-zinc-800 dark:text-zinc-400 leading-relaxed font-normal">
                {service.description}
              </p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-14 text-center">
          <a
            href="#contact"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all duration-200 hover:scale-105 shadow-md dark:shadow-white/10"
          >
            Let&apos;s Work Together →
          </a>
        </div>
      </div>
    </section>
  );
}
