import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#faf9f5",
        color: "#a33422",
        fontSize: 102,
        fontFamily: "serif",
        fontWeight: 700,
        paddingBottom: 8,
      }}
    >
      r.
    </div>,
    size,
  );
}
