import AppTopNav from "@/components/AppTopNav";

export const metadata = {
  title: "MVP-1",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AppTopNav />
        {children}
      </body>
    </html>
  );
}
