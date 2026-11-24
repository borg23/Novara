import { requireUser } from "@/lib/auth";
import CoursesView from "@/components/courses-view";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  await requireUser();
  return <CoursesView />;
}
