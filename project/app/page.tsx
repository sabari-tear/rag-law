import { Chat } from "@/components/Chat";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="mt-4 space-y-3 text-center sm:mt-8 sm:space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/5 px-3 py-1 text-[11px] font-medium text-emerald-200 shadow-sm shadow-emerald-500/30">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          RAG-powered assistant for Indian criminal law
        </div>
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl lg:text-5xl">
          SythaAI – Indian Legal Chatbot
        </h1>
        <p className="mx-auto max-w-2xl text-balance text-sm text-slate-300 sm:text-base">
          Ask natural-language questions about offences, procedure, and evidence. SythaAI looks up
          relevant sections from IPC, BNS, BSA, and CrPC and explains them in clear language.
        </p>
      </header>

      <section className="mt-2 flex-1">
        <Chat />
      </section>

      <footer className="mt-6 border-t border-slate-800/70 pt-4 text-center text-[11px] text-slate-500">
        Built with OpenAI and a curated dataset of Indian laws. Always verify important answers
        against the bare acts and consult a qualified lawyer when in doubt.
      </footer>
    </main>
  );
}
