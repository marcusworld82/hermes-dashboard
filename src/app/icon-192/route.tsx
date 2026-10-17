import { ImageResponse } from "next/og";

export async function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1a1d24", color: "white", fontSize: 105, fontWeight: 600, fontFamily: "sans-serif" }}>H</div>
    ),
    { width: 192, height: 192 },
  );
}
