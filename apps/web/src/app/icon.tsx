import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
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
        fontSize: 290,
        fontFamily: "serif",
        fontWeight: 700,
        paddingBottom: 24,
      }}
    >
      r.
    </div>,
    size,
  );
}
