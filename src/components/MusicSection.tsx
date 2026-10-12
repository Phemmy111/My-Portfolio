import { Music2, Film } from "lucide-react";
import { MUSIC, DRAMA } from "@/lib/data";

export default function MusicSection() {
  return (
    <section id="music" className="section-pad">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <div className="mb-12">
          <span className="text-zinc-700 dark:text-zinc-400 text-xs font-bold uppercase tracking-widest">
            Creative Side
          </span>
          <h2 className="text-4xl font-black mt-2 text-zinc-950 dark:text-zinc-100">Music & Film</h2>
          <p className="text-zinc-900 dark:text-zinc-300 mt-3 max-w-xl text-base font-medium">
            Beyond code — I produce Yorùbá gospel music and develop Christian drama shorts.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Music */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-white dark:bg-[#080808] border border-zinc-300 dark:border-zinc-800 shadow-2xs">
                <Music2 size={20} className="text-zinc-950 dark:text-white" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-zinc-950 dark:text-white">Music Production</h3>
                <p className="text-sm text-zinc-700 dark:text-zinc-400 font-semibold">
                  Femi Adeleke Production · Impact Production
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {MUSIC.map((song) => (
                <div
                  key={song.title}
                  className="group p-4 rounded-xl border border-zinc-300 dark:border-zinc-800 hover:border-black dark:hover:border-zinc-600 bg-white dark:bg-[#080808] transition-all duration-200 shadow-xs"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-zinc-950 dark:text-white group-hover:text-black dark:group-hover:text-white transition-colors">
                        {song.title}
                      </h4>
                      <p className="text-sm text-zinc-800 dark:text-zinc-400 mt-1 font-normal">{song.description}</p>
                    </div>
                    <span className="shrink-0 text-xs px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-[#141414] text-zinc-900 dark:text-zinc-200 font-bold border border-zinc-300 dark:border-zinc-800">
                      {song.type}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Production notes */}
            <div className="mt-6 p-4 rounded-xl bg-white/70 dark:bg-[#080808] border border-zinc-300 dark:border-zinc-800">
              <p className="text-sm text-zinc-900 dark:text-zinc-300 leading-relaxed font-medium">
                🎸 Guitar & Keyboard · 🎹 FL Studio · 🥁 Àpàlà drums · 🎬 AI video pipeline
                (Google Flow + ChatGPT images + CapCut)
              </p>
            </div>
          </div>

          {/* Drama */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-white dark:bg-[#11131a] border border-zinc-300 dark:border-white/[0.1] shadow-2xs">
                <Film size={20} className="text-zinc-950 dark:text-zinc-100" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-zinc-950 dark:text-zinc-100">Christian Drama Shorts</h3>
                <p className="text-sm text-zinc-700 dark:text-zinc-400 font-semibold">In Development</p>
              </div>
            </div>

            <div className="space-y-3">
              {DRAMA.map((title, i) => (
                <div
                  key={title}
                  className="group flex items-center gap-4 p-4 rounded-xl border border-zinc-300 dark:border-zinc-800 hover:border-black dark:hover:border-zinc-600 bg-white dark:bg-[#080808] transition-all duration-200 shadow-xs"
                >
                  <span className="text-2xl font-black text-zinc-400 dark:text-zinc-600 group-hover:text-black dark:group-hover:text-white transition-colors">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-bold text-zinc-950 dark:text-zinc-200 group-hover:text-black dark:group-hover:text-white transition-colors">
                    {title}
                  </span>
                  <span className="ml-auto text-xs text-zinc-700 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-800 px-2 py-0.5 rounded-full font-bold">
                    In Dev
                  </span>
                </div>
              ))}
            </div>

            {/* AutoLearn Spot promo */}
            <div className="mt-8 p-6 rounded-2xl bg-white dark:bg-[#080808] border border-zinc-300 dark:border-zinc-800 shadow-sm">
              <h4 className="font-black text-lg mb-2 text-zinc-950 dark:text-white">📚 AutoLearn Spot</h4>
              <p className="text-sm text-zinc-800 dark:text-zinc-400 leading-relaxed font-normal">
                My education platform for buying and selling digital skills. 
                AI automation cohorts, creator flows, affiliate program, and the upcoming 
                <strong className="text-black dark:text-white font-black"> AI Agent VA Masterclass</strong>.
              </p>
              <a
                href="#contact"
                className="mt-4 inline-flex items-center gap-1 text-sm text-black dark:text-white font-extrabold hover:underline"
              >
                Learn more →
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
