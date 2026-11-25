import CoursesView from "@/components/courses-view";
import HomeworkView from "@/components/homework-view";
import Nav from "@/components/nav";
import Panel from "@/components/panel";
import { IdentityProvider, currentPath } from "@/components/identity";
import { ThemeProvider } from "@/components/theme-provider";

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="card p-8 text-center">
      <h1 className="mb-2 text-xl font-bold">{title}</h1>
      <p className="text-sm text-stone-500">该模块即将上线，当前站点版本尚未开放。</p>
    </div>
  );
}

function CurrentPage() {
  switch (currentPath()) {
    case "/homework":
      return <HomeworkView />;
    case "/courses":
      return <CoursesView />;
    case "/gpa":
      return <ComingSoon title="GPA 计算器" />;
    case "/focus":
      return <ComingSoon title="专注计时" />;
    default:
      return <Panel />;
  }
}

export default function App() {
  const loginHref = `/__qoder_auth/start?return_path=${encodeURIComponent(currentPath())}`;
  return (
    <IdentityProvider
      loginHref={loginHref}
      requireLogin={false}
      features={{ gpa: false, focus: false, batchImport: false, weather: false, passwordAuth: false }}
    >
      <ThemeProvider>
        <Nav />
        <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">
          <CurrentPage />
        </main>
      </ThemeProvider>
    </IdentityProvider>
  );
}
