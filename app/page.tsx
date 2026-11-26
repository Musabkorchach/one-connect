import { ConnectApp } from "@/components/connect/connect-app";
import { CallTestApp } from "@/components/connect/call-test-app";

export default function HomePage() {
  if (process.env.NEXT_PUBLIC_CALL_TEST_MODE === "1") return <CallTestApp />;
  return <ConnectApp />;
}
