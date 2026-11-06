import { requireUser } from "@/lib/web";
import { NotificationList } from "@/components/notifications";
export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";
export default async function Page() { return <NotificationList user={await requireUser(["student", "parent"])} />; }
