import Link from "next/link";
import { ForgotForm } from "./ForgotForm";

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">Reset your password</h1>
      <ForgotForm />
      <p className="mt-4 text-sm"><Link className="text-brand-600 hover:underline" href="/login">Back to sign in</Link></p>
    </>
  );
}
