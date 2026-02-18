import AppNav from "@/components/AppNav";

export const metadata = {
  title: "MVP-1",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AppNav />
        {children}
      </body>
    </html>
  );
}
