import { AuthShell } from "@/components/horizon/auth-shell";
import { SignUpForm } from "@/components/horizon/auth/sign-up-form";
import { getServerSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function SignUpPage() {
  const session = await getServerSession();

  if (session) {
    redirect("/");
  }

  return (
    <AuthShell
      eyebrow="Onboarding"
      title="Create your BangkeBank account"
      description="This sign-up flow now stores users, sessions, and onboarding data through Better Auth and PostgreSQL while seeding the initial banking workspace."
    >
      <SignUpForm />
    </AuthShell>
  );
}
