import { SKILLS_LIST } from "@/lib/data";

export default function About() {
  return (
    <section id="about" className="section-pad border-y border-zinc-400/40 dark:border-zinc-800">
      <div className="max-w-6xl mx-auto px-6">
        {/* Section header */}
        <div className="mb-12">
          <span className="text-zinc-700 dark:text-zinc-400 text-xs font-bold uppercase tracking-widest">
            About Me
          </span>
          <h2 className="text-4xl font-black mt-2 text-zinc-950 dark:text-white">
            The Story So Far
          </h2>
        </div>

        <div className="grid lg:grid-cols-2 gap-16 items-start">
          {/* Left — Story */}
          <div className="space-y-5 text-zinc-900 dark:text-zinc-300 leading-relaxed text-base font-normal">
            <p>
              I&apos;m <strong className="text-black dark:text-white font-extrabold">Femi Adeleke</strong> — a freelance developer, 
              automation engineer, and educator based in{" "}
              <strong className="text-black dark:text-white font-extrabold">Ibadan, Nigeria</strong>. I hold a B.Ed/B.A. in 
              Communication and Language Arts from the University of Ibadan.
            </p>
            <p>
              I founded <strong className="text-black dark:text-white font-extrabold">AutoLearn Spot</strong> to empower creators, professionals, 
              and students with hands-on AI automation, digital skill cohorts, and scalable workflows. 
              Whether it&apos;s building full-stack web applications, wiring up n8n pipelines, or developing AI-powered bots — I bring an energetic, 
              iterative approach to every project.
            </p>
            <p>
              Beyond code, I produce <strong className="text-black dark:text-white font-extrabold">Yorùbá gospel music</strong> under 
              &quot;Femi Adeleke Production&quot; and &quot;Impact Production&quot;, write Christian drama 
              shorts, and design educational architectures for the next generation of builders.
            </p>
            <p>
              I write casually, think deeply, and build boldly. If you need someone who can 
              handle the full stack — technology, automation, and strategy — you&apos;re in the right place.
            </p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 pt-4">
              {[
                { number: "10+", label: "Projects Built" },
                { number: "3+", label: "Years Experience" },
                { number: "100+", label: "Students Taught" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="text-center p-4 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#080808] shadow-xs"
                >
                  <p className="text-2xl font-black text-black dark:text-white">{stat.number}</p>
                  <p className="text-xs text-zinc-700 dark:text-zinc-400 mt-1 font-bold">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Skills */}
          <div>
            <h3 className="text-lg font-bold mb-6 text-zinc-950 dark:text-white">Tech Stack & Skills</h3>
            <div className="flex flex-wrap gap-2">
              {SKILLS_LIST.map((skill) => (
                <span
                  key={skill}
                  className="px-3.5 py-1.5 rounded-lg text-sm font-bold border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#080808] text-zinc-950 dark:text-zinc-200 hover:border-black dark:hover:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-[#141414] transition-all duration-200 cursor-default shadow-xs"
                >
                  {skill}
                </span>
              ))}
            </div>

            {/* Fun facts */}
            <div className="mt-10 space-y-3">
              <h3 className="text-lg font-bold text-zinc-950 dark:text-zinc-100">Fun Facts</h3>
              {[
                "🎸 I play guitar and keyboard",
                "🎵 I produce Yorùbá gospel in FL Studio",
                "📚 Writing two romance novels simultaneously",
                "🤖 n8n is my favourite automation toy",
                "🎬 Running a comedy skit series for marketing",
              ].map((fact) => (
                <p key={fact} className="text-sm text-zinc-900 dark:text-zinc-300 font-medium flex items-start gap-2">
                  <span>{fact}</span>
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
