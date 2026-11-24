import { requireUser } from "@/lib/auth";
import GpaView from "@/components/gpa-view";

export const dynamic = "force-dynamic";

export default async function GpaPage() {
  await requireUser();
  return <GpaView />;
}
