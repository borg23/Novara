import { requireUser } from "@/lib/auth";
import HomeworkView from "@/components/homework-view";

export const dynamic = "force-dynamic";

export default async function HomeworkPage() {
  await requireUser();
  return <HomeworkView />;
}
