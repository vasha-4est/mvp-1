import LoginForm from "./LoginForm";

type LoginPageProps = {
  searchParams?: {
    next?: string;
  };
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  const nextPath = searchParams?.next ?? "/";

  return (
    <main data-testid="login-page" style={{ display: "grid", gap: 12, maxWidth: 420 }}>
      <h1>Login</h1>
      <LoginForm nextPath={nextPath} />
    </main>
  );
}
