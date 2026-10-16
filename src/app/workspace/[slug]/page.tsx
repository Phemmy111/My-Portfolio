import { redirect } from "next/navigation";

export default async function WorkspaceSlugRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/control-room?biz=${encodeURIComponent(slug)}`);
}
