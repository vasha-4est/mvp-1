import { type ReactElement } from "react";

type LoginPageProps = {
  searchParams?: {
    next?: string;
  };
};

export default function LoginPage({ searchParams }: LoginPageProps): ReactElement {
  const nextPath = searchParams?.next ?? "/";

  return (
    <main>
      <h1>Login page (MVP)</h1>
      <p>Continue to: {nextPath}</p>
    </main>
  );
}
