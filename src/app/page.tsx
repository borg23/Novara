import { requireUser } from "@/lib/auth";
import Panel from "@/components/panel";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const dateStr = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold">你好，{user.displayName}</h1>
        <p className="text-sm text-stone-500">{dateStr}</p>
      </div>
      <Panel />
    </div>
  );
}
