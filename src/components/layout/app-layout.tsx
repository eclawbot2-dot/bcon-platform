import { Sidebar } from "./sidebar";
import { Header } from "./header";

type AppLayoutProps = {
  children: React.ReactNode;
  title: string;
  eyebrow?: string;
  description?: string;
};

export async function AppLayout({ children, title, eyebrow, description }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-transparent text-white lg:grid lg:grid-cols-[18rem_1fr]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-cyan-500 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-950"
      >
        Skip to main content
      </a>
      <Sidebar />
      <div className="min-w-0">
        <Header title={title} eyebrow={eyebrow} description={description} />
        <main id="main-content" tabIndex={-1} className="px-4 py-6 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
