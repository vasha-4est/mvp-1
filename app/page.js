import { AuthStatus } from "@/components/AuthStatus";

export default function HomePage() {
  return (
    <main>
      <h1>MVP-1</h1>
      <AuthStatus />
      <p>Deployment OK</p>
    </main>
  );
}
