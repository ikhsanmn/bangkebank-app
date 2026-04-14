import { AuthShell } from "@/components/horizon/auth-shell";
import { SignInForm } from "@/components/horizon/auth/sign-in-form";
import { getServerSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function SignInPage() {
  const session = await getServerSession();

  if (session) {
    redirect("/");
  }

  return (
    <AuthShell
      eyebrow="Secure access"
      title="Welcome back"
      description="Use your email and password to enter the BangkeBank dashboard. Better Auth sessions now run through the backend route handler and PostgreSQL store."
    >
      <SignInForm />
    </AuthShell>
  );
}
