import { requireUser } from "@/lib/auth";
import FocusView from "@/components/focus-view";

export const dynamic = "force-dynamic";

export default async function FocusPage() {
  await requireUser();
  return <FocusView />;
}
